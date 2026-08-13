import type { FormEvent } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { SettingsField, SettingsReadOnlyField } from './settings-field';
import {
  SettingsFormActions,
  SettingsFormError,
  SettingsSection,
  SettingsSectionError,
  SettingsSectionSkeleton,
} from './settings-section';
import { useCompanyForm } from './use-company-form';

const FIELDS = ['name', 'timezone', 'defaultCurrency'] as const;

/// The three settings that change how the rest of the app behaves rather than
/// how documents read: the trading name shown in the shell, and the timezone
/// and currency that reports, finance totals and the AI context all resolve
/// against.
export function CompanyGeneralSection({ isAdmin }: { isAdmin: boolean }) {
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
      if (!values.name.trim()) return 'Company name is required';
      if (!/^[A-Za-z]{3}$/.test(values.defaultCurrency.trim())) {
        return 'Default currency must be a 3-letter ISO code, e.g. USD';
      }
      if (!values.timezone.trim()) return 'Timezone is required';
      return null;
    });
  };

  return (
    <SettingsSection
      title="General"
      description="How this company is identified inside FlowERP, and the timezone and currency the rest of the app calculates in."
    >
      <div className="grid gap-6">
        {isAdmin ? (
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <SettingsField
                id="company-name"
                label="Company name"
                value={form.values.name}
                onChange={(value) => form.setValue('name', value)}
                hint="Your trading name. Shown in the app, emails and — unless a legal name is set — on invoices."
                maxLength={200}
                autoComplete="organization"
              />
              <SettingsField
                id="company-timezone"
                label="Timezone"
                value={form.values.timezone}
                onChange={(value) => form.setValue('timezone', value)}
                placeholder="Asia/Tashkent"
                hint="IANA name. Report date ranges and daily figures are bucketed in this zone."
                maxLength={100}
              />
              <SettingsField
                id="company-currency"
                label="Default currency"
                value={form.values.defaultCurrency}
                onChange={(value) => form.setValue('defaultCurrency', value.toUpperCase())}
                placeholder="USD"
                hint="ISO 4217 code used for new orders, invoices and finance totals."
                maxLength={3}
              />
            </div>
            {form.formError && <SettingsFormError message={form.formError} />}
            <SettingsFormActions
              isDirty={form.isDirty}
              isSaving={form.isSaving}
              onReset={form.reset}
            />
          </form>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <SettingsReadOnlyField label="Company name" value={organization.name} />
            <SettingsReadOnlyField label="Timezone" value={organization.timezone} />
            <SettingsReadOnlyField label="Default currency" value={organization.defaultCurrency} />
          </div>
        )}

        <div className="grid gap-5 border-t border-brand/10 pt-5 sm:grid-cols-2">
          <SettingsReadOnlyField
            label="Workspace URL"
            value={organization.slug}
            hint="Fixed after creation — changing it would break existing links."
          />
          <SettingsReadOnlyField
            label="Account status"
            value={<StatusBadge status={organization.status} />}
            hint="Changed by FlowERP support, not from this screen."
          />
        </div>
      </div>
    </SettingsSection>
  );
}
