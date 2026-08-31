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

      {/* Main editor area - CheckpointWorkspace (editor + Luna panel inside) */}
      <main className="flex-1 min-w-0 overflow-hidden bg-background">{children}</main>
    </div>
  );
}
