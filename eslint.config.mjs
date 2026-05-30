import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react_plugin from "eslint-plugin-react";
import globals from "globals";

const naming_convention_rules = [
  { selector: "default", format: ["snake_case"], leadingUnderscore: "allow" },
  {
    selector: "variable",
    format: ["snake_case", "UPPER_CASE", "PascalCase"],
    leadingUnderscore: "allow",
  },
  {
    selector: "function",
    format: ["snake_case", "PascalCase"],
    leadingUnderscore: "allow",
  },
  { selector: "parameter", format: ["snake_case"], leadingUnderscore: "allow" },
  {
    selector: "import",
    format: ["snake_case", "PascalCase", "camelCase", "UPPER_CASE"],
  },
  {
    selector: "memberLike",
    modifiers: ["private"],
    format: ["snake_case"],
    leadingUnderscore: "allow",
  },
  { selector: "typeLike", format: ["PascalCase"] },
  { selector: "enumMember", format: ["UPPER_CASE", "PascalCase"] },
  { selector: "objectLiteralProperty", format: null },
  { selector: "typeProperty", format: null },
  { selector: "method", format: ["snake_case"] },
  { selector: "objectLiteralMethod", format: ["camelCase", "snake_case"] },
  {
    selector: "classProperty",
    modifiers: ["static", "readonly"],
    format: ["UPPER_CASE", "snake_case"],
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/build/**",
      "**/.turbo/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,cts,mts}"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "@typescript-eslint/naming-convention": [
        "error",
        ...naming_convention_rules,
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["packages/ui/**/*.{ts,tsx,js,jsx}"],
    plugins: { react: react_plugin },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react_plugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "**/__tests__/**/*", "**/__fixtures__/**/*"],
    rules: {
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.config.{js,cjs}"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    files: ["**/*.config.{mjs,ts}"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
);
