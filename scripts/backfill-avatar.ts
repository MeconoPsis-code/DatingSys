import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

async function main() {
  // Check existing auth identities
  const identities = await db.authIdentity.findMany({
    where: { provider: "qq_bot" },
    select: { userId: true, providerUserId: true, nickname: true, avatarUrl: true },
  });
  console.log("Current qq_bot identities:", JSON.stringify(identities, null, 2));

  // Backfill avatarUrl for any that are missing
  for (const ai of identities) {
    if (!ai.avatarUrl && ai.providerUserId) {
      const url = `https://q1.qlogo.cn/g?b=qq&nk=${ai.providerUserId}&s=640`;
      await db.authIdentity.updateMany({
        where: { userId: ai.userId, provider: "qq_bot" },
        data: { avatarUrl: url },
      });
      console.log(`Backfilled avatar for QQ ${ai.providerUserId}: ${url}`);
    }
  }

  console.log("Done!");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
