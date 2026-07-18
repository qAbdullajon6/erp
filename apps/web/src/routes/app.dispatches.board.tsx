import { createFileRoute } from "@tanstack/react-router";
import { DispatchBoard } from "@/components/dispatch/dispatch-board";
import { ProtectedApiRoute } from "@/components/layout/protected-api-route";

export const Route = createFileRoute("/app/dispatches/board")({
  component: DispatchBoardPage,
});

function DispatchBoardPage() {
  return (
    <ProtectedApiRoute>
      <DispatchBoard />
    </ProtectedApiRoute>
  );
}
