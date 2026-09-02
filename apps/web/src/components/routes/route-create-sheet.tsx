import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useCreateRouteMutation } from '@/lib/api/routes';
import { useAvailability } from '@/lib/api/availability';
import { CalendarDays, Loader2, Navigation, Truck, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const SELECT_CLASS =
  'w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50';

interface RouteCreateSheetProps {
  open: boolean;
  onClose: () => void;
}

export function RouteCreateSheet({ open, onClose }: RouteCreateSheetProps) {
  const navigate = useNavigate();
  const { mutate: createRoute, isPending } = useCreateRouteMutation();

  const today = new Date().toISOString().slice(0, 10);
  const [plannedDate, setPlannedDate] = useState(today);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: availability, loading: availLoading } = useAvailability({
    pickupDate: plannedDate,
    deliveryDate: plannedDate,
  });

  const validate = () => {
    const next: Record<string, string> = {};
    if (!plannedDate) next.plannedDate = 'Planned date is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createRoute(
      {
        plannedDate,
        driverId: driverId || undefined,
        vehicleId: vehicleId || undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (route) => {
          toast.success(`Route ${route.routeNumber} created`);
          handleClose();
          navigate({ to: '/app/routes/$routeId', params: { routeId: route.id } });
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create route'),
      },
    );
  };

  const handleClose = () => {
    setPlannedDate(today);
    setDriverId('');
    setVehicleId('');
    setNotes('');
    setErrors({});
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-brand" aria-hidden />
            New Route
          </SheetTitle>
          <SheetDescription>
            Create a route and add stops on the detail page.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto py-4 pr-1">
          {/* Planned date */}
          <div className="space-y-1.5">
            <Label htmlFor="rs-date" className="flex items-center gap-1.5 text-xs font-medium">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Planned Date <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rs-date"
              type="date"
              value={plannedDate}
              onChange={(e) => {
                setPlannedDate(e.target.value);
                setDriverId('');
                setVehicleId('');
              }}
              className={cn(errors.plannedDate && 'border-destructive')}
            />
            {errors.plannedDate && (
              <p className="text-xs text-destructive">{errors.plannedDate}</p>
            )}
          </div>

          {/* Driver */}
          <div className="space-y-1.5">
            <Label htmlFor="rs-driver" className="flex items-center gap-1.5 text-xs font-medium">
              <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Driver
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">Optional</span>
            </Label>
            <select
              id="rs-driver"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              disabled={availLoading || !plannedDate}
              className={SELECT_CLASS}
            >
              <option value="">
                {availLoading ? 'Loading drivers…' : '— No driver —'}
              </option>
              {availability?.drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName} · {d.employeeCode}
                </option>
              ))}
            </select>
            {availability && availability.drivers.length === 0 && (
              <p className="text-xs text-muted-foreground">No drivers available on this date.</p>
            )}
          </div>

          {/* Vehicle */}
          <div className="space-y-1.5">
            <Label htmlFor="rs-vehicle" className="flex items-center gap-1.5 text-xs font-medium">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              Vehicle
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">Optional</span>
            </Label>
            <select
              id="rs-vehicle"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              disabled={availLoading || !plannedDate}
              className={SELECT_CLASS}
            >
              <option value="">
                {availLoading ? 'Loading vehicles…' : '— No vehicle —'}
              </option>
              {availability?.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNumber} · {v.vehicleCode} · {v.type}
                </option>
              ))}
            </select>
            {availability && availability.vehicles.length === 0 && (
              <p className="text-xs text-muted-foreground">No vehicles available on this date.</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="rs-notes" className="flex items-center gap-1.5 text-xs font-medium">
              Notes
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">Optional</span>
            </Label>
            <Textarea
              id="rs-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this route…"
              rows={3}
            />
          </div>
        </div>

        <div className="shrink-0 flex gap-2 border-t border-border/40 pt-4">
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 gap-2"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {isPending ? 'Creating…' : 'Create Route'}
          </Button>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
