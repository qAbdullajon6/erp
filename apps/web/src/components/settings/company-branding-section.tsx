import { useEffect, useState, type FormEvent } from 'react';
import { SettingsField } from './settings-field';
import {
  SettingsFormActions,
  SettingsFormError,
  SettingsSection,
  SettingsSectionError,
  SettingsSectionSkeleton,
} from './settings-section';
import { useCompanyForm } from './use-company-form';

const FIELDS = ['logoUrl'] as const;

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

export function CompanyBrandingSection({ isAdmin }: { isAdmin: boolean }) {
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
  const displayName = organization.legalName?.trim() || organization.name;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await form.save((values) => {
      if (values.logoUrl.trim() && !/^https?:\/\/.+/i.test(values.logoUrl.trim())) {
        return 'Logo URL must start with http:// or https://, or be left empty';
      }
      return null;
    });
  };

  return (
    <SettingsSection
      title="Branding"
      description="The logo used on printed invoices and other customer-facing documents."
    >
      {isAdmin ? (
        <form onSubmit={handleSubmit} className="grid max-w-xl gap-5">
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
          {form.formError && <SettingsFormError message={form.formError} />}
          <SettingsFormActions
            isDirty={form.isDirty}
            isSaving={form.isSaving}
            onReset={form.reset}
          />
        </form>
      ) : (
        <div className="grid max-w-xl gap-5">
          <LogoPreview url={organization.logoUrl ?? ''} fallbackName={displayName} />
        </div>
      )}
    </SettingsSection>
  );
}
