import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { describeError, isConflict } from './describe-error';
import { ApiError, isClientError } from './error';

/// Task 8.11 — what the dispatcher is told when something goes wrong.
///
/// The rule is not "hide what the server said". It is "only show the user what is
/// about them". A 409 is about them and is written for them; a 500 is about the
/// server; a dropped connection is about the network. Before this, the dispatch
/// screens could not tell the three apart, because their API clients threw a plain
/// Error with no status attached.

describe('describeError', () => {
  it('shows a 409 verbatim — it IS the operational reason', () => {
    const conflict = new ApiError(
      'This driver is already assigned to dispatch DSP-000041 during the requested time range',
      409,
    );

    // Rewording this could only make it vaguer. The server named the dispatch; a
    // dispatcher can go and look at it.
    expect(describeError(conflict)).toBe(
      'This driver is already assigned to dispatch DSP-000041 during the requested time range',
    );
  });

  it('shows any 4xx verbatim — the server considered the request and answered', () => {
    expect(describeError(new ApiError('Cannot cancel a dispatch with status DELIVERED', 409))).toContain(
      'DELIVERED',
    );
    expect(describeError(new ApiError('Dispatch not found', 404))).toBe('Dispatch not found');
    expect(describeError(new ApiError('Forbidden', 403))).toBe('Forbidden');
  });

  it('NEVER shows a 5xx body — that is about the server, not the user', () => {
    const boom = new ApiError('QueryFailedError: relation "dispatch" does not exist', 500);

    const shown = describeError(boom);

    expect(shown).not.toContain('QueryFailedError');
    expect(shown).not.toContain('relation');
    expect(shown).toMatch(/server had a problem/i);
  });

  it('explains a dropped connection in words a human recognises', () => {
    // This is literally what fetch() throws when the network is gone.
    const offline = new TypeError('Failed to fetch');

    const shown = describeError(offline);

    expect(shown).not.toContain('Failed to fetch');
    expect(shown).toMatch(/could not reach the server/i);
  });

  it('falls back rather than leaking an unrecognised error', () => {
    expect(describeError({ weird: true }, 'Failed to update dispatch')).toBe(
      'Failed to update dispatch',
    );
  });
});

describe('isConflict', () => {
  it('is true only for a 409', () => {
    expect(isConflict(new ApiError('busy', 409))).toBe(true);
    expect(isConflict(new ApiError('nope', 404))).toBe(false);
    expect(isConflict(new Error('busy'))).toBe(false);
  });
});

describe('the retry policy can finally see a refusal (the bug this fixed)', () => {
  /// The dispatch API clients used to throw a plain `Error`. React Query's retry
  /// policy asks `isClientError()`, which needs the status — so a 409 looked like a
  /// transport blip and was RETRIED. Every double-booking cost three round trips
  /// before the dispatcher was told anything.
  it('a plain Error is indistinguishable from a network failure', () => {
    expect(isClientError(new Error('Conflict'))).toBe(false);
  });

  it('an ApiError is not', () => {
    expect(isClientError(new ApiError('This driver is already assigned', 409))).toBe(true);
  });

  it('React Query does NOT retry a 409, and DOES retry a 500', async () => {
    const retry = (failureCount: number, error: unknown) =>
      !isClientError(error) && failureCount < 2;

    const conflicting = vi.fn().mockRejectedValue(new ApiError('Driver is busy', 409));
    const flaky = vi.fn().mockRejectedValue(new ApiError('boom', 500));

    const client = new QueryClient({ defaultOptions: { queries: { retry } } });

    await client
      .fetchQuery({ queryKey: ['conflict'], queryFn: conflicting })
      .catch(() => undefined);
    await client.fetchQuery({ queryKey: ['flaky'], queryFn: flaky }).catch(() => undefined);

    // Asked once, refused once, told the user. No hammering the API with a request
    // that can only ever be refused again.
    expect(conflicting).toHaveBeenCalledTimes(1);
    // A 500 might genuinely be transient, so it is worth another go.
    expect(flaky).toHaveBeenCalledTimes(3);
  });
});
