import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "@/components/settings/settings-view";

/// Addressable so that "Profile" in the user menu and "Members" in an
/// invitation email can land where they say they will, and so the back button
/// works inside Settings like it does everywhere else. Same `?tab=` contract as
/// Billing, Finance and Reports.
const SETTINGS_TABS = ["general", "identity", "members", "profile"] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export type SettingsSearch = {
  tab?: SettingsTab;
};

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [{ title: "Settings — FlowERP AI" }],
  }),
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const tab = search.tab;
    return {
      tab: (SETTINGS_TABS as readonly unknown[]).includes(tab) ? (tab as SettingsTab) : undefined,
    };
  },
  component: SettingsView,
});
