# Improve-6: Student IDE Beautify + Auth-Driven View

## Date: 2026-09-01

## Summary
Rewrote CheckpointWorkspace.tsx to remove demo/teacher-toggle patterns and implement auth-driven role-based views with UI beautification.

## Changes

### CheckpointWorkspace.tsx (full rewrite)

**Removed:**
- `DEMO_STUDENT_ID` constant — replaced by JWT Bearer token from `useAuth()`
- `isTeacherView` state + checkbox toggle — replaced by `user.role` from `useAuth()`
- Hardcoded `studentId` in verify request body — backend now uses Bearer identity

**Added:**
- `useAuth()` import: `const { user, token } = useAuth()`
- Role derivation: `const isTeacher = user?.role === 'TEACHER' || user?.role === 'ADMIN' || user?.role === 'TA'`
- Teacher role hint in welcome message
- Escalated state tracking (`hasEscalated`) with amber banner
- Bearer token in `handleVerify` Authorization header
- 401 handling in verify response
- Teacher-locked UI: verify/submit buttons disabled for teachers, hint text shown

**Beautification:**
- Cards: `rounded-xl shadow-sm` for consistent elevation
- Overflow containment: `overflow-hidden` on Card and CardContent
- Guide question: `<div>` with `max-h-24 overflow-y-auto break-words` instead of `<textarea>`
- Checkpoint cards: `max-w-[120px] truncate` for title overflow
- Escalated banner: amber-tinted card with AlertTriangle icon
- Toast: `rounded-xl` matching card radius
- Monaco border: matching card border style
- Light/dark compatibility via Tailwind var colors (no hardcoded hex)

**Auth integration:**
- `fetch('/api/checkpoint/verify', { headers: { Authorization: \`Bearer ${token}\` } })`
- No `studentId` in body (backend resolves from JWT)
- 401 → push toast + assistant message

**Role-based behavior:**
- Teacher: `lockedRegions` only has `HEADER_LOCKED_REGION` (all checkpoint regions unlocked)
- Teacher: verify button shows "教师无需验证", submit shows "教师视角下验证/提交由管理后台处理"
- Student: normal checkpoint flow with locked regions

## Verification
- `pnpm build` → ✅ Compiled successfully, 23 static pages
- `pnpm exec eslint src/components/ide/CheckpointWorkspace.tsx` → ✅ 0 errors
- `pnpm lint` → ✅ 0 errors in CheckpointWorkspace.tsx (other pre-existing files fixed too)

## Side fixes (pre-existing)
- `src/components/class/ClassCard.tsx` — removed unused `Button` import
- `src/app/classes/page.tsx` — removed unused `activeAssignments` variable
- `src/app/(teacher)/dashboard/page.tsx` — added eslint-disable for scaffolded state/handlers
- Ran prettier on `src/app/classes/**/*.tsx` and `src/components/class/**/*.tsx`
