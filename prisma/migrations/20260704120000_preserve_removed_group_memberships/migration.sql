ALTER TABLE "group_memberships" DROP CONSTRAINT "group_memberships_userId_fkey";

ALTER TABLE "group_memberships" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "group_memberships"
ADD CONSTRAINT "group_memberships_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
