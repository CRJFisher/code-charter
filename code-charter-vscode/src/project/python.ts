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

    fileName(): string {
        const relPath = vscode.workspace.asRelativePath(this.projectPath);
        if (relPath === this.projectPath.fsPath) {
            return '';
        }
        // convert system-based folder separators to underscores
        return relPath.replace(/[\\/]/g, '_');
    }

    async parseCodebaseToScipIndex(outDirPath: vscode.Uri, scipFilePath: vscode.Uri): Promise<void> {
        console.time("parseCodebaseToScipIndex");
        console.time("writePipPackagesFile");
        const pipListJsonFile = await writePipPackagesFile(outDirPath);
        console.timeEnd("writePipPackagesFile");
        if (!pipListJsonFile) {
            vscode.window.showErrorMessage('Error generating pip packages file.');
            return;
        }
        const relativePipeListJsonFile = `/sources/${vscode.workspace.asRelativePath(pipListJsonFile)}`;
        const outFile = `/sources/${vscode.workspace.asRelativePath(scipFilePath)}`;
        const projectName = await getBottomLevelFolder(this.projectPath);
        console.time("scip-pyton docker");
        const indexCommand = `docker run -v ${this.projectPath.fsPath}:/sources crjfisher/codecharter-scip-python:latest index --project-name ${projectName} --project-version 1.0.0 --environment ${relativePipeListJsonFile} --output ${outFile} --cwd /sources`;
        const output = await runCommand(indexCommand);
        console.timeEnd("scip-pyton docker");
        console.log('scip-pyton docker output', output);
        console.timeEnd("parseCodebaseToScipIndex");
    }

    filterTopLevelFunctions(topLevelFunctionNames: string[]): string[] {
        // regex pattern to match string containing test folder e.g. 'tests/', 'test/', 'testing/'
        const testFolderPattern = /tests?\.|testing\./;
        // regex pattern to match string containing test method or function e.g. '*#test_*()' or  '*/test_*()'
        const testFilePattern = /.*#_?test_.*\(\)|.*\/test_.*\(\)/;
        const filteredFunctions = topLevelFunctionNames.filter((name) => !testFolderPattern.test(name) && !testFilePattern.test(name)); 
        return filteredFunctions;
    }
}

async function writePipPackagesFile(outDirPath: vscode.Uri): Promise<vscode.Uri> {
    // TODO: check if python extension is installed - does this throw an error?
    const pythonExtensionApi = await PythonExtension.api();
    const environments = pythonExtensionApi.environments;
    const environmentPath = environments?.getActiveEnvironmentPath();
    const environment = await environments.resolveEnvironment(environmentPath);
    if (!environment) {
        vscode.window.showErrorMessage('Python extension is not installed. Please install Microsoft Python extension.');
        throw new Error('Python extension is not installed. Please install Microsoft Python extension.');
    }
    const pythonPath = environment.executable.uri?.fsPath;
    if (!pythonPath) {
        vscode.window.showErrorMessage('Python executable path not found.');
        throw new Error('Python executable path not found.');
    }
    // get the list of installed packages
    console.time("getPipPackagesDetails");
    const packages = await getPipPackagesDetails(pythonPath);
    console.timeEnd("getPipPackagesDetails");
    if (!packages) {
        vscode.window.showErrorMessage('Error getting pip packages details.');
        throw new Error('Error getting pip packages details.');
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
        console.time("pip-list");
        const { stdout: pipList } = await execAsync(`${pythonPath} -m pip list --local --no-index --format=json`);
        console.timeEnd("pip-list");
        const packages = JSON.parse(pipList) as Array<{ name: string, version: string }>;

        const packageDetails = [];

        for (const pkg of packages) {
            // removed because this was causing a massive slowdown
            // Get package info
            // const { stdout: packageInfo } = await execAsync(`${pythonPath} -m pip show ${pkg.name}`);

            // Parse the details
            const name = pkg.name;
            const version = pkg.version;
            // const filesStringMatch = packageInfo.match(/Files:\n([\s\S]*?)\n\n/);
            const files: string[] = []; // filesStringMatch ? filesStringMatch[1].trim().split('\n').map(line => line.trim()) : [];

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


