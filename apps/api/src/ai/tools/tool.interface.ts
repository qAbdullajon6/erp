import type { MembershipRole } from "@prisma/client";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";

/// A capability the model can invoke.
///
/// Two rules make this safe, and both are enforced by ToolExecutor rather than
/// left to each tool:
///
///  1. `allowedRoles` is checked BEFORE the handler runs. A tool the caller may
///     not use is never even offered to the model (see ToolRegistry.forUser), so
///     the model cannot be talked into calling it — the prompt is not the
///     security boundary, the registry is.
///
///  2. The handler receives the CALLER's identity and must scope every query by
///     `actor.organizationId`. The model never supplies an organization, and
///     there is no parameter through which it could.
export interface AiTool {
  name: string;
  /// Written for the MODEL, not for a human: it is the only thing deciding
  /// whether this tool gets chosen, so it says when to use it and when not to.
  description: string;
  /// JSON Schema for the arguments. `additionalProperties: false` throughout,
  /// so an argument the model invents is a validation error rather than a
  /// silently ignored field.
  parameters: Record<string, unknown>;
  /// Who may invoke it. Mirrors the roles on the equivalent HTTP endpoint — the
  /// Copilot must not be a way around the API's own authorization.
  allowedRoles: readonly MembershipRole[];
  /// True when the tool changes data. Mutating tools are audited individually
  /// and are excluded when a conversation is in read-only mode.
  mutating: boolean;
  handler: ToolHandler;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  actor: CurrentUserPayload,
) => Promise<unknown>;

/// Raised by a tool for a condition the MODEL should see and can act on — an
/// unknown customer, an invalid date. The message is fed back as the tool
/// result so the model can correct itself and retry, which is why it must be
/// phrased for a reader rather than as a stack trace.
export class ToolExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolExecutionError";
  }
}
