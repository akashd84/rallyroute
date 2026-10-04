import { createHash, randomInt } from "node:crypto";
import { invitationAlphabet } from "./code";
export async function createCodeInvitation(create: (hash: string) => PromiseLike<{ error: { code?: string } | null }>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 6 }, () => invitationAlphabet[randomInt(invitationAlphabet.length)]).join("");
    const result = await create(createHash("sha256").update(code).digest("hex"));
    if (!result.error) return { code, error: null };
    if (result.error.code !== "23505") return { code: undefined, error: result.error };
  }
  return { code: undefined, error: { code: "collision" } };
}
