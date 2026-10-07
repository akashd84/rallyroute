import { groupPath } from "@/lib/groups/paths";
const reserved = new Set(["events", "members", "settings", "invite", "share", "new"]);
export function isEventSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) &&
    !reserved.has(value) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
export function eventPath(groupSlug: string, eventSlug: string): string {
  if (!isEventSlug(eventSlug)) throw new Error("Invalid event slug");
  return `${groupPath(groupSlug)}/${eventSlug}`;
}
