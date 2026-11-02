import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "migrations/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "as", objectLiteralTypeAssertions: "never" }],
      "no-restricted-syntax": ["error", { selector: "TSEnumDeclaration", message: "Use a const object + derived type instead of enum." }],
      "no-restricted-properties": ["error", { object: "process", property: "env", message: "Read env vars only in env.ts." }],
    },
  },
  // Config boundary files and standalone entry points may read process.env.
  { files: ["**/env.ts", "tests/**", "**/*.config.ts", "src/database/run-migrations.ts", "src/worker/main.ts", "vitest.config.ts", "eslint.config.js"], rules: { "no-restricted-properties": "off" } },
  { files: ["tests/**"], rules: { "@typescript-eslint/no-non-null-assertion": "off", "@typescript-eslint/explicit-module-boundary-types": "off" } },
);
