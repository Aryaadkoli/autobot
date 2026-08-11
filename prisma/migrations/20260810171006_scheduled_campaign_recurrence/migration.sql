-- CreateEnum
CREATE TYPE "ScheduledCampaignRecurrence" AS ENUM ('NONE', 'MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "ScheduledCampaign" ADD COLUMN     "recurrence" "ScheduledCampaignRecurrence" NOT NULL DEFAULT 'NONE';
