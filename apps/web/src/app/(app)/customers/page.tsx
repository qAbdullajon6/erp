import { CustomersView } from "@/components/customers/customers-view";
import { CustomersConnectedView } from "@/components/customers/customers-connected-view";
import { getDataMode } from "@/lib/data-mode";

export default function CustomersPage() {
  return getDataMode() === "api" ? <CustomersConnectedView /> : <CustomersView />;
}
