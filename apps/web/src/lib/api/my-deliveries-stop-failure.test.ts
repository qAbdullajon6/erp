import { describe, expect, it, vi, beforeEach } from 'vitest';
import { myDeliveriesAPI } from './my-deliveries';

// Minimal MyDelivery shape for test assertions
const fakeDelivery = { id: 'dispatch-1', status: 'IN_TRANSIT', stops: [] } as unknown;

vi.mock('./fetch', () => ({
  apiFetch: vi.fn(),
}));
vi.mock('./error', () => ({
  unwrapResponse: vi.fn(async (r: Response) => r),
}));

import { apiFetch } from './fetch';
import { unwrapResponse } from './error';

const mockApiFetch = vi.mocked(apiFetch);
const mockUnwrap = vi.mocked(unwrapResponse);

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue(new Response());
  mockUnwrap.mockResolvedValue(fakeDelivery);
});

describe('myDeliveriesAPI.reportIntermediateStopFailure', () => {
  it('calls the correct endpoint with reason and notes', async () => {
    await myDeliveriesAPI.reportIntermediateStopFailure('dispatch-1', 'stop-abc', {
      reason: 'WRONG_ADDRESS',
      notes: 'Could not find the building',
    });

    expect(mockApiFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/api/dispatches/my/dispatch-1/stops/stop-abc/fail');
    expect(opts?.method).toBe('POST');
    const body = JSON.parse(opts?.body as string);
    expect(body.reason).toBe('WRONG_ADDRESS');
    expect(body.notes).toBe('Could not find the building');
  });

  it('omits notes from body when not provided', async () => {
    await myDeliveriesAPI.reportIntermediateStopFailure('dispatch-1', 'stop-abc', {
      reason: 'ACCESS_PROBLEM',
    });

    const body = JSON.parse(mockApiFetch.mock.calls[0][1]?.body as string);
    expect(body.reason).toBe('ACCESS_PROBLEM');
    expect(body.notes).toBeUndefined();
  });

  it('omits empty-string notes from body', async () => {
    await myDeliveriesAPI.reportIntermediateStopFailure('dispatch-1', 'stop-abc', {
      reason: 'OTHER',
      notes: '',
    });

    const body = JSON.parse(mockApiFetch.mock.calls[0][1]?.body as string);
    expect(body.notes).toBeUndefined();
  });

  it('passes the server response through unwrapResponse', async () => {
    const result = await myDeliveriesAPI.reportIntermediateStopFailure('dispatch-1', 'stop-abc', {
      reason: 'VEHICLE_PROBLEM',
    });
    expect(mockUnwrap).toHaveBeenCalledOnce();
    expect(result).toBe(fakeDelivery);
  });

  it('correctly encodes dispatchId and stopId in the URL', async () => {
    await myDeliveriesAPI.reportIntermediateStopFailure('d-abc-123', 's-xyz-456', {
      reason: 'DAMAGED_CARGO',
    });
    const [url] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/api/dispatches/my/d-abc-123/stops/s-xyz-456/fail');
  });
});
