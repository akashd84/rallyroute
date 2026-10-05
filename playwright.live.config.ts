import { defineConfig } from "@playwright/test";
// Explicit opt-in only. Never reuse the mocked provider configuration.
process.loadEnvFile(".env.local");
export default defineConfig({
  testDir: "./tests/live", workers: 1, fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3101", headless: true, trace: "off" },
  webServer: { command: "pnpm build && pnpm exec next start --hostname 127.0.0.1 --port 3101", url: "http://127.0.0.1:3101/sign-in", reuseExistingServer: false, timeout: 120000 },
});
