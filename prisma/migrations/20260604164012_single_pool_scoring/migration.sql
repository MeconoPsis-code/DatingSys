/*
  Warnings:

  - You are about to drop the column `poolType` on the `profiles` table. All the data in the column will be lost.
  - You are about to drop the column `photoObjectKey` on the `rating_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `photoStatus` on the `rating_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `scoreThresholdPreference` on the `rating_profiles` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PhotoMatchPref" AS ENUM ('PHOTO_ONLY', 'ALL');

-- DropIndex
DROP INDEX "profiles_poolType_status_idx";

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "poolType",
ADD COLUMN     "highScoreOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photoMatchPref" "PhotoMatchPref";

-- AlterTable
ALTER TABLE "rating_profiles" DROP COLUMN "photoObjectKey",
DROP COLUMN "photoStatus",
DROP COLUMN "scoreThresholdPreference";

-- AlterTable
ALTER TABLE "rating_scores" ALTER COLUMN "score" SET DATA TYPE DOUBLE PRECISION;

-- DropEnum
DROP TYPE "PoolType";

-- DropEnum
DROP TYPE "ScoreThresholdPref";
