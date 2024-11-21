# %%

call_graph_file = "charter/data/call_graph.json"

# %%
from dataclasses import dataclass
from gettext import find
from typing import Dict, List

from pydantic import BaseModel


class DocRange(BaseModel):
    startLine: int
    startCharacter: int
    endLine: int
    endCharacter: int


class ReferenceNode(BaseModel):
    range: DocRange
    symbol: str


class DefinitionNode(BaseModel):
    enclosingRange: DocRange
    document: str
    symbol: str
    children: List[ReferenceNode]


class CallGraph(BaseModel):
    topLevelNodes: List[str]
    definitionNodes: Dict[str, DefinitionNode]


import json

with open(call_graph_file) as f:
    call_graph = CallGraph.model_validate(json.load(f))

# %%
from typing import Dict, Optional


class TreeAndContextSummaries(BaseModel):
    functionSummaries: Dict[str, str]
    refinedFunctionSummaries: Dict[str, str]
    contextSummary: Optional[str]


# with open(small_graph_summaries_file) as f:
#     small_summaries = TreeAndContextSummaries.model_validate(json.load(f))

# with open(big_graph_summaries_file) as f:
#     big_summaries = TreeAndContextSummaries.model_validate(json.load(f))

# %%
from typing import Sequence

from ollama import Client

from openai import Client as OpenAIClient

client = Client(host="http://host.docker.internal:11434")

from dotenv import load_dotenv

load_dotenv()

open_ai_client = OpenAIClient()


def embed_summary(summary: str) -> Sequence[float]:
    response = client.embeddings(prompt=summary, model="mxbai-embed-large")
    return response["embedding"]


def embed_summaries(summaries: Dict[str, str]) -> Dict[str, Sequence[float]]:
    # return {name: embed_summary(summary) for name, summary in summaries.items()}
    response = open_ai_client.embeddings.create(
        input=list(summaries.values()), model="text-embedding-ada-002"
    )
    return {
        name: embedding.embedding
        for name, embedding in zip(summaries.keys(), response.data)
    }


# small_embeddings = embed_summaries(small_summaries.refinedFunctionSummaries)
# big_embeddings = embed_summaries(big_summaries.refinedFunctionSummaries)

# %%
import numpy as np


def cosine_similarity(vec1, vec2):
    """
    Calculate the cosine similarity between two vectors.

    Parameters:
    vec1 (array-like): First vector.
    vec2 (array-like): Second vector.

    Returns:
    float: Cosine similarity between vec1 and vec2.
    """
    # Convert the input vectors to numpy arrays
    vec1 = np.array(vec1)
    vec2 = np.array(vec2)

    # Compute the dot product of the vectors
    dot_product = np.dot(vec1, vec2)

    # Compute the L2 norms (magnitudes) of the vectors
    norm_vec1 = np.linalg.norm(vec1)
    norm_vec2 = np.linalg.norm(vec2)

    # Compute the cosine similarity
    cosine_sim = dot_product / (norm_vec1 * norm_vec2)

    return cosine_sim


# compare all summary embeddings to each other
def compare_embeddings(
    embeddings: Dict[str, Sequence[float]]
) -> Dict[str, Dict[str, float]]:
    return {
        name1: {
            name2: cosine_similarity(embeddings[name1], embeddings[name2])
            for name2 in embeddings
        }
        for name1 in embeddings
    }


# small_comparisons = compare_embeddings(small_embeddings)
# big_comparisons = compare_embeddings(big_embeddings)

# %%
# comparisons = big_comparisons

# %%
# Step 1: Prepare data structures
from typing import Tuple


def prepare_data(
    comparisons: Dict[str, Dict[str, float]]
) -> Tuple[Dict[str, int], Dict[int, str], int]:
    function_names = list(comparisons.keys())
    func_to_index = {func_name: idx for idx, func_name in enumerate(function_names)}
    index_to_func = {idx: func_name for func_name, idx in func_to_index.items()}
    n = len(function_names)
    return func_to_index, index_to_func, n


