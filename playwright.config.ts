import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", headless: true },
  webServer: [
    { command: "node tests/e2e/mock-supabase.mjs", url: "http://127.0.0.1:54329/health", reuseExistingServer: false },
    { command: "pnpm build && pnpm exec next start --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100/sign-in", reuseExistingServer: false,
      env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "mock-key", SUPABASE_SECRET_KEY: "sb_secret_mock-key", VALHALLA_URL: "http://127.0.0.1:54329", GEOAPIFY_API_KEY: "mock-key", GEOAPIFY_API_URL: "http://127.0.0.1:54329/v1/geocode/search" }, timeout: 120000 }
  ]
});
