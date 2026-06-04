-- AlterEnum
ALTER TYPE "Attribute" ADD VALUE 'HALF';

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "customAttribute" VARCHAR(20);
