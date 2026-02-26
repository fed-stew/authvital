import * as React from 'react';
import { Building2 } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  slug: string;
  ownerEmail: string;
}

interface FormErrors {
  name?: string;
  slug?: string;
  ownerEmail?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CreateTenantModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateTenantModalProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = React.useState<FormData>({
    name: '',
    slug: '',
    ownerEmail: '',
  });
  
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setFormData({ name: '', slug: '', ownerEmail: '' });
      setErrors({});
    }
  }, [isOpen]);

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field as keyof FormErrors];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors: FormErrors = {};
    
    if (!formData.name) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.slug) {
      newErrors.slug = 'Slug is required';
    } else if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(formData.slug)) {
      newErrors.slug = 'Slug must be lowercase letters, numbers, and hyphens';
    }
    
    if (formData.ownerEmail && !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(formData.ownerEmail)) {
      newErrors.ownerEmail = 'Invalid email format';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      await superAdminApi.createTenant(
        formData.name,
        formData.slug,
        formData.ownerEmail || undefined
      );
      
      onSuccess();
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to create tenant';
      
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    handleChange('name')(e);
    
    // Auto-generate slug only if slug hasn't been manually edited
    if (!formData.slug || formData.slug === generateSlug(formData.name)) {
      setFormData((prev) => ({ ...prev, slug: generateSlug(name) }));
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Tenant"
      size="md"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Tenant'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Icon and Description */}
        <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              New Tenant
            </p>
            <p className="text-xs text-muted-foreground">
              Create a new tenant (organization)
            </p>
          </div>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium text-foreground">
            Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="name"
            type="text"
            placeholder="Acme Corporation"
            value={formData.name}
            onChange={handleNameChange}
            disabled={isSubmitting}
            autoComplete="organization"
            className={errors.name ? 'border-destructive' : ''}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name}</p>
          )}
        </div>

        {/* Slug */}
        <div className="space-y-2">
          <label htmlFor="slug" className="text-sm font-medium text-foreground">
            Slug <span className="text-destructive">*</span>
          </label>
          <Input
            id="slug"
            type="text"
            placeholder="acme-corp"
            value={formData.slug}
            onChange={handleChange('slug')}
            disabled={isSubmitting}
            autoComplete="off"
            className={errors.slug ? 'border-destructive' : ''}
          />
          {errors.slug && (
            <p className="text-sm text-destructive">{errors.slug}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Used as a subdomain and must be unique
          </p>
        </div>

        {/* Owner Email */}
        <div className="space-y-2">
          <label htmlFor="ownerEmail" className="text-sm font-medium text-foreground">
            Owner Email (optional)
          </label>
          <Input
            id="ownerEmail"
            type="email"
            placeholder="admin@example.com"
            value={formData.ownerEmail}
            onChange={handleChange('ownerEmail')}
            disabled={isSubmitting}
            autoComplete="email"
            className={errors.ownerEmail ? 'border-destructive' : ''}
          />
          {errors.ownerEmail && (
            <p className="text-sm text-destructive">{errors.ownerEmail}</p>
          )}
          <p className="text-xs text-muted-foreground">
            If provided, the owner will be created and added as a member
          </p>
        </div>
      </form>
    </Modal>
  );
}
