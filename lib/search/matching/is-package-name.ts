/**
 * The catalog keeps profiles (Lipid Profile, Hair Health Profile A 57) and
 * packages (Hair Fall Package 2021, Premium Wellness Package) in the same
 * `profiles` table; only the name tells them apart. Packages are left out
 * of the Workspace search and the Support Assistant's recommendations (the
 * Packages page still lists them all). Plain module — safe on client and server.
 */
export function isPackageName(name: string): boolean {
  return /\bpackages?\b/i.test(name);
}
