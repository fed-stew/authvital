/**
 * post_logout_redirect_uri validation for GET /auth/logout/redirect.
 *
 * A logout redirect is allowed when the URI's ORIGIN exactly matches the
 * origin of a URI registered on any active ApplicationClient (redirectUris,
 * initiateLoginUri, or postLogoutRedirectUris), or when it matches the
 * localhost/127.0.0.1 dev patterns. Registered URIs may contain the
 * `{tenant}` placeholder (or a `*` wildcard) in a host label — that label
 * matches ANY single label in the same position (never zero or multiple
 * labels), so `https://{tenant}.app.com` allows `https://acme.app.com`
 * but not `https://app.com` or `https://a.b.app.com`.
 *
 * Everything here is origin-only (scheme + host + port): paths and query
 * strings on either side are ignored, so this can never become an open
 * redirect beyond hosts the operator explicitly registered.
 */

/**
 * Sentinel substituted for `{tenant}` / `*` labels so the URI survives
 * `new URL()` parsing. Lowercase (URL lowercases hostnames) and improbable
 * as a real DNS label.
 */
const WILDCARD_LABEL_SENTINEL = 'authvital-wildcard-label';

/** Dev-convenience origins that are always allowed (legacy behavior). */
const DEV_ORIGIN_PATTERNS = [
  /^https?:\/\/([a-z0-9-]+\.)?localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

/**
 * Does `candidateOrigin`'s origin match `registeredUri`'s origin, treating a
 * `{tenant}` (or `*`) host label as a single-label wildcard?
 *
 * Scheme and port must match exactly (URL normalizes default ports away on
 * both sides). Unparseable registered URIs never match.
 */
export function originMatchesRegisteredUri(
  candidate: URL,
  registeredUri: string,
): boolean {
  let registered: URL;
  try {
    registered = new URL(
      registeredUri
        .replace(/\{tenant\}/g, WILDCARD_LABEL_SENTINEL)
        .replace(/\*/g, WILDCARD_LABEL_SENTINEL),
    );
  } catch {
    return false;
  }

  if (registered.protocol !== candidate.protocol) return false;
  if (registered.port !== candidate.port) return false;

  const registeredLabels = registered.hostname.split('.');
  const candidateLabels = candidate.hostname.split('.');
  if (registeredLabels.length !== candidateLabels.length) return false;

  return registeredLabels.every(
    (label, i) =>
      label === WILDCARD_LABEL_SENTINEL || label === candidateLabels[i],
  );
}

/**
 * Validate a post_logout_redirect_uri against the registered URI corpus.
 *
 * Returns true when the URI is http(s), parseable, and its origin matches a
 * registered URI's origin or a dev localhost pattern. `javascript:` and
 * friends are rejected by the scheme check (and typically by URL parsing of
 * the origin comparison anyway).
 */
export function isPostLogoutRedirectAllowed(
  uri: string,
  registeredUris: string[],
): boolean {
  let candidate: URL;
  try {
    candidate = new URL(uri);
  } catch {
    return false;
  }

  // Origin allowlisting only makes sense for http(s).
  if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') {
    return false;
  }

  if (DEV_ORIGIN_PATTERNS.some((pattern) => pattern.test(candidate.origin))) {
    return true;
  }

  return registeredUris.some((registered) =>
    originMatchesRegisteredUri(candidate, registered),
  );
}
