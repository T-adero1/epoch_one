import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// ✅ ULTRA-MINIMAL: Only syntax errors and critical issues
const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      // Only keep absolutely critical errors
      "no-undef": "error",
      "no-unreachable": "error",
      "no-unexpected-multiline": "error",
      "@typescript-eslint/no-unused-vars": "error", 
      
      // Turn off everything else
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/exhaustive-deps": "off", 
      "react/no-unescaped-entities": "off",
      "no-console": "off",
      "@next/next/no-img-element": "off",
    }
  }
];

export default eslintConfig;
