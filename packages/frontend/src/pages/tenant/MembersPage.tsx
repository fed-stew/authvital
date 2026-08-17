import { useState, useEffect, useMemo, useCallback } from 'react';
import { Mail, MoreHorizontal, Search, Users, UserCheck } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Table, type Column } from '@/components/ui/Table';
import { StatsCard } from '@/components/ui/StatsCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { InviteUserModal } from './InviteUserModal';
import { MemberDetailModal } from './MemberDetailModal';
import { tenantApi } from '@/lib/api';

interface Member {
  id: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  joinedAt: string | null;
  user: {
    id: string | null;
    email: string;
    givenName?: string | null;
    familyName?: string | null;
  };
  tenantRoles: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  appAccess: Array<{
    appId: string;
    appName: string;
    roleName: string;
  }>;
  // Optional invitation details for INVITED status
  invitation?: {
    id: string;
    expiresAt: string;
    invitedBy?: {
      id: string;
      email: string;
      givenName?: string;
      familyName?: string;
    };
  };
}

const STATUS_META: Record<string, { variant: BadgeProps['variant']; label: string }> = {
  ACTIVE: { variant: 'success', label: 'Active' },
  SUSPENDED: { variant: 'destructive', label: 'Suspended' },
  INVITED: { variant: 'warning', label: 'Invited' },
};

const roleVariant = (slug: string): BadgeProps['variant'] =>
  slug === 'owner' ? 'warning' : slug === 'admin' ? 'default' : 'secondary';

/**
 * MembersPage - List and manage tenant members
 */
export function MembersPage() {
  const { tenantId, can } = useTenant();
  const { toast } = useToast();

  const canInvite = can('members:invite');
  const canManageRoles = can('members:manage-roles');
  const canRemove = can('members:remove');

  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await tenantApi.getMembers(tenantId);
      setMembers(data);
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.message || 'Failed to load members',
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  // Load members
  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery) return members;
    const query = searchQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.user.email.toLowerCase().includes(query) ||
        m.user.givenName?.toLowerCase().includes(query) ||
        m.user.familyName?.toLowerCase().includes(query)
    );
  }, [members, searchQuery]);

  const activeCount = members.filter((m) => m.status === 'ACTIVE').length;
  const pendingCount = members.filter((m) => m.status === 'INVITED').length;

  // Get user display name
  const getUserName = (member: Member) => {
    const { givenName, familyName, email } = member.user;
    if (givenName && familyName) return `${givenName} ${familyName}`;
    if (givenName) return givenName;
    return email;
  };

  const initials = (member: Member) => {
    const combined = `${member.user.givenName?.[0] ?? ''}${member.user.familyName?.[0] ?? ''}`.trim();
    return (combined || member.user.email[0] || '?').toUpperCase();
  };

  const getStatusBadge = (status: string) => {
    const meta = STATUS_META[status] ?? { variant: 'secondary' as const, label: status };
    return <Badge variant={meta.variant}>{meta.label}</Badge>;
  };

  // Table columns
  const columns: Column<Member>[] = [
    {
      header: 'Member',
      accessor: 'user',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {initials(row)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{getUserName(row)}</p>
            <p className="truncate text-sm text-muted-foreground">{row.user.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Role',
      accessor: 'tenantRoles',
      cell: (_, row) => {
        if (!row.tenantRoles || row.tenantRoles.length === 0) {
          return <span className="text-sm text-muted-foreground">No role</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {row.tenantRoles.map((role) => (
              <Badge key={role.id} variant={roleVariant(role.slug)}>
                {role.name}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      header: 'App Access',
      accessor: 'appAccess',
      cell: (_, row) => (
        <div className="flex flex-wrap gap-1">
          {row.appAccess.map((app) => (
            <Badge key={app.appId} variant="outline" className="text-xs">
              {app.appName}
            </Badge>
          ))}
          {row.appAccess.length === 0 && (
            <span className="text-sm text-muted-foreground">No access</span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (value) => getStatusBadge(value),
    },
    {
      header: '',
      accessor: 'id',
      cell: (_, row) => (
        <Button variant="ghost" size="sm" onClick={() => setSelectedMember(row)}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      ),
      className: 'w-12',
    },
  ];

  const showEmpty = !isLoading && filteredMembers.length === 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Members</h1>
          <p className="text-muted-foreground">
            Manage who has access to your organization.
          </p>
        </div>
        {canInvite && (
          <Button onClick={() => setIsInviteModalOpen(true)} className="gap-2">
            <Mail className="h-4 w-4" />
            Invite User
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard
          title="Total members"
          value={members.length}
          isLoading={isLoading}
          subtitle="in this organization"
          icon={<Users className="h-5 w-5 text-primary" />}
        />
        <StatsCard
          title="Active"
          value={activeCount}
          isLoading={isLoading}
          subtitle="with access today"
          icon={<UserCheck className="h-5 w-5 text-green-400" />}
        />
        <StatsCard
          title="Pending invites"
          value={pendingCount}
          isLoading={isLoading}
          subtitle="awaiting response"
          icon={<Mail className="h-5 w-5 text-yellow-400" />}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-white/10">
          <div>
            <CardTitle className="text-lg">All members</CardTitle>
            <CardDescription>People and pending invites in your organization.</CardDescription>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-card pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {searchQuery ? 'No members match your search' : 'No members yet'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {searchQuery
                    ? `Nothing matched "${searchQuery}".`
                    : 'Invite teammates to give them access to your organization.'}
                </p>
              </div>
              {!searchQuery && canInvite && (
                <Button onClick={() => setIsInviteModalOpen(true)} className="mt-1 gap-2">
                  <Mail className="h-4 w-4" />
                  Invite User
                </Button>
              )}
            </div>
          ) : (
            <Table data={filteredMembers} columns={columns} isLoading={isLoading} />
          )}
        </CardContent>
      </Card>

      {/* Invite User Modal */}
      {canInvite && (
        <InviteUserModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          onSuccess={() => {
            setIsInviteModalOpen(false);
            loadMembers();
          }}
          tenantId={tenantId}
        />
      )}

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal
          isOpen={!!selectedMember}
          onClose={() => setSelectedMember(null)}
          onUpdate={loadMembers}
          member={selectedMember}
          tenantId={tenantId}
          canManageRoles={canManageRoles}
          canRemove={canRemove}
        />
      )}
    </div>
  );
}
