import { add_to_gitignore } from "./files";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

function set_workspace_folder(folder_path: string | undefined): void {
  const value =
    folder_path === undefined
      ? undefined
      : [{ uri: vscode.Uri.file(folder_path), name: "test", index: 0 }];
  Object.defineProperty(vscode.workspace, "workspaceFolders", {
    value,
    configurable: true,
  });
}

async function read_gitignore(dir: string): Promise<string> {
  return fs.promises.readFile(path.join(dir, ".gitignore"), "utf8");
}

async function wait_for(predicate: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition not met within timeout");
}

describe("add_to_gitignore", () => {
  let temp_dir: string;

  beforeEach(async () => {
    temp_dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "files-test-"));
  });

  afterEach(async () => {
    set_workspace_folder(undefined);
    await fs.promises.rm(temp_dir, { recursive: true, force: true });
  });

  it("appends the file name on its own line to an existing .gitignore", async () => {
    const gitignore_path = path.join(temp_dir, ".gitignore");
    await fs.promises.writeFile(gitignore_path, "node_modules");
    set_workspace_folder(temp_dir);

    add_to_gitignore(".code-charter");

    await wait_for(async () =>
      (await read_gitignore(temp_dir)).includes(".code-charter")
    );
    expect(await read_gitignore(temp_dir)).toBe("node_modules\n.code-charter");
  });

  it("leaves the filesystem untouched when no workspace folder is open", async () => {
    set_workspace_folder(undefined);

    add_to_gitignore(".code-charter");

    expect(fs.existsSync(path.join(temp_dir, ".gitignore"))).toBe(false);
  });

  it("does not create a .gitignore when none exists", async () => {
    set_workspace_folder(temp_dir);

    add_to_gitignore(".code-charter");

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fs.existsSync(path.join(temp_dir, ".gitignore"))).toBe(false);
  });
});
