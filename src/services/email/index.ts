import nodemailer from "nodemailer";
import { emailConfig } from "../../config/email-config.js";
import { logger } from "../../utils/pino-logger.js";

const transporter = emailConfig.isConfigured
  ? nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.port === 465,
      auth: { user: emailConfig.user, pass: emailConfig.pass },
    })
  : null;

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const subject = "Your reset code — Git Activity Monitor";
  const text = [
    `Your password reset code is: ${otp}`,
    "",
    "This code expires in 10 minutes. Do not share it with anyone.",
    "If you did not request a reset, ignore this email.",
  ].join("\n");

  if (!transporter) {
    // Dev fallback: print OTP to log when SMTP is not configured
    logger.warn({ to, otp }, "[DEV] SMTP not configured — OTP printed to log only");
    return;
  }

  await transporter.sendMail({ from: emailConfig.from, to, subject, text });
  logger.info({ to }, "OTP email sent");
}
