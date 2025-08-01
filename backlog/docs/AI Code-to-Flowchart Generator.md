# **Software Design Document: AI Code-to-Flowchart Generator**

Version: 1.0  
Date: August 1, 2025  
Status: Draft  
Author: Gemini

## **1\. Introduction**

### **1.1. Purpose**

This document provides a comprehensive software design for an AI-powered system capable of generating interactive, on-demand Mermaid.js flowcharts from a given source codebase. This system is intended to be delivered as an IDE extension to augment developer workflows, reduce cognitive load, and accelerate code comprehension.  
This document builds upon the principles and pipeline detailed in the initial blueprint, "A First-Principles Blueprint for AI-Powered Code-to-Flowchart Generation." It will serve as the primary technical guide for the development team, detailing architecture, component design, APIs, data models, and implementation strategy.

### **1.2. Scope**

The scope of this project is to design, develop, and deploy a system that can:

* **Analyze a user-selected function** within a supported language (e.g., Python, JavaScript/TypeScript).  
* **Statically analyze** the code to build a localized call graph.  
* **Utilize Large Language Models (LLMs)** to interpret the semantics of the code and its control flow.  
* **Generate a syntactically valid Mermaid.js flowchart** representing the function's logic.  
* **Render the flowchart** within the IDE, with nodes linked back to the source code.  
* **Provide a robust backend service** to handle intensive computation and a lightweight IDE extension for the user interface.

Out of scope for Version 1.0 are:

* Generation of other diagram types (e.g., sequence, class diagrams).  
* Full round-trip engineering (diagram-to-code).  
* Agent-based conversational interaction for diagram refinement.

### **1.3. Definitions, Acronyms, and Abbreviations**

* **SDD:** Software Design Document  
* **IDE:** Integrated Development Environment  
* **LLM:** Large Language Model  
* **AST:** Abstract Syntax Tree  
* **CFG:** Control Flow Graph  
* **API:** Application Programming Interface  
* **JSON:** JavaScript Object Notation  
* **REST:** Representational State Transfer

## **2\. System Architecture**

### **2.1. Architectural Model**

The system will be implemented using a **Hybrid (Client-Server) Architecture**. This model is chosen to balance performance, scalability, and user experience. It consists of two primary components: a lightweight **IDE Extension (Client)** and a powerful **Backend Service (Server)**.

* **IDE Extension (Client):** Resides within the user's IDE (e.g., VS Code). Its responsibilities are limited to UI management, user input handling, local file access, and communication with the backend. This ensures the IDE remains responsive and minimizes the computational load on the user's machine.  
* **Backend Service (Server):** A cloud-hosted service that performs all computationally expensive tasks. This includes static analysis, LLM interactions, caching, and diagram generation logic. This centralized approach allows for the use of powerful LLMs, facilitates model updates, and ensures consistent results across all users.

*Figure 2.1: High-Level System Architecture*

### **2.2. Technology Stack**

* **IDE Extension:**  
  * Framework: VS Code Extension API (using TypeScript/JavaScript)  
  * UI: Webview with HTML, CSS, and JavaScript  
  * Diagram Rendering: Mermaid.js library  
* **Backend Service:**  
  * Language: Python 3.11+  
  * Framework: FastAPI (for high-performance REST APIs)  
  * Static Analysis: tree-sitter for robust AST generation.  
  * LLM Interaction: openai, anthropic client libraries.  
  * Caching: Redis  
  * Deployment: Docker container hosted on a cloud platform (e.g., AWS, GCP, Azure).

## **3\. The Five-Stage Processing Pipeline**

The core logic of the backend is encapsulated in a five-stage pipeline, as defined in the blueprint. This section formalizes the inputs and outputs for each stage.  
*Figure 3.1: The Five-Stage Pipeline*

### **3.1. Stage 1: Graph Traversal & Node Identification**

* **Trigger:** API call from the IDE extension with the source code of the file and the line number of the target function.  
* **Process:**  
  1. The backend service receives the request.  
  2. A static analyzer (tree-sitter) parses the entire file to build an AST.  
  3. The function at the specified line number is identified as the entry point.  
  4. A call graph is constructed starting from this entry point, limited to a configurable depth (default: 2 levels) and staying within the provided file.  
* **Output:** A GraphContext object.  
  * **Data Model:**  
    {  
      "entry\_function\_id": "unique\_func\_name\_or\_hash",  
      "nodes": {  
        "unique\_func\_name\_or\_hash": {  
          "source\_code": "...",  
          "start\_line": 10,  
          "end\_line": 25,  
          "code\_hash": "sha256\_hash\_of\_source"  
        }  
      },  
      "edges": \[  
        { "caller": "func\_a", "callee": "func\_b" }  
      \]  
    }

### **3.2. Stage 2: Function-Level Semantic Abstraction**

* **Process:**  
  1. For each node in GraphContext.nodes:  
  2. Check the cache (Redis) using the code\_hash. If a result exists, use it.  
  3. If not cached, send the source\_code to the primary reasoning LLM (e.g., GPT-4o) using the "Step-by-Step Reasoning" prompt.  
  4. Store the resulting JSON in the cache with the code\_hash as the key.  
* **Output:** A collection of FunctionAnalysis objects.  
  * **Data Model:**  
    {  
      "function\_name": "string",  
      "summary": "High-level business logic summary.",  
      "control\_flow": \[  
        {  
          "type": "if\_statement | for\_loop | while\_loop",  
          "condition": "e.g., 'user.is\_authenticated'",  
          "summary": "Summary of the block's purpose.",  
          "branches": {  
            "if": "Summary of the 'if' branch.",  
            "else": "Summary of the 'else' branch."  
          }  
        }  
      \]  
    }

