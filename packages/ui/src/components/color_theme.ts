const bgColor = getCssVariable("--vscode-editor-background");
const fgColor = getCssVariable("--vscode-editor-foreground");
const selectionBgColor = getCssVariable("--vscode-editor-selectionBackground");
const selectionFgColor = getCssVariable("--vscode-editor-selectionForeground");
const activeLineColor = getCssVariable("--vscode-editor-lineHighlightBackground");
const inactiveSelectionBgColor = getCssVariable("--vscode-editor-inactiveSelectionBackground");
const editorBorderColor = getCssVariable("--vscode-editor-widget-border");
const lineNumberColor = getCssVariable("--vscode-editorLineNumber-foreground");
const activeLineNumberColor = getCssVariable("--vscode-editorLineNumber-activeForeground");
const gutterBgColor = getCssVariable("--vscode-gutter-background");
const gutterBorderColor = getCssVariable("--vscode-gutter-border");
const rulerFgColor = getCssVariable("--vscode-editor-rulerForeground");
const cursorColor = getCssVariable("--vscode-editorCursor-foreground");
const whitespaceFgColor = getCssVariable("--vscode-editorWhitespace-foreground");
const commentsFgColor = getCssVariable("--vscode-editorComments-foreground");
const selectionHighlightBgColor = getCssVariable("--vscode-editor-selectionHighlightBackground");
const hoverHighlightBgColor = getCssVariable("--vscode-editorHoverHighlight-background");
const findMatchHighlightBgColor = getCssVariable("--vscode-editor-findMatchHighlightBackground");
const findMatchBgColor = getCssVariable("--vscode-editor-findMatchBackground");
const bracketMatchBgColor = getCssVariable("--vscode-editorBracketMatch-background");
const bracketMatchBorderColor = getCssVariable("--vscode-editorBracketMatch-border");
const overviewRulerBorderColor = getCssVariable("--vscode-editorOverviewRuler-border");
const overviewRulerBgColor = getCssVariable("--vscode-editorOverviewRuler-background");
const keywordFgColor = getCssVariable("--vscode-editor-keyword-foreground");
const functionFgColor = getCssVariable("--vscode-editor-function-foreground");
const variableFgColor = getCssVariable("--vscode-editor-variable-foreground");
const stringFgColor = getCssVariable("--vscode-editor-string-foreground");
const numberFgColor = getCssVariable("--vscode-editor-number-foreground");
const booleanFgColor = getCssVariable("--vscode-editor-boolean-foreground");
const constantFgColor = getCssVariable("--vscode-editor-constant-foreground");
const typeFgColor = getCssVariable("--vscode-editor-type-foreground");
const operatorFgColor = getCssVariable("--vscode-editor-operator-foreground");
const commentFgColor = getCssVariable("--vscode-editor-comment-foreground");

function getCssVariable(variableName: string): string {
  // Ensure we are running in a browser environment
  if (typeof window !== "undefined") {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  } else {
    return ""; // Return an empty string or a default value if not in a browser
  }
}

export {
    bgColor,
    fgColor,
    selectionBgColor,
    selectionFgColor,
    activeLineColor,
    inactiveSelectionBgColor,
    editorBorderColor,
    lineNumberColor,
    activeLineNumberColor,
    gutterBgColor,
    gutterBorderColor,
    rulerFgColor,
    cursorColor,
    whitespaceFgColor,
    commentsFgColor,
    selectionHighlightBgColor,
    hoverHighlightBgColor,
    findMatchHighlightBgColor,
    findMatchBgColor,
    bracketMatchBgColor,
    bracketMatchBorderColor,
    overviewRulerBorderColor,
    overviewRulerBgColor,
    keywordFgColor,
    functionFgColor,
    variableFgColor,
    stringFgColor,
    numberFgColor,
    booleanFgColor,
    constantFgColor,
    typeFgColor,
    operatorFgColor,
    commentFgColor,
}
