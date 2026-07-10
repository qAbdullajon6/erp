-- Distinguishes FlowERP staff from customer administrators.
--
-- Lead rows have no organizationId — a demo request arrives before any
-- organization exists — so the multi-tenant scoping every other table relies
-- on cannot apply to them. Without this flag, gating GET /leads on
-- MembershipRole.ADMIN would let any customer's admin read every other
-- company's demo request.
--
-- Additive: a new column with a default, no data rewritten, no column dropped.
ALTER TABLE "users" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
