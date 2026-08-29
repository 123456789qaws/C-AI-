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