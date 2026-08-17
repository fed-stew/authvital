import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid3x3, Check, ChevronDown, ExternalLink, Loader2, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenant } from '@/contexts/TenantContext';
import {
  fetchConsoleApps,
  fetchConsoleMemberships,
  launchApp,
  type ConsoleApp,
  type ConsoleMembership,
} from '@/lib/console-apps';

/**
 * AppSwitcher - the Atlassian-style product/org switcher for the console chrome.
 *
 * Lives in the TenantHeader and lets a signed-in user:
 *  - jump between the orgs (tenants) they belong to (-> that org's console)
 *  - launch any product/app they can access (-> the app's login entry point)
 *  - hop to their personal account settings
 *
 * Data comes from the shared console-apps helpers (GET /auth/apps + /auth/me),
 * the very same endpoints the auth AppPicker/OrgPicker use.
 */
export function AppSwitcher() {
  const navigate = useNavigate();
  const { tenantName, tenantSlug } = useTenant();

  const [open, setOpen] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [apps, setApps] = React.useState<ConsoleApp[]>([]);
  const [orgs, setOrgs] = React.useState<ConsoleMembership[]>([]);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Lazy-load the switcher data the first time it's opened.
  React.useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const [appList, orgList] = await Promise.all([
        fetchConsoleApps().catch(() => null),
        fetchConsoleMemberships().catch(() => null),
      ]);
      if (cancelled) return;
      setApps(appList ?? []);
      setOrgs(orgList ?? []);
      setLoaded(true);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const goToOrg = (org: ConsoleMembership) => {
    setOpen(false);
    if (org.tenant.slug !== tenantSlug) {
      navigate(`/tenant/${org.tenant.slug}/overview`);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/10',
          open && 'bg-white/10',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch product or organization"
      >
        <Grid3x3 className="h-4 w-4 text-primary" />
        <span className="hidden max-w-[10rem] truncate sm:inline">{tenantName}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-white/10 bg-card shadow-xl">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              {/* Organizations */}
              <div className="border-b border-white/10 px-3 py-2">
                <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Your organizations
                </p>
                {orgs.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">No organizations.</p>
                ) : (
                  orgs.map((org) => {
                    const isCurrent = org.tenant.slug === tenantSlug;
                    return (
                      <button
                        key={org.tenant.id}
                        onClick={() => goToOrg(org)}
                        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-white/5"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                          {org.tenant.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{org.tenant.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{org.tenant.slug}</p>
                        </div>
                        {isCurrent && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Products / apps */}
              <div className="border-b border-white/10 px-3 py-2">
                <p className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Open a product
                </p>
                {apps.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">No products available.</p>
                ) : (
                  apps.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => launchApp(app, tenantSlug)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-white/5"
                    >
                      {app.brandingIconUrl || app.brandingLogoUrl ? (
                        <img
                          src={app.brandingIconUrl || app.brandingLogoUrl || ''}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-lg bg-white/5 object-contain"
                        />
                      ) : (
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                          style={{ backgroundColor: app.brandingPrimaryColor || 'rgb(147, 51, 234)' }}
                        >
                          {app.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{app.name}</span>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>

              {/* Account */}
              <div className="px-3 py-2">
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate('/account/settings');
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-white/5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
                    <UserCog className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="flex-1 font-medium text-foreground">Account settings</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
