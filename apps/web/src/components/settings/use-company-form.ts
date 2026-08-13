import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  useOrganizationQuery,
  useUpdateOrganizationMutation,
  type Organization,
  type UpdateOrganizationInput,
} from '@/lib/api/organizations';

/// Every company field is edited as a string, because that is what an <input>
/// gives back. Null columns therefore read as '' in the form, and '' is sent
/// back as null on save — see buildPayload.
export type CompanyFormField = keyof UpdateOrganizationInput & keyof Organization;

type Values<K extends CompanyFormField> = Record<K, string>;

function toFormValue(value: string | null | undefined): string {
  return value ?? '';
}

/// Shared draft/dirty/save behaviour for the Company sections. Each section
/// declares only the fields it owns, so saving Branding cannot silently
/// overwrite a Legal field another tab had loaded — the PATCH body carries just
/// the keys that actually changed.
///
/// `fields` must be a module-level constant: it is a dependency of the memos
/// below, so a fresh array per render would rebuild them every time.
export function useCompanyForm<K extends CompanyFormField>(fields: readonly K[]) {
  const { data: organization, isLoading, isError, error, refetch } = useOrganizationQuery();
  const { mutateAsync, isPending: isSaving } = useUpdateOrganizationMutation();

  const [draft, setDraft] = useState<Partial<Values<K>>>({});
  const [formError, setFormError] = useState('');

  const persisted = useMemo(() => {
    const result = {} as Values<K>;
    for (const field of fields) {
      result[field] = toFormValue(organization?.[field] as string | null | undefined);
    }
    return result;
  }, [organization, fields]);

  /// Drop local edits once the server copy changes (a successful save
  /// invalidates the query), so the form always reflects what was stored.
  useEffect(() => {
    setDraft({});
    setFormError('');
  }, [persisted]);

  const values = useMemo(() => ({ ...persisted, ...draft }) as Values<K>, [persisted, draft]);

  const setValue = useCallback((field: K, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setFormError('');
  }, []);

  const changedFields = useMemo(
    () => fields.filter((field) => values[field] !== persisted[field]),
    [fields, values, persisted],
  );

  const reset = useCallback(() => {
    setDraft({});
    setFormError('');
  }, []);

  /// Only changed keys are sent. A blanked-out optional field becomes null so
  /// the column is cleared rather than storing '' — which would print as an
  /// empty line on an invoice. `name` is required, so '' is rejected by the
  /// caller's validation before it reaches here.
  const buildPayload = useCallback((): UpdateOrganizationInput => {
    const payload: Record<string, string | null> = {};
    for (const field of changedFields) {
      const value = values[field].trim();
      payload[field] = value === '' ? null : value;
    }
    return payload as UpdateOrganizationInput;
  }, [changedFields, values]);

  /// `validate` returns a message to block the save, or null to proceed.
  const save = useCallback(
    async (validate?: (values: Values<K>) => string | null): Promise<boolean> => {
      const message = validate?.(values) ?? null;
      if (message) {
        setFormError(message);
        return false;
      }
      if (changedFields.length === 0) return true;

      try {
        await mutateAsync(buildPayload());
        toast.success('Company details saved');
        return true;
      } catch (err) {
        const failure = err instanceof Error ? err.message : 'Failed to save company details';
        setFormError(failure);
        toast.error(failure);
        return false;
      }
    },
    [values, changedFields, buildPayload, mutateAsync],
  );

  return {
    organization,
    isLoading,
    isError,
    error,
    refetch,
    values,
    setValue,
    isDirty: changedFields.length > 0,
    reset,
    save,
    isSaving,
    formError,
    setFormError,
  };
}
