'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useCreateOrder, useCheckDuplicateOrder, type CreateOrderInput, type Order } from '@/lib/api/orders';
import { useCustomersList } from '@/lib/api/customers';
import { useCurrentUser } from '@/lib/api/auth';
import { CUSTOMER_WRITE_ROLES } from '@/lib/role-access';
import type { MembershipRole } from '@/lib/api/organizations';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  CURRENCIES,
  Field,
  DateField,
  dayAfter,
  validateOrderField,
  validateOrderFields,
  type OrderSectionKey,
} from '@/components/orders/order-form-shared';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Check,
  ChevronsUpDown,
  MapPin,
  Package,
  StickyNote,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { describeError } from '@/lib/api/describe-error';

type SectionKey = OrderSectionKey;

const FIELD_SECTION: Record<string, SectionKey> = {
  customerId: 'customer',
  pickupAddress: 'pickup',
  pickupCity: 'pickup',
  pickupDate: 'pickup',
  deliveryAddress: 'delivery',
  deliveryCity: 'delivery',
  deliveryDate: 'delivery',
  cargoDescription: 'cargo',
  cargoWeightKg: 'cargo',
  cargoVolumeM3: 'cargo',
  price: 'pricing',
  currency: 'pricing',
  notes: 'notes',
  deliveryNotes: 'notes',
};

interface Errors {
  [key: string]: string;
}

const ALL_FIELDS = Object.keys(FIELD_SECTION);

function validateAll(data: CreateOrderInput): Errors {
  return validateOrderFields(ALL_FIELDS, data);
}

const EMPTY_FORM: CreateOrderInput = {
  customerId: '',
  pickupAddress: '',
  pickupCity: '',
  pickupDate: '',
  deliveryAddress: '',
  deliveryCity: '',
  deliveryDate: '',
  cargoDescription: '',
  price: 0,
  currency: 'USD',
};

function SectionTitle({
  icon: Icon,
  title,
  errorCount,
  id,
}: {
  icon: typeof MapPin;
  title: string;
  errorCount: number;
  id: string;
}) {
  return (
    <div id={id} className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md',
          errorCount > 0 ? 'bg-destructive/10 text-destructive' : 'bg-brand/10 text-brand',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {errorCount > 0 && (
        <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
          {errorCount} {errorCount === 1 ? 'issue' : 'issues'}
        </Badge>
      )}
    </div>
  );
}

interface OrdersCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (order: Order) => void;
  /// Pre-selects a customer when the sheet opens — used when the sheet is
  /// launched from a customer's own detail page, where re-picking them from
  /// the dropdown would just repeat what the admin already navigated from.
  defaultCustomerId?: string;
}

