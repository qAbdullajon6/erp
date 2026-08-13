import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SettingsFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /// Why the field exists / where it shows up, rather than restating the label.
  hint?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'url';
  maxLength?: number;
  autoComplete?: string;
  className?: string;
}

/// The label is bound with htmlFor and the hint with aria-describedby, so a
/// screen reader announces both together instead of reading an unlabelled box.
export function SettingsField({
  id,
  label,
  value,
  onChange,
  hint,
  placeholder,
  type = 'text',
  maxLength,
  autoComplete,
  className,
}: SettingsFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id} className="text-[13px] font-medium text-foreground/90">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hintId}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/// Read-only counterpart used for fields this screen cannot change (slug,
/// status) and for the whole Company surface when the viewer is not an admin.
export function SettingsReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="grid gap-1">
      <p className="text-[13px] font-medium text-foreground/90">{label}</p>
      <p className="text-sm text-foreground">{value || <span className="text-muted-foreground">Not set</span>}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
