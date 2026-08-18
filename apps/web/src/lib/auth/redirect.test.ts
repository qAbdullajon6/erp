import { describe, expect, it } from 'vitest';
import { isSafeRedirect } from './redirect';

/// `?redirect=` is attacker-controllable, and it is consumed by our own
/// sign-in page — the one screen a user has been trained to type a password
/// into. Anything that leaves our origin has to be refused.
describe('isSafeRedirect', () => {
  it('accepts an application path', () => {
    expect(isSafeRedirect('/app/orders')).toBe(true);
    expect(isSafeRedirect('/app/orders/123?tab=documents')).toBe(true);
  });

  it('refuses an absolute URL to another origin', () => {
    expect(isSafeRedirect('https://evil.example/harvest')).toBe(false);
    expect(isSafeRedirect('http://evil.example')).toBe(false);
  });

  /// Both of these start with a slash but browsers resolve them to a different
  /// host, so a naive "starts with /" check would wave them through.
  it('refuses protocol-relative URLs', () => {
    expect(isSafeRedirect('//evil.example/harvest')).toBe(false);
    expect(isSafeRedirect('/\\evil.example/harvest')).toBe(false);
  });

  it('refuses javascript: and other schemes', () => {
    expect(isSafeRedirect('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirect('data:text/html,<script>')).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(isSafeRedirect(undefined)).toBe(false);
    expect(isSafeRedirect(null)).toBe(false);
    expect(isSafeRedirect('')).toBe(false);
  });
});
