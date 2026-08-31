// Profile Search — search by profile name or by one-or-more test names,
// ranked by match count. Built in Phase 5. See components/profiles/*.
export default function ProfilesPage() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Profile Search</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Search profiles by name or by the tests they contain, ranked by match.
      </p>
    </main>
  );
}
