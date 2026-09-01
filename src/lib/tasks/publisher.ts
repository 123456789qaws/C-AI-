import 'server-only';

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from '@/lib/db';
import { TaskSchema, type Task } from '@/lib/checkpoint/schema';
import { HiddenTestsFileSchema } from '@/lib/checkpoint/evaluate';
import { aiProvider } from '@/lib/providers/ai';

const TASKS_DIR = path.join(process.cwd(), 'tasks');

/**
 * Validate and publish a task definition.
 * - Validates via TaskSchema
 * - Optionally AI-generates hidden tests (allowAIGenerateTests)
 * - Writes tasks/<id>.json
 * - Writes hidden_tests JSON artifacts if generated
 * - Upserts prisma.task (best-effort, never blocks on DB failure)
 */
export async function publishTask(raw: unknown): Promise<{ task: Task; aiGenerated: string[] }> {
  const task = TaskSchema.parse(raw);
  const aiGenerated: string[] = [];

  for (const cp of task.checkpoints) {
    const wantsAi = cp.allowAIGenerateTests === true;
    const hasTests = cp.tests ?? cp.testsPath;
    if (!wantsAi) continue;
    // AI generation is triggered even if tests exist? spec: "allowAIGenerateTests: if true call AI provider to generate tests"
    // We generate when tests file missing or when caller explicitly wants regeneration.
    // Decide: if hasTests and file exists locally, skip. Otherwise generate.
    const testsRef = hasTests ?? `hidden_tests/${task.id}_${cp.id}.json`;
    const absPath = path.resolve(process.cwd(), testsRef);
    let exists = false;
    try {
      await readFile(absPath, 'utf8');
      exists = true;
    } catch {
      exists = false;
    }
    if (exists && hasTests) continue;

    // Generate via AI
    const prompt = `为C语言任务生成隐藏测试JSON。任务：${task.title} (${task.intro ?? ''})；关卡：${cp.title} - ${cp.guide_question}；初始代码：${cp.initialCode ?? ''}。请输出JSON格式：{"tests":[{"input":"...","expected":"...","description":"用例性质描述"}]}，至少3组，覆盖边界与常规。只输出JSON，不要其他文本。`;
    let text: string;
    try {
      const res = await aiProvider.complete(prompt);
      text = res.text;
    } catch (err) {
      throw new Error(
        `AI生成测试失败（${cp.id}）：${err instanceof Error ? err.message : String(err)}`
      );
    }
    // Extract JSON
    let candidate = text.trim();
    const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) candidate = fenced[1].trim();
    const brace = candidate.match(/\{[\s\S]*\}/);
    if (brace?.[0]) candidate = brace[0];
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      throw new Error(`AI返回的测试不是合法JSON（${cp.id}）：${candidate.slice(0, 300)}`);
    }
    const validated = HiddenTestsFileSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`AI生成的测试格式非法（${cp.id}）：${validated.error.issues[0]?.message}`);
    }
    // Write hidden_tests file
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, JSON.stringify(validated.data, null, 2), 'utf8');
    aiGenerated.push(testsRef);
    // Align checkpoint tests fields to generated path
    cp.tests = testsRef;
    cp.testsPath = testsRef;
    // Also align gates that lack tests path: inject test_pass gates if needed?
    for (const g of cp.gates) {
      if (g.type === 'test_pass' && !g.tests) {
        g.tests = testsRef;
      }
    }
  }

  // Re-validate after possible mutation
  const finalTask = TaskSchema.parse({ ...task, checkpoints: task.checkpoints });

  // Write task JSON
  await mkdir(TASKS_DIR, { recursive: true });
  const taskPath = path.join(TASKS_DIR, `${finalTask.id}.json`);
  await writeFile(taskPath, JSON.stringify(finalTask, null, 2), 'utf8');

  // Upsert DB mirror (best-effort, don't block)
  try {
    await (prisma.task as unknown as { upsert: (args: unknown) => Promise<unknown> }).upsert({
      where: { id: finalTask.id },
      update: {
        title: finalTask.title,
        intro: finalTask.intro ?? null,
        checkpointMode: finalTask.checkpointMode,
        authorId: finalTask.authorId ?? null,
        checkpoints: finalTask.checkpoints as unknown as object,
        hiddenTests: {},
      },
      create: {
        id: finalTask.id,
        title: finalTask.title,
        intro: finalTask.intro ?? null,
        checkpointMode: finalTask.checkpointMode,
        authorId: finalTask.authorId ?? null,
        checkpoints: finalTask.checkpoints as unknown as object,
        hiddenTests: {},
      },
    });
  } catch (err) {
    console.error(
      '[publisher] prisma upsert skipped (DB unavailable):',
      err instanceof Error ? err.message : String(err)
    );
  }

  return { task: finalTask, aiGenerated };
}

/** List all tasks from disk (authoritative source) */
export async function listPublishedTasks(): Promise<Task[]> {
  const { listTasks } = await import('@/lib/checkpoint/loader');
  return listTasks();
}
