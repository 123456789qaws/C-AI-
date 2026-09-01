# Evidence: Data Model Extension (Role.ADMIN + Class + ClassEnrollment + TaskAssignment)

## Task Summary
Extended the Prisma data model with:
- Role enum: added ADMIN value
- Class model: id, name, code (unique), teacherId, createdAt, relations
- ClassEnrollment model: id, classId, studentId, joinedAt, unique constraint
- TaskAssignment model: id, taskId, classId, teacherId, deadline, assignedAt, relations
- User model: added reverse relations (classesTaught, enrollments, assignments)
- Task model: added reverse relation (assignments)

## Verification Results

### 1. Prisma Generate
```bash
$ pnpm prisma generate
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma

✔ Generated Prisma Client (v5.22.0) to .\node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client in 53ms
```
✅ **PASS** - Prisma Client generated successfully with new models and ADMIN enum

### 2. Build (Type-check)
```bash
$ pnpm build
  ▲ Next.js 14.2.35
  - Environments: .env

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/15) ...
   Generating static pages (3/15) 
   Generating static pages (7/15) 
   Generating static pages (11/15) 
 ✓ Generating static pages (15/15)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    13.2 kB         113 kB
├ ○ /_not-found                          871 B          88.2 kB
├ ƒ /api/ai/socratic                     0 B                0 B
├ ƒ /api/auth/login                      0 B                0 B
├ ƒ /api/auth/logout                     0 B                0 B
├ ƒ /api/auth/me                         0 B                0 B
├ ƒ /api/checkpoint/override             0 B                0 B
├ ƒ /api/checkpoint/verify               0 B                0 B
├ ○ /api/health                          0 B                0 B
├ ƒ /api/judge/run                       0 B                0 B
├ ƒ /api/logs                            0 B                0 B
└ ○ /dashboard                           6.8 kB          106 kB
+ First Load JS shared by all            87.3 kB
```
✅ **PASS** - Build compiled successfully, type-check passed, 15 routes generated

### 3. Migration SQL Generated
```bash
$ pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```
✅ **PASS** - Migration SQL generated and saved to `prisma/migrations/20260901000000_add_classes_assignments/migration.sql`

### 4. Schema Verification
Key schema elements verified in `prisma/schema.prisma`:

```prisma
enum Role {
  STUDENT
  TEACHER
  TA
  ADMIN          // ✅ Added
}

model User {
  id             String   @id
  role           Role
  name           String
  passwordHash   String?  @db.Text
  classesTaught  Class[]  @relation("ClassTeacher")  // ✅ Added
  enrollments    ClassEnrollment[]                   // ✅ Added
  assignments    TaskAssignment[]                    // ✅ Added
}

model Class {
  id           String   @id @default(cuid())
  name         String
  code         String   @unique
  teacherId    String
  createdAt    DateTime @default(now())
  teacher      User     @relation("ClassTeacher", fields: [teacherId], references: [id], onDelete: Cascade)
  enrollments  ClassEnrollment[]
  assignments  TaskAssignment[]
}

model ClassEnrollment {
  id        String   @id @default(cuid())
  classId   String
  studentId String
  joinedAt  DateTime @default(now())
  class     Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  student   User     @relation(fields: [studentId], references: [id], onDelete: Cascade)

  @@unique([classId, studentId])
}

model TaskAssignment {
  id          String   @id @default(cuid())
  taskId      String
  classId     String
  teacherId   String
  deadline    DateTime?
  assignedAt  DateTime @default(now())
  class       Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  task        Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  teacher     User     @relation(fields: [teacherId], references: [id], onDelete: Cascade)

  @@index([classId])
  @@index([taskId])
}
```

### 5. Seed Data Verification
`prisma/seed.ts` updated with:
- ✅ ADMIN user: `a0001` (password: 123456)
- ✅ Sample class: `class-demo` (code: `CLS001`, teacher: `t0001`)
- ✅ ClassEnrollment: `s0001`, `s0002`, `s0003` enrolled in `class-demo`
- ✅ TaskAssignment: `fib_L2` → `class-demo` (teacher: `t0001`, deadline: 7 days from now)

## Files Modified
| File | Status |
|------|--------|
| `prisma/schema.prisma` | ✅ Modified |
| `prisma/migrations/20260901000000_add_classes_assignments/migration.sql` | ✅ Created |
| `prisma/seed.ts` | ✅ Modified |

## Notes
- PostgreSQL not available locally → used `prisma migrate diff --from-empty --to-schema-datamodel --script` for offline migration generation
- Pre-existing prettier issue in `src/lib/checkpoint/schema.ts` was fixed during build verification (unrelated to this task)
- All LSP errors in seed.ts resolved after `pnpm prisma generate`