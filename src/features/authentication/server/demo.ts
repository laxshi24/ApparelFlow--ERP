import "server-only";
import { DEMO_USERS } from "@/lib/database/seed";
import { env } from "@/lib/env";
import type { DemoAccount } from "../ui/demo-credentials-panel";

/** Demo credentials are only exposed when DEMO_MODE=true (evaluation deployments). */
export function getDemoConfig(): { accounts: DemoAccount[]; password: string } | null {
  const { DEMO_MODE, DEMO_PASSWORD } = env();
  if (!DEMO_MODE || !DEMO_PASSWORD) return null;
  return { accounts: DEMO_USERS.map((u) => ({ ...u })), password: DEMO_PASSWORD };
}
