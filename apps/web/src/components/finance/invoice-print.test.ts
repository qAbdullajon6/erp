import { describe, expect, it } from 'vitest';
import type { Invoice } from '@/lib/api/invoices';
import type { Organization } from '@/lib/api/organizations';
import { buildInvoiceDocumentHtml } from './invoice-print';

/// The invoice printed for a customer used to say "FlowERP" for every tenant,
/// because the only company value it received was a display name. These cover
/// the wiring from Settings → Company through to the document itself.

const invoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-0001',
  customerId: 'cus-1',
  status: 'SENT',
  currency: 'UZS',
  issueDate: '2026-05-01T00:00:00.000Z',
  dueDate: '2026-05-31T00:00:00.000Z',
  createdAt: '2026-05-01T00:00:00.000Z',
  subtotal: '100.00',
  discountAmount: '0.00',
  taxAmount: '12.00',
  totalAmount: '112.00',
  paidAmount: '0.00',
  balanceDue: '112.00',
  lineItems: [],
} as unknown as Invoice;

function organization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    name: 'Sunrise',
    slug: 'sunrise',
    status: 'ACTIVE',
    defaultCurrency: 'UZS',
    timezone: 'Asia/Tashkent',
    legalName: null,
    registrationNumber: null,
    taxId: null,
    email: null,
    phone: null,
    website: null,
    address: null,
    city: null,
    postalCode: null,
    country: null,
    logoUrl: null,
    ...overrides,
  };
}

describe('buildInvoiceDocumentHtml', () => {
  it('prints the registered legal name in preference to the trading name', () => {
    const html = buildInvoiceDocumentHtml({
      invoice,
      organization: organization({ legalName: 'Sunrise Logistics LLC' }),
    });

    expect(html).toContain('Sunrise Logistics LLC');
  });

  it('falls back to the trading name when no legal name is set', () => {
    const html = buildInvoiceDocumentHtml({ invoice, organization: organization() });

    expect(html).toContain('Sunrise');
    expect(html).not.toContain('FlowERP');
  });

  it('prints tax identity, address and contact details', () => {
    const html = buildInvoiceDocumentHtml({
      invoice,
      organization: organization({
        legalName: 'Sunrise Logistics LLC',
        registrationNumber: 'REG-889201',
        taxId: 'VAT-3310049',
        address: '12 Amir Temur Avenue',
        city: 'Tashkent',
        postalCode: '100084',
        country: 'Uzbekistan',
        phone: '+998 71 200 30 40',
        email: 'billing@sunrise.test',
        website: 'https://sunrise.test',
      }),
    });

    expect(html).toContain('Reg. no. REG-889201');
    expect(html).toContain('Tax ID VAT-3310049');
    expect(html).toContain('12 Amir Temur Avenue');
    expect(html).toContain('Tashkent 100084, Uzbekistan');
    expect(html).toContain('+998 71 200 30 40');
    expect(html).toContain('billing@sunrise.test');
    expect(html).toContain('https://sunrise.test');
  });

  /// An unset column must not become a blank line on a customer-facing page.
  it('omits identity lines that are not filled in', () => {
    const html = buildInvoiceDocumentHtml({
      invoice,
      organization: organization({ legalName: 'Sunrise Logistics LLC', taxId: 'VAT-1' }),
    });

    expect(html).toContain('Tax ID VAT-1');
    expect(html).not.toContain('Reg. no.');
    expect(html).not.toContain('<p class="muted" style="margin:0.15rem 0 0"></p>');
  });

  it('renders the logo when one is configured, and initials when not', () => {
    const withLogo = buildInvoiceDocumentHtml({
      invoice,
      organization: organization({ logoUrl: 'https://cdn.sunrise.test/logo.png' }),
    });
    expect(withLogo).toContain('<img class="logo-img" src="https://cdn.sunrise.test/logo.png"');

    // The class name also appears in the stylesheet, so this has to look for
    // the element itself rather than the string.
    const withoutLogo = buildInvoiceDocumentHtml({ invoice, organization: organization() });
    expect(withoutLogo).not.toContain('<img class="logo-img"');
    expect(withoutLogo).toContain('>SU<');
  });

  /// The API only stores http(s) logo URLs, but the document is written into a
  /// blank iframe where anything else would resolve to nothing — so the
  /// renderer refuses rather than emitting a broken image.
  it('ignores a logo URL that is not absolute http(s)', () => {
    const html = buildInvoiceDocumentHtml({
      invoice,
      organization: organization({ logoUrl: '/uploads/logo.png' }),
    });

    expect(html).not.toContain('<img class="logo-img"');
    expect(html).toContain('>SU<');
  });

  it('still renders when the company has not been loaded yet', () => {
    const html = buildInvoiceDocumentHtml({ invoice, organization: null });

    expect(html).toContain('FlowERP');
    expect(html).toContain('INV-0001');
  });

  it('escapes company values instead of letting them inject markup', () => {
    const html = buildInvoiceDocumentHtml({
      invoice,
      organization: organization({ legalName: '<script>alert(1)</script>' }),
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
