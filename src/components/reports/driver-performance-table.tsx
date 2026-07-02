"use client";

import { Star } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDriverDelayCount } from "@/lib/mock-data";
import { useAppData } from "@/lib/store";

export function DriverPerformanceTable() {
  const { drivers, orders } = useAppData();

  const ranked = [...drivers].sort((a, b) => b.onTimeRate - a.onTimeRate);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Driver Performance</CardTitle>
        <CardDescription>Ranked by on-time delivery rate</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Deliveries</TableHead>
              <TableHead className="text-right">On-time</TableHead>
              <TableHead className="text-right">Delays</TableHead>
              <TableHead className="text-right">Rating</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-right">{d.completedDeliveries}</TableCell>
                <TableCell className="text-right">{d.onTimeRate}%</TableCell>
                <TableCell
                  className={
                    getDriverDelayCount(d.id, orders) > 0
                      ? "text-right text-destructive"
                      : "text-right text-muted-foreground"
                  }
                >
                  {getDriverDelayCount(d.id, orders)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3.5 fill-chart-3 text-chart-3" />
                    {d.rating.toFixed(1)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
