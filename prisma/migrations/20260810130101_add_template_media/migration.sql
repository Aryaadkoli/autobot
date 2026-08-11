-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'DOCUMENT');

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "mediaType" "MediaType",
ADD COLUMN     "mediaUrl" TEXT;
