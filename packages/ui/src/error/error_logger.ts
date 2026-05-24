type Severity = 'info' | 'warning' | 'error' | 'critical';

interface ErrorEntry {
  timestamp: number;
  error: Error;
  context?: unknown;
  severity: Severity;
}

export class ErrorLogger {
  private errors: ErrorEntry[] = [];
  private max_errors: number;

  constructor(max_errors = 100) {
    this.max_errors = max_errors;
  }

  log(error: Error, severity: Severity = 'error', context?: unknown) {
    const error_entry = {
      timestamp: Date.now(),
      error,
      context,
      severity,
    };

    this.errors.push(error_entry);

    const console_method = severity === 'info' ? 'log' : severity === 'warning' ? 'warn' : 'error';
    console[console_method](`[${severity.toUpperCase()}]`, error.message, context || '');

    if (this.errors.length > this.max_errors) {
      this.errors = this.errors.slice(-this.max_errors);
    }
  }

  get_errors() {
    return [...this.errors];
  }

  clear() {
    this.errors = [];
  }

  get_error_summary() {
    const summary = {
      total: this.errors.length,
      by_type: new Map<string, number>(),
      by_severity: {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0,
      },
    };

    this.errors.forEach(entry => {
      const error_type = entry.error.name || 'Unknown';
      summary.by_type.set(error_type, (summary.by_type.get(error_type) || 0) + 1);
      summary.by_severity[entry.severity]++;
    });

    return summary;
  }
}

// Global error logger instance
export const error_logger = new ErrorLogger();
