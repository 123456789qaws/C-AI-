-- AlterTable: add bcrypt password hash column for local auth
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
