import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User as UserIcon,
  AppWindow,
  Users,
  Check,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { tenantApi } from '@/lib/api';
import type { AppUsersResponse, AppUserWithAccess } from '@/types';

/**
 * AppUsersPage - Manage application access for all tenant members
 * Shows ALL members with toggle switches to grant/revoke access
 */
export function AppUsersPage() {
  const { tenantId, appId } = useParams<{ tenantId: string; appId: string }>();
  const { toast } = useToast();

  const [data, setData] = useState<AppUsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingUsers, setTogglingUsers] = useState<Set<string>>(new Set());

  // Load data
  useEffect(() => {
    loadData();
  }, [tenantId, appId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const result = await tenantApi.getAppUsers(tenantId!, appId!);
      setData(result);
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.message || 'Failed to load data',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle toggle access
  const handleToggleAccess = async (
    user: AppUserWithAccess,
    enable: boolean,
    roleId?: string,
  ) => {
    if (!data) return;

    // For PER_SEAT: check seats before enabling
    if (
      enable &&
      data.app.licensingMode === 'PER_SEAT' &&
      data.app.seatsAvailable <= 0
    ) {
      toast({
        variant: 'error',
        title: 'No Seats Available',
        message: 'Purchase more seats to grant access to this user.',
      });
      return;
    }

    // Only pass roleId if explicitly specified - backend will use default role otherwise
    const effectiveRoleId = roleId || undefined;

    setTogglingUsers((prev) => new Set(prev).add(user.userId));

    try {
      await tenantApi.toggleAppAccess(
        tenantId!,
        appId!,
        user.userId,
        enable,
        effectiveRoleId,
      );

      // Reload data to get accurate role assignment from backend
      // (backend picks default role, which we don't know client-side)
      await loadData();

      toast({
        variant: 'success',
        title: enable ? 'Access Granted' : 'Access Revoked',
        message: `${user.name}'s access has been ${enable ? 'activated' : 'deactivated'}`,
      });
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message:
          err?.response?.data?.message ||
          err?.message ||
          'Failed to update access',
      });
    } finally {
      setTogglingUsers((prev) => {
        const next = new Set(prev);
        next.delete(user.userId);
        return next;
      });
    }
  };

  // Handle role change
  const handleRoleChange = async (
    user: AppUserWithAccess,
    newRoleId: string,
  ) => {
    if (!user.hasAccess || !data) return;

    try {
      await tenantApi.updateAppRole(
        tenantId!,
        appId!,
        user.membershipId,
        newRoleId,
      );

      const newRole = data.app.roles.find((r) => r.id === newRoleId);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.userId === user.userId
              ? {
                  ...u,
                  roleId: newRoleId,
                  roleName: newRole?.name || null,
                  roleSlug: newRole?.slug || null,
                }
              : u,
          ),
        };
      });

      toast({
        variant: 'success',
        title: 'Role Updated',
        message: `${user.name}'s role changed to ${newRole?.name}`,
      });
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.message || 'Failed to update role',
      });
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const { app, users, totalMembers, membersWithAccess } = data;

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        to={`/tenant/${tenantId}/applications`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Applications
      </Link>

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
            <AppWindow className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{app.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                {app.licenseTypeName}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {membersWithAccess} / {totalMembers} members with access
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Seat Progress (for PER_SEAT) */}
      {app.licensingMode === 'PER_SEAT' && (
        <div className="bg-card rounded-lg border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                Seat Usage
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {app.seatsUsed} / {app.seatsTotal} seats used •{' '}
              {app.seatsAvailable} available
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                app.seatsAvailable === 0 ? 'bg-red-500' : 'bg-primary'
              }`}
              style={{ width: `${(app.seatsUsed / app.seatsTotal) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-lg border border-white/10 bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Member
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-40">
                Role
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground w-32">
                Access
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((user) => {
              const isToggling = togglingUsers.has(user.userId);
              const canToggleOn =
                app.licensingMode !== 'PER_SEAT' ||
                app.seatsAvailable > 0 ||
                user.hasAccess;

              return (
                <tr key={user.userId} className="hover:bg-white/5">
                  {/* Member */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20">
                        <UserIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">
                            {user.name}
                          </p>
                          {user.membershipStatus === 'INVITED' && (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/50 text-xs">
                              Pending Invite
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Role - fixed width */}
                  <td className="px-4 py-3 w-40">
                    <div className="w-36">
                      {user.hasAccess ? (
                        <Select
                          value={user.roleId || ''}
                          onValueChange={(value) => handleRoleChange(user, value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {app.roles.map((role) => (
                              <SelectItem key={role.id} value={role.id}>
                                {role.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>

                  {/* Access Toggle - fixed width */}
                  <td className="px-4 py-3 w-32">
                    <div className="flex items-center gap-2 w-28">
                      <Switch
                        checked={user.hasAccess}
                        onCheckedChange={(checked) =>
                          handleToggleAccess(user, checked)
                        }
                        disabled={isToggling || (!user.hasAccess && !canToggleOn)}
                        aria-label={`Toggle access for ${user.name}`}
                      />
                      {user.hasAccess ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground" />
                      )}
                      {!canToggleOn && !user.hasAccess && (
                        <span className="text-xs text-red-400 whitespace-nowrap">
                          No seats
                        </span>
                      )}
                    </div>
                  </td>


                </tr>
              );
            })}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No members in this tenant yet.
          </div>
        )}
      </div>
    </div>
  );
}
