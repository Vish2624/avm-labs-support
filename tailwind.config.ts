import type { Config } from "tailwindcss";

/**
 * Tailwind v4 is CSS-first — theme tokens and plugins live in app/globals.css
 * (via @theme / @plugin), which is what actually drives the build. This file
 * is kept for tooling that expects a config file to exist (editor plugins,
 * IDE integrations) and as a place for future content-path overrides; it is
 * not required by the v4 PostCSS pipeline itself.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
};

export default config;
