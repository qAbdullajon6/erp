import type { NormalizedPosition } from "../providers/telematics-provider.interface";
import { isValidCoordinate } from "../geo/haversine.util";

/// Clock skew allowed on device `recordedAt` ahead of server time.
export const MAX_FUTURE_SKEW_MS = 60_000;

/// Heartbeats closer than this are treated as a storm and rejected.
export const MIN_HEARTBEAT_INTERVAL_MS = 2_000;

/// Null Island — GPS units with no fix commonly report (0, 0).
export function isNullIsland(latitude: number, longitude: number): boolean {
  return Math.abs(latitude) < 1e-5 && Math.abs(longitude) < 1e-5;
}

/// Coordinate that is physically valid and usable as a real vehicle position.
export function isUsableGpsCoordinate(latitude: number, longitude: number): boolean {
  return isValidCoordinate({ latitude, longitude }) && !isNullIsland(latitude, longitude);
}

/// Reject timestamps too far in the future (clock skew / client bugs).
export function isAcceptableRecordedAt(recordedAt: Date, nowMs = Date.now()): boolean {
  if (!(recordedAt instanceof Date) || Number.isNaN(recordedAt.getTime())) return false;
  return recordedAt.getTime() <= nowMs + MAX_FUTURE_SKEW_MS;
}

export type IngestFilterReason =
  | "invalid_coordinate"
  | "null_island"
  | "future_timestamp"
  | "duplicate_timestamp"
  | "out_of_order"
  | "duplicate_idempotency_key";

export interface FilteredIngestDecision {
  position: NormalizedPosition;
  accepted: boolean;
  reason?: IngestFilterReason;
}

export interface FilteredIngestBatch {
  accepted: NormalizedPosition[];
  rejected: number;
  reasons: Partial<Record<IngestFilterReason, number>>;
  /// Per-position decision for the packet inspector (includes rejects).
  decisions: FilteredIngestDecision[];
}

/// Filters a batch for reliability before the ingest walk:
///   - invalid / null-island coordinates
///   - future timestamps beyond skew
///   - duplicates within the batch (same recordedAt ms)
///   - out-of-order or duplicate vs the vehicle's lastRecordedAt
///   - duplicate idempotency keys within the batch
///
/// Positions are returned sorted ascending by recordedAt.
export function filterIngestBatch(
  positions: NormalizedPosition[],
  options: {
    lastRecordedAt?: Date | null;
    nowMs?: number;
  } = {},
): FilteredIngestBatch {
  const nowMs = options.nowMs ?? Date.now();
  const lastMs = options.lastRecordedAt?.getTime() ?? null;
  const reasons: FilteredIngestBatch["reasons"] = {};
  const bump = (reason: IngestFilterReason) => {
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  };

  const seenAt = new Set<number>();
  const seenKeys = new Set<string>();
  const kept: NormalizedPosition[] = [];
  const decisions: FilteredIngestDecision[] = [];

  const reject = (position: NormalizedPosition, reason: IngestFilterReason) => {
    bump(reason);
    decisions.push({ position, accepted: false, reason });
  };

  for (const p of positions) {
    if (!isValidCoordinate({ latitude: p.latitude, longitude: p.longitude })) {
      reject(p, "invalid_coordinate");
      continue;
    }
    if (isNullIsland(p.latitude, p.longitude)) {
      reject(p, "null_island");
      continue;
    }
    if (!isAcceptableRecordedAt(p.recordedAt, nowMs)) {
      reject(p, "future_timestamp");
      continue;
    }

    const atMs = p.recordedAt.getTime();
    if (seenAt.has(atMs)) {
      reject(p, "duplicate_timestamp");
      continue;
    }

    const idempotencyKey = readIdempotencyKey(p);
    if (idempotencyKey) {
      if (seenKeys.has(idempotencyKey)) {
        reject(p, "duplicate_idempotency_key");
        continue;
      }
      seenKeys.add(idempotencyKey);
    }

    if (lastMs != null && atMs <= lastMs) {
      reject(p, atMs === lastMs ? "duplicate_timestamp" : "out_of_order");
      continue;
    }

    seenAt.add(atMs);
    kept.push(p);
    decisions.push({ position: p, accepted: true });
  }

  kept.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  const rejected = positions.length - kept.length;
  return { accepted: kept, rejected, reasons, decisions };
}

function readIdempotencyKey(p: NormalizedPosition): string | null {
  const raw = p.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const key = (raw as Record<string, unknown>).idempotencyKey;
  return typeof key === "string" && key.trim() !== "" ? key.trim() : null;
}
