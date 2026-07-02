import { Resend, type ErrorResponse } from "resend";
import { createTransport, type Transporter } from "nodemailer";
import { createLogger } from "@/lib/logger";

const log = createLogger("email");

export class ResendEmailError extends Error {
  readonly resendCode: string;
  readonly statusCode: number | null;

  constructor(error: ErrorResponse) {
    super(`Resend error: ${error.message}`);
    this.name = "ResendEmailError";
    this.resendCode = error.name;
    this.statusCode = error.statusCode;
  }
}

export function isResendRateLimitError(error: unknown): error is ResendEmailError {
  return error instanceof ResendEmailError && error.statusCode === 429;
}

// ─── Provider selection ──────────────────────────────────
// EMAIL_PROVIDER = "smtp" → use QQ SMTP (testing / no domain)
// EMAIL_PROVIDER = "resend" → use Resend API (production / with domain)
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "smtp";

// ─── Resend client (lazy, only created when needed) ──────
let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// ─── SMTP transporter (lazy, only created when needed) ───
let smtpTransport: Transporter | null = null;
function getSmtpTransport(): Transporter {
  if (!smtpTransport) {
    smtpTransport = createTransport({
      host: process.env.SMTP_HOST || "smtp.qq.com",
      port: parseInt(process.env.SMTP_PORT || "465"),
      secure: process.env.SMTP_SECURE !== "false", // true for 465
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
    });
  }
  return smtpTransport;
}

// ─── Shared email HTML template ──────────────────────────
function buildVerificationHtml(code: string): string {
  return `
    <div style="max-width: 400px; margin: 20px auto; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; border: 1px solid #e8e8e8; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);">
      <h2 style="color: #1677ff; margin: 0 0 4px 0; font-size: 24px; font-weight: 700;">TenMatch</h2>
      <p style="color: #86909c; font-size: 13px; margin: 0 0 24px 0; font-weight: 500;">QQ 群成员资料匹配系统</p>
      <div style="background: #e6f4ff; border-radius: 12px; padding: 24px 16px; text-align: center; margin-bottom: 24px;">
        <p style="color: #555555; font-size: 14px; margin: 0 0 12px 0; font-weight: 500;">您的验证码是</p>
        <p style="color: #1677ff; font-size: 36px; font-weight: bold; letter-spacing: 6px; margin: 0; font-family: 'Courier New', Courier, monospace;">${code}</p>
      </div>
      <p style="color: #86909c; font-size: 12px; margin: 0; line-height: 1.5;">该验证码 10 分钟内有效，请勿泄露给他人。</p>
      <p style="color: #86909c; font-size: 12px; margin: 4px 0 0 0; line-height: 1.5;">如非本人操作，请忽略此邮件。</p>
    </div>
  `;
}

function buildVerificationText(code: string): string {
  return `您的验证码是: ${code}\n\n该验证码 10 分钟内有效，请勿泄露给他人。\n\n如非本人操作，请忽略此邮件。`;
}

// ─── Send via SMTP ───────────────────────────────────────
async function sendViaSMTP(
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<void> {
  const transport = getSmtpTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "";

  log.info({ provider: "smtp", to, subject }, "Sending email via SMTP");

  const info = await transport.sendMail({ from, to, subject, text, html });

  log.info(
    { messageId: info.messageId, to },
    "SMTP email sent successfully"
  );
}

// ─── Send via Resend ─────────────────────────────────────
async function sendViaResend(
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<void> {
  const resend = getResend();
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";

  log.info({ provider: "resend", to, subject }, "Sending email via Resend");

  const { error } = await resend.emails.send({ from, to, subject, text, html });

  if (error) {
    throw new ResendEmailError(error);
  }

  log.info({ to }, "Resend email sent successfully");
}

// ─── Public API ──────────────────────────────────────────

/**
 * Send a verification code email.
 *
 * Provider is selected via EMAIL_PROVIDER env var:
 *  - "smtp"   → QQ SMTP (for testing, no domain needed)
 *  - "resend" → Resend API (for production, requires domain)
 *
 * In Resend sandbox mode (no custom domain):
 *  - from: must be onboarding@resend.dev
 *  - to:   overridden to RESEND_SANDBOX_TO
 *
 * In production (custom domain configured):
 *  - from: RESEND_FROM (e.g. noreply@yourdomain.com)
 *  - to:   {qqNumber}@qq.com
 */
export async function sendVerificationCode(
  qqNumber: string,
  code: string
): Promise<void> {
  const subject = "TenMatch 验证码";
  const text = buildVerificationText(code);
  const html = buildVerificationHtml(code);

  if (EMAIL_PROVIDER === "resend") {
    // Resend mode: use sandbox override if configured
    const sandboxTo = process.env.RESEND_SANDBOX_TO;
    const to = sandboxTo || `${qqNumber}@qq.com`;
    await sendViaResend(to, subject, text, html);
  } else {
    // SMTP mode: send to the user's QQ email directly
    const to = `${qqNumber}@qq.com`;
    await sendViaSMTP(to, subject, text, html);
  }
}
