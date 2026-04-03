import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import noCommentsRule from "./eslint-rules/no-comments.mjs";

export default [
  js.configs.recommended,
  {
    ignores: ["dist-tsc/**", "dist/**", "node_modules/**", "e2e_*.js"]
  },
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      parser: tsParser,
      globals: {
        process: "readonly",
        __dirname: "readonly",
        require: "readonly",
        exports: "readonly",
        module: "readonly",
        document: "readonly",
        window: "readonly",
        NodeJS: "readonly",
        alert: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        HTMLElement: "readonly",
        HTMLTemplateElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLButtonElement: "readonly",
        KeyboardEvent: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "local": {
        rules: {
          "no-comments": noCommentsRule
        }
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-empty": "off",
      "no-unused-vars": "off",
      "local/no-comments": "error"
    }
  }
];
