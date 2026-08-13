import { useEffect, useState, type FormEvent } from 'react';
import { describeError } from '@/lib/api/describe-error';
import { SettingsField, SettingsReadOnlyField } from './settings-field';
import {
  SettingsFormActions,
  SettingsFormError,
  SettingsSection,
  SettingsSectionError,
  SettingsSectionSkeleton,
} from './settings-section';
import { useCompanyForm } from './use-company-form';

const FIELDS = [
  'legalName',
  'registrationNumber',
  'taxId',
  'email',
  'phone',
  'website',
  'address',
  'city',
  'postalCode',
  'country',
  'logoUrl',
] as const;

/// A wrong URL is the single most likely mistake here and it is invisible until
/// someone prints an invoice, so the preview loads the real image and says
/// plainly when it cannot be fetched.
function LogoPreview({ url, fallbackName }: { url: string; fallbackName: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');

  useEffect(() => {
    setStatus(url.trim() ? 'loading' : 'idle');
  }, [url]);

  const initials = fallbackName.slice(0, 2).toUpperCase();

  return (
    <div className="grid gap-2">
      <p className="text-[13px] font-medium text-foreground/90">Invoice header preview</p>
      <div className="flex items-center gap-3 rounded-lg border border-brand/10 bg-surface p-4">
        {status === 'loaded' ? (
          <img
            src={url}
            alt={`${fallbackName} logo`}
            className="h-12 w-12 rounded-lg border border-brand/10 object-contain"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-brand/10 bg-background text-xs font-bold text-muted-foreground"
          >
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{fallbackName}</p>
          <p className="text-xs text-muted-foreground">Tax invoice</p>
        </div>
      </div>

      {/* Kept out of the layout: this only exists to resolve the URL. */}
      {status === 'loading' && (
        <img
          src={url}
          alt=""
          aria-hidden="true"
          className="hidden"
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
      )}

      {status === 'error' && (
        <p role="status" className="text-xs text-destructive">
          That URL did not load an image. Documents will fall back to your company initials.
        </p>
      )}
      {status === 'idle' && (
        <p className="text-xs text-muted-foreground">
          No logo set — documents show your company initials.
        </p>
      )}
    </div>
  );
}

/// Everything here is printed on customer-facing documents, so the section says
/// so up front — an admin filling it in should know these values leave the
/// building rather than being internal metadata.
///
/// The logo used to sit in a section of its own, which meant one nav entry for
/// one text input, and made an admin preparing their first invoice visit two
/// places to answer a single question: what does my invoice say about me.
export function CompanyIdentitySection({ isAdmin }: { isAdmin: boolean }) {
  const form = useCompanyForm(FIELDS);

  if (form.isLoading) return <SettingsSectionSkeleton />;

  if (form.isError || !form.organization) {
    return (
      <SettingsSectionError
        message={describeError(form.error, 'Failed to load company details')}
        onRetry={() => form.refetch()}
      />
    );
  }

  const organization = form.organization;
  const displayName = organization.legalName?.trim() || organization.name;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await form.save((values) => {
      if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
        return 'Enter a valid billing email address, or leave it empty';
      }
      if (values.website.trim() && !/^https?:\/\/.+/i.test(values.website.trim())) {
        return 'Website must start with http:// or https://, or be left empty';
      }
      if (values.logoUrl.trim() && !/^https?:\/\/.+/i.test(values.logoUrl.trim())) {
        return 'Logo URL must start with http:// or https://, or be left empty';
      }
      return null;
    });
  };

  if (!isAdmin) {
    return (
      <SettingsSection
        title="Company identity"
        description="The registered identity and logo printed on your invoices and other customer-facing documents."
      >
        <div className="grid gap-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingsReadOnlyField label="Legal entity name" value={organization.legalName} />
            <SettingsReadOnlyField label="Registration number" value={organization.registrationNumber} />
            <SettingsReadOnlyField label="Tax / VAT number" value={organization.taxId} />
            <SettingsReadOnlyField label="Billing email" value={organization.email} />
            <SettingsReadOnlyField label="Phone" value={organization.phone} />
            <SettingsReadOnlyField label="Website" value={organization.website} />
            <SettingsReadOnlyField label="Street address" value={organization.address} />
            <SettingsReadOnlyField label="City" value={organization.city} />
            <SettingsReadOnlyField label="Postal code" value={organization.postalCode} />
            <SettingsReadOnlyField label="Country" value={organization.country} />
          </div>
          <div className="max-w-xl border-t border-brand/10 pt-5">
            <LogoPreview url={organization.logoUrl ?? ''} fallbackName={displayName} />
          </div>
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Company identity"
      description="Printed on every invoice and customer-facing document. Leave a field empty to keep it off the page."
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        <fieldset className="grid gap-5">
          <legend className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Registered identity
          </legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingsField
              id="company-legal-name"
              label="Legal entity name"
              value={form.values.legalName}
              onChange={(value) => form.setValue('legalName', value)}
              hint="The registered name, if it differs from your trading name. Invoices prefer this."
              maxLength={200}
            />
            <SettingsField
              id="company-registration-number"
              label="Registration number"
              value={form.values.registrationNumber}
              onChange={(value) => form.setValue('registrationNumber', value)}
              hint="Your state company-registration identifier."
              maxLength={100}
            />
            <SettingsField
              id="company-tax-id"
              label="Tax / VAT number"
              value={form.values.taxId}
              onChange={(value) => form.setValue('taxId', value)}
              hint="Required on a tax invoice in most jurisdictions."
              maxLength={100}
            />
          </div>
        </fieldset>

        <fieldset className="grid gap-5 border-t border-brand/10 pt-5">
          <legend className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Contact
          </legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingsField
              id="company-email"
              label="Billing email"
              type="email"
              value={form.values.email}
              onChange={(value) => form.setValue('email', value)}
              hint="Where customers reply about an invoice — a shared mailbox, not a person."
              maxLength={255}
            />
            <SettingsField
              id="company-phone"
              label="Phone"
              type="tel"
              value={form.values.phone}
              onChange={(value) => form.setValue('phone', value)}
              maxLength={50}
            />
            <SettingsField
              id="company-website"
              label="Website"
              type="url"
              value={form.values.website}
              onChange={(value) => form.setValue('website', value)}
              placeholder="https://example.com"
              maxLength={300}
            />
          </div>
        </fieldset>

        <fieldset className="grid gap-5 border-t border-brand/10 pt-5">
          <legend className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Registered address
          </legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingsField
              id="company-address"
              label="Street address"
              value={form.values.address}
              onChange={(value) => form.setValue('address', value)}
              maxLength={300}
              autoComplete="street-address"
              className="sm:col-span-2"
            />
            <SettingsField
              id="company-city"
              label="City"
              value={form.values.city}
              onChange={(value) => form.setValue('city', value)}
              maxLength={100}
            />
            <SettingsField
              id="company-postal-code"
              label="Postal code"
              value={form.values.postalCode}
              onChange={(value) => form.setValue('postalCode', value)}
              maxLength={20}
            />
            <SettingsField
              id="company-country"
              label="Country"
              value={form.values.country}
              onChange={(value) => form.setValue('country', value)}
              maxLength={100}
              autoComplete="country-name"
            />
          </div>
        </fieldset>

        <fieldset className="grid gap-5 border-t border-brand/10 pt-5">
          <legend className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Logo
          </legend>
          <div className="grid max-w-xl gap-5">
            <SettingsField
              id="company-logo-url"
              label="Logo URL"
              type="url"
              value={form.values.logoUrl}
              onChange={(value) => form.setValue('logoUrl', value)}
              placeholder="https://example.com/logo.png"
              hint="A publicly reachable image URL. FlowERP does not host uploads yet, so the image must be served elsewhere."
              maxLength={500}
            />
            <LogoPreview url={form.values.logoUrl} fallbackName={displayName} />
          </div>
        </fieldset>

        {form.formError && <SettingsFormError message={form.formError} />}
        <SettingsFormActions isDirty={form.isDirty} isSaving={form.isSaving} onReset={form.reset} />
      </form>
    </SettingsSection>
  );
}
