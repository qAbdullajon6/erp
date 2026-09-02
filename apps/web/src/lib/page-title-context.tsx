'use client';

import { createContext, useContext, useEffect, useState } from 'react';

interface Ctx {
  leafLabel: string | null;
  setLeafLabel: (v: string | null) => void;
}

const PageTitleCtx = createContext<Ctx>({ leafLabel: null, setLeafLabel: () => {} });

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [leafLabel, setLeafLabel] = useState<string | null>(null);
  return (
    <PageTitleCtx.Provider value={{ leafLabel, setLeafLabel }}>
      {children}
    </PageTitleCtx.Provider>
  );
}

export function usePageLeaf(): string | null {
  return useContext(PageTitleCtx).leafLabel;
}

export function useSetPageLeaf(label: string | null) {
  const { setLeafLabel } = useContext(PageTitleCtx);
  useEffect(() => {
    setLeafLabel(label);
    return () => setLeafLabel(null);
  }, [label, setLeafLabel]);
}
