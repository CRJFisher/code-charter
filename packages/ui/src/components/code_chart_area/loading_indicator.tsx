import React from "react";

interface LoadingIndicatorProps {
  status: string;
  message: string;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ status, message }) => {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "16px",
    }}>
      <div className="react-flow-loading-spinner" style={{
        width: "40px",
        height: "40px",
        border: "4px solid #f3f3f3",
        borderTop: "4px solid #3498db",
        borderRadius: "50%",
        animation: "react-flow-spin 1s linear infinite",
      }} />
      
      <div style={{
        textAlign: "center",
      }}>
        <div style={{
          fontSize: "16px",
          fontWeight: "500",
          color: "#333",
          marginBottom: "4px",
        }}>
          {status}
        </div>
        <div style={{
          fontSize: "14px",
          color: "#666",
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

// Progress bar component for multi-step operations
export const ProgressBar: React.FC<{ progress: number; total: number }> = ({ progress, total }) => {
  const percentage = Math.round((progress / total) * 100);
  
  return (
    <div style={{
      width: "200px",
      height: "8px",
      backgroundColor: "#f0f0f0",
      borderRadius: "4px",
      overflow: "hidden",
      marginTop: "12px",
    }}>
      <div style={{
        width: `${percentage}%`,
        height: "100%",
        backgroundColor: "#3498db",
        transition: "width 0.3s ease",
      }} />
    </div>
  );
};