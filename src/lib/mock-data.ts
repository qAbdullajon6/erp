import type {
  Customer,
  Driver,
  Expense,
  ExpenseCategory,
  Invoice,
  InvoiceStatus,
  Order,
  RevenuePoint,
  StatusHistoryEntry,
  Vehicle,
} from "@/lib/types";

// Seed data is generated relative to a fixed instant instead of Date.now().
// The server render and the client hydration run at two different real
// instants, so "hours ago" derived from a live clock would produce two
// different strings and trigger a hydration mismatch. A frozen reference
// point keeps server and client output identical.
const DEMO_EPOCH = new Date("2026-07-03T09:00:00.000Z").getTime();

function hoursAgo(hours: number): string {
  return new Date(DEMO_EPOCH - hours * 60 * 60 * 1000).toISOString();
}

function hoursFromNow(hours: number): string {
  return new Date(DEMO_EPOCH + hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(DEMO_EPOCH - days * 24 * 60 * 60 * 1000).toISOString();
}

export const vehicles: Vehicle[] = [
  { id: "veh-1", plate: "01A777BT", model: "Isuzu NQR 75", type: "Truck", capacityTons: 5, status: "available", lastMaintenanceAt: daysAgo(40), nextMaintenanceAt: hoursFromNow(24 * 50) },
  { id: "veh-2", plate: "01B412KX", model: "MAN TGX 18.440", type: "Truck", capacityTons: 20, status: "on_delivery", lastMaintenanceAt: daysAgo(20), nextMaintenanceAt: hoursFromNow(24 * 70) },
  { id: "veh-3", plate: "01C905LM", model: "Howo T5G", type: "Truck", capacityTons: 15, status: "on_delivery", lastMaintenanceAt: daysAgo(55), nextMaintenanceAt: hoursFromNow(24 * 5) },
  { id: "veh-4", plate: "01D238QW", model: "Mercedes Sprinter", type: "Van", capacityTons: 2, status: "maintenance", lastMaintenanceAt: hoursAgo(6), nextMaintenanceAt: hoursFromNow(24 * 90) },
  { id: "veh-5", plate: "01E661RT", model: "Hyundai HD78 Reefer", type: "Refrigerated Truck", capacityTons: 4, status: "available", lastMaintenanceAt: daysAgo(15), nextMaintenanceAt: hoursFromNow(24 * 75) },
  { id: "veh-6", plate: "01F350ZX", model: "Volvo FH16", type: "Truck", capacityTons: 22, status: "on_delivery", lastMaintenanceAt: daysAgo(30), nextMaintenanceAt: hoursFromNow(24 * 60) },
  { id: "veh-7", plate: "01G183NP", model: "Ford Transit", type: "Van", capacityTons: 1.5, status: "on_delivery", lastMaintenanceAt: daysAgo(10), nextMaintenanceAt: hoursFromNow(24 * 80) },
  { id: "veh-8", plate: "01H524HD", model: "Isuzu Giga Reefer", type: "Refrigerated Truck", capacityTons: 8, status: "on_delivery", lastMaintenanceAt: daysAgo(25), nextMaintenanceAt: hoursFromNow(24 * 65) },
];

export const drivers: Driver[] = [
  { id: "drv-1", name: "Aziz Karimov", phone: "+998 90 123 45 67", status: "on_delivery", rating: 4.9, vehicleId: "veh-2", completedDeliveries: 482, onTimeRate: 96, licenseNumber: "AA 1234567", licenseExpiresAt: hoursFromNow(24 * 400) },
  { id: "drv-2", name: "Bekzod Yusupov", phone: "+998 91 234 56 78", status: "available", rating: 4.7, vehicleId: "veh-1", completedDeliveries: 311, onTimeRate: 91, licenseNumber: "AA 2345678", licenseExpiresAt: hoursFromNow(24 * 620) },
  { id: "drv-3", name: "Davron Tashkentov", phone: "+998 93 345 67 89", status: "on_delivery", rating: 4.8, vehicleId: "veh-3", completedDeliveries: 398, onTimeRate: 94, licenseNumber: "AA 3456789", licenseExpiresAt: hoursFromNow(24 * 12) },
  { id: "drv-4", name: "Elyor Rashidov", phone: "+998 94 456 78 90", status: "off_duty", rating: 4.6, vehicleId: "veh-4", completedDeliveries: 205, onTimeRate: 88, licenseNumber: "AA 4567890", licenseExpiresAt: hoursFromNow(24 * 250), notes: "Ta'til so'ragan, 3 kundan keyin qaytadi" },
  { id: "drv-5", name: "Farrux Nematov", phone: "+998 97 567 89 01", status: "available", rating: 4.9, vehicleId: "veh-5", completedDeliveries: 276, onTimeRate: 97, licenseNumber: "AA 5678901", licenseExpiresAt: hoursFromNow(24 * 540) },
  { id: "drv-6", name: "Jasur Alimov", phone: "+998 88 678 90 12", status: "on_delivery", rating: 4.5, vehicleId: "veh-6", completedDeliveries: 190, onTimeRate: 85, licenseNumber: "AA 6789012", licenseExpiresAt: hoursFromNow(24 * 800) },
  { id: "drv-7", name: "Kamron Sodiqov", phone: "+998 90 789 01 23", status: "on_delivery", rating: 4.8, vehicleId: "veh-7", completedDeliveries: 342, onTimeRate: 93, licenseNumber: "AA 7890123", licenseExpiresAt: hoursFromNow(24 * 45) },
  { id: "drv-8", name: "Lochin Xudoyberdiyev", phone: "+998 93 890 12 34", status: "on_delivery", rating: 4.7, vehicleId: "veh-8", completedDeliveries: 267, onTimeRate: 90, licenseNumber: "AA 8901234", licenseExpiresAt: hoursFromNow(24 * 700) },
];

export const customers: Customer[] = [
  {
    id: "cus-1",
    name: "Uzbek Textile Group",
    industry: "Textiles",
    city: "Tashkent",
    contactPerson: "Aziza Rahimova",
    phone: "+998 71 200 11 22",
    email: "a.rahimova@uztextile.uz",
    address: "Chilonzor tumani, Bunyodkor ko'chasi 12, Tashkent",
    usualRoutes: ["Tashkent → Almaty", "Tashkent → Fergana"],
  },
  {
    id: "cus-2",
    name: "Silk Road Foods",
    industry: "F&B Distribution",
    city: "Samarkand",
    contactPerson: "Sardor Aliyev",
    phone: "+998 66 233 44 55",
    email: "s.aliyev@silkroadfoods.uz",
    address: "Registon ko'chasi 5, Samarkand",
    usualRoutes: ["Samarkand → Bukhara", "Samarkand → Tashkent"],
  },
  {
    id: "cus-3",
    name: "MetalTrade Invest",
    industry: "Metal & Steel",
    city: "Navoiy",
    contactPerson: "Ravshan Yoldoshev",
    phone: "+998 79 223 55 66",
    email: "r.yoldoshev@metaltrade.uz",
    address: "Sanoat zonasi 3-uchastka, Navoiy",
    usualRoutes: ["Navoiy → Tashkent", "Tashkent → Navoiy"],
  },
  {
    id: "cus-4",
    name: "Fergana AgroExport",
    industry: "Agriculture",
    city: "Fergana",
    contactPerson: "Malika Yusupova",
    phone: "+998 73 244 66 77",
    email: "m.yusupova@ferganaagro.uz",
    address: "Marg'ilon shoh ko'chasi 44, Fergana",
    usualRoutes: ["Fergana → Tashkent"],
  },
  {
    id: "cus-5",
    name: "Bukhara Ceramics Co.",
    industry: "Manufacturing",
    city: "Bukhara",
    contactPerson: "Gulnora Sharipova",
    phone: "+998 65 255 77 88",
    email: "g.sharipova@bukharaceramics.uz",
    address: "Hunarmandlar ko'chasi 8, Bukhara",
    usualRoutes: ["Bukhara → Samarkand"],
    notes: "Faqat ertalab soat 8-11 orasida yuk qabul qiladi",
  },
  {
    id: "cus-6",
    name: "Nukus Chemical Plant",
    industry: "Chemicals",
    city: "Nukus",
    contactPerson: "Ulugbek Nazarov",
    phone: "+998 61 266 88 99",
    email: "u.nazarov@nukuschem.uz",
    address: "Sanoat ko'chasi 21, Nukus",
    usualRoutes: ["Nukus → Urgench"],
    notes: "Xavfli yuk uchun qo'shimcha hujjatlar talab qilinadi",
  },
  {
    id: "cus-7",
    name: "Andijan Auto Parts",
    industry: "Automotive",
    city: "Andijan",
    contactPerson: "Otabek Yusupov",
    phone: "+998 74 277 99 00",
    email: "o.yusupov@andijanautoparts.uz",
    address: "Bobur shoh ko'chasi 17, Andijan",
    usualRoutes: ["Andijan → Namangan"],
  },
  {
    id: "cus-8",
    name: "Tashkent Retail Chain",
    industry: "Retail",
    city: "Tashkent",
    contactPerson: "Shahnoza Tosheva",
    phone: "+998 71 211 33 44",
    email: "s.tosheva@tashretail.uz",
    address: "Yunusobod tumani, Amir Temur shoh ko'chasi 108, Tashkent",
    usualRoutes: ["Tashkent → Nukus", "Tashkent → Samarkand"],
    notes: "Yirik hajmli buyurtmalar uchun 5% chegirma kelishilgan",
  },
];

function history(entries: [string, string][]): StatusHistoryEntry[] {
  return entries.map(([status, at]) => ({ status: status as Order["status"], at }));
}

export const orders: Order[] = [
  {
    id: "ORD-2026-00201",
    customerId: "cus-2",
    contactPerson: "Sardor Aliyev",
    cargo: "Packaged food",
    weightTons: 3,
    packageCount: 40,
    origin: "Samarkand",
    destination: "Bukhara",
    pickupDate: hoursFromNow(48),
    deliveryDate: hoursFromNow(72),
    amount: 980,
    operator: "Nodira Karimova",
    driverId: null,
    vehicleId: null,
    status: "draft",
    statusHistory: history([["draft", hoursAgo(1)]]),
    notes: "Mijoz tasdiqlashi kutilmoqda",
    createdAt: hoursAgo(1),
  },
  {
    id: "ORD-2026-00202",
    customerId: "cus-7",
    contactPerson: "Otabek Yusupov",
    cargo: "Auto parts",
    weightTons: 2,
    packageCount: 15,
    origin: "Andijan",
    destination: "Namangan",
    pickupDate: hoursFromNow(20),
    deliveryDate: hoursFromNow(40),
    amount: 640,
    operator: "Nodira Karimova",
    driverId: null,
    vehicleId: null,
    status: "pending",
    statusHistory: history([
      ["draft", hoursAgo(2)],
      ["pending", hoursAgo(1.5)],
    ]),
    createdAt: hoursAgo(2),
  },
  {
    id: "ORD-2026-00203",
    customerId: "cus-6",
    contactPerson: "Ulugbek Nazarov",
    cargo: "Chemical drums (small batch)",
    weightTons: 1.5,
    packageCount: 10,
    origin: "Nukus",
    destination: "Urgench",
    pickupDate: hoursFromNow(15),
    deliveryDate: hoursFromNow(28),
    amount: 520,
    operator: "Jahongir Mirzayev",
    driverId: null,
    vehicleId: null,
    status: "pending",
    statusHistory: history([
      ["draft", hoursAgo(4)],
      ["pending", hoursAgo(3.5)],
    ]),
    createdAt: hoursAgo(4),
  },
  {
    id: "ORD-2026-00204",
    customerId: "cus-6",
    contactPerson: "Ulugbek Nazarov",
    cargo: "Chemical drums",
    weightTons: 6,
    packageCount: 24,
    origin: "Nukus",
    destination: "Urgench",
    pickupDate: hoursFromNow(6),
    deliveryDate: hoursFromNow(30),
    amount: 1320,
    operator: "Jahongir Mirzayev",
    driverId: "drv-8",
    vehicleId: "veh-8",
    status: "assigned",
    statusHistory: history([
      ["draft", hoursAgo(20)],
      ["pending", hoursAgo(19)],
      ["assigned", hoursAgo(3)],
    ]),
    createdAt: hoursAgo(20),
  },
  {
    id: "ORD-2026-00205",
    customerId: "cus-5",
    contactPerson: "Gulnora Sharipova",
    cargo: "Ceramic tiles",
    weightTons: 4,
    packageCount: 60,
    origin: "Bukhara",
    destination: "Samarkand",
    pickupDate: hoursFromNow(8),
    deliveryDate: hoursFromNow(32),
    amount: 890,
    operator: "Jahongir Mirzayev",
    driverId: "drv-7",
    vehicleId: "veh-7",
    status: "assigned",
    statusHistory: history([
      ["draft", hoursAgo(10)],
      ["pending", hoursAgo(9)],
      ["assigned", hoursAgo(2)],
    ]),
    createdAt: hoursAgo(10),
  },
  {
    id: "ORD-2026-00206",
    customerId: "cus-8",
    contactPerson: "Shahnoza Tosheva",
    cargo: "Retail goods",
    weightTons: 9,
    packageCount: 80,
    origin: "Tashkent",
    destination: "Nukus",
    pickupDate: hoursAgo(20),
    deliveryDate: hoursAgo(10),
    amount: 2650,
    operator: "Jahongir Mirzayev",
    driverId: "drv-6",
    vehicleId: "veh-6",
    status: "picked_up",
    statusHistory: history([
      ["draft", hoursAgo(36)],
      ["pending", hoursAgo(35)],
      ["assigned", hoursAgo(30)],
      ["picked_up", hoursAgo(20)],
    ]),
    createdAt: hoursAgo(36),
  },
  {
    id: "ORD-2026-00207",
    customerId: "cus-1",
    contactPerson: "Aziza Rahimova",
    cargo: "Cotton textiles",
    weightTons: 12,
    packageCount: 200,
    origin: "Tashkent",
    destination: "Almaty",
    pickupDate: hoursAgo(4),
    deliveryDate: hoursFromNow(10),
    amount: 3200,
    operator: "Nodira Karimova",
    driverId: "drv-1",
    vehicleId: "veh-2",
    status: "in_transit",
    statusHistory: history([
      ["draft", hoursAgo(6)],
      ["pending", hoursAgo(5.5)],
      ["assigned", hoursAgo(5)],
      ["picked_up", hoursAgo(4)],
      ["in_transit", hoursAgo(3.5)],
    ]),
    createdAt: hoursAgo(6),
  },
  {
    id: "ORD-2026-00208",
    customerId: "cus-3",
    contactPerson: "Ravshan Yoldoshev",
    cargo: "Steel rebar",
    weightTons: 18,
    packageCount: 10,
    origin: "Navoiy",
    destination: "Tashkent",
    pickupDate: hoursAgo(20),
    deliveryDate: hoursAgo(4),
    amount: 4100,
    operator: "Jahongir Mirzayev",
    driverId: "drv-3",
    vehicleId: "veh-3",
    status: "in_transit",
    statusHistory: history([
      ["draft", hoursAgo(30)],
      ["pending", hoursAgo(29)],
      ["assigned", hoursAgo(27)],
      ["picked_up", hoursAgo(20)],
      ["in_transit", hoursAgo(19)],
    ]),
    createdAt: hoursAgo(30),
  },
  {
    id: "ORD-2026-00209",
    customerId: "cus-4",
    contactPerson: "Malika Yusupova",
    cargo: "Dried fruits",
    weightTons: 5,
    packageCount: 100,
    origin: "Fergana",
    destination: "Tashkent",
    pickupDate: daysAgo(2),
    deliveryDate: daysAgo(1),
    amount: 1750,
    operator: "Nodira Karimova",
    driverId: "drv-4",
    vehicleId: "veh-4",
    status: "delivered",
    statusHistory: history([
      ["draft", daysAgo(2)],
      ["pending", daysAgo(2)],
      ["assigned", daysAgo(2)],
      ["picked_up", daysAgo(2)],
      ["in_transit", daysAgo(2)],
      ["delivered", daysAgo(1)],
    ]),
    createdAt: daysAgo(2),
  },
  {
    id: "ORD-2026-00210",
    customerId: "cus-2",
    contactPerson: "Sardor Aliyev",
    cargo: "Beverages",
    weightTons: 6,
    packageCount: 150,
    origin: "Samarkand",
    destination: "Tashkent",
    pickupDate: daysAgo(4),
    deliveryDate: daysAgo(3),
    amount: 1120,
    operator: "Jahongir Mirzayev",
    driverId: "drv-2",
    vehicleId: "veh-1",
    status: "delivered",
    statusHistory: history([
      ["draft", daysAgo(4)],
      ["pending", daysAgo(4)],
      ["assigned", daysAgo(4)],
      ["picked_up", daysAgo(4)],
      ["in_transit", daysAgo(4)],
      ["delivered", daysAgo(3)],
    ]),
    createdAt: daysAgo(4),
  },
  {
    id: "ORD-2026-00211",
    customerId: "cus-3",
    contactPerson: "Ravshan Yoldoshev",
    cargo: "Steel coils",
    weightTons: 16,
    packageCount: 8,
    origin: "Tashkent",
    destination: "Navoiy",
    pickupDate: daysAgo(3),
    deliveryDate: daysAgo(2),
    amount: 3750,
    operator: "Nodira Karimova",
    driverId: "drv-5",
    vehicleId: "veh-5",
    status: "delivered",
    statusHistory: history([
      ["draft", daysAgo(3)],
      ["pending", daysAgo(3)],
      ["assigned", daysAgo(3)],
      ["picked_up", daysAgo(3)],
      ["in_transit", daysAgo(3)],
      ["delivered", daysAgo(2)],
    ]),
    createdAt: daysAgo(3),
  },
  {
    id: "ORD-2026-00212",
    customerId: "cus-5",
    contactPerson: "Gulnora Sharipova",
    cargo: "Ceramic tiles",
    weightTons: 4,
    packageCount: 55,
    origin: "Bukhara",
    destination: "Samarkand",
    pickupDate: daysAgo(2),
    deliveryDate: daysAgo(1),
    amount: 970,
    operator: "Jahongir Mirzayev",
    driverId: "drv-7",
    vehicleId: "veh-7",
    status: "delivered",
    statusHistory: history([
      ["draft", daysAgo(2)],
      ["pending", daysAgo(2)],
      ["assigned", daysAgo(2)],
      ["picked_up", daysAgo(2)],
      ["in_transit", daysAgo(2)],
      ["delivered", daysAgo(1)],
    ]),
    createdAt: daysAgo(2),
  },
  {
    id: "ORD-2026-00213",
    customerId: "cus-7",
    contactPerson: "Otabek Yusupov",
    cargo: "Auto parts sample",
    weightTons: 1,
    packageCount: 5,
    origin: "Andijan",
    destination: "Namangan",
    pickupDate: daysAgo(5),
    deliveryDate: daysAgo(4),
    amount: 450,
    operator: "Nodira Karimova",
    driverId: null,
    vehicleId: null,
    status: "cancelled",
    statusHistory: history([
      ["draft", daysAgo(5)],
      ["pending", daysAgo(5)],
      ["cancelled", daysAgo(4.5)],
    ]),
    notes: "Mijoz buyurtmani bekor qildi",
    createdAt: daysAgo(5),
  },
];

export const invoices: Invoice[] = [
  {
    id: "INV-2026-5001",
    customerId: "cus-4",
    orderId: "ORD-2026-00209",
    amount: 1750,
    issuedAt: daysAgo(1),
    dueAt: hoursFromNow(240),
    payments: [
      { id: "PAY-1001", amount: 1750, method: "bank_transfer", paidAt: hoursAgo(12) },
    ],
  },
  {
    id: "INV-2026-5002",
    customerId: "cus-2",
    orderId: "ORD-2026-00210",
    amount: 1120,
    issuedAt: daysAgo(4),
    dueAt: daysAgo(1),
    payments: [],
  },
  {
    id: "INV-2026-5003",
    customerId: "cus-3",
    orderId: "ORD-2026-00211",
    amount: 3750,
    issuedAt: daysAgo(3),
    dueAt: hoursFromNow(48),
    payments: [
      { id: "PAY-1002", amount: 2000, method: "cash", paidAt: daysAgo(1) },
    ],
  },
  {
    id: "INV-2026-5004",
    customerId: "cus-5",
    orderId: "ORD-2026-00212",
    amount: 970,
    issuedAt: daysAgo(1),
    dueAt: hoursFromNow(240),
    payments: [],
  },
];

export const expenses: Expense[] = [
  { id: "EXP-1001", category: "fuel", amount: 180, date: daysAgo(2), orderId: "ORD-2026-00209", vehicleId: "veh-4", driverId: "drv-4" },
  { id: "EXP-1002", category: "driver_advance", amount: 100, date: daysAgo(2), orderId: "ORD-2026-00209", driverId: "drv-4" },
  { id: "EXP-1003", category: "toll", amount: 25, date: daysAgo(2), orderId: "ORD-2026-00209", vehicleId: "veh-4" },
  { id: "EXP-1004", category: "fuel", amount: 140, date: daysAgo(4), orderId: "ORD-2026-00210", vehicleId: "veh-1", driverId: "drv-2" },
  { id: "EXP-1005", category: "toll", amount: 20, date: daysAgo(4), orderId: "ORD-2026-00210", vehicleId: "veh-1" },
  { id: "EXP-1006", category: "fuel", amount: 320, date: daysAgo(3), orderId: "ORD-2026-00211", vehicleId: "veh-5", driverId: "drv-5" },
  { id: "EXP-1007", category: "driver_advance", amount: 150, date: daysAgo(3), orderId: "ORD-2026-00211", driverId: "drv-5" },
  { id: "EXP-1008", category: "toll", amount: 40, date: daysAgo(3), orderId: "ORD-2026-00211", vehicleId: "veh-5" },
  { id: "EXP-1009", category: "repair", amount: 200, date: daysAgo(3), orderId: "ORD-2026-00211", vehicleId: "veh-5", notes: "Shina almashtirish" },
  { id: "EXP-1010", category: "fuel", amount: 110, date: daysAgo(2), orderId: "ORD-2026-00212", vehicleId: "veh-7", driverId: "drv-7" },
  { id: "EXP-1011", category: "toll", amount: 15, date: daysAgo(2), orderId: "ORD-2026-00212", vehicleId: "veh-7" },
  { id: "EXP-1012", category: "fuel", amount: 300, date: hoursAgo(5), orderId: "ORD-2026-00207", vehicleId: "veh-2", driverId: "drv-1" },
  { id: "EXP-1013", category: "toll", amount: 60, date: hoursAgo(5), orderId: "ORD-2026-00207", vehicleId: "veh-2", notes: "Chegara o'tish to'lovi" },
  { id: "EXP-1014", category: "fuel", amount: 280, date: hoursAgo(19), orderId: "ORD-2026-00208", vehicleId: "veh-3", driverId: "drv-3" },
  { id: "EXP-1015", category: "repair", amount: 450, date: hoursAgo(18), orderId: "ORD-2026-00208", vehicleId: "veh-3", notes: "Yo'lda dvigatel nosozligi tuzatildi — kechikishga sabab bo'ldi" },
  { id: "EXP-1016", category: "toll", amount: 30, date: hoursAgo(19), orderId: "ORD-2026-00208", vehicleId: "veh-3" },
  { id: "EXP-1017", category: "fuel", amount: 250, date: hoursAgo(20), orderId: "ORD-2026-00206", vehicleId: "veh-6", driverId: "drv-6" },
  { id: "EXP-1018", category: "driver_advance", amount: 80, date: hoursAgo(20), orderId: "ORD-2026-00206", driverId: "drv-6" },
  { id: "EXP-1019", category: "repair", amount: 450, date: hoursAgo(6), vehicleId: "veh-4", notes: "Rejadan tashqari texnik xizmat" },
  { id: "EXP-1020", category: "other", amount: 60, date: daysAgo(1), notes: "Ofis xarajatlari" },
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
        DEMO_EPOCH - (deltas.length - 1 - i) * 24 * 60 * 60 * 1000,
      ).toISOString(),
      revenue,
      expenses: Math.round(revenue * 0.62),
    };
  });
}

