'use client';

import { useMemo } from 'react';
import type { DriverChatMessage, DriverChatThread } from './chat-contract';

/** Stub until WS `driver.chat.{orgId}.{driverId}` lands. */
export function useDriverChat(_driverId?: string) {
  const threads = useMemo<DriverChatThread[]>(() => [], []);
  const messages = useMemo<DriverChatMessage[]>(() => [], []);

  return {
    threads,
    messages,
    isLoading: false,
    sendMessage: async (_threadId: string, _body: string) => {
      /* no-op stub */
    },
  };
}
