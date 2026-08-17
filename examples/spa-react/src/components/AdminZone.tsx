import type { EnhancedJwtPayload } from '@authvital/browser';
import {
  getManagementUrls,
  getAccountSettingsUrl,
  getAppPickerUrl,
  getOrgPickerUrl,
} from '@authvital/core';
import { AV_HOST, AV_CLIENT_ID, ADMIN_APP_ROLE } from '../config';

/**
 * Hosted-first management deep-links.
 *
 * The app itself does NOT ship tenant-admin CRUD. In the hosted-first model the
 * AuthVital console (`/tenant/:tenantId/*`) is the canonical place customers
 * manage members, app access, SSO, domains, billing and audit. This app's job
 * is auth + claims + gating; management happens by deep-linking INTO the
 * console via the verified `@authvital/core` helpers (no hand-assembled paths).
 */
function consoleLinks(tenantId?: string) {
  const switchers = [
    { label: 'Switch app', href: getAppPickerUrl(AV_HOST) },
    {
      label: 'Switch org',
      href: getOrgPickerUrl(AV_HOST, { clientId: AV_CLIENT_ID }),
    },
    { label: 'Account settings', href: getAccountSettingsUrl(AV_HOST) },
  ];

  if (!tenantId) return switchers;

  const urls = getManagementUrls({ authVitalHost: AV_HOST, tenantId });
  return [
    { label: 'Manage members', href: urls.members },
    { label: 'Manage app access', href: urls.applications },
    { label: 'Access matrix', href: urls.accessMatrix },
    { label: 'SSO', href: urls.sso },
    { label: 'Domains', href: urls.domains },
    { label: 'Billing', href: urls.billing },
    { label: 'Audit', href: urls.audit },
    ...switchers,
  ];
}

/**
 * Role/permission-gated "protected content" + hosted-console deep-links.
 * The admin card only renders when the JWT's app_roles include `admin`.
 */
export default function AdminZone({ payload }: { payload: EnhancedJwtPayload }) {
  const appRoles = payload.app_roles ?? [];
  const isAdmin = appRoles.includes(ADMIN_APP_ROLE);
  const links = consoleLinks(payload.tenant_id);

  return (
    <section className="card">
      <h2>Protected content</h2>

      {isAdmin ? (
        <div className="admin-card">
          <strong>Admin-only card</strong>
          <p>You can see this because your <code>app_roles</code> include <code>admin</code>.</p>
        </div>
      ) : (
        <p className="muted">
          Admin-only content is hidden — your <code>app_roles</code> do not include{' '}
          <code>{ADMIN_APP_ROLE}</code>. (Try <code>bob@acme.com</code>.)
        </p>
      )}

      <h3 style={{ marginTop: 16 }}>Manage in the hosted console ↗</h3>
      <p className="muted">
        This app handles auth &amp; gating; tenant administration lives in the
        AuthVital console. These are verified deep-links built with{' '}
        <code>@authvital/core</code> (<code>getManagementUrls</code>,{' '}
        <code>getAppPickerUrl</code>, <code>getOrgPickerUrl</code>,{' '}
        <code>getAccountSettingsUrl</code>).
      </p>
      <div className="chips">
        {links.map((l) => (
          <a className="chip link" key={l.label} href={l.href} target="_blank" rel="noreferrer">
            {l.label} ↗
          </a>
        ))}
      </div>
    </section>
  );
}
