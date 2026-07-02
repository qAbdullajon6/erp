"use client";

import * as React from "react";
import {
  drivers as seedDrivers,
  expenses as seedExpenses,
  invoices as seedInvoices,
  orders as seedOrders,
  vehicles as seedVehicles,
} from "@/lib/mock-data";
import type {
  Driver,
  Expense,
  ExpenseCategory,
  Invoice,
  Order,
  OrderStatus,
  PaymentMethod,
  Vehicle,
} from "@/lib/types";

const STORAGE_KEY = "flowerp:data:v3";

interface StoredData {
  orders: Order[];
  drivers: Driver[];
  vehicles: Vehicle[];
  invoices: Invoice[];
  expenses: Expense[];
}

export interface NewExpenseInput {
  category: ExpenseCategory;
  amount: number;
  date: string;
  orderId?: string;
  vehicleId?: string;
  driverId?: string;
  notes?: string;
}

export interface NewOrderInput {
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
  notes?: string;
}

function seedData(): StoredData {
  return {
    orders: seedOrders,
    drivers: seedDrivers,
    vehicles: seedVehicles,
    invoices: seedInvoices,
    expenses: seedExpenses,
  };
}

function nextId(existingIds: string[], prefix: string, pad: number, start: number): string {
  const year = new Date().getFullYear();
  const re = new RegExp(`${prefix}-\\d{4}-(\\d+)`);
  const numbers = existingIds
    .map((id) => re.exec(id))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => parseInt(match[1], 10));
  const next = (numbers.length ? Math.max(...numbers) : start) + 1;
  return `${prefix}-${year}-${String(next).padStart(pad, "0")}`;
}

function nextOrderId(orders: Order[]): string {
  return nextId(
    orders.map((o) => o.id),
    "ORD",
    5,
    200,
  );
}

function nextInvoiceId(invoices: Invoice[]): string {
  return nextId(
    invoices.map((i) => i.id),
    "INV",
    4,
    5000,
  );
}

function nextPaymentId(invoices: Invoice[]): string {
  const numbers = invoices
    .flatMap((i) => i.payments)
    .map((p) => /PAY-(\d+)/.exec(p.id))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => parseInt(match[1], 10));
  const next = (numbers.length ? Math.max(...numbers) : 1000) + 1;
  return `PAY-${next}`;
}

function nextExpenseId(expenses: Expense[]): string {
  const numbers = expenses
    .map((e) => /EXP-(\d+)/.exec(e.id))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => parseInt(match[1], 10));
  const next = (numbers.length ? Math.max(...numbers) : 1000) + 1;
  return `EXP-${next}`;
}

type Listener = () => void;

class AppDataStore {
  private data: StoredData = seedData();
  private listeners = new Set<Listener>();

  getSnapshot = (): StoredData => this.data;
  getServerSnapshot = (): StoredData => this.data;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: StoredData) {
    this.data = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage write failures (e.g. private browsing quota)
    }
    this.listeners.forEach((listener) => listener());
  }

  hydrate = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.data = JSON.parse(raw) as StoredData;
        this.listeners.forEach((listener) => listener());
      }
    } catch {
      // ignore malformed storage, keep seed data
    }
  };

  assignOrder = (orderId: string, driverId: string, vehicleId: string) => {
    const prev = this.data;
    this.commit({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              driverId,
              vehicleId,
              status: "assigned" as const,
              statusHistory: [
                ...o.statusHistory,
                { status: "assigned" as const, at: new Date().toISOString() },
              ],
            }
          : o,
      ),
      drivers: prev.drivers.map((d) =>
        d.id === driverId ? { ...d, status: "on_delivery" as const } : d,
      ),
      vehicles: prev.vehicles.map((v) =>
        v.id === vehicleId ? { ...v, status: "on_delivery" as const } : v,
      ),
    });
  };

  updateOrderStatus = (orderId: string, status: OrderStatus) => {
    const prev = this.data;
    const order = prev.orders.find((o) => o.id === orderId);
    if (!order) return;
    const releasesResources = status === "delivered" || status === "cancelled";
    const now = new Date();

    const generatesInvoice =
      status === "delivered" && !prev.invoices.some((i) => i.orderId === orderId);

    this.commit({
      ...prev,
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status,
              statusHistory: [
                ...o.statusHistory,
                { status, at: now.toISOString() },
              ],
            }
          : o,
      ),
      drivers: releasesResources
        ? prev.drivers.map((d) =>
            d.id === order.driverId
              ? {
                  ...d,
                  status: "available" as const,
                  completedDeliveries:
                    status === "delivered" ? d.completedDeliveries + 1 : d.completedDeliveries,
                }
              : d,
          )
        : prev.drivers,
      vehicles: releasesResources
        ? prev.vehicles.map((v) =>
            v.id === order.vehicleId ? { ...v, status: "available" as const } : v,
          )
        : prev.vehicles,
      invoices: generatesInvoice
        ? [
            ...prev.invoices,
            {
              id: nextInvoiceId(prev.invoices),
              customerId: order.customerId,
              orderId: order.id,
              amount: order.amount,
              issuedAt: now.toISOString(),
              dueAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
              payments: [],
            },
          ]
        : prev.invoices,
    });
  };

  recordPayment = (invoiceId: string, amount: number, method: PaymentMethod) => {
    const prev = this.data;
    const paidAt = new Date().toISOString();
    this.commit({
      ...prev,
      invoices: prev.invoices.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              payments: [
                ...inv.payments,
                { id: nextPaymentId(prev.invoices), amount, method, paidAt },
              ],
            }
          : inv,
      ),
    });
  };

  addExpense = (input: NewExpenseInput) => {
    const prev = this.data;
    const newExpense: Expense = {
      ...input,
      id: nextExpenseId(prev.expenses),
    };
    this.commit({ ...prev, expenses: [newExpense, ...prev.expenses] });
  };

  addOrder = (input: NewOrderInput) => {
    const prev = this.data;
    const id = nextOrderId(prev.orders);
    const createdAt = new Date().toISOString();
    const newOrder: Order = {
      ...input,
      id,
      driverId: null,
      vehicleId: null,
      status: "pending",
      statusHistory: [{ status: "pending", at: createdAt }],
      createdAt,
    };
    this.commit({ ...prev, orders: [newOrder, ...prev.orders] });
  };

  resetDemoData = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    this.commit(seedData());
  };
}

const store = new AppDataStore();

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    store.hydrate();
  }, []);

  return <>{children}</>;
}

export function useAppData() {
  const data = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  return {
    orders: data.orders,
    drivers: data.drivers,
    vehicles: data.vehicles,
    invoices: data.invoices,
    expenses: data.expenses,
    assignOrder: store.assignOrder,
    updateOrderStatus: store.updateOrderStatus,
    addOrder: store.addOrder,
    recordPayment: store.recordPayment,
    addExpense: store.addExpense,
    resetDemoData: store.resetDemoData,
  };
}
