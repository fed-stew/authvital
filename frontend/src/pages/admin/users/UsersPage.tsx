import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Table, type Column } from '@/components/ui/Table';
import { SearchInput } from '@/components/ui/SearchInput';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { CreateUserModal } from './CreateUserModal';

// =============================================================================
// TYPES
// =============================================================================

interface UserInfo {
  id: string;
  email: string;
  givenName?: string;
  familyName?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
  // Add other fields as needed based on API response
  [key: string]: any;
}

interface UsersResponse {
  users: UserInfo[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function UsersPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [users, setUsers] = React.useState<UserInfo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  
  // Pagination state
  const [offset, setOffset] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const limit = 20;

  // Fetch users
  const loadUsers = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const response: UsersResponse = await superAdminApi.getAllUsers({
        search,
        limit,
        offset,
      });
      setUsers(response.users || []);
      setTotal(response.total || 0);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load users';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [search, offset, toast]);

  // Load users on mount and when search/offset changes
  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Handle search change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setOffset(0); // Reset to first page when searching
  };

  // Handle clicking on a user row
  const handleRowClick = (user: UserInfo) => {
    navigate(`/admin/users/${user.id}`);
  };

  // Handle successful user creation
  const handleUserCreated = () => {
    setIsCreateModalOpen(false);
    loadUsers(); // Refresh the list
    toast({
      variant: 'success',
      title: 'Success',
      message: 'User created successfully',
    });
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Get user's full name
  const getUserName = (user: UserInfo) => {
    if (user.givenName && user.familyName) {
      return `${user.givenName} ${user.familyName}`;
    }
    return user.email;
  };

  // Table columns
  const columns: Column<UserInfo>[] = [
    {
      header: 'Name',
      accessor: 'givenName',
      cell: (_, row) => getUserName(row),
      sortable: true,
    },
    {
      header: 'Email',
      accessor: 'email',
      sortable: true,
    },
    {
      header: 'Status',
      accessor: 'id', // Using id as a placeholder
      cell: () => (
        <Badge className="bg-green-500/20 text-green-50 border-green-500/50">
          Active
        </Badge>
      ),
    },
    {
      header: 'Created',
      accessor: 'createdAt',
      cell: (value) => formatDate(value),
      sortable: true,
    },
    {
      header: 'Actions',
      accessor: 'id',
      cell: (_, row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleRowClick(row);
          }}
        >
          View
        </Button>
      ),
      className: 'text-right',
    },
  ];

  const hasNextPage = offset + limit < total;
  const hasPrevPage = offset > 0;

  return (
    <AdminLayout
      title="Users"
      actions={
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Create User
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Search Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={search}
              onChange={handleSearchChange}
              placeholder="Search users by name or email..."
            />
          </div>
          <div className="text-sm text-muted-foreground">
            Total: {total} users
          </div>
        </div>

        {/* Users Table */}
        <div className="rounded-lg border border-white/10 bg-card">
          <Table
            data={users}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No users found"
            onRowClick={handleRowClick}
          />
        </div>

        {/* Pagination */}
        {!isLoading && total > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {Math.min(offset + 1, total)} to
              {Math.min(offset + limit, total)} of {total} users
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
                disabled={!hasPrevPage}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset((prev) => prev + limit)}
                disabled={!hasNextPage}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleUserCreated}
      />
    </AdminLayout>
  );
}
