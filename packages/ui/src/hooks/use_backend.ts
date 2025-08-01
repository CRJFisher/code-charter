import { useEffect, useState, useCallback } from "react";
import { 
  CodeCharterBackend, 
  BackendState, 
  ConnectionStatus
} from "@code-charter/types";
import {
  BackendProvider,
  BackendConfig
} from "../backends";

/**
 * React hook for managing backend connection and state
 */
export function useBackend(config?: BackendConfig) {
  const [backend] = useState<CodeCharterBackend>(() => BackendProvider.getBackend(config));
  const [state, setState] = useState<BackendState>(backend.getState());
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Subscribe to state changes
    const unsubscribe = backend.onStateChange(setState);
    
    // Auto-connect if not connected
    if (state.status === ConnectionStatus.DISCONNECTED && !isConnecting) {
      connect();
    }
    
    return () => {
      unsubscribe();
    };
  }, [backend]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useCallback(async () => {
    if (state.status === ConnectionStatus.CONNECTED || isConnecting) {
      return;
    }
    
    setIsConnecting(true);
    try {
      await backend.connect();
    } catch (error) {
      console.error("Failed to connect backend:", error);
    } finally {
      setIsConnecting(false);
    }
  }, [backend, state.status, isConnecting]);

  const disconnect = useCallback(async () => {
    await backend.disconnect();
  }, [backend]);

  return {
    backend,
    state,
    isConnected: state.status === ConnectionStatus.CONNECTED,
    isConnecting: state.status === ConnectionStatus.CONNECTING || isConnecting,
    error: state.error,
    connect,
    disconnect
  };
}