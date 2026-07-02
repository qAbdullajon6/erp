import { Users } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function CustomersPage() {
  return (
    <ComingSoon
      icon={Users}
      title="Customers / CRM module"
      description="View customer companies, order history and outstanding balances. Coming next."
    />
  );
}
