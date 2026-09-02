import * as React from 'react';

/// Subscribe to a CSS media query from JavaScript.
///
/// For responsive changes that are structural rather than cosmetic. The usual
/// `hidden sm:table-cell` approach leaves both versions in the document and only
/// hides one, which is fine for a duplicated column but not for a duplicated
/// value: screen readers read it twice, and a test locator matching "the
/// customer name" suddenly matches two elements. Switching here renders one
/// layout at a time.
///
/// Prefer plain Tailwind breakpoints for anything that is only about visibility.
export function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(() => window.matchMedia(query).matches);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
