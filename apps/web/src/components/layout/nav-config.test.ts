import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAV,
  getNavForRole,
  isNavSectionActive,
  resolveBreadcrumbTrail,
  resolveCurrentPage,
} from "./nav-config";

const labelsFor = (role: Parameters<typeof getNavForRole>[0]) =>
  getNavForRole(role, false, { devTools: false }).map((item) => item.label);

describe("top-level navigation", () => {
  it("offers an admin eleven destinations, not twenty-two", () => {
    expect(labelsFor("ADMIN")).toEqual([
      "Overview",
      "Orders",
      "Dispatch",
      "Customers",
      "Fleet Tracking",
      "Vehicles",
      "Drivers",
      "Finance",
      "Reports",
      "AI Assistant",
      "Settings",
    ]);
  });

  it("never links Integrations, whose endpoints no controller serves", () => {
    const everyLabel = DEFAULT_NAV.flatMap((item) => [
      item.label,
      ...(item.children ?? []).map((child) => child.label),
    ]);
    expect(everyLabel).not.toContain("Integrations");
  });

  it("keeps a driver on the three screens the API will serve them", () => {
    expect(labelsFor("DRIVER")).toEqual(["Home", "Jobs", "Settings"]);
  });

  it("hides fleet screens from roles their controllers reject", () => {
    expect(labelsFor("ACCOUNTANT")).not.toContain("Fleet Tracking");
    expect(labelsFor("SALES_CRM_MANAGER")).not.toContain("Dispatch");
  });
});

describe("section children", () => {
  const childrenOf = (
    role: Parameters<typeof getNavForRole>[0],
    label: string,
    devTools = false,
  ) =>
    getNavForRole(role, false, { devTools })
      .find((item) => item.label === label)
      ?.children?.map((child) => child.label) ?? [];

  it("gives an admin every configuration screen under Settings", () => {
    expect(childrenOf("ADMIN", "Settings")).toEqual([
      "Billing",
      "Notifications",
      "Data import",
      "Automation",
      "Developer",
      "Activity log",
    ]);
  });

  it("withholds a Settings child whose API would reject the role", () => {
    // Billing is @Roles("ADMIN") — a dispatcher clicking it would get a 403,
    // and they cannot read the audit log either.
    const dispatcher = childrenOf("DISPATCHER", "Settings");
    expect(dispatcher).not.toContain("Billing");
    expect(dispatcher).not.toContain("Activity log");
    expect(dispatcher).toContain("Data import");
  });

  it("only links Tracking Debug in development, where its controller exists", () => {
    expect(childrenOf("ADMIN", "Fleet Tracking", false)).not.toContain("Diagnostics");
    expect(childrenOf("ADMIN", "Fleet Tracking", true)).toContain("Diagnostics");
  });
});

describe("resolving the current section", () => {
  const settings = DEFAULT_NAV.find((item) => item.label === "Settings")!;
  const tracking = DEFAULT_NAV.find((item) => item.label === "Fleet Tracking")!;

  it("treats a child route as part of its parent section even on a different path", () => {
    expect(isNavSectionActive("/app/billing", settings)).toBe(true);
    expect(isNavSectionActive("/app/devices", tracking)).toBe(true);
  });

  it("does not claim unrelated routes", () => {
    expect(isNavSectionActive("/app/orders", settings)).toBe(false);
  });

  it("titles the page after the child, not the section", () => {
    expect(resolveCurrentPage("/app/devices")?.label).toBe("Devices");
    expect(resolveCurrentPage("/app/fleet-tracking/debug")?.label).toBe("Diagnostics");
    expect(resolveCurrentPage("/app/orders/create")?.label).toBe("Orders");
    expect(resolveCurrentPage("/app")?.label).toBe("Overview");
  });
});

describe("breadcrumb trail", () => {
  const labels = (pathname: string) => resolveBreadcrumbTrail(pathname).map((c) => c.label);

  it("names the section above a nested screen", () => {
    // The whole point: /app/devices does not contain its parent's path, so
    // without this the user is told "Devices" and nothing about where that is.
    expect(labels("/app/devices")).toEqual(["Fleet Tracking", "Devices"]);
    expect(labels("/app/billing")).toEqual(["Settings", "Billing"]);
    expect(labels("/app/dispatches/analytics")).toEqual(["Dispatch", "Analytics"]);
  });

  it("links the section to the section's own route, not the child's", () => {
    expect(resolveBreadcrumbTrail("/app/devices")[0].path).toBe("/app/fleet-tracking");
  });

  it("stays a single crumb for a top-level screen", () => {
    // "Operations / Orders" would name a sidebar heading that is not a page.
    expect(labels("/app/orders")).toEqual(["Orders"]);
    expect(labels("/app")).toEqual(["Overview"]);
  });

  it("keeps a detail route under its list's crumb", () => {
    expect(labels("/app/orders/create")).toEqual(["Orders"]);
  });
});
