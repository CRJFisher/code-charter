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

async function getBottomLevelFolder(uri: vscode.Uri): Promise<string> {
    // check if its a file or a folder
    const stats = await fs.promises.stat(uri.fsPath);
    let bottomLevelFolder: string;
    if (stats.isFile()) {
        // get the parent folder of the file
        bottomLevelFolder = path.dirname(uri.fsPath).split(path.sep).pop() || '';
    } else {
        bottomLevelFolder = path.basename(uri.fsPath); // TODO: broken
    }
    return bottomLevelFolder;
}

export { addToGitignore, getBottomLevelFolder };
