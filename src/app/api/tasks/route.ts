import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireTeacher, requireUser } from '@/lib/auth/require';
import { TaskSchema } from '@/lib/checkpoint/schema';
import { publishTask } from '@/lib/tasks/publisher';
import { listTasks } from '@/lib/checkpoint/loader';

/**
 * GET /api/tasks — list published tasks
 * - TEACHER/ADMIN: own authored + all (for now returns all; author filter optional)
 * - STUDENT: tasks assigned via TaskAssignment in student's classes + all public? spec: via assignment or all.
 * Auth required.
 */
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const tasks = await listTasks();

    // Enrich with TaskAssignment/DB metadata (intro, assignment status) — best effort
    // For teacher: no filter; for student: annotate assigned flag via enrollments
    let assignedTaskIds: Set<string> | null = null;
    if (user.role === 'STUDENT') {
      try {
        const enrollments = await prisma.classEnrollment.findMany({
          where: { studentId: user.id },
          select: { classId: true },
        });
        const classIds = enrollments.map((e) => e.classId);
        if (classIds.length > 0) {
          const assignments = await prisma.taskAssignment.findMany({
            where: { classId: { in: classIds } },
            select: { taskId: true },
          });
          assignedTaskIds = new Set(assignments.map((a) => a.taskId));
        } else {
          assignedTaskIds = new Set();
        }
      } catch {
        // DB unavailable: fall back to no assignment filtering
        assignedTaskIds = null;
      }
    }

    const payload = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      intro: t.intro ?? null,
      description: t.description ?? null,
      checkpointMode: t.checkpointMode,
      authorId: t.authorId ?? null,
      checkpoints: t.checkpoints,
      assigned: assignedTaskIds ? assignedTaskIds.has(t.id) : undefined,
    }));

    return NextResponse.json({ tasks: payload });
  } catch (err) {
    console.error('[tasks GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/tasks — TEACHER/ADMIN creates {id,title,intro,checkpointMode, checkpoints:[...]}
 * Body validated via TaskSchema, then publisher writes to tasks/*.json + prisma.
 * If allowAIGenerateTests per checkpoint, AI生成测试无误验证 (schema + file write).
 */
const postBodySchema = TaskSchema;

function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || `task-${Date.now()}`;
}

function normalizeTaskBody(
  raw: Record<string, unknown>,
  authorId: string
): Record<string, unknown> {
  // id: auto-generate from title if missing/invalid
  if (typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw.id.trim())) {
    const title = typeof raw.title === 'string' ? raw.title : '';
    raw.id = slugify(title || `task-${Date.now()}`);
  } else {
    raw.id = raw.id.trim();
  }
  // intro/description empty -> undefined (schema preprocess also handles, but normalize here)
  for (const k of ['intro', 'description'] as const) {
    if (typeof raw[k] === 'string' && (raw[k] as string).trim() === '') delete raw[k];
  }
  // authorId default
  if (typeof raw.authorId !== 'string' || (raw.authorId as string).trim() === '') {
    raw.authorId = authorId;
  }
  // checkpointMode default
  if (raw.checkpointMode !== 'sequential' && raw.checkpointMode !== 'free') {
    raw.checkpointMode = 'sequential';
  }
  // checkpoints normalization
  if (Array.isArray(raw.checkpoints)) {
    const taskId = raw.id as string;
    raw.checkpoints = (raw.checkpoints as Record<string, unknown>[]).map((cp, idx) => {
      const out: Record<string, unknown> = { ...cp };
      // empty intro/description/initialCode -> delete
      for (const k of ['intro', 'description', 'initialCode'] as const) {
        if (typeof out[k] === 'string' && (out[k] as string).trim() === '') delete out[k];
      }
      // tests / testsPath empty -> delete, keep alias sync
      const testsRaw = typeof out.tests === 'string' ? (out.tests as string).trim() : '';
      const testsPathRaw =
        typeof out.testsPath === 'string' ? (out.testsPath as string).trim() : '';
      // raw JSON array content like '[{"input":...}]' should be kept as tests for publisher to materialize
      const isJsonArray = (s: string) => s.startsWith('[') || s.startsWith('{');
      if (testsRaw === '' && testsPathRaw === '') {
        delete out.tests;
        delete out.testsPath;
      } else if (testsRaw !== '' && testsPathRaw === '') {
        // if tests is JSON content, keep it as tests and let publisher write file; don't delete
        out.tests = testsRaw;
        // testsPath alias will be set by publisher after file write
      } else if (testsRaw === '' && testsPathRaw !== '') {
        out.testsPath = testsPathRaw;
        out.tests = testsPathRaw;
      } else {
        // both present, keep both trimmed
        out.tests = testsRaw;
        out.testsPath = testsPathRaw;
      }
      // allowAIGenerateTests: ensure boolean
      if (typeof out.allowAIGenerateTests !== 'boolean') {
        // accept allowAIGenerate alias
        const alt = (out as Record<string, unknown>).allowAIGenerate;
        if (typeof alt === 'boolean') out.allowAIGenerateTests = alt;
        else delete out.allowAIGenerateTests;
      }
      // gates: ensure test_pass gates have tests path; fallback to hidden_tests/<taskId>_<cpId>.json
      if (Array.isArray(out.gates)) {
        const cpId = typeof out.id === 'string' && out.id.trim() ? out.id.trim() : `cp${idx + 1}`;
        const fallback = `hidden_tests/${taskId}_${cpId}.json`;
        // detect if checkpoint wants AI generation and has no real path
        const wantsAi = out.allowAIGenerateTests === true;
        const hasRealPath =
          (typeof out.tests === 'string' &&
            out.tests.trim() !== '' &&
            !isJsonArray(out.tests.trim())) ||
          (typeof out.testsPath === 'string' &&
            out.testsPath.trim() !== '' &&
            !isJsonArray(out.testsPath.trim()));
        out.gates = (out.gates as Record<string, unknown>[]).map((g) => {
          if (g.type === 'test_pass') {
            const t = typeof g.tests === 'string' ? (g.tests as string).trim() : '';
            if (t === '' || t === '[]') {
              // use fallback or checkpoint tests path
              const resolved =
                hasRealPath &&
                typeof out.tests === 'string' &&
                !isJsonArray((out.tests as string).trim())
                  ? (out.tests as string).trim()
                  : fallback;
              return { ...g, tests: resolved };
            }
            // JSON array string is not a path — replace with fallback and keep raw in checkpoint
            if (isJsonArray(t)) {
              return { ...g, tests: hasRealPath ? (out.tests as string) : fallback };
            }
          }
          return g;
        });
        // if no fallback path set on checkpoint but wantsAi or gate needs file, ensure tests/testsPath present
        if (!hasRealPath && wantsAi) {
          // publisher will generate; set placeholder so schema passes
          const ph = fallback;
          out.tests = ph;
          out.testsPath = ph;
          // ensure gates point to same
          out.gates = (out.gates as Record<string, unknown>[]).map((g) =>
            g.type === 'test_pass' &&
            (typeof g.tests !== 'string' ||
              (g.tests as string).trim() === '' ||
              (g.tests as string).trim() === '[]')
              ? { ...g, tests: ph }
              : g
          );
        }
        // if tests is raw JSON array, gate already set to fallback; keep raw for publisher materialization
        // publisher will detect JSON and write file, then fix gate
        if (typeof out.tests === 'string' && isJsonArray((out.tests as string).trim())) {
          // keep gate as fallback, keep checkpoint.tests as raw JSON for publisher
          const rawJson = out.tests as string;
          // ensure gate points to fallback
          out.gates = (out.gates as Record<string, unknown>[]).map((g) =>
            g.type === 'test_pass' && isJsonArray((g.tests as string) ?? '')
              ? { ...g, tests: fallback }
              : g
          );
          // store raw JSON in a temp field for publisher
          (out as Record<string, unknown>)._rawTestsJson = rawJson;
          out.tests = fallback;
          out.testsPath = fallback;
        }
      }
      // pass_threshold / unlock already expected; ensure unlock exists
      if (!out.unlock || typeof out.unlock !== 'object') {
        out.unlock = { editorRegion: [0, 50] };
      }
      if (!out.pass_threshold) out.pass_threshold = 1.0;
      return out;
    });
  }
  return raw;
}

export async function POST(req: NextRequest) {
  const user = requireTeacher(req);
  if (!user)
    return NextResponse.json({ error: 'Forbidden: TEACHER or ADMIN required' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Auto-stamp authorId if missing + normalize missing fields before zod
  if (body && typeof body === 'object' && body !== null) {
    body = normalizeTaskBody(body as Record<string, unknown>, user.id);
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid task',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      },
      { status: 400 }
    );
  }

  // Validate referenced hidden_tests exist when not AI-generated (warn but not fatal: evaluate will escalate)
  // Main flow: publish via publisher (includes AI generation)
  try {
    const { task, aiGenerated } = await publishTask(parsed.data);
    return NextResponse.json({ task, aiGenerated }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Zod already handled; remaining errors are AI gen or FS/DB
    if (msg.includes('AI生成') || msg.includes('不是合法JSON') || msg.includes('格式非法')) {
      return NextResponse.json({ error: 'AI generation failed', message: msg }, { status: 422 });
    }
    console.error('[tasks POST] publish error:', err);
    return NextResponse.json({ error: 'Failed to publish task', message: msg }, { status: 500 });
  }
}
