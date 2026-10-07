import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  testDir: "./scripts",
  testMatch: "review-routes.spec.ts",
  timeout: 240_000,
  use: {
    ...config.use,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    timezoneId: "America/New_York",
  },
});
