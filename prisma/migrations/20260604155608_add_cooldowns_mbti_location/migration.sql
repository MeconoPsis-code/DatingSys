-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('RESIDENCE', 'HOMETOWN', 'SCHOOL', 'WORK', 'TRAVEL', 'OTHER');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "lastSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "locationType" "LocationType" NOT NULL DEFAULT 'RESIDENCE',
ADD COLUMN     "mbti" VARCHAR(4);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastProfileClearedAt" TIMESTAMP(3);
