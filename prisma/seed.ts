import { PrismaClient, UserRole, Attribute, ProfileStatus, MembershipStatus, InviteCodeStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createHash } from "crypto";
import bcrypt from "bcrypt";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

async function main() {
  console.log("🌱 Seeding database...");

  // ── 0. Cleanup: delete all data in reverse FK order ──
  console.log("  🗑️  Cleaning existing data...");
  await prisma.ratingScore.deleteMany();
  await prisma.ratingTask.deleteMany();
  await prisma.ratingProfile.deleteMany();
  await prisma.profilePhoto.deleteMany();
  await prisma.matchSnapshot.deleteMany();
  await prisma.viewRequest.deleteMany();
  await prisma.report.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.preference.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.penalty.deleteMany();
  await prisma.inviteCode.deleteMany();
  await prisma.groupMembership.deleteMany();
  await prisma.authIdentity.deleteMany();
  await prisma.user.deleteMany();
  console.log("  ✅ Cleanup done");

  // Default password for all seed users: "password1"
  const defaultPasswordHash = await bcrypt.hash("password1", 12);

  // ── 1. Super Admin ──────────────────────────────────
  const superAdmin = await prisma.user.upsert({
    where: { id: "seed-super-admin" },
    update: {},
    create: {
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
  const admin = await prisma.user.upsert({
    where: { id: "seed-admin" },
    update: {},
    create: {
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
    const scorer = await prisma.user.upsert({
      where: { id: scorerIds[i] },
      update: {},
      create: {
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

  // ── 4. Regular Users with Profiles ──────────────────
  const users = [
    {
      id: "seed-user-1",
      nickname: "用户小红",
      qqNumber: "10001",
      birthDate: new Date("2000-03-15"),
      heightCm: 165,
      weightKg: 55,
      province: "110000",
      city: "110100",
      attribute: Attribute.ZERO,
    },
    {
      id: "seed-user-2",
      nickname: "用户小蓝",
      qqNumber: "10002",
      birthDate: new Date("1998-07-20"),
      heightCm: 178,
      weightKg: 72,
      province: "310000",
      city: "310100",
      attribute: Attribute.ONE,
    },
    {
      id: "seed-user-3",
      nickname: "用户小绿",
      qqNumber: "10003",
      birthDate: new Date("2001-11-05"),
      heightCm: 170,
      weightKg: 63,
      province: "440000",
      city: "440100",
      attribute: Attribute.LEAN_ONE,
    },
    {
      id: "seed-user-4",
      nickname: "用户小紫",
      qqNumber: "10004",
      birthDate: new Date("1999-01-28"),
      heightCm: 175,
      weightKg: 68,
      province: "510000",
      city: "510100",
      attribute: Attribute.LEAN_ZERO,
    },
    {
      id: "seed-user-5",
      nickname: "用户小橙",
      qqNumber: "10005",
      birthDate: new Date("2002-09-12"),
      heightCm: 168,
      weightKg: 58,
      province: "330000",
      city: "330100",
      attribute: Attribute.SIDE,
    },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: {
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
        profile: {
          create: {

            birthDate: u.birthDate,
            heightCm: u.heightCm,
            weightKg: u.weightKg,
            provinceCode: u.province,
            cityCode: u.city,
            attribute: u.attribute,
            selfIntro: `大家好，我是${u.nickname}`,
            consentProfileVisibility: true,
            status: ProfileStatus.ACTIVE,
          },
        },
        preference: {
          create: {
            ageMin: 18,
            ageMax: 35,
            heightMinCm: 155,
            heightMaxCm: 190,
            weightMinKg: 40,
            weightMaxKg: 90,
            expectedAttributes: [Attribute.ONE, Attribute.ZERO, Attribute.LEAN_ONE],
          },
        },
      },
    });
    console.log(`  ✅ User: ${user.id} (${u.nickname})`);
  }

  // ── 5. Group Memberships ────────────────────────────
  await prisma.groupMembership.upsert({
    where: { userId: "seed-user-1" },
    update: {},
    create: {
      userId: "seed-user-1",
      qqNumber: "10001",
      status: MembershipStatus.VERIFIED,
      verifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      verifiedBy: "seed-admin",
    },
  });
  await prisma.groupMembership.upsert({
    where: { userId: "seed-user-2" },
    update: {},
    create: {
      userId: "seed-user-2",
      qqNumber: "10002",
      status: MembershipStatus.EXPIRED,
      verifiedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      verifiedBy: "seed-admin",
    },
  });
  console.log("  ✅ Group memberships created");

  // ── 6. Invite Codes ─────────────────────────────────
  const codes = [
    { code: "INVITE-UNUSED-001", status: InviteCodeStatus.UNUSED, qqNumber: "20001" },
    { code: "INVITE-USED-001", status: InviteCodeStatus.USED, qqNumber: "10001", usedBy: "seed-user-1" },
    { code: "INVITE-EXPIRED-001", status: InviteCodeStatus.EXPIRED, qqNumber: null },
  ];

  for (const c of codes) {
    await prisma.inviteCode.upsert({
      where: { codeHash: hashCode(c.code) },
      update: {},
      create: {
        codeHash: hashCode(c.code),
        qqNumber: c.qqNumber,
        status: c.status,
        expiresAt: c.status === InviteCodeStatus.EXPIRED
          ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdBy: "seed-admin",
        usedBy: c.usedBy || null,
        usedAt: c.usedBy ? new Date() : null,
        remark: `Seed: ${c.code}`,
      },
    });
  }
  console.log("  ✅ Invite codes created");

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
