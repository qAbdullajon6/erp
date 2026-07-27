-- R2: at most one non-terminal dispatch may exist per order. The service
-- already check-then-creates, but concurrent assign requests can both pass
-- the pre-check and commit two live dispatches. A partial unique index makes
-- that physically impossible; DELIVERED/CANCELLED rows stay free so history
-- and re-dispatch after cancel remain legal.
CREATE UNIQUE INDEX IF NOT EXISTS "dispatches_one_live_per_order"
ON "dispatches" ("orderId")
WHERE "status" NOT IN ('CANCELLED', 'DELIVERED');
