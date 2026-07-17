import type { FieldDefinition } from "./field-types";

/// The extensibility seam.
///
/// Adding a sixth importable entity means adding an EntityDefinition here and
/// nothing else: the parser, validator, mapper, preview, conflict handling and
/// error reporting are all driven off this table. There is deliberately no
/// per-entity branching anywhere in the engine — if you find yourself writing
/// `if (entityType === "Order")` outside this file, the registry is missing an
/// expressive enough field.

/// Names a side effect that must happen inside the same transaction as the
/// row's insert. Declared here as data; the engine resolves the name to an
/// injected implementation (see ImportExecutionService.postCreateHooks), so the
/// registry stays free of DI and the engine stays free of entity branching.
export type PostCreateHookName = "orderStatusHistory";

export interface EntityDefinition {
  /// Matches the frontend's entity dropdown value and ImportSession.entityType.
  entityType: string;
  label: string;
  /// The Prisma model delegate name, used for the generic create/update path.
  prismaModel: "customer" | "driver" | "vehicle" | "expense" | "order";
  /// Runs in the insert's transaction, for entities whose creation is not just
  /// a row. Absent for entities where it is.
  postCreateHook?: PostCreateHookName;
  /// The field that identifies a record as "the same one" for duplicate
  /// detection. Every importable entity has a human-meaningful natural key —
  /// matching on database id would be useless, since a file exported from
  /// another system has none of ours.
  naturalKey: string;
  /// Auto-generated when the file omits the natural key. Without this a
  /// customer migrating 5,000 rows would have to invent 5,000 codes by hand.
  /// The engine allocates them sequentially per organization.
  naturalKeyPrefix?: string;
  fields: FieldDefinition[];
  /// Roles permitted to import this entity, on top of the module-wide guard.
  /// Fleet data is deliberately narrower than customer data.
  allowedRoles: readonly string[];
}

const ADMIN_OPS = ["ADMIN", "OPERATIONS_MANAGER"] as const;
const ADMIN_OPS_SALES = ["ADMIN", "OPERATIONS_MANAGER", "SALES_CRM_MANAGER"] as const;
const ADMIN_OPS_ACCOUNTANT = ["ADMIN", "OPERATIONS_MANAGER", "ACCOUNTANT"] as const;
const ADMIN_OPS_DISPATCHER = ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"] as const;

const CUSTOMER: EntityDefinition = {
  entityType: "Customer",
  label: "Customers",
  prismaModel: "customer",
  naturalKey: "customerCode",
  naturalKeyPrefix: "CUS",
  allowedRoles: ADMIN_OPS_SALES,
  fields: [
    {
      fieldName: "customerCode", label: "Customer Code", type: "string", required: false,
      aliases: ["customer code", "code", "customer id", "customer_code", "client code", "account number"],
      maxLength: 50, example: "CUS-0001",
    },
    {
      fieldName: "companyName", label: "Company Name", type: "string", required: true,
      aliases: ["company name", "company", "name", "customer name", "client", "client name", "organisation", "organization"],
      maxLength: 200, example: "Acme Logistics LLC",
    },
    {
      fieldName: "contactName", label: "Contact Name", type: "string", required: true,
      aliases: ["contact name", "contact", "contact person", "primary contact", "attn"],
      maxLength: 200, example: "Jane Doe",
    },
    {
      fieldName: "email", label: "Email", type: "email", required: false,
      aliases: ["email", "e-mail", "email address", "contact email"], example: "jane@acme.com",
    },
    {
      fieldName: "phone", label: "Phone", type: "phone", required: false,
      aliases: ["phone", "telephone", "tel", "phone number", "mobile", "contact phone"],
      example: "+15550109999",
    },
    {
      fieldName: "country", label: "Country", type: "string", required: false,
      aliases: ["country"], maxLength: 100, example: "Uzbekistan",
    },
    {
      fieldName: "city", label: "City", type: "string", required: false,
      aliases: ["city", "town"], maxLength: 100, example: "Tashkent",
    },
    {
      fieldName: "address", label: "Address", type: "string", required: false,
      aliases: ["address", "street", "street address", "address line 1"], maxLength: 300,
      example: "12 Amir Temur St",
    },
    {
      fieldName: "taxId", label: "Tax ID", type: "string", required: false,
      aliases: ["tax id", "taxid", "vat", "vat number", "tax number", "inn"], maxLength: 50,
      example: "123456789",
    },
    {
      fieldName: "paymentTerms", label: "Payment Terms", type: "enum", required: false,
      aliases: ["payment terms", "terms", "payment term"],
      enumValues: ["DUE_ON_RECEIPT", "NET_15", "NET_30", "NET_45"],
      defaultValue: "NET_30", example: "NET_30",
    },
    {
      fieldName: "creditLimit", label: "Credit Limit", type: "decimal", required: false,
      aliases: ["credit limit", "creditlimit", "limit"], min: 0, defaultValue: 0, example: "50000",
    },
    {
      fieldName: "status", label: "Status", type: "enum", required: false,
      aliases: ["status", "customer status", "state"],
      enumValues: ["ACTIVE", "AT_RISK", "INACTIVE", "ARCHIVED"],
      defaultValue: "ACTIVE", example: "ACTIVE",
    },
  ],
};

