'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { ChevronRight, File, Folder, Lock } from 'lucide-react';

interface FileTreeItem {
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeItem[];
  locked?: boolean;
  path: string;
}

const mockFileTree: FileTreeItem[] = [
  {
    name: 'main.c',
    type: 'file',
    locked: true,
    path: 'main.c',
  },
  {
    name: 'tasks',
    type: 'folder',
    path: 'tasks',
    children: [
      { name: 'fib_L1.c', type: 'file', locked: false, path: 'tasks/fib_L1.c' },
      { name: 'fib_L2.c', type: 'file', locked: true, path: 'tasks/fib_L2.c' },
      { name: 'sum_L1.c', type: 'file', locked: false, path: 'tasks/sum_L1.c' },
    ],
  },
  {
    name: 'include',
    type: 'folder',
    path: 'include',
    children: [
      { name: 'common.h', type: 'file', locked: true, path: 'include/common.h' },
      { name: 'utils.h', type: 'file', locked: false, path: 'include/utils.h' },
    ],
  },
  {
    name: 'README.md',
    type: 'file',
    locked: false,
    path: 'README.md',
  },
];

function FileTreeNode({
  item,
  onSelect,
  selectedPath,
}: {
  item: FileTreeItem;
  onSelect: (path: string) => void;
  selectedPath: string | null;
}) {
  const [isOpen, setIsOpen] = useState(item.type === 'folder');
  const isSelected = selectedPath === item.path;

  if (item.type === 'file') {
    return (
      <button
        onClick={() => onSelect(item.path)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors ${
          isSelected
            ? 'bg-primary text-primary-foreground'
            : 'text-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
        title={item.path}
      >
        {item.locked && (
          <Lock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" aria-label="Locked" />
        )}
        <File className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{item.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors ${
          isSelected
            ? 'bg-primary text-primary-foreground'
            : 'text-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
        title={item.path}
      >
        {isOpen ? (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 rotate-90" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        )}
        <Folder className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate font-medium">{item.name}</span>
      </button>
      {isOpen && item.children && (
        <div className="pl-6 space-y-1 mt-1 border-l border-border/50">
          {item.children.map((child) => (
            <FileTreeNode
              key={child.path}
              item={child}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree() {
  const [selectedPath, setSelectedPath] = useState<string | null>('main.c');

  return (
    <Card className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Folder className="w-4 h-4" />
          文件树
        </h3>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {mockFileTree.map((item) => (
          <FileTreeNode
            key={item.path}
            item={item}
            onSelect={setSelectedPath}
            selectedPath={selectedPath}
          />
        ))}
      </div>
      <div className="p-4 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">占位符 - 待实现真实文件操作</p>
      </div>
    </Card>
  );
}
