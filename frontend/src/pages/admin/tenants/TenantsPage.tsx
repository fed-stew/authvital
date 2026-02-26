import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Users } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Table, type Column } from '@/components/ui/Table';
import { SearchInput } from '@/components/ui/SearchInput';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { CreateTenantModal } from './CreateTenantModal';

// =============================================================================
// TYPES
// =============================================================================

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

interface TenantsResponse {
  tenants: TenantInfo[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TenantsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [tenants, setTenants] = React.useState<TenantInfo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  
  // Pagination state
  const [offset, setOffset] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const limit = 20;

  // Fetch tenants
  const loadTenants = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const response: TenantsResponse = await superAdminApi.getAllTenants({
        search,
        limit,
        offset,
      });
      setTenants(response.tenants || []);
      setTotal(response.total || 0);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load tenants';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [search, offset, toast]);

  // Load tenants on mount and when search/offset changes
  React.useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Handle search change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setOffset(0); // Reset to first page when searching
  };

  // Handle clicking on a tenant row
  const handleRowClick = (tenant: TenantInfo) => {
    navigate(`/admin/tenants/${tenant.id}`);
  };

  // Handle successful tenant creation
  const handleTenantCreated = () => {
    setIsCreateModalOpen(false);
    loadTenants(); // Refresh the list
    toast({
      variant: 'success',
      title: 'Success',
      message: 'Tenant created successfully',
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

  // Table columns
  const columns: Column<TenantInfo>[] = [
    {
      header: 'Name',
      accessor: 'name',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/20">
            <Building2 className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">{row.name}</p>
            <p className="text-sm text-muted-foreground">{row.slug}</p>
          </div>
        </div>
      ),
      sortable: true,
    },
    {
      header: 'Slug',
      accessor: 'slug',
      sortable: true,
    },
    {
      header: 'Members',
      accessor: 'memberCount',
      cell: (value) => (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-foreground">{value || 0}</span>
        </div>
      ),
      sortable: true,
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
      title="Tenants"
      actions={
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Tenant
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
              placeholder="Search tenants by name or slug..."
            />
          </div>
          <div className="text-sm text-muted-foreground">
            Total: {total} tenants
          </div>
        </div>

        {/* Tenants Table */}
        <div className="rounded-lg border border-white/10 bg-card">
          <Table
            data={tenants}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No tenants found"
            onRowClick={handleRowClick}
          />
        </div>

        {/* Pagination */}
        {!isLoading && total > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {Math.min(offset + 1, total)} to
              {Math.min(offset + limit, total)} of {total} tenants
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

      {/* Create Tenant Modal */}
      <CreateTenantModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleTenantCreated}
      />
    </AdminLayout>
  );
}
