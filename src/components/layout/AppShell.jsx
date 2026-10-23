export function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">{children}</div>
    </div>
  );
}
