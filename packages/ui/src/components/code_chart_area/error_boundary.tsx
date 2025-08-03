import React, { Component, ErrorInfo, ReactNode } from 'react';
import { CONFIG } from './config';

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: ErrorInfo, retry: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  maxRetries?: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('React Flow Error Boundary caught an error:', error, errorInfo);
    
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  retry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError && this.state.error && this.state.errorInfo) {
      const { maxRetries = 3 } = this.props;
      const canRetry = this.state.errorCount <= maxRetries;

      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(
          this.state.error,
          this.state.errorInfo,
          canRetry ? this.retry : () => {}
        );
      }

      // Default error UI
      return <DefaultErrorFallback 
        error={this.state.error}
        errorInfo={this.state.errorInfo}
        onRetry={canRetry ? this.retry : undefined}
        retryCount={this.state.errorCount}
        maxRetries={maxRetries}
      />;
    }

    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error: Error;
  errorInfo: ErrorInfo;
  onRetry?: () => void;
  retryCount: number;
  maxRetries: number;
}

export const DefaultErrorFallback: React.FC<DefaultErrorFallbackProps> = ({
  error,
  errorInfo,
  onRetry,
  retryCount,
  maxRetries,
}) => {
  const [showDetails, setShowDetails] = React.useState(false);

  return (
    <div
      style={{
        padding: `${CONFIG.spacing.padding.xlarge}px`,
        margin: `${CONFIG.spacing.margin.xlarge}px`,
        backgroundColor: CONFIG.color.ui.error.background,
        border: `1px solid ${CONFIG.color.ui.error.border}`,
        borderRadius: `${CONFIG.spacing.borderRadius.large}px`,
        maxWidth: '600px',
        margin: `${CONFIG.spacing.margin.xlarge}px auto`,
      }}
      role="alert"
      aria-live="assertive"
    >
      <h2 style={{ color: CONFIG.color.ui.error.text, marginBottom: '10px', fontSize: `${CONFIG.spacing.fontSize.xlarge}px` }}>
        ⚠️ Something went wrong
      </h2>
      
      <p style={{ marginBottom: `${CONFIG.spacing.margin.large}px`, color: CONFIG.color.ui.text.secondary }}>
        The code visualization encountered an error. This might be temporary.
      </p>

      <div style={{ marginBottom: `${CONFIG.spacing.margin.large}px` }}>
        <strong>Error:</strong> {error.message}
      </div>

      {onRetry && (
        <div style={{ marginBottom: `${CONFIG.spacing.margin.large}px` }}>
          <button
            onClick={onRetry}
            style={{
              padding: `${CONFIG.spacing.padding.medium}px ${CONFIG.spacing.padding.large}px`,
              backgroundColor: '#0066cc',
              color: CONFIG.color.ui.text.white,
              border: 'none',
              borderRadius: `${CONFIG.spacing.borderRadius.medium}px`,
              cursor: 'pointer',
              marginRight: '10px',
            }}
          >
            🔄 Try Again ({retryCount}/{maxRetries})
          </button>
          
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: `${CONFIG.spacing.padding.medium}px ${CONFIG.spacing.padding.large}px`,
              backgroundColor: CONFIG.color.ui.text.secondary,
              color: CONFIG.color.ui.text.white,
              border: 'none',
              borderRadius: `${CONFIG.spacing.borderRadius.medium}px`,
              cursor: 'pointer',
            }}
          >
            🔃 Reload Page
          </button>
        </div>
      )}

      {!onRetry && retryCount > maxRetries && (
        <div style={{ marginBottom: `${CONFIG.spacing.margin.large}px`, color: CONFIG.color.ui.error.text }}>
          Maximum retry attempts reached. Please reload the page.
        </div>
      )}

      <details>
        <summary
          style={{
            cursor: 'pointer',
            color: '#0066cc',
            marginBottom: '10px',
          }}
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? '▼' : '▶'} Technical Details
        </summary>
        
        <div
          style={{
            marginTop: '10px',
            padding: '10px',
            backgroundColor: '#f5f5f5',
            borderRadius: `${CONFIG.spacing.borderRadius.medium}px`,
            fontSize: `${CONFIG.spacing.fontSize.medium}px`,
            fontFamily: 'monospace',
            overflowX: 'auto',
          }}
        >
          <div style={{ marginBottom: '10px' }}>
            <strong>Stack Trace:</strong>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {error.stack}
          </pre>
          
          {errorInfo.componentStack && (
            <>
              <div style={{ marginTop: '15px', marginBottom: '10px' }}>
                <strong>Component Stack:</strong>
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {errorInfo.componentStack}
              </pre>
            </>
          )}
        </div>
      </details>
    </div>
  );
};

// Hook for error handling in functional components
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  const resetError = () => setError(null);
  const captureError = (error: Error) => setError(error);

  return { resetError, captureError };
}