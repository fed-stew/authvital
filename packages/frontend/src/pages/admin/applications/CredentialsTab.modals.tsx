import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { CredentialForm, type CredentialFormState } from './CredentialForm';

// =============================================================================
// CredentialFormModal -- shared add/edit shell around <CredentialForm/>
// =============================================================================
// Add and edit differ only by title, submit labels and handlers, so a single
// component backs both (DRY).

interface CredentialFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  submittingLabel: string;
  isSubmitting: boolean;
  onSubmit: () => void;
  value: CredentialFormState;
  onChange: (next: CredentialFormState) => void;
  error: string | null;
}

export function CredentialFormModal({
  isOpen,
  onClose,
  title,
  submitLabel,
  submittingLabel,
  isSubmitting,
  onSubmit,
  value,
  onChange,
  error,
}: CredentialFormModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      }
    >
      <CredentialForm
        value={value}
        onChange={onChange}
        disabled={isSubmitting}
        error={error}
      />
    </Modal>
  );
}

// =============================================================================
// RotatedSecretModal -- one-time plaintext reveal after a secret rotation
// =============================================================================

interface RotatedSecretModalProps {
  secret: string | null;
  onClose: () => void;
  onCopy: (value: string) => void;
}

export function RotatedSecretModal({ secret, onClose, onCopy }: RotatedSecretModalProps) {
  if (!secret) return null;
  return (
    <Modal isOpen title="New Client Secret" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3">
          <p className="text-sm text-yellow-300">
            <strong>Copy this now.</strong> The secret is shown once and cannot be retrieved again.
          </p>
        </div>
        <div className="flex gap-2">
          <Input value={secret} readOnly className="bg-white/5 font-mono text-sm" />
          <Button variant="outline" onClick={() => onCopy(secret)}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>I've copied it</Button>
        </div>
      </div>
    </Modal>
  );
}

// =============================================================================
// DeleteCredentialModal -- destructive confirm for removing a credential
// =============================================================================

interface DeleteCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
  clientType: string;
  clientId: string;
}

export function DeleteCredentialModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
  clientType,
  clientId,
}: DeleteCredentialModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete credential"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete credential'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Delete the <strong className="text-foreground">{clientType}</strong> credential
          <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-xs">{clientId}</code>?
        </p>
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          This immediately invalidates all of this credential's tokens (and cascades its auth codes, refresh
          tokens and M2M grants). This cannot be undone.
        </div>
      </div>
    </Modal>
  );
}
