// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { exec } from 'child_process';
import path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "code-charter-vscode" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('code-charter-vscode.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		// vscode.window.showInformationMessage('Hello World from Code Charter!');

		// todo: check / make 
		
		let projectPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
		// const command = 'docker run -v $(pwd):/sources sourcegraph/scip-typescript:latest scip-typescript index --cwd /sources';
		const command = `docker run -v ${projectPath}:/sources sourcegraph/scip-typescript:latest scip-typescript index --cwd /sources`;
		runDockerCommand(command, (output) => {
			// Handle the output from the Docker command
			console.log('Docker command executed successfully:', output);
		});
	});

	context.subscriptions.push(disposable);
}

function runDockerCommand(command: string, callback?: (output: string) => void): void {
	exec(command, (error, stdout, stderr) => {
		if (error) {
			console.error(`exec error: ${error}`);
			return;
		}
		if (stderr) {
			console.error(`stderr: ${stderr}`);
		}
		console.log(`stdout: ${stdout}`);
		if (callback) {
			callback(stdout);
		}
	});
}

function addToGitignore(fileName: string): void {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders) {
		const workspacePath: string = workspaceFolders[0].uri.fsPath; // Assuming single workspace
		const gitignorePath: string = path.join(workspacePath, '.gitignore');

		fs.appendFile(gitignorePath, `\n${fileName}\n`, (err: NodeJS.ErrnoException | null) => {
			if (err) {
				console.error('Failed to update .gitignore:', err);
			} else {
				console.log(`${fileName} added to .gitignore.`);
			}
		});
	}
}


// This method is called when your extension is deactivated
export function deactivate() { }
