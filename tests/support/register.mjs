// Lets `node --test` run the TypeScript sources directly (Node strips the
// types itself): resolves the project's "@/..." alias and extensionless
// relative imports to their .ts/.tsx files. Used by `npm test` only.
import { register } from "node:module";

register("./resolve-hooks.mjs", import.meta.url);
