// Re-mounts on every navigation (unlike the layout), so each page — Quote,
// Packages, Updates, Admin — fades in as it opens, per the AVM Support design.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="h-full avm-fade-up [animation-duration:.45s]">{children}</div>;
}
