import { createFileRoute } from "@tanstack/react-router";
import { DispatchCalendar } from "@/components/dispatch/dispatch-calendar";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { DISPATCH_ROLES } from "@/lib/role-access";
import {
  parseCalendarDate,
  parseCalendarView,
  toDateParam,
  type CalendarView,
} from "@/components/dispatch/dispatch-calendar-utils";
import {
  parseCalendarPreset,
  parseCalendarKpiFocus,
  parseCalendarStatus,
  parseOptionalDateParam,
  parseOptionalId,
  parseOptionalQuery,
  type CalendarDatePreset,
  type CalendarStatusFilter,
} from "@/components/dispatch/dispatch-calendar-filters";

export type CalendarSearch = {
  view?: CalendarView;
  date?: string;
  driver?: string;
  vehicle?: string;
  customer?: string;
  /// Named distinctly from Orders `status` so TanStack's global search union
  /// does not merge DispatchStatus into OrderStatus (breaks /app/orders).
  dispatchStatus?: CalendarStatusFilter;
  q?: string;
  preset?: CalendarDatePreset;
  from?: string;
  to?: string;
  kpiFocus?: 'active' | 'delayed' | 'completed' | 'conflicts';
};

export const Route = createFileRoute("/app/dispatches/calendar")({
  head: () => ({
    meta: [{ title: "Dispatch Calendar — FlowERP AI" }],
  }),
  validateSearch: (search: Record<string, unknown>): CalendarSearch => {
    const out: CalendarSearch = {
      view: parseCalendarView(search.view),
      date: toDateParam(parseCalendarDate(search.date)),
    };
    const driver = parseOptionalId(search.driver);
    const vehicle = parseOptionalId(search.vehicle);
    const customer = parseOptionalId(search.customer);
    const dispatchStatus =
      parseCalendarStatus(search.dispatchStatus) ?? parseCalendarStatus(search.status);
    const q = parseOptionalQuery(search.q);
    const preset = parseCalendarPreset(search.preset);
    const from = parseOptionalDateParam(search.from);
    const to = parseOptionalDateParam(search.to);
    const kpiFocus = parseCalendarKpiFocus(search.kpiFocus);
    if (driver) out.driver = driver;
    if (vehicle) out.vehicle = vehicle;
    if (customer) out.customer = customer;
    if (dispatchStatus) out.dispatchStatus = dispatchStatus;
    if (q) out.q = q;
    if (preset) out.preset = preset;
    if (from) out.from = from;
    if (to) out.to = to;
    if (kpiFocus) out.kpiFocus = kpiFocus;
    return out;
  },
  component: DispatchCalendarPage,
});

function DispatchCalendarPage() {
  return (
    <ProtectedApiRoute requireRoles={DISPATCH_ROLES}>
      <DispatchCalendar />
    </ProtectedApiRoute>
  );
}
