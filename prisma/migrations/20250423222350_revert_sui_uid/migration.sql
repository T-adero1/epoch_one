/*
  Warnings:

  - You are about to drop the column `suiUid` on the `Contract` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Contract_suiUid_key";

-- AlterTable
ALTER TABLE "Contract" DROP COLUMN "suiUid";
