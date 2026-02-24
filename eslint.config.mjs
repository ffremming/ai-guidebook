import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  /**
   * Project-wide TypeScript rules.
   *
   * Allow function parameters prefixed with `_` to be unused — a common
   * pattern for callback signatures and placeholder stubs.
   */
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  /**
   * Compliance module import boundary rule.
   *
   * The src/lib/compliance/ directory must have ZERO coupling to the HTTP
   * framework or the UI layer. Any import from `next`, `next/*`, `react`,
   * `react/*`, or `react-dom` inside this directory is a lint error.
   *
   * See architectural document section 7 (Compliance Engine Design).
   */
  {
    files: ["src/lib/compliance/**/*.ts", "src/lib/compliance/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*"],
              message:
                "The compliance module must not import from Next.js. Keep it framework-agnostic.",
            },
            {
              group: ["react", "react/*", "react-dom", "react-dom/*"],
              message:
                "The compliance module must not import from React. Keep it framework-agnostic.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
