-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "allowlistId" TEXT,
ADD COLUMN     "authorizedUsers" TEXT[],
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "encryptionInfo" JSONB,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "networkInfo" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "walrusBlobId" TEXT,
ALTER COLUMN "content" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Signature" ADD COLUMN     "email" TEXT,
ADD COLUMN     "zkLoginData" JSONB;
