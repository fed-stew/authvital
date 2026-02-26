/*
  Warnings:

  - You are about to drop the column `createdAt` on the `super_admins` table. All the data in the column will be lost.
  - You are about to drop the column `lastLoginAt` on the `super_admins` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `super_admins` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `super_admins` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[username]` on the table `super_admins` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updated_at` to the `super_admins` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "super_admins" DROP COLUMN "createdAt",
DROP COLUMN "lastLoginAt",
DROP COLUMN "name",
DROP COLUMN "updatedAt",
ADD COLUMN     "birthdate" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "email_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "family_name" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "given_name" TEXT,
ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "middle_name" TEXT,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phone_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "picture_url" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "username" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "zoneinfo" TEXT;

-- CreateTable
CREATE TABLE "admin_sso_links" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "raw_profile" JSONB,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "admin_sso_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_sso_links_admin_id_idx" ON "admin_sso_links"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sso_links_provider_provider_user_id_key" ON "admin_sso_links"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sso_links_admin_id_provider_key" ON "admin_sso_links"("admin_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_username_key" ON "super_admins"("username");

-- CreateIndex
CREATE INDEX "super_admins_username_idx" ON "super_admins"("username");

-- AddForeignKey
ALTER TABLE "admin_sso_links" ADD CONSTRAINT "admin_sso_links_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "super_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
