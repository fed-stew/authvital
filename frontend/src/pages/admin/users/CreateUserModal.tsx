import * as React from 'react';
import { User as UserIcon } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  email: string;
  givenName: string;
  familyName: string;
  phone: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CreateUserModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateUserModalProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = React.useState<FormData>({
    email: '',
    givenName: '',
    familyName: '',
    phone: '',
    password: '',
  });
  
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setFormData({
        email: '',
        givenName: '',
        familyName: '',
        phone: '',
        password: '',
      });
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
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
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
      
      const userData = {
        email: formData.email,
        givenName: formData.givenName || undefined,
        familyName: formData.familyName || undefined,
        phone: formData.phone || undefined,
        password: formData.password,
      };
      
      await superAdminApi.createUser(userData);
      
      onSuccess();
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to create user';
      
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create User"
      size="md"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create User'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Icon and Description */}
        <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
            <UserIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              New User Information
            </p>
            <p className="text-xs text-muted-foreground">
              Enter the details for the new user below
            </p>
          </div>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email <span className="text-destructive">*</span>
          </label>
          <Input
            id="email"
            type="email"
            placeholder="user@example.com"
            value={formData.email}
            onChange={handleChange('email')}
            disabled={isSubmitting}
            autoComplete="email"
            className={errors.email ? 'border-destructive' : ''}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email}</p>
          )}
        </div>

        {/* Given Name */}
        <div className="space-y-2">
          <label htmlFor="givenName" className="text-sm font-medium text-foreground">
            Given Name
          </label>
          <Input
            id="givenName"
            type="text"
            placeholder="John"
            value={formData.givenName}
            onChange={handleChange('givenName')}
            disabled={isSubmitting}
            autoComplete="given-name"
          />
        </div>

        {/* Family Name */}
        <div className="space-y-2">
          <label htmlFor="familyName" className="text-sm font-medium text-foreground">
            Family Name
          </label>
          <Input
            id="familyName"
            type="text"
            placeholder="Doe"
            value={formData.familyName}
            onChange={handleChange('familyName')}
            disabled={isSubmitting}
            autoComplete="family-name"
          />
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <label htmlFor="phone" className="text-sm font-medium text-foreground">
            Phone
          </label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            value={formData.phone}
            onChange={handleChange('phone')}
            disabled={isSubmitting}
            autoComplete="tel"
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password <span className="text-destructive">*</span>
          </label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange('password')}
            disabled={isSubmitting}
            autoComplete="new-password"
            className={errors.password ? 'border-destructive' : ''}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password}</p>
          )}
          {!errors.password && (
            <p className="text-xs text-muted-foreground">
              Minimum 8 characters required
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