export const revenueTrend: RevenuePoint[] = buildRevenueTrend();

export function isOrderDelayed(order: Order): boolean {
  if (order.status === "delivered" || order.status === "cancelled") return false;
  return new Date(order.deliveryDate).getTime() < DEMO_EPOCH;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function isWithinLastDay(iso: string): boolean {
  return DEMO_EPOCH - new Date(iso).getTime() < ONE_DAY_MS;
}

export function wasOrderLate(order: Order): boolean {
  if (order.status === "cancelled") return false;
  if (order.status === "delivered") {
    const deliveredEntry = order.statusHistory.find((h) => h.status === "delivered");
    if (!deliveredEntry) return false;
    return new Date(deliveredEntry.at).getTime() > new Date(order.deliveryDate).getTime();
  }
  return isOrderDelayed(order);
}

export function getOnTimeDeliveryRate(allOrders: Order[]): number {
  const delivered = allOrders.filter((o) => o.status === "delivered");
  if (delivered.length === 0) return 100;
  const onTime = delivered.filter((o) => !wasOrderLate(o)).length;
  return Math.round((onTime / delivered.length) * 100);
}

export function getDriverDelayCount(driverId: string, allOrders: Order[]): number {
  return allOrders.filter((o) => o.driverId === driverId && wasOrderLate(o)).length;
}

export function isLicenseExpiringSoon(iso: string, withinDays = 30): boolean {
  const diffDays = (new Date(iso).getTime() - DEMO_EPOCH) / ONE_DAY_MS;
  return diffDays >= 0 && diffDays <= withinDays;
}

export function isMaintenanceDueSoon(iso: string, withinDays = 14): boolean {
  const diffDays = (new Date(iso).getTime() - DEMO_EPOCH) / ONE_DAY_MS;
  return diffDays <= withinDays;
}

export function isDeliveryDueSoon(order: Order, withinHours = 3): boolean {
  if (order.status === "delivered" || order.status === "cancelled") return false;
  if (isOrderDelayed(order)) return false;
  const diffHours = (new Date(order.deliveryDate).getTime() - DEMO_EPOCH) / (60 * 60 * 1000);
  return diffHours >= 0 && diffHours <= withinHours;
}

export function isOrderUnassignedTooLong(order: Order, withinHours = 3): boolean {
  if (order.status !== "pending") return false;
  const ageHours = (DEMO_EPOCH - new Date(order.createdAt).getTime()) / (60 * 60 * 1000);
  return ageHours >= withinHours;
}

export function getCustomerOrders(customerId: string, allOrders: Order[]): Order[] {
  return allOrders
    .filter((o) => o.customerId === customerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getCustomerLifetimeValue(customerId: string, allOrders: Order[]): number {
  return allOrders
    .filter((o) => o.customerId === customerId && o.status === "delivered")
    .reduce((sum, o) => sum + o.amount, 0);
}

export function getInvoicePaidAmount(invoice: Invoice): number {
  return invoice.payments.reduce((sum, p) => sum + p.amount, 0);
}

export function getInvoiceRemaining(invoice: Invoice): number {
  return invoice.amount - getInvoicePaidAmount(invoice);
}

export function getInvoiceStatus(invoice: Invoice): InvoiceStatus {
  const paid = getInvoicePaidAmount(invoice);
  if (paid >= invoice.amount) return "paid";
  if (paid > 0) return "partially_paid";
  if (new Date(invoice.dueAt).getTime() < DEMO_EPOCH) return "overdue";
  return "sent";
}

export function getCustomerInvoices(customerId: string, allInvoices: Invoice[]): Invoice[] {
  return allInvoices.filter((i) => i.customerId === customerId);
}

export function getCustomerOutstandingBalance(
  customerId: string,
  allInvoices: Invoice[],
): number {
  return allInvoices
    .filter((i) => i.customerId === customerId)
    .reduce((sum, i) => sum + getInvoiceRemaining(i), 0);
}

export function getCustomer(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export function getOrderExpenses(orderId: string, allExpenses: Expense[]): Expense[] {
  return allExpenses.filter((e) => e.orderId === orderId);
}

export function getOrderProfit(order: Order, allExpenses: Expense[]): number {
  const cost = getOrderExpenses(order.id, allExpenses).reduce((sum, e) => sum + e.amount, 0);
  return order.amount - cost;
}

export function getExpensesByCategory(
  allExpenses: Expense[],
): Record<ExpenseCategory, number> {
  const totals: Record<ExpenseCategory, number> = {
    fuel: 0,
    driver_advance: 0,
    toll: 0,
    repair: 0,
    loading: 0,
    other: 0,
  };
  for (const e of allExpenses) {
    totals[e.category] += e.amount;
  }
  return totals;
}

export function getVehicleRevenue(vehicleId: string, allOrders: Order[]): number {
  return allOrders
    .filter((o) => o.vehicleId === vehicleId && o.status === "delivered")
    .reduce((sum, o) => sum + o.amount, 0);
}

export function getVehicleExpenseTotal(vehicleId: string, allExpenses: Expense[]): number {
  return allExpenses
    .filter((e) => e.vehicleId === vehicleId)
    .reduce((sum, e) => sum + e.amount, 0);
}

export interface RouteProfitability {
  route: string;
  orderCount: number;
  revenue: number;
  cost: number;
  profit: number;
}

export function getRouteProfitability(
  allOrders: Order[],
  allExpenses: Expense[],
): RouteProfitability[] {
  const byRoute = new Map<string, Order[]>();
  for (const o of allOrders) {
    if (o.status !== "delivered") continue;
    const route = `${o.origin} → ${o.destination}`;
    byRoute.set(route, [...(byRoute.get(route) ?? []), o]);
  }

  return Array.from(byRoute.entries())
    .map(([route, routeOrders]) => {
      const revenue = routeOrders.reduce((sum, o) => sum + o.amount, 0);
      const cost = routeOrders.reduce(
        (sum, o) => sum + getOrderExpenses(o.id, allExpenses).reduce((s, e) => s + e.amount, 0),
        0,
      );
      return { route, orderCount: routeOrders.length, revenue, cost, profit: revenue - cost };
    })
    .sort((a, b) => b.profit - a.profit);
}

export function getDriver(id: string | null | undefined): Driver | undefined {
  if (!id) return undefined;
  return drivers.find((d) => d.id === id);
}

export function getVehicle(id: string | null | undefined): Vehicle | undefined {
  if (!id) return undefined;
  return vehicles.find((v) => v.id === id);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - DEMO_EPOCH;
  const diffHours = Math.round(diffMs / (60 * 60 * 1000));
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour");
  }
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}
