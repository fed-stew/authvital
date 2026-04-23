/**
 * Common utilities barrel export.
 */
export {
  validateRedirectUriPattern,
  type RedirectUriValidationResult,
} from './redirect-uri.utils';

export {
  isSecureCookie,
  getBaseCookieOptions,
  getSessionCookieOptions,
  getAuthFlowCookieOptions,
  type CookieOptions,
} from './cookie.utils';

export {
  validateRedirectUriPattern as validateSecureRedirectUriPattern,
  validateRedirectUriPatterns,
  validateSafeUrl,
  validateSafeUrls,
  DANGEROUS_SCHEMES,
  DANGEROUS_PATTERNS,
} from './url-validation.utils';
