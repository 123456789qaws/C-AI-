'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/* ============================================================
 * Types
 * ============================================================ */

interface ImportUser {
  id: string;
  name: string;
  role: 'STUDENT' | 'TEACHER' | 'TA' | 'ADMIN';
  password: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors?: Array<{ id: string; error: string }>;
}

/* ============================================================
 * ImportForm — admin bulk import accounts (JSON or CSV)
 * ============================================================ */

interface ImportFormProps {
  onImport: (users: ImportUser[]) => Promise<ImportResult>;
}

export function ImportForm({ onImport }: ImportFormProps) {
  const [input, setInput] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseInput = useCallback((): ImportUser[] | null => {
    setParseError(null);
    const raw = input.trim();
    if (!raw) {
      setParseError('请输入数据');
      return null;
    }

    try {
      if (format === 'json') {
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) {
          setParseError('JSON 格式需要是数组 [...]');
          return null;
        }
        return data as ImportUser[];
      }
      // CSV: id,name,role,password per line
      const lines = raw.split('\n').filter((l) => l.trim());
      const users: ImportUser[] = [];
      for (const line of lines) {
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length < 4) {
          setParseError(`CSV 行格式错误 (需要 id,name,role,password): ${line}`);
          return null;
        }
        const [id, name, role, password] = parts;
        if (!['STUDENT', 'TEACHER', 'TA', 'ADMIN'].includes(role)) {
          setParseError(`无效角色 "${role}"，需要 STUDENT/TEACHER/TA/ADMIN`);
          return null;
        }
        users.push({ id, name, role: role as ImportUser['role'], password });
      }
      return users.length > 0 ? users : null;
    } catch {
      setParseError(format === 'json' ? 'JSON 解析失败' : 'CSV 解析失败');
      return null;
    }
  }, [input, format]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const users = parseInput();
    if (!users) return;

    setLoading(true);
    try {
      const res = await onImport(users);
      setResult(res);
    } catch {
      setResult({ success: 0, failed: 0, errors: [{ id: '-', error: '导入请求失败' }] });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        setInput(text);
        // Auto-detect format
        if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
          setFormat('csv');
        } else {
          setFormat('json');
        }
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">批量导入账号</CardTitle>
        <CardDescription>支持 JSON 或 CSV 格式，每行一个用户</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Format toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormat('json')}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                format === 'json'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              JSON
            </button>
            <button
              type="button"
              onClick={() => setFormat('csv')}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                format === 'csv'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              CSV
            </button>
          </div>

          {/* Format hint */}
          <p className="text-xs text-muted-foreground">
            {format === 'json' ? (
              <>
                格式:{' '}
                <code className="rounded bg-muted px-1">
                  [{'{'}id, name, role, password{'}'}]
                </code>
              </>
            ) : (
              <>
                格式: <code className="rounded bg-muted px-1">id,name,role,password</code>{' '}
                (每行一个)
              </>
            )}
          </p>

          {/* Textarea / drop zone */}
          <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                format === 'json'
                  ? '[\n  {"id":"s0010","name":"张三","role":"STUDENT","password":"123456"}\n]'
                  : 's0010,张三,STUDENT,123456\ns0011,李四,STUDENT,123456'
              }
              className="min-h-[120px] w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              rows={5}
            />
          </div>

          {/* File upload */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg
                className="size-4 mr-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              上传文件
            </Button>
            <span className="text-xs text-muted-foreground">或拖拽文件到文本框</span>
          </div>

          {/* Error */}
          {parseError && <p className="text-xs text-destructive">{parseError}</p>}

          {/* Submit */}
          <Button type="submit" disabled={loading || !input.trim()} size="sm">
            {loading ? '导入中...' : '导入'}
          </Button>
        </form>

        {/* Result */}
        {result && (
          <div className="mt-4 rounded-lg border border-border p-3 space-y-2">
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 dark:text-green-400">成功: {result.success}</span>
              {result.failed > 0 && <span className="text-destructive">失败: {result.failed}</span>}
            </div>
            {result.errors && result.errors.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-1">
                {result.errors.map((err) => (
                  <div key={err.id}>
                    <span className="font-mono">{err.id}</span>: {err.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
