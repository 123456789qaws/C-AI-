-- Add Task intro / checkpointMode / authorId (improve-v2 datamodel)
-- Generated via: pnpm exec prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script
-- DB不可用，手工落盘；apply: pnpm prisma migrate deploy

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "checkpointMode" VARCHAR(20) NOT NULL DEFAULT 'sequential',
ADD COLUMN     "intro" TEXT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

