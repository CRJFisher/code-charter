import * as fs from "fs";
import * as path from 'path';
import * as vscode from "vscode";


function addToGitignore(fileName: string): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const workspacePath: string = workspaceFolders[0].uri.fsPath; // Assuming single workspace
        console.log('workspacePath:', workspacePath);
        const gitignorePath: string = path.join(workspacePath, '.gitignore');
        // Check that .gitignore exists
        if (!fs.existsSync(gitignorePath)) {
            return;
        }
        fs.appendFile(gitignorePath, `\n${fileName}`, (err: NodeJS.ErrnoException | null) => {
            if (err) {
                console.error('Failed to update .gitignore:', err);
            } else {
                console.log(`${fileName} added to .gitignore.`);
            }
        });
    }
}

export { addToGitignore };
