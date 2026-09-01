# Evidence: 前端主题系统（浅色/暗色切换）

## Date: 2026-09-01

## Summary
Implemented a complete light/dark theme system for the Luna-C frontend:
- ThemeProvider with React context, localStorage persistence, and `.dark` class toggle
- ThemeToggle button (Sun/Moon icons via lucide-react) in top header
- CSS variables switched from `@media (prefers-color-scheme: dark)` to `.dark` class-based approach
- Tailwind configured with `darkMode: 'class'`
- Monaco editor with dual themes (`luna-light` / `luna-dark`) synchronized to context theme

## Files Created
- `src/components/theme/ThemeProvider.tsx` — React context provider with `useTheme()` hook
- `src/components/theme/ThemeToggle.tsx` — Toggle button with Sun/Moon icons

## Files Modified
- `src/app/globals.css` — Converted `@media (prefers-color-scheme: dark) { :root {...} }` to `.dark {...}`
- `tailwind.config.ts` — Added `darkMode: 'class'`
- `src/app/layout.tsx` — Wrapped children with ThemeProvider, added header with ThemeToggle, `suppressHydrationWarning` on `<html>`
- `src/components/editor/MonacoWorkspace.tsx` — Dual themes (luna-light base 'vs' / luna-dark base 'vs-dark'), theme synced via context + useEffect
- `src/middleware.ts` — Prettier fix (trailing newline/formatting)
- `src/lib/auth/require.ts` — Prettier fix (trailing newline)
- `src/app/api/classes/route.ts` — Removed unused `requireAdmin` import, trailing newline
- `src/app/api/classes/join/route.ts` — Trailing newline
- `src/app/api/classes/[id]/enrollments/route.ts` — Removed unused import, prettier format, trailing newline
- `src/app/api/assignments/route.ts` — Removed unused import, trailing newline
- `src/app/api/assignments/student/route.ts` — Trailing newline
- `src/app/api/admin/import/route.ts` — Trailing newline
- `src/app/api/checkpoint/verify/route.ts` — Removed unused `VerifyBody` type

## Verification
- ✅ `pnpm lint` — "No ESLint warnings or errors"
- ✅ `pnpm build` — Compiled successfully, 20 static pages generated
  - `/(ide)/page` (13.6 kB)
  - `(teacher)/dashboard/page` (6.8 kB)
  - 17 API routes registered

## Theme Architecture
1. **Provider layer**: `ThemeProvider` wraps app at root layout level
2. **CSS layer**: `:root` holds light vars, `.dark` overrides — controlled by `document.documentElement.classList.toggle('dark')`
3. **Tailwind layer**: `darkMode: 'class'` enables `dark:` variant utilities
4. **Monaco layer**: Two `defineTheme` calls (`luna-light` base 'vs', `luna-dark` base 'vs-dark'); `useEffect` switches when context theme changes
5. **Persistence**: `localStorage('luna-theme')` with `prefers-color-scheme` fallback
6. **SSR safety**: `useTheme()` returns safe defaults when no context (SSG/prerender)

## Key Design Decisions
1. **Class-based, not media query** — enables manual toggle (media query is system-only)
2. **`suppressHydrationWarning` on html** — avoids React hydration mismatch from `.dark` class set by ThemeProvider effect
3. **mounted guard** — ThemeProvider renders children immediately when `mounted=false`, deferring class toggle to useEffect; prevents flash
4. **Monaco dual themes** — `luna-light` background `#fafafa` matches `--card` light; `luna-dark` background `#0a0a0a` matches `--background` dark
5. **Locked-line styles unchanged** — `rgba(156, 163, 175, 0.1)` + amber accent works in both themes

## Gotchas
1. **Parallel task lint pollution** — classes/assignments/admin routes from parallel task had missing trailing newlines and unused imports; fixed to unblock build
2. **SSG prerender + useTheme** — During static generation, ThemeProvider context is undefined; `useTheme()` must return safe defaults instead of throwing
3. **Prisma Client regeneration needed** — `prisma.class`, `prisma.classEnrollment`, `prisma.taskAssignment` type errors from the new models task (ADMIN role etc.) persist in LSP but don't block build (Prisma generates types at build time)