export function OrdersCreateSheet({ open, onOpenChange, onCreated, defaultCustomerId }: OrdersCreateSheetProps) {
  const { create, loading } = useCreateOrder();
  const { check, loading: checkingDuplicate } = useCheckDuplicateOrder();
  const { data: currentUser } = useCurrentUser();
  const canCreateCustomer = Boolean(
    currentUser && CUSTOMER_WRITE_ROLES.includes(currentUser.membership.role as MembershipRole),
  );

  const { data: customers, loading: customersLoading } = useCustomersList(
    { status: 'ACTIVE', limit: 100 },
    { enabled: open },
  );

  const [formData, setFormData] = useState<CreateOrderInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [customerOpen, setCustomerOpen] = useState(false);
  const [pastPickupConfirm, setPastPickupConfirm] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<Order[]>([]);
  const acknowledgeDuplicateRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setFormData(EMPTY_FORM);
      setErrors({});
      setTouched(new Set());
      acknowledgeDuplicateRef.current = false;
    } else if (defaultCustomerId) {
      setFormData((prev) => ({ ...prev, customerId: defaultCustomerId }));
    }
  }, [open, defaultCustomerId]);

  const setField = (field: keyof CreateOrderInput, value: string | number | undefined) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    setTouched((prev) => new Set(prev).add(field));
    // Live validation: re-check this field plus cross-field deps (dates).
    setErrors((prev) => {
      const out = { ...prev };
      for (const f of [field, 'deliveryDate'] as string[]) {
        const err = validateOrderField(f, next);
        if (err && (touched.has(f) || f === field)) out[f] = err;
        else delete out[f];
      }
      return out;
    });
  };

  const errorsBySection = useMemo(() => {
    const counts: Record<SectionKey, number> = {
      customer: 0,
      pickup: 0,
      delivery: 0,
      cargo: 0,
      pricing: 0,
      notes: 0,
    };
    for (const field of Object.keys(errors)) {
      const section = FIELD_SECTION[field];
      if (section) counts[section] += 1;
    }
    return counts;
  }, [errors]);

  const selectedCustomer = customers.find((c) => c.id === formData.customerId);
  const noCustomers = !customersLoading && customers.length === 0;
  const hasRoute = formData.pickupCity && formData.deliveryCity;

  const submitOrder = async (acknowledgeDuplicate = false) => {
    try {
      const payload: CreateOrderInput = acknowledgeDuplicate
        ? { ...formData, acknowledgeDuplicate: true }
        : formData;
      const result = await create(payload);
      toast.success(`Order ${result.orderNumber} created`);
      onOpenChange(false);
      onCreated?.(result);
    } catch (err) {
      toast.error(describeError(err, 'Failed to create order'));
    }
  };

  const proceedAfterDuplicateCheck = async () => {
    const pickup = new Date(`${formData.pickupDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (pickup < today) {
      setPastPickupConfirm(true);
      return;
    }
    await submitOrder(true);
  };

  const handleSubmit = async () => {
    const allErrors = validateAll(formData);
    setErrors(allErrors);
    setTouched(new Set(ALL_FIELDS));

    if (Object.keys(allErrors).length > 0) {
      const firstField = ALL_FIELDS.find((f) => allErrors[f]);
      toast.error('Fix the highlighted fields');
      requestAnimationFrame(() => {
        const el = bodyRef.current?.querySelector(
          `[data-field="${firstField}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el?.querySelector('input,textarea,button') as HTMLElement | null)?.focus?.();
      });
      return;
    }

    try {
      const dup = await check(formData);
      if (dup.possibleDuplicate && dup.matches.length > 0) {
        setDuplicateMatches(dup.matches);
        setDuplicateConfirm(true);
        return;
      }
    } catch {
      // Non-blocking — proceed if duplicate check fails
    }

    const pickup = new Date(`${formData.pickupDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (pickup < today) {
      setPastPickupConfirm(true);
      return;
    }
    await submitOrder();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[780px]"
        data-testid="orders-create-sheet"
      >
        <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
          <SheetTitle className="text-base">New Order</SheetTitle>
          <SheetDescription className="text-xs">
            Book a shipment — the list stays behind this panel.
          </SheetDescription>
        </SheetHeader>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          <div className="space-y-6">
            {/* ---------------- Customer ---------------- */}
            <section className="space-y-3">
              <SectionTitle
                id="section-customer"
                icon={Building2}
                title="Customer"
                errorCount={errorsBySection.customer}
              />
              {noCustomers ? (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  <p className="text-foreground">No active customers yet.</p>
                  {canCreateCustomer ? (
                    <Button asChild size="sm" variant="outline" className="mt-2">
                      <Link to="/app/customers/create">Create customer</Link>
                    </Button>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ask an Admin or Sales manager to add the customer first.
                    </p>
                  )}
                </div>
              ) : (
                <Field
                  id="customerId"
                  label="Customer"
                  required
                  error={errors.customerId}
                  className="max-w-md"
                >
                  <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="customerId"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerOpen}
                        aria-invalid={Boolean(errors.customerId)}
                        data-testid="orders-customer-select"
                        className={cn(
                          'h-9 w-full justify-between px-3 text-sm font-normal',
                          !selectedCustomer && 'text-muted-foreground',
                          errors.customerId && 'border-destructive',
                        )}
                      >
                        <span className="truncate">
                          {customersLoading
                            ? 'Loading customers…'
                            : selectedCustomer
                              ? `${selectedCustomer.companyName} (${selectedCustomer.contactName})`
                              : 'Select a customer'}
                        </span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search company, contact, code…" />
                        <CommandList>
                          <CommandEmpty>No customer found.</CommandEmpty>
                          <CommandGroup>
                            {customers.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={`${c.companyName} ${c.contactName} ${c.customerCode ?? ''}`}
                                onSelect={() => {
                                  setField('customerId', c.id);
                                  setCustomerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-3.5 w-3.5',
                                    formData.customerId === c.id ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm">{c.companyName}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {c.contactName}
                                    {c.customerCode ? ` · ${c.customerCode}` : ''}
                                  </p>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </Field>
              )}
            </section>

            <Separator />

            {/* ---------------- Pickup + Delivery ---------------- */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <section className="space-y-3">
                <SectionTitle
                  id="section-pickup"
                  icon={MapPin}
                  title="Pickup"
                  errorCount={errorsBySection.pickup}
                />
                <Field id="pickupCity" label="City" required error={errors.pickupCity}>
                  <Input
                    id="pickupCity"
                    value={formData.pickupCity}
                    onChange={(e) => setField('pickupCity', e.target.value)}
                    placeholder="Tashkent"
                    maxLength={100}
                    autoComplete="off"
                    aria-invalid={Boolean(errors.pickupCity)}
                    className={cn('h-9', errors.pickupCity && 'border-destructive')}
                    data-testid="orders-pickup-city"
                  />
                </Field>
                <Field id="pickupAddress" label="Address" required error={errors.pickupAddress}>
                  <Input
                    id="pickupAddress"
                    value={formData.pickupAddress}
                    onChange={(e) => setField('pickupAddress', e.target.value)}
                    placeholder="Street, warehouse, gate…"
                    maxLength={300}
                    autoComplete="off"
                    aria-invalid={Boolean(errors.pickupAddress)}
                    className={cn('h-9', errors.pickupAddress && 'border-destructive')}
                    data-testid="orders-pickup-address"
                  />
                </Field>
                <DateField
                  id="pickupDate"
                  testId="orders-pickupDate"
                  label="Date"
                  required
                  error={errors.pickupDate}
                  value={formData.pickupDate}
                  onChange={(iso) => setField('pickupDate', iso)}
                />
              </section>

              <section className="space-y-3 border-t border-border/60 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                <SectionTitle
                  id="section-delivery"
                  icon={MapPin}
                  title="Delivery"
                  errorCount={errorsBySection.delivery}
                />
                <Field id="deliveryCity" label="City" required error={errors.deliveryCity}>
                  <Input
                    id="deliveryCity"
                    value={formData.deliveryCity}
                    onChange={(e) => setField('deliveryCity', e.target.value)}
                    placeholder="Andijan"
                    maxLength={100}
                    autoComplete="off"
                    aria-invalid={Boolean(errors.deliveryCity)}
                    className={cn('h-9', errors.deliveryCity && 'border-destructive')}
                    data-testid="orders-delivery-city"
                  />
                </Field>
                <Field id="deliveryAddress" label="Address" required error={errors.deliveryAddress}>
                  <Input
                    id="deliveryAddress"
                    value={formData.deliveryAddress}
                    onChange={(e) => setField('deliveryAddress', e.target.value)}
                    placeholder="Street, receiver, dock…"
                    maxLength={300}
                    autoComplete="off"
                    aria-invalid={Boolean(errors.deliveryAddress)}
                    className={cn('h-9', errors.deliveryAddress && 'border-destructive')}
                    data-testid="orders-delivery-address"
                  />
                </Field>
                <DateField
                  id="deliveryDate"
                  testId="orders-deliveryDate"
                  label="Date"
                  required
                  error={errors.deliveryDate}
                  value={formData.deliveryDate}
                  onChange={(iso) => setField('deliveryDate', iso)}
                  disabledBefore={formData.pickupDate ? dayAfter(formData.pickupDate) : undefined}
                />
              </section>
            </div>

            <Separator />

            {/* ---------------- Cargo ---------------- */}
            <section className="space-y-3">
              <SectionTitle
                id="section-cargo"
                icon={Package}
                title="Cargo"
                errorCount={errorsBySection.cargo}
              />
              <Field
                id="cargoDescription"
                label="Description"
                required
                error={errors.cargoDescription}
              >
                <Textarea
                  id="cargoDescription"
                  value={formData.cargoDescription}
                  onChange={(e) => setField('cargoDescription', e.target.value)}
                  placeholder="What is being transported"
                  maxLength={2000}
                  rows={2}
                  aria-invalid={Boolean(errors.cargoDescription)}
                  className={cn(errors.cargoDescription && 'border-destructive')}
                  data-testid="orders-cargo-description"
                />
              </Field>
              <div className="grid max-w-md grid-cols-2 gap-3">
                <Field id="cargoWeightKg" label="Weight (kg)" error={errors.cargoWeightKg}>
                  <Input
                    id="cargoWeightKg"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.cargoWeightKg ?? ''}
                    onChange={(e) =>
                      setField(
                        'cargoWeightKg',
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    aria-invalid={Boolean(errors.cargoWeightKg)}
                    className={cn('h-9', errors.cargoWeightKg && 'border-destructive')}
                    data-testid="orders-cargo-weight"
                  />
                </Field>
                <Field id="cargoVolumeM3" label="Volume (m³)" error={errors.cargoVolumeM3}>
                  <Input
                    id="cargoVolumeM3"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.cargoVolumeM3 ?? ''}
                    onChange={(e) =>
                      setField(
                        'cargoVolumeM3',
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    aria-invalid={Boolean(errors.cargoVolumeM3)}
                    className={cn('h-9', errors.cargoVolumeM3 && 'border-destructive')}
                    data-testid="orders-cargo-volume"
                  />
                </Field>
              </div>
            </section>

            <Separator />

            {/* ---------------- Pricing ---------------- */}
            <section className="space-y-3">
              <SectionTitle
                id="section-pricing"
                icon={Wallet}
                title="Pricing"
                errorCount={errorsBySection.pricing}
              />
              <div className="grid max-w-md grid-cols-[1fr_140px] gap-3">
                <Field id="price" label="Customer price" required error={errors.price}>
                  <Input
                    id="price"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formData.price || ''}
                    onChange={(e) => setField('price', e.target.value ? parseFloat(e.target.value) : 0)}
                    aria-invalid={Boolean(errors.price)}
                    className={cn('h-9', errors.price && 'border-destructive')}
                    data-testid="orders-price"
                  />
                </Field>
                <Field id="currency" label="Currency" error={errors.currency}>
                  <Select
                    value={formData.currency || 'USD'}
                    onValueChange={(v) => setField('currency', v)}
                  >
                    <SelectTrigger id="currency" className="h-9" data-testid="orders-currency">
                      <SelectValue placeholder="USD" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>

            <Separator />

            {/* ---------------- Notes ---------------- */}
            <section className="space-y-3 pb-2">
              <SectionTitle
                id="section-notes"
                icon={StickyNote}
                title="Notes"
                errorCount={errorsBySection.notes}
              />
              <Field id="notes" label="Internal notes" error={errors.notes}>
                <Textarea
                  id="notes"
                  value={formData.notes ?? ''}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Visible to your team only"
                  maxLength={2000}
                  rows={3}
                  data-testid="orders-notes"
                />
              </Field>
              <Field id="deliveryNotes" label="Delivery instructions" error={errors.deliveryNotes}>
                <Textarea
                  id="deliveryNotes"
                  value={formData.deliveryNotes ?? ''}
                  onChange={(e) => setField('deliveryNotes', e.target.value)}
                  placeholder="Special instructions for the driver at delivery"
                  maxLength={2000}
                  rows={3}
                  data-testid="orders-delivery-notes"
                />
              </Field>
            </section>
          </div>
        </div>

        {/* ---------------- Sticky footer ---------------- */}
        <div className="shrink-0 border-t border-border bg-surface/95 px-6 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <div className="flex items-center gap-3">
              {hasRoute && (
                <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <span className="font-medium text-foreground">{formData.pickupCity}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium text-foreground">{formData.deliveryCity}</span>
                  {formData.price > 0 && (
                    <span className="ml-1 font-semibold tabular-nums text-foreground">
                      {formatMoney(formData.price, formData.currency || 'USD')}
                    </span>
                  )}
                </span>
              )}
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading || checkingDuplicate || noCustomers}
                className="bg-gradient-brand text-brand-foreground hover:opacity-90"
                data-testid="orders-submit-button"
              >
                {loading || checkingDuplicate ? 'Creating…' : 'Create Order'}
              </Button>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={pastPickupConfirm}
          onOpenChange={setPastPickupConfirm}
          title="Pickup date is in the past"
          description="This order will appear overdue immediately. Create anyway?"
          confirmLabel="Create anyway"
          onConfirm={() => {
            setPastPickupConfirm(false);
            void submitOrder(acknowledgeDuplicateRef.current);
          }}
        />

        <ConfirmDialog
          open={duplicateConfirm}
          onOpenChange={setDuplicateConfirm}
          title="Possible duplicate order detected"
          description={
            duplicateMatches.length > 0
              ? `Similar order${duplicateMatches.length === 1 ? '' : 's'} created recently: ${duplicateMatches.map((m) => m.orderNumber).join(', ')}. You can still proceed.`
              : 'A similar order was created in the last 24 hours. You can still proceed.'
          }
          confirmLabel="Create anyway"
          onConfirm={() => {
            setDuplicateConfirm(false);
            acknowledgeDuplicateRef.current = true;
            void proceedAfterDuplicateCheck();
          }}
        >
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Possible duplicate order detected — review the matches above before continuing.</span>
          </div>
        </ConfirmDialog>
      </SheetContent>
    </Sheet>
  );
}
