import { z } from "zod";

export type ActionState = { error?: string; success?: string } | null;

export function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

export function optionalNumber(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function dateField(formData: FormData, key: string) {
  const value = text(formData, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export const settingsSchema = z.object({
  stale_after_days: z.coerce.number().int().min(1).max(180),
  profiles_waiting_days: z.coerce.number().int().min(1).max(90),
  recruitment_target_business_days: z.coerce.number().int().min(1).max(60),
  approaching_window_days: z.coerce.number().int().min(1).max(30),
  business_timezone: z.string().trim().min(1).max(80),
});
