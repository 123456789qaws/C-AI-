'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/* ============================================================
 * Role -> landing page mapping
 * ============================================================ */

function landingForRole(role: string): string {
  switch (role) {
    case 'STUDENT':
      return '/';
    case 'TEACHER':
    case 'TA':
      return '/dashboard';
    case 'ADMIN':
      return '/admin';
    default:
      return '/';
  }
}

/* ============================================================
 * Login Page
 * ============================================================ */

export default function LoginPage() {
  const router = useRouter();
  const { login, user, loading } = useAuth();

  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /* If already logged in, redirect immediately */
  if (!loading && user) {
    router.replace(landingForRole(user.role));
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const loggedIn = await login(id, password);
      router.push(landingForRole(loggedIn.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Luna for C</CardTitle>
          <CardDescription>AI辅助C语言教学平台 · 请登录</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* ID field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-id" className="text-sm font-medium text-foreground">
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
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-password" className="text-sm font-medium text-foreground">
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
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Submit */}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? '登录中...' : '登录'}
            </Button>

            {/* Hint */}
            <p className="text-center text-xs text-muted-foreground">
              学生 s0001–s0005 / 教师 t0001–t0002 / 管理员 a0001 · 密码 123456
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
