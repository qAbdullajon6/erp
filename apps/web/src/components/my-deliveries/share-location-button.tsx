'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { MapPinned } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/api/describe-error';
import { apiFetch } from '@/lib/api/fetch';
import { unwrapResponse } from '@/lib/api/error';

/// Posts the driver's current GPS fix through the existing telematics
/// `POST /telematics/my-location` endpoint (vehicle resolved from active dispatch).
export function ShareLocationButton({ enabled }: { enabled: boolean }) {
  const [pending, setPending] = useState(false);

  if (!enabled) return null;

  const share = async () => {
    if (!navigator.geolocation) {
      toast.error('Location is not available on this device');
      return;
    }

    setPending(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20_000,
          maximumAge: 10_000,
        });
      });

      const response = await apiFetch('/api/telematics/my-location', {
        method: 'POST',
        body: JSON.stringify({
          positions: [
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              recordedAt: new Date(position.timestamp).toISOString(),
              accuracyM: position.coords.accuracy,
              ...(typeof position.coords.speed === 'number' && position.coords.speed >= 0
                ? { speedKph: position.coords.speed * 3.6 }
                : {}),
              ...(typeof position.coords.heading === 'number' && position.coords.heading >= 0
                ? { heading: position.coords.heading }
                : {}),
            },
          ],
        }),
      });
      await unwrapResponse(response, 'Failed to share location');
      toast.success('Location shared with dispatch');
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as GeolocationPositionError).code;
        if (code === 1) {
          toast.error('Location permission denied — enable it in browser settings');
          return;
        }
        if (code === 2) {
          toast.error('Location unavailable — try again outdoors');
          return;
        }
        if (code === 3) {
          toast.error('Location timed out — try again');
          return;
        }
      }
      toast.error(describeError(err, 'Failed to share location'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      className="w-full gap-2 py-6 text-base"
      onClick={() => void share()}
      disabled={pending}
    >
      <MapPinned className="h-5 w-5" />
      {pending ? 'Sharing…' : 'Share my location'}
    </Button>
  );
}
