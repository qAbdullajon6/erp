"use client";

import * as React from "react";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import {
  customerNotes as seedCustomerNotes,
  customers as seedCustomers,
  drivers as seedDrivers,
  expenses as seedExpenses,
  invoices as seedInvoices,
  orders as seedOrders,
  vehicles as seedVehicles,
} from "@/lib/mock-data";
import type {
  Currency,
  Customer,
  CustomerNote,
  CustomerStatus,
  Driver,
  Expense,
  ExpenseApprovalStatus,
  ExpenseCategory,
  Invoice,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentTerms,
  Vehicle,
} from "@/lib/types";

const STORAGE_KEY = "flowerp:data:v5";

interface StoredData {
  orders: Order[];
  drivers: Driver[];
  vehicles: Vehicle[];
  invoices: Invoice[];
  expenses: Expense[];
  customers: Customer[];
  customerNotes: CustomerNote[];
}

export interface NewExpenseInput {
  category: ExpenseCategory;
  amount: number;
  currency: Currency;
  date: string;
  orderId?: string;
  vehicleId?: string;
  driverId?: string;
  payee?: string;
  receiptRef?: string;
  notes?: string;
}

export interface CustomerInput {
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
}

export interface NewInvoiceInput {
  customerId: string;
  orderId?: string;
  currency: Currency;
  subtotal: number;
  discount: number;
  taxRate: number;
  dueAt: string;
  notes?: string;
}

export interface PaymentInput {
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  paidAt?: string;
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
    customers: seedCustomers,
    customerNotes: seedCustomerNotes,
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

function nextCustomerId(customers: Customer[]): string {
  const numbers = customers
    .map((c) => /cus-(\d+)/.exec(c.id))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => parseInt(match[1], 10));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `cus-${next}`;
}

function nextCustomerNoteId(notes: CustomerNote[]): string {
  const numbers = notes
    .map((n) => /note-(\d+)/.exec(n.id))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => parseInt(match[1], 10));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `note-${next}`;
}

function computeInvoiceTotal(subtotal: number, discount: number, taxRate: number): number {
  const taxable = Math.max(0, subtotal - discount);
  return taxable + taxable * (taxRate / 100);
}

