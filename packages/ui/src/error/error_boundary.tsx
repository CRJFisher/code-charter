import React, { Component, ErrorInfo, ReactNode } from 'react';
import { CONFIG } from '../components/code_chart_area/chart_config';
import { use_flow_theme_styles } from '../components/code_chart_area/use_chart_theme_styles';

function noop_retry(): void {
  // intentionally empty — used when retries are exhausted but the fallback still needs a callable
}

interface ErrorBoundaryState {
  has_error: boolean;
  error: Error | null;
  error_info: ErrorInfo | null;
  error_count: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, error_info: ErrorInfo, retry: () => void) => ReactNode;
  on_error?: (error: Error, error_info: ErrorInfo) => void;
  max_retries?: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      has_error: false,
      error: null,
      error_info: null,
      error_count: 0,
    };
  }

  // React lifecycle method — name is dictated by React.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { has_error: true, error };
  }

  // React lifecycle method — name is dictated by React.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  componentDidCatch(error: Error, error_info: ErrorInfo) {
    console.error('React Flow Error Boundary caught an error:', error, error_info);

    this.setState(prev_state => ({
      error_info,
      error_count: prev_state.error_count + 1,
    }));

    if (this.props.on_error) {
      this.props.on_error(error, error_info);
    }
  }

  retry = () => {
    this.setState({
      has_error: false,
      error: null,
      error_info: null,
    });
  };

  render() {
    if (this.state.has_error && this.state.error) {
      const { max_retries = 3 } = this.props;
      const can_retry = this.state.error_count <= max_retries;
      // getDerivedStateFromError fires before componentDidCatch, so error_info
      // may be null on the first render after an error. Provide a stub to satisfy the type.
      const info = this.state.error_info ?? ({ componentStack: '' } as ErrorInfo);

      if (this.props.fallback) {
        return this.props.fallback(
          this.state.error,
          info,
          can_retry ? this.retry : noop_retry
        );
      }

      return <DefaultErrorFallback
        error={this.state.error}
        error_info={info}
        on_retry={can_retry ? this.retry : undefined}
        retry_count={this.state.error_count}
        max_retries={max_retries}
      />;
    }

    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error: Error;
  error_info: ErrorInfo;
  on_retry?: () => void;
  retry_count: number;
  max_retries: number;
}

const DefaultErrorFallback: React.FC<DefaultErrorFallbackProps> = ({
  error,
  error_info,
  on_retry,
  retry_count,
  max_retries,
}) => {
  const [show_details, set_show_details] = React.useState(false);
  const theme_styles = use_flow_theme_styles();

  return (
    <div
      style={{
        padding: `${CONFIG.spacing.padding.xlarge}px`,
        margin: `${CONFIG.spacing.margin.xlarge}px auto`,
        ...theme_styles.get_error_style(),
        borderRadius: `${CONFIG.spacing.borderRadius.large}px`,
        maxWidth: '600px',
      }}
      role="alert"
      aria-live="assertive"
    >
      <h2 style={{ color: theme_styles.colors.ui.error.text, marginBottom: '10px', fontSize: `${CONFIG.spacing.fontSize.xlarge}px` }}>
        ⚠️ Something went wrong
      </h2>

      <p style={{ marginBottom: `${CONFIG.spacing.margin.large}px`, color: theme_styles.colors.ui.text.secondary }}>
        The code visualization encountered an error. This might be temporary.
      </p>

      <div style={{ marginBottom: `${CONFIG.spacing.margin.large}px` }}>
        <strong>Error:</strong> {error.message}
      </div>

      {on_retry && (
        <div style={{ marginBottom: `${CONFIG.spacing.margin.large}px` }}>
          <button
            onClick={on_retry}
            style={{
              ...theme_styles.get_button_style('primary'),
              padding: `${CONFIG.spacing.padding.medium}px ${CONFIG.spacing.padding.large}px`,
              borderRadius: `${CONFIG.spacing.borderRadius.medium}px`,
              marginRight: '10px',
            }}
          >
            🔄 Try Again ({retry_count}/{max_retries})
          </button>

          <button
            onClick={() => window.location.reload()}
            style={{
              ...theme_styles.get_button_style('secondary'),
              padding: `${CONFIG.spacing.padding.medium}px ${CONFIG.spacing.padding.large}px`,
              borderRadius: `${CONFIG.spacing.borderRadius.medium}px`,
            }}
          >
            🔃 Reload Page
          </button>
        </div>
      )}

      {!on_retry && retry_count > max_retries && (
        <div style={{ marginBottom: `${CONFIG.spacing.margin.large}px`, color: theme_styles.colors.ui.error.text }}>
          Maximum retry attempts reached. Please reload the page.
        </div>
      )}

      <details>
        <summary
          style={{
            cursor: 'pointer',
            color: theme_styles.colors.ui.button.primary,
            marginBottom: '10px',
          }}
          onClick={() => set_show_details(!show_details)}
        >
          {show_details ? '▼' : '▶'} Technical Details
        </summary>

        <div
          style={{
            marginTop: '10px',
            padding: '10px',
            backgroundColor: theme_styles.colors.node.background.module,
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

          {error_info.componentStack && (
            <>
              <div style={{ marginTop: '15px', marginBottom: '10px' }}>
                <strong>Component Stack:</strong>
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {error_info.componentStack}
              </pre>
            </>
          )}
        </div>
      </details>
    </div>
  );
};