### **3.3. Stage 3: Abstract Flowchart Synthesis**

* **Process:** This is a deterministic, algorithmic stage.  
  1. Create a new abstract graph structure.  
  2. Iterate through the FunctionAnalysis objects and the GraphContext.  
  3. For each function, create a parent node with its summary.  
  4. For each element in control\_flow, create corresponding decision nodes (rhombus shape) and process nodes (rectangle shape).  
  5. Use the GraphContext.edges to draw links between function call nodes.  
* **Output:** An AbstractGraph object.  
  * **Data Model:**  
    {  
      "nodes": \[  
        { "id": "node1", "label": "User Login", "shape": "rectangle" },  
        { "id": "node2", "label": "Is Authenticated?", "shape": "rhombus" }  
      \],  
      "edges": \[  
        { "from": "node1", "to": "node2", "label": "" },  
        { "from": "node2", "to": "node3", "label": "Yes" }  
      \]  
    }

### **3.4. Stage 4: Mermaid Syntax Generation**

* **Process:**  
  1. Serialize the AbstractGraph object into a simplified JSON string.  
  2. Pass this JSON to a fast, specialized LLM (e.g., GPT-3.5 Turbo) using the "Few-Shot Learning" prompt for translation.  
* **Output:** A string containing raw Mermaid.js syntax.

### **3.5. Stage 5: Automated Validation and Repair**

* **Process:**  
  1. On the backend, use a headless browser instance or a server-side Mermaid rendering library to attempt to render the generated syntax.  
  2. **If successful:** Return the Mermaid string to the client.  
  3. **If it fails:** Capture the error message. Make a final LLM call using the "Contextual Debugging" prompt, providing the broken code and the error.  
  4. Return the repaired Mermaid string to the client.

## **4\. API Design**

The system will expose a single primary endpoint on the backend.

### **4.1. Endpoint: POST /generate-flowchart**

* **Description:** The main endpoint called by the IDE extension to initiate the flowchart generation process.  
* **Request Body:**  
  {  
    "language": "python" | "javascript",  
    "file\_content": "The full source code of the file.",  
    "line\_number": 42,  
    "config": {  
      "traversal\_depth": 2  
    }  
  }

* **Success Response (200 OK):**  
  {  
    "mermaid\_code": "graph TD;\\nA\[Start\] \--\> B{Check};\\n...",  
    "metadata": {  
      "node\_map": {  
        "A": { "start\_line": 10, "end\_line": 12 },  
        "B": { "start\_line": 14, "end\_line": 14 }  
      }  
    }  
  }

  The node\_map is crucial for implementing the interactive code-linking feature in the IDE extension.  
* **Error Response (4xx/5xx):**  
  {  
    "error": "A descriptive error message."  
  }

## **5\. Non-Functional Requirements**

### **5.1. Performance**

* **P95 Latency:** The end-to-end time from user request to diagram render should be under 5 seconds for a moderately complex function.  
* **Caching:** A cache hit for a function's semantic analysis should reduce processing time by at least 50-70%.  
* **UI Responsiveness:** All backend calls from the IDE extension must be asynchronous to prevent UI blocking.

### **5.2. Security**

* **Data in Transit:** All communication between the IDE extension and the backend service must be encrypted using HTTPS/TLS.  
* **Data at Rest:** Source code is processed in-memory on the backend and is not persisted, except for the hashed representation and semantic summary in the Redis cache. No user code will be logged.  
* **API Keys:** LLM provider API keys will be securely stored in the backend environment and never exposed to the client.

### **5.3. Scalability**

The backend service will be designed to be stateless and horizontally scalable. Multiple instances of the service can be run behind a load balancer to handle increased user load.

## **6\. Implementation and Test Plan**

### **6.1. Phased Rollout**

* **Phase 1 (Core Backend Logic):**  
  * Implement the five-stage pipeline as a command-line utility.  
  * Focus on the quality of prompts and the reliability of the output.  
  * Set up Redis caching.  
  * **Milestone:** Ability to reliably generate a Mermaid string from a local file.  
* **Phase 2 (Backend API & IDE Shell):**  
  * Wrap the pipeline logic in a FastAPI service.  
  * Develop a basic VS Code extension shell that can send a hardcoded file to the backend and display the result in a webview.  
  * **Milestone:** Successful end-to-end communication from IDE to backend and back.  
* **Phase 3 (Full Feature Implementation):**  
  * Implement dynamic file content and line number selection in the extension.  
  * Implement the interactive node-to-code linking using the node\_map metadata.  
  * Refine UI/UX, add loading indicators and error handling displays.  
  * **Milestone:** A fully functional, beta-ready IDE extension.

### **6.2. Testing Strategy**

* **Unit Tests:** Each stage of the pipeline will have comprehensive unit tests. Mock LLM responses will be used to test logic in isolation.  
* **Integration Tests:** The entire pipeline will be tested with a suite of real-world code examples of varying complexity.  
* **End-to-End (E2E) Tests:** Automated tests will simulate user interaction within the IDE to verify the full workflow.

## **7\. Future Work**

Post-V1, the following enhancements will be considered, as outlined in the original blueprint:

* Support for additional diagram types (Sequence, C4).  
* Multi-file analysis for a more holistic view.  
* Interactive diagram editing and potential code refactoring suggestions.