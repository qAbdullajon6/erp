import { Injectable } from "@nestjs/common";
import type { MembershipRole } from "@prisma/client";
import type { CurrentUserPayload } from "../../auth/interfaces/current-user.interface";
import type { LlmToolDefinition } from "../providers/llm-provider.interface";
import type { AiTool } from "./tool.interface";
import { ReadTools } from "./read.tools";
import { WriteTools } from "./write.tools";
import { AnalyticsTools } from "./analytics.tools";
import { TelematicsAiTools } from "./telematics.tools";
import { NotificationAiTools } from "./notification.tools";
import { BillingTools } from "./billing.tools";

/// The set of capabilities the Copilot has, and who may use each.
///
/// The registry is the security boundary, not the prompt. `forUser` filters by
/// role BEFORE the tool list is sent to the model, so a dispatcher's model
/// literally never learns that `finance_summary` exists — it cannot be
/// persuaded, jailbroken or confused into calling something it was never told
/// about. Every tool is additionally re-checked at execution time
/// (ToolExecutor), because defence that exists only at offer time is defence
/// that a replayed or hand-crafted tool call walks straight past.
@Injectable()
export class ToolRegistry {
  private readonly tools: AiTool[];

  constructor(
    readTools: ReadTools,
    writeTools: WriteTools,
    analyticsTools: AnalyticsTools,
    telematicsTools: TelematicsAiTools,
    notificationTools: NotificationAiTools,
    billingTools: BillingTools,
  ) {
    this.tools = [
      ...readTools.all(),
      ...writeTools.all(),
      ...analyticsTools.all(),
      ...telematicsTools.all(),
      ...notificationTools.all(),
      ...billingTools.getTools(),
    ];
  }

  /// Every tool, regardless of role. For diagnostics and tests only — never
  /// for building a prompt.
  all(): readonly AiTool[] {
    return this.tools;
  }

  get(name: string): AiTool | undefined {
    return this.tools.find((t) => t.name === name);
  }

  /// The tools this user may actually invoke.
  forUser(actor: CurrentUserPayload, options: { readOnly?: boolean } = {}): AiTool[] {
    return this.tools.filter((tool) => {
      if (options.readOnly && tool.mutating) return false;
      return tool.allowedRoles.includes(actor.role);
    });
  }

  /// The same set, in the provider-neutral shape the adapters translate.
  definitionsFor(actor: CurrentUserPayload, options: { readOnly?: boolean } = {}): LlmToolDefinition[] {
    return this.forUser(actor, options).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /// Whether a role may invoke a tool. Used by ToolExecutor for the
  /// execution-time re-check.
  isAllowed(name: string, role: MembershipRole): boolean {
    const tool = this.get(name);
    return !!tool?.allowedRoles.includes(role);
  }
}
