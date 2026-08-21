/**
 * Shared HTTP helpers for webhook delivery.
 */

/** Per-request timeout — identical to the backend's 30s AbortSignal. */
export const WEBHOOK_TIMEOUT_MS = 30_000;

/**
 * POST a signed webhook body with the standard 30s timeout.
 *
 * SECURITY: `redirect: 'manual'` — fetch follows redirects by default, which
 * would let a public webhook URL pass the UrlGuardService SSRF check and
 * then 302 into a private/metadata address. We never follow redirects: a
 * 3xx response is !response.ok and is treated as a failed delivery attempt
 * (receivers must expose a stable, non-redirecting endpoint).
 */
export function postWebhook(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
}

/**
 * Error categorization — faithful port of the backend's categorization in
 * SyncEventService.deliverWebhook() so lastError strings keep the same
 * "[CATEGORY] message" shape admins already know.
 */
export function categorizeError(error: any): string {
  if (error.name === 'AbortError' || error.message?.includes('timeout')) {
    return 'TIMEOUT';
  }
  if (error.code === 'ECONNREFUSED') {
    return 'CONNECTION_REFUSED';
  }
  if (error.code === 'ENOTFOUND') {
    return 'DNS_FAILED';
  }
  if (error.code === 'ECONNRESET') {
    return 'CONNECTION_RESET';
  }
  if (error.message?.startsWith('HTTP ')) {
    return 'HTTP_ERROR';
  }
  return 'UNKNOWN';
}
