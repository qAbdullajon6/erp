'use client';

import { useCallback, useEffect, useState } from 'react';

export interface DriverLocation {
  lat: number;
  lng: number;
}

const MOCK_STORAGE_KEY = 'flowerp.driver.mockGps';

/** Tashkent center — used when mock GPS is enabled. */
const MOCK_LOCATION: DriverLocation = { lat: 41.2995, lng: 69.2401 };

export function isMockGpsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MOCK_STORAGE_KEY) === '1';
}

export function setMockGpsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  if (enabled) {
    window.localStorage.setItem(MOCK_STORAGE_KEY, '1');
  } else {
    window.localStorage.removeItem(MOCK_STORAGE_KEY);
  }
}

export function getMockLocation(): DriverLocation {
  return { ...MOCK_LOCATION };
}

/**
 * Soft GPS provider for the driver workspace.
 * Prefer browser geolocation; fall back to mock when toggled or unavailable.
 */
export function useDriverLocation(options?: { mock?: boolean; watch?: boolean }) {
  const [location, setLocation] = useState<DriverLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const useMock = options?.mock ?? (typeof window !== 'undefined' && isMockGpsEnabled());

  const refresh = useCallback(() => {
    if (useMock) {
      setLocation(getMockLocation());
      setError(null);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation unavailable');
      setLocation(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setError(null);
      },
      (err) => {
        setError(err.message || 'Location denied');
        setLocation(null);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, [useMock]);

  useEffect(() => {
    refresh();
    if (!options?.watch || useMock) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setError(null);
      },
      (err) => setError(err.message || 'Location denied'),
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [options?.watch, refresh, useMock]);

  return { location, error, refresh, isMock: useMock };
}
