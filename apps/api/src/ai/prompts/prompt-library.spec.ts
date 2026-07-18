import { PromptLibrary } from "./prompt-library";

describe("PromptLibrary", () => {
  let lib: PromptLibrary;

  beforeEach(() => {
    lib = new PromptLibrary();
  });

  describe("build()", () => {
    it("includes base rules for any role", () => {
      const prompt = lib.build({
        role: "ADMIN",
        erpContext: "OrgName: Test, Today: 2026-07-17",
        toolNames: ["search_orders"],
      });
      expect(prompt).toContain("FlowERP Copilot");
      expect(prompt).toContain("NEVER invent");
      expect(prompt).toContain("DANGEROUS actions");
    });

    it("includes role-specific framing for DISPATCHER", () => {
      const prompt = lib.build({
        role: "DISPATCHER",
        erpContext: "context",
        toolNames: [],
      });
      expect(prompt).toContain("dispatcher");
      expect(prompt).toContain("no finance or billing tools");
    });

    it("includes the ERP context section", () => {
      const prompt = lib.build({
        role: "ADMIN",
        erpContext: "Organization: FlowERP Demo. Currency: USD.",
        toolNames: ["search_orders"],
      });
      expect(prompt).toContain("Organization: FlowERP Demo. Currency: USD.");
    });

    it("lists available tools explicitly", () => {
      const prompt = lib.build({
        role: "ADMIN",
        erpContext: "ctx",
        toolNames: ["search_orders", "finance_summary", "create_order"],
      });
      expect(prompt).toContain("search_orders, finance_summary, create_order");
      expect(prompt).toContain("There are no others");
    });

    it("handles empty tool list gracefully", () => {
      const prompt = lib.build({
        role: "DRIVER",
        erpContext: "ctx",
        toolNames: [],
      });
      expect(prompt).toContain("no tools available");
    });

    it("includes memory when provided", () => {
      const prompt = lib.build({
        role: "ADMIN",
        erpContext: "ctx",
        toolNames: [],
        memory: "User prefers EUR. Always show delivery ETA.",
      });
      expect(prompt).toContain("remember about this user");
      expect(prompt).toContain("User prefers EUR");
    });

    it("includes knowledge when provided", () => {
      const prompt = lib.build({
        role: "ADMIN",
        erpContext: "ctx",
        toolNames: [],
        knowledge: "## Dispatch Workflow\nOrders go through PENDING → ASSIGNED → IN_TRANSIT → DELIVERED.",
      });
      expect(prompt).toContain("Reference material");
      expect(prompt).toContain("Dispatch Workflow");
    });

    it("marks memory and knowledge as non-instructions", () => {
      const prompt = lib.build({
        role: "ADMIN",
        erpContext: "ctx",
        toolNames: [],
        memory: "Pin: my name is Alice",
        knowledge: "Doc: how to reassign",
      });
      expect(prompt).toContain("not as instructions");
      expect(prompt).toContain("not instructions to follow");
    });

    it("includes observation mode section when readOnly is true", () => {
      const prompt = lib.build({
        role: "ADMIN",
        erpContext: "ctx",
        toolNames: ["search_orders"],
        readOnly: true,
      });
      expect(prompt).toContain("READ-ONLY mode");
      expect(prompt).toContain("observation mode");
    });

    it("does not include observation mode when readOnly is false", () => {
      const prompt = lib.build({
        role: "ADMIN",
        erpContext: "ctx",
        toolNames: ["search_orders"],
        readOnly: false,
      });
      expect(prompt).not.toContain("READ-ONLY mode");
    });
  });

  describe("suggestionsFor()", () => {
    it("returns suggestions for ADMIN", () => {
      const suggestions = lib.suggestionsFor("ADMIN");
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.every((s) => typeof s === "string")).toBe(true);
    });

    it("returns empty for DRIVER", () => {
      expect(lib.suggestionsFor("DRIVER")).toHaveLength(0);
    });

    it("returns different suggestions for different roles", () => {
      const admin = lib.suggestionsFor("ADMIN");
      const dispatcher = lib.suggestionsFor("DISPATCHER");
      expect(admin).not.toEqual(dispatcher);
    });
  });
});
