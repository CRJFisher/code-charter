import * as vscode from "vscode";

export async function navigate_to_doc(
    file_uri: vscode.Uri,
    line_number: number,
    current_column: vscode.ViewColumn | undefined,
): Promise<void> {
    const visible_editors = vscode.window.visibleTextEditors;
    const other_column = get_opposite_column(current_column, visible_editors);

    const document = await vscode.workspace.openTextDocument(file_uri);
    const editor = await vscode.window.showTextDocument(document, other_column);

    const range = editor.document.lineAt(line_number).range;
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

function get_opposite_column(
    current_column: vscode.ViewColumn | undefined,
    visible_editors: readonly vscode.TextEditor[],
): vscode.ViewColumn {
    const columns: vscode.ViewColumn[] = [];
    for (const editor of visible_editors) {
        if (editor.viewColumn !== undefined) {
            columns.push(editor.viewColumn);
        }
    }
    const unique_columns = Array.from(new Set(columns));

    if (unique_columns.length === 1) {
        return current_column === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
    }

    if (unique_columns.length === 2) {
        return unique_columns.find((col) => col !== current_column) || vscode.ViewColumn.One;
    }

    return vscode.ViewColumn.Two;
}
