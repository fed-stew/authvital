import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  User as UserIcon,
  Trash2,
  Pencil,
  Building2,
  Mail,
  Key,
  Shield,
  Calendar,
  Phone,
} from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { AdminLayout, type BreadcrumbItem } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatsCard } from '@/components/ui/StatsCard';
import { EditUserModal } from './EditUserModal';

// =============================================================================
// TYPES
// =============================================================================

interface UserMembership {
  id: string;
  tenantId: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
  joinedAt: string | null;
  createdAt: string;
  rolesByApplication: Array<{
    appId: string;
    appName: string;
    roles: Array<{ id: string; name: string; slug: string }>;
  }>;
  totalRoles: number;
}

interface UserDetail {
  id: string;
  email: string;
  givenName?: string;
  familyName?: string;
  phone?: string;
  profile?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  memberships: UserMembership[];
  membershipCount: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const getUserName = (user: UserDetail) => {
  if (user.givenName && user.familyName) {
    return `${user.givenName} ${user.familyName}`;
  }
  if (user.givenName) return user.givenName;
  if (user.familyName) return user.familyName;
  return user.email || 'Unknown User';
};

const getUserInitials = (user: UserDetail) => {
  if (user.givenName && user.familyName) {
    return `${user.givenName[0]}${user.familyName[0]}`.toUpperCase();
  }
  if (user.givenName) return user.givenName[0].toUpperCase();
  if (user.email) return user.email[0].toUpperCase();
  return '?';
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return <Badge className="bg-green-500/20 text-green-50 border-green-500/50">Active</Badge>;
    case 'SUSPENDED':
      return <Badge className="bg-red-500/20 text-red-50 border-red-500/50">Suspended</Badge>;
    case 'INVITED':
      return <Badge className="bg-yellow-500/20 text-yellow-50 border-yellow-500/50">Invited</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

// =============================================================================
// OVERVIEW TAB
// =============================================================================

function OverviewTab({ user }: { user: UserDetail }) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Tenants"
          value={user.membershipCount}
          icon={<Building2 className="h-6 w-6 text-blue-400" />}
          subtitle="Organizations joined"
        />
        <StatsCard
          title="Active"
          value={user.memberships.filter(m => m.status === 'ACTIVE').length}
          icon={<Shield className="h-6 w-6 text-green-400" />}
          subtitle="Active memberships"
        />
        <StatsCard
          title="App Roles"
          value={user.memberships.reduce((sum, m) => sum + m.totalRoles, 0)}
          icon={<Key className="h-6 w-6 text-yellow-400" />}
          subtitle="Total app roles"
        />
        <StatsCard
          title="Total Roles"
          value={user.memberships.reduce((sum, m) => sum + m.totalRoles, 0)}
          icon={<Key className="h-6 w-6 text-purple-400" />}
          subtitle="Across all tenants"
        />
      </div>

      {/* User Information */}
      <Card>
        <CardHeader>
          <CardTitle>User Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="text-foreground">{user.email || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Given Name</p>
                <p className="text-foreground">{user.givenName || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UserIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Family Name</p>
                <p className="text-foreground">{user.familyName || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Phone</p>
                <p className="text-foreground">{user.phone || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="text-foreground">{formatDate(user.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                <p className="text-foreground">{formatDate(user.updatedAt)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User ID */}
      <Card>
        <CardHeader>
          <CardTitle>Technical Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <p className="text-sm font-medium text-muted-foreground">User ID</p>
            <p className="text-sm text-foreground font-mono">{user.id}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// MEMBERSHIPS TAB
// =============================================================================

function MembershipsTab({ user }: { user: UserDetail }) {
  const navigate = useNavigate();

  if (user.memberships.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-lg font-medium text-foreground">No Memberships</p>
            <p className="mt-2 text-sm text-muted-foreground">
              This user is not a member of any tenants yet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Tenant Memberships</h2>
          <p className="text-sm text-muted-foreground">
            Organizations this user belongs to
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {user.memberships.map((membership) => (
          <Card
            key={membership.id}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(`/admin/tenants/${membership.tenantId}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/20">
                    <Building2 className="h-6 w-6 text-green-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{membership.tenant.name}</p>

                    </div>
                    <p className="text-sm text-muted-foreground font-mono">{membership.tenant.slug}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined: {membership.joinedAt ? formatDate(membership.joinedAt) : 'Pending'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {getStatusBadge(membership.status)}
                  <p className="text-xs text-muted-foreground">
                    {membership.totalRoles} role{membership.totalRoles !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Roles by Application */}
              {membership.rolesByApplication.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-xs font-medium text-muted-foreground mb-2">ROLES</p>
                  <div className="flex flex-wrap gap-2">
                    {membership.rolesByApplication.map((appRoles) => (
                      <div key={appRoles.appId} className="flex flex-wrap gap-1">
                        {appRoles.roles.map((role) => (
                          <Badge
                            key={role.id}
                            variant="outline"
                            className="text-xs"
                            title={`${role.name} (${appRoles.appName})`}
                          >
                            {role.name}
                          </Badge>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function UserDetailPage() {
  const { id: userId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [user, setUser] = React.useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState('overview');

  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [isPasswordResetModalOpen, setIsPasswordResetModalOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isSendingReset, setIsSendingReset] = React.useState(false);

  // Breadcrumbs
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Admin', href: '/admin' },
    { label: 'Users', href: '/admin/users' },
    { label: user ? getUserName(user) : 'Loading...' },
  ];

  // Fetch user data
  const loadUserData = React.useCallback(async () => {
    if (!userId) return;

    try {
      setIsLoading(true);
      const data = await superAdminApi.getUserDetail(userId);
      setUser(data);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load user details';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
      navigate('/admin/users');
    } finally {
      setIsLoading(false);
    }
  }, [userId, navigate, toast]);

  React.useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Handle delete user
  const handleDeleteUser = async () => {
    if (!userId) return;

    try {
      setIsDeleting(true);
      await superAdminApi.deleteUser(userId);

      toast({
        variant: 'success',
        title: 'Success',
        message: 'User deleted successfully',
      });

      navigate('/admin/users');
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete user';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
      setIsDeleteModalOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle password reset
  const handleSendPasswordReset = async () => {
    if (!userId) return;

    try {
      setIsSendingReset(true);
      const result = await superAdminApi.sendPasswordReset(userId);

      toast({
        variant: 'success',
        title: 'Success',
        message: result.message || 'Password reset email sent',
      });

      setIsPasswordResetModalOpen(false);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to send password reset';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  // Handle edit success
  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    loadUserData();
  };

  // Loading state
  if (isLoading) {
    return (
      <AdminLayout title="User Details">
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading user details...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // User not found
  if (!user) {
    return (
      <AdminLayout title="User Details">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-muted-foreground">User not found</p>
            <Button variant="outline" onClick={() => navigate('/admin/users')} className="mt-4">
              Back to Users
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="User Details" breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/users')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Button>

        {/* User Header Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                {getUserInitials(user)}
              </div>

              <div className="space-y-1">
                <CardTitle>{getUserName(user)}</CardTitle>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPasswordResetModalOpen(true)}
              >
                <Key className="mr-2 h-4 w-4" />
                Reset Password
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditModalOpen(true)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsDeleteModalOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Tabs Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="memberships">
              Memberships ({user.membershipCount})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <OverviewTab user={user} />
          </TabsContent>
          <TabsContent value="memberships">
            <MembershipsTab user={user} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit User Modal */}
      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={handleEditSuccess}
        user={user}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete User"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete User'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to delete this user? This action cannot be undone and will remove all associated data.
          </p>
          <div className="rounded-md border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-foreground">{getUserName(user)}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </Modal>

      {/* Password Reset Confirmation Modal */}
      <Modal
        isOpen={isPasswordResetModalOpen}
        onClose={() => setIsPasswordResetModalOpen(false)}
        title="Send Password Reset"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setIsPasswordResetModalOpen(false)}
              disabled={isSendingReset}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendPasswordReset}
              disabled={isSendingReset}
            >
              {isSendingReset ? 'Sending...' : 'Send Reset Email'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            This will send a password reset email to the user. The reset link will expire in 24 hours.
          </p>
          <div className="rounded-md border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-foreground">{getUserName(user)}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  );
}
