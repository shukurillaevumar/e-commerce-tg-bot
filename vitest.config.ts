import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@bot": path.resolve(__dirname, "src/bot"),
      "@domain": path.resolve(__dirname, "src/domain"),
      "@infra": path.resolve(__dirname, "src/infra"),
      "@repositories": path.resolve(__dirname, "src/repositories"),
      "@services": path.resolve(__dirname, "src/services"),
      "@utils": path.resolve(__dirname, "src/utils"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
    },
  },
});
