import * as vscode from "vscode";
import { CacheStorage } from "./clustering_types";

export class VscodeCacheStorage implements CacheStorage {
  constructor(private base_dir: vscode.Uri) {}

  async read_json<T>(sub_path: string): Promise<T | null> {
    const uri = vscode.Uri.joinPath(this.base_dir, ...sub_path.split("/"));
    try {
      const data = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(data.toString()) as T;
    } catch {
      return null;
    }
  }

  async write_json(sub_path: string, data: unknown): Promise<void> {
    const parts = sub_path.split("/");
    const dir_parts = parts.slice(0, -1);
    if (dir_parts.length > 0) {
      const dir_uri = vscode.Uri.joinPath(this.base_dir, ...dir_parts);
      try {
        await vscode.workspace.fs.createDirectory(dir_uri);
      } catch {
        // directory may already exist
      }
    }
    const uri = vscode.Uri.joinPath(this.base_dir, ...parts);
    await vscode.workspace.fs.writeFile(
      uri,
      new TextEncoder().encode(JSON.stringify(data))
    );
  }
}
