import { PrismaClient, UserRole, MembershipStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcrypt";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });



async function main() {
  console.log("🌱 Seeding database...");

  // ── 0. Cleanup: TRUNCATE all tables (CASCADE handles FK deps) ──
  console.log("  🗑️  Cleaning existing data...");
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      rating_scores,
      rating_tasks,
      rating_profiles,
      profile_photos,
      match_snapshots,
      view_requests,
      reports,
      audit_logs,
      preferences,
      profiles,
      penalties,
      group_memberships,
      auth_identities,
      users
    CASCADE
  `);
  console.log("  ✅ Cleanup done (TRUNCATE CASCADE)");

  // Default password for all seed users: "password1"
  const defaultPasswordHash = await bcrypt.hash("password1", 12);

  // ── 1. Super Admin ──────────────────────────────────
  const superAdmin = await prisma.user.create({
    data: {
      id: "seed-super-admin",
      qqNumber: "00001",
      passwordHash: defaultPasswordHash,
      role: UserRole.SUPER_ADMIN,
      authIdentities: {
        create: {
          provider: "qq",
          providerUserId: "sa_001",
          openid: "sa_openid_001",
          nickname: "超级管理员",
        },
      },
    },
  });
  console.log(`  ✅ Super Admin: ${superAdmin.id}`);

  // ── 2. Admin ────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      id: "seed-admin",
      qqNumber: "00002",
      passwordHash: defaultPasswordHash,
      role: UserRole.ADMIN,
      authIdentities: {
        create: {
          provider: "qq",
          providerUserId: "admin_001",
          openid: "admin_openid_001",
          nickname: "管理员小明",
        },
      },
    },
  });
  console.log(`  ✅ Admin: ${admin.id}`);

  // ── 3. Scorers ──────────────────────────────────────
  const scorerIds = ["seed-scorer-1", "seed-scorer-2"];
  for (let i = 0; i < scorerIds.length; i++) {
    const scorer = await prisma.user.create({
      data: {
        id: scorerIds[i],
        qqNumber: `0000${i + 3}`,
        passwordHash: defaultPasswordHash,
        role: UserRole.SCORER,
        authIdentities: {
          create: {
            provider: "qq",
            providerUserId: `scorer_00${i + 1}`,
            openid: `scorer_openid_00${i + 1}`,
            nickname: `评分官${i + 1}号`,
          },
        },
      },
    });
    console.log(`  ✅ Scorer: ${scorer.id}`);
  }

  // ── 4. Regular Users (blank state — no profile, no preference) ──
  const users = [
    { id: "seed-user-1", nickname: "用户小红", qqNumber: "10001" },
    { id: "seed-user-2", nickname: "用户小蓝", qqNumber: "10002" },
    { id: "seed-user-3", nickname: "用户小绿", qqNumber: "10003" },
    { id: "seed-user-4", nickname: "用户小紫", qqNumber: "10004" },
    { id: "seed-user-5", nickname: "用户小橙", qqNumber: "10005" },
  ];

  for (const u of users) {
    const user = await prisma.user.create({
      data: {
        id: u.id,
        qqNumber: u.qqNumber,
        passwordHash: defaultPasswordHash,
        role: UserRole.USER,
        authIdentities: {
          create: {
            provider: "qq",
            providerUserId: u.qqNumber,
            openid: `user_openid_${u.qqNumber}`,
            nickname: u.nickname,
          },
        },
      },
    });
    console.log(`  ✅ User: ${user.id} (${u.nickname}) — blank state`);
  }

  // ── 5. Group Memberships ────────────────────────────
  await prisma.groupMembership.create({
    data: {
      userId: "seed-user-1",
      qqNumber: "10001",
      status: MembershipStatus.VERIFIED,
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      verifiedBy: "seed-admin",
    },
  });
  await prisma.groupMembership.create({
    data: {
      userId: "seed-user-2",
      qqNumber: "10002",
      status: MembershipStatus.EXPIRED,
      verifiedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      verifiedBy: "seed-admin",
    },
  });
  console.log("  ✅ Group memberships created");



  console.log("\n🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
