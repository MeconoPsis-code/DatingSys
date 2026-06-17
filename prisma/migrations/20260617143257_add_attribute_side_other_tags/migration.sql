-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "isOther" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSide" BOOLEAN NOT NULL DEFAULT false;
