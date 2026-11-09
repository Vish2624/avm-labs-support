import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

/** The .ts file an extensionless path means, if there is one. */
function withExtension(file) {
  if (existsSync(file) && path.extname(file)) return file;
  return EXTENSIONS.map((ext) => file + ext).find((candidate) => existsSync(candidate));
}

export async function resolve(specifier, context, nextResolve) {
  // "server-only" throws outside a React Server Component build; the pure
  // modules under test never need it.
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };

  let file = null;
  if (specifier.startsWith("@/")) file = path.join(root, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    file = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  const found = file && withExtension(file);
  if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
