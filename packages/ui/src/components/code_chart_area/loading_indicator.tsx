import React from "react";
import { CONFIG } from "./config";
import { useFlowThemeStyles } from "./use_flow_theme_styles";

interface LoadingIndicatorProps {
  status: string;
  message: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ status, message }) => {
  const themeStyles = useFlowThemeStyles();
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: `${CONFIG.spacing.padding.large}px`,
    }}>
      <div className="react-flow-loading-spinner" style={{
        width: "40px",
        height: "40px",
        border: `4px solid ${themeStyles.colors.ui.loading.track}`,
        borderTop: `4px solid ${themeStyles.colors.ui.button.primary}`,
        borderRadius: "50%",
        animation: "react-flow-spin 1s linear infinite",
      }} />
      
      <div style={{
        textAlign: "center",
      }}>
        <div style={{
          fontSize: `${CONFIG.spacing.fontSize.large}px`,
          fontWeight: "500",
          color: themeStyles.colors.ui.text.primary,
          marginBottom: `${CONFIG.spacing.margin.small}px`,
        }}>
          {status}
        </div>
        <div style={{
          fontSize: "14px",
          color: themeStyles.colors.ui.text.secondary,
        }}>
          {message}
        </div>
      </div>
      
      <style>{`
        @keyframes react-flow-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