const DRIVER: EntityDefinition = {
  entityType: "Driver",
  label: "Drivers",
  prismaModel: "driver",
  naturalKey: "employeeCode",
  naturalKeyPrefix: "DRV",
  allowedRoles: ADMIN_OPS_DISPATCHER,
  fields: [
    {
      fieldName: "employeeCode", label: "Employee Code", type: "string", required: false,
      aliases: ["employee code", "code", "employee id", "driver code", "driver id", "staff id"],
      maxLength: 50, example: "DRV-0001",
    },
    {
      fieldName: "firstName", label: "First Name", type: "string", required: true,
      aliases: ["first name", "firstname", "given name", "forename"], maxLength: 100, example: "Ivan",
    },
    {
      fieldName: "lastName", label: "Last Name", type: "string", required: true,
      aliases: ["last name", "lastname", "surname", "family name"], maxLength: 100, example: "Petrov",
    },
    {
      fieldName: "phone", label: "Phone", type: "phone", required: true,
      aliases: ["phone", "telephone", "tel", "mobile", "phone number"], example: "+998901234567",
    },
    {
      fieldName: "email", label: "Email", type: "email", required: false,
      aliases: ["email", "e-mail", "email address"], example: "ivan@carrier.com",
    },
    {
      fieldName: "status", label: "Status", type: "enum", required: false,
      aliases: ["status", "driver status", "state"],
      enumValues: ["ACTIVE", "INACTIVE", "ON_LEAVE"], defaultValue: "ACTIVE", example: "ACTIVE",
    },
    {
      fieldName: "licenseNumber", label: "License Number", type: "string", required: false,
      aliases: ["license number", "licence number", "license", "licence", "driving licence", "license no"],
      maxLength: 50, example: "AB1234567",
    },
    {
      fieldName: "licenseExpiry", label: "License Expiry", type: "date", required: false,
      aliases: ["license expiry", "licence expiry", "license expiration", "license valid until"],
      example: "2028-05-31",
    },
  ],
};

