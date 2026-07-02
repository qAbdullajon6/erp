import type {
  Customer,
  Driver,
  Invoice,
  Order,
  RevenuePoint,
  Vehicle,
} from "@/lib/types";

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export const vehicles: Vehicle[] = [
  { id: "veh-1", plate: "01A777BT", model: "Isuzu NQR 75", type: "Truck", capacityTons: 5 },
  { id: "veh-2", plate: "01B412KX", model: "MAN TGX 18.440", type: "Truck", capacityTons: 20 },
  { id: "veh-3", plate: "01C905LM", model: "Howo T5G", type: "Truck", capacityTons: 15 },
  { id: "veh-4", plate: "01D238QW", model: "Mercedes Sprinter", type: "Van", capacityTons: 2 },
  { id: "veh-5", plate: "01E661RT", model: "Hyundai HD78 Reefer", type: "Refrigerated Truck", capacityTons: 4 },
  { id: "veh-6", plate: "01F350ZX", model: "Volvo FH16", type: "Truck", capacityTons: 22 },
  { id: "veh-7", plate: "01G183NP", model: "Ford Transit", type: "Van", capacityTons: 1.5 },
  { id: "veh-8", plate: "01H524HD", model: "Isuzu Giga Reefer", type: "Refrigerated Truck", capacityTons: 8 },
];

export const drivers: Driver[] = [
  { id: "drv-1", name: "Aziz Karimov", phone: "+998 90 123 45 67", status: "on_delivery", rating: 4.9, vehicleId: "veh-2", completedDeliveries: 482, onTimeRate: 96 },
  { id: "drv-2", name: "Bekzod Yusupov", phone: "+998 91 234 56 78", status: "available", rating: 4.7, vehicleId: "veh-1", completedDeliveries: 311, onTimeRate: 91 },
  { id: "drv-3", name: "Davron Tashkentov", phone: "+998 93 345 67 89", status: "on_delivery", rating: 4.8, vehicleId: "veh-3", completedDeliveries: 398, onTimeRate: 94 },
  { id: "drv-4", name: "Elyor Rashidov", phone: "+998 94 456 78 90", status: "off_duty", rating: 4.6, vehicleId: "veh-4", completedDeliveries: 205, onTimeRate: 88 },
  { id: "drv-5", name: "Farrux Nematov", phone: "+998 97 567 89 01", status: "available", rating: 4.9, vehicleId: "veh-5", completedDeliveries: 276, onTimeRate: 97 },
  { id: "drv-6", name: "Jasur Alimov", phone: "+998 88 678 90 12", status: "on_delivery", rating: 4.5, vehicleId: "veh-6", completedDeliveries: 190, onTimeRate: 85 },
  { id: "drv-7", name: "Kamron Sodiqov", phone: "+998 90 789 01 23", status: "available", rating: 4.8, vehicleId: "veh-7", completedDeliveries: 342, onTimeRate: 93 },
  { id: "drv-8", name: "Lochin Xudoyberdiyev", phone: "+998 93 890 12 34", status: "off_duty", rating: 4.7, vehicleId: "veh-8", completedDeliveries: 267, onTimeRate: 90 },
];

export const customers: Customer[] = [
  { id: "cus-1", name: "Uzbek Textile Group", industry: "Textiles", city: "Tashkent", totalOrders: 128, outstandingBalance: 18500, lifetimeValue: 412000 },
  { id: "cus-2", name: "Silk Road Foods", industry: "F&B Distribution", city: "Samarkand", totalOrders: 96, outstandingBalance: 0, lifetimeValue: 265000 },
  { id: "cus-3", name: "MetalTrade Invest", industry: "Metal & Steel", city: "Navoiy", totalOrders: 74, outstandingBalance: 32400, lifetimeValue: 588000 },
  { id: "cus-4", name: "Fergana AgroExport", industry: "Agriculture", city: "Fergana", totalOrders: 61, outstandingBalance: 7200, lifetimeValue: 189000 },
  { id: "cus-5", name: "Bukhara Ceramics Co.", industry: "Manufacturing", city: "Bukhara", totalOrders: 43, outstandingBalance: 0, lifetimeValue: 97500 },
  { id: "cus-6", name: "Nukus Chemical Plant", industry: "Chemicals", city: "Nukus", totalOrders: 37, outstandingBalance: 14800, lifetimeValue: 143000 },
  { id: "cus-7", name: "Andijan Auto Parts", industry: "Automotive", city: "Andijan", totalOrders: 55, outstandingBalance: 0, lifetimeValue: 121000 },
  { id: "cus-8", name: "Tashkent Retail Chain", industry: "Retail", city: "Tashkent", totalOrders: 210, outstandingBalance: 26900, lifetimeValue: 734000 },
];

