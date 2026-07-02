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

export type InvoiceStatus = "sent" | "partially_paid" | "paid" | "overdue";

export type PaymentMethod = "bank_transfer" | "cash" | "card";

export type ExpenseCategory =
  | "fuel"
  | "driver_advance"
  | "toll"
  | "repair"
  | "loading"
  | "other";

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

export interface Customer {
  id: string;
  name: string;
  industry: string;
  city: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  usualRoutes: string[];
  notes?: string;
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
  method: PaymentMethod;
  paidAt: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  orderId: string;
  amount: number;
  issuedAt: string;
  dueAt: string;
  payments: Payment[];
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  orderId?: string;
  vehicleId?: string;
  driverId?: string;
  notes?: string;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  expenses: number;
}