const VEHICLE: EntityDefinition = {
  entityType: "Vehicle",
  label: "Vehicles",
  prismaModel: "vehicle",
  naturalKey: "vehicleCode",
  naturalKeyPrefix: "VEH",
  allowedRoles: ADMIN_OPS_DISPATCHER,
  fields: [
    {
      fieldName: "vehicleCode", label: "Vehicle Code", type: "string", required: false,
      aliases: ["vehicle code", "code", "vehicle id", "unit", "unit number", "fleet number"],
      maxLength: 50, example: "VEH-0001",
    },
    {
      fieldName: "plateNumber", label: "Plate Number", type: "string", required: true,
      aliases: ["plate number", "plate", "licence plate", "license plate", "registration", "reg", "number plate"],
      maxLength: 20, example: "01A123BC",
    },
    {
      fieldName: "type", label: "Type", type: "string", required: true,
      aliases: ["type", "vehicle type", "body type", "category"], maxLength: 50, example: "Truck",
    },
    {
      fieldName: "capacityKg", label: "Capacity (kg)", type: "decimal", required: false,
      aliases: ["capacity kg", "capacity", "max weight", "payload", "weight capacity", "tonnage"],
      min: 0, example: "20000",
    },
    {
      fieldName: "capacityM3", label: "Capacity (m³)", type: "decimal", required: false,
      aliases: ["capacity m3", "volume", "max volume", "volume capacity", "cbm"],
      min: 0, example: "86",
    },
    {
      fieldName: "status", label: "Status", type: "enum", required: false,
      aliases: ["status", "vehicle status", "state"],
      enumValues: ["AVAILABLE", "IN_USE", "MAINTENANCE", "INACTIVE"],
      defaultValue: "AVAILABLE", example: "AVAILABLE",
    },
    {
      fieldName: "make", label: "Make", type: "string", required: false,
      aliases: ["make", "manufacturer", "brand"], maxLength: 50, example: "Volvo",
    },
    {
      fieldName: "model", label: "Model", type: "string", required: false,
      aliases: ["model"], maxLength: 50, example: "FH16",
    },
    {
      fieldName: "year", label: "Year", type: "integer", required: false,
      aliases: ["year", "model year", "manufacture year"],
      min: 1900, max: 2100, example: "2021",
    },
    {
      fieldName: "insuranceExpiry", label: "Insurance Expiry", type: "date", required: false,
      aliases: ["insurance expiry", "insurance expiration", "insurance valid until"], example: "2027-01-31",
    },
    {
      fieldName: "inspectionExpiry", label: "Inspection Expiry", type: "date", required: false,
      aliases: ["inspection expiry", "inspection expiration", "mot", "technical inspection"],
      example: "2027-03-31",
    },
  ],
};

const EXPENSE: EntityDefinition = {
  entityType: "Expense",
  label: "Expenses",
  prismaModel: "expense",
  naturalKey: "expenseNumber",
  naturalKeyPrefix: "EXP",
  allowedRoles: ADMIN_OPS_ACCOUNTANT,
  fields: [
    {
      fieldName: "expenseNumber", label: "Expense Number", type: "string", required: false,
      aliases: ["expense number", "number", "expense id", "reference", "receipt number", "doc number"],
      maxLength: 50, example: "EXP-0001",
    },
    {
      fieldName: "expenseDate", label: "Expense Date", type: "date", required: true,
      aliases: ["expense date", "date", "transaction date", "receipt date"], example: "2026-07-01",
    },
    {
      fieldName: "category", label: "Category", type: "enum", required: true,
      aliases: ["category", "expense category", "type", "expense type"],
      enumValues: ["FUEL", "TOLL", "MAINTENANCE", "DRIVER_ADVANCE", "PARKING", "INSURANCE", "OTHER"],
      example: "FUEL",
    },
    {
      fieldName: "description", label: "Description", type: "string", required: true,
      aliases: ["description", "details", "memo", "notes", "purpose"], maxLength: 500,
      example: "Diesel refuel, Tashkent depot",
    },
    {
      fieldName: "amount", label: "Amount", type: "decimal", required: true,
      // min: 0 rejects negatives — a refund is not an expense with a minus
      // sign in this model, and silently importing one would corrupt totals.
      aliases: ["amount", "total", "cost", "value", "sum"], min: 0, example: "450.00",
    },
    {
      fieldName: "currency", label: "Currency", type: "currency", required: false,
      aliases: ["currency", "ccy"], defaultValue: "USD", example: "USD",
    },
    {
      fieldName: "status", label: "Status", type: "enum", required: false,
      aliases: ["status", "expense status", "approval status"],
      enumValues: ["PENDING", "APPROVED", "REJECTED"], defaultValue: "PENDING", example: "PENDING",
    },
    {
      fieldName: "driverId", label: "Driver (code)", type: "reference", required: false,
      aliases: ["driver", "driver code", "employee code", "driver id"],
      referenceEntity: "Driver", example: "DRV-0001",
    },
    {
      fieldName: "vehicleId", label: "Vehicle (code)", type: "reference", required: false,
      aliases: ["vehicle", "vehicle code", "unit", "plate", "plate number"],
      referenceEntity: "Vehicle", example: "VEH-0001",
    },
    {
      fieldName: "notes", label: "Notes", type: "string", required: false,
      aliases: ["notes", "comment", "comments", "remarks"], maxLength: 1000, example: "",
    },
  ],
};

