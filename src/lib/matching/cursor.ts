import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
const savedSchema = z.object({ key: z.string().regex(/^[a-f0-9-]{36}:[a-f0-9-]{36}$/), fingerprint: z.string().regex(/^[a-f0-9]{32}$/), seconds: z.number().finite().nonnegative() });
const stateSchema = z.object({
  version: z.literal(1), user: z.string().uuid(), event: z.string().uuid(), household: z.string().uuid(),
  leg: z.enum(["to_event","from_event"]), expires: z.number(), after: z.string().max(73),
  checked: z.number().int().min(0).max(1000), failed: z.boolean(), saved: z.array(savedSchema).max(1000),
});
export type DiscoveryState = z.infer<typeof stateSchema>;
function key() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Missing server configuration");
  return createHash("sha256").update(`rallyroute-match-cursor-v1:${secret}`).digest();
}
export function encodeCursor(state: DiscoveryState) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm",key(),iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(state),"utf8"),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString("base64url");
}
export function decodeCursor(token: string, context: Pick<DiscoveryState,"user"|"event"|"household"|"leg">) {
  if (token.length>300000) throw new Error("Invalid cursor");
  const bytes = Buffer.from(token,"base64url");
  const decipher = createDecipheriv("aes-256-gcm",key(),bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(12,28));
  const state = stateSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString("utf8")));
  if (state.expires<Date.now() || Object.entries(context).some(([k,v]) => state[k as keyof DiscoveryState]!==v)) throw new Error("Invalid cursor");
  return state;
}
