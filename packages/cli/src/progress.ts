/**
 * Simple console progress reporter for CLI output.
 */
export class ProgressReporter {
  private current_step = 0;
  private total_steps: number;
  private start_time: number;

  constructor(total_steps: number) {
    this.total_steps = total_steps;
    this.start_time = Date.now();
  }

  /**
   * Report progress on the current step.
   */
  report(message: string): void {
    this.current_step++;
    const elapsed = ((Date.now() - this.start_time) / 1000).toFixed(1);
    const prefix = `[${this.current_step}/${this.total_steps}]`;
    console.log(`${prefix} ${message} (${elapsed}s)`);
  }

  /**
   * Log a detail message without advancing the step counter.
   */
  detail(message: string): void {
    console.log(`       ${message}`);
  }

  /**
   * Print a final summary line.
   */
  done(message: string): void {
    const elapsed = ((Date.now() - this.start_time) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s. ${message}`);
  }
}
