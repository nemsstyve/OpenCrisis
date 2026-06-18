import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";

export default [
  {
    files: ["01-frontend/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      // tes règles
    },
  },
];