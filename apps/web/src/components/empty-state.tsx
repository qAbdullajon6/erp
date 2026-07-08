import { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  secondaryLabel,
  secondaryHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-96 py-12">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="rounded-lg bg-slate-100 p-4">
            <Icon className="w-12 h-12 text-slate-400" />
          </div>
        </div>

        {/* Title & Description */}
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">{title}</h2>
        <p className="text-slate-600 mb-8">{description}</p>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 sm:flex-row justify-center">
          {actionHref && (
            <Link href={actionHref}>
              <Button className="w-full sm:w-auto">
                {actionLabel || 'Get Started'}
              </Button>
            </Link>
          )}
          {secondaryHref && (
            <Link href={secondaryHref}>
              <Button variant="outline" className="w-full sm:w-auto">
                {secondaryLabel || 'Learn More'}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
