'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, type AuthUser } from '@/components/auth/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/* ============================================================
 * AuthGuard — client-side route protection
 *
 * Usage:
 *   <AuthGuard>
 *     <AdminPage />
 *   </AuthGuard>
 *
 *   <AuthGuard roles={['TEACHER', 'TA']}>
 *     <DashboardPage />
 *   </AuthGuard>
 * ============================================================ */

interface AuthGuardProps {
  children: React.ReactNode;
  /** If provided, only these roles are allowed. Others see "无权限". */
  roles?: AuthUser['role'][];
}

export function AuthGuard({ children, roles }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  // Not authenticated — redirecting
  if (!user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">请先登录</p>
      </div>
    );
  }

  // Wrong role
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>无权限</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">当前账号 ({user.role}) 无权访问此页面。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
