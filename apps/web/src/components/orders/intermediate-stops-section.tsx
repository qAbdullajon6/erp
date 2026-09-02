'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, GripVertical, MapPin, Plus, Trash2 } from 'lucide-react';
import type { OrderStopInput } from '@/lib/api/orders';
import { Field, validateStopField, type StopFormValues } from './order-form-shared';

export type { OrderStopInput };

export const STOP_FIELDS = [
  'address',
  'city',
  'postalCode',
  'countryCode',
  'placeName',
  'contactName',
  'contactPhone',
  'instructions',
  'windowStart',
  'windowEnd',
] as const;

export const EMPTY_STOP: OrderStopInput = {
  address: '',
  city: '',
};

interface StopErrors {
  [field: string]: string;
}

interface Props {
  stops: OrderStopInput[];
  errors: Record<string, StopErrors>;
  touched: Record<string, Set<string>>;
  onChange: (stops: OrderStopInput[]) => void;
  onTouch: (index: number, field: string) => void;
}

function StopCard({
  stop,
  index,
  total,
  errors,
  onChange,
  onTouch,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  stop: OrderStopInput;
  index: number;
  total: number;
  errors: StopErrors;
  touched: Set<string>;
  onChange: (updated: OrderStopInput) => void;
  onTouch: (field: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const setField = (field: keyof OrderStopInput, value: string) => {
    onTouch(field);
    onChange({ ...stop, [field]: value });
  };

  const errorCount = Object.keys(errors).length;

  return (
    <div className={cn('rounded-lg border bg-muted/20 p-3', errorCount > 0 ? 'border-destructive/40' : 'border-border')}>
      <div className="mb-3 flex items-center gap-2">
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">
          {index + 1}
        </span>
        <span className="flex-1 text-xs font-medium text-muted-foreground">
          {stop.city ? `${stop.city}${stop.address ? ` — ${stop.address.slice(0, 30)}` : ''}` : `Stop ${index + 1}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={index === 0}
            onClick={onMoveUp}
            className="h-6 w-6"
            aria-label="Move stop up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="h-6 w-6"
            aria-label="Move stop down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onRemove}
            className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Remove stop"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field id={`stop-${index}-city`} label="City" required error={errors.city}>
          <Input
            id={`stop-${index}-city`}
            value={stop.city}
            onChange={(e) => setField('city', e.target.value)}
            onBlur={() => onTouch('city')}
            placeholder="City"
            maxLength={100}
            autoComplete="off"
            aria-invalid={Boolean(errors.city)}
            className={cn('h-9', errors.city && 'border-destructive')}
            data-testid={`stop-${index}-city`}
          />
        </Field>
        <Field id={`stop-${index}-address`} label="Address" required error={errors.address}>
          <Input
            id={`stop-${index}-address`}
            value={stop.address}
            onChange={(e) => setField('address', e.target.value)}
            onBlur={() => onTouch('address')}
            placeholder="Street, warehouse…"
            maxLength={300}
            autoComplete="off"
            aria-invalid={Boolean(errors.address)}
            className={cn('h-9', errors.address && 'border-destructive')}
            data-testid={`stop-${index}-address`}
          />
        </Field>
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="mt-2">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-180')}
            />
            Advanced details
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field id={`stop-${index}-postalCode`} label="Postal code" error={errors.postalCode}>
              <Input
                id={`stop-${index}-postalCode`}
                value={stop.postalCode ?? ''}
                onChange={(e) => setField('postalCode', e.target.value)}
                placeholder="100000"
                maxLength={20}
                className={cn('h-9', errors.postalCode && 'border-destructive')}
              />
            </Field>
            <Field id={`stop-${index}-countryCode`} label="Country" error={errors.countryCode}>
              <Input
                id={`stop-${index}-countryCode`}
                value={stop.countryCode ?? ''}
                onChange={(e) => setField('countryCode', e.target.value.toUpperCase())}
                placeholder="UZ"
                maxLength={2}
                className={cn('h-9 uppercase', errors.countryCode && 'border-destructive')}
              />
            </Field>
          </div>
          <Field id={`stop-${index}-placeName`} label="Place name" error={errors.placeName}>
            <Input
              id={`stop-${index}-placeName`}
              value={stop.placeName ?? ''}
              onChange={(e) => setField('placeName', e.target.value)}
              placeholder="Warehouse A, Terminal 2…"
              maxLength={200}
              className={cn('h-9', errors.placeName && 'border-destructive')}
            />
          </Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field id={`stop-${index}-contactName`} label="Contact name" error={errors.contactName}>
              <Input
                id={`stop-${index}-contactName`}
                value={stop.contactName ?? ''}
                onChange={(e) => setField('contactName', e.target.value)}
                maxLength={200}
                className={cn('h-9', errors.contactName && 'border-destructive')}
              />
            </Field>
            <Field id={`stop-${index}-contactPhone`} label="Contact phone" error={errors.contactPhone}>
              <Input
                id={`stop-${index}-contactPhone`}
                value={stop.contactPhone ?? ''}
                onChange={(e) => setField('contactPhone', e.target.value)}
                maxLength={50}
                className={cn('h-9', errors.contactPhone && 'border-destructive')}
              />
            </Field>
          </div>
          <Field id={`stop-${index}-instructions`} label="Instructions" error={errors.instructions}>
            <Textarea
              id={`stop-${index}-instructions`}
              value={stop.instructions ?? ''}
              onChange={(e) => setField('instructions', e.target.value)}
              maxLength={1000}
              rows={2}
              className={cn(errors.instructions && 'border-destructive')}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field id={`stop-${index}-windowStart`} label="Window start" error={errors.windowStart}>
              <Input
                id={`stop-${index}-windowStart`}
                type="time"
                value={stop.windowStart ? new Date(stop.windowStart).toISOString().slice(11, 16) : ''}
                onChange={(e) => {
                  if (!e.target.value) { setField('windowStart', ''); return; }
                  const base = new Date();
                  const [h, m] = e.target.value.split(':').map(Number);
                  base.setHours(h, m, 0, 0);
                  setField('windowStart', base.toISOString());
                }}
                className={cn('h-9', errors.windowStart && 'border-destructive')}
              />
            </Field>
            <Field id={`stop-${index}-windowEnd`} label="Window end" error={errors.windowEnd}>
              <Input
                id={`stop-${index}-windowEnd`}
                type="time"
                value={stop.windowEnd ? new Date(stop.windowEnd).toISOString().slice(11, 16) : ''}
                onChange={(e) => {
                  if (!e.target.value) { setField('windowEnd', ''); return; }
                  const base = new Date();
                  const [h, m] = e.target.value.split(':').map(Number);
                  base.setHours(h, m, 0, 0);
                  setField('windowEnd', base.toISOString());
                }}
                className={cn('h-9', errors.windowEnd && 'border-destructive')}
              />
            </Field>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function validateStop(stop: StopFormValues, fields: readonly string[]): StopErrors {
  const errs: StopErrors = {};
  for (const f of fields) {
    const err = validateStopField(f, stop);
    if (err) errs[f] = err;
  }
  return errs;
}

export function IntermediateStopsSection({ stops, errors, touched, onChange, onTouch }: Props) {
  const addStop = () => onChange([...stops, { ...EMPTY_STOP }]);

  const updateStop = (index: number, updated: OrderStopInput) => {
    const next = [...stops];
    next[index] = updated;
    onChange(next);
  };

  const removeStop = (index: number) => {
    onChange(stops.filter((_, i) => i !== index));
  };

  const moveStop = (index: number, direction: -1 | 1) => {
    const next = [...stops];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/10 text-brand">
          <MapPin className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">Intermediate stops</h3>
        {stops.length > 0 && (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
            {stops.length}
          </span>
        )}
      </div>

      {stops.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No intermediate stops. Add one if the driver needs to visit a location between pickup and delivery.
        </p>
      ) : (
        <div className="space-y-2">
          {stops.map((stop, i) => (
            <StopCard
              key={i}
              stop={stop}
              index={i}
              total={stops.length}
              errors={errors[i] ?? {}}
              touched={touched[i] ?? new Set()}
              onChange={(updated) => updateStop(i, updated)}
              onTouch={(field) => onTouch(i, field)}
              onRemove={() => removeStop(i)}
              onMoveUp={() => moveStop(i, -1)}
              onMoveDown={() => moveStop(i, 1)}
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addStop}
        className="h-8 gap-1.5 text-xs"
        data-testid="add-intermediate-stop"
      >
        <Plus className="h-3.5 w-3.5" />
        Add stop
      </Button>
    </section>
  );
}
