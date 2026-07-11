import * as vscode from "vscode";

export async function navigate_to_doc(
    file_uri: vscode.Uri,
    line_number: number,
    current_column: vscode.ViewColumn | undefined,
): Promise<void> {
    const visible_columns = vscode.window.visibleTextEditors.map((editor) => editor.viewColumn);
    const other_column = get_opposite_column(current_column, visible_columns);

    const document = await vscode.workspace.openTextDocument(file_uri);
    const editor = await vscode.window.showTextDocument(document, other_column);

    const range = editor.document.lineAt(line_number - 1).range;
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

export function get_opposite_column(
    current_column: vscode.ViewColumn | undefined,
    visible_columns: readonly (vscode.ViewColumn | undefined)[],
): vscode.ViewColumn {
    const unique_columns = Array.from(
        new Set(visible_columns.filter((col): col is vscode.ViewColumn => col !== undefined)),
    );

    if (unique_columns.length === 1) {
        return current_column === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
    }

    if (unique_columns.length === 2) {
        return unique_columns.find((col) => col !== current_column) || vscode.ViewColumn.One;
    }

    return vscode.ViewColumn.Two;
}
