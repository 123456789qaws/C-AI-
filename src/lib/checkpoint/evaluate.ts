import 'server-only';

/**
 * Checkpoint 判题引擎 —— 三级漏斗的后两级（regex 初筛之外的 AI 复核与真实判题）。
 *
 * evaluateCheckpoint(checkpoint, {code, studentAnswer}) 逐 gate 求值：
 *  - regex:      rule 对「学生回答 OR 代码」做 RegExp 测试（任一命中即过）
 *  - ai_socratic: 直接调用 AIProvider 按 rubric 判题，返回 {pass, confidence, reply}；
 *                 confidence < AI_CONFIDENCE_ESCALATE → escalated（不计入得分，转人工）
 *  - test_pass:  读隐藏测试 JSON → runHiddenTests 真编译真运行，全部 AC 才过；
 *                期望值绝不外泄（harness 保证，本层只转述「性质描述」hint）
 *
 * 权重求和：score = Σ(通过 gate 的 weight) / Σ(全部 weight)，passed = score >= pass_threshold。
 * escalated：任一 ai_socratic 置信度过低 / provider 故障 / 规则或测试资源异常 → true。
 *
 * 依赖注入：options.ai / options.judge 可注入假 provider（测试用），默认走单例工厂。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { SocraticSystemPrompt } from '@/lib/ai/prompt';
import { enforceSocraticHardRule, sanitizePrompt } from '@/lib/ai/guard';
import { aiProvider } from '@/lib/providers/ai';
import type { AIProvider } from '@/lib/providers/ai/types';
import { getJudgeProvider } from '@/lib/providers/judge';
import type { JudgeProvider } from '@/lib/providers/judge/types';
import { runHiddenTests, type HiddenTestCase } from '@/lib/judge/harness';

import type { Checkpoint, Gate } from './schema';

/** ai_socratic 置信度低于该阈值 → escalated（不自动过关，转教师复核） */
export const AI_CONFIDENCE_ESCALATE = 0.7;

/** 隐藏测试文件格式：{ tests: [{ input|stdin, expected, description? }] } */
export const HiddenTestsFileSchema = z.object({
  tests: z.array(
    z.object({
      input: z.string().optional(),
      stdin: z.string().optional(),
      expected: z.string(),
      description: z.string().optional(),
    })
  ),
});

export type HiddenTestsFile = z.infer<typeof HiddenTestsFileSchema>;

/** 隐藏测试 JSON → harness 用例（input/stdin 归一为 stdin，绝不外传 expected） */
function toHiddenCases(file: HiddenTestsFile): HiddenTestCase[] {
  return file.tests.map((t) => ({
    stdin: t.stdin ?? t.input ?? '',
    expected: t.expected,
    description: t.description,
  }));
}

/** 读取并校验隐藏测试文件（相对仓库根）。文件缺失/非法时抛错。 */
export async function loadHiddenTests(relativePath: string): Promise<HiddenTestCase[]> {
  const filePath = path.resolve(process.cwd(), relativePath);
  const raw = await readFile(filePath, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`隐藏测试 ${relativePath} 不是合法 JSON`);
  }
  const parsed = HiddenTestsFileSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(
      `隐藏测试 ${relativePath} 格式非法：${parsed.error.issues[0]?.message ?? 'unknown'}`
    );
  }
  return toHiddenCases(parsed.data);
}

export interface EvaluateInput {
  /** 学生代码（test_pass 必需；regex 也会匹配它） */
  code: string;
  /** 学生文字回答（regex / ai_socratic 的判题对象） */
  studentAnswer: string;
}

export interface EvaluateOptions {
  /** 注入假 AI provider（测试）；默认单例 aiProvider */
  ai?: AIProvider;
  /** 注入假 judge provider（测试）；默认 getJudgeProvider() */
  judge?: JudgeProvider;
}

export interface GateEvaluation {
  type: Gate['type'];
  weight: number;
  /** 有效通过：escalated 的 ai gate 即使 pass 也不计分 */
  passed: boolean;
  reason: string;
  escalated: boolean;
  /** ai_socratic：模型返回的置信度 */
  confidence?: number;
  /** ai_socratic：苏格拉底式回复（已经过 >5 行硬规则兜底） */
  reply?: string;
  /** ai_socratic：实际发给模型的判题提示词（落 AiInteractionLog.promptText） */
  promptText?: string;
  /** 消耗的 token（ai_socratic） */
  tokens?: number;
  /** 使用的模型/provider 名（落 AiInteractionLog.model） */
  model?: string;
  /** 非致命错误码（rate_limited / ai_provider_error / hidden_tests_unavailable ...） */
  error?: string;
  /** test_pass 失败时的性质提示（绝不包含 expected） */
  hint?: string;
}

