import * as vscode from 'vscode';
import { addToGitignore } from './files';
import { checkDockerInstalled } from './docker';
import { runCommand } from './run';
import { getFileVersionHash } from './git';
import { detectEnvironment, ProjectEnvironment } from './project/projectTypeDetection';
import { readCallGraphJsonFile, summariseCallGraph } from './summarise/summarise';
import { CallGraph } from '../shared/codeGraph';
import { ProjectEnvironmentId } from '../shared/codeGraph';
import { navigateToDoc } from './navigate';
import { ModelDetails, ModelProvider } from './model';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { ChatOpenAI } from "@langchain/openai";

const extensionFolder = '.code-charter';

let webviewColumn: vscode.ViewColumn | undefined;

export function activate(context: vscode.ExtensionContext) {
	// The command has been defined in the package.json file
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('code-charter-vscode.generateDiagram', () => generateDiagram(context));

	context.subscriptions.push(disposable);
}

async function generateDiagram(context: vscode.ExtensionContext) {

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

	await showWebviewDiagram(workspaceFolders, context, workDir);
}

async function showWebviewDiagram(
	workspaceFolders: readonly vscode.WorkspaceFolder[],
	context: vscode.ExtensionContext,
	workFolder: vscode.Uri,
) {
	const panel = vscode.window.createWebviewPanel(
		'codeDiagram',
		'Code Charter Diagram',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [
				vscode.Uri.file(context.extensionPath),
				vscode.Uri.joinPath(context.extensionUri, 'node_modules'),
			],
		}
	);
	webviewColumn = panel.viewColumn;

	panel.onDidChangeViewState(() => {
		webviewColumn = panel.viewColumn;
	});

	const scriptSrc = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "web", "dist", "bundle.js"));

	const htmlContent = `<!DOCTYPE html>
        <html lang="en">
          <head>
		  <style>
			:root {
			--vscode-editor-background: ${vscode.workspace.getConfiguration().get('workbench.colorCustomizations')['editor.background'] || '#ffffff'};
			--vscode-editor-foreground: ${vscode.workspace.getConfiguration().get('workbench.colorCustomizations')['editor.foreground'] || '#333333'};
			--vscode-editor-selectionBackground: ${vscode.workspace.getConfiguration().get('workbench.colorCustomizations')['editor.selectionBackground'] || '#3399ff'};
			--vscode-editorLineNumber-foreground: ${vscode.workspace.getConfiguration().get('workbench.colorCustomizations')['editorLineNumber.foreground'] || '#aaaaaa'};
			}
		</style>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script src="${scriptSrc}"></script>
          </body>
        </html>
        `;

	let callGraph: CallGraph | undefined;
	let allEnvironments: { [key: string]: ProjectEnvironment } | undefined;
	let selectedEnvironment: ProjectEnvironment | undefined;

	panel.webview.onDidReceiveMessage(
		async message => {
			const { command, id, ...otherFields } = message;
			switch (command) {
				case 'detectEnvironments':
					const envs = await detectEnvironment(workspaceFolders);
					allEnvironments = Object.fromEntries(envs?.map((env) => [env.projectPath.fsPath, env]) || []);
					const allEnvIds: ProjectEnvironmentId[] = envs?.map((env) => ({
						id: env.projectPath.fsPath,
						name: env.displayName()
					})) || [];
					panel.webview.postMessage({ id, command: 'detectEnvironmentsResponse', data: allEnvIds });
					break;
				case 'getCallGraphForEnvironment':
					const { env }: { env: ProjectEnvironmentId } = otherFields;
					selectedEnvironment = allEnvironments?.[env.id];
					if (!selectedEnvironment) {
						throw new Error('Selected environment not found');
					}
					const indexPath = await indexEnvironment(selectedEnvironment, workFolder);
					callGraph = await detectTopLevelFunctions(indexPath, selectedEnvironment, workFolder);
					if (!callGraph) {
						throw new Error('Call graph not found');
					}
					const topLevelFunctionsSet = new Set(selectedEnvironment.filterTopLevelFunctions(callGraph.topLevelNodes));
					callGraph.topLevelNodes = callGraph.topLevelNodes.filter((node) => topLevelFunctionsSet.has(node));
					panel.webview.postMessage({ id, command: 'getCallGraphForEnvironmentResponse', data: callGraph });
					break;
				case 'summariseCodeTree':
					const { topLevelFunctionSymbol } = otherFields;
					if (!callGraph) {
						throw new Error('Call graph not found');
					}
					if (!selectedEnvironment) {
						throw new Error('Selected environment not found');
					}
					const modelDetails = await getModelDetails();
					const summaries = await summariseCallGraph(topLevelFunctionSymbol, callGraph, workFolder, selectedEnvironment.projectPath, modelDetails);
					panel.webview.postMessage({ id, command: 'summariseCodeTreeResponse', data: summaries });
					break;
				case 'functionSummaryStatus':
					const { functionSymbol } = otherFields;
					// TODO: get it from the db
					panel.webview.postMessage({ id, command: 'functionSummaryStatusResponse', data: {} });
					break;
				case 'navigateToDoc':
					const { relativeDocPath, lineNumber } = otherFields;
					const fileUri = vscode.Uri.file(`${selectedEnvironment?.projectPath.fsPath}/${relativeDocPath}`);
					await navigateToDoc(fileUri, lineNumber, webviewColumn);
					panel.webview.postMessage({ id, command: 'navigateToDocResponse', data: { success: true } });
					break;
				default:
					throw new Error(`Unsupported command: ${command}`);
			}
		},
		undefined,
		context.subscriptions
	);

	panel.webview.html = htmlContent;
}

