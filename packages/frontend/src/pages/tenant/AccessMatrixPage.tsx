import * as React from 'react';
import { Link } from 'react-router-dom';
import { Grid3x3, Check, Minus, Loader2, ExternalLink } from 'lucide-react';
import { tenantApi } from '@/lib/api';
import { useTenant } from '@/contexts/TenantContext';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { SearchInput } from '@/components/ui/SearchInput';
import { useToast } from '@/components/ui/Toast';
import type { AccessMatrixResult } from '@/types';

const errMessage = (err: any, fallback: string) =>
  err?.response?.data?.message || err?.message || fallback;

/**
 * AccessMatrixPage - the members x apps access grid in one view.
 *
 * Read-only by design: per-cell management stays on AppUsersPage, so every app
 * column header (and every granted cell) links to that app's drill-down.
 * Rendered behind the app-access:view gate (route + nav).
 */
export function AccessMatrixPage() {
  const { tenantId } = useTenant();
  const { toast } = useToast();

  const [data, setData] = React.useState<AccessMatrixResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await tenantApi.getAppAccessMatrix(tenantId);
      setData(result);
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to load access matrix') });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filteredMembers = React.useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.members;
    return data.members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [data, search]);

  const apps = data?.apps ?? [];
  const appHref = (appId: string) => `/tenant/${tenantId}/applications/${appId}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Access matrix</h1>
        <p className="text-muted-foreground">
          Who can access which application, at a glance. Click an app to manage access.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-white/10">
          <div>
            <CardTitle className="text-lg">Members &times; applications</CardTitle>
            <CardDescription>Access, role, and license type per member per app.</CardDescription>
          </div>
          <div className="w-full max-w-xs">
            <SearchInput value={search} onChange={setSearch} placeholder="Search members..." />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Grid3x3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">No applications to map yet</p>
                <p className="text-sm text-muted-foreground">
                  Once your org has app subscriptions or access grants, they'll appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Member
                    </th>
                    {apps.map((app) => (
                      <th
                        key={app.appId}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                      >
                        <Link
                          to={appHref(app.appId)}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          title={`Manage ${app.appName} access`}
                        >
                          <span className="max-w-[10rem] truncate">{app.appName}</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => (
                    <tr key={member.userId} className="border-b border-white/5 hover:bg-white/5">
                      <td className="sticky left-0 z-10 bg-card px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </td>
                      {member.apps.map((cell) => (
                        <td key={cell.appId} className="px-4 py-3 align-top">
                          {cell.hasAccess ? (
                            <Link to={appHref(cell.appId)} className="group block">
                              <div className="flex items-center gap-1.5">
                                <Check className="h-4 w-4 text-green-400" />
                                {cell.role && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {cell.role}
                                  </Badge>
                                )}
                              </div>
                              {cell.licenseType && (
                                <span className="mt-1 block text-[11px] text-muted-foreground group-hover:text-foreground">
                                  {cell.licenseType}
                                </span>
                              )}
                            </Link>
                          ) : (
                            <Minus className="h-4 w-4 text-muted-foreground/40" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={apps.length + 1} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No members match "{search}".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
