import * as React from 'react';
import { superAdminApi } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

interface UserInfo {
  id: string;
  email: string;
  givenName?: string;
  familyName?: string;
  phone?: string;
}

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: UserInfo | null;
}

export function EditUserModal({ isOpen, onClose, onSuccess, user }: EditUserModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState({
    email: '',
    givenName: '',
    familyName: '',
    phone: '',
  });

  // Reset form when user changes
  React.useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        givenName: user.givenName || '',
        familyName: user.familyName || '',
        phone: user.phone || '',
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setIsSubmitting(true);
      await superAdminApi.updateUser(user.id, {
        email: formData.email || undefined,
        givenName: formData.givenName || undefined,
        familyName: formData.familyName || undefined,
        phone: formData.phone || undefined,
      });

      toast({
        variant: 'success',
        title: 'Success',
        message: 'User updated successfully',
      });

      onSuccess();
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update user';
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
      title='Edit User'
      size='md'
    >
      <form onSubmit={handleSubmit} className='space-y-4'>
        <div className='grid gap-4 md:grid-cols-2'>
          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>
              Given Name
            </label>
            <Input
              value={formData.givenName}
              onChange={(e) => setFormData({ ...formData, givenName: e.target.value })}
              placeholder='John'
            />
          </div>
          <div className='space-y-2'>
            <label className='text-sm font-medium text-foreground'>
              Family Name
            </label>
            <Input
              value={formData.familyName}
              onChange={(e) => setFormData({ ...formData, familyName: e.target.value })}
              placeholder='Doe'
            />
          </div>
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium text-foreground'>
            Email
          </label>
          <Input
            type='email'
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder='john@example.com'
          />
        </div>

        <div className='space-y-2'>
          <label className='text-sm font-medium text-foreground'>
            Phone
          </label>
          <Input
            type='tel'
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder='+1 (555) 123-4567'
          />
        </div>

        <div className='flex justify-end gap-2 pt-4'>
          <Button
            type='button'
            variant='outline'
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type='submit' disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
