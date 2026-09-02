'use client';

/**
 * Client-side auth helpers.
 * Single source of truth for token storage key and auth header construction.
 */

export const TOKEN_KEY = 'luna-token';

/**
 * Get the auth token from localStorage.
 * Returns null if not in browser or token not set.
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Build Authorization header object for fetch requests.
 * Returns empty object if no token available.
 */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Build full headers including Content-Type and Authorization.
 * Use for JSON POST/PUT requests.
 */
export function jsonAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

/**
 * Clear the stored token (logout).
 */
export function clearToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * Check if user appears authenticated on client side.
 * Note: This only checks token presence, not validity.
 */
export function hasToken(): boolean {
  return getToken() !== null;
}
