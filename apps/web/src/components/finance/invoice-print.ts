import type { Invoice } from '@/lib/api/invoices';
import { formatMoney, formatDate } from '@/lib/format';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type InvoicePrintContext = {
  invoice: Invoice;
  organizationName?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerCountry?: string | null;
  orderNumber?: string | null;
};

function billingLines(ctx: InvoicePrintContext): string {
  const parts = [
    ctx.customerAddress,
    [ctx.customerCity, ctx.customerCountry].filter(Boolean).join(', '),
  ].filter((p) => p && String(p).trim());
  if (parts.length === 0) return '';
  return parts.map((p) => `<p class="muted" style="margin:0.2rem 0 0">${escapeHtml(p)}</p>`).join('');
}

/// Printable invoice via a hidden iframe — avoids window.open(..., 'noopener')
/// which browsers resolve to `null` while still leaving a blank tab.
export function printInvoiceDocument(ctx: InvoicePrintContext): void {
  const { invoice, organizationName, customerName, orderNumber } = ctx;
  const org = organizationName?.trim() || 'FlowERP';
  const lines =
    invoice.lineItems
      ?.map(
        (li) => `<tr>
      <td>${escapeHtml(li.description)}</td>
      <td class="num">${escapeHtml(li.quantity)}</td>
      <td class="num">${escapeHtml(formatMoney(li.unitPrice, invoice.currency))}</td>
      <td class="num">${escapeHtml(formatMoney(li.lineTotal, invoice.currency))}</td>
    </tr>`,
      )
      .join('') ?? '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #111; margin: 0; padding: 2rem; background: #fff; }
    .sheet { max-width: 800px; margin: 0 auto; }
    .logo {
      width: 48px; height: 48px; border-radius: 10px; border: 1px solid #ddd;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 0.85rem; color: #333; background: #f7f7f7;
      flex-shrink: 0;
    }
    .brand { font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
    .muted { color: #666; font-size: 0.875rem; }
    .row { display: flex; justify-content: space-between; gap: 2rem; margin-top: 1.5rem; }
    .brand-row { display: flex; align-items: center; gap: 0.75rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.25rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; font-size: 0.875rem; }
    th, td { padding: 0.6rem 0.5rem; border-bottom: 1px solid #e5e5e5; text-align: left; vertical-align: top; }
    th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { margin-top: 1rem; margin-left: auto; width: 280px; font-size: 0.875rem; }
    .totals div { display: flex; justify-content: space-between; padding: 0.35rem 0; }
    .totals .grand { font-weight: 700; border-top: 1px solid #111; margin-top: 0.35rem; padding-top: 0.5rem; }
    .badge { display: inline-block; border: 1px solid #ccc; border-radius: 999px; padding: 0.15rem 0.55rem; font-size: 0.75rem; text-transform: capitalize; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="row" style="align-items:flex-start;margin-top:0">
      <div class="brand-row">
        <div class="logo" aria-hidden="true">${escapeHtml(org.slice(0, 2).toUpperCase())}</div>
        <div>
          <p class="brand">${escapeHtml(org)}</p>
          <p class="muted" style="margin:0.25rem 0 0">Tax invoice</p>
        </div>
      </div>
      <div style="text-align:right">
        <h1>Invoice ${escapeHtml(invoice.invoiceNumber)}</h1>
        <span class="badge">${escapeHtml(invoice.status.replace(/_/g, ' ').toLowerCase())}</span>
      </div>
    </div>

    <div class="row">
      <div>
        <p class="muted" style="margin:0">Bill to</p>
        <p style="margin:0.25rem 0 0;font-weight:600">${escapeHtml(customerName || invoice.customerId)}</p>
        ${billingLines(ctx)}
        ${orderNumber ? `<p class="muted" style="margin:0.45rem 0 0">Order ${escapeHtml(orderNumber)}</p>` : ''}
      </div>
      <div style="text-align:right">
        <p class="muted" style="margin:0">Issue date</p>
        <p style="margin:0.15rem 0 0.75rem">${escapeHtml(formatDate(invoice.issueDate))}</p>
        <p class="muted" style="margin:0">Created</p>
        <p style="margin:0.15rem 0 0.75rem">${escapeHtml(formatDate(invoice.createdAt))}</p>
        <p class="muted" style="margin:0">Due date</p>
        <p style="margin:0.15rem 0 0">${invoice.dueDate ? escapeHtml(formatDate(invoice.dueDate)) : '—'}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit price</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lines || `<tr><td colspan="4" class="muted">No line items</td></tr>`}
      </tbody>
    </table>

    <div class="totals">
      <div><span class="muted">Subtotal</span><span>${escapeHtml(formatMoney(invoice.subtotal, invoice.currency))}</span></div>
      <div><span class="muted">Discount</span><span>-${escapeHtml(formatMoney(invoice.discountAmount, invoice.currency))}</span></div>
      <div><span class="muted">Tax</span><span>+${escapeHtml(formatMoney(invoice.taxAmount, invoice.currency))}</span></div>
      <div class="grand"><span>Total</span><span>${escapeHtml(formatMoney(invoice.totalAmount, invoice.currency))}</span></div>
      <div><span class="muted">Paid</span><span>${escapeHtml(formatMoney(invoice.paidAmount, invoice.currency))}</span></div>
      <div><span style="font-weight:600">Balance due</span><span style="font-weight:600">${escapeHtml(formatMoney(invoice.balanceDue, invoice.currency))}</span></div>
    </div>

    ${
      invoice.notes
        ? `<p class="muted" style="margin-top:2rem"><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</p>`
        : ''
    }
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', `Print invoice ${invoice.invoiceNumber}`);
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    iframe.remove();
    return;
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 500);
  };

  const triggerPrint = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      cleanup();
    }
  };

  // Give the browser a tick to layout before opening the print dialog.
  if (frameDoc.readyState === 'complete') {
    setTimeout(triggerPrint, 50);
  } else {
    iframe.addEventListener('load', () => setTimeout(triggerPrint, 50), { once: true });
  }
}