function isInvoiceActive(invoice: Invoice): boolean {
  return invoice.manualStatus !== "cancelled";
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
      status === "delivered" &&
      !prev.invoices.some((i) => i.orderId === orderId && isInvoiceActive(i));

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
              currency: DEFAULT_CURRENCY,
              subtotal: order.amount,
              discount: 0,
              taxRate: 0,
              amount: order.amount,
              issuedAt: now.toISOString(),
              dueAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
              payments: [],
            },
          ]
        : prev.invoices,
    });
  };

  recordPayment = (
    invoiceId: string,
    amount: number,
    method: PaymentMethod,
    extra?: { referenceNumber?: string; notes?: string },
  ) => {
    const prev = this.data;
    const invoice = prev.invoices.find((i) => i.id === invoiceId);
    if (!invoice) return;
    const paidAt = new Date().toISOString();
    this.commit({
      ...prev,
      invoices: prev.invoices.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              payments: [
                ...inv.payments,
                {
                  id: nextPaymentId(prev.invoices),
                  amount,
                  currency: invoice.currency,
                  method,
                  referenceNumber: extra?.referenceNumber,
                  notes: extra?.notes,
                  paidAt,
                },
              ],
            }
          : inv,
      ),
    });
  };

  updatePayment = (invoiceId: string, paymentId: string, input: PaymentInput) => {
    const prev = this.data;
    this.commit({
      ...prev,
      invoices: prev.invoices.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              payments: inv.payments.map((p) =>
                p.id === paymentId
                  ? { ...p, ...input, paidAt: input.paidAt ?? p.paidAt }
                  : p,
              ),
            }
          : inv,
      ),
    });
  };

  deletePayment = (invoiceId: string, paymentId: string) => {
    const prev = this.data;
    this.commit({
      ...prev,
      invoices: prev.invoices.map((inv) =>
        inv.id === invoiceId
          ? { ...inv, payments: inv.payments.filter((p) => p.id !== paymentId) }
          : inv,
      ),
    });
  };

  addExpense = (input: NewExpenseInput) => {
    const prev = this.data;
    const newExpense: Expense = {
      ...input,
      id: nextExpenseId(prev.expenses),
      approvalStatus: "pending",
    };
    this.commit({ ...prev, expenses: [newExpense, ...prev.expenses] });
  };

  updateExpense = (id: string, input: NewExpenseInput) => {
    const prev = this.data;
    this.commit({
      ...prev,
      expenses: prev.expenses.map((e) => (e.id === id ? { ...e, ...input } : e)),
    });
  };

  deleteExpense = (id: string) => {
    const prev = this.data;
    this.commit({ ...prev, expenses: prev.expenses.filter((e) => e.id !== id) });
  };

  setExpenseApproval = (id: string, approvalStatus: ExpenseApprovalStatus) => {
    const prev = this.data;
    this.commit({
      ...prev,
      expenses: prev.expenses.map((e) => (e.id === id ? { ...e, approvalStatus } : e)),
    });
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

  addCustomer = (input: CustomerInput): string => {
    const prev = this.data;
    const id = nextCustomerId(prev.customers);
    const newCustomer: Customer = {
      ...input,
      id,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    this.commit({ ...prev, customers: [newCustomer, ...prev.customers] });
    return id;
  };

  updateCustomer = (id: string, input: CustomerInput) => {
    const prev = this.data;
    this.commit({
      ...prev,
      customers: prev.customers.map((c) => (c.id === id ? { ...c, ...input } : c)),
    });
  };

  setCustomerStatus = (id: string, status: CustomerStatus) => {
    const prev = this.data;
    this.commit({
      ...prev,
      customers: prev.customers.map((c) => (c.id === id ? { ...c, status } : c)),
    });
  };

  addCustomerNote = (customerId: string, text: string) => {
    const prev = this.data;
    const note: CustomerNote = {
      id: nextCustomerNoteId(prev.customerNotes),
      customerId,
      text,
      at: new Date().toISOString(),
    };
    this.commit({ ...prev, customerNotes: [note, ...prev.customerNotes] });
  };

  /** Returns the new invoice id, or null if a business rule blocked creation
   *  (archived customer, or the order already has an active invoice). */
  addInvoice = (input: NewInvoiceInput): string | null => {
    const prev = this.data;
    const customer = prev.customers.find((c) => c.id === input.customerId);
    if (!customer || customer.status === "archived") return null;
    if (
      input.orderId &&
      prev.invoices.some((i) => i.orderId === input.orderId && isInvoiceActive(i))
    ) {
      return null;
    }

    const id = nextInvoiceId(prev.invoices);
    const newInvoice: Invoice = {
      customerId: input.customerId,
      orderId: input.orderId,
      currency: input.currency,
      subtotal: input.subtotal,
      discount: input.discount,
      taxRate: input.taxRate,
      amount: computeInvoiceTotal(input.subtotal, input.discount, input.taxRate),
      manualStatus: "draft",
      id,
      issuedAt: new Date().toISOString(),
      dueAt: input.dueAt,
      payments: [],
      notes: input.notes,
    };
    this.commit({ ...prev, invoices: [newInvoice, ...prev.invoices] });
    return id;
  };

  updateInvoice = (id: string, input: NewInvoiceInput) => {
    const prev = this.data;
    this.commit({
      ...prev,
      invoices: prev.invoices.map((inv) =>
        inv.id === id
          ? {
              ...inv,
              customerId: input.customerId,
              orderId: input.orderId,
              currency: input.currency,
              subtotal: input.subtotal,
              discount: input.discount,
              taxRate: input.taxRate,
              amount: computeInvoiceTotal(input.subtotal, input.discount, input.taxRate),
              dueAt: input.dueAt,
              notes: input.notes,
            }
          : inv,
      ),
    });
  };

  markInvoiceSent = (id: string) => {
    const prev = this.data;
    this.commit({
      ...prev,
      invoices: prev.invoices.map((inv) =>
        inv.id === id ? { ...inv, manualStatus: undefined } : inv,
      ),
    });
  };

  cancelInvoice = (id: string) => {
    const prev = this.data;
    this.commit({
      ...prev,
      invoices: prev.invoices.map((inv) =>
        inv.id === id ? { ...inv, manualStatus: "cancelled" as const } : inv,
      ),
    });
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
    customers: data.customers,
    customerNotes: data.customerNotes,
    assignOrder: store.assignOrder,
    updateOrderStatus: store.updateOrderStatus,
    addOrder: store.addOrder,
    recordPayment: store.recordPayment,
    updatePayment: store.updatePayment,
    deletePayment: store.deletePayment,
    addExpense: store.addExpense,
    updateExpense: store.updateExpense,
    deleteExpense: store.deleteExpense,
    setExpenseApproval: store.setExpenseApproval,
    addCustomer: store.addCustomer,
    updateCustomer: store.updateCustomer,
    setCustomerStatus: store.setCustomerStatus,
    addCustomerNote: store.addCustomerNote,
    addInvoice: store.addInvoice,
    updateInvoice: store.updateInvoice,
    markInvoiceSent: store.markInvoiceSent,
    cancelInvoice: store.cancelInvoice,
    resetDemoData: store.resetDemoData,
  };
}
