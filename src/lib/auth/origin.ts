import { headers } from "next/headers";
import { publicAppBaseUrl } from "@/lib/env";

export async function appOrigin() {
  const configured = publicAppBaseUrl();
  if (configured) return configured;
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") || "http";
  if (!host) return "";
  return `${proto}://${host}`;
}
