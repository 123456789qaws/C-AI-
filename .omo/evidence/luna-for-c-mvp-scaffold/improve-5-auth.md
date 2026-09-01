# Improve 5: 前端认证基础设施

## Date: 2026-09-01

## Summary
Built the complete frontend auth infrastructure for Luna for C:
- AuthProvider (React context + useAuth hook) with localStorage 'luna-token', fetch /api/auth/me on mount, login/logout/refresh methods
- Login page (/login) with form posting to /api/auth/login, role-based redirect (STUDENT→/, TEACHER→/dashboard, ADMIN→/admin)
- AppNav top navigation bar with logo, role-based links, theme toggle, user info + role badge, logout button
- AuthGuard client-side route protection component with role checking
- Admin placeholder page (/admin) with AuthGuard wrapping
- Updated root layout with AuthProvider + AppNav, preserving ThemeProvider and existing structure
- Updated dashboard's getToken() to use 'luna-token' for consistency

## Files Created
- `src/components/auth/AuthProvider.tsx` — React context, useAuth hook, token in localStorage, /api/auth/me fetch
- `src/components/auth/AuthGuard.tsx` — Client-side route guard with role checking + redirect to /login
- `src/components/layout/AppNav.tsx` — Top nav bar with logo, role-based links, theme toggle, user info, logout
- `src/app/login/page.tsx` — Login form with Card/Input/Button, error display, role-based redirect
- `src/app/admin/page.tsx` — Admin placeholder page with AuthGuard(roles=['ADMIN'])

## Files Modified
- `src/app/layout.tsx` — Added AuthProvider wrapping + AppNav replacing inline header
- `src/app/(teacher)/dashboard/page.tsx` — Updated getToken() to use 'luna-token'

## Verification
- ✅ pnpm build — Compiled successfully, 22 static pages (was 20), all routes preserved
- ✅ pnpm lint — "No ESLint warnings or errors"
- ✅ Route table: /login (3.1 kB), /admin (2.22 kB), /dashboard (6.82 kB), / (13.6 kB)
- ✅ Middleware unchanged (26.9 kB) — API route protection unaffected

## Design Decisions
1. **localStorage key = 'luna-token'** — Consistent across AuthProvider and dashboard; explicit per spec
2. **AuthGuard as separate component** — Reusable wrapper; dashboard kept its own auth logic for backward compatibility (only storage key changed)
3. **AppNav hides on /login** — Clean login page without nav bar; no navigation distractions
4. **Safe defaults in useAuth** — During SSR/SSG, returns {user: null, loading: true} to prevent context errors
5. **Error handling in login** — Shows server error messages (e.g., "Invalid id or password") in destructive-colored alert
6. **Role badges** — Color-coded: blue=student, purple=teacher/TA, amber=admin; consistent with existing badge patterns in dashboard

## Gotchas
1. **Prettier formatting** — Multi-line JSX label elements and Button props need single-line formatting per .prettierrc
2. **useTheme unused import** — AppNav initially imported useTheme but only used ThemeToggle component (which internally uses useTheme)
3. **Dashboard dual auth** — Dashboard has its own auth logic (getToken + /api/auth/me fetch); only updated storage key, not refactored to use AuthProvider (too risky for this task scope)
