/** Code prefix that marks a package (e.g. PKG-ANEMIA-A), so its name can read like the brochure's ("Anemia Profile - A"). */
export const PACKAGE_CODE_PREFIX = "PKG-";

/**
 * The catalog keeps profiles (Liver Profile, Lipid Profile) and packages
 * (Anemia Profile - A, Vitamins Package) in the same `profiles` table. A
 * package is one coded `PKG-…`, or — for older rows — named "… Package".
 * Plain module — safe on client and server.
 */
export function isPackage(item: { name: string; code?: string | null }): boolean {
  return (item.code?.trim().toUpperCase().startsWith(PACKAGE_CODE_PREFIX) ?? false) || /\bpackages?\b/i.test(item.name);
}
