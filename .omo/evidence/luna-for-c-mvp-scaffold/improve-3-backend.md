# Evidence: Improve 3 - Backend API Extension (Classes, Enrollments, Assignments, Admin Import, Permissions)

## Task Summary
Extended backend APIs for class management, student enrollment, task assignment, admin bulk import, and reworked permissions (teacher perspective from login role, removed body.studentId anonymous fallback).

## Files Created/Modified

### New Files
1. `src/lib/auth/require.ts` — Server-side auth helpers
2. `src/app/api/classes/route.ts` — Class CRUD (teacher create/list)
3. `src/app/api/classes/join/route.ts` — Student join class via code
4. `src/app/api/classes/[id]/enrollments/route.ts` — Teacher view class students
5. `src/app/api/assignments/route.ts` — Teacher assign/list tasks
6. `src/app/api/assignments/student/route.ts` — Student view assigned tasks
7. `src/app/api/admin/import/route.ts` — Admin bulk import users

### Modified Files
1. `src/middleware.ts` — Expanded matcher, removed anonymous fallback
2. `src/app/api/checkpoint/verify/route.ts` — Removed body.studentId fallback

## Build Verification

```bash
pnpm build
```

**Result: ✅ Compiled successfully**
- 20 static pages
- 17 API routes (6 new routes registered)
- Middleware: 26.9 kB

Route table includes:
- ƒ /api/admin/import
- ƒ /api/assignments
- ƒ /api/assignments/student
- ƒ /api/classes
- ƒ /api/classes/[id]/enrollments
- ƒ /api/classes/join

## Lint Verification

```bash
pnpm lint
```

**Result: ✅ No ESLint warnings or errors**

## Key Functional Verification

### Middleware Changes
- Matcher now includes: `/api/checkpoint/:path*`, `/api/logs/:path*`, `/api/admin/:path*`, `/dashboard/:path*`
- Removed anonymous demo channel for `POST /api/checkpoint/verify`
- All protected paths require valid Bearer token at Edge

### Checkpoint Verify Route
- Request schema no longer includes `studentId` field
- `resolveStudentId(req)` now only accepts Bearer token
- Returns 401 if no/invalid token (no body fallback)

### Auth Helpers (require.ts)
- `requireUser(req)` → `{id, role} | null`
- `requireRole(req, roles[])` → payload if authorized, null otherwise
- Convenience: `requireTeacher`, `requireAdmin`, `requireStudent`
- All new routes use these helpers for consistent 401/403 semantics

### Class Management
- `GET /api/classes` — Teacher sees own classes, ADMIN sees all
- `POST /api/classes` — Teacher creates class with auto-generated unique 6-char code
- `POST /api/classes/join` — Student joins via code, upserts ClassEnrollment
- `GET /api/classes/[id]/enrollments` — Teacher views students (must own class or be ADMIN)

### Task Assignment
- `POST /api/assignments` — Teacher assigns task with optional deadline (ISO string)
- `GET /api/assignments` — Teacher lists own assignments (classId filter optional)
- `GET /api/assignments/student` — Student views assigned tasks from enrolled classes

### Admin Import
- `POST /api/admin/import` — ADMIN bulk imports users with bcrypt password hashing
- Returns success/failed counts + error details

## Prisma Client Regeneration

```bash
pnpm exec prisma generate
```

**Result: ✅ Generated Prisma Client (v5.22.0)**
- New models: Class, ClassEnrollment, TaskAssignment
- Role enum includes ADMIN

## Git Status

```bash
git status
```

Shows all new and modified files staged for commit.

## Next Steps
1. Commit changes with descriptive message
2. When PostgreSQL available: run migrations + seed
3. Frontend integration for new APIs
4. E2E tests for new endpoints