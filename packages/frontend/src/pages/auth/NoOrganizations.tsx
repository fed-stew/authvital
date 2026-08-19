/**
 * NoOrganizations - "Create your first organization" experience
 *
 * Where the tenant-first login flow sends a user who belongs to NO organization
 * at all (a fresh account, or a corrupted / zero-membership session). Instead of
 * dumping them on an empty app-picker, we explain the situation and let them
 * self-serve a new tenant via POST /api/tenants (creator becomes owner).
 *
 * Resuming the original flow after creation:
 *  - ?resume=<path>      → the exact OAuth /authorize URL to replay (path #3)
 *  - ?client_id=<id>     → an OAuth continuation; hop to org-picker (path #2)
 *  - neither             → tenant-first app-picker scoped to the new tenant
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Building2, Loader2, LogOut, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

/** Mirror the backend slug rules (see CreateTenantModal / CreateTenantDto). */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function NoOrganizations() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const resume = searchParams.get('resume');
  const clientId = searchParams.get('client_id');

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  // Track whether the user has hand-edited the slug so we stop auto-syncing it.
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep slug in sync with name until the user takes over the slug field.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const slugValid = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(slug);
  const canSubmit = name.trim().length > 0 && slugValid && !submitting;

  const resumeAfterCreate = (createdSlug: string, createdName: string) => {
    // Path #3: replay the exact OAuth authorize request.
    if (resume && resume.startsWith('/') && !resume.startsWith('//')) {
      window.location.href = resume;
      return;
    }
    // Path #2: OAuth continuation with a client_id → let the user pick the org.
    if (clientId) {
      navigate(`/auth/org-picker?client_id=${encodeURIComponent(clientId)}`);
      return;
    }
    // Hint-less: tenant-first app-picker scoped to the brand-new tenant.
    navigate(
      `/auth/app-picker?tenant=${encodeURIComponent(createdSlug)}` +
        `&tenant_name=${encodeURIComponent(createdName)}`,
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/tenants`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug }),
      });

      if (response.status === 401) {
        navigate('/auth/login');
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to create organization');
      }

      const tenant = await response.json();
      resumeAfterCreate(tenant.slug ?? slug, tenant.name ?? name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore logout errors
    }
    navigate('/auth/login');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">No organizations yet</h1>
          <p className="text-muted-foreground mt-2">
            Your account isn&apos;t a member of any organization. Create one to
            get started &mdash; you&apos;ll become its owner.
          </p>
        </div>

        {/* Create form */}
        <form
          onSubmit={handleSubmit}
          className="bg-card rounded-xl border border-white/10 p-6 space-y-4"
        >
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="org-name" className="text-sm font-medium text-foreground">
              Organization name <span className="text-destructive">*</span>
            </label>
            <Input
              id="org-name"
              type="text"
              placeholder="Acme Corporation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              autoComplete="organization"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="org-slug" className="text-sm font-medium text-foreground">
              Slug <span className="text-destructive">*</span>
            </label>
            <Input
              id="org-slug"
              type="text"
              placeholder="acme-corp"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              disabled={submitting}
              autoComplete="off"
              className={slug && !slugValid ? 'border-destructive' : ''}
            />
            {slug && !slugValid ? (
              <p className="text-sm text-destructive">
                Lowercase letters, numbers and hyphens only.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Used as a subdomain and must be unique.
              </p>
            )}
          </div>

          <Button type="submit" disabled={!canSubmit} className="w-full">
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating&hellip;
              </span>
            ) : (
              'Create organization'
            )}
          </Button>
        </form>

        {/* Navigation */}
        <div className="mt-6 text-center">
          <button
            onClick={handleLogout}
            className="text-sm text-muted-foreground hover:text-white transition-colors inline-flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign in with a different account
          </button>
        </div>

        {/* Security note */}
        <p className="mt-4 text-center text-xs text-muted-foreground/50">
          Secured by{' '}
          <a
            href="https://www.authvital.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground transition-colors"
          >
            AuthVital
          </a>
        </p>
      </div>
    </div>
  );
}
