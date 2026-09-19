-- DropForeignKey
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_roleId_fkey";

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "customerStatusId" TEXT,
ADD COLUMN     "leadStageId" TEXT;

-- CreateTable
CREATE TABLE "CustomerStatus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerStatusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LeadStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerStatus_tenantId_name_key" ON "CustomerStatus"("tenantId", "name");

-- CreateIndex
CREATE INDEX "LeadStage_tenantId_customerStatusId_idx" ON "LeadStage"("tenantId", "customerStatusId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadStage_tenantId_customerStatusId_name_key" ON "LeadStage"("tenantId", "customerStatusId", "name");

-- CreateIndex
CREATE INDEX "Contact_tenantId_customerStatusId_idx" ON "Contact"("tenantId", "customerStatusId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_leadStageId_idx" ON "Contact"("tenantId", "leadStageId");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_customerStatusId_fkey" FOREIGN KEY ("customerStatusId") REFERENCES "CustomerStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_leadStageId_fkey" FOREIGN KEY ("leadStageId") REFERENCES "LeadStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStatus" ADD CONSTRAINT "CustomerStatus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStage" ADD CONSTRAINT "LeadStage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStage" ADD CONSTRAINT "LeadStage_customerStatusId_fkey" FOREIGN KEY ("customerStatusId") REFERENCES "CustomerStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
