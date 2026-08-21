import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number; // epoch ms; 0 = closed
}

/**
 * CircuitBreakerService — per-URL failure circuit.
 *
 * After BROKER_CIRCUIT_FAILURE_THRESHOLD consecutive failures (default 5)
 * the circuit for that URL opens for BROKER_CIRCUIT_COOLDOWN_MS (default
 * 60s). While open, delivery is refused without attempting; callers should
 * nack(retryable) so the transport backoff reschedules.
 *
 * After cooldown the circuit is half-open: one attempt is allowed; success
 * closes it, failure re-opens it for another cooldown.
 *
 * State is in-memory per broker replica (each replica trips independently —
 * good enough, and no shared-state complexity).
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly state = new Map<string, CircuitState>();

  readonly failureThreshold: number;
  readonly cooldownMs: number;

  constructor(configService: ConfigService) {
    this.failureThreshold = parseInt(
      configService.get<string>('BROKER_CIRCUIT_FAILURE_THRESHOLD') ?? '5',
      10,
    );
    this.cooldownMs = parseInt(
      configService.get<string>('BROKER_CIRCUIT_COOLDOWN_MS') ?? '60000',
      10,
    );
  }

  /** May we attempt delivery to this URL right now? */
  canAttempt(url: string): boolean {
    const circuit = this.state.get(url);
    if (!circuit) {
      return true;
    }
    return circuit.openUntil <= Date.now();
  }

  recordSuccess(url: string): void {
    if (this.state.delete(url)) {
      this.logger.log(`Circuit closed for ${url} (delivery succeeded)`);
    }
  }

  recordFailure(url: string): void {
    const circuit = this.state.get(url) ?? {
      consecutiveFailures: 0,
      openUntil: 0,
    };
    circuit.consecutiveFailures += 1;

    if (circuit.consecutiveFailures >= this.failureThreshold) {
      circuit.openUntil = Date.now() + this.cooldownMs;
      this.logger.warn(
        `Circuit OPEN for ${url} after ${circuit.consecutiveFailures} ` +
          `consecutive failure(s) — cooling down ${this.cooldownMs}ms`,
      );
    }

    this.state.set(url, circuit);
  }
}
