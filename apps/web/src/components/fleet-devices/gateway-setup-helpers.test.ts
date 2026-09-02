import { describe, expect, it } from 'vitest';
import {
  CANONICAL_PUBLIC_API_ORIGIN,
  buildIngestUrlHelper,
  isBlockedPublicApiHostname,
  isTraccarProvider,
  normalizePublicApiOrigin,
  resolvePublicApiOrigin,
} from './gateway-setup-helpers';

describe('gateway-setup-helpers', () => {
  it('uses the canonical production public API origin by default', () => {
    const result = buildIngestUrlHelper({ deviceId: 'device-abc' });
    expect(result.configurationMissing).toBe(false);
    expect(result.hostLabel).toBe(CANONICAL_PUBLIC_API_ORIGIN);
    expect(result.urlTemplate).toBe(
      `${CANONICAL_PUBLIC_API_ORIGIN}/telematics/ingest/device-abc?secret=<connection-secret>`,
    );
    expect(result.oneTimeUrl).toBeNull();
    expect(result.pathTemplate).not.toMatch(/secret=(?!<connection-secret>)/);
  });

  it('builds a complete one-time URL when a create-flow secret is provided', () => {
    const result = buildIngestUrlHelper({
      deviceId: 'device-abc',
      ingestSecret: 'one-time-secret-value',
      publicApiOrigin: CANONICAL_PUBLIC_API_ORIGIN,
    });
    expect(result.oneTimeUrl).toBe(
      `${CANONICAL_PUBLIC_API_ORIGIN}/telematics/ingest/device-abc?secret=one-time-secret-value`,
    );
    expect(result.pathTemplate).not.toContain('one-time-secret-value');
    expect(result.urlTemplate).not.toContain('one-time-secret-value');
  });

  it('never embeds a plaintext secret in the persistent path template', () => {
    const result = buildIngestUrlHelper({
      deviceId: '039417f2-66ca-4693-be07-86dee3611cea',
      ingestSecret: 'should-not-appear-in-template',
      publicApiOrigin: CANONICAL_PUBLIC_API_ORIGIN,
    });
    expect(result.pathTemplate).toContain('<connection-secret>');
    expect(result.pathTemplate).not.toContain('should-not-appear-in-template');
  });

  it('reports missing configuration instead of inventing a host', () => {
    const result = buildIngestUrlHelper({
      deviceId: 'device-abc',
      publicApiOrigin: null,
    });
    expect(result.configurationMissing).toBe(true);
    expect(result.urlTemplate).toBeNull();
    expect(result.oneTimeUrl).toBeNull();
    expect(result.originStatus).toBe('missing');
  });

  it('rejects localhost and internal hosts for customer-facing URLs', () => {
    const blocked = [
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      'http://host.docker.internal:4000',
      'http://api:4000',
      'http://192.168.1.10:4000',
    ];
    for (const host of blocked) {
      const result = buildIngestUrlHelper({
        deviceId: 'device-abc',
        publicApiOrigin: host,
        ingestSecret: 'secret-must-not-leak-into-template-path',
      });
      expect(result.configurationMissing).toBe(true);
      expect(result.urlTemplate).toBeNull();
      expect(result.oneTimeUrl).toBeNull();
      expect(result.originStatus).toBe('internal');
      expect(result.pathTemplate).not.toContain('secret-must-not-leak');
    }
  });

  it('accepts an explicit staging/public override', () => {
    const result = buildIngestUrlHelper({
      deviceId: 'device-abc',
      publicApiOrigin: 'https://api.staging.example.com',
    });
    expect(result.urlTemplate).toBe(
      'https://api.staging.example.com/telematics/ingest/device-abc?secret=<connection-secret>',
    );
  });

  it('classifies blocked hostnames explicitly', () => {
    expect(isBlockedPublicApiHostname('localhost')).toBe(true);
    expect(isBlockedPublicApiHostname('host.docker.internal')).toBe(true);
    expect(isBlockedPublicApiHostname('api')).toBe(true);
    expect(isBlockedPublicApiHostname('api.flowerp.uz')).toBe(false);
  });

  it('normalizes host-only production values', () => {
    expect(normalizePublicApiOrigin('api.flowerp.uz')).toEqual({
      status: 'ok',
      origin: 'https://api.flowerp.uz',
    });
    expect(resolvePublicApiOrigin(CANONICAL_PUBLIC_API_ORIGIN).origin).toBe(
      CANONICAL_PUBLIC_API_ORIGIN,
    );
  });

  it('identifies Traccar as the guided gateway provider', () => {
    expect(isTraccarProvider('TRACCAR')).toBe(true);
    expect(isTraccarProvider('SAMSARA')).toBe(false);
  });
});
