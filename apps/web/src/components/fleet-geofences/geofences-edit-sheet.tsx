'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  useUpdateGeofenceMutation,
  type Geofence,
  type GeofenceType,
  type GeofenceVertex,
  type UpdateGeofenceInput,
} from '@/lib/api/telematics-geofences';
import { useCustomersList } from '@/lib/api/customers';
import { describeError } from '@/lib/api/describe-error';
import { toast } from 'sonner';

interface Props {
  fence: Geofence | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FormState = {
  name: string;
  type: GeofenceType;
  active: boolean;
  centerLat: string;
  centerLng: string;
  radiusM: string;
  polygonText: string;
  color: string;
  category: string;
  linkedCustomerId: string;
  alertOnEnter: boolean;
  alertOnExit: boolean;
  dwellThresholdSec: string;
};

export function GeofencesEditSheet({ fence, open, onOpenChange }: Props) {
  const update = useUpdateGeofenceMutation();
  const customers = useCustomersList(
    { page: 1, limit: 100, sortBy: 'companyName', sortOrder: 'asc' },
    { enabled: open },
  );
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!fence || !open) return;
    setForm({
      name: fence.name,
      type: fence.type,
      active: fence.active,
      centerLat: fence.centerLat != null ? String(fence.centerLat) : '',
      centerLng: fence.centerLng != null ? String(fence.centerLng) : '',
      radiusM: fence.radiusM != null ? String(fence.radiusM) : '',
      polygonText: fence.polygon
        ? JSON.stringify(fence.polygon, null, 2)
        : '',
      color: fence.color ?? '#3b82f6',
      category: fence.category ?? '',
      linkedCustomerId: fence.linkedCustomerId ?? '',
      alertOnEnter: fence.alertOnEnter,
      alertOnExit: fence.alertOnExit,
      dwellThresholdSec:
        fence.dwellThresholdSec != null ? String(fence.dwellThresholdSec) : '',
    });
    setErrors({});
  }, [fence, open]);

  const customerOptions = useMemo(
    () => customers.data.filter((c) => !c.archivedAt),
    [customers.data],
  );

  const validate = (): UpdateGeofenceInput | null => {
    if (!form) return null;
    const next: Record<string, string> = {};
    const name = form.name.trim();
    if (!name) next.name = 'Required';
    else if (name.length > 120) next.name = 'Max 120 characters';

    let polygon: GeofenceVertex[] | undefined;
    if (form.type === 'CIRCLE') {
      const centerLat = Number(form.centerLat);
      const centerLng = Number(form.centerLng);
      const radiusM = Number(form.radiusM);
      if (!Number.isFinite(centerLat) || centerLat < -90 || centerLat > 90) {
        next.centerLat = 'Valid latitude required';
      }
      if (!Number.isFinite(centerLng) || centerLng < -180 || centerLng > 180) {
        next.centerLng = 'Valid longitude required';
      }
      if (!Number.isFinite(radiusM) || radiusM < 1) {
        next.radiusM = 'Radius must be ≥ 1 meter';
      }
    } else {
      try {
        const parsed = JSON.parse(form.polygonText) as unknown;
        if (!Array.isArray(parsed) || parsed.length < 3) {
          next.polygonText = 'Provide at least 3 {lat,lng} vertices as JSON';
        } else {
          polygon = parsed.map((v, index) => {
            const lat = Number((v as { lat?: unknown }).lat);
            const lng = Number((v as { lng?: unknown }).lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              throw new Error(`Vertex ${index + 1} is invalid`);
            }
            return { lat, lng };
          });
        }
      } catch (err) {
        next.polygonText =
          err instanceof Error ? err.message : 'Invalid polygon JSON';
      }
    }

    if (form.color && !/^#[0-9A-Fa-f]{6}$/.test(form.color)) {
      next.color = 'Use #RRGGBB';
    }

    let dwellThresholdSec: number | undefined;
    if (form.dwellThresholdSec.trim()) {
      dwellThresholdSec = Number(form.dwellThresholdSec);
      if (
        !Number.isInteger(dwellThresholdSec) ||
        dwellThresholdSec < 1 ||
        dwellThresholdSec > 86_400
      ) {
        next.dwellThresholdSec = '1–86400 seconds';
      }
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return null;

    const input: UpdateGeofenceInput = {
      name,
      type: form.type,
      active: form.active,
      color: form.color || undefined,
      category: form.category.trim() || undefined,
      linkedCustomerId: form.linkedCustomerId || undefined,
      alertOnEnter: form.alertOnEnter,
      alertOnExit: form.alertOnExit,
      dwellThresholdSec,
    };

    if (form.type === 'CIRCLE') {
      input.centerLat = Number(form.centerLat);
      input.centerLng = Number(form.centerLng);
      input.radiusM = Number(form.radiusM);
    } else {
      input.polygon = polygon;
    }
    return input;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fence) return;
    const input = validate();
    if (!input) return;
    try {
      await update.mutateAsync({ id: fence.id, input });
      toast.success('Geofence updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, 'Failed to update geofence'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit geofence</SheetTitle>
          <SheetDescription>
            Patch name, geometry, alerts, and linkage. Archived fences must be
            restored before editing.
          </SheetDescription>
        </SheetHeader>

        {form ? (
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="mt-4 space-y-3"
          >
            <Field label="Name" error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, name: e.target.value } : f))
                }
                maxLength={120}
              />
            </Field>

            <Field label="Type">
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) =>
                    f
                      ? { ...f, type: e.target.value as GeofenceType }
                      : f,
                  )
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="CIRCLE">Circle</option>
                <option value="POLYGON">Polygon</option>
              </select>
            </Field>

            {form.type === 'CIRCLE' ? (
              <>
                <Field label="Center latitude" error={errors.centerLat}>
                  <Input
                    value={form.centerLat}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, centerLat: e.target.value } : f,
                      )
                    }
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Center longitude" error={errors.centerLng}>
                  <Input
                    value={form.centerLng}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, centerLng: e.target.value } : f,
                      )
                    }
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Radius (meters)" error={errors.radiusM}>
                  <Input
                    value={form.radiusM}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, radiusM: e.target.value } : f,
                      )
                    }
                    inputMode="decimal"
                  />
                </Field>
              </>
            ) : (
              <Field
                label="Polygon vertices (JSON)"
                error={errors.polygonText}
              >
                <textarea
                  value={form.polygonText}
                  onChange={(e) =>
                    setForm((f) =>
                      f ? { ...f, polygonText: e.target.value } : f,
                    )
                  }
                  rows={5}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
                />
              </Field>
            )}

            <Field label="Color" error={errors.color}>
              <Input
                value={form.color}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, color: e.target.value } : f))
                }
              />
            </Field>

            <Field label="Category">
              <Input
                value={form.category}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, category: e.target.value } : f,
                  )
                }
                maxLength={40}
              />
            </Field>

            <Field label="Linked customer">
              <select
                value={form.linkedCustomerId}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, linkedCustomerId: e.target.value } : f,
                  )
                }
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="">None</option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Dwell threshold (seconds)"
              error={errors.dwellThresholdSec}
            >
              <Input
                value={form.dwellThresholdSec}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, dwellThresholdSec: e.target.value } : f,
                  )
                }
                inputMode="numeric"
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, active: e.target.checked } : f,
                  )
                }
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.alertOnEnter}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, alertOnEnter: e.target.checked } : f,
                  )
                }
              />
              Alert on enter
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.alertOnExit}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, alertOnExit: e.target.checked } : f,
                  )
                }
              />
              Alert on exit
            </label>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={update.isPending}
              >
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
