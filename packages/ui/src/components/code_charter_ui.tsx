import React from "react";
import { App } from "./App";
import { BackendProvider, BackendType } from "../backends";

export interface CodeCharterUIProps {
  backend_type?: BackendType;
  className?: string;
}

/**
 * Main Code Charter UI component that includes backend management
 */
export const CodeCharterUI: React.FC<CodeCharterUIProps> = ({ 
  backend_type,
  className 
}) => {
  // Auto-detect backend if not specified
  const backend_config = backend_type 
    ? { type: backend_type } 
    : undefined;

  // The backend will be initialized by the useBackend hook in App
  return <App className={className} />;
};

export default CodeCharterUI;