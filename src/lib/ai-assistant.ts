import {
  formatCurrency,
  formatDate,
  getCustomer,
  getCustomerOutstandingBalance,
  getDriver,
  getOnTimeDeliveryRate,
  getRouteProfitability,
  isMaintenanceDueSoon,
  isOrderDelayed,
  isWithinLastDay,
} from "@/lib/mock-data";
import type { Customer, Driver, Expense, Invoice, Order, Vehicle } from "@/lib/types";

export interface AssistantData {
  orders: Order[];
  drivers: Driver[];
  vehicles: Vehicle[];
  invoices: Invoice[];
  expenses: Expense[];
  customers: Customer[];
}

export interface AnswerItem {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}

export interface AssistantAnswer {
  summary: string;
  items?: AnswerItem[];
  emptyNote?: string;
}

interface Intent {
  match: (question: string) => boolean;
  answer: (data: AssistantData) => AssistantAnswer;
}

function matches(...patterns: RegExp[]) {
  return (question: string) => patterns.every((p) => p.test(question));
}

const intents: Intent[] = [
  {
    match: matches(/delay|kechik|late/i),
    answer: ({ orders, customers }) => {
      const delayed = orders.filter(isOrderDelayed);
      return {
        summary:
          delayed.length === 0
            ? "No deliveries are currently delayed."
            : `${delayed.length} deliver${delayed.length === 1 ? "y is" : "ies are"} currently delayed:`,
        emptyNote: "Everything is on schedule.",
        items: delayed.map((o) => {
          const customer = getCustomer(o.customerId, customers);
          const driver = getDriver(o.driverId);
          return {
            label: `${o.id} · ${customer?.name ?? "Unknown"}`,
            value: `${driver?.name ?? "Unassigned"} · due ${formatDate(o.deliveryDate)}`,
            tone: "negative" as const,
          };
        }),
      };
    },
  },
  {
    match: matches(/driver|haydovchi/i, /free|available|bo'?sh/i),
    answer: ({ drivers }) => {
      const free = drivers.filter((d) => d.status === "available");
      return {
        summary:
          free.length === 0
            ? "No drivers are available right now."
            : `${free.length} driver${free.length === 1 ? "" : "s"} available right now:`,
        emptyNote: "All drivers are on delivery or off duty.",
        items: free.map((d) => ({
          label: d.name,
          value: `${d.onTimeRate}% on-time · ${d.completedDeliveries} deliveries`,
        })),
      };
    },
  },
  {
    match: matches(/debt|qarzdor|unpaid|owe|qarz|indebted/i),
    answer: ({ invoices, customers }) => {
      const debtors = customers
        .map((c) => ({ customer: c, balance: getCustomerOutstandingBalance(c.id, invoices) }))
        .filter((d) => d.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);
      return {
        summary:
          debtors.length === 0
            ? "No customers currently owe anything."
            : "Top customers by outstanding balance:",
        emptyNote: "All invoices are paid up.",
        items: debtors.map((d) => ({
          label: d.customer.name,
          value: formatCurrency(d.balance),
          tone: "negative" as const,
        })),
      };
    },
  },
  {
    match: matches(/route|yo'nalish|yonalish/i),
    answer: ({ orders, expenses }) => {
      const routes = getRouteProfitability(orders, expenses).slice(0, 5);
      return {
        summary:
          routes.length === 0
            ? "No completed deliveries yet to rank routes."
            : "Most profitable routes based on completed deliveries:",
        emptyNote: "No completed deliveries yet.",
        items: routes.map((r) => ({
          label: r.route,
          value: `${formatCurrency(r.profit)} profit · ${r.orderCount} orders`,
          tone: r.profit >= 0 ? ("positive" as const) : ("negative" as const),
        })),
      };
    },
  },
  {
    match: matches(/cancel|bekor/i),
    answer: ({ orders, customers }) => {
      const cancelled = orders.filter((o) => o.status === "cancelled");
      return {
        summary: `${cancelled.length} order${cancelled.length === 1 ? " has" : "s have"} been cancelled.`,
        items: cancelled.map((o) => {
          const customer = getCustomer(o.customerId, customers);
          return { label: o.id, value: customer?.name ?? "Unknown" };
        }),
      };
    },
  },
  {
    match: matches(/maintenance|texnik xizmat|ta'mir|tamir/i),
    answer: ({ vehicles }) => {
      const due = vehicles.filter((v) => isMaintenanceDueSoon(v.nextMaintenanceAt));
      return {
        summary:
          due.length === 0
            ? "No vehicles need maintenance soon."
            : `${due.length} vehicle${due.length === 1 ? "" : "s"} need maintenance soon:`,
        emptyNote: "Fleet is in good shape.",
        items: due.map((v) => ({
          label: `${v.model} · ${v.plate}`,
          value: `due ${formatDate(v.nextMaintenanceAt)}`,
          tone: "negative" as const,
        })),
      };
    },
  },
  {
    match: matches(/driver|haydovchi/i, /best|top|eng yaxshi/i),
    answer: ({ drivers }) => {
      const ranked = [...drivers].sort((a, b) => b.onTimeRate - a.onTimeRate);
      const top = ranked.slice(0, 3);
      return {
        summary: "Top drivers by on-time delivery rate:",
        items: top.map((d) => ({
          label: d.name,
          value: `${d.onTimeRate}% on-time · ${d.completedDeliveries} deliveries`,
          tone: "positive" as const,
        })),
      };
    },
  },
  {
    match: matches(/revenue|daromad|tushum|income|profit/i),
    answer: ({ orders, expenses }) => {
      const delivered = orders.filter((o) => o.status === "delivered");
      const revenue = delivered.reduce((sum, o) => sum + o.amount, 0);
      const cost = expenses.reduce((sum, e) => sum + e.amount, 0);
      return {
        summary: "Revenue overview from delivered orders:",
        items: [
          { label: "Total revenue", value: formatCurrency(revenue), tone: "positive" as const },
          { label: "Total expenses", value: formatCurrency(cost), tone: "negative" as const },
          {
            label: "Net profit",
            value: formatCurrency(revenue - cost),
            tone: revenue - cost >= 0 ? ("positive" as const) : ("negative" as const),
          },
        ],
      };
    },
  },
  {
    match: matches(/today|bugun|active deliver|faol yetkazish/i),
    answer: ({ orders }) => {
      const todaysOrders = orders.filter((o) => isWithinLastDay(o.createdAt));
      const active = orders.filter((o) =>
        ["assigned", "picked_up", "in_transit"].includes(o.status),
      );
      const delayed = orders.filter(isOrderDelayed);
      return {
        summary: "Today's operations snapshot:",
        items: [
          { label: "New orders (last 24h)", value: String(todaysOrders.length) },
          { label: "Active deliveries", value: String(active.length) },
          {
            label: "Delayed deliveries",
            value: String(delayed.length),
            tone: delayed.length > 0 ? ("negative" as const) : undefined,
          },
        ],
      };
    },
  },
  {
    match: matches(/on.?time|o'z vaqtida/i),
    answer: ({ orders }) => ({
      summary: `On-time delivery rate is ${getOnTimeDeliveryRate(orders)}% across all delivered orders.`,
    }),
  },
];

const FALLBACK_SUMMARY =
  "I can answer questions about deliveries, drivers, debtors, revenue, and routes. Try one of the suggestions below.";

export function askAssistant(question: string, data: AssistantData): AssistantAnswer {
  for (const intent of intents) {
    if (intent.match(question)) {
      return intent.answer(data);
    }
  }
  return { summary: FALLBACK_SUMMARY };
}

export const suggestedQuestions = [
  "Which deliveries are delayed today?",
  "Which drivers are free right now?",
  "Show top 5 most indebted customers",
  "What is the most profitable route?",
  "Which vehicles need maintenance?",
  "Give me today's revenue overview",
];
