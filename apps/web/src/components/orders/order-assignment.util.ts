import type { ApiDispatch } from '@/lib/api/dispatches';
import type { Driver } from '@/lib/api/drivers';
import type { Order } from '@/lib/api/orders';
import type { Vehicle } from '@/lib/api/vehicles';

/** ADR-001: projected order fields are empty while dispatch is DRAFT; UI reads dispatch. */
export function resolveEffectiveAssignment(
  order: Pick<Order, 'driverId' | 'vehicleId'>,
  dispatch: ApiDispatch | null | undefined,
) {
  const draftPlanned =
    dispatch?.status === 'DRAFT' && Boolean(dispatch.driverId && dispatch.vehicleId);
  const driverId = order.driverId ?? (draftPlanned ? dispatch!.driverId : null);
  const vehicleId = order.vehicleId ?? (draftPlanned ? dispatch!.vehicleId : null);
  const isDraftPlan = draftPlanned && !order.driverId;
  return { driverId, vehicleId, isDraftPlan };
}

export function hasEffectiveAssignment(
  order: Pick<Order, 'driverId' | 'vehicleId'>,
  dispatch: ApiDispatch | null | undefined,
): boolean {
  const { driverId, vehicleId } = resolveEffectiveAssignment(order, dispatch);
  return Boolean(driverId && vehicleId);
}

/** Map nested dispatch driver to Driver shape for assignment panels. */
export function driverFromDispatch(dispatch: ApiDispatch | null | undefined): Driver | null {
  const d = dispatch?.driver;
  if (!d) return null;
  return {
    id: d.id,
    organizationId: dispatch!.organizationId,
    employeeCode: d.employeeCode,
    firstName: d.firstName,
    lastName: d.lastName,
    phone: d.phone,
    email: null,
    status: d.status as Driver['status'],
    profilePhotoUrl: null,
    licenseNumber: null,
    licenseClass: null,
    licenseIssueDate: null,
    licenseExpiry: null,
    licenseEndorsements: null,
    employmentType: null,
    hireDate: null,
    department: null,
    baseLocation: null,
    workShift: null,
    preferredRegions: null,
    availableDays: null,
    driverNotes: null,
    internalNotes: null,
    emergencyContact: null,
    driverDocuments: [],
    userId: null,
    archivedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

export function vehicleFromDispatch(dispatch: ApiDispatch | null | undefined): Vehicle | null {
  const v = dispatch?.vehicle;
  if (!v) return null;
  return {
    id: v.id,
    organizationId: dispatch!.organizationId,
    vehicleCode: v.vehicleCode,
    plateNumber: v.plateNumber,
    type: v.type as Vehicle['type'],
    status: v.status as Vehicle['status'],
    capacityKg: null,
    capacityM3: null,
    year: null,
    make: null,
    model: null,
    insuranceExpiry: null,
    inspectionExpiry: null,
    vin: null,
    engineNumber: null,
    odometer: null,
    fuelType: null,
    transmission: null,
    axles: null,
    notes: null,
    archivedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}
