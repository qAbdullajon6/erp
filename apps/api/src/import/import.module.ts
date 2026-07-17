import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { OrderStateModule } from "../order-state/order-state.module";
import { ImportController } from "./import.controller";
import { ImportService } from "./import.service";
import { FileParserService } from "./parsing/file-parser.service";
import { MappingService } from "./mapping/mapping.service";
import { ValidationService } from "./validation/validation.service";
import { ImportExecutionService } from "./execution/import-execution.service";
import { NaturalKeyService } from "./execution/natural-key.service";
import { ImportRowWriter } from "./execution/import-row-writer";

/// Bulk data migration.
///
/// Imports OrderStateModule for OrderWriter, not OrdersModule: the engine needs
/// exactly one thing from the order domain — the ability to append an Order's
/// opening status-history row inside its own transaction (ADR-001/AR2). Pulling
/// in OrdersModule would drag WorkflowsModule and the whole dispatch graph
/// behind it for a single method.
///
/// Everything else is registry-driven and touches the target tables through
/// Prisma directly, which is what allows a batch of 500 rows to be one
/// transaction rather than 500 service calls.
@Module({
  imports: [PrismaModule, AuditModule, OrderStateModule],
  controllers: [ImportController],
  providers: [
    ImportService,
    FileParserService,
    MappingService,
    ValidationService,
    ImportExecutionService,
    NaturalKeyService,
    ImportRowWriter,
  ],
  exports: [ImportService],
})
export class ImportModule {}
