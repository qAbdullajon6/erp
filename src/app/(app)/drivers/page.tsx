import { Truck } from "lucide-react";
import { ComingSoon } from "@/components/layout/coming-soon";

export default function DriversPage() {
  return (
    <ComingSoon
      icon={Truck}
      title="Drivers & Vehicles module"
      description="Manage your fleet, driver availability and delivery history. Coming next."
    />
  );
}
