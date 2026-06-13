/**
 * Quick test script: send a verification email via SMTP or Resend.
 *
 * Usage:
 *   npx tsx scripts/test-email.ts              # uses EMAIL_PROVIDER from .env
 *   npx tsx scripts/test-email.ts 463430278    # specify QQ number
 *
 * Provider is selected via EMAIL_PROVIDER env var:
 *   - "smtp"   → QQ SMTP (default for testing)
 *   - "resend" → Resend API (production)
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

import { createTransport } from "nodemailer";
import { Resend } from "resend";

function generateRandomCode(length = 6): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const qqNumber = process.argv[2] || "463430278";
const testCode = generateRandomCode(6);
const provider = process.env.EMAIL_PROVIDER || "smtp";

const emailHtml = `
  <div style="max-width: 400px; margin: 20px auto; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; border: 1px solid #e8e8e8; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);">
    <h2 style="color: #1677ff; margin: 0 0 4px 0; font-size: 24px; font-weight: 700;">TenMatch</h2>
    <p style="color: #86909c; font-size: 13px; margin: 0 0 24px 0; font-weight: 500;">QQ 群成员资料匹配系统</p>
    <div style="background: #e6f4ff; border-radius: 12px; padding: 24px 16px; text-align: center; margin-bottom: 24px;">
      <p style="color: #555555; font-size: 14px; margin: 0 0 12px 0; font-weight: 500;">您的验证码是</p>
      <p style="color: #1677ff; font-size: 36px; font-weight: bold; letter-spacing: 6px; margin: 0; font-family: 'Courier New', Courier, monospace;">${testCode}</p>
    </div>
    <p style="color: #86909c; font-size: 12px; margin: 0; line-height: 1.5;">⚠️ 这是一封测试邮件。</p>
  </div>
`;

async function sendViaSMTP() {
  const host = process.env.SMTP_HOST || "smtp.qq.com";
  const port = parseInt(process.env.SMTP_PORT || "465");
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || user;
  const to = `${qqNumber}@qq.com`;

  console.log("─── SMTP Config ───");
  console.log(`  Host:  ${host}:${port}`);
  console.log(`  User:  ${user}`);
  console.log(`  Pass:  ${pass ? "****" + pass.slice(-4) : "(not set)"}`);
  console.log(`  From:  ${from}`);
  console.log(`  To:    ${to}`);
  console.log(`  Code:  ${testCode}`);
  console.log("");

  if (!user || !pass) {
    console.error("❌ SMTP_USER or SMTP_PASS not set in .env");
    process.exit(1);
  }

  const transport = createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
  });

  console.log(`📨 Sending test email via SMTP to ${to} ...`);

  const info = await transport.sendMail({
    from,
    to,
    subject: "TenMatch 验证码（测试）",
    text: `您的验证码是: ${testCode}\n\n这是一封测试邮件。`,
    html: emailHtml,
  });

  console.log("✅ Email sent successfully!");
  console.log(`   Message ID: ${info.messageId}`);
}

async function sendViaResend() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const sandboxTo = process.env.RESEND_SANDBOX_TO;
  const to = sandboxTo || `${qqNumber}@qq.com`;

  console.log("─── Resend Config ───");
  console.log(`  API Key: ${apiKey ? "re_****" + apiKey.slice(-4) : "(not set)"}`);
  console.log(`  From:    ${from}`);
  console.log(`  To:      ${to}${sandboxTo ? " (sandbox override)" : ""}`);
  console.log(`  Code:    ${testCode}`);
  console.log("");

  if (!apiKey) {
    console.error("❌ RESEND_API_KEY not set in .env");
    process.exit(1);
  }

  const resend = new Resend(apiKey);

  console.log(`📨 Sending test email via Resend to ${to} ...`);

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: "TenMatch 验证码（测试）",
    text: `您的验证码是: ${testCode}\n\n这是一封测试邮件。`,
    html: emailHtml,
  });

  if (error) {
    console.error("❌ Resend error:", error);
    process.exit(1);
  }

  console.log("✅ Email sent successfully!");
  console.log(`   Email ID: ${data?.id}`);
}

async function main() {
  console.log(`\n📧 Email Provider: ${provider}\n`);

  if (provider === "resend") {
    await sendViaResend();
  } else {
    await sendViaSMTP();
  }
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
