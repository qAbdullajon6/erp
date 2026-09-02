-- Support moves to a two-status chat model: OPEN ("questions") and CLOSED.
--
-- IN_PROGRESS and RESOLVED are no longer written by the application. The enum
-- values themselves stay in the database type (dropping them would be a
-- destructive, multi-release change per docs/RELEASE_PROCESS.md) — the app
-- simply never assigns them again. Existing rows are folded onto the two
-- live states so no ticket is stranded on an orphaned status:
--   IN_PROGRESS (admin replied, not finished) -> OPEN   (question still live)
--   RESOLVED                                  -> CLOSED (work is done)

UPDATE "support_tickets" SET "status" = 'OPEN' WHERE "status" = 'IN_PROGRESS';
UPDATE "support_tickets" SET "status" = 'CLOSED' WHERE "status" = 'RESOLVED';
