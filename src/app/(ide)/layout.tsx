import FileTree from '@/components/editor/FileTree';

export default function IDELayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left sidebar - FileTree 240px */}
      <aside className="flex-shrink-0 w-60 border-r border-border bg-card">
        <FileTree />
      </aside>

      {/* Main editor area - Monaco placeholder 1fr */}
      <main className="flex-1 min-w-0 overflow-hidden bg-background">{children}</main>

      {/* Right sidebar - Luna AI 360px */}
      <aside className="flex-shrink-0 w-[360px] border-l border-border bg-card">
        <div className="flex h-full flex-col">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <h2 className="text-sm font-medium text-foreground">Luna AI</h2>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <p className="text-sm text-muted-foreground">Luna AI 面板 - 待实现</p>
          </div>
        </div>
      </aside>

      {/* Toaster placeholder for notifications */}
      <div id="toaster-placeholder" className="fixed bottom-4 right-4 z-50" aria-live="polite" />
    </div>
  );
}
