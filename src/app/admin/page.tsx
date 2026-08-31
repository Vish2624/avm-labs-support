export default function AdminPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-muted-foreground text-sm max-w-md">
          Login (Phase 2), then Excel import pipeline (Phase 6) and catalog/profile/alias
          management (Phase 7) land here.
        </p>
      </div>
    </main>
  );
}