export interface EvaluateResult {
  passed: boolean;
  /** Σ通过 weight / Σ全部 weight，0..1 */
  score: number;
  perGate: GateEvaluation[];
  escalated: boolean;
  /** 隐藏测试失败的性质提示（首个失败用例） */
  testHint?: string;
}

/** 从模型文本稳健解析 {pass, confidence, reply, reason}，失败时降级为不通过 */
function parseJudgeResult(
  text: string,
  fallbackReason: string
): { pass: boolean; confidence: number; reply: string; reason: string } {
  const candidates: string[] = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const firstBrace = text.match(/\{[\s\S]*\}/);
  if (firstBrace?.[0]) candidates.push(firstBrace[0]);

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        if (
          typeof obj.pass === 'boolean' &&
          typeof obj.reply === 'string' &&
          obj.reply.length > 0
        ) {
          const confidence =
            typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
              ? Math.min(1, Math.max(0, obj.confidence))
              : 0.5;
          const reason = typeof obj.reason === 'string' ? obj.reason : fallbackReason;
          return { pass: obj.pass, confidence, reply: obj.reply, reason };
        }
      }
    } catch {
      // 尝试下一个候选
    }
  }

  return {
    pass: false,
    confidence: 0,
    reply: text.trim().slice(0, 2000) || '（模型未返回有效内容）',
    reason: fallbackReason,
  };
}

const MAX_AI_ANSWER_LEN = 4000;
const MAX_AI_CODE_LEN = 20000;

/** 组装单 gate 判题提示词：rubric + 学生回答（注入过滤）+ 学生代码（只截断不过滤） */
function buildGateJudgePrompt(
  checkpoint: Checkpoint,
  rubric: string,
  studentAnswer: string,
  code: string
): string {
  const parts: string[] = [
    '【关卡判题】请根据评判标准判定学生回答是否已达成过关目标，并按硬规则输出 JSON。',
    `关卡：${checkpoint.title}`,
    `引导问题：${checkpoint.guide_question}`,
    `评判标准（rubric）：${rubric}`,
  ];
  const codeTrim = code.trim();
  if (codeTrim.length > 0) {
    parts.push(`学生当前代码：\n\`\`\`c\n${codeTrim.slice(0, MAX_AI_CODE_LEN)}\n\`\`\``);
  }
  parts.push(`学生回答：${sanitizePrompt(studentAnswer).trim().slice(0, MAX_AI_ANSWER_LEN)}`);
  return parts.join('\n\n');
}

