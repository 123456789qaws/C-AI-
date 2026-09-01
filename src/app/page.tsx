'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Root page — redirect to /login (unauthenticated) or /classes (authenticated).
 * The (ide) route group still holds the CheckpointWorkspace at /ide for task work.
 */
export default function RootPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else {
      router.replace('/classes');
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">加载中...</p>
    </div>
  );
}
