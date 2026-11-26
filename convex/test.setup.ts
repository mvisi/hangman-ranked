/// <reference types="vite/client" />
// Modules convex-test loads to execute functions in tests.
export const modules = import.meta.glob([
  "./**/*.{ts,js}",
  "!./**/*.d.ts",
  "!./**/*.test.ts",
  "!./test.*.ts",
]);
