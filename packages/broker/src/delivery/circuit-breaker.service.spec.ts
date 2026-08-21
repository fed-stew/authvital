import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  const URL_A = 'https://a.example.com/hook';
  const URL_B = 'https://b.example.com/hook';

  const mockConfig = { get: jest.fn() };

  let breaker: CircuitBreakerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.useFakeTimers({ now: new Date('2025-01-01T00:00:00Z') });

    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'BROKER_CIRCUIT_FAILURE_THRESHOLD') return '3';
      if (key === 'BROKER_CIRCUIT_COOLDOWN_MS') return '60000';
      return undefined;
    });

    breaker = new CircuitBreakerService(mockConfig as unknown as ConfigService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should allow attempts for unknown URLs', () => {
    expect(breaker.canAttempt(URL_A)).toBe(true);
  });

  it('should stay closed below the failure threshold', () => {
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);

    expect(breaker.canAttempt(URL_A)).toBe(true);
  });

  it('should open after N consecutive failures', () => {
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);

    expect(breaker.canAttempt(URL_A)).toBe(false);
  });

  it('should track URLs independently', () => {
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);

    expect(breaker.canAttempt(URL_A)).toBe(false);
    expect(breaker.canAttempt(URL_B)).toBe(true);
  });

  it('should half-open after the cooldown elapses', () => {
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);
    expect(breaker.canAttempt(URL_A)).toBe(false);

    jest.advanceTimersByTime(60_001);

    expect(breaker.canAttempt(URL_A)).toBe(true);
  });

  it('should re-open immediately on failure while half-open', () => {
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);
    jest.advanceTimersByTime(60_001);
    expect(breaker.canAttempt(URL_A)).toBe(true);

    breaker.recordFailure(URL_A); // half-open probe failed

    expect(breaker.canAttempt(URL_A)).toBe(false);
  });

  it('should close fully on success', () => {
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);
    jest.advanceTimersByTime(60_001);

    breaker.recordSuccess(URL_A);

    expect(breaker.canAttempt(URL_A)).toBe(true);
    // Failure count reset: two more failures should NOT re-open (threshold 3)
    breaker.recordFailure(URL_A);
    breaker.recordFailure(URL_A);
    expect(breaker.canAttempt(URL_A)).toBe(true);
  });

  it('should use defaults when envs are unset', () => {
    mockConfig.get.mockReturnValue(undefined);
    const fresh = new CircuitBreakerService(mockConfig as unknown as ConfigService);

    expect(fresh.failureThreshold).toBe(5);
    expect(fresh.cooldownMs).toBe(60000);
  });
});
