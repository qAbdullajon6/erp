export type OrderStatus =
  | "pending"
  | "assigned"
  | "in_transit"
  | "delivered"
  | "delayed"
  | "cancelled";

export type DriverStatus = "available" | "on_delivery" | "off_duty";

export type InvoiceStatus = "paid" | "pending" | "overdue";

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  type: "Truck" | "Van" | "Refrigerated Truck";
  capacityTons: number;
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
}

export interface Customer {
  id: string;
  name: string;
  industry: string;
  city: string;
  totalOrders: number;
  outstandingBalance: number;
  lifetimeValue: number;
}

export interface Order {
  id: string;
  customerId: string;
  origin: string;
  destination: string;
  driverId: string | null;
  status: OrderStatus;
  amount: number;
  createdAt: string;
  eta: string;
  cargo: string;
  weightTons: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  orderId: string;
  amount: number;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  expenses: number;
}
