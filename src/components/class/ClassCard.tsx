'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/* ============================================================
 * Types
 * ============================================================ */

export interface ClassData {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  teacher?: { id: string; name: string } | null;
  _count?: { enrollments: number; assignments: number };
  createdAt?: string;
}

/* ============================================================
 * ClassCard — displays a single class with code + metadata
 * ============================================================ */

interface ClassCardProps {
  cls: ClassData;
  /** Action buttons rendered in the footer */
  actions?: React.ReactNode;
  /** Called when the card itself is clicked */
  onClick?: () => void;
}

export function ClassCard({ cls, actions, onClick }: ClassCardProps) {
  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(cls.code);
  };

  return (
    <Card
      className={`transition-colors ${onClick ? 'cursor-pointer hover:bg-muted/50' : ''}`}
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{cls.name}</CardTitle>
          {actions}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">邀请码</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyCode();
              }}
              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors"
              title="点击复制"
            >
              {cls.code}
              <svg
                className="size-3 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
          {cls.teacher && (
            <div className="text-xs text-muted-foreground">
              教师: {cls.teacher.name} ({cls.teacher.id})
            </div>
          )}
          {cls._count && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{cls._count.enrollments} 名学生</span>
              <span>{cls._count.assignments} 个任务</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
