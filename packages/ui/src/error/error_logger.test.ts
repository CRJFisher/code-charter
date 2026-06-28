import { error_logger } from './error_logger';

describe('error_logger', () => {
  beforeEach(() => {
    error_logger.clear();
  });

  it('captures message, severity, context, and a timestamp for each entry', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const before = Date.now();
    const error = new Error('boom');

    error_logger.log(error, 'error', { flow_id: 'f1' });

    const [entry] = error_logger.get_errors();
    expect(entry.error).toBe(error);
    expect(entry.severity).toBe('error');
    expect(entry.context).toEqual({ flow_id: 'f1' });
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(Date.now());
    spy.mockRestore();
  });

  it('routes info to console.log, warning to console.warn, and the rest to console.error', () => {
    const log_spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warn_spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error_spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    error_logger.log(new Error('i'), 'info');
    error_logger.log(new Error('w'), 'warning');
    error_logger.log(new Error('e'), 'error');
    error_logger.log(new Error('c'), 'critical');

    expect(log_spy).toHaveBeenCalledWith('[INFO]', 'i', '');
    expect(warn_spy).toHaveBeenCalledWith('[WARNING]', 'w', '');
    expect(error_spy).toHaveBeenCalledWith('[ERROR]', 'e', '');
    expect(error_spy).toHaveBeenCalledWith('[CRITICAL]', 'c', '');

    log_spy.mockRestore();
    warn_spy.mockRestore();
    error_spy.mockRestore();
  });

  it('returns a defensive copy from get_errors so callers cannot mutate internal state', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    error_logger.log(new Error('one'), 'error');

    error_logger.get_errors().pop();

    expect(error_logger.get_errors()).toHaveLength(1);
    spy.mockRestore();
  });

  it('clear empties the buffer', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    error_logger.log(new Error('one'), 'error');
    error_logger.log(new Error('two'), 'error');

    error_logger.clear();

    expect(error_logger.get_errors()).toEqual([]);
    spy.mockRestore();
  });

  it('caps the buffer at 100 entries, evicting the oldest and keeping the newest', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    for (let i = 0; i < 110; i++) {
      error_logger.log(new Error(`Error ${i}`), 'info');
    }

    const entries = error_logger.get_errors();
    expect(entries).toHaveLength(100);
    expect(entries[0].error.message).toBe('Error 10');
    expect(entries[99].error.message).toBe('Error 109');
    spy.mockRestore();
  });

  it('summarises totals by severity and by error name', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn_spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const log_spy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const layout_error = new Error('Layout failed');
    layout_error.name = 'LayoutError';
    error_logger.log(layout_error, 'error');
    error_logger.log(new Error('Generic error'), 'warning');
    error_logger.log(new Error('Info'), 'info');

    const summary = error_logger.get_error_summary();
    expect(summary.total).toBe(3);
    expect(summary.by_severity.error).toBe(1);
    expect(summary.by_severity.warning).toBe(1);
    expect(summary.by_severity.info).toBe(1);
    expect(summary.by_severity.critical).toBe(0);
    expect(summary.by_type.get('LayoutError')).toBe(1);
    expect(summary.by_type.get('Error')).toBe(2);

    spy.mockRestore();
    warn_spy.mockRestore();
    log_spy.mockRestore();
  });
});