# Step 2: Create similarity matrix
def create_similarity_matrix(
    comparisons: Dict[str, Dict[str, float]], func_to_index: Dict[str, int], n: int
) -> np.ndarray:
    similarity_matrix = np.zeros((n, n))
    for func_i, neighbors in comparisons.items():
        i = func_to_index[func_i]
        for func_j, similarity in neighbors.items():
            j = func_to_index.get(func_j)
            if j is not None and i != j:
                similarity_matrix[i, j] = similarity
                similarity_matrix[j, i] = similarity  # Ensure symmetry
    return similarity_matrix


# %%
## Create adjacency matrix
from sklearn.preprocessing import normalize


def create_adjacency_matrix(
    call_graph: CallGraph,
    func_to_index: Dict[str, int],
    similarity_matrix: np.ndarray,
    n: int,
) -> np.ndarray:
    # TODO: split into two functions
    adjacency_data = {
        func: [ref.symbol for ref in call_graph.definitionNodes[func].children]
        for func in func_to_index.keys()
    }

    adjacency_matrix = np.zeros((n, n))
    for func_i, neighbors in adjacency_data.items():
        i = func_to_index[func_i]
        for func_j in neighbors:
            j = func_to_index.get(func_j)
            if j is not None and i != j:
                adjacency_matrix[i, j] = 1
                adjacency_matrix[j, i] = 1

    ## Combine matrices
    similarity_matrix_normalized = normalize(similarity_matrix, norm="l1")
    # assert (similarity_matrix_normalized == similarity_matrix_normalized.T).all()
    adjacency_matrix_normalized = normalize(adjacency_matrix, norm="l1")
    # assert (adjacency_matrix_normalized == adjacency_matrix_normalized.T).all()
    adjacency_weighting = 0.5
    similarity_weighting = 0.5

    combined_matrix = (
        adjacency_weighting * adjacency_matrix_normalized
        + similarity_weighting * similarity_matrix_normalized
    )
    return combined_matrix


# %%
from sklearn.cluster import AgglomerativeClustering, SpectralClustering
from sklearn.metrics import (
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)


def choose_number_of_clusters(similarity_matrix: np.ndarray) -> int:
    max_clusters = similarity_matrix.shape[0] // 3
    scores = []
    similarity_matrix_copy = 1 - similarity_matrix.copy()
    np.fill_diagonal(similarity_matrix_copy, 0)
    last_score = -1
    num_decreasing_scores = 0
    for n_clusters in range(2, max_clusters + 1):
        spectral_model = SpectralClustering(
            n_clusters=n_clusters,
            affinity="precomputed",
            assign_labels="kmeans",
            random_state=42,
        )
        cluster_labels = spectral_model.fit_predict(similarity_matrix_copy)
        # score = silhouette_score(
        #     similarity_matrix_copy, cluster_labels, metric="precomputed"
        # )
        # score = davies_bouldin_score(similarity_matrix, cluster_labels)
        score = calinski_harabasz_score(similarity_matrix, cluster_labels)
        scores.append(score * n_clusters)
        if score < last_score:
            num_decreasing_scores += 1
            if num_decreasing_scores > 5:
                break
        else:
            num_decreasing_scores = 0
        last_score = score
    print(scores)
    return scores.index(max(scores)) + 2


def spectral_cluster(similarity_matrix: np.ndarray, num_clusters: int) -> np.ndarray:
    spectral_model = SpectralClustering(
        n_clusters=num_clusters,
        affinity="precomputed",
        assign_labels="kmeans",
        random_state=42,
    )
    cluster_labels = spectral_model.fit_predict(similarity_matrix)
    return cluster_labels


def agglomerative_clustering(similarity_matrix: np.ndarray, n_clusters: int):
    model = AgglomerativeClustering(
        n_clusters=n_clusters, linkage="average"  # complete
    )
    labels = model.fit_predict(similarity_matrix)
    return labels


def cluster(
    index_to_func: Dict[int, str], similarity_matrix: np.ndarray
) -> Dict[int, List[str]]:
    num_clusters = choose_number_of_clusters(similarity_matrix)
    cluster_labels = spectral_cluster(similarity_matrix, num_clusters)

    # cluster_labels = agglomerative_clustering(similarity_matrix, n_clusters)

    # Map labels back to function names
    clusters = {}
    for idx, label in enumerate(cluster_labels):
        func_name = index_to_func[idx]
        clusters.setdefault(label, []).append(func_name)
    return clusters


