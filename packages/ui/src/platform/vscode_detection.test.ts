import type { VsCodeApi } from "./vscode_detection";

type AcquireVsCodeApi = typeof globalThis.acquireVsCodeApi;

function make_api(): VsCodeApi {
  return {
    postMessage: jest.fn(),
    getState: jest.fn(),
    setState: jest.fn(),
  };
}

describe("vscode_detection", () => {
  const original_acquire: AcquireVsCodeApi = globalThis.acquireVsCodeApi;

  beforeEach(() => {
    // Each test loads a fresh module so get_vscode_api's module-scope cache resets.
    jest.resetModules();
  });

  afterEach(() => {
    globalThis.acquireVsCodeApi = original_acquire;
  });

  describe("is_vscode_context", () => {
    it("returns true when acquireVsCodeApi is present", async () => {
      globalThis.acquireVsCodeApi = jest.fn(make_api);
      const { is_vscode_context } = await import("./vscode_detection");

      expect(is_vscode_context()).toBe(true);
    });

    it("returns false when acquireVsCodeApi is absent", async () => {
      delete (globalThis as Partial<typeof globalThis>).acquireVsCodeApi;
      const { is_vscode_context } = await import("./vscode_detection");

      expect(is_vscode_context()).toBe(false);
    });
  });

  describe("get_vscode_api", () => {
    it("returns the instance produced by acquireVsCodeApi", async () => {
      const api = make_api();
      globalThis.acquireVsCodeApi = jest.fn(() => api);
      const { get_vscode_api } = await import("./vscode_detection");

      expect(get_vscode_api()).toBe(api);
    });

    it("acquires the API once and caches it across calls", async () => {
      const acquire = jest.fn(make_api);
      globalThis.acquireVsCodeApi = acquire;
      const { get_vscode_api } = await import("./vscode_detection");

      const first = get_vscode_api();
      const second = get_vscode_api();

      expect(first).toBe(second);
      expect(acquire).toHaveBeenCalledTimes(1);
    });

    it("throws when acquireVsCodeApi is absent", async () => {
      delete (globalThis as Partial<typeof globalThis>).acquireVsCodeApi;
      const { get_vscode_api } = await import("./vscode_detection");

      expect(() => get_vscode_api()).toThrow("VSCode API not available");
    });
  });
});
