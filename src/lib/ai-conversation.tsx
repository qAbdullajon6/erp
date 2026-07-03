"use client";

import * as React from "react";
import type { AssistantResponse } from "@/lib/ai-assistant";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  question?: string;
  response?: AssistantResponse;
  at: string;
}

const STORAGE_KEY = "flowerp:ai-conversation:v1";

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  response: {
    category: "operations",
    answer:
      "Hi, I'm your FlowERP AI operations assistant. Ask me about deliveries, drivers, invoices, customers or reports — I'll answer from your live data.",
  },
  at: new Date(0).toISOString(),
};

let messageCounter = 0;
function nextMessageId(): string {
  messageCounter += 1;
  return `chat-${Date.now()}-${messageCounter}`;
}

type Listener = () => void;

class AiConversationStore {
  private messages: ChatMessage[] = [WELCOME_MESSAGE];
  private listeners = new Set<Listener>();

  getSnapshot = (): ChatMessage[] => this.messages;
  getServerSnapshot = (): ChatMessage[] => this.messages;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private commit(next: ChatMessage[]) {
    this.messages = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage write failures
    }
    this.listeners.forEach((listener) => listener());
  }

  hydrate = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.messages = parsed;
          this.listeners.forEach((listener) => listener());
        }
      }
    } catch {
      // ignore malformed storage, keep welcome message
    }
  };

  addUserMessage = (question: string) => {
    const prev = this.messages;
    this.commit([
      ...prev,
      { id: nextMessageId(), role: "user", question, at: new Date().toISOString() },
    ]);
  };

  addAssistantMessage = (response: AssistantResponse) => {
    const prev = this.messages;
    this.commit([
      ...prev,
      { id: nextMessageId(), role: "assistant", response, at: new Date().toISOString() },
    ]);
  };

  clearConversation = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    this.commit([WELCOME_MESSAGE]);
  };
}

const store = new AiConversationStore();

export function AiConversationProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    store.hydrate();
  }, []);

  return <>{children}</>;
}

export function useAiConversation() {
  const messages = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  return {
    messages,
    addUserMessage: store.addUserMessage,
    addAssistantMessage: store.addAssistantMessage,
    clearConversation: store.clearConversation,
  };
}
