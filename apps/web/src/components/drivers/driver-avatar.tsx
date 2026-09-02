import * as React from 'react';
import { Camera, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthenticatedPhotoSrc } from '@/lib/api/drivers';
import type { Driver } from '@/lib/api/drivers';

export function driverInitials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

interface DriverAvatarProps {
  driver: Pick<Driver, 'firstName' | 'lastName' | 'profilePhotoUrl' | 'archivedAt'>;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-[10px]',
  md: 'h-9 w-9 text-[11px]',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-20 w-20 text-xl',
};

export function DriverAvatar({ driver, size = 'md', className }: DriverAvatarProps) {
  const src = useAuthenticatedPhotoSrc(driver.profilePhotoUrl);
  const sizeClass = SIZE_CLASSES[size];

  if (src) {
    return (
      <img
        src={src}
        alt={`${driver.firstName} ${driver.lastName}`}
        className={cn('rounded-full object-cover shrink-0', sizeClass, className)}
      />
    );
  }

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold',
        sizeClass,
        driver.archivedAt ? 'bg-muted text-muted-foreground' : 'bg-brand/10 text-brand',
        className,
      )}
    >
      {driverInitials(driver.firstName, driver.lastName)}
    </span>
  );
}

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

interface DriverAvatarUploadProps {
  /** Existing photo URL from the server (persisted). Null = no photo yet. */
  existingPhotoUrl?: string | null;
  /** Local preview File selected by the user (not yet uploaded). */
  previewFile?: File | null;
  /** Called when user selects a valid file. */
  onFileSelected: (file: File) => void;
  /** Called when user removes the current photo/preview. */
  onRemove: () => void;
  firstName?: string;
  lastName?: string;
  /** Validation error to show below the widget. */
  error?: string | null;
  size?: number;
}

export function DriverAvatarUpload({
  existingPhotoUrl,
  previewFile,
  onFileSelected,
  onRemove,
  firstName = '',
  lastName = '',
  error,
  size = 80,
}: DriverAvatarUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const localPreviewUrl = React.useMemo(
    () => (previewFile ? URL.createObjectURL(previewFile) : null),
    [previewFile],
  );
  React.useEffect(() => {
    return () => { if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl); };
  }, [localPreviewUrl]);

  const serverSrc = useAuthenticatedPhotoSrc(previewFile ? null : existingPhotoUrl);
  const displaySrc = localPreviewUrl ?? serverSrc;
  const hasPhoto = Boolean(displaySrc);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setLocalError('Only JPEG, PNG, or WebP images are allowed');
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError('Photo must be 2 MB or smaller');
      return;
    }
    setLocalError(null);
    onFileSelected(file);
  }

  const initials = firstName || lastName
    ? driverInitials(firstName || 'D', lastName || 'R')
    : '?';
  const dim = size;

  const displayError = error ?? localError;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative group" style={{ width: dim, height: dim }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex items-center justify-center rounded-full overflow-hidden border-2 border-dashed transition-colors focus:outline-none',
            hasPhoto
              ? 'border-transparent'
              : 'border-border hover:border-brand/60 bg-muted/40 hover:bg-muted/60',
          )}
          style={{ width: dim, height: dim }}
          aria-label="Upload driver photo"
        >
          {displaySrc ? (
            <img src={displaySrc} alt="Driver photo" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 px-2 text-center">
              <Camera className="h-6 w-6 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground leading-tight">Upload photo</span>
            </div>
          )}
        </button>

        {hasPhoto && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
            aria-label="Remove photo"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        <div
          className={cn(
            'absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none',
            hasPhoto ? 'block' : 'hidden',
          )}
        >
          <Camera className="h-5 w-5 text-white" />
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          onChange={handleChange}
          className="sr-only"
        />
      </div>

      {!hasPhoto && (
        <p className="text-[10px] text-muted-foreground text-center leading-tight">
          JPG, PNG (max 2 MB)
        </p>
      )}

      {displayError && (
        <p className="text-[10px] text-destructive text-center leading-tight">{displayError}</p>
      )}
    </div>
  );
}
