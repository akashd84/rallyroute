import { describe, expect, it, vi } from "vitest";
import { eventPath, isEventSlug } from "@/lib/events/paths";
import { eventUrlForId } from "@/lib/events/urls";
import type { createClient } from "@/lib/supabase/server";

describe("event slug URL boundaries", () => {
  it.each(["practice", "event-settings", "x".repeat(80)])("accepts %s", slug => {
    expect(eventPath("club", slug)).toBe(`/groups/club/${slug}`);
  });
  it.each(["", "events", "members", "settings", "invite", "share", "new", "Upper", "a--b", "a/b", "学校", "x".repeat(81), "44444444-4444-4444-8444-444444444444"])("rejects %s", slug => {
    expect(isEventSlug(slug)).toBe(false);
    expect(() => eventPath("club", slug)).toThrow();
  });
  it("returns a recoverable missing link when the provider throws", async () => {
    const client = { from: vi.fn(() => { throw new Error("provider unavailable"); }) } as unknown as Awaited<ReturnType<typeof createClient>>;
    expect(await eventUrlForId(client, "group-uuid", "event-uuid")).toBeNull();
  });
  it.each([null, { slug: "practice" }, { slug: "settings" }])("resolves only accessible canonical event slugs", async data => {
    const eventQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) };
    const groupQuery = { ...eventQuery, maybeSingle: vi.fn().mockResolvedValue({ data: { slug: "club" }, error: null }) };
    const client = { from: vi.fn(table => table === "events" ? eventQuery : groupQuery) } as unknown as Awaited<ReturnType<typeof createClient>>;
    expect(await eventUrlForId(client, "group-uuid", "event-uuid")).toBe(data?.slug === "practice" ? "/groups/club/practice" : null);
    expect(eventQuery.eq).toHaveBeenCalledWith("group_id", "group-uuid");
    expect(eventQuery.eq).toHaveBeenCalledWith("id", "event-uuid");
  });
});
