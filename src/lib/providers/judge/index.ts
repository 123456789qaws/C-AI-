import 'server-only';

import { env } from '@/lib/env';

import type { JudgeProvider, JudgeResult } from './types';

/**
 * Stub provider used until todo 9 implements the real runners.
 * It answers CE for every submission so the /api/judge/run contract works
 * end-to-end before actual docker/local execution exists.
 */
const stubJudgeProvider: JudgeProvider = {
  name: 'judge-stub',
  async run(): Promise<JudgeResult> {
    return {
      status: 'CE',
      stdout: '',
      stderr: 'judge-lite runners not yet implemented (todo 9)',
      timeMs: 0,
      memoryKb: 0,
    };
  },
};

/**
 * Factory selecting the judge provider from env.JUDGE_MODE.
 *
 * - auto:   docker when the daemon is reachable, else local (todo 9)
 * - docker: run via judge-lite container (todo 9)
 * - local:  run via local gcc under rlimits (todo 9)
 *
 * Todo 9 replaces the stub returns below with the real implementations.
 */
export function getJudgeProvider(): JudgeProvider {
  switch (env.JUDGE_MODE) {
    case 'docker':
      // todo 9: DockerJudgeProvider - spawn judge-lite container
      return stubJudgeProvider;
    case 'local':
      // todo 9: LocalJudgeProvider - gcc compile + run under rlimits
      return stubJudgeProvider;
    case 'auto':
      // todo 9: AutoJudgeProvider - docker if daemon reachable, else local
      return stubJudgeProvider;
  }
}
