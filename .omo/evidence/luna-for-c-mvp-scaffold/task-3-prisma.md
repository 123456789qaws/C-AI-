# Task 3: Prisma 5 + Postgres 16 Schema & Migrations

## Date: 2026-08-29

## Summary
Successfully set up Prisma 5.22.0 with PostgreSQL adapter for the Luna-for-C MVP project. Created schema with 4 core models, generated Prisma Client with driver adapter support, and created migration files.

## Dependencies Added
```bash
pnpm add prisma@5.22.0 @prisma/client@5.22.0 @prisma/adapter-pg@5.22.0 pg
pnpm add -D @types/pg@8.23.1
```

## Files Created/Modified

### 1. prisma/schema.prisma
- **Datasource**: PostgreSQL with `env("DATABASE_URL")`
- **Generator**: Prisma Client with `previewFeatures = ["driverAdapters"]`
- **Models**:
  - `User` (id, role, name)
  - `Task` (id, title, checkpoints Json, hiddenTests Json)
  - `AiInteractionLog` (id, studentId, taskId, checkpointId, ts, role, promptText, aiReply, codeBefore, codeAfter, codeDiff, gateResult, gateType, model, tokens, confidence, sessionId) with index on [studentId, taskId, ts]
  - `CheckpointProgress` (studentId, taskId, checkpointId, passed, attempts, unlockedAt) with composite primary key

### 2. prisma/migrations/20260829180100_init/migration.sql
Generated migration SQL with:
- Role enum (STUDENT, TEACHER, TA)
- User table with primary key on id
- Task table with primary key on id
- AiInteractionLog table with primary key on id and index on [studentId, taskId, ts]
- CheckpointProgress table with composite primary key on [studentId, taskId, checkpointId]

### 3. prisma/migrations/migration_lock.toml
Provider lock file for PostgreSQL

### 4. prisma/seed.ts
Placeholder seed file for future data seeding

### 5. src/lib/db.ts
Global singleton Prisma Client with PostgreSQL driver adapter:
```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

## Commands Run & Output

### Prisma Generate
```bash
$ pnpm exec prisma generate
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
✔ Generated Prisma Client (v5.22.0) to .\node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client in 39ms
```

### Migration Diff (Schema to SQL)
```bash
$ pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'TA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "checkpoints" JSONB NOT NULL,
    "hiddenTests" JSONB NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInteractionLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL,
    "promptText" TEXT,
    "aiReply" TEXT,
    "codeBefore" TEXT,
    "codeAfter" TEXT,
    "codeDiff" TEXT,
    "gateResult" TEXT NOT NULL,
    "gateType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens" INTEGER,
    "confidence" DOUBLE PRECISION,
    "sessionId" TEXT NOT NULL,
    CONSTRAINT "AiInteractionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckpointProgress" (
    "studentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "unlockedAt" TIMESTAMP(3),
    CONSTRAINT "CheckpointProgress_pkey" PRIMARY KEY ("studentId","taskId","checkpointId")
);

-- CreateIndex
CREATE INDEX "AiInteractionLog_studentId_taskId_ts_idx" ON "AiInteractionLog"("studentId", "taskId", "ts");
```

### Migration Dev (Failed - No Database)
```bash
$ pnpm exec prisma migrate dev --name init
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "luna_c", schema "public" at "localhost:5432"
Error: P1001: Can't reach database server at `localhost:5432`
Please make sure your database server is running at `localhost:5432`.
```
**Note**: Migration apply requires a running PostgreSQL 16 instance. The migration files are ready and will apply successfully when the database is available.

### Build Verification
```bash
$ pnpm build
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (5/5)
✓ Finalizing page optimization
```

### Lint Verification
```bash
$ pnpm lint
✔ No ESLint warnings or errors
```

## Verification Checklist
- ✅ `pnpm add prisma @prisma/client @prisma/adapter-pg pg` - Dependencies installed
- ✅ `pnpm add -D @types/pg` - Type definitions installed
- ✅ `prisma/schema.prisma` - Schema with 4 models created
- ✅ `prisma/migrations/*` - Migration files created (20260829180100_init)
- ✅ `src/lib/db.ts` - Global singleton with Pg adapter created
- ✅ `pnpm exec prisma generate` - Client generated successfully with driverAdapters preview feature
- ✅ `pnpm build` - Build passes with no type errors
- ✅ `pnpm lint` - Lint passes with no errors
- ⚠️ `pnpm exec prisma migrate dev --name init` - Requires running PostgreSQL (migration files ready)

## Next Steps
1. Start PostgreSQL 16 (via Docker Compose or local installation)
2. Run `pnpm exec prisma migrate dev --name init` to apply migrations
3. Verify database connection with `prisma.$queryRaw`SELECT 1``
4. Add seed data via `prisma/seed.ts` when needed

## Notes
- The `@prisma/adapter-pg` driver adapter requires the `driverAdapters` preview feature in the generator
- Global singleton pattern prevents multiple Prisma Client instances in development (hot reload)
- Connection pool is created once and reused via `pg.Pool`
- Migration files are version-controlled and ready for deployment