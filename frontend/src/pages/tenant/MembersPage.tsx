import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Mail,
  MoreHorizontal,
  User as UserIcon,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Table, type Column } from '@/components/ui/Table';
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

/**
 * MembersPage - List and manage tenant members
 */
export function MembersPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { toast } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Load members
  useEffect(() => {
    loadMembers();
  }, [tenantId]);

  const loadMembers = async () => {
    try {
      setIsLoading(true);
      const data = await tenantApi.getMembers(tenantId!);
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
  };

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

  // Get user display name
  const getUserName = (member: Member) => {
    const { givenName, familyName, email } = member.user;
    if (givenName && familyName) return `${givenName} ${familyName}`;
    if (givenName) return givenName;
    return email;
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
            Active
          </Badge>
        );
      case 'SUSPENDED':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
            Suspended
          </Badge>
        );
      case 'INVITED':
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
            Invited
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };



  // Table columns
  const columns: Column<Member>[] = [
    {
      header: 'Member',
      accessor: 'user',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20">
            <UserIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">{getUserName(row)}</p>
            <p className="text-sm text-muted-foreground">{row.user.email}</p>
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
            {row.tenantRoles.map((role) => {
              let badgeClass = "bg-gray-500/20 text-gray-300 border-gray-500/50";
              if (role.slug === 'owner') {
                badgeClass = "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
              } else if (role.slug === 'admin') {
                badgeClass = "bg-blue-500/20 text-blue-400 border-blue-500/50";
              }
              return (
                <Badge key={role.id} className={badgeClass}>
                  {role.name}
                </Badge>
              );
            })}
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedMember(row)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      ),
      className: 'w-12',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Members</h1>
          <p className="text-muted-foreground">
            Manage who has access to your organization
          </p>
        </div>
        <Button onClick={() => setIsInviteModalOpen(true)} className="gap-2">
          <Mail className="h-4 w-4" />
          Invite User
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Members Table */}
      <div className="rounded-lg border border-white/10 bg-card">
        <Table
          data={filteredMembers}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No members found"
        />
      </div>

      {/* Invite User Modal */}
      <InviteUserModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={() => {
          setIsInviteModalOpen(false);
          loadMembers();
        }}
        tenantId={tenantId!}
      />

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal
          isOpen={!!selectedMember}
          onClose={() => setSelectedMember(null)}
          onUpdate={loadMembers}
          member={selectedMember}
          tenantId={tenantId!}
        />
      )}
    </div>
  );
}
