/// The fleet-tracking domain types live with the API client that produces them
/// (`lib/api/telematics.ts`), keeping one source of truth and the dependency
/// direction pointing from this feature module into the infra layer. Re-exported
/// here so the sibling components can keep importing from `./types`.
export type {
  MovementState,
  Vehicle,
  TelematicsStatePayload,
  TelematicsEvent,
} from "@/lib/api/telematics";
