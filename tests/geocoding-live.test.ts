import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { geocodeAddress } from "@/lib/geocoding";
describe.skipIf(process.env.RALLYROUTE_TEST_GEOCODING !== "1")("live public-address geocoding", () => {
  it("resolves a public Georgia building with household-level quality", async () => {
    const result = await geocodeAddress({ addressLine1: "600 Peachtree Street NE", addressLine2: "", city: "Atlanta", stateRegion: "GA", postalCode: "30308", countryCode: "US" });
    expect(result.latitude).toBeGreaterThan(33);
    expect(result.latitude).toBeLessThan(35);
    expect(result.attribution).not.toBe("");
  }, 15000);
});
