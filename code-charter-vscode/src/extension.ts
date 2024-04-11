import * as vscode from 'vscode';
import { checkDockerInstalled } from './docker';
import { detectEnvironment } from './project/projectTypeDetection';
import { addToGitignore } from './files';
import { runCommand } from './run';
import { readCallGraphJsonFile, summariseCallGraph } from './summarise/summarise';
import { callGraphToMermaid } from './diagram';

const extensionFolder = '.code-charter';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	// Note on notification style: regular progress notifications are triggered in this file, while warnings and errors are shown at the source of the problem.

	// The command has been defined in the package.json file
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('code-charter-vscode.generateDiagram', generateDiagram);

	context.subscriptions.push(disposable);
}

async function generateDiagram(...args: any[]) {
	// Check docker is installed
	const isDockerInstalled = await checkDockerInstalled();
	if (!isDockerInstalled) {
		vscode.window.showErrorMessage('Docker is not running. Please install and run Docker to use this extension.');
		return;
	}
	// Check if a `.code-charter` directory exists in the workspace
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showWarningMessage('No workspace is open.');
		return;
	}
	const workspacePath = workspaceFolders[0].uri.fsPath;
	const dirPath = vscode.Uri.file(`${workspacePath}/${extensionFolder}`);
	const dirExists = await vscode.workspace.fs.stat(dirPath).then(() => true, () => false);
	if (!dirExists) {
		// Create the directory
		await vscode.workspace.fs.createDirectory(dirPath);
		addToGitignore(extensionFolder);
	}

	// Create another folder in the dirPath with a timestamp
	const timestamp = new Date().getTime();
	const folderPath = vscode.Uri.file(`${dirPath.fsPath}/${timestamp}`);
	await vscode.workspace.fs.createDirectory(folderPath);

	// TODO: create an object to hold the work folder info and helper functions e.g. relative path, docker-prefixed path etc

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Creating summary diagram",
		cancellable: true
	}, (p, t) => progressSteps(p, t, workspaceFolders, folderPath));

}

async function progressSteps(
	progress: vscode.Progress<{
		message?: string | undefined;
		increment?: number | undefined;
	}>,
	token: vscode.CancellationToken,
	workspaceFolders: readonly vscode.WorkspaceFolder[],
	workDirPath: vscode.Uri,
): Promise<void> {
	token.onCancellationRequested(() => {
		console.log("User canceled the long running operation");
		// TODO: make every step cancellable. How to send sigterm to docker containers?
	});

	// TODO: move blocks into separate functions

	progress.report({ increment: 0, message: "Detecting project environment" });

	const environments = await detectEnvironment(workspaceFolders, workDirPath);

	// Pick which environment to use
	let selectedEnvironment;
	if (!environments || environments.length === 0) {
		vscode.window.showWarningMessage('No supported project environment detected in the workspace.');
		return;
	}
	// Show picker
	if (environments.length > 1) {
		const picked = await vscode.window.showQuickPick(environments.map((env) => env.displayName()), {
			placeHolder: 'Select project to analyse',
			canPickMany: false,
		});
		if (!picked) {
			return;
		}
		selectedEnvironment = environments.find((env) => env.displayName() === picked);
	} else {
		selectedEnvironment = environments[0];
	}
	if (!selectedEnvironment) {
		vscode.window.showErrorMessage('No environment selected.');
		return;
	}

	if (token.isCancellationRequested) {
		return;
	}
	progress.report({ increment: 10, message: "Indexing..." });
	
	const scipIndexUri = await selectedEnvironment.parseCodebaseToScipIndex(workDirPath);
	if (!scipIndexUri) {
		return;
	}
	console.log(scipIndexUri.fsPath);
	
	progress.report({ increment: 20, message: "Detecting call graphs..." });
	const relativeWorkDirPath = vscode.workspace.asRelativePath(workDirPath);
	const containerInputFilePath = scipIndexUri.fsPath.replace(workDirPath.fsPath, `/sources/${relativeWorkDirPath}`);
	console.log("containerInputFilePath", containerInputFilePath);
	const containerOutputFilePath = `/sources/${relativeWorkDirPath}/call_graph.json`;
	console.log("containerOutputFilePath", containerOutputFilePath);

	await runCommand(`docker run -v ${selectedEnvironment.projectPath.fsPath}:/sources/ crjfisher/codecharter-detectcallgraphs --input_file ${containerInputFilePath} --output_file ${containerOutputFilePath}`);

	// TODO: add a LLM call to get the overall business logic summary for the selected project. Display this to user with the option to edit and improve it.

	if (token.isCancellationRequested) {
		return;
	}
	progress.report({ increment: 50, message: "Select call graph" });
	// Read the call graph JSON file
	const callGraphJsonFilePath = vscode.Uri.file(`${workDirPath.fsPath}/call_graph.json`);
	const callGraphJson = await readCallGraphJsonFile(callGraphJsonFilePath);
	// Picker for the call graph
	const pickedNode = await vscode.window.showQuickPick(callGraphJson.map((node) => node.symbol), {
		placeHolder: 'Select a function to summarise',
		canPickMany: false,
	});
	if (!pickedNode) {
		return;
	}
	const selectedNode = callGraphJson.find((node) => node.symbol === pickedNode);
	if (!selectedNode) {
		vscode.window.showErrorMessage('Selected node not found.');
		return;
	}
	const callGraphNodeSummaries = await summariseCallGraph(selectedNode, workDirPath, selectedEnvironment.projectPath);
	if (token.isCancellationRequested) {
		return;
	}
	progress.report({ increment: 90, message: "Generating diagram" });

	// TODO: select the output format (mermaid, d2, etc.) and output file path
	const outFile = vscode.Uri.file(`${workDirPath.fsPath}/call_graph.md`);
	await callGraphToMermaid(selectedNode, callGraphNodeSummaries, outFile);

	const workspaceRelOutFile = vscode.workspace.asRelativePath(outFile);
	progress.report({ increment: 100, message: `Diagram created at: ${workspaceRelOutFile}` });
}

// This method is called when your extension is deactivated
export function deactivate() { }
