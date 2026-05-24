import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export function add_to_gitignore(file_name: string): void {
    const workspace_folders = vscode.workspace.workspaceFolders;
    if (!workspace_folders) {
        return;
    }
    const workspace_path = workspace_folders[0].uri.fsPath;
    const gitignore_path = path.join(workspace_path, ".gitignore");
    if (!fs.existsSync(gitignore_path)) {
        return;
    }
    fs.appendFile(gitignore_path, `\n${file_name}`, (err: NodeJS.ErrnoException | null) => {
        if (err) {
            console.error("Failed to update .gitignore:", err);
        } else {
            console.log(`${file_name} added to .gitignore.`);
        }
    });
}
