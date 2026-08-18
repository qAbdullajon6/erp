-- Access-token invalidation after a credential change.
ALTER TABLE "users"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Existing refresh tokens each start as their own family. New rotations keep
-- the same family id so reuse can revoke the complete chain.
ALTER TABLE "refresh_tokens"
ADD COLUMN "familyId" TEXT;

UPDATE "refresh_tokens"
SET "familyId" = "id"
WHERE "familyId" IS NULL;

ALTER TABLE "refresh_tokens"
ALTER COLUMN "familyId" SET NOT NULL;

CREATE INDEX "refresh_tokens_familyId_idx"
ON "refresh_tokens"("familyId");

-- Password reset tokens are high-entropy capabilities. Only their SHA-256
-- hashes are persisted; usedAt makes consumption atomic and one-time.
CREATE TABLE "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key"
ON "password_reset_tokens"("tokenHash");

CREATE INDEX "password_reset_tokens_userId_usedAt_idx"
ON "password_reset_tokens"("userId", "usedAt");

CREATE INDEX "password_reset_tokens_expiresAt_idx"
ON "password_reset_tokens"("expiresAt");

ALTER TABLE "password_reset_tokens"
ADD CONSTRAINT "password_reset_tokens_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
