import {
  isPostLogoutRedirectAllowed,
  originMatchesRegisteredUri,
} from './post-logout-redirect.util';

describe('post-logout-redirect.util', () => {
  describe('originMatchesRegisteredUri', () => {
    const candidate = (uri: string) => new URL(uri);

    it('matches an exact origin (path on either side is ignored)', () => {
      expect(
        originMatchesRegisteredUri(
          candidate('https://app.example.com/goodbye?x=1'),
          'https://app.example.com/callback',
        ),
      ).toBe(true);
    });

    it('treats a {tenant} label as a single-label wildcard', () => {
      expect(
        originMatchesRegisteredUri(
          candidate('https://acme.example.com/'),
          'https://{tenant}.example.com/callback',
        ),
      ).toBe(true);
    });

    it('{tenant} never matches zero labels (apex) or multiple labels', () => {
      const registered = 'https://{tenant}.example.com/callback';
      expect(
        originMatchesRegisteredUri(candidate('https://example.com'), registered),
      ).toBe(false);
      expect(
        originMatchesRegisteredUri(
          candidate('https://a.b.example.com'),
          registered,
        ),
      ).toBe(false);
    });

    it('treats a * label as a single-label wildcard (redirect URIs allow it)', () => {
      expect(
        originMatchesRegisteredUri(
          candidate('https://acme.example.com'),
          'https://*.example.com/callback',
        ),
      ).toBe(true);
    });

    it('rejects a non-matching host', () => {
      expect(
        originMatchesRegisteredUri(
          candidate('https://evil.com'),
          'https://app.example.com/callback',
        ),
      ).toBe(false);
    });

    it('rejects a host that merely ENDS with the registered host', () => {
      expect(
        originMatchesRegisteredUri(
          candidate('https://evilapp.example.com.attacker.io'),
          'https://app.example.com/callback',
        ),
      ).toBe(false);
    });

    it('rejects a scheme mismatch', () => {
      expect(
        originMatchesRegisteredUri(
          candidate('http://app.example.com'),
          'https://app.example.com/callback',
        ),
      ).toBe(false);
    });

    it('rejects a port mismatch (default ports normalize away)', () => {
      expect(
        originMatchesRegisteredUri(
          candidate('https://app.example.com:8443'),
          'https://app.example.com/callback',
        ),
      ).toBe(false);
      // :443 IS the https default → same origin
      expect(
        originMatchesRegisteredUri(
          candidate('https://app.example.com:443'),
          'https://app.example.com/callback',
        ),
      ).toBe(true);
    });

    it('never matches against an unparseable registered URI', () => {
      expect(
        originMatchesRegisteredUri(candidate('https://a.example.com'), 'not a url'),
      ).toBe(false);
    });
  });

  describe('isPostLogoutRedirectAllowed', () => {
    const registered = [
      'https://app.example.com/callback',
      'https://{tenant}.myapp.io/api/auth/login',
    ];

    it('allows an exact registered origin', () => {
      expect(
        isPostLogoutRedirectAllowed('https://app.example.com/bye', registered),
      ).toBe(true);
    });

    it('allows a tenant-wildcard origin', () => {
      expect(
        isPostLogoutRedirectAllowed('https://acme.myapp.io/logged-out', registered),
      ).toBe(true);
    });

    it('rejects an unregistered origin', () => {
      expect(isPostLogoutRedirectAllowed('https://evil.com', registered)).toBe(
        false,
      );
    });

    it('rejects javascript: URIs (dangerous scheme)', () => {
      expect(
        isPostLogoutRedirectAllowed('javascript:alert(1)', registered),
      ).toBe(false);
    });

    it('rejects unparseable garbage', () => {
      expect(isPostLogoutRedirectAllowed('http//nope', registered)).toBe(false);
      expect(isPostLogoutRedirectAllowed('', registered)).toBe(false);
    });

    it('keeps the localhost/127.0.0.1 dev patterns without any registration', () => {
      expect(isPostLogoutRedirectAllowed('http://localhost:3000/x', [])).toBe(true);
      expect(isPostLogoutRedirectAllowed('http://app.localhost:3000', [])).toBe(true);
      expect(isPostLogoutRedirectAllowed('http://127.0.0.1:8080/x', [])).toBe(true);
    });
  });
});
