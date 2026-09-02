import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export type DriverActionEventType =
  | "DRIVER_ACCEPTED"
  | "DRIVER_REJECTED"
  | "TRIP_STARTED"
  | "ARRIVED_PICKUP"
  | "ARRIVED_DELIVERY"
  | "LOADING"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "INTERMEDIATE_STOP_FAILED"
  | "BREAK_STARTED"
  | "BREAK_ENDED"
  | "POD_UPLOADED"
  | "FUEL_ADDED"
  | "EXPENSE_SUBMITTED"
  | "INSPECTION_COMPLETED"
  | "OPERATIONAL_STATUS_CHANGED"
  | "STATUS_CHANGED";

@Injectable()
export class DriverActionEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    organizationId: string,
    driverId: string,
    type: DriverActionEventType,
    opts: { dispatchId?: string; payload?: Prisma.InputJsonValue } = {},
  ): Promise<void> {
    await this.prisma.driverActionEvent.create({
      data: {
        organizationId,
        driverId,
        type,
        dispatchId: opts.dispatchId,
        payload: opts.payload ?? undefined,
      },
    });
  }
}
