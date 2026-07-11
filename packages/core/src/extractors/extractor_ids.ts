/**
 * The literal-extractor catalog: the provenance identities and the graph edge/node kinds the skill
 * extractors emit.
 *
 * Every raw row a literal extractor writes carries an `extractor_id` + `extractor_version` in its
 * provenance, so a later re-extraction can invalidate exactly the rows a given extractor produced. The
 * `*_KIND` constants live with the extractor that emits them, so a reader (gap-detection reads
 * `LITERAL_DOC_EDGE_KIND`) imports the kind from its producer. All are open strings; the store enforces
 * no enum.
 */

/** Bumped when an extractor's output shape changes in a way that invalidates cached provenance. */
export const EXTRACTOR_VERSION = "1";

export const EXTRACTOR_ID_MARKDOWN = "literal.markdown";
export const EXTRACTOR_ID_META_JSON = "literal.meta_json";

/** Producer stamp written to the `origin` column of every skill-ingestion row. */
export const SKILL_INGEST_ORIGIN = "skill.ingest";

/**
 * Reuses the shared literal-doc node kind so gap-detection's doc queries stay uniform across skill
 * docs and scripts; scripts vs references are distinguished by the edge kind, not the node kind.
 */
export const SKILL_DOC_KIND = "code.doc";

export const SKILL_TO_SCRIPT_KIND = "skill.to_script";
export const SKILL_TO_REFERENCE_KIND = "skill.to_reference";
export const SKILL_TO_SUBAGENT_KIND = "skill.to_subagent";
/** A reference document to another in-bundle document: a reciprocal cross-reference. */
export const LITERAL_DOC_EDGE_KIND = "code.literal-doc";
