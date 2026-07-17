import { ToolRegistry } from "./tool-registry";
import type { AiTool } from "./tool.interface";
import type { ReadTools } from "./read.tools";
import type { WriteTools } from "./write.tools";
import type { AnalyticsTools } from "./analytics.tools";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";

function makeTool(overrides: Partial<AiTool> = {}): AiTool {
  return {
    name: "test_tool",
    description: "A test tool.",
    parameters: { type: "object", properties: {} },
    allowedRoles: ["ADMIN", "OPERATIONS_MANAGER"],
    mutating: false,
    handler: async () => ({ ok: true }),
    ...overrides,
  };
}

function makeRegistry(tools: AiTool[]): ToolRegistry {
  const readTools = { all: () => tools } as unknown as ReadTools;
  const writeTools = { all: () => [] } as unknown as WriteTools;
  const analyticsTools = { all: () => [] } as unknown as AnalyticsTools;
  return new ToolRegistry(readTools, writeTools, analyticsTools);
}

const ADMIN_ACTOR: CurrentUserPayload = {
  userId: "u1",
  membershipId: "m1",
  email: "admin@test.com",
  organizationId: "org1",
  role: "ADMIN",
  isPlatformAdmin: false,
};

const DRIVER_ACTOR: CurrentUserPayload = {
  userId: "u2",
  membershipId: "m2",
  email: "driver@test.com",
  organizationId: "org1",
  role: "DRIVER",
  isPlatformAdmin: false,
};

describe("ToolRegistry", () => {
  describe("forUser()", () => {
    it("returns tools allowed for the user's role", () => {
      const registry = makeRegistry([makeTool({ name: "admin_only", allowedRoles: ["ADMIN"] })]);
      const tools = registry.forUser(ADMIN_ACTOR);
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("admin_only");
    });

    it("excludes tools not allowed for the user's role", () => {
      const registry = makeRegistry([makeTool({ name: "admin_only", allowedRoles: ["ADMIN"] })]);
      const tools = registry.forUser(DRIVER_ACTOR);
      expect(tools).toHaveLength(0);
    });

    it("includes tools when role is in the allowed set", () => {
      const registry = makeRegistry([
        makeTool({ name: "ops_tool", allowedRoles: ["ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"] }),
      ]);
      const actor: CurrentUserPayload = { ...DRIVER_ACTOR, role: "DISPATCHER" };
      const tools = registry.forUser(actor);
      expect(tools).toHaveLength(1);
    });

    it("excludes mutating tools when readOnly option is set", () => {
      const registry = makeRegistry([
        makeTool({ name: "read_tool", mutating: false, allowedRoles: ["ADMIN"] }),
        makeTool({ name: "write_tool", mutating: true, allowedRoles: ["ADMIN"] }),
      ]);
      const tools = registry.forUser(ADMIN_ACTOR, { readOnly: true });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("read_tool");
    });
  });

  describe("isAllowed()", () => {
    it("returns true when the role matches", () => {
      const registry = makeRegistry([makeTool({ name: "my_tool", allowedRoles: ["ADMIN"] })]);
      expect(registry.isAllowed("my_tool", "ADMIN")).toBe(true);
    });

    it("returns false when the role does not match", () => {
      const registry = makeRegistry([makeTool({ name: "my_tool", allowedRoles: ["ADMIN"] })]);
      expect(registry.isAllowed("my_tool", "DRIVER")).toBe(false);
    });

    it("returns false for an unknown tool name", () => {
      const registry = makeRegistry([makeTool()]);
      expect(registry.isAllowed("nonexistent", "ADMIN")).toBe(false);
    });
  });

  describe("definitionsFor()", () => {
    it("produces LLM-compatible tool definitions from the registry", () => {
      const registry = makeRegistry([
        makeTool({
          name: "search_orders",
          description: "Search open orders.",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            additionalProperties: false,
          },
        }),
      ]);
      const defs = registry.definitionsFor(ADMIN_ACTOR);
      expect(defs).toHaveLength(1);
      expect(defs[0]).toMatchObject({
        name: "search_orders",
        description: "Search open orders.",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      });
    });
  });

  describe("get()", () => {
    it("returns the tool by name", () => {
      const registry = makeRegistry([makeTool({ name: "search_customers" })]);
      const tool = registry.get("search_customers");
      expect(tool).toBeDefined();
      expect(tool!.name).toBe("search_customers");
    });

    it("returns undefined for unknown tools", () => {
      const registry = makeRegistry([]);
      expect(registry.get("nonexistent")).toBeUndefined();
    });
  });
});
