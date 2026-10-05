import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RoutingFailure, RoutingProvider, RoutingResult } from "./types";

export function positiveSetting(name: string, fallback: number, max: number, env: Record<string, string | undefined> = process.env): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new Error("Invalid provider usage configuration.");
  return value;
}
export function routingLeaseSeconds(env: Record<string, string | undefined> = process.env): number {
  return Math.ceil(positiveSetting("VALHALLA_TIMEOUT_MS", 10000, 60000, env) / 1000) + 10;
}
/** Honor bounded provider retry hints without exposing response bodies. */
export function providerRetrySeconds(header: string | null): number {
  if (!header) return 30;
  const numeric = Number(header);
  const seconds = Number.isFinite(numeric) ? numeric : (Date.parse(header) - Date.now()) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(3600, Math.ceil(seconds)) : 30;
}
export const admissionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok") }),
  z.object({ status: z.literal("rate_limited"), retryAfterSeconds: z.number().int().positive() }),
]);
export function throttled(retryAfterSeconds: number): RoutingFailure {
  return { status: "error", code: "rate_limited", message: "Routing is busy. Please try again later.", retryAfterSeconds };
}

export async function consumeGeocodingBudget(userId: string): Promise<number> {
  z.string().uuid().parse(userId);
  const response = await createAdminClient().rpc("provider_budget_acquire", {
    p_provider: "geocoding", p_subject: userId,
    p_minute_limit: positiveSetting("GEOCODING_REQUESTS_PER_MINUTE", 10, 10000),
    p_hour_limit: positiveSetting("GEOCODING_REQUESTS_PER_HOUR", 50, 100000),
    p_concurrency: 0, p_lease_seconds: 18,
  });
  if (response.error) throw new Error("Unable to enforce geocoding usage limits.");
  const result = admissionSchema.parse(response.data);
  return result.status === "ok" ? 0 : result.retryAfterSeconds;
}

/** Distributed budgets apply to every calculation exposed by the factory. */
export function withUsageControls(provider: RoutingProvider, env: Record<string, string | undefined> = process.env): RoutingProvider {
  async function run<T>(calculate: () => Promise<RoutingResult<T>>): Promise<RoutingResult<T>> {
    let admin: ReturnType<typeof createAdminClient>;
    const token = randomUUID();
    try {
      admin = createAdminClient();
      const response = await admin.rpc("provider_budget_acquire", {
        p_provider: "routing", p_subject: "global", p_token: token,
        p_minute_limit: positiveSetting("ROUTING_REQUESTS_PER_MINUTE", 60, 10000, env),
        p_hour_limit: positiveSetting("ROUTING_REQUESTS_PER_HOUR", 100000, 100000, env),
        p_concurrency: positiveSetting("ROUTING_MAX_CONCURRENT_REQUESTS", 4, 100, env),
        p_lease_seconds: routingLeaseSeconds(env),
      });
      if (response.error) throw new Error();
      const result = admissionSchema.parse(response.data);
      if (result.status === "rate_limited") return throttled(result.retryAfterSeconds);
    } catch {
      return { status: "error", code: "network", message: "Routing usage controls are unavailable. Please try again." };
    }
    let result: RoutingResult<T>;
    try { result = await calculate(); }
    catch { result = { status: "error", code: "network", message: "Routing is temporarily unavailable. Please try again." }; }
    try {
      const released = await admin.rpc("provider_budget_release", { p_token: token });
      if (released.error) throw new Error();
      return result;
    } catch {
      // Failed releases expire naturally; do not permit unbounded replacement work.
      return { status: "error", code: "network", message: "Routing is temporarily unavailable. Please try again." };
    }
  }
  return {
    capabilities: provider.capabilities,
    checkHealth: () => provider.checkHealth(),
    getRoute: request => run(() => provider.getRoute(request)),
    getTravelTime: request => run(() => provider.getTravelTime(request)),
    getMatrix: request => run(() => provider.getMatrix(request)),
  };
}
