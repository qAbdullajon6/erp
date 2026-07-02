"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DriverTable } from "@/components/drivers/driver-table";
import { VehicleTable } from "@/components/drivers/vehicle-table";

export function DriversVehiclesView() {
  return (
    <Tabs defaultValue="drivers">
      <TabsList>
        <TabsTrigger value="drivers">Drivers</TabsTrigger>
        <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
      </TabsList>
      <TabsContent value="drivers" className="mt-4">
        <DriverTable />
      </TabsContent>
      <TabsContent value="vehicles" className="mt-4">
        <VehicleTable />
      </TabsContent>
    </Tabs>
  );
}
