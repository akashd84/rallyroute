import { describe, expect, it } from "vitest";
import { householdPath, isHouseholdSlug } from "@/lib/households/paths";
import { householdUrlForId } from "@/lib/households/urls";
import type { createClient } from "@/lib/supabase/server";
describe("household slug paths", () => {
  it.each(["home", "example-household", "a".repeat(80)])("accepts canonical slug %s", slug => {
    expect(isHouseholdSlug(slug)).toBe(true);
    expect(householdPath(slug)).toBe(`/households/${slug}`);
  });
  it.each(["", "new", "Home", "a_thing", "a--b", "-home", "home/locations", "a".repeat(81), "33333333-3333-4333-8333-333333333333"])("rejects %s", slug => {
    expect(isHouseholdSlug(slug)).toBe(false);
    expect(() => householdPath(slug)).toThrow();
  });
  it.each([{ data: { slug: "example-household" }, error: null }, { data: null, error: null }, { data: { slug: "new" }, error: null }, { data: null, error: { code: "42501" } }])("only resolves accessible canonical slugs", async result => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => result }) }) }) }) } as unknown as Awaited<ReturnType<typeof createClient>>;
    expect(await householdUrlForId(client, "33333333-3333-4333-8333-333333333333")).toBe(result.data?.slug === "example-household" ? "/households/example-household" : null);
  });
});
