import { useState } from 'react';
import { isClientError } from '@/services/api/error';
import { describeError } from '@/services/api/describe-error';
import { useUpdateMyDispatchStatusMutation, type DriverActionableStatus, type MyDispatch } from '@/services/api/endpoints/driver';
import { enqueueStatusUpdate } from '@/services/offline/offline-queue';
import { useNetworkStore } from '@/store/network-store';
import { showToast } from '@/store/toast-store';
import { statusLabel } from '@/components/ui/status-badge';

/**
 * The one place "driver taps a status button" turns into either a real request or
 * a queued one. Offline is checked BEFORE attempting the call (no point waiting
 * out a 30s timeout against a radio that's already off); a request that fails
 * mid-flight with a network/5xx error queues too, since that's the same "couldn't
 * reach the server" fact the offline check would have caught a second earlier. A
 * real 4xx (the server understood and refused) never queues — resending the exact
 * same request would refuse it again.
 */
export function useStatusUpdate(dispatch: Pick<MyDispatch, 'id' | 'dispatchNumber'>) {
  const mutation = useUpdateMyDispatchStatusMutation(dispatch.id);
  const [pendingStatus, setPendingStatus] = useState<DriverActionableStatus | null>(null);

  const updateStatus = async (status: DriverActionableStatus, note?: string) => {
    setPendingStatus(status);
    const isOnline = useNetworkStore.getState().status === 'online';

    if (!isOnline) {
      enqueueStatusUpdate({ dispatchId: dispatch.id, dispatchNumber: dispatch.dispatchNumber, status, note });
      showToast(`${statusLabel(status)} queued — will sync when back online`, 'info');
      setPendingStatus(null);
      return;
    }

    try {
      await mutation.mutateAsync({ status, note });
      showToast(`Marked as ${statusLabel(status)}`, 'success');
    } catch (error) {
      if (!isClientError(error)) {
        enqueueStatusUpdate({ dispatchId: dispatch.id, dispatchNumber: dispatch.dispatchNumber, status, note });
        showToast(`${statusLabel(status)} queued — will sync when back online`, 'info');
      } else {
        throw new Error(describeError(error, 'Failed to update status'));
      }
    } finally {
      setPendingStatus(null);
    }
  };

  return { updateStatus, pendingStatus };
}
