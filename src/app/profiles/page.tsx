export default function ProfilesPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Profile Search</h1>
        <p className="text-muted-foreground text-sm max-w-md">
          Search profiles by name or by the tests they contain, ranked by match count.
          Built in Phase 5.
        </p>
      </div>
    </main>
  );
}
