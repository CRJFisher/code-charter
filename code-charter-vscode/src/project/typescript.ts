import { Uri } from 'vscode';
import { ProjectEnvironment } from './projectTypeDetection';
import { runCommand } from '../run';
import * as vscode from 'vscode';

class TypescriptEnvironment implements ProjectEnvironment {
    outDirPath: vscode.Uri;
    projectPath: vscode.Uri;

    constructor(outDirPath: vscode.Uri, workspaceRelPath: vscode.Uri) {
        this.outDirPath = outDirPath;
        this.projectPath = workspaceRelPath;
    }

    displayName(): string {
        const relativePath = vscode.workspace.asRelativePath(this.projectPath);
        return `Typescript (${relativePath})`;
    }

    async parseCodebaseToScipIndex(): Promise<vscode.Uri> {
        let projectPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
        const outFile = `${this.outDirPath.fsPath}/scip-index.scip`;
        const indexCommand = `docker run -v ${projectPath}:/sources sourcegraph/scip-typescript:latest scip-typescript index --cdwd /sources --output ${outFile}`;
        await runCommand(indexCommand);
        return Uri.file(outFile);
    }

}