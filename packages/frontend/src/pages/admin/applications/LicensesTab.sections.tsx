import {
  Key,
  Users,
  Building2,
  ChevronDown,
  ChevronRight,
  Pencil,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import type { LicenseType, LicenseTypeStats } from './LicensesTab.types';

// =============================================================================
// BADGE HELPERS
// =============================================================================

export const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'ACTIVE': return 'bg-green-500/20 text-green-50 border-green-500/50';
    case 'DRAFT': return 'bg-yellow-500/20 text-yellow-50 border-yellow-500/50';
    case 'HIDDEN': return 'bg-gray-500/20 text-gray-50 border-gray-500/50';
    case 'ARCHIVED': return 'bg-red-500/20 text-red-50 border-red-500/50';
    default: return '';
  }
};

export const getSubscriptionStatusBadge = (status: string) => {
  switch (status) {
    case 'ACTIVE': return <Badge className="bg-green-500/20 text-green-50 border-green-500/50">Active</Badge>;
    case 'TRIALING': return <Badge className="bg-blue-500/20 text-blue-50 border-blue-500/50">Trial</Badge>;
    case 'PAST_DUE': return <Badge className="bg-orange-500/20 text-orange-50 border-orange-500/50">Past Due</Badge>;
    case 'CANCELED': return <Badge className="bg-gray-500/20 text-gray-50 border-gray-500/50">Canceled</Badge>;
    default: return <Badge>{status}</Badge>;
  }
};

// =============================================================================
// LICENSE TYPE CARD
// =============================================================================

interface LicenseTypeCardProps {
  licenseType: LicenseType;
  stats: LicenseTypeStats | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

export function LicenseTypeCard({
  licenseType,
  stats,
  isExpanded,
  onToggle,
  onEdit,
  onArchive,
}: LicenseTypeCardProps) {
  const hasTenants = stats && stats.tenants.length > 0;

  return (
                <Card key={licenseType.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {hasTenants ? (
                          <button
                            onClick={onToggle}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        ) : (
                          <div className="w-6" />
                        )}
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                          <Key className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-foreground">{licenseType.name}</h3>
                            <Badge className={getStatusBadgeVariant(licenseType.status)}>
                              {licenseType.status}
                            </Badge>
                            {licenseType.maxMembers && (
                              <Badge className="bg-white/10 text-muted-foreground border-white/20">
                                max {licenseType.maxMembers} members
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{licenseType.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-foreground font-medium">
                              {stats?.totalSubscriptions || 0}
                            </span>
                            <span className="text-muted-foreground">tenants</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-foreground font-medium">
                              {stats?.totalSeatsAssigned || 0} / {stats?.totalSeatsPurchased || 0}
                            </span>
                            <span className="text-muted-foreground">seats</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={onEdit}
                            title="Edit license type"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {licenseType.status !== 'ARCHIVED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={onArchive}
                              title="Archive license type"
                            >
                              <Archive className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    {licenseType.description && (
                      <p className="text-sm text-muted-foreground mt-2 ml-16">
                        {licenseType.description}
                      </p>
                    )}
                  </CardHeader>

                  {/* Expanded Tenant List */}
                  {isExpanded && stats && stats.tenants.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="ml-6 border-l-2 border-white/10 pl-6">
                        <h4 className="text-sm font-medium text-muted-foreground mb-3">
                          Subscriptions by Tenant
                        </h4>
                        <div className="rounded-lg border border-white/10 overflow-hidden">
                          <table className="w-full">
                            <thead className="bg-white/5">
                              <tr>
                                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Tenant</th>
                                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Status</th>
                                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Purchased</th>
                                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Assigned</th>
                                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Available</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                              {stats.tenants.map((tenant) => (
                                <tr key={tenant.tenantId} className="hover:bg-white/5">
                                  <td className="px-4 py-2">
                                    <span className="text-sm text-foreground">{tenant.tenantName}</span>
                                  </td>
                                  <td className="px-4 py-2">
                                    {getSubscriptionStatusBadge(tenant.status)}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className="text-sm text-foreground">{tenant.quantityPurchased}</span>
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className="text-sm text-foreground">{tenant.quantityAssigned}</span>
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className="text-sm text-muted-foreground">
                                      {tenant.quantityPurchased - tenant.quantityAssigned}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
  );
}
