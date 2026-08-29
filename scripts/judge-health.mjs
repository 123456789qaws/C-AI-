#!/usr/bin/env node
/**
 * Judge Health Check Script
 * Checks if Docker is available for judge-lite container execution.
 * Falls back to local gcc if Docker is unavailable.
 * Always exits with code 0 to not block CI/CD pipelines.
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function checkDocker() {
  try {
    // Try to run docker info - this will fail if Docker daemon is not running
    // or if Docker is not installed
    execSync('docker info', { 
      stdio: 'pipe',
      timeout: 5000 
    });
    return { available: true, error: null };
  } catch (error) {
    return { 
      available: false, 
      error: error.message || String(error) 
    };
  }
}

function checkGcc() {
  try {
    execSync('gcc --version', { 
      stdio: 'pipe',
      timeout: 3000 
    });
    return { available: true };
  } catch {
    return { available: false };
  }
}

function main() {
  console.log('[judge:health] Checking Docker availability...');
  
  const dockerResult = checkDocker();
  
  if (dockerResult.available) {
    console.log('[judge:health] ✓ Docker daemon is available');
    console.log('[judge:health] Judge-lite can run in container mode');
    return 0;
  }
  
  console.log('[judge:health] ⚠ WARN: Docker unavailable - falling back to local gcc');
  console.log('[judge:health]   Reason:', dockerResult.error?.split('\n')[0] || 'Unknown error');
  
  const gccResult = checkGcc();
  if (gccResult.available) {
    console.log('[judge:health] ✓ Local gcc found - judge can run in local mode');
  } else {
    console.log('[judge:health] ⚠ WARN: No local gcc found - judge compilation will fail');
    console.log('[judge:health]   Install gcc or start Docker daemon for full functionality');
  }
  
  console.log('[judge:health] Continuing with fallback mode...');
  return 0; // Always exit 0 to not block builds
}

main();