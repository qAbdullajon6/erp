import { useCallback, useEffect, useRef } from 'react';
import {
  useCheckDispatchConflicts,
  type CheckDispatchConflictsInput,
} from '@/lib/api/dispatch-conflicts';

const LIVE_CHECK_DEBOUNCE_MS = 300;

export function useLiveDispatchConflictCheck(dispatchId: string, enabled: boolean) {
  const checkMutation = useCheckDispatchConflicts(dispatchId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const check = useCallback(
    (input: CheckDispatchConflictsInput) => {
      if (!enabled || !dispatchId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void checkMutation.mutateAsync({ ...input, recordAudit: false }).catch(() => undefined);
      }, LIVE_CHECK_DEBOUNCE_MS);
    },
    [checkMutation, dispatchId, enabled],
  );

  return { check, isChecking: checkMutation.isPending };
}
