import { createFileRoute } from "@tanstack/react-router";
import { DispatchesDetail } from "@/components/dispatch/dispatches-detail";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { DISPATCH_ROLES } from "@/lib/role-access";
import {
  parseTimelineFilter,
  type TimelineFilterCategory,
} from "@/components/dispatch/dispatch-operational-timeline.builder";

export type DispatchDetailSearch = {
  /** Timeline filter — URL-persisted like Calendar filters. */
  tlFilter?: TimelineFilterCategory;
  /** Timeline search query. */
  tlQ?: string;
};

export const Route = createFileRoute("/app/dispatches/$dispatchId")({
  validateSearch: (search: Record<string, unknown>): DispatchDetailSearch => {
    const out: DispatchDetailSearch = {};
    const tlFilter = parseTimelineFilter(search.tlFilter);
    if (tlFilter !== "all") out.tlFilter = tlFilter;
    if (typeof search.tlQ === "string" && search.tlQ.trim()) {
      out.tlQ = search.tlQ.trim().slice(0, 200);
    }
    return out;
  },
  component: DispatchesDetailPage,
});

function DispatchesDetailPage() {
  const { dispatchId } = Route.useParams();

  return (
    <ProtectedApiRoute requireRoles={DISPATCH_ROLES}>
      <DispatchesDetail dispatchId={dispatchId} />
    </ProtectedApiRoute>
  );
}
