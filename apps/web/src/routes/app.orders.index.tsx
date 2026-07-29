import { createFileRoute } from "@tanstack/react-router";
import { OrdersList } from "@/components/orders/orders-list";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { ALL_STAFF_ROLES } from "@/lib/role-access";
import type { OrderPaymentStatus, OrderStatus } from "@/lib/api/orders";

export type OrdersSearch = {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  tab?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /// Opens the New Order sheet when true (and when /app/orders/create redirects here).
  create?: boolean;
  customerId?: string;
  driverId?: string;
  vehicleId?: string;
  dispatcherId?: string;
  pickupDateFrom?: string;
  pickupDateTo?: string;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  createdFrom?: string;
  createdTo?: string;
  priceMin?: number;
  priceMax?: number;
  paymentStatus?: OrderPaymentStatus;
  archivedOnly?: boolean;
};

const ORDER_STATUSES = new Set([
  "DRAFT",
  "PENDING",
  "ASSIGNED",
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
]);

const PAYMENT_STATUSES = new Set(["UNPAID", "PARTIAL", "PAID", "NO_INVOICE"]);

function parseOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalBool(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return undefined;
}

export const Route = createFileRoute("/app/orders/")({
  validateSearch: (search: Record<string, unknown>): OrdersSearch => {
    const out: OrdersSearch = {};
    if (search.page != null && search.page !== "") {
      const page = typeof search.page === "number" ? search.page : Number(search.page);
      if (Number.isFinite(page) && page > 0) out.page = page;
    }
    const limit = parseOptionalNumber(search.limit);
    if (limit !== undefined && limit >= 1 && limit <= 100) out.limit = limit;

    if (typeof search.search === "string" && search.search) out.search = search.search;
    if (typeof search.status === "string" && ORDER_STATUSES.has(search.status)) {
      out.status = search.status as OrderStatus;
    }
    if (typeof search.tab === "string" && search.tab) out.tab = search.tab;
    if (typeof search.sortBy === "string" && search.sortBy) out.sortBy = search.sortBy;
    if (search.sortOrder === "asc" || search.sortOrder === "desc") out.sortOrder = search.sortOrder;
    if (search.create === true || search.create === "true") out.create = true;

    if (typeof search.customerId === "string" && search.customerId) out.customerId = search.customerId;
    if (typeof search.driverId === "string" && search.driverId) out.driverId = search.driverId;
    if (typeof search.vehicleId === "string" && search.vehicleId) out.vehicleId = search.vehicleId;
    if (typeof search.dispatcherId === "string" && search.dispatcherId) {
      out.dispatcherId = search.dispatcherId;
    }
    if (typeof search.pickupDateFrom === "string" && search.pickupDateFrom) {
      out.pickupDateFrom = search.pickupDateFrom;
    }
    if (typeof search.pickupDateTo === "string" && search.pickupDateTo) out.pickupDateTo = search.pickupDateTo;
    if (typeof search.deliveryDateFrom === "string" && search.deliveryDateFrom) {
      out.deliveryDateFrom = search.deliveryDateFrom;
    }
    if (typeof search.deliveryDateTo === "string" && search.deliveryDateTo) {
      out.deliveryDateTo = search.deliveryDateTo;
    }
    if (typeof search.createdFrom === "string" && search.createdFrom) out.createdFrom = search.createdFrom;
    if (typeof search.createdTo === "string" && search.createdTo) out.createdTo = search.createdTo;

    const priceMin = parseOptionalNumber(search.priceMin);
    if (priceMin !== undefined && priceMin >= 0) out.priceMin = priceMin;
    const priceMax = parseOptionalNumber(search.priceMax);
    if (priceMax !== undefined && priceMax >= 0) out.priceMax = priceMax;

    if (typeof search.paymentStatus === "string" && PAYMENT_STATUSES.has(search.paymentStatus)) {
      out.paymentStatus = search.paymentStatus as OrderPaymentStatus;
    }
    const archivedOnly = parseOptionalBool(search.archivedOnly);
    if (archivedOnly) out.archivedOnly = true;

    return out;
  },
  component: OrdersPage,
});

function OrdersPage() {
  return (
    <ProtectedApiRoute requireRoles={ALL_STAFF_ROLES}>
      <OrdersList />
    </ProtectedApiRoute>
  );
}
