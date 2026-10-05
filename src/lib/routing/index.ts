import 'server-only';
import { ValhallaProvider } from './valhalla';
import { withUsageControls } from './usage-controls';
import type { RoutingProvider } from './types';
export type * from './types';

/** Selection happens only on the server; no browser-facing routing endpoint is introduced. */
export function getRoutingProvider(env: Record<string, string | undefined> = process.env): RoutingProvider {
  if ((env.ROUTING_PROVIDER ?? 'valhalla') !== 'valhalla') throw new Error('Unsupported ROUTING_PROVIDER configuration.');
  const url = env.VALHALLA_URL ?? env.VALHALLA_BASE_URL;
  if (!url) throw new Error('Configure VALHALLA_URL before using routing.');
  return withUsageControls(new ValhallaProvider(url, env.VALHALLA_TIMEOUT_MS === undefined ? 10000 : Number(env.VALHALLA_TIMEOUT_MS)), env);
}
