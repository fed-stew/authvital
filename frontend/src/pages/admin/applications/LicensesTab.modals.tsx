import * as React from 'react';
import { Input } from '@/components/ui/Input';
import { Dropdown } from '@/components/ui/Dropdown';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type {
  LicenseType,
  LicenseFormData,
} from './LicensesTab.types';
import { statusOptions, availableFeatures } from './LicensesTab.types';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const generateSlug = (name: string) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

// =============================================================================
// PROPS
// =============================================================================

interface LicenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  formData: LicenseFormData;
  onChange: (field: string, value: any) => void;
  onFeatureToggle: (key: string, checked: boolean) => void;
  isSubmitting: boolean;
  title: string;
  submitLabel: string;
  statusOptions: typeof statusOptions;
  availableFeatures: typeof availableFeatures;
  onNameChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// =============================================================================
// LICENSE FORM MODAL COMPONENT
// =============================================================================

export function LicenseFormModal({
  isOpen,
  onClose,
  onSubmit,
  formData,
  onChange,
  onFeatureToggle,
  isSubmitting,
  title,
  submitLabel,
  statusOptions,
  availableFeatures,
  onNameChange,
}: LicenseFormModalProps) {
  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(field, e.target.value);
  };

  const handleStatusChange = (value: string) => {
    onChange('status', value);
  };

  const handleNameChangeHandler = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const name = e.target.value;
    if (onNameChange) {
      onNameChange(e);
    } else {
      handleChange('name')(e);
    }
    
    // Auto-generate slug only if slug hasn't been manually edited
    if (!formData.slug || formData.slug === generateSlug(formData.name)) {
      onChange('slug', generateSlug(name));
    } else if (onNameChange) {
      onNameChange(e);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : submitLabel}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-foreground">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="name"
              type="text"
              placeholder="Basic Plan"
              value={formData.name}
              onChange={handleNameChangeHandler}
              disabled={isSubmitting}
              required
              className="bg-card"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="slug" className="text-sm font-medium text-foreground">
              Slug <span className="text-destructive">*</span>
            </label>
            <Input
              id="slug"
              type="text"
              placeholder="basic-plan"
              value={formData.slug}
              onChange={handleChange('slug')}
              disabled={isSubmitting}
              required
              className="bg-card"
            />
          </div>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="status" className="text-sm font-medium text-foreground">
              Status <span className="text-destructive">*</span>
            </label>
            <Dropdown
              id="status"
              options={statusOptions}
              value={formData.status}
              onChange={handleStatusChange}
              placeholder="Select status"
              className="bg-card"
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="displayOrder" className="text-sm font-medium text-foreground">
              Display Order
            </label>
            <Input
              id="displayOrder"
              type="number"
              min="0"
              value={formData.displayOrder}
              onChange={(e) => onChange('displayOrder', parseInt(e.target.value) || 0)}
              disabled={isSubmitting}
              className="bg-card"
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <label htmlFor="description" className="text-sm font-medium text-foreground">
            Description
          </label>
          <Input
            id="description"
            type="text"
            placeholder="Basic license with essential features"
            value={formData.description}
            onChange={handleChange('description')}
            disabled={isSubmitting}
            className="bg-card"
          />
        </div>
        
        <div className="space-y-3">
          <label className="text-sm font-medium text-foreground">Features</label>
          <div className="grid gap-3 md:grid-cols-2">
            {availableFeatures.map((feature) => (
              <div key={feature.key} className="flex items-center gap-3">
                <Checkbox
                  id={`feature-${feature.key}`}
                  checked={formData.features[feature.key] || false}
                  onCheckedChange={(checked) => onFeatureToggle(feature.key, checked as boolean)}
                  disabled={isSubmitting}
                />
                <label
                  htmlFor={`feature-${feature.key}`}
                  className="text-sm text-foreground cursor-pointer"
                >
                  {feature.label}
                </label>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// ARCHIVE CONFIRMATION MODAL
// =============================================================================

interface ArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  licenseType: LicenseType | null;
}

export function ArchiveModal({
  isOpen,
  onClose,
  onConfirm,
  licenseType,
}: ArchiveModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Archive License Type"
      size="sm"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Archive License Type
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-muted-foreground">
          Are you sure you want to archive this license type? Existing subscriptions will not be affected, but new subscriptions cannot be created.
        </p>
        {licenseType && (
          <div className="rounded-md border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-foreground">{licenseType.name}</p>
            <p className="text-sm text-muted-foreground">{licenseType.slug}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
