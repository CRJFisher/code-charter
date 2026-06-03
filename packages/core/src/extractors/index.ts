/**
 * task-27.1.4 AC#6 — public surface of the literal skill extractors.
 */

export {
  EXTRACTOR_ID_FRONTMATTER,
  EXTRACTOR_ID_MARKDOWN,
  EXTRACTOR_ID_META_JSON,
  EXTRACTOR_VERSION,
  LITERAL_DOC_EDGE_KIND,
  SKILL_DOC_KIND,
  SKILL_INGEST_ORIGIN,
  SKILL_TO_REFERENCE_KIND,
  SKILL_TO_SCRIPT_KIND,
  SKILL_TO_SUBAGENT_KIND,
} from "./extractor_ids";
export { parse_markdown_links } from "./markdown_links";
export type { MarkdownLink } from "./markdown_links";
export { parse_frontmatter } from "./frontmatter";
export { read_sub_agents } from "./meta_json";
export type { SubAgentDecl } from "./meta_json";
export { ingest_skill } from "./skill_ingest";
export type { SkillIngestDeps, SkillIngestResult } from "./skill_ingest";
