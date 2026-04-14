-- AlterTable: Add password reset fields to super_admins
ALTER TABLE "super_admins" ADD COLUMN "password_reset_token" TEXT;
ALTER TABLE "super_admins" ADD COLUMN "password_reset_expires" TIMESTAMP(3);
