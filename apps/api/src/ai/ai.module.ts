import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { CustomersModule } from "../customers/customers.module";
import { OrdersModule } from "../orders/orders.module";
import { DriversModule } from "../drivers/drivers.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { DispatchModule } from "../dispatch/dispatch.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReportsModule } from "../reports/reports.module";
import { FinanceModule } from "../finance/finance.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { DeveloperModule } from "../developer/developer.module";
import { ImportModule } from "../import/import.module";

import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { ConversationService } from "./chat/conversation.service";
import { ErpContextBuilder } from "./context/erp-context.builder";
import { PromptLibrary } from "./prompts/prompt-library";
import { RagService } from "./rag/rag.service";
import { MemoryService } from "./memory/memory.service";
import { ToolRegistry } from "./tools/tool-registry";
import { ToolExecutor } from "./tools/tool-executor";
import { ReadTools } from "./tools/read.tools";
import { WriteTools } from "./tools/write.tools";
import { AnalyticsTools } from "./tools/analytics.tools";
import { ProviderFactory } from "./providers/provider.factory";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { OpenAiProvider } from "./providers/openai.provider";
import { GeminiProvider } from "./providers/gemini.provider";
import { OllamaProvider } from "./providers/ollama.provider";
import { PromptInjectionGuard } from "./security/prompt-injection.guard";
import { OutputFilter } from "./security/output-filter";
import { AiRateLimitService } from "./security/ai-rate-limit.service";
import { KnowledgeSeeder } from "./rag/knowledge-seeder";

/// The AI Copilot.
///
/// This module is a CONSUMER of the domain, never a peer of it. It imports the
/// feature modules to reach their services, and every one of those arrows points
/// inward — nothing in Orders, Finance or Dispatch knows the Copilot exists, so
/// removing this module would leave the ERP untouched.
///
/// That is also why the tools call the same service methods the HTTP
/// controllers call: the Copilot is a second *interface* to the business logic,
/// not a second *implementation* of it. A "Copilot version" of createOrder that
/// skipped the transaction, the status history or the audit entry would be a
/// second source of truth, and the two would drift the first time a rule changed.
///
/// No import cycle is possible: the domain modules it pulls in
/// (Orders -> Workflows -> Developer, etc.) have no path back here.
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    CustomersModule,
    OrdersModule,
    DriversModule,
    VehiclesModule,
    InvoicesModule,
    DispatchModule,
    NotificationsModule,
    ReportsModule,
    FinanceModule,
    WorkflowsModule,
    DeveloperModule,
    ImportModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    ConversationService,
    ErpContextBuilder,
    PromptLibrary,
    RagService,
    KnowledgeSeeder,
    MemoryService,
    ToolRegistry,
    ToolExecutor,
    ReadTools,
    WriteTools,
    AnalyticsTools,
    ProviderFactory,
    AnthropicProvider,
    OpenAiProvider,
    GeminiProvider,
    OllamaProvider,
    PromptInjectionGuard,
    OutputFilter,
    AiRateLimitService,
  ],
})
export class AiModule {}
