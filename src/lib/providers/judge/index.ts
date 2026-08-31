import 'server-only';

import { env } from '@/lib/env';

import { DockerJudgeProvider, isDockerDaemonAvailable } from './docker';
import { LocalJudgeProvider } from './local';
import type { JudgeProvider } from './types';

/**
 * Auto-mode docker probe cache. Probing `docker info` on a machine without a
 * running daemon can block for seconds, so a failed probe is remembered for
 * PROBE_TTL_MS instead of paying the cost on every request.
 */
const PROBE_TTL_MS = 30_000;
let dockerProbe: { ok: boolean; at: number } | null = null;

function dockerAvailable(): boolean {
  if (dockerProbe && Date.now() - dockerProbe.at < PROBE_TTL_MS) {
    return dockerProbe.ok;
  }
  const ok = isDockerDaemonAvailable();
  dockerProbe = { ok, at: Date.now() };
  return ok;
}

/**
 * Factory selecting the judge provider from env.JUDGE_MODE.
 *
 * - auto:   docker when the daemon is reachable, else local gcc
 * - docker: run via ephemeral gcc:13 container (throws if daemon unreachable)
 * - local:  run via local gcc with a hard wall-clock kill
 *
 * Both runners execute user code OUTSIDE the Next.js process (container or
 * spawned executable) - user code is never eval'd in-process.
 */
export function getJudgeProvider(): JudgeProvider {
  switch (env.JUDGE_MODE) {
    case 'docker':
      if (!dockerAvailable()) {
        throw new Error(
          'JUDGE_MODE=docker but the docker daemon is unreachable (is Docker Desktop running?)'
        );
      }
      return new DockerJudgeProvider();
    case 'local':
      return new LocalJudgeProvider();
    case 'auto':
      return dockerAvailable() ? new DockerJudgeProvider() : new LocalJudgeProvider();
  }
}
