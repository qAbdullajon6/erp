/// Circuit breaker state for per-endpoint health tracking.
///
/// Prevents cascading failures when a webhook endpoint is down or misconfigured.
/// Without this, 100 pending deliveries to a dead endpoint block the drain loop
/// for 1000 seconds (100 * 10s timeout), starving deliveries to healthy endpoints.
///
/// State machine:
///   CLOSED → normal operation, all requests sent
///   OPEN → endpoint unhealthy, requests blocked, logged but not sent
///   HALF_OPEN → testing recovery, limited requests allowed
///
/// CLOSED → OPEN:
///   When consecutive failures >= failureThreshold
///
/// OPEN → HALF_OPEN:
///   After resetTimeoutMs elapsed
///
/// HALF_OPEN → CLOSED:
///   When halfOpenRequests consecutive successes observed
///
/// HALF_OPEN → OPEN:
///   On any failure during half-open testing
export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  /// Consecutive failures before opening circuit (default: 5)
  failureThreshold: number;
  /// Milliseconds before attempting half-open test (default: 60000)
  resetTimeoutMs: number;
  /// Successful test requests before closing circuit (default: 3)
  halfOpenRequests: number;
}

export interface CircuitStatus {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: Date | null;
  openedAt: Date | null;
  halfOpenAt: Date | null;
  /// Tracks in-flight requests during HALF_OPEN state to prevent
  /// unlimited concurrent test requests from bypassing the halfOpenRequests limit.
  inFlightHalfOpen: number;
  /// Timestamp of last access for TTL-based cleanup of stale circuits.
  lastAccessedAt: Date;
}

/// Per-endpoint circuit breaker tracking.
///
/// Single-instance by design, matching the dispatcher itself. Multi-instance
/// deployments would need Redis-backed state (see TECHNICAL_DEBT.md).
export class WebhookCircuitBreaker {
  /// endpoint ID → circuit status
  private circuits = new Map<string, CircuitStatus>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly config: CircuitBreakerConfig) {
    // Clean up stale circuits every 10 minutes to prevent unbounded memory growth
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 600_000);
    // Don't prevent process exit
    this.cleanupInterval.unref();
  }

  /// Checks if the circuit is OPEN for this endpoint.
  ///
  /// When OPEN, deliveries should be skipped and retried later. The drain loop
  /// leaves them PENDING with a future nextAttemptAt, so they're automatically
  /// picked up after the reset timeout.
  ///
  /// Transitions OPEN → HALF_OPEN when reset timeout elapsed.
  shouldBlock(endpointId: string): boolean {
    const circuit = this.getCircuit(endpointId);

    if (circuit.state === CircuitState.OPEN) {
      const elapsed = circuit.openedAt ? Date.now() - circuit.openedAt.getTime() : Infinity;
      if (elapsed >= this.config.resetTimeoutMs) {
        // Transition to HALF_OPEN: allow limited test requests
        circuit.state = CircuitState.HALF_OPEN;
        circuit.halfOpenAt = new Date();
        circuit.successCount = 0;
        circuit.inFlightHalfOpen = 0;
        return false;
      }
      return true;
    }

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Block if we've already reached the in-flight limit for half-open testing
      if (circuit.inFlightHalfOpen >= this.config.halfOpenRequests) {
        return true;
      }
      // Allow this request and increment in-flight counter
      circuit.inFlightHalfOpen++;
      return false;
    }

    return false;
  }

  /// Records a successful delivery attempt.
  ///
  /// CLOSED: resets failure count
  /// HALF_OPEN: increments success count, closes circuit if threshold reached
  recordSuccess(endpointId: string): void {
    const circuit = this.getCircuit(endpointId);

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Decrement in-flight counter
      circuit.inFlightHalfOpen = Math.max(0, circuit.inFlightHalfOpen - 1);
      circuit.successCount++;
      if (circuit.successCount >= this.config.halfOpenRequests) {
        // Transition HALF_OPEN → CLOSED: endpoint recovered
        circuit.state = CircuitState.CLOSED;
        circuit.failureCount = 0;
        circuit.successCount = 0;
        circuit.openedAt = null;
        circuit.halfOpenAt = null;
        circuit.inFlightHalfOpen = 0;
      }
    } else if (circuit.state === CircuitState.CLOSED) {
      // Reset failure count on any success
      circuit.failureCount = 0;
    }
  }

  /// Records a failed delivery attempt.
  ///
  /// CLOSED: increments failure count, opens circuit if threshold reached
  /// HALF_OPEN: immediately reopens circuit (recovery test failed)
  recordFailure(endpointId: string): void {
    const circuit = this.getCircuit(endpointId);
    circuit.lastFailureAt = new Date();

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Decrement in-flight counter
      circuit.inFlightHalfOpen = Math.max(0, circuit.inFlightHalfOpen - 1);
      // Transition HALF_OPEN → OPEN: recovery failed, back to blocking
      circuit.state = CircuitState.OPEN;
      circuit.openedAt = new Date();
      circuit.halfOpenAt = null;
      circuit.failureCount = 0;
      circuit.successCount = 0;
      circuit.inFlightHalfOpen = 0;
    } else if (circuit.state === CircuitState.CLOSED) {
      circuit.failureCount++;
      if (circuit.failureCount >= this.config.failureThreshold) {
        // Transition CLOSED → OPEN: endpoint unhealthy
        circuit.state = CircuitState.OPEN;
        circuit.openedAt = new Date();
      }
    }
  }

  /// Gets current circuit state for observability/logging.
  getState(endpointId: string): CircuitState {
    return this.getCircuit(endpointId).state;
  }

  /// Gets full circuit status for debugging.
  getStatus(endpointId: string): CircuitStatus {
    return { ...this.getCircuit(endpointId) };
  }

  /// Resets circuit to CLOSED state. Used for manual intervention or testing.
  reset(endpointId: string): void {
    this.circuits.delete(endpointId);
  }

  /// Removes stale CLOSED circuits that haven't been accessed in over 1 hour.
  /// Prevents unbounded memory growth from deleted/unused webhook endpoints.
  private cleanup(): void {
    const now = Date.now();
    const staleThreshold = 3600_000; // 1 hour

    for (const [endpointId, circuit] of this.circuits.entries()) {
      const idle = now - circuit.lastAccessedAt.getTime();
      // Only remove CLOSED circuits (OPEN/HALF_OPEN indicate active issues)
      if (idle > staleThreshold && circuit.state === CircuitState.CLOSED) {
        this.circuits.delete(endpointId);
      }
    }
  }

  private getCircuit(endpointId: string): CircuitStatus {
    let circuit = this.circuits.get(endpointId);
    if (!circuit) {
      circuit = {
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureAt: null,
        openedAt: null,
        halfOpenAt: null,
        inFlightHalfOpen: 0,
        lastAccessedAt: new Date(),
      };
      this.circuits.set(endpointId, circuit);
    } else {
      // Update last accessed timestamp on every access
      circuit.lastAccessedAt = new Date();
    }
    return circuit;
  }
}
