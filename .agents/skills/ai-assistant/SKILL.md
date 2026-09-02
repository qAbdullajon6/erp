---
name: ai-assistant
description: Owns the AI Assistant screen (components/ai-assistant/*, routes/app.ai-assistant.tsx) — currently a placeholder awaiting a real conversational UI wired to a backend AI/copilot service. Use when building out chat UI, streaming, or wiring this screen to an AI backend.
---

# AI Assistant

## Purpose

Owns `components/ai-assistant/*` and `routes/app.ai-assistant.tsx`. As of this
writing, `AiAssistantView` is a genuine placeholder (a heading and a "module
placeholder" panel, ~13 lines) — there is no chat UI, no message list, and no
committed backend AI/conversation module on the main line yet. Before assuming
any AI backend endpoint exists, verify it in `apps/api/src` directly; don't
carry forward assumptions from a previous session or an uncommitted branch.

## When to Use

- Building the real chat UI to replace the placeholder.
- Wiring the assistant to a backend conversation/copilot endpoint once one
  exists and is committed.
- Any streaming, message-history, or suggested-prompt work on this screen.

## Responsibilities

- Verify backend reality before building: `grep`/`find` for an AI/conversation/
  copilot module under `apps/api/src` and confirm it's committed (not just
  present in someone's uncommitted working tree) before wiring a hook to it.
- When the backend is ready, follow [[api-integration]] conventions exactly:
  typed hooks in `lib/api/ai.ts` (or similarly named), proper query keys for
  conversation history, and role-gating matching whatever the backend's guard
  turns out to be — don't assume every role gets AI access without checking.
- Build the chat UI with the same [[design-system]]/[[component-architecture]]
  primitives as the rest of the app: `ui/dialog`/`ui/sheet` conventions if it's
  a panel, `Skeleton` for loading, `list-states.tsx` for empty/error, not a
  bespoke visual language unique to this one screen.
- If real streaming is implemented, handle partial-message state explicitly
  (a message that's still arriving vs. complete) rather than re-rendering the
  whole conversation on each token.

## Workflow

1. Confirm current backend state first — do not assume a conversation/copilot
   service exists; check `apps/api/src` directly.
2. If no backend exists yet, this is a two-sided task: coordinate the API
   contract (conversation create/list/send-message endpoints, streaming
   transport) before building UI against a guessed shape.
3. Build the message list and input as real components under
   `components/ai-assistant/` (e.g. `chat-message.tsx`, `conversation-list.tsx`,
   `message-input.tsx`) rather than growing `ai-assistant-view.tsx` into a
   monolith.
4. Use `ui/skeleton.tsx` and `list-states.tsx` for loading/empty conversation
   states, matching every other module.
5. Verify role access once the backend guard is known — don't assume AI access
   is universal across all five roles without checking.

## Rules

- Never claim a backend AI capability exists without verifying it's committed
  code, not stashed/uncommitted work from another session.
- Never fabricate assistant responses client-side "as a placeholder" in a way
  that could be mistaken for real functionality — an honest placeholder state
  (as it exists today) is better than a fake-looking mock.
- Never build streaming UI against an assumed transport (SSE vs. WebSocket vs.
  chunked fetch) without confirming what the backend actually implements.

## Best Practices

- Keep the conversation list / message thread split similar to familiar chat
  UIs (sidebar of past conversations + main thread), but built from this app's
  own primitives, not copied wholesale from an unrelated design.
- Add suggested prompts / quick actions only once there's a real backend to
  send them to.

## Never Do

- Never leave the placeholder looking broken while partially wiring a backend —
  either it's a clear placeholder or a working feature, not an ambiguous
  half-state.
- Never hardcode fake conversation data into the shipped UI.

## Checklist

- [ ] Backend AI/conversation capability verified as actually committed before
      building against it.
- [ ] Chat UI built from existing design-system primitives, not a bespoke style.
- [ ] Role access to this screen verified against the real backend guard.
- [ ] Loading/empty/error states use `list-states.tsx`/`Skeleton`.

## Expected Output

Either an honestly-scoped placeholder improvement, or a real chat UI wired to
a verified, committed backend endpoint — never a UI that implies more backend
capability than actually exists.
