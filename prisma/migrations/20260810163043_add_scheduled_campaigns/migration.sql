-- CreateEnum
CREATE TYPE "ScheduledCampaignStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "ScheduledCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagId" TEXT,
    "stage" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledCampaignStatus" NOT NULL DEFAULT 'PENDING',
    "ranCampaignId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledCampaign_status_scheduledFor_idx" ON "ScheduledCampaign"("status", "scheduledFor");

-- AddForeignKey
ALTER TABLE "ScheduledCampaign" ADD CONSTRAINT "ScheduledCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledCampaign" ADD CONSTRAINT "ScheduledCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledCampaign" ADD CONSTRAINT "ScheduledCampaign_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE SET NULL ON UPDATE CASCADE;
