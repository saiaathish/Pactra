import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      ".vercel/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "worker/**",
      "scripts/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      // Destructuring `{ _id, ownerFirebaseUid, ...rest }` to strip fields
      // from API responses is intentional.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
];

export default config;
