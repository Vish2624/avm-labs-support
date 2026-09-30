/** A profile's test list, as a package is built from it. */
export interface PackageRoster {
  id: string;
  code: string;
  name: string;
  testIds: string[];
}

/**
 * The profiles a package fully contains, biggest first and never
 * overlapping — how a package's flat test list reads as "Liver Profile +
 * Kidney Function Test + 2 tests". A package is stored as its tests only,
 * so this is worked out, not saved. Plain module — safe on client and server.
 */
export function includedProfiles(testIds: string[], profiles: PackageRoster[]): PackageRoster[] {
  const inPackage = new Set(testIds);
  const taken = new Set<string>();
  const result: PackageRoster[] = [];
  for (const profile of [...profiles].sort((a, b) => b.testIds.length - a.testIds.length)) {
    if (profile.testIds.length === 0) continue;
    if (profile.testIds.every((id) => inPackage.has(id) && !taken.has(id))) {
      result.push(profile);
      for (const id of profile.testIds) taken.add(id);
    }
  }
  return result;
}
