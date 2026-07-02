import type {
  DriverStatus,
  ExpenseCategory,
  InvoiceStatus,
  OrderStatus,
  PaymentMethod,
  VehicleStatus,
} from "@/lib/types";

export const orderStatusMeta: Record<
  OrderStatus,
  { label: string; badgeClass: string; dotColor: string }
> = {
  draft: {
    label: "Draft",
    badgeClass: "bg-muted text-muted-foreground border-transparent",
    dotColor: "var(--muted-foreground)",
  },
  pending: {
    label: "Pending",
    badgeClass: "bg-chart-3/10 text-chart-3 border-chart-3/20",
    dotColor: "var(--chart-3)",
  },
  assigned: {
    label: "Assigned",
    badgeClass: "bg-chart-5/10 text-chart-5 border-chart-5/20",
    dotColor: "var(--chart-5)",
  },
  picked_up: {
    label: "Picked Up",
    badgeClass: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    dotColor: "var(--chart-2)",
  },
  in_transit: {
    label: "In Transit",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    dotColor: "var(--primary)",
  },
  delivered: {
    label: "Delivered",
    badgeClass: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    dotColor: "var(--chart-2)",
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-muted text-muted-foreground border-transparent",
    dotColor: "var(--muted-foreground)",
  },
};

export const orderStatusOrder: OrderStatus[] = [
  "draft",
  "pending",
  "assigned",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
];

export const delayedStatusMeta = {
  label: "Delayed",
  badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
  dotColor: "var(--destructive)",
};

export const driverStatusMeta: Record<DriverStatus, { label: string; badgeClass: string }> = {
  available: { label: "Available", badgeClass: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
  on_delivery: { label: "On Delivery", badgeClass: "bg-primary/10 text-primary border-primary/20" },
  off_duty: { label: "Off Duty", badgeClass: "bg-muted text-muted-foreground border-transparent" },
};

export const vehicleStatusMeta: Record<VehicleStatus, { label: string; badgeClass: string }> = {
  available: { label: "Available", badgeClass: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
  on_delivery: { label: "On Delivery", badgeClass: "bg-primary/10 text-primary border-primary/20" },
  maintenance: { label: "Maintenance", badgeClass: "bg-chart-3/10 text-chart-3 border-chart-3/20" },
  inactive: { label: "Inactive", badgeClass: "bg-muted text-muted-foreground border-transparent" },
};

export const invoiceStatusMeta: Record<InvoiceStatus, { label: string; badgeClass: string }> = {
  sent: { label: "Sent", badgeClass: "bg-chart-5/10 text-chart-5 border-chart-5/20" },
  partially_paid: { label: "Partially Paid", badgeClass: "bg-chart-3/10 text-chart-3 border-chart-3/20" },
  paid: { label: "Paid", badgeClass: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
  overdue: { label: "Overdue", badgeClass: "bg-destructive/10 text-destructive border-destructive/20" },
};

export const paymentMethodMeta: Record<PaymentMethod, { label: string }> = {
  bank_transfer: { label: "Bank Transfer" },
  cash: { label: "Cash" },
  card: { label: "Card" },
};

export const expenseCategoryMeta: Record<ExpenseCategory, { label: string }> = {
  fuel: { label: "Fuel" },
  driver_advance: { label: "Driver Advance" },
  toll: { label: "Road Toll" },
  repair: { label: "Repair" },
  loading: { label: "Loading/Unloading" },
  other: { label: "Other" },
};

export const expenseCategoryOrder: ExpenseCategory[] = [
  "fuel",
  "driver_advance",
  "toll",
  "repair",
  "loading",
  "other",
];

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["pending", "cancelled"],
  pending: ["assigned", "cancelled"],
  assigned: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function nextStatusOptions(status: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[status];
}
