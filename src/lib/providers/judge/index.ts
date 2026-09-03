import 'server-only';

import { env } from '@/lib/env';

import { DockerJudgeProvider, isDockerDaemonAvailable, isDockerImageAvailable } from './docker';
import { LocalJudgeProvider } from './local';
import type { JudgeProvider, JudgeResult, JudgeRunRequest } from './types';

/**
 * Auto-mode docker probe cache. Probing `docker info` on a machine without a
 * running daemon can block for seconds, so a failed probe is remembered for
 * PROBE_TTL_MS instead of paying the cost on every request.
 */
const PROBE_TTL_MS = 30_000;
let dockerProbe: { ok: boolean; at: number } | null = null;

function dockerUsable(): boolean {
  if (dockerProbe && Date.now() - dockerProbe.at < PROBE_TTL_MS) {
    return dockerProbe.ok;
  }
  // BOTH the daemon AND the gcc:13 image must be present. Daemon-up but
  // image-missing was Bug1-judge ("Unable to find image 'gcc:13' locally"
  // misreported as CE) - auto mode now falls back to local gcc instead.
  const ok = isDockerDaemonAvailable() && isDockerImageAvailable();
  dockerProbe = { ok, at: Date.now() };
  return ok;
}

/** Infra-error marker shared by both providers (never a real CE/RE/TLE). */
export function isJudgeInfraError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('JUDGE_INFRA') || msg.includes('docker run failed');
}

/**
 * Auto provider: docker when daemon + image are present, else local gcc.
 * If docker was selected but fails mid-run with an infra error (image pulled
 * out from under us, daemon died), transparently retries once on local gcc
 * and logs a friendly Chinese notice. Real CE/RE/TLE verdicts pass through
 * untouched - only infra errors trigger the fallback.
 */
class AutoJudgeProvider implements JudgeProvider {
  readonly name = 'judge-auto';
  private readonly docker = new DockerJudgeProvider();
  private readonly local = new LocalJudgeProvider();

  async run(req: JudgeRunRequest): Promise<JudgeResult> {
    if (!dockerUsable()) {
      return this.local.run(req);
    }
    try {
      return await this.docker.run(req);
    } catch (err) {
      if (isJudgeInfraError(err)) {
        const detail = err instanceof Error ? err.message : String(err);
        console.warn(`[judge] 判题机docker不可用，已自动切换本地编译：${detail.slice(0, 300)}`);
        return this.local.run(req);
      }
      throw err;
    }
  }
}

/**
 * Factory selecting the judge provider from env.JUDGE_MODE.
 *
 * - auto:   docker when daemon + gcc:13 image are present, else local gcc;
 *           mid-run docker infra failure also falls back to local once
 * - docker: run via ephemeral gcc:13 container (throws if daemon unreachable)
 * - local:  run via local gcc (LOCAL_GCC_PATH or PATH) with wall-clock kill
 *
 * Both runners execute user code OUTSIDE the Next.js process (container or
 * spawned executable) - user code is never eval'd in-process.
 */
export function getJudgeProvider(): JudgeProvider {
  switch (env.JUDGE_MODE) {
    case 'docker':
      if (!isDockerDaemonAvailable()) {
        throw new Error(
          'JUDGE_INFRA: JUDGE_MODE=docker but the docker daemon is unreachable (is Docker Desktop running?)'
        );
      }
      if (!isDockerImageAvailable()) {
        throw new Error(
          'JUDGE_INFRA: JUDGE_MODE=docker but the gcc:13 image is missing (run `docker pull gcc:13` or switch to JUDGE_MODE=auto)'
        );
      }
      return new DockerJudgeProvider();
    case 'local':
      return new LocalJudgeProvider();
    case 'auto':
      return new AutoJudgeProvider();
  }
}
