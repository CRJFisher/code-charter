import * as vscode from "vscode";
import { UIDevWatcher } from "../dev_watcher";

const { __mockHelpers } = require("vscode");
const { mockFileWatcherCallbacks } = __mockHelpers;

function set_workspace_folder(folder_path: string | undefined): void {
  const value =
    folder_path === undefined
      ? undefined
      : [{ uri: vscode.Uri.file(folder_path), name: "test", index: 0 }];
  Object.defineProperty(vscode.workspace, "workspaceFolders", {
    value,
    configurable: true,
  });
}

function make_context(): vscode.ExtensionContext {
  const partial: Partial<vscode.ExtensionContext> = { subscriptions: [] };
  return partial as vscode.ExtensionContext;
}

describe("UIDevWatcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockFileWatcherCallbacks).forEach(
      (key) => delete mockFileWatcherCallbacks[key]
    );
    set_workspace_folder("/repo");
  });

  afterEach(() => {
    set_workspace_folder(undefined);
    jest.useRealTimers();
  });

  it("creates no watcher when there is no workspace folder", () => {
    set_workspace_folder(undefined);
    const watcher = new UIDevWatcher(make_context(), jest.fn());

    watcher.start();

    expect(vscode.workspace.createFileSystemWatcher).not.toHaveBeenCalled();
  });

  it("watches the standalone UI bundle and announces dev mode", () => {
    const context = make_context();
    const watcher = new UIDevWatcher(context, jest.fn());

    watcher.start();

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
    expect(vscode.RelativePattern).toHaveBeenCalledWith(
      "/repo/packages/ui/dist",
      "standalone.global.js"
    );
    expect(context.subscriptions).toHaveLength(1);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
  });

  it("creates a single watcher when start is called more than once", () => {
    const watcher = new UIDevWatcher(make_context(), jest.fn());

    watcher.start();
    watcher.start();

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
  });

  it("debounces rapid bundle writes into one reload", () => {
    jest.useFakeTimers();
    const on_change = jest.fn();
    const watcher = new UIDevWatcher(make_context(), on_change);
    watcher.start();

    mockFileWatcherCallbacks.onChange();
    mockFileWatcherCallbacks.onChange();
    mockFileWatcherCallbacks.onCreate();

    expect(on_change).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);

    expect(on_change).toHaveBeenCalledTimes(1);
  });
});
