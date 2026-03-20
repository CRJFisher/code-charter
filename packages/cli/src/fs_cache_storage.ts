import * as fs from "fs";
import * as path from "path";
import type { CacheStorage } from "./clustering_service";

export class FsCacheStorage implements CacheStorage {
  constructor(private base_dir: string) {}

  async read_json<T>(sub_path: string): Promise<T | null> {
    const full_path = path.join(this.base_dir, sub_path);
    try {
      const data = fs.readFileSync(full_path, "utf-8");
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  async write_json(sub_path: string, data: unknown): Promise<void> {
    const full_path = path.join(this.base_dir, sub_path);
    const dir = path.dirname(full_path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full_path, JSON.stringify(data));
  }
}
