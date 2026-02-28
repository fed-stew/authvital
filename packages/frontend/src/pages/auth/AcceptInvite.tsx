import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Mail, Building2, UserPlus, AlertCircle, CheckCircle2, LogIn, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

interface InvitationDetails {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  invitedBy: {
    name: string;
  } | null;
}

export function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Form fields for new users
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);

  // Fetch invitation details on mount
  useEffect(() => {
    if (!token) {
      setError('No invitation token provided');
      setIsLoading(false);
      return;
    }

    const fetchInvitation = async () => {
      try {
        const response = await fetch(`${API_URL}/api/invitations/token/${token}`);
        
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Invalid or expired invitation');
        }

        const data = await response.json();
        setInvitation(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invitation');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;

    // Validate password if provided
    if (password && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsAccepting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/invitations/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: receive auth cookies
        body: JSON.stringify({
          token,
          password: password || undefined,
          givenName: givenName || undefined,
          familyName: familyName || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = typeof data.message === 'string' ? data.message : '';
        throw new Error(errorMsg || 'Failed to accept invitation');
      }

      // Check if password is needed (new user without account)
      if (data.needsPassword) {
        setNeedsPassword(true);
        setError(null); // Clear any previous errors
        setIsAccepting(false);
        return;
      }

      // Success! Check if we have a redirect URL (user logged in with cookies set)
      if (data.success && data.redirectUrl) {
        // Redirect to the application's login URL (OAuth flow will auto-login)
        console.log('[AcceptInvite] Redirecting to:', data.redirectUrl);
        window.location.href = data.redirectUrl;
        return;
      }

      // No redirect URL - redirect to app picker so user can choose which app
      if (data.success && data.tenant) {
        const params = new URLSearchParams();
        params.set('tenant', data.tenant.slug);
        params.set('tenant_name', data.tenant.name);
        console.log('[AcceptInvite] No redirectUrl, going to app picker');
        window.location.href = `/auth/app-picker?${params.toString()}`;
        return;
      }

      // Fallback - show success screen
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setIsAccepting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-500" />
          <p className="mt-4 text-muted-foreground">Loading invitation...</p>
        </div>
      </div>
    );
  }

  // Error state (invalid/expired token)
  if (error && !invitation) {
    const errorLower = (error || '').toLowerCase();
    const isExpired = errorLower.includes('expired');
    const isAlreadyUsed = errorLower.includes('already been used');
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card border border-border rounded-xl p-8 shadow-xl text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-orange-500/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
            
            <h1 className="text-2xl font-bold text-white mb-3">
              {isExpired ? 'Invitation Expired' : isAlreadyUsed ? 'Invitation Already Used' : 'Invitation Not Found'}
            </h1>
            
            <p className="text-muted-foreground mb-6">
              {isExpired ? (
                "This invitation link has expired. Please ask your team administrator to send you a new invitation."
              ) : isAlreadyUsed ? (
                "This invitation has already been accepted. If you're having trouble accessing your account, try logging in."
              ) : (
                "We couldn't find this invitation. It may have been revoked or the link is incorrect."
              )}
            </p>
            
            <Button
              onClick={() => navigate('/auth/login')}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              <LogIn className="w-4 h-4 mr-2" /> Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-card border border-border rounded-xl p-8 shadow-xl text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            
            <h1 className="text-2xl font-bold text-white mb-2">Welcome to {invitation?.tenant.name}!</h1>
            <p className="text-muted-foreground mb-6">
              You've successfully joined the team.
            </p>
            
            <Button
              onClick={() => navigate('/auth/login')}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              <LogIn className="w-4 h-4 mr-2" /> Sign In to Continue
            </Button>
            
            <p className="text-xs text-muted-foreground mt-4">
              Sign in with your email ({invitation?.email}) to access your new team.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main invitation view
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <form onSubmit={handleAcceptInvite}>
          <div className="bg-card border border-border rounded-xl p-8 shadow-xl">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/10 flex items-center justify-center">
                <UserPlus className="w-8 h-8 text-purple-500" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">You're Invited!</h1>
              <p className="text-muted-foreground">
                {invitation?.invitedBy?.name 
                  ? `${invitation.invitedBy.name} invited you to join ${invitation?.tenant?.name || 'the team'}`
                  : `You've been invited to join ${invitation?.tenant?.name || 'the team'}`}
              </p>
            </div>

            {/* Invitation Details */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                <Building2 className="w-5 h-5 text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Tenant</p>
                  <p className="text-white font-medium truncate">{invitation?.tenant.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                <Mail className="w-5 h-5 text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Your email</p>
                  <p className="text-white font-medium truncate">{invitation?.email}</p>
                </div>
              </div>


            </div>

            {/* Password form for new users */}
            {needsPassword && (
              <div className="space-y-4 mb-6 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="text-center mb-2">
                  <p className="text-sm font-medium text-white">Create Your Account</p>
                  <p className="text-xs text-purple-300">
                    Set up a password to join {invitation?.tenant.name}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">First name</label>
                    <input
                      type="text"
                      value={givenName}
                      onChange={(e) => setGivenName(e.target.value)}
                      placeholder="John"
                      className="w-full px-3 py-2 rounded-md bg-secondary border border-white/10 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Last name</label>
                    <input
                      type="text"
                      value={familyName}
                      onChange={(e) => setFamilyName(e.target.value)}
                      placeholder="Doe"
                      className="w-full px-3 py-2 rounded-md bg-secondary border border-white/10 text-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Password *</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      className="w-full px-3 py-2 pr-10 rounded-md bg-secondary border border-white/10 text-white text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Confirm password *</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="w-full px-3 py-2 rounded-md bg-secondary border border-white/10 text-white text-sm"
                  />
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Accept Button */}
            <Button
              type="submit"
              disabled={isAccepting}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {isAccepting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Accepting...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> Accept Invitation</>
              )}
            </Button>
          </div>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          This invitation expires on{' '}
          {invitation?.expiresAt ? new Date(invitation.expiresAt).toLocaleDateString() : 'N/A'}
        </p>
      </div>
    </div>
  );
}
