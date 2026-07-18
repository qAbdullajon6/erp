import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

// ---------------------------------------------------------------------------
// String-literal constants for triggers and actions
// ---------------------------------------------------------------------------

export const WORKFLOW_TRIGGER_TYPES = [
  "order.created",
  "order.updated",
  "order.status_changed",
  "order.cancelled",
  "dispatch.created",
  "dispatch.status_changed",
  "dispatch.completed",
  "dispatch.failed",
  "customer.created",
  "customer.updated",
  "invoice.created",
  "invoice.overdue",
  "payment.received",
  "driver.assigned",
  "driver.unassigned",
  "vehicle.maintenance_due",
  "schedule.cron",
  "manual.trigger",
] as const;

export type WorkflowTriggerType = (typeof WORKFLOW_TRIGGER_TYPES)[number];

export const WORKFLOW_ACTION_TYPES = [
  "send_email",
  "send_sms",
  "send_notification",
  "send_webhook",
  "update_order_status",
  "update_dispatch_status",
  "assign_driver",
  "create_invoice",
  "create_dispatch",
  "add_tag",
  "remove_tag",
  "set_field",
  "delay",
  "condition_branch",
  "log_message",
] as const;

export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];

export const WORKFLOW_EXECUTION_STATUSES = [
  "PENDING",
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "SKIPPED",
] as const;

export type WorkflowExecutionStatus =
  (typeof WORKFLOW_EXECUTION_STATUSES)[number];

export const WORKFLOW_CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "greater_than_or_equal",
  "less_than_or_equal",
  "is_empty",
  "is_not_empty",
  "in",
  "not_in",
] as const;

export type WorkflowConditionOperator =
  (typeof WORKFLOW_CONDITION_OPERATORS)[number];

// ---------------------------------------------------------------------------
// Nested config DTOs
// ---------------------------------------------------------------------------

export class WorkflowTriggerConfigDto {
  @IsString()
  @MinLength(1)
  event!: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

export class WorkflowConditionDto {
  @IsString()
  @MinLength(1)
  field!: string;

  @IsString()
  @MinLength(1)
  operator!: string;

  @IsOptional()
  value?: unknown;
}

export class WorkflowConditionGroupDto {
  @IsEnum(["AND", "OR"])
  operator!: "AND" | "OR";

  @IsArray()
  conditions!: (WorkflowConditionDto | WorkflowConditionGroupDto)[];
}

export class WorkflowActionConfigDto {
  @IsString()
  @MinLength(1)
  type!: string;

  @IsObject()
  config!: Record<string, unknown>;
}

export class WorkflowConfigDto {
  @ValidateNested()
  @Type(() => WorkflowTriggerConfigDto)
  trigger!: WorkflowTriggerConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowConditionGroupDto)
  conditions?: WorkflowConditionGroupDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowActionConfigDto)
  actions!: WorkflowActionConfigDto[];
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ValidateNested()
  @Type(() => WorkflowConfigDto)
  config!: WorkflowConfigDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowConfigDto)
  config?: WorkflowConfigDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsEnum(WORKFLOW_EXECUTION_STATUSES)
  status?: WorkflowExecutionStatus;
}

export class ListWorkflowsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  active?: string;

  @IsOptional()
  @IsEnum(WORKFLOW_EXECUTION_STATUSES)
  status?: WorkflowExecutionStatus;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ExecuteWorkflowDto {
  @IsString()
  @MinLength(1)
  trigger!: string;

  @IsOptional()
  @IsObject()
  eventPayload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class ListExecutionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(WORKFLOW_EXECUTION_STATUSES)
  status?: WorkflowExecutionStatus;
}

export class ImportWorkflowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ValidateNested()
  @Type(() => WorkflowConfigDto)
  config!: WorkflowConfigDto;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceVersion?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class DuplicateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Interfaces for workflow engine internals
// ---------------------------------------------------------------------------

export interface WorkflowTriggerDefinition {
  type: WorkflowTriggerType | string;
  displayName: string;
  description: string;
  eventSchema?: Record<string, unknown>;
  filterSchema?: Record<string, unknown>;
}

export interface WorkflowActionDefinition {
  type: WorkflowActionType | string;
  displayName: string;
  description: string;
  configSchema?: Record<string, unknown>;
  requiredFields?: string[];
}

export interface WorkflowExecutionContext {
  executionId: string;
  workflowId: string;
  organizationId: string;
  triggerEvent: string;
  eventPayload: Record<string, unknown>;
  variables: Record<string, unknown>;
  startedAt: Date;
  idempotencyKey?: string;
  parentExecutionId?: string;
  retryCount: number;
  maxRetries: number;
}

export interface WorkflowStepResult {
  step: string;
  actionType: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  message?: string;
  details?: Record<string, unknown>;
  durationMs: number;
  outputVariables?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Response interfaces (matching frontend expectations)
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface WorkflowListResponse {
  items: WorkflowResponse[];
  meta: PaginationMeta;
}

export interface WorkflowResponse {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  config: {
    trigger: {
      event: string;
      filters?: Record<string, unknown>;
    };
    conditions?: {
      operator: "AND" | "OR";
      conditions: unknown[];
    };
    actions: Array<{
      type: string;
      config: Record<string, unknown>;
    }>;
  };
  active: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecutionResponse {
  id: string;
  workflowId: string;
  organizationId: string;
  trigger: string;
  eventPayload: Record<string, unknown> | null;
  status: WorkflowExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  logs?: WorkflowExecutionLogResponse[];
}

export interface WorkflowExecutionLogResponse {
  id: string;
  executionId: string;
  step: string;
  status: string;
  message: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorkflowExecutionListResponse {
  items: WorkflowExecutionResponse[];
  meta: PaginationMeta;
}
