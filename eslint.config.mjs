import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Lead engine boundary: core logic must not depend on CRM UI, so it can be
  // extracted into a standalone service later (OUTREACH_PLAN.md §1)
  {
    files: ["src/lib/outreach/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "next", "next/*"], message: "Lead engine core is framework-free." },
            { group: ["@/components/*", "@/app/*", "@/lib/queries/*", "@/lib/supabase/*"], message: "Lead engine core must not import CRM code; go through src/lib/outreach/adapters/." },
          ],
        },
      ],
    },
  },
  // Adapters are the one place the engine reads and writes the CRM database
  {
    files: ["src/lib/outreach/adapters/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "next", "next/*"], message: "Lead engine adapters are framework-free." },
            { group: ["@/components/*", "@/app/*", "@/lib/queries/*"], message: "Adapters talk to the database, not CRM UI code." },
          ],
        },
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
]);

export default eslintConfig;
