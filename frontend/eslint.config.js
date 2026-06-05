// Flat ESLint config for the React + TypeScript frontend.
// Code-quality rules only — formatting is delegated to Prettier (eslint-config-prettier
// switches off every rule that would fight the formatter), so the two never conflict.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Never lint build output, coverage reports or vendored deps.
  { ignores: ["dist", "coverage", "node_modules"] },

  // Application + test sources.
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // The two classic, industry-standard hook rules. We deliberately do NOT
      // enable plugin v7's experimental React-Compiler rules (purity/refs/
      // immutability): they flag working, tested patterns and would force
      // refactors of stable code for no correctness gain.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Vite fast-refresh works best when a module exports only components;
      // a constant export (e.g. a small helper) is allowed.
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Turn off stylistic rules that Prettier owns. Must come last.
  prettier,
);
