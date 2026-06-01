-- Migration: remove_oicq
-- Description: Remove oicq type from QqBotType enum and handle existing oicq records

-- Step 1: Convert existing oicq type records to napcat
-- This ensures no data loss for existing QQ bot configurations
UPDATE "QqBot" SET "type" = 'napcat' WHERE "type" = 'oicq';

-- Step 2: Remove the default value temporarily
ALTER TABLE "QqBot" ALTER COLUMN "type" DROP DEFAULT;

-- Step 3: Update the enum type to remove oicq
-- First, create a new enum type without oicq
ALTER TYPE "QqBotType" RENAME TO "QqBotType_old";

-- Create new enum type with only napcat
CREATE TYPE "QqBotType" AS ENUM ('napcat');

-- Update the column to use the new enum type
ALTER TABLE "QqBot" ALTER COLUMN "type" TYPE "QqBotType" USING "type"::text::"QqBotType";

-- Step 4: Restore the default value
ALTER TABLE "QqBot" ALTER COLUMN "type" SET DEFAULT 'napcat';

-- Step 5: Drop the old enum type
DROP TYPE "QqBotType_old";
