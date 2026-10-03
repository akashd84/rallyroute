"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AuthResult } from "@/lib/auth/result";

const emailSchema = z.string().trim().email().max(254);
const codeSchema = z.string().trim().regex(/^(?:\d{6}|\d{8})$/);

function failed(error: { status?: number; code?: string }, verifying = false): AuthResult {
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
    return { ok: false, message: "Too many attempts. Please wait before trying again.", retryAfter: 60 };
  }
  if (verifying && (error.code === "otp_expired" || error.code === "otp_disabled" || error.status === 400 || error.status === 403)) {
    return { ok: false, message: "That code is invalid or expired. Try again or request a new code." };
  }
  return { ok: false, message: "Sign-in is temporarily unavailable. Please try again shortly." };
}

export async function requestCode(email: string): Promise<AuthResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { shouldCreateUser: true } });
    if (error) return failed(error);
    return { ok: true, message: "Check your email for a sign-in code.", retryAfter: 60 };
  } catch {
    return { ok: false, message: "Sign-in is temporarily unavailable. Please try again shortly." };
  }
}

export async function verifyCode(email: string, code: string): Promise<AuthResult> {
  const parsedEmail = emailSchema.safeParse(email);
  const parsedCode = codeSchema.safeParse(code);
  if (!parsedEmail.success || !parsedCode.success) return { ok: false, message: "Enter a valid email and six- or eight-digit code." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email: parsedEmail.data, token: parsedCode.data, type: "email" });
    if (error) return failed(error, true);
    if (!data.user || !data.session) return { ok: false, message: "Sign-in could not be completed. Request a new code." };
  } catch {
    return { ok: false, message: "Sign-in is temporarily unavailable. Please try again shortly." };
  }
  redirect("/account");
}
