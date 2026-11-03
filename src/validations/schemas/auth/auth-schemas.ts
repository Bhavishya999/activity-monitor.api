import { z } from "zod";

export const vLogin = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const vForgotPassword = z.object({
  email: z.string().email(),
});

export const vVerifyOtp = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/),
});

export const vResetPassword = z.object({
  resetToken: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
