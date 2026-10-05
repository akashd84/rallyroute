import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
const proofSchema = z.object({
  version: z.literal(1), user: z.string().uuid(), household: z.string().uuid(), other: z.string().uuid(),
  event: z.string().uuid(), leg: z.enum(["to_event", "from_event"]),
  pair: z.string().regex(/^[a-f0-9-]{36}:[a-f0-9-]{36}$/), fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  distance: z.number().int().min(1000).max(250000), expires: z.number().finite(),
});
export type ConnectionProof = z.infer<typeof proofSchema>;
function key() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Missing server configuration");
  return createHash("sha256").update(`rallyroute-connection-proof-v1:${secret}`).digest();
}
export function encodeConnectionProof(input: Omit<ConnectionProof, "version" | "expires">) {
  const proof = proofSchema.parse({ ...input, version: 1, expires: Date.now() + 30 * 60 * 1000 });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(proof), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function decodeConnectionProof(token: string, user: string, household: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > 4096) throw new Error("Invalid proof");
  const bytes = Buffer.from(token, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const proof = proofSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")));
  if (proof.expires <= Date.now() || proof.user !== user || proof.household !== household) throw new Error("Expired or invalid proof");
  return proof;
}