const ORDER: EntityDefinition = {
  entityType: "Order",
  label: "Orders",
  prismaModel: "order",
  naturalKey: "orderNumber",
  naturalKeyPrefix: "ORD",
  // ADR-001/AR2: an Order and its opening OrderStatusHistory row are one fact.
  // A bare order.create would produce an order with no history — invisible to
  // the projection and to the dispatch board. Imported orders are born DRAFT,
  // exactly as OrdersService.create makes them.
  postCreateHook: "orderStatusHistory",
  allowedRoles: ADMIN_OPS,
  fields: [
    {
      fieldName: "orderNumber", label: "Order Number", type: "string", required: false,
      aliases: ["order number", "number", "order id", "reference", "ref", "job number", "shipment number"],
      maxLength: 50, example: "ORD-2026-0001",
    },
    {
      fieldName: "customerId", label: "Customer (code or name)", type: "reference", required: true,
      aliases: ["customer", "customer code", "client", "customer name", "client name", "account"],
      referenceEntity: "Customer", example: "CUS-0001",
    },
    {
      fieldName: "pickupAddress", label: "Pickup Address", type: "string", required: true,
      aliases: ["pickup address", "pickup", "origin address", "collection address", "from address", "origin"],
      maxLength: 300, example: "12 Amir Temur St",
    },
    {
      fieldName: "pickupCity", label: "Pickup City", type: "string", required: true,
      aliases: ["pickup city", "origin city", "from city", "collection city", "from"],
      maxLength: 100, example: "Tashkent",
    },
    {
      fieldName: "pickupDate", label: "Pickup Date", type: "date", required: true,
      aliases: ["pickup date", "collection date", "origin date", "ship date"], example: "2026-08-01",
    },
    {
      fieldName: "deliveryAddress", label: "Delivery Address", type: "string", required: true,
      aliases: ["delivery address", "delivery", "destination address", "to address", "destination"],
      maxLength: 300, example: "5 Navoi St",
    },
    {
      fieldName: "deliveryCity", label: "Delivery City", type: "string", required: true,
      aliases: ["delivery city", "destination city", "to city", "to"], maxLength: 100, example: "Samarkand",
    },
    {
      fieldName: "deliveryDate", label: "Delivery Date", type: "date", required: true,
      aliases: ["delivery date", "destination date", "eta", "due date"], example: "2026-08-03",
    },
    {
      fieldName: "cargoDescription", label: "Cargo Description", type: "string", required: true,
      aliases: ["cargo description", "cargo", "goods", "description", "commodity", "freight"],
      maxLength: 500, example: "Palletised dry goods",
    },
    {
      fieldName: "cargoWeightKg", label: "Cargo Weight (kg)", type: "decimal", required: false,
      aliases: ["cargo weight kg", "weight", "cargo weight", "gross weight", "kg"],
      min: 0, example: "12000",
    },
    {
      fieldName: "cargoVolumeM3", label: "Cargo Volume (m³)", type: "decimal", required: false,
      aliases: ["cargo volume m3", "volume", "cargo volume", "cbm", "m3"], min: 0, example: "40",
    },
    {
      fieldName: "price", label: "Price", type: "decimal", required: true,
      aliases: ["price", "amount", "rate", "freight cost", "total", "revenue"], min: 0, example: "1500.00",
    },
    {
      fieldName: "currency", label: "Currency", type: "currency", required: false,
      aliases: ["currency", "ccy"], defaultValue: "USD", example: "USD",
    },
    {
      fieldName: "notes", label: "Notes", type: "string", required: false,
      aliases: ["notes", "comment", "comments", "remarks", "internal notes"], maxLength: 1000, example: "",
    },
    {
      fieldName: "deliveryNotes", label: "Delivery Notes", type: "string", required: false,
      aliases: ["delivery notes", "delivery instructions", "instructions"], maxLength: 1000, example: "",
    },
  ],
};

const REGISTRY: readonly EntityDefinition[] = [CUSTOMER, ORDER, DRIVER, VEHICLE, EXPENSE];

export const IMPORT_ENTITY_TYPES = REGISTRY.map((e) => e.entityType);

export function getEntityDefinition(entityType: string): EntityDefinition | null {
  return REGISTRY.find((e) => e.entityType === entityType) ?? null;
}

export function listEntityDefinitions(): readonly EntityDefinition[] {
  return REGISTRY;
}
