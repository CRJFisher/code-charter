export class ErrorLogger {
  private errors: Array<{
    timestamp: number;
    error: Error;
    context?: any;
    severity: 'info' | 'warning' | 'error' | 'critical';
  }> = [];
  private maxErrors: number;

  constructor(maxErrors: number = 100) {
    this.maxErrors = maxErrors;
  }

  log(error: Error, severity: 'info' | 'warning' | 'error' | 'critical' = 'error', context?: any) {
    const errorEntry = {
      timestamp: Date.now(),
      error,
      context,
      severity,
    };

    this.errors.push(errorEntry);

    // Log to console with appropriate level
    const consoleMethod = severity === 'info' ? 'log' : severity === 'warning' ? 'warn' : 'error';
    console[consoleMethod](`[${severity.toUpperCase()}]`, error.message, context || '');

    // Keep only last N errors to prevent memory leak
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
  }

  getErrors() {
    return [...this.errors];
  }

  clear() {
    this.errors = [];
  }

  getErrorSummary() {
    const summary = {
      total: this.errors.length,
      byType: new Map<string, number>(),
      bySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0,
      },
    };

    this.errors.forEach(entry => {
      const errorType = entry.error.name || 'Unknown';
      summary.byType.set(errorType, (summary.byType.get(errorType) || 0) + 1);
      summary.bySeverity[entry.severity]++;
    });

    return summary;
  }
}

// Global error logger instance
export const errorLogger = new ErrorLogger();
