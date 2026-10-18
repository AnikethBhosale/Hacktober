import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.Config[]} */
export default [
    {
        files: ["**/*.ts", "**/*.tsx"],
        plugins: {
            "@typescript-eslint": tsPlugin,
            "@next/next": nextPlugin,
        },
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: "./tsconfig.json",
            },
        },
        rules: {
            ...tsPlugin.configs["recommended"].rules,
            ...nextPlugin.configs["core-web-vitals"].rules,
            // Allow explicit any in agent output records (typed by Zod at runtime)
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
    {
        ignores: [".next/**", "node_modules/**", "next-env.d.ts", "tests/**"],
    },
];
