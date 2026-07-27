/// Fleet-tracking domain types from the `/tracking` API client.
export type {
  MovementState,
  TrackingVehicle,
  TrackingStatePayload,
  TrackingEvent,
  TrackingHistoryPoint,
  StreamStatus,
} from "@/lib/api/tracking";

/// Backward-compatible alias used across fleet-tracking components.
export type { TrackingVehicle as Vehicle } from "@/lib/api/tracking";
