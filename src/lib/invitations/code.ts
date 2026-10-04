export const invitationAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export type InvitationKind = "household" | "group";
export function normalizeInvitationCode(value: string): string | null {
  if (value.length > 32) return null;
  const compact = value.replace(/[\s-]/g, "");
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/i.test(compact) ? compact.toUpperCase() : null;
}
