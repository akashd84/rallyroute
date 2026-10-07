const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGroupSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 80 &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value !== "new" && !uuidPattern.test(value);
}

export function groupPath(slug: string): string {
  if (!isGroupSlug(slug)) throw new Error("Invalid group slug");
  return `/groups/${slug}`;
}

export const groupLinkRecoveryPath = "/groups?notice=group-link";

export function groupInvitationPath(slug: string, page: "invite" | "share"): string {
  groupPath(slug);
  return `/group/${slug}/${page}`;
}
