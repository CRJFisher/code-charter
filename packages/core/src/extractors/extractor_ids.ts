/**
 * task-27.1.4 AC#6 — the literal-extractor identity catalog.
 *
 * Every raw row a literal extractor writes carries an `extractor_id` + `extractor_version` in its
 * provenance, so a later re-extraction can invalidate exactly the rows a given extractor produced.
 * These are the ids the skill-ingestion slice uses; they are open strings (the store enforces no
 * enum), gathered here so the catalog is one place.
 */

/** Bumped when an extractor's output shape changes in a way that invalidates cached provenance. */
export const EXTRACTOR_VERSION = "1";

/** Markdown-link extraction: SKILL.md → bundled scripts/references, reciprocal reference cross-refs. */
export const EXTRACTOR_ID_MARKDOWN = "literal.markdown";
/** Frontmatter extraction: surfaced as node attributes (no edges, hence no provenance today). */
export const EXTRACTOR_ID_FRONTMATTER = "literal.frontmatter";
/** `meta.json sub_agents[]` extraction: SKILL.md → declared sub-agent files. */
export const EXTRACTOR_ID_META_JSON = "literal.meta_json";

/** Producer stamp for skill-ingestion rows (the `origin` column). */
export const SKILL_INGEST_ORIGIN = "skill.ingest";

/**
 * The node kind for every skill doc/script node. Reuses the established literal-doc node kind
 * (`code.doc`, see the round-trip fixture) so gap-detection's doc queries stay uniform; scripts vs
 * references are distinguished by the *edge* kind, not a node kind.
 */
export const SKILL_DOC_KIND = "code.doc";

/** SKILL.md → a script under `scripts/`. */
export const SKILL_TO_SCRIPT_KIND = "skill.to_script";
/** SKILL.md → an in-bundle reference document. */
export const SKILL_TO_REFERENCE_KIND = "skill.to_reference";
/** SKILL.md → a sub-agent file declared in `meta.json sub_agents[]`. */
export const SKILL_TO_SUBAGENT_KIND = "skill.to_subagent";
/** A reference document → another in-bundle document (reciprocal cross-reference). */
export const LITERAL_DOC_EDGE_KIND = "code.literal-doc";
