import * as vscode from "vscode";
import { ProjectEnvironment } from './projectTypeDetection';
import { promises as fsProm } from 'fs';
import { PythonExtension } from '@vscode/python-extension';
import { execAsync, runCommand } from "../run";
import { getBottomLevelFolder } from "../files";

export class PythonEnvironment implements ProjectEnvironment {
    projectPath: vscode.Uri;

    constructor(workspacePath: vscode.Uri) {
        this.projectPath = workspacePath;
    }

    displayName(): string {
        const relativePath = vscode.workspace.asRelativePath(this.projectPath);
        return `Python (${relativePath})`;
    }

    async parseCodebaseToScipIndex(outDirPath: vscode.Uri): Promise<vscode.Uri | undefined> {
        const pipListJsonFile = await writePipPackagesFile(outDirPath);
        if (!pipListJsonFile) {
            vscode.window.showErrorMessage('Error generating pip packages file.');
            return;
        }
        const relativePipeListJsonFile = '/sources/' + vscode.workspace.asRelativePath(pipListJsonFile);
        const outFile = `/sources/${vscode.workspace.asRelativePath(outDirPath)}/py-index.scip`;
        const projectName = await getBottomLevelFolder(this.projectPath);
        
        const indexCommand = `docker run -v ${this.projectPath.fsPath}:/sources sourcegraph/scip-python:latest scip-python index --project-name ${projectName} --project-version 1.0.0 --environment ${relativePipeListJsonFile} --output ${outFile} --cwd /sources`;
        await runCommand(indexCommand);
        return vscode.Uri.file(outFile);
    }
}

async function writePipPackagesFile(outDirPath: vscode.Uri): Promise<vscode.Uri | undefined> {
    // TODO: check if python extension is installed - does this throw an error?
    const pythonExtensionApi = await PythonExtension.api();
    const environments = pythonExtensionApi.environments;
    const environmentPath = environments?.getActiveEnvironmentPath();
    const environment = await environments.resolveEnvironment(environmentPath);
    if (!environment) {
        vscode.window.showErrorMessage('Python extension is not installed. Please install Microsoft Python extension.');
        return;
    }
    const pythonPath = environment.executable.uri?.fsPath;
    if (!pythonPath) {
        vscode.window.showErrorMessage('Python executable path not found.');
        return;
    }
    // get the list of installed packages
    const packages = await getPipPackagesDetails(pythonPath);
    if (!packages) {
        return;
    }
    const packagesJSON = JSON.stringify(packages, null, 2);
    // write to file; TODO: include the name of the project
    // const envCamel = this.displayName().split('/').join('_');
    const fileName = `${outDirPath.fsPath}/python-packages.json`;
    await fsProm.writeFile(fileName, packagesJSON);
    return vscode.Uri.file(fileName);
}

async function getPipPackagesDetails(pythonPath: string): Promise<Array<{ name: string, version: string, files: string[] }> | undefined> {
    try {
        // Run pip list and get the output in JSON format
        const { stdout: pipList } = await execAsync(`${pythonPath} -m pip list --format=json`);
        const packages = JSON.parse(pipList) as Array<{ name: string, version: string }>;

        const packageDetails = [];

        for (const pkg of packages) {
            // Get package info
            const { stdout: packageInfo } = await execAsync(`${pythonPath} -m pip show ${pkg.name}`);

            // Parse the details
            const name = pkg.name;
            const version = pkg.version;
            const filesStringMatch = packageInfo.match(/Files:\n([\s\S]*?)\n\n/);
            const files = filesStringMatch ? filesStringMatch[1].trim().split('\n').map(line => line.trim()) : [];

            // Construct JSON object for each package
            const packageDetail = { name, version, files };
            packageDetails.push(packageDetail);
        }

        return packageDetails;
    } catch (error) {
        console.error("Error getting pip packages details:", error);
        // TODO: create link to open an issue on GitHub including error and context details
        vscode.window.showErrorMessage('Error getting pip packages details.');
    }
}

