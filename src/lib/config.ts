import 'server-only';

export { env, type Env } from './env';

/**
 * Server-only guard - throws if imported in client component.
 * This file must only be imported in server components, server actions, or API routes.
 * Importing this in a client component will cause a build-time error.
 */
export function assertServerOnly(): void {
  // This function exists to make the server-only import explicit
  // The 'server-only' package at the top of this file does the actual enforcement
}
