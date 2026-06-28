import { renderHook } from "@testing-library/react";
import { use_backend } from "./use_backend";
import { BackendType } from "../backends";
import { MockBackend } from "../backends/mock_backend";
import { VSCodeBackend } from "../backends/vscode_backend";

describe("use_backend", () => {
  it("constructs the backend named by the config", () => {
    const { result } = renderHook(() => use_backend({ type: BackendType.MOCK }));

    expect(result.current.backend).toBeInstanceOf(MockBackend);
  });

  it("detects the environment backend when no config is given", () => {
    const { result } = renderHook(() => use_backend());

    expect(result.current.backend).toBeInstanceOf(VSCodeBackend);
  });

  it("keeps the same backend instance across rerenders", () => {
    const { result, rerender } = renderHook(() => use_backend({ type: BackendType.MOCK }));
    const first = result.current.backend;

    rerender();

    expect(result.current.backend).toBe(first);
  });
});
