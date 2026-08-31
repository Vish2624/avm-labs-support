// TODO: show the signed-in agent/admin identity, current location + service
// type context (via LocationSelector / ServiceTypeSelector), once auth and
// location data are wired up.
export function Topbar() {
  return (
    <header className="flex h-14 shrink-0 items-center border-b px-4">
      <span className="text-sm text-muted-foreground">AVM Labs Support Assistant</span>
    </header>
  );
}
