import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  distDir: process.env.LOCAL_QA_DIST_DIR ?? '.next',
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@genealogiq/auth", "@genealogiq/core", "@genealogiq/i18n", "@genealogiq/email", "@genealogiq/db", "@genealogiq/services", "@genealogiq/ui"],
  experimental: {
    authInterrupts: true,
  },
};

// Sentry wraps the inner (next-intl) config so both plugins compose.
// Source-map upload only runs when SENTRY_AUTH_TOKEN is present (CI / Vercel);
// it is a no-op locally, so dev builds don't need any Sentry secret.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