# %%
# Calculate the centroid of each cluster
def calculate_centroid(
    cluster: List[str], embeddings: Dict[str, Sequence[float]]
) -> np.ndarray:
    cluster_vectors = np.array([embeddings[func] for func in cluster])
    centroid = np.mean(cluster_vectors, axis=0)
    return centroid


# Order cluster members by cosine distance to the centroid
def order_by_distance_to_centroid(
    cluster: List[str], centroid: np.ndarray, embeddings: Dict[str, Sequence[float]]
) -> List[str]:
    distances = {
        func: cosine_similarity(centroid, embeddings[func]) for func in cluster
    }
    return sorted(cluster, key=lambda func: distances[func], reverse=True)


def order_clusters_by_distance_to_centroid(
    clusters: Dict[int, List[str]], big_embeddings: Dict[str, Sequence[float]]
) -> Dict[int, List[str]]:
    ordered_clusters = {}
    for label, cluster in clusters.items():
        centroid = calculate_centroid(cluster, big_embeddings)
        ordered_clusters[label] = order_by_distance_to_centroid(
            cluster, centroid, big_embeddings
        )
    return ordered_clusters


# %%
import hashlib
import threading

from flask import Flask, jsonify, request

# Create a Flask app
app = Flask(__name__)


def hash_summaries(summaries: Dict[str, str]) -> str:
    # md5 hash of the summaries
    return hashlib.md5(json.dumps(summaries).encode()).hexdigest()[0:8]


def file_exists(file_path: str) -> bool:
    try:
        with open(file_path) as f:
            return True
    except FileNotFoundError:
        return False

@dataclass
class RefinedSummariesAndFilteredOutNodes:
    refinedFunctionSummaries: Dict[str, str]
    filteredOutNodes: List[str]

@app.route("/cluster", methods=["POST"])
def post_cluster():
    # Get the JSON payload from the request
    response = request.get_json()
    summaries = RefinedSummariesAndFilteredOutNodes(**response)
    summaries_to_include = {
        name: summary
        for name, summary in summaries.refinedFunctionSummaries.items()
        if name not in summaries.filteredOutNodes
    }
    summaries_hash = hash_summaries(summaries_to_include)
    print("request", len(summaries_to_include), summaries_hash)
    summaries_path = f"charter/data/clusters/{summaries_hash}.json"
    if file_exists(summaries_path):
        with open(summaries_path) as f:
            clusters = json.load(f)
        return jsonify(clusters)

    embeddings_path = f"charter/data/embeddings/{summaries_hash}.json"
    if file_exists(embeddings_path):
        with open(embeddings_path) as f:
            embeddings = json.load(f)
    else:
        embeddings = embed_summaries(summaries_to_include)
        with open(embeddings_path, "w") as f:
            json.dump(embeddings, f, indent=2)

    comparisons = compare_embeddings(embeddings)
    func_to_index, index_to_func, n = prepare_data(comparisons)
    similarity_matrix = create_similarity_matrix(comparisons, func_to_index, n)
    combined_matrix = create_adjacency_matrix(
        call_graph, func_to_index, similarity_matrix, n
    )
    clusters = cluster(index_to_func, combined_matrix)
    ordered_clusters = order_clusters_by_distance_to_centroid(clusters, embeddings)

    cluster_symbols = [c for c in ordered_clusters.values()]
    # with open(summaries_path, "w") as f:
    #     json.dump(cluster_symbols, f, indent=2)

    return jsonify(cluster_symbols)


# Function to run the Flask app
def run_flask():
    app.run(port=5000)


# Run the Flask app in a separate thread
thread = threading.Thread(target=run_flask)
thread.start()

# %%
# write clusters to file

# {type(k) for k in clusters.keys()}

# %%
# Step 5: Visualize (optional)
# tsne = TSNE(
#     n_components=2,
#     metric='precomputed',
#     init='random',        # Set initialization to 'random'
#     random_state=42,
#     perplexity=20
# )
# embeddings = tsne.fit_transform(similarity_matrix)

# plt.figure(figsize=(10, 8))
# scatter = plt.scatter(embeddings[:, 0], embeddings[:, 1], c=cluster_labels, cmap='viridis')
# plt.title('Spectral Clustering of Functions')
# plt.xlabel('Dimension 1')
# plt.ylabel('Dimension 2')
# plt.colorbar(scatter, label='Cluster Label')
# plt.show()

# %%
