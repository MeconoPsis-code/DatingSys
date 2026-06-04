import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.qq.com",
  port: parseInt(process.env.SMTP_PORT || "465", 10),
  secure: true, // SSL for port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a verification code email to a QQ mail address.
 * QQ mail address is derived from QQ number: {qqNumber}@qq.com
 */
export async function sendVerificationCode(
  qqNumber: string,
  code: string
): Promise<void> {
  const to = `${qqNumber}@qq.com`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "Date System 验证码",
    text: `您的验证码是: ${code}\n\n该验证码 10 分钟内有效，请勿泄露给他人。\n\n如非本人操作，请忽略此邮件。`,
    html: `
      <div style="max-width: 400px; margin: 0 auto; padding: 32px; font-family: -apple-system, sans-serif;">
        <h2 style="color: #7c3aed; margin-bottom: 8px;">Date System</h2>
        <p style="color: #666; font-size: 14px; margin-bottom: 24px;">QQ 群成员资料匹配系统</p>
        <div style="background: #f3f0ff; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="color: #666; font-size: 14px; margin: 0 0 12px 0;">您的验证码是</p>
          <p style="color: #7c3aed; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 0;">${code}</p>
        </div>
        <p style="color: #999; font-size: 12px;">该验证码 10 分钟内有效，请勿泄露给他人。</p>
        <p style="color: #999; font-size: 12px;">如非本人操作，请忽略此邮件。</p>
      </div>
    `,
  });
}
