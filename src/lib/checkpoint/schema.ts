/**
 * Checkpoint Gate DSL — Zod schema for the task JSON files in /tasks.
 *
 * Canonical shape from 项目分析文档.md:8.1. The task JSON files are the single
 * source of truth ("tasks 真源"): the database `Task.checkpoints` column mirrors
 * them at seed time, and the frontend can only READ checkpoint state through
 * server routes — it can never modify the DSL.
 *
 * A checkpoint passes when the weighted sum of its gate scores reaches
 * `pass_threshold`. Gate types:
 *  - ai_socratic: LLM judges the answer against `rubric` (JSON {pass, confidence})
 *  - test_pass:   student's C code must pass the hidden tests in `tests`
 *
 * `on_fail` defines the follow-up teaching action for a failed checkpoint:
 *  - ai_followup: extra Socratic question appended to the AI tutor prompt
 *  - valgrind_hint: true when the task is memory-sensitive (crash context + leak
 *    clues get injected into the tutor conversation)
 *
 * v2 extend: checkpoint kinds AI链 (teacher-provided question chain) 与
 * 代码题(初始代码+测试样例+AI生成开关)，全部 optional 向后兼容。
 */
import { z } from 'zod';

/** Shared weight field: contribution of this gate to the checkpoint score. */
const weight = z.number().min(0).max(1);

export const SocraticGateSchema = z.object({
  type: z.literal('ai_socratic'),
  /** Rubric given to the LLM judge — what the answer must convey. */
  rubric: z.string().min(1),
  weight,
});

export const TestPassGateSchema = z.object({
  type: z.literal('test_pass'),
  /** Path (relative to repo root) of the hidden-tests JSON, e.g. hidden_tests/fib_2.json. */
  tests: z.string().min(1),
  weight,
});

/** Discriminated union: `type` decides which payload fields are legal. */
export const GateSchema = z.discriminatedUnion('type', [SocraticGateSchema, TestPassGateSchema]);

/** `unlock.editorRegion` = the [startLine, endLine] slice the student may edit. */
export const UnlockSchema = z
  .object({
    editorRegion: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    /** Optional starter hints surfaced with the checkpoint question. */
    hints: z.array(z.string().min(1)).optional(),
  })
  .refine((u) => u.editorRegion[1] >= u.editorRegion[0], {
    message: 'editorRegion 结束行必须 >= 起始行',
    path: ['editorRegion'],
  });

export const OnFailSchema = z.object({
  /** Extra Socratic follow-up question the tutor asks when this checkpoint fails. */
  ai_followup: z.string().min(1).optional(),
  /** Enable valgrind clue injection (memory tasks) when this checkpoint fails. */
  valgrind_hint: z.boolean().optional(),
});

const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const CheckpointSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** The question the student must answer / goal they must reach. */
  guide_question: z.string().min(1),
  gates: z.array(GateSchema).min(1),
  /** 0..1 — weighted gate score needed to pass this checkpoint. */
  pass_threshold: z.number().min(0).max(1),
  unlock: UnlockSchema,
  on_fail: OnFailSchema.optional(),
  // ---- v2 optional fields (backward compatible) ----
  /** Checkpoint kind: AI链 vs 代码题；缺省按 gates 推断 */
  kind: z.enum(['ai', 'code']).optional(),
  /** Checkpoint-level introduction / extended description */
  intro: z.preprocess(emptyToUndef, z.string().optional()),
  description: z.preprocess(emptyToUndef, z.string().optional()),
  /** AI链问题列表（teacher 提供） */
  aiChain: z.array(z.string().min(1)).optional(),
  /** 代码题初始代码片段 */
  initialCode: z.preprocess(emptyToUndef, z.string().optional()),
  /** 代码题测试文件路径（alias: tests） — 空串视作未提供 */
  testsPath: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  tests: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  /** 是否允许 AI 生成测试样例 */
  allowAIGenerateTests: z.boolean().optional(),
});

export const TaskSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9_-]+$/, 'task id 仅允许字母/数字/_/-'),
  title: z.string().min(1),
  description: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  intro: z.preprocess(emptyToUndef, z.string().optional()),
  checkpointMode: z.enum(['sequential', 'free']).default('sequential'),
  authorId: z.preprocess(emptyToUndef, z.string().min(1).optional()),
  checkpoints: z.array(CheckpointSchema).min(1),
});

// ---- Inferred types (single source: the schema) ----

export type SocraticGate = z.infer<typeof SocraticGateSchema>;
export type TestPassGate = z.infer<typeof TestPassGateSchema>;
export type Gate = z.infer<typeof GateSchema>;
export type Unlock = z.infer<typeof UnlockSchema>;
export type OnFail = z.infer<typeof OnFailSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type Task = z.infer<typeof TaskSchema>;
