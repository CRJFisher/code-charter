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

async function directoryStructureToString(dirPath: string, indent: number = 0, depth: number = 0, maxDepth: number = 3): Promise<string> {
    // Check if the path is a directory
    const isDir = await fs.promises.lstat(dirPath).then(stats => stats.isDirectory(), () => false);
    if (!isDir) {
        throw new Error(`Path is not a directory: ${dirPath}`);
    }

    // Check for recursion depth limit
    if (depth > maxDepth) {
        return " ".repeat(4 * indent) + "\n";
    }

    let dirStructure: string = "";
    const items = await fs.promises.readdir(dirPath);

    // Determine if the directory contains only directories
    const containsOnlyDirectories = await Promise.all(items.map(async (item) => {
        const itemPath = path.join(dirPath, item);
        return await fs.promises.lstat(itemPath).then(stats => stats.isDirectory(), () => false);
    }));

    await Promise.all(items.map(async (item) => {
        const itemPath = path.join(dirPath, item);
        const isDir = await fs.promises.lstat(itemPath).then(stats => stats.isDirectory(), () => false);
        if (isDir) {
            // If the item is a directory, append its name
            dirStructure += " ".repeat(4 * indent) + `${item}/\n`;
            // Recurse only if the directory contains only directories and within depth limit
            if (containsOnlyDirectories) {
                dirStructure += directoryStructureToString(itemPath, indent + 1, depth + 1);
            }
        } else {
            // If the item is a file, just append its name to the string
            dirStructure += " ".repeat(4 * indent) + `${item}\n`;
        }
    }));

    return dirStructure;
}


export { addToGitignore, getBottomLevelFolder };
