import type { FormEvent } from 'react';
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
] as const;

/// Everything here is printed on customer-facing documents, so the section says
/// so up front — an admin filling it in should know these values leave the
/// building rather than being internal metadata.
export function CompanyLegalSection({ isAdmin }: { isAdmin: boolean }) {
  const form = useCompanyForm(FIELDS);

  if (form.isLoading) return <SettingsSectionSkeleton />;

  if (form.isError || !form.organization) {
    return (
      <SettingsSectionError
        message={form.error instanceof Error ? form.error.message : 'Failed to load company details'}
        onRetry={() => form.refetch()}
      />
    );
  }

  const organization = form.organization;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await form.save((values) => {
      if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
        return 'Enter a valid billing email address, or leave it empty';
      }
      if (values.website.trim() && !/^https?:\/\/.+/i.test(values.website.trim())) {
        return 'Website must start with http:// or https://, or be left empty';
      }
      return null;
    });
  };

  if (!isAdmin) {
    return (
      <SettingsSection
        title="Legal & tax"
        description="The registered identity printed on your invoices and other customer-facing documents."
      >
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
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Legal & tax"
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

        {form.formError && <SettingsFormError message={form.formError} />}
        <SettingsFormActions isDirty={form.isDirty} isSaving={form.isSaving} onReset={form.reset} />
      </form>
    </SettingsSection>
  );
}
