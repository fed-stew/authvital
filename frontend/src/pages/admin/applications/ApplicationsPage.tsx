import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, AppWindow } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Table, type Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { CreateAppModal } from './CreateAppModal';

// =============================================================================
// TYPES
// =============================================================================

interface ApplicationInfo {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ApplicationsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [applications, setApplications] = React.useState<ApplicationInfo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  
  // Fetch applications
  const loadApplications = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const apps = await superAdminApi.getAllApplications();
      setApplications(apps || []);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load applications';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  // Handle clicking on an app row
  const handleRowClick = (app: ApplicationInfo) => {
    navigate(`/admin/applications/${app.id}`);
  };

  // Handle successful app creation
  const handleAppCreated = () => {
    setIsCreateModalOpen(false);
    loadApplications(); // Refresh the list
    toast({
      variant: 'success',
      title: 'Success',
      message: 'Application created successfully',
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

  // Truncate client ID
  const truncateClientId = (clientId: string) => {
    if (clientId.length <= 16) return clientId;
    return clientId.substring(0, 8) + '...' + clientId.substring(clientId.length - 8);
  };

  // Table columns
  const columns: Column<ApplicationInfo>[] = [
    {
      header: 'Name',
      accessor: 'name',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20">
            <AppWindow className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <p className="font-medium text-foreground">{row.name}</p>
            {row.description && (
              <p className="text-sm text-muted-foreground truncate max-w-32">{row.description}</p>
            )}
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
      header: 'Status',
      accessor: 'isActive',
      cell: (value) => (
        <Badge
          className={
            value
              ? 'bg-green-500/20 text-green-50 border-green-500/50'
              : 'bg-gray-500/20 text-gray-50 border-gray-500/50'
          }
        >
          {value ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: 'Client ID',
      accessor: 'clientId',
      cell: (value) => (
        <code className="rounded bg-white/10 px-2 py-1 text-sm font-mono text-foreground">
          {truncateClientId(value)}
        </code>
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

  return (
    <AdminLayout
      title="Applications"
      actions={
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Application
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Applications Table */}
        <div className="rounded-lg border border-white/10 bg-card">
          <Table
            data={applications}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No applications found"
            onRowClick={handleRowClick}
          />
        </div>
      </div>

      {/* Create Application Modal */}
      <CreateAppModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleAppCreated}
      />
    </AdminLayout>
  );
}
