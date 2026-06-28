import { create_backend, BackendType } from "./backend_provider";
import { VSCodeBackend } from "./vscode_backend";
import { MockBackend } from "./mock_backend";

describe("create_backend", () => {
  const original_acquire = globalThis.acquireVsCodeApi;

  afterEach(() => {
    globalThis.acquireVsCodeApi = original_acquire;
  });

  describe("environment detection (no explicit config)", () => {
    it("builds a VSCodeBackend when acquireVsCodeApi is available", () => {
      globalThis.acquireVsCodeApi = jest.fn(() => ({
        postMessage: jest.fn(),
        getState: jest.fn(),
        setState: jest.fn(),
      }));

      expect(create_backend()).toBeInstanceOf(VSCodeBackend);
    });

    it("builds a MockBackend when acquireVsCodeApi is absent", () => {
      delete (globalThis as Partial<typeof globalThis>).acquireVsCodeApi;

      expect(create_backend()).toBeInstanceOf(MockBackend);
    });
  });

  describe("explicit config", () => {
    it("builds a VSCodeBackend for BackendType.VSCODE regardless of environment", () => {
      delete (globalThis as Partial<typeof globalThis>).acquireVsCodeApi;
      globalThis.acquireVsCodeApi = jest.fn(() => ({
        postMessage: jest.fn(),
        getState: jest.fn(),
        setState: jest.fn(),
      }));

      expect(create_backend({ type: BackendType.VSCODE })).toBeInstanceOf(VSCodeBackend);
    });

    it("builds a MockBackend for BackendType.MOCK even when acquireVsCodeApi is available", () => {
      globalThis.acquireVsCodeApi = jest.fn(() => ({
        postMessage: jest.fn(),
        getState: jest.fn(),
        setState: jest.fn(),
      }));

      expect(create_backend({ type: BackendType.MOCK })).toBeInstanceOf(MockBackend);
    });
  });
});
