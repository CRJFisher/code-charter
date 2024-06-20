import * as vscode from 'vscode';
import { checkDockerInstalled } from './docker';
import { detectEnvironment } from './project/projectTypeDetection';
import { addToGitignore } from './files';
import { runCommand } from './run';
import { countNodes, readCallGraphJsonFile, summariseCallGraph } from './summarise/summarise';
import * as dotenv from 'dotenv';

import { symbolRepoLocalName } from './summarise/models';
import { callGraphToDOT } from './diagram/d3GraphViz';
import { getFileVersionHash } from './git';

const extensionFolder = '.code-charter';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	// Note on notification style: regular progress notifications are triggered in this file, while warnings and errors are shown at the source of the problem.

	// The command has been defined in the package.json file
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('code-charter-vscode.generateDiagram', () => generateDiagram(context));

	context.subscriptions.push(disposable);
}

async function generateDiagram(context: vscode.ExtensionContext) {
	const res = dotenv.config( // TODO: use user parameter instead of env vars
		{
			path: `${__dirname}/../.env`
		}
	);
	if (res.error) {
		console.error(res.error);
	}
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
	const workDir = vscode.Uri.file(`${workspacePath}/${extensionFolder}`);
	const dirExists = await vscode.workspace.fs.stat(workDir).then(() => true, () => false);
	if (!dirExists) {
		// Create the directory
		await vscode.workspace.fs.createDirectory(workDir);
		addToGitignore(extensionFolder);
	}

	// TODO: create an object to hold the work folder info and helper functions e.g. relative path, docker-prefixed path etc

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Creating summary diagram",
		cancellable: true
	}, (p, t) => progressSteps(context, p, t, workspaceFolders, workDir));

}

async function progressSteps(
	context: vscode.ExtensionContext,
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

	let envFileString = selectedEnvironment.fileName();
	if (envFileString.length > 0) {
		envFileString += '-';
	}
	// TODO: only check for changes in the selected environment - need to add a getFiles() to environment then check against working tree changes - limit to just e.g. python files
	const versionSuffix = (await getFileVersionHash()) || 'latest';
	const scipFileName = `index-${envFileString}${versionSuffix}.scip`;
	const scipFilePath = vscode.Uri.joinPath(workDirPath, scipFileName);
	const doesFileExist = await vscode.workspace.fs.stat(scipFilePath).then(() => true, () => false);
	if (doesFileExist) {
		console.log(`SCIP file already exists: ${scipFilePath.fsPath}`);
	} else {
		await selectedEnvironment.parseCodebaseToScipIndex(workDirPath, scipFilePath);
	}

	progress.report({ increment: 20, message: "Detecting call graphs..." });
	const relativeWorkDirPath = vscode.workspace.asRelativePath(workDirPath);
	const containerInputFilePath = scipFilePath.fsPath.replace(workDirPath.fsPath, `/sources/${relativeWorkDirPath}`);
	console.log("containerInputFilePath", containerInputFilePath);
	const containerOutputFilePath = `/sources/${relativeWorkDirPath}/call_graph.json`;
	console.log("containerOutputFilePath", containerOutputFilePath);

	await runCommand(`docker run -v ${selectedEnvironment.projectPath.fsPath}:/sources/ crjfisher/codecharter-detectcallgraphs --input_file ${containerInputFilePath} --output_file ${containerOutputFilePath}`);

	if (token.isCancellationRequested) {
		return;
	}
	progress.report({ increment: 30, message: "Select call graph" });
	// Read the call graph JSON file
	const callGraphJsonFilePath = vscode.Uri.file(`${workDirPath.fsPath}/call_graph.json`);
	// const callGraphJsonFilePath = vscode.Uri.file('/Users/chuck/workspace/repo_analysis/aider/.code-charter/1718388735764/call_graph.json');
	const callGraph = await readCallGraphJsonFile(callGraphJsonFilePath);
	// Picker for the call graph
	const displayNameToFunctions = Object.fromEntries(selectedEnvironment.filterTopLevelFunctions(callGraph.topLevelNodes).map((functionSymbol) => [`${symbolRepoLocalName(functionSymbol)} (n=${countNodes(functionSymbol, callGraph)})`, functionSymbol]));
	const pickedNode = await vscode.window.showQuickPick(Object.keys(displayNameToFunctions), {
		placeHolder: 'Select a function to summarise',
		canPickMany: false,
	});
	if (!pickedNode) {
		return;
	}
	const selectedNode = displayNameToFunctions[pickedNode];
	if (!selectedNode) {
		vscode.window.showErrorMessage('Selected node not found.');
		return;
	}

	const totNodes = countNodes(selectedNode, callGraph);
	console.log(`Selected: ${selectedNode} with ${totNodes} nodes`);

	if (token.isCancellationRequested) {
		return;
	}
	progress.report({ increment: 10, message: "Summarising call graph" });

	const callGraphNodeSummaries = await summariseCallGraph(selectedNode, callGraph, workDirPath, selectedEnvironment.projectPath);
	// const file = await vscode.workspace.fs.readFile(vscode.Uri.file('/Users/chuck/workspace/repo_analysis/aider/.code-charter/1718388735764/summaries-aider.linter.Linter#__init__.json')).then((buffer) => new TextDecoder().decode(buffer));
	// const callGraphNodeSummaries = new Map<string, string>(Object.entries(JSON.parse(file)));
	if (token.isCancellationRequested) {
		return;
	}
	progress.report({ increment: 20, message: "Generating diagram" });

	// create a folder in the workDirPath for this diagram
	const dotString = await callGraphToDOT(selectedNode, callGraph, callGraphNodeSummaries.refinedFunctionSummaries, workDirPath);

	await showWebviewDiagram(context, workDirPath, dotString);

	progress.report({ increment: 10, message: `Diagram complete` });
}

async function showWebviewDiagram(context: vscode.ExtensionContext, workFolder: vscode.Uri, dotString: string) {
	const panel = vscode.window.createWebviewPanel(
		'graphvizDiagram',
		'Code Charter Diagram',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.file(context.extensionPath),
				vscode.Uri.joinPath(context.extensionUri, 'node_modules'),
			],
		}
	);

	// Load the HTML template
	const htmlPath = vscode.Uri.joinPath(context.extensionUri, 'assets', 'index.html');
	let htmlContent = await vscode.workspace.fs.readFile(htmlPath).then((buffer) => new TextDecoder().decode(buffer));

	// Resolve URIs for the scripts
	const d3Uri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'd3', 'dist', 'd3.min.js'));
	const graphvizWasmUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@hpcc-js', 'wasm', 'dist', 'graphviz.umd.js'));
	const d3GraphvizUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'd3-graphviz', 'build', 'd3-graphviz.js'));

	// Replace placeholders with the actual URIs
	htmlContent = htmlContent.replace('{d3Uri}', d3Uri.toString());
	htmlContent = htmlContent.replace('{graphvizWasmUri}', graphvizWasmUri.toString());
	htmlContent = htmlContent.replace('{d3GraphvizUri}', d3GraphvizUri.toString());

	htmlContent = htmlContent.replace('{dotString}', dotString);
	console.log(dotString);

	// Write html to work folder (for debugging)
	// const htmlFilePath = vscode.Uri.joinPath(workFolder, 'index.html');
	// await vscode.workspace.fs.writeFile(htmlFilePath, Buffer.from(htmlContent));

	panel.webview.html = htmlContent;
}

// This method is called when your extension is deactivated
export function deactivate() { }
