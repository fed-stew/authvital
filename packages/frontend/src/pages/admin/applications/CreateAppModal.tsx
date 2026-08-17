import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Package } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { useToast } from '@/components/ui/Toast';
import type { CreateApplicationResponse } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Minimal container-only form. Creating an app is now decoupled from adding a
 * credential: we collect ONLY name + description, create an EMPTY container,
 * then drop the user on the app's Credentials tab to add the first credential.
 * No credential type cards, no licensing (defaults to FREE, edited later on the
 * Licenses tab), and no client-secret success screen -- there's no credential
 * to reveal yet.
 */
interface ContainerFormData {
  name: string;
  description: string;
}

const emptyContainer: ContainerFormData = { name: '', description: '' };

// =============================================================================
// COMPONENT
// =============================================================================

export function CreateAppModal({ isOpen, onClose, onSuccess }: CreateAppModalProps) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [container, setContainer] = React.useState<ContainerFormData>(emptyContainer);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset whenever the modal (re)opens.
  React.useEffect(() => {
    if (isOpen) {
      setContainer(emptyContainer);
      setNameError(null);
    }
  }, [isOpen]);

  const setField =
    (field: keyof ContainerFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setContainer((prev) => ({ ...prev, [field]: e.target.value }));
      if (field === 'name' && nameError) setNameError(null);
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!container.name.trim()) {
      setNameError('Name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      // Create ONLY the container -- no `client`, so the app starts with zero
      // credentials. Licensing defaults to FREE on the backend.
      const response: CreateApplicationResponse = await superAdminApi.createApplication({
        name: container.name.trim(),
        description: container.description || undefined,
      });

      onSuccess();
      onClose();
      // Land the user on the Credentials tab, where the guided empty state
      // walks them through adding their first credential.
      navigate(`/admin/applications/${response.id}?tab=credentials`);
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message:
          err?.response?.data?.message || err?.message || 'Failed to create application',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Application"
      size="lg"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Application'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-base font-semibold text-foreground">The application</h3>
            <p className="text-xs text-muted-foreground">
              An app is a container (a product). We'll create it empty -- next you'll add its first
              credential (a SPA for user login and/or a MACHINE credential for server-to-server calls)
              on the Credentials tab.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            type="text"
            placeholder="My Application"
            value={container.name}
            onChange={setField('name')}
            disabled={isSubmitting}
            className={nameError ? 'border-destructive' : ''}
            autoFocus
          />
          {nameError && <p className="text-sm text-destructive">{nameError}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            type="text"
            placeholder="Application description"
            value={container.description}
            onChange={setField('description')}
            disabled={isSubmitting}
            className="bg-card"
          />
        </div>
      </form>
    </Modal>
  );
}
