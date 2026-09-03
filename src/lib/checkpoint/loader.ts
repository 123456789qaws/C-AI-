/**
 * Task checkpoint loader — reads the Gate DSL JSON files in /tasks.
 *
 * The task files are the single source of truth ("tasks 真源"). This module is
 * server-only: the client can never import it, and it only READS the JSON —
 * nothing in the app can modify task definitions at runtime.
 */
import 'server-only';

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { TaskSchema, type Task } from './schema';

/** Absolute path of the tasks directory (project root/tasks). */
const TASKS_DIR = path.join(process.cwd(), 'tasks');

/** Guard against path traversal: task ids are plain file names. */
const TASK_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Load one task by id from tasks/<id>.json.
 *
 * @throws Error when the id is malformed (path traversal), the file is missing,
 *   or the JSON fails `TaskSchema.parse` (invalid Gate DSL).
 */
export async function loadTask(taskId: string): Promise<Task> {
  if (!TASK_ID_RE.test(taskId)) {
    throw new Error(`非法 taskId: ${taskId}（仅允许字母/数字/_/-）`);
  }
  const filePath = path.join(TASKS_DIR, `${taskId}.json`);
  const raw = await readFile(filePath, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`tasks/${taskId}.json 不是合法 JSON`);
  }
  return TaskSchema.parse(data);
}

/** Load every task definition in /tasks (sorted by id for determinism). */
export async function listTasks(): Promise<Task[]> {
  const entries = await readdir(TASKS_DIR);
  const ids = entries
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
  // One corrupt file must never hide all other tasks: skip failures individually.
  const settled = await Promise.allSettled(ids.map((id) => loadTask(id)));
  const tasks: Task[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      tasks.push(r.value);
    } else {
      console.error(
        `[loader] skip invalid task file tasks/${ids[i]}.json:`,
        (r as PromiseRejectedResult).reason instanceof Error
          ? ((r as PromiseRejectedResult).reason as Error).message
          : String((r as PromiseRejectedResult).reason)
      );
    }
  }
  return tasks;
}
