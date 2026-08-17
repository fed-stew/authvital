import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User as UserIcon,
  ShieldCheck,
  ShieldAlert,
  Building2,
  Monitor,
  Loader2,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import { accountApi, authApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useToast } from '@/components/ui/Toast';
import type { AccountProfile, AccountSession } from '@/types';

const errMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.message || fallback;

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

/**
 * AccountSettingsPage - the canonical per-user account page at /account/settings.
 *
 * Scope (deliberately minimal - see Phase 4b report):
 *  - Profile: editable name/display fields via PATCH /auth/profile.
 *  - Security: MFA status + link to the existing MFA setup flow.
 *  - Organizations: entry point INTO each org's console (fixes the "no way in"
 *    gap - /tenant/:id was previously only reachable by deep link).
 *  - Active sessions: real table backed by GET/DELETE /auth/sessions
 *    (JwtAuthGuard, own-user scoped). Failures degrade gracefully.
 */
export function AccountSettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profile, setProfile] = React.useState<AccountProfile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const [sessions, setSessions] = React.useState<AccountSession[] | null>(null);
  const [sessionsError, setSessionsError] = React.useState(false);
  const [revoking, setRevoking] = React.useState<string | null>(null);

  const [form, setForm] = React.useState({ givenName: '', familyName: '', displayName: '' });
  const [savingProfile, setSavingProfile] = React.useState(false);

  const syncForm = React.useCallback((p: AccountProfile) => {
    setForm({
      givenName: p.givenName ?? '',
      familyName: p.familyName ?? '',
      displayName: p.displayName ?? '',
    });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await accountApi.getProfile();
        if (!cancelled) {
          setProfile(data);
          syncForm(data);
        }
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401) {
          navigate('/auth/login');
          return;
        }
        if (!cancelled) toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to load profile') });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, toast, syncForm]);

  // Load the current user's active sessions; degrade gracefully on failure.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await accountApi.getSessions();
        if (!cancelled) setSessions(data?.sessions ?? []);
      } catch {
        if (!cancelled) {
          setSessions([]);
          setSessionsError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRevoke = async (id: string) => {
    try {
      setRevoking(id);
      await accountApi.revokeSession(id);
      setSessions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      toast({ variant: 'success', title: 'Session revoked', message: 'That session was signed out.' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to revoke session') });
    } finally {
      setRevoking(null);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true);
      const updated = await accountApi.updateProfile({
        givenName: form.givenName.trim(),
        familyName: form.familyName.trim(),
        displayName: form.displayName.trim(),
      });
      setProfile(updated);
      syncForm(updated);
      toast({ variant: 'success', title: 'Profile saved', message: 'Your details were updated.' });
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to save profile') });
    } finally {
      setSavingProfile(false);
    }
  };

  const profileDirty =
    !!profile &&
    (form.givenName !== (profile.givenName ?? '') ||
      form.familyName !== (profile.familyName ?? '') ||
      form.displayName !== (profile.displayName ?? ''));

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* client is logged out regardless */
    }
    navigate('/auth/login');
  };

  const displayName =
    profile?.displayName ||
    [profile?.givenName, profile?.familyName].filter(Boolean).join(' ') ||
    profile?.email ||
    'Your account';

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 items-center justify-between border-b border-white/10 bg-card px-6">
        <div className="flex items-center gap-3">
          <UserIcon className="h-5 w-5 text-muted-foreground" />
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-foreground">Account settings</h1>
            <p className="text-xs text-muted-foreground">Manage your profile, security, and organizations</p>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your personal details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              {profile?.pictureUrl ? (
                <img src={profile.pictureUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 text-lg font-semibold text-primary">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-foreground">{displayName}</p>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="givenName">First name</Label>
                <Input
                  id="givenName"
                  value={form.givenName}
                  onChange={(e) => setForm((f) => ({ ...f, givenName: e.target.value }))}
                  placeholder="First name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="familyName">Last name</Label>
                <Input
                  id="familyName"
                  value={form.familyName}
                  onChange={(e) => setForm((f) => ({ ...f, familyName: e.target.value }))}
                  placeholder="Last name"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="How your name appears"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Member since {formatDate(profile?.createdAt ?? null)}. Your email is managed
                separately and can't be changed here.
              </p>
              <Button onClick={handleSaveProfile} disabled={!profileDirty || savingProfile}>
                {savingProfile ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Security / MFA */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Multi-factor authentication for your account.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {profile?.mfaEnabled ? (
                <ShieldCheck className="h-6 w-6 text-green-400" />
              ) : (
                <ShieldAlert className="h-6 w-6 text-yellow-400" />
              )}
              <div>
                <p className="font-medium text-foreground">
                  {profile?.mfaEnabled ? 'MFA is enabled' : 'MFA is not enabled'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {profile?.mfaEnabled
                    ? 'Your account is protected with a second factor.'
                    : 'Add an authenticator app for stronger protection.'}
                </p>
              </div>
            </div>
            <a href="/auth/mfa/setup">
              <Button variant={profile?.mfaEnabled ? 'outline' : 'default'}>
                {profile?.mfaEnabled ? 'Manage MFA' : 'Set up MFA'}
              </Button>
            </a>
          </CardContent>
        </Card>

        {/* Organizations (console entry point) */}
        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Open an organization's admin console.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {profile && profile.memberships.length > 0 ? (
              <div className="divide-y divide-white/5">
                {profile.memberships.map((m) => (
                  <Link
                    key={m.id}
                    to={`/tenant/${m.tenant.id}/overview`}
                    className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-white/5"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-semibold text-primary">
                      {m.tenant.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{m.tenant.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.tenant.slug}</p>
                    </div>
                    {m.status !== 'ACTIVE' && (
                      <Badge variant="warning" className="text-[10px]">
                        {m.status}
                      </Badge>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">You don't belong to any organizations yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active sessions */}
        <Card>
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
            <CardDescription>Devices currently signed in to your account.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {sessions === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : sessionsError ? (
              <div className="flex items-start gap-3 p-6">
                <Monitor className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  We couldn't load your active sessions right now. Please try again later.
                </p>
              </div>
            ) : sessions.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">No active sessions.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-6 py-4">
                    <Monitor className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{s.userAgent || 'Unknown device'}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.ipAddress || 'Unknown IP'} · started {formatDate(s.createdAt)}
                        {s.tenant ? ` · ${s.tenant}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoking === s.id}
                      onClick={() => handleRevoke(s.id)}
                    >
                      {revoking === s.id ? 'Revoking...' : 'Revoke'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
