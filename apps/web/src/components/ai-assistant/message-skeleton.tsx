'use client';

/// Shown while switching to a conversation whose messages haven't arrived
/// yet. Distinct from WelcomeScreen on purpose: that screen means "there is
/// nothing here," this one means "there is something here, it just hasn't
/// loaded" — conflating the two used to flash an empty-chat welcome screen
/// for a conversation that actually has history, for the instant between
/// clicking it in the sidebar and its query resolving.
export function MessageSkeleton() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col justify-end gap-4 px-4 pb-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse gap-3 py-2" style={{ animationDelay: `${i * 100}ms` }}>
          <div className="h-7 w-7 shrink-0 rounded-md bg-muted/60" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-muted/60" />
            <div className="h-3 w-full max-w-md rounded bg-muted/40" />
            <div className="h-3 w-2/3 max-w-sm rounded bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  );
}
