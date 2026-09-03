#!/usr/bin/env node
/**
 * Judge Health Check Script
 * Probes, in JUDGE_MODE order:
 *   1. docker daemon (`docker info`) + gcc:13 image (`docker image inspect`)
 *   2. local gcc (`LOCAL_GCC_PATH` or `gcc` on PATH, reports --version)
 * Always exits 0 to not block CI/CD pipelines.
 */

import { execSync, execFileSync } from 'node:child_process';

const JUDGE_MODE = process.env.JUDGE_MODE ?? 'auto';
const GCC_BIN = process.env.LOCAL_GCC_PATH?.trim() || 'gcc';
const DOCKER_IMAGE = process.env.JUDGE_DOCKER_IMAGE?.trim() || 'gcc:13';

function probe(cmd, args, timeout) {
  try {
    const out = execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      windowsHide: true,
    });
    return { ok: true, output: String(out).trim() };
  } catch (error) {
    const msg =
      error?.stderr?.toString() || error?.stdout?.toString() || error.message || String(error);
    return { ok: false, error: msg.trim().split('\n')[0] };
  }
}

function main() {
  console.log(
    `[judge:health] JUDGE_MODE=${JUDGE_MODE} LOCAL_GCC_PATH=${process.env.LOCAL_GCC_PATH ?? '(PATH)'}`
  );

  const daemon = probe('docker', ['info', '--format', '{{.ServerVersion}}'], 5000);
  if (daemon.ok) {
    console.log(`[judge:health] ✓ Docker daemon reachable (server ${daemon.output})`);
  } else {
    console.log(`[judge:health] ✗ Docker daemon unreachable: ${daemon.error}`);
  }

  const image = daemon.ok
    ? probe('docker', ['image', 'inspect', DOCKER_IMAGE], 5000)
    : { ok: false, error: 'skipped (daemon down)' };
  if (image.ok) {
    console.log(`[judge:health] ✓ Docker image present: ${DOCKER_IMAGE}`);
  } else {
    console.log(`[judge:health] ✗ Docker image missing: ${DOCKER_IMAGE} (${image.error})`);
    if (daemon.ok)
      console.log(
        `[judge:health]   hint: run \`docker pull ${DOCKER_IMAGE}\` or use JUDGE_MODE=auto/local`
      );
  }

  const gcc = probe(GCC_BIN, ['--version'], 5000);
  if (gcc.ok) {
    console.log(`[judge:health] ✓ Local gcc OK [${GCC_BIN}]: ${gcc.output.split('\n')[0]}`);
    try {
      const where = execSync(GCC_BIN === 'gcc' ? 'where.exe gcc' : `where.exe "${GCC_BIN}"`, {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true,
      })
        .trim()
        .split('\n')[0];
      console.log(`[judge:health]   path: ${where}`);
    } catch {
      // `where.exe` is Windows-only; ignore elsewhere.
    }
  } else {
    console.log(`[judge:health] ✗ Local gcc missing [${GCC_BIN}]: ${gcc.error}`);
    console.log(
      '[judge:health]   hint: winget install BrechtSanders.WinLibs.POSIX.UCRT, or set LOCAL_GCC_PATH'
    );
  }

  const effective =
    daemon.ok && image.ok ? 'docker' : gcc.ok ? 'local (fallback)' : 'NONE (judge_unavailable)';
  console.log(`[judge:health] effective provider under JUDGE_MODE=${JUDGE_MODE}: ${effective}`);
  if (effective === 'NONE (judge_unavailable)') {
    console.log(
      '[judge:health] ⚠ WARN: neither docker image nor local gcc available - submissions will get judge_unavailable, not CE'
    );
  }
  return 0;
}

process.exit(main());
