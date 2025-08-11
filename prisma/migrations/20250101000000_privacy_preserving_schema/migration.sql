-- Step 1: Add new hashed Google ID columns
ALTER TABLE "Contract" ADD COLUMN "ownerGoogleIdHash" TEXT;
ALTER TABLE "Signature" ADD COLUMN "userGoogleIdHash" TEXT;

-- Step 2: Drop foreign key constraints first
ALTER TABLE "Contract" DROP CONSTRAINT "Contract_ownerId_fkey";
ALTER TABLE "Signature" DROP CONSTRAINT "Signature_userId_fkey";
ALTER TABLE "UserSettings" DROP CONSTRAINT "UserSettings_userId_fkey";

-- Step 3: Drop UserSettings table (depends on User.id)
DROP TABLE "UserSettings";

-- Step 4: Clear existing contracts and signatures (as requested)
DELETE FROM "Signature";
DELETE FROM "Contract";

-- Step 5: Remove unused columns from User table
ALTER TABLE "User" DROP COLUMN "id";
ALTER TABLE "User" DROP COLUMN "updatedAt";
ALTER TABLE "User" DROP COLUMN "googleId";

-- Step 6: Remove foreign key columns from other tables
ALTER TABLE "Contract" DROP COLUMN "ownerId";
ALTER TABLE "Signature" DROP COLUMN "userId";

-- Step 7: Make walletAddress the primary key for User table
-- Drop existing unique constraint on walletAddress if it exists
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_walletAddress_key";
-- Drop existing unique constraint on email if it exists  
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";
-- Drop existing primary key if it exists
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_pkey";
-- Add walletAddress as primary key
ALTER TABLE "User" ADD CONSTRAINT "User_pkey" PRIMARY KEY ("walletAddress");

-- Step 8: Add indexes for performance on hash columns
CREATE INDEX "Contract_ownerGoogleIdHash_idx" ON "Contract"("ownerGoogleIdHash");
CREATE INDEX "Signature_userGoogleIdHash_idx" ON "Signature"("userGoogleIdHash");