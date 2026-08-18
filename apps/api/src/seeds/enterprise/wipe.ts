import type { PrismaClient } from '@prisma/client';
import { PREFIX } from './constants';

/**
 * Removes only enterprise-scale rows (CUS-E- / EMP-E- / …) from the test org.
 * Leaves the original seed-test-org demo fixtures intact.
 */
export async function wipeEnterpriseRows(
  prisma: PrismaClient,
  organizationId: string,
): Promise<void> {
  const customers = await prisma.customer.findMany({
    where: { organizationId, customerCode: { startsWith: PREFIX.customer } },
    select: { id: true },
  });
  const customerIds = customers.map((c) => c.id);

  const drivers = await prisma.driver.findMany({
    where: { organizationId, employeeCode: { startsWith: PREFIX.driver } },
    select: { id: true },
  });
  const driverIds = drivers.map((d) => d.id);

  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId, vehicleCode: { startsWith: PREFIX.vehicle } },
    select: { id: true },
  });
  const vehicleIds = vehicles.map((v) => v.id);

  const orders = await prisma.order.findMany({
    where: { organizationId, orderNumber: { startsWith: PREFIX.order } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  const dispatches = await prisma.dispatch.findMany({
    where: { organizationId, dispatchNumber: { startsWith: PREFIX.dispatch } },
    select: { id: true },
  });
  const dispatchIds = dispatches.map((d) => d.id);

  const invoices = await prisma.invoice.findMany({
    where: { organizationId, invoiceNumber: { startsWith: PREFIX.invoice } },
    select: { id: true },
  });
  const invoiceIds = invoices.map((i) => i.id);

  if (dispatchIds.length) {
    await prisma.dispatchDeliveryProof.deleteMany({ where: { dispatchId: { in: dispatchIds } } });
    await prisma.dispatchConflictState.deleteMany({ where: { dispatchId: { in: dispatchIds } } });
    await prisma.dispatchStatusHistory.deleteMany({ where: { dispatchId: { in: dispatchIds } } });
    await prisma.dispatchAssignment.deleteMany({ where: { dispatchId: { in: dispatchIds } } });
    await prisma.dispatch.deleteMany({ where: { id: { in: dispatchIds } } });
  }

  if (invoiceIds.length) {
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  }

  if (orderIds.length) {
    await prisma.orderDocument.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderNote.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }

  if (customerIds.length) {
    await prisma.customerPortalAccount.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  }

  if (driverIds.length) {
    await prisma.driver.deleteMany({ where: { id: { in: driverIds } } });
  }
  if (vehicleIds.length) {
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  }

  await prisma.notification.deleteMany({
    where: {
      organizationId,
      OR: [
        { type: { startsWith: 'ENTERPRISE_' } },
        { metadata: { path: ['seed'], equals: 'enterprise-seed-v1' } },
      ],
    },
  });

  await prisma.auditLog.deleteMany({
    where: {
      organizationId,
      OR: [
        { action: { startsWith: 'enterprise.' } },
        { metadata: { path: ['seed'], equals: 'enterprise-seed-v1' } },
      ],
    },
  });
}
