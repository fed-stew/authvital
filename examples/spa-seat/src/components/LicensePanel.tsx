import type { EnhancedJwtPayload } from '@authvital/browser';

function FeatureList({ features }: { features?: string[] }) {
  if (!features || features.length === 0) return <span className="muted">— none —</span>;
  return (
    <span className="chips">
      {features.map((f) => <span className="chip" key={f}>{f}</span>)}
    </span>
  );
}

/**
 * License / seat status, read straight from the JWT `license` claim.
 *
 * The browser SDK exposes no dedicated client-side "get my license" method, so
 * the authoritative source in the browser is the token itself. basic-seat vs
 * pro-seat is visible via license.type; pro-seat additionally carries the
 * advanced_analytics + sso features (see seed.config.yaml).
 */
export default function LicensePanel({ payload }: { payload: EnhancedJwtPayload }) {
  const license = payload.license;
  const isPro = license?.type === 'pro-seat';

  return (
    <section className="card">
      <h2>Your seat &amp; license</h2>
      {license ? (
        <>
          <p>
            <span className={`badge ${isPro ? 'badge-pro' : 'badge-basic'}`}>
              {license.name}
            </span>{' '}
            <span className="muted">({license.type})</span>
          </p>
          <p>Features: <FeatureList features={license.features} /></p>
        </>
      ) : (
        <p className="muted">
          No seat assigned on this token. In <code>licenseco</code>,{' '}
          <code>member@</code> and <code>admin@</code> are seeded a <code>basic-seat</code>;
          the owner/billing-admin provision + assign the rest in-app.
        </p>
      )}
    </section>
  );
}
