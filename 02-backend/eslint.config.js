import tseslint from "typescript-eslint";
export default [
  {
    files: ["02-backend/**/*.{ts}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // tes règles
    },
  },
];