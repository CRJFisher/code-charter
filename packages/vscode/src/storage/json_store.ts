import * as fs from "fs";
import * as path from "path";
import type { ClusterSummariesFile } from "@code-charter/types";

export class ClusterSummariesStore {
  static read(workspace_root: string): ClusterSummariesFile | null {
    const file_path = path.join(workspace_root, "cluster-summaries.json");
    try {
      const data = fs.readFileSync(file_path, "utf-8");
      const parsed = JSON.parse(data) as ClusterSummariesFile;
      if (!parsed.content_hash || !parsed.clusters) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  static write(workspace_root: string, data: ClusterSummariesFile): void {
    const file_path = path.join(workspace_root, "cluster-summaries.json");
    const tmp_path = file_path + ".tmp";
    fs.writeFileSync(tmp_path, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp_path, file_path);
  }

  static is_stale(workspace_root: string, current_content_hash: string): boolean {
    const stored = ClusterSummariesStore.read(workspace_root);
    if (!stored) return true;
    return stored.content_hash !== current_content_hash;
  }
}
