import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/**/*.test.ts"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    // Each test file runs in isolation to prevent shared module state leaks
    isolate: true,
    // Resolve .js extensions to .ts for ESM imports in source files
    alias: {
      // Vitest handles .js -> .ts resolution automatically with bundler
    },
  },
  resolve: {
    // Allow vitest to resolve .js imports in ESM TypeScript files
    extensions: [".ts", ".js"],
  },
});
