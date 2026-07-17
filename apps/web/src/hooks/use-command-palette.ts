import * as React from "react";

/// Global ⌘K / Ctrl+K toggle. Kept as a standalone hook (rather than folded
/// into useSidebar) so any screen can open the palette without depending on
/// sidebar context — the two panels are unrelated pieces of chrome that only
/// happen to share the app shell.
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { open, setOpen };
}
