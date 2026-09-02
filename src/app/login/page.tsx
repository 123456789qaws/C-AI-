'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/* ============================================================
 * Helpers
 * ============================================================ */

/** Sanitize the ?next= param — only allow same-origin relative paths. */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/classes';
}

/* ============================================================
 * Login Page
 * ============================================================ */

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const { login, user, loading } = useAuth();

  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /* If already logged in, redirect immediately (replace so login isn't in history) */
  if (!loading && user) {
    router.replace(next);
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(id, password);
      // replace, not push, so back-button never returns to a stale login page
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center bg-white px-4">
      <Card className="w-full max-w-sm overflow-hidden">
        <CardHeader>
          <CardTitle>Luna for C</CardTitle>
          <CardDescription>AI辅助C语言教学平台 · 请登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* ID field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-id" className="text-sm font-medium text-black">
                账号
              </label>
              <input
                id="login-id"
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="例如 s0001 / t0001"
                required
                autoComplete="username"
                className="h-9 rounded-none border border-[#dddddd] bg-white px-3 text-sm text-black placeholder:text-[#666666] outline-none transition-colors focus:border-black focus:ring-2 focus:ring-black/30"
              />
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-password" className="text-sm font-medium text-black">
                密码
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                required
                autoComplete="current-password"
                className="h-9 rounded-none border border-[#dddddd] bg-white px-3 text-sm text-black placeholder:text-[#666666] outline-none transition-colors focus:border-black focus:ring-2 focus:ring-black/30"
              />
            </div>

            {/* Error message */}
            {error && (
              <div role="alert" className="rounded-none bg-black/10 px-3 py-2 text-sm text-black">
                {error}
              </div>
            )}

            {/* Submit */}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? '登录中...' : '登录'}
            </Button>

            {/* Hint */}
            <p className="text-center text-xs text-[#999999]">
              学生 s0001–s0005 / 教师 t0001–t0002 / 管理员 a0001 · 密码 123456
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
