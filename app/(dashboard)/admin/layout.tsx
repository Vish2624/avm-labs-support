// TODO: require an authenticated admin session (lib/auth) once Phase 2 auth
// is implemented — this must never rely on hiding the Admin nav link alone.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="p-6">{children}</div>;
}
