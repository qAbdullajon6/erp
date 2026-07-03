export type OrderStatus =
  | "draft"
  | "pending"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled";

export type DriverStatus = "available" | "on_delivery" | "off_duty";

export type VehicleStatus = "available" | "on_delivery" | "maintenance" | "inactive";

export type Currency = "USD" | "UZS";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

// Only "draft" and "cancelled" are ever stored (as Invoice.manualStatus) —
// every other status is derived from payments vs amount vs due date.
export type InvoiceManualStatus = "draft" | "cancelled";

export type PaymentMethod = "bank_transfer" | "cash" | "card" | "other";

export type ExpenseCategory =
  | "fuel"
  | "driver_advance"
  | "toll"
  | "maintenance"
  | "loading"
  | "insurance"
  | "other";

export type ExpenseApprovalStatus = "pending" | "approved" | "rejected";

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  type: "Truck" | "Van" | "Refrigerated Truck" | "Container Truck";
  capacityTons: number;
  status: VehicleStatus;
  lastMaintenanceAt: string;
  nextMaintenanceAt: string;
}

export interface Driver {
  id: string;
  name: string;
  avatarUrl?: string;
  phone: string;
  status: DriverStatus;
  rating: number;
  vehicleId: string;
  completedDeliveries: number;
  onTimeRate: number;
  licenseNumber: string;
  licenseExpiresAt: string;
  notes?: string;
}

export type CustomerStatus = "active" | "at_risk" | "inactive" | "archived";

export type PaymentTerms = "due_on_receipt" | "net_15" | "net_30" | "net_45";

export interface Customer {
  id: string;
  name: string;
  industry: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  taxId?: string;
  paymentTerms: PaymentTerms;
  creditLimit: number;
  usualRoutes: string[];
  deliveryNotes?: string;
  internalNotes?: string;
  status: CustomerStatus;
  createdAt: string;
  archivedAt?: string;
}

export interface CustomerNote {
  id: string;
  customerId: string;
  text: string;
  at: string;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  at: string;
}

export interface Order {
  id: string;
  customerId: string;
  contactPerson: string;
  cargo: string;
  weightTons: number;
  packageCount: number;
  origin: string;
  destination: string;
  pickupDate: string;
  deliveryDate: string;
  amount: number;
  operator: string;
  driverId: string | null;
  vehicleId: string | null;
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];
  notes?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  paidAt: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  orderId?: string;
  currency: Currency;
  subtotal: number;
  discount: number;
  taxRate: number;
  /** subtotal - discount + tax, i.e. the total amount due */
  amount: number;
  manualStatus?: InvoiceManualStatus;
  issuedAt: string;
  dueAt: string;
  payments: Payment[];
  notes?: string;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  currency: Currency;
  date: string;
  orderId?: string;
  vehicleId?: string;
  driverId?: string;
  payee?: string;
  receiptRef?: string;
  approvalStatus: ExpenseApprovalStatus;
  notes?: string;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  expenses: number;
}
