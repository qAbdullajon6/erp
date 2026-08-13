import { createFileRoute } from "@tanstack/react-router";
import { DispatchBoard } from "@/components/dispatch/dispatch-board";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";
import { DISPATCH_ROLES } from "@/lib/role-access";

export const Route = createFileRoute("/app/dispatches/board")({
  head: () => ({
    meta: [{ title: "Dispatch Board — FlowERP AI" }],
  }),
  component: DispatchBoardPage,
});

function DispatchBoardPage() {
  return (
    <ProtectedApiRoute requireRoles={DISPATCH_ROLES}>
      <DispatchBoard />
    </ProtectedApiRoute>
  );
}
