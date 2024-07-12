import * as vscode from 'vscode';

export async function navigateToDoc(fileUri: vscode.Uri, lineNumber: number, currentColumn: vscode.ViewColumn | undefined) {
    // const currentEditor = vscode.window.activeTextEditor;

    // if (!currentEditor) {
    //     vscode.window.showErrorMessage('No active editor');
    //     return;
    // }

    // // Determine the column to open the file in
    // const currentViewColumn = currentEditor.viewColumn;
    console.log(`Navigating to ${fileUri.fsPath}:${lineNumber}`);
    const visibleEditors = vscode.window.visibleTextEditors;
    const otherColumn = getOppositeColumn(currentColumn, visibleEditors);

    const document = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(document, otherColumn);

    const range = editor.document.lineAt(lineNumber).range;
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

function getOppositeColumn(currentColumn: vscode.ViewColumn | undefined, visibleEditors: readonly vscode.TextEditor[]): vscode.ViewColumn {
    const columns = visibleEditors.map(editor => editor.viewColumn).filter(col => col !== undefined) as vscode.ViewColumn[];
    const uniqueColumns = Array.from(new Set(columns));

    // If there is only one column, open in the second column
    if (uniqueColumns.length === 1) {
        return currentColumn === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
    }

    // If there are two columns, find the one that is not current
    if (uniqueColumns.length === 2) {
        return uniqueColumns.find(col => col !== currentColumn) || vscode.ViewColumn.One;
    }

    // Default fallback
    return vscode.ViewColumn.Two;
}
