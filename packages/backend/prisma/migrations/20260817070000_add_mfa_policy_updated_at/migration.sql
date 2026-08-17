-- AlterTable: record when a tenant's MFA policy last changed (nullable, additive).
-- Grace periods anchor to max(membership.joined_at, mfa_policy_updated_at ?? tenants.created_at)
-- so switching to REQUIRED starts a fresh grace window for existing members.
ALTER TABLE "tenants" ADD COLUMN "mfa_policy_updated_at" TIMESTAMP(3);