/** 单个 gate 求值（私有：evaluateCheckpoint 串行调用） */
async function evaluateGate(
  checkpoint: Checkpoint,
  gate: Gate,
  code: string,
  studentAnswer: string,
  options?: EvaluateOptions
): Promise<GateEvaluation> {
  switch (gate.type) {
    case 'regex': {
      let ruleRe: RegExp;
      try {
        ruleRe = new RegExp(gate.rule);
      } catch {
        return {
          type: 'regex',
          weight: gate.weight,
          passed: false,
          reason: `正则规则非法，无法判定：${gate.rule}`,
          escalated: true,
          error: 'invalid_regex_rule',
        };
      }
      // 任务 DSL 约定 rule 匹配回答文本；同时对代码匹配，二者任一命中即过
      const matched = ruleRe.test(studentAnswer) || ruleRe.test(code);
      return {
        type: 'regex',
        weight: gate.weight,
        passed: matched,
        reason: matched ? '正则初筛命中' : '正则初筛未命中',
        escalated: false,
        promptText: `规则: ${gate.rule}\n学生回答: ${studentAnswer.slice(0, 2000)}`,
        model: 'regex-engine',
      };
    }

    case 'ai_socratic': {
      const provider = options?.ai ?? aiProvider;
      const answerTrim = studentAnswer.trim();
      if (!answerTrim) {
        return {
          type: 'ai_socratic',
          weight: gate.weight,
          passed: false,
          reason: '缺少学生回答，无法进行 AI 复核',
          escalated: true,
          error: 'studentAnswer_required',
          model: provider.name,
        };
      }

      const prompt = buildGateJudgePrompt(checkpoint, gate.rubric, answerTrim, code);
      let completion: { text: string; usage: { tokens: number } };
      try {
        completion = await provider.complete(prompt, { system: SocraticSystemPrompt });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          type: 'ai_socratic',
          weight: gate.weight,
          passed: false,
          reason: 'AI 复核服务不可用，本次判定转教师复核',
          escalated: true,
          error: 'ai_provider_error',
          promptText: prompt,
          model: provider.name,
          reply: `（AI 服务异常：${detail.slice(0, 200)}）`,
        };
      }

      const judge = parseJudgeResult(completion.text, 'provider output was not valid judge JSON');
      const reply = enforceSocraticHardRule(judge.reply);
      const lowConfidence = judge.confidence < AI_CONFIDENCE_ESCALATE;

      return {
        type: 'ai_socratic',
        weight: gate.weight,
        // 低置信度不自动过关：即使模型判 pass，也转人工复核（三级漏斗）
        passed: judge.pass && !lowConfidence,
        reason: lowConfidence
          ? `${judge.reason}（置信度 ${judge.confidence.toFixed(2)} 低于 ${AI_CONFIDENCE_ESCALATE}，转教师复核）`
          : judge.reason,
        escalated: lowConfidence,
        confidence: judge.confidence,
        reply,
        promptText: prompt,
        tokens: completion.usage.tokens,
        model: provider.name,
      };
    }

    case 'test_pass': {
      const judgeProvider = options?.judge ?? getJudgeProvider();
      if (!code.trim()) {
        return {
          type: 'test_pass',
          weight: gate.weight,
          passed: false,
          reason: '缺少代码，无法运行隐藏测试',
          escalated: true,
          error: 'code_required',
          model: judgeProvider.name,
        };
      }

      let cases: HiddenTestCase[];
      try {
        cases = await loadHiddenTests(gate.tests);
      } catch (err) {
        return {
          type: 'test_pass',
          weight: gate.weight,
          passed: false,
          reason: `隐藏测试不可用：${err instanceof Error ? err.message : String(err)}`,
          escalated: true,
          error: 'hidden_tests_unavailable',
          model: judgeProvider.name,
        };
      }

      try {
        const report = await runHiddenTests(code, cases, { provider: judgeProvider });
        if (report.allPassed) {
          return {
            type: 'test_pass',
            weight: gate.weight,
            passed: true,
            reason: `隐藏测试全部通过（${report.results.length} 组）`,
            escalated: false,
            promptText: `隐藏测试: ${gate.tests}`,
            model: judgeProvider.name,
          };
        }
        const hint = report.firstFailure?.hint ?? '输出与期望不符';
        return {
          type: 'test_pass',
          weight: gate.weight,
          passed: false,
          reason: `隐藏测试未通过：${hint}`,
          escalated: false,
          promptText: `隐藏测试: ${gate.tests}`,
          model: judgeProvider.name,
          hint,
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          type: 'test_pass',
          weight: gate.weight,
          passed: false,
          reason: '判题器运行失败，本次判定转教师复核',
          escalated: true,
          error: 'judge_provider_error',
          promptText: `隐藏测试: ${gate.tests}`,
          model: judgeProvider.name,
          reply: `（判题器异常：${detail.slice(0, 200)}）`,
        };
      }
    }
  }
}

/**
 * 逐 gate 求值并按权重求和判定 checkpoint 是否通过。
 *
 * score = Σ(通过 gate 的 weight) / Σ(全部 weight)；passed = score >= pass_threshold。
 * escalated = 任一 gate escalated（AI 低置信度 / provider 故障 / 资源异常）。
 */
export async function evaluateCheckpoint(
  checkpoint: Checkpoint,
  input: EvaluateInput,
  options?: EvaluateOptions
): Promise<EvaluateResult> {
  const code = input.code ?? '';
  const studentAnswer = input.studentAnswer ?? '';

  const perGate: GateEvaluation[] = [];
  let passedWeight = 0;
  let totalWeight = 0;
  let escalated = false;
  let testHint: string | undefined;

  for (const gate of checkpoint.gates) {
    totalWeight += gate.weight;
    const result = await evaluateGate(checkpoint, gate, code, studentAnswer, options);
    perGate.push(result);
    if (result.passed) passedWeight += gate.weight;
    if (result.escalated) escalated = true;
    if (result.hint && !testHint) testHint = result.hint;
  }

  const score = totalWeight > 0 ? passedWeight / totalWeight : 0;
  const passed = score >= checkpoint.pass_threshold;

  return { passed, score, perGate, escalated, ...(testHint !== undefined ? { testHint } : {}) };
}
