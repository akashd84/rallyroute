import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("allows only the configured exact tunnel host in development", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("RALLYROUTE_DEV_ORIGIN", "https://example.devtunnels.ms:8443");
  vi.resetModules();
  const { default: config } = await import("../next.config");
  expect(config.allowedDevOrigins).toEqual(["example.devtunnels.ms"]);
  expect(config.experimental?.serverActions).toEqual({ allowedOrigins: ["example.devtunnels.ms:8443", "localhost:3000"] });
});

it("does not introduce an origin exception in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RALLYROUTE_DEV_ORIGIN", "https://example.devtunnels.ms");
  vi.resetModules();
  const { default: config } = await import("../next.config");
  expect(config.allowedDevOrigins).toBeUndefined();
  expect(config.experimental?.serverActions).toBeUndefined();
});

it("keeps default same-origin behavior without a configured tunnel", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("RALLYROUTE_DEV_ORIGIN", "");
  vi.resetModules();
  const { default: config } = await import("../next.config");
  expect(config).toEqual({});
});

it.each(["https://example.devtunnels.ms/sign-in", "https://user:password@example.devtunnels.ms", "ftp://example.devtunnels.ms"])("rejects non-origin configuration %s", async origin => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("RALLYROUTE_DEV_ORIGIN", origin);
  vi.resetModules();
  await expect(import("../next.config")).rejects.toThrow("must be an HTTP(S) origin");
});
