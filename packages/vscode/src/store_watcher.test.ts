import * as vscode from "vscode";
import { StoreWatcher } from "./store_watcher";

const { __mockHelpers } = require("vscode");
const { mockFileWatcherCallbacks } = __mockHelpers;

describe("StoreWatcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockFileWatcherCallbacks).forEach(
      (key) => delete mockFileWatcherCallbacks[key]
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("watches graph.db under the store directory", () => {
    const watcher = new StoreWatcher("/repo/.code-charter", "graph.db", jest.fn());

    watcher.start();

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
    expect(vscode.RelativePattern).toHaveBeenCalledWith("/repo/.code-charter", "graph.db");
  });

  it("creates a single watcher when start is called more than once", () => {
    const watcher = new StoreWatcher("/repo/.code-charter", "graph.db", jest.fn());

    watcher.start();
    watcher.start();

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
  });

  it("debounces rapid store writes into one settled callback", () => {
    jest.useFakeTimers();
    const on_change = jest.fn();
    const watcher = new StoreWatcher("/repo/.code-charter", "graph.db", on_change);
    watcher.start();

    mockFileWatcherCallbacks.onCreate();
    mockFileWatcherCallbacks.onChange();
    mockFileWatcherCallbacks.onChange();

    expect(on_change).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);

    expect(on_change).toHaveBeenCalledTimes(1);
  });

  it("honors a custom settle window", () => {
    jest.useFakeTimers();
    const on_change = jest.fn();
    const watcher = new StoreWatcher("/repo/.code-charter", "graph.db", on_change, 250);
    watcher.start();

    mockFileWatcherCallbacks.onChange();

    jest.advanceTimersByTime(249);
    expect(on_change).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(on_change).toHaveBeenCalledTimes(1);
  });

  it("disposes the underlying watcher", () => {
    const watcher = new StoreWatcher("/repo/.code-charter", "graph.db", jest.fn());
    watcher.start();

    const created = (vscode.workspace.createFileSystemWatcher as jest.Mock).mock.results[0].value;
    watcher.dispose();

    expect(created.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not fire the callback for a write that was still settling when disposed", () => {
    jest.useFakeTimers();
    const on_change = jest.fn();
    const watcher = new StoreWatcher("/repo/.code-charter", "graph.db", on_change);
    watcher.start();

    mockFileWatcherCallbacks.onChange();
    watcher.dispose();
    jest.advanceTimersByTime(1000);

    expect(on_change).not.toHaveBeenCalled();
  });
});
