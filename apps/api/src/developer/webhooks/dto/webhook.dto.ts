import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from "class-validator";

/// The events an endpoint may subscribe to. Mirrors the domain events the
/// app actually emits (see WorkflowEventService.emit call sites) — subscribing
/// to an event nothing emits is a silently-dead webhook, so unknown values
/// are rejected at the boundary rather than stored.
export const WEBHOOK_EVENTS = [
  "order.created",
  "order.updated",
  "order.status_changed",
  "order.cancelled",
  "dispatch.created",
  "dispatch.status_changed",
  "dispatch.completed",
  "invoice.created",
  "invoice.paid",
  "payment.received",
  "customer.created",
  "customer.updated",
  "driver.created",
  "vehicle.created",
  "expense.created",
  "expense.approved",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/// isUrl's own protocol allowlist. The SSRF host checks live in
/// webhook-url.util.ts — this only rejects things that are not URLs at all,
/// so a bad value fails validation before it reaches the service.
const URL_OPTIONS = { require_protocol: true, protocols: ["http", "https"] };

export class CreateWebhookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsUrl(URL_OPTIONS)
  @MaxLength(2_000)
  url!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  events!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(2_000)
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class TestWebhookDto {
  /// Which event name the test delivery should carry. Defaults to the first
  /// event the endpoint subscribes to, so the receiver's routing is exercised
  /// rather than bypassed by a synthetic name it does not handle.
  @IsOptional()
  @IsString()
  event?: string;
}