async function getModelDetails(): Promise<ModelDetails> {
	const configuration = vscode.workspace.getConfiguration('code-charter-vscode');

	const provider = configuration.get('modelProvider');
	if (provider === ModelProvider.OpenAI) {
		return {
			uid: 'openai:gpt-3.5-turbo',
			provider: ModelProvider.OpenAI,
			model: new ChatOpenAI({
				temperature: 0,
				modelName: 'gpt-3.5-turbo',
			}),
		};
	} else if (provider === ModelProvider.Ollama) {
		// TODO: get by calling Ollama API - use the last-used model
		const modelName = 'mistral'; // 'magicoder'; //"phi3:3.8b",
		return {
			uid: `ollama:${modelName}`,
			provider: ModelProvider.Ollama,
			model: new ChatOllama({
				baseUrl: "http://localhost:11434",
				model: modelName,
				format: "txt",
				keepAlive: "20m", // TODO: this doesn't work - still getting timeouts
			}),
		};
	}
}

async function indexEnvironment(selectedEnvironment: ProjectEnvironment, workDirPath: vscode.Uri): Promise<vscode.Uri> {
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
	return scipFilePath;
}

async function detectTopLevelFunctions(scipFilePath: vscode.Uri, selectedEnvironment: ProjectEnvironment, workDirPath: vscode.Uri): Promise<CallGraph> {
	const relativeWorkDirPath = vscode.workspace.asRelativePath(workDirPath);
	const containerInputFilePath = scipFilePath.fsPath.replace(workDirPath.fsPath, `/sources/${relativeWorkDirPath}`);
	console.log("containerInputFilePath", containerInputFilePath);
	const containerOutputFilePath = `/sources/${relativeWorkDirPath}/call_graph.json`;
	console.log("containerOutputFilePath", containerOutputFilePath);

	await runCommand(`docker run -v ${selectedEnvironment.projectPath.fsPath}:/sources/ crjfisher/codecharter-detectcallgraphs --input_file ${containerInputFilePath} --output_file ${containerOutputFilePath}`);

	// Read the call graph JSON file
	const callGraphJsonFilePath = vscode.Uri.file(`${workDirPath.fsPath}/call_graph.json`);
	const callGraph = await readCallGraphJsonFile(callGraphJsonFilePath);
	return callGraph;
}

export function deactivate() { }