export const orders: Order[] = [
  { id: "ORD-3201", customerId: "cus-1", origin: "Tashkent", destination: "Almaty", driverId: "drv-1", status: "in_transit", amount: 3200, createdAt: hoursAgo(6), eta: hoursFromNow(10), cargo: "Cotton textiles", weightTons: 12 },
  { id: "ORD-3202", customerId: "cus-8", origin: "Tashkent", destination: "Nukus", driverId: "drv-3", status: "delayed", amount: 2650, createdAt: hoursAgo(30), eta: hoursAgo(4), cargo: "Retail goods", weightTons: 9 },
  { id: "ORD-3203", customerId: "cus-3", origin: "Navoiy", destination: "Tashkent", driverId: "drv-6", status: "in_transit", amount: 4100, createdAt: hoursAgo(14), eta: hoursFromNow(3), cargo: "Steel rebar", weightTons: 18 },
  { id: "ORD-3204", customerId: "cus-2", origin: "Samarkand", destination: "Bukhara", driverId: null, status: "pending", amount: 980, createdAt: hoursAgo(2), eta: hoursFromNow(20), cargo: "Packaged food", weightTons: 3 },
  { id: "ORD-3205", customerId: "cus-4", origin: "Fergana", destination: "Tashkent", driverId: "drv-4", status: "delivered", amount: 1750, createdAt: daysAgo(1), eta: hoursAgo(8), cargo: "Dried fruits", weightTons: 5 },
  { id: "ORD-3206", customerId: "cus-7", origin: "Andijan", destination: "Namangan", driverId: null, status: "pending", amount: 640, createdAt: hoursAgo(1), eta: hoursFromNow(18), cargo: "Auto parts", weightTons: 2 },
  { id: "ORD-3207", customerId: "cus-6", origin: "Nukus", destination: "Urgench", driverId: "drv-8", status: "assigned", amount: 1320, createdAt: hoursAgo(3), eta: hoursFromNow(14), cargo: "Chemical drums", weightTons: 6 },
  { id: "ORD-3208", customerId: "cus-5", origin: "Bukhara", destination: "Samarkand", driverId: "drv-7", status: "delivered", amount: 890, createdAt: daysAgo(2), eta: daysAgo(1), cargo: "Ceramic tiles", weightTons: 4 },
  { id: "ORD-3209", customerId: "cus-1", origin: "Tashkent", destination: "Fergana", driverId: null, status: "delayed", amount: 1980, createdAt: hoursAgo(36), eta: hoursAgo(10), cargo: "Cotton yarn", weightTons: 8 },
  { id: "ORD-3210", customerId: "cus-8", origin: "Tashkent", destination: "Samarkand", driverId: "drv-2", status: "assigned", amount: 1450, createdAt: hoursAgo(2), eta: hoursFromNow(9), cargo: "Retail electronics", weightTons: 4 },
  { id: "ORD-3211", customerId: "cus-3", origin: "Tashkent", destination: "Navoiy", driverId: "drv-5", status: "delivered", amount: 3750, createdAt: daysAgo(3), eta: daysAgo(2), cargo: "Steel coils", weightTons: 16 },
  { id: "ORD-3212", customerId: "cus-2", origin: "Samarkand", destination: "Tashkent", driverId: "drv-1", status: "delivered", amount: 1120, createdAt: daysAgo(4), eta: daysAgo(3), cargo: "Beverages", weightTons: 6 },
];

export const invoices: Invoice[] = [
  { id: "INV-9001", customerId: "cus-1", orderId: "ORD-3201", amount: 3200, status: "pending", issuedAt: hoursAgo(6), dueAt: hoursFromNow(240) },
  { id: "INV-9002", customerId: "cus-8", orderId: "ORD-3202", amount: 2650, status: "overdue", issuedAt: daysAgo(10), dueAt: daysAgo(2) },
  { id: "INV-9003", customerId: "cus-3", orderId: "ORD-3203", amount: 4100, status: "pending", issuedAt: hoursAgo(14), dueAt: hoursFromNow(300) },
  { id: "INV-9004", customerId: "cus-4", orderId: "ORD-3205", amount: 1750, status: "paid", issuedAt: daysAgo(1), dueAt: daysAgo(-13) },
  { id: "INV-9005", customerId: "cus-6", orderId: "ORD-3207", amount: 1320, status: "overdue", issuedAt: daysAgo(15), dueAt: daysAgo(5) },
  { id: "INV-9006", customerId: "cus-1", orderId: "ORD-3209", amount: 1980, status: "overdue", issuedAt: daysAgo(12), dueAt: daysAgo(4) },
  { id: "INV-9007", customerId: "cus-3", orderId: "ORD-3211", amount: 3750, status: "paid", issuedAt: daysAgo(3), dueAt: daysAgo(-11) },
  { id: "INV-9008", customerId: "cus-8", orderId: "ORD-3210", amount: 1450, status: "pending", issuedAt: hoursAgo(2), dueAt: hoursFromNow(334) },
];

function buildRevenueTrend(): RevenuePoint[] {
  const base = 8200;
  const deltas = [
    -400, 300, 650, -200, 900, 1200, 400, -150, 1100, 1600, 950, 1800, 2100, 2400,
  ];
  return deltas.map((delta, i) => {
    const revenue = base + delta + i * 60;
    return {
      date: new Date(
        Date.now() - (deltas.length - 1 - i) * 24 * 60 * 60 * 1000,
      ).toISOString(),
      revenue,
      expenses: Math.round(revenue * 0.62),
    };
  });
}

export const revenueTrend: RevenuePoint[] = buildRevenueTrend();

export function getCustomer(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export function getDriver(id: string | null): Driver | undefined {
  if (!id) return undefined;
  return drivers.find((d) => d.id === id);
}

export function getVehicle(id: string): Vehicle | undefined {
  return vehicles.find((v) => v.id === id);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatRelativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffHours = Math.round(diffMs / (60 * 60 * 1000));
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}
