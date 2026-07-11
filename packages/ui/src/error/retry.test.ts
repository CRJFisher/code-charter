import { with_retry, ErrorRecovery } from './retry';

describe('with_retry', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the result on first success without retrying', async () => {
    const operation = jest.fn().mockResolvedValue('ok');
    const on_retry = jest.fn();

    await expect(with_retry(operation, { on_retry })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(on_retry).not.toHaveBeenCalled();
  });

  it('retries after a failure and returns the eventual success', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('recovered');
    const on_retry = jest.fn();

    await expect(
      with_retry(operation, { delay_ms: 1, on_retry })
    ).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(on_retry).toHaveBeenCalledTimes(1);
    expect(on_retry).toHaveBeenCalledWith(1, expect.objectContaining({ message: 'transient' }));
  });

  it('throws the last error after exhausting every attempt', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'))
      .mockRejectedValue(new Error('final'));
    const on_retry = jest.fn();

    await expect(
      with_retry(operation, { max_attempts: 3, delay_ms: 1, on_retry })
    ).rejects.toThrow('final');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(on_retry).toHaveBeenCalledTimes(2);
  });

  it('wraps a non-Error rejection so the caller always sees an Error', async () => {
    const operation = jest.fn().mockRejectedValue('plain string failure');

    await expect(
      with_retry(operation, { max_attempts: 1 })
    ).rejects.toThrow('plain string failure');
  });

  it('rejects with a timeout error when the operation outlasts the timeout', async () => {
    const operation = jest.fn(() => new Promise<string>(() => {}));

    await expect(
      with_retry(operation, { max_attempts: 1, timeout: 5 })
    ).rejects.toThrow('Operation timed out after 5ms');
  });

  it('grows the delay by the backoff multiplier between attempts', async () => {
    jest.useFakeTimers();
    const operation = jest.fn().mockRejectedValue(new Error('fail'));

    const attempt = with_retry(operation, {
      max_attempts: 3,
      delay_ms: 100,
      backoff_multiplier: 2,
      timeout: 100000,
    });
    const settled = expect(attempt).rejects.toThrow('fail');

    await jest.advanceTimersByTimeAsync(0);
    expect(operation).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(99);
    expect(operation).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(operation).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(199);
    expect(operation).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(operation).toHaveBeenCalledTimes(3);

    await settled;
    jest.useRealTimers();
  });
});

describe('ErrorRecovery.try_with_fallback', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the primary result and skips the fallback when the primary succeeds', async () => {
    const primary = jest.fn().mockResolvedValue('primary');
    const fallback = jest.fn().mockResolvedValue('fallback');
    const on_fallback = jest.fn();

    await expect(
      ErrorRecovery.try_with_fallback(primary, fallback, on_fallback)
    ).resolves.toBe('primary');
    expect(fallback).not.toHaveBeenCalled();
    expect(on_fallback).not.toHaveBeenCalled();
  });

  it('falls back and reports the failure when the primary throws', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('primary down'));
    const fallback = jest.fn().mockResolvedValue('fallback');
    const on_fallback = jest.fn();

    await expect(
      ErrorRecovery.try_with_fallback(primary, fallback, on_fallback)
    ).resolves.toBe('fallback');
    expect(on_fallback).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'primary down' })
    );
  });
});
