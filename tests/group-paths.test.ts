import { describe, expect, it, vi } from "vitest";
import { groupPath, isGroupSlug } from "@/lib/groups/paths";
import { groupUrlForId } from "@/lib/groups/urls";
import type { createClient } from "@/lib/supabase/server";

describe("group URL boundaries", () => {
  it.each(["club", "school-123", "x".repeat(80)])("accepts canonical slug %s", slug => {
    expect(isGroupSlug(slug)).toBe(true);
    expect(groupPath(slug)).toBe(`/groups/${slug}`);
  });
  it.each(["", "new", "Uppercase", "a--b", "-club", "club-", "a/b", "a?x=1", "学校", "x".repeat(81), "20000000-0000-4000-8000-000000000301"])("rejects invalid or legacy segment %s", slug => {
    expect(isGroupSlug(slug)).toBe(false);
    expect(() => groupPath(slug)).toThrow("Invalid group slug");
  });
  it.each([
    [{ data: { slug: "club" }, error: null }, "/groups/club"],
    [{ data: null, error: null }, null],
    [{ data: { slug: "new" }, error: null }, null],
    [{ data: { slug: "club" }, error: { code: "unavailable" } }, null],
  ])("resolves only accessible canonical slugs", async (result, expected) => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result) };
    const client = { from: vi.fn(() => query) } as unknown as Awaited<ReturnType<typeof createClient>>;
    expect(await groupUrlForId(client, "group-uuid")).toBe(expected);
    expect(query.eq).toHaveBeenCalledWith("id", "group-uuid");
  });
});
