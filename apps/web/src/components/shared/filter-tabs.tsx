import { useRef } from 'react';

export type FilterTab<K extends string> = {
  key: K;
  label: string;
};

/// The workflow strip above a list ("All / Needs action / Delayed …"). Orders
/// and Dispatches each had their own byte-identical copy of this markup.
///
/// Both copies declared role="tablist" but left every tab in the normal tab
/// order and ignored the arrow keys, so the markup promised assistive tech a
/// keyboard contract the page did not honour. This one implements it: a roving
/// tabindex, arrows to move, Home/End to jump — and because moving focus also
/// scrolls the tab into view, a strip that overflows on a phone is fully
/// reachable from the keyboard rather than only by dragging it.
export function FilterTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  activeCount = null,
}: {
  tabs: readonly FilterTab<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  /// Shown on the selected tab only — a list knows the total for the filter it
  /// actually ran, not for the ones it did not.
  activeCount?: number | null;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    const el = refs.current[next];
    el?.focus();
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    onChange(tabs[next].key);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusTab(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusTab(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusTab(0);
        break;
      case 'End':
        e.preventDefault();
        focusTab(tabs.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex items-center gap-1 overflow-x-auto border-b border-border scrollbar-thin scroll-hint-x [--scroll-hint-bg:var(--color-background)]"
    >
      {tabs.map((tab, index) => {
        const isActive = tab.key === value;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              {tab.label}
              {isActive && activeCount !== null && (
                <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-xs text-brand">
                  {activeCount}
                </span>
              )}
            </span>
            {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />}
          </button>
        );
      })}
    </div>
  );
}
