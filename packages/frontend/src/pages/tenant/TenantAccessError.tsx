import { useNavigate } from 'react-router-dom';
import { ShieldX, AlertCircle, Lock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface TenantAccessErrorProps {
  status: number;
  message: string;
}

/**
 * Error page shown when user can't access a tenant
 */
export function TenantAccessError({ status, message }: TenantAccessErrorProps) {
  const navigate = useNavigate();

  const getIcon = () => {
    switch (status) {
      case 403:
        return <Lock className="h-16 w-16 text-red-400" />;
      case 404:
        return <ShieldX className="h-16 w-16 text-yellow-400" />;
      default:
        return <AlertCircle className="h-16 w-16 text-orange-400" />;
    }
  };

  const getTitle = () => {
    switch (status) {
      case 403:
        return 'Access Denied';
      case 404:
        return 'Organization Not Found';
      case 401:
        return 'Authentication Required';
      default:
        return 'Something Went Wrong';
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mb-6 flex justify-center">{getIcon()}</div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">{getTitle()}</h1>
        <p className="mb-6 max-w-md text-muted-foreground">{message}</p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </div>
    </div>
  );
}
