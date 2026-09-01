'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import ThemeToggle from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ============================================================
 * Role-based navigation links
 * ============================================================ */

interface NavLink {
  href: string;
  label: string;
}

const STUDENT_LINKS: NavLink[] = [{ href: '/classes', label: '我的班级' }];

const TEACHER_LINKS: NavLink[] = [
  { href: '/classes', label: '班级管理' },
  { href: '/dashboard', label: '教师看板' },
];

const ADMIN_LINKS: NavLink[] = [
  { href: '/classes', label: '班级管理' },
  { href: '/admin', label: '账号导入' },
];

function linksForRole(role: string): NavLink[] {
  switch (role) {
    case 'STUDENT':
      return STUDENT_LINKS;
    case 'TEACHER':
    case 'TA':
      return TEACHER_LINKS;
    case 'ADMIN':
      return ADMIN_LINKS;
    default:
      return [];
  }
}

/* ============================================================
 * Role badge
 * ============================================================ */

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'STUDENT':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'TEACHER':
    case 'TA':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    case 'ADMIN':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

function roleLabel(role: string): string {
  switch (role) {
    case 'STUDENT':
      return '学生';
    case 'TEACHER':
      return '教师';
    case 'TA':
      return '助教';
    case 'ADMIN':
      return '管理员';
    default:
      return role;
  }
}

/* ============================================================
 * AppNav Component
 * ============================================================ */

export default function AppNav() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();

  // Don't show nav on login page
  if (pathname === '/login') return null;

  const links = user ? linksForRole(user.role) : [];

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
      {/* Left: Logo + nav links */}
      <div className="flex items-center gap-4">
        <Link href="/" className="text-sm font-semibold text-foreground tracking-tight">
          Luna-C
        </Link>

        {/* Loading skeleton */}
        {loading && (
          <div className="flex items-center gap-3">
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
          </div>
        )}

        {/* Authenticated nav links */}
        {!loading && links.length > 0 && (
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              // For /classes, match both /classes and /classes/*
              const isActive =
                pathname === link.href ||
                (link.href === '/classes' && pathname.startsWith('/classes'));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* Right: User info + theme toggle */}
      <div className="flex items-center gap-2">
        {user && (
          <>
            {/* User name + role badge */}
            <span className="text-sm text-foreground">{user.name}</span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                roleBadgeClass(user.role)
              )}
            >
              {roleLabel(user.role)}
            </span>

            {/* Logout button */}
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="退出登录">
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        )}

        {!loading && !user && (
          <Link href="/login">
            <Button variant="ghost" size="sm">
              登录
            </Button>
          </Link>
        )}

        <ThemeToggle />
      </div>
    </header>
  );
}
