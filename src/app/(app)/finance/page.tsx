import { Wallet } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function FinancePage() {
  return (
    <ComingSoon
      icon={Wallet}
      title="Finance module"
      description="Invoices, payments and profit overview. Coming next."
    />
  );
}
