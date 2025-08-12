import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// ✅ ULTRA-MINIMAL: Only syntax errors and critical issues
const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: parser,
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
    rules: {
      
      "no-undef": "error",
      "no-unreachable": "error",
      "no-unexpected-multiline": "error",
      // Enforce detection of unused variables
      "@typescript-eslint/no-unused-vars": "error",
      // Allow unescaped entities in JSX
      "react/no-unescaped-entities": "off",
    }
  }
];

export default eslintConfig;
