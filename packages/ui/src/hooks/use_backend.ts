import { useState } from "react";
import { CodeCharterBackend } from "@code-charter/types";
import { create_backend, BackendConfig } from "../backends";

/**
 * React hook for accessing the backend
 */
export function use_backend(config?: BackendConfig) {
  const [backend] = useState<CodeCharterBackend>(() => create_backend(config));

  return { backend };
}
