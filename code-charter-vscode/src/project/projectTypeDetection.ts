import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PythonEnvironment } from './python';

export interface ProjectEnvironment {
  // Describes a project in the workspace and its environment

  projectPath: vscode.Uri;

  displayName(): string;

  fileName(): string;

  parseCodebaseToScipIndex(outDirPath: vscode.Uri, outScipFilePath: vscode.Uri): Promise<void>; // Convert the codebase to SCIP format, outputting the path of the generated file

  filterTopLevelFunctions(topLevelFunctionNames: string[]): string[]; // Filter out unwanted top-level functions from the codebase e.g. tests

}

// TODO: add more language/environment detection logic
async function detectEnvironment(workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined): Promise<ProjectEnvironment[] | undefined> {
  if (!workspaceFolders) {
    vscode.window.showWarningMessage('No workspace is open.');
    console.log('Language Detection: No workspace is open.');
    return;
  }

  const projects: ProjectEnvironment[] = [];
  // TODO: convert this to recursive folder search (with max depth of 2 or 3 - configurable)
  for (const folder of workspaceFolders) {
    const workspacePath = folder.uri.fsPath;
    // TODO: move to detectPython function in python.ts
    // const hasRequirementsTxt = fs.existsSync(path.join(workspacePath, 'requirements.txt'));
    const hasRequirementsTxt = await fs.promises.stat(path.join(workspacePath, 'requirements.txt')).then(() => true, () => false);
    const hasPyprojectToml = await fs.promises.stat(path.join(workspacePath, 'pyproject.toml')).then(() => true, () => false);
    const pyFiles = fs.readdirSync(workspacePath).filter(file => file.endsWith('.py'));
    if (hasRequirementsTxt || hasPyprojectToml || pyFiles.length > 0) {
      console.log(`Language Detection: Python project detected at ${workspacePath}.`);
      // Additional logic to detect virtualenv or other environment specifics can be added here
      const pythonEnv = new PythonEnvironment(folder.uri);
      projects.push(pythonEnv);
    }
  }

  if (projects.length > 0) {
    return projects;
  }
}

export { detectEnvironment };