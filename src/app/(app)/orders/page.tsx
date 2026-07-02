import { Package } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function OrdersPage() {
  return (
    <ComingSoon
      icon={Package}
      title="Orders module"
      description="Create and track orders through Pending, Assigned, In Transit and Delivered stages. Coming next."
    />
  );
}
