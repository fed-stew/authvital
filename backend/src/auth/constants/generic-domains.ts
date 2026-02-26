/**
 * List of generic/public email domains that should NOT create corporate tenants
 * Users with these domains get personal tenants without domain verification options
 */
export const GENERIC_EMAIL_DOMAINS = new Set([
  // Major providers
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.fr',
  'yahoo.de',
  'yahoo.es',
  'yahoo.it',
  'yahoo.ca',
  'yahoo.com.br',
  'yahoo.co.in',
  'yahoo.co.jp',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'hotmail.fr',
  'hotmail.de',
  'hotmail.es',
  'hotmail.it',
  'live.com',
  'live.co.uk',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'zoho.com',
  'zohomail.com',
  'yandex.com',
  'yandex.ru',
  'mail.com',
  'email.com',
  'fastmail.com',
  'fastmail.fm',
  'tutanota.com',
  'tutanota.de',
  'tuta.io',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  
  // Temporary/disposable email services
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'throwaway.email',
  'temp-mail.org',
  
  // Regional providers
  'qq.com',
  '163.com',
  '126.com',
  'sina.com',
  'naver.com',
  'daum.net',
  'hanmail.net',
  'rediffmail.com',
  'mail.ru',
  'inbox.ru',
  'list.ru',
  'bk.ru',
  'rambler.ru',
  'libero.it',
  'virgilio.it',
  'laposte.net',
  'orange.fr',
  'free.fr',
  'sfr.fr',
  't-online.de',
  'freenet.de',
]);

/**
 * Check if an email domain is a generic/public domain
 */
export function isGenericDomain(domain: string): boolean {
  return GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string {
  const parts = email.toLowerCase().split('@');
  return parts[1] || '';
}
