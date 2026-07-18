import { Injectable, NotFoundException } from "@nestjs/common";
import { InvoicesService } from "../../invoices/invoices.service";
import type { CurrentCustomerPayload } from "../auth/interfaces/current-customer.interface";
import type { ListInvoicesQueryDto } from "../../invoices/dto/list-invoices-query.dto";

@Injectable()
export class CustomerInvoicesService {
  constructor(private readonly invoices: InvoicesService) {}

  async list(payload: CurrentCustomerPayload, query: ListInvoicesQueryDto) {
    return this.invoices.list(payload.organizationId, {
      ...query,
      customerId: payload.customerId,
    });
  }

  async getById(payload: CurrentCustomerPayload, id: string) {
    const invoice = await this.invoices.getById(payload.organizationId, id);
    this.assertOwned(invoice, payload);
    return invoice;
  }

  /// See CustomerOrdersService.assertOwned — 403 vs 404 is a distinguishable
  /// signal that lets a customer enumerate other customers' invoice ids;
  /// every cross-customer scope check in this module returns 404 for exactly
  /// this reason.
  private assertOwned(invoice: { customerId: string }, payload: CurrentCustomerPayload): void {
    if (invoice.customerId !== payload.customerId) {
      throw new NotFoundException("Invoice not found");
    }
  }
}
