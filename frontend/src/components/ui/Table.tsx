import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, MoreHorizontal } from 'lucide-react';

export interface Column<T> {
  header: string;
  accessor: keyof T | string;
  cell?: (value: any, row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T, index: number) => void;
  className?: string;
}

function Table<T extends Record<string, any>>({
  data,
  columns,
  isLoading = false,
  emptyMessage = 'No data available',
  onRowClick,
  className,
}: TableProps<T>) {
  const [sortConfig, setSortConfig] = React.useState<{
    key: string | null;
    direction: 'asc' | 'desc';
  }>({ key: null, direction: 'asc' });

  const sortedData = React.useMemo(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      if (aValue === bValue) return 0;

      const comparison = aValue < bValue ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, sortConfig]);

  const handleSort = (accessor: string) => {
    const column = columns.find((col) => col.accessor === accessor);
    if (!column?.sortable) return;

    setSortConfig((prev) => {
      if (prev.key === accessor) {
        return {
          key: accessor,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key: accessor, direction: 'asc' };
    });
  };

  const getCellContent = (column: Column<T>, row: T, index: number) => {
    const value = column.accessor in row ? row[column.accessor as keyof T] : undefined;
    return column.cell ? column.cell(value, row, index) : value ?? '';
  };

  if (isLoading) {
    return (
      <div className="flex w-full items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading data...</p>
        </div>
      </div>
    );
  }

  if (sortedData.length === 0) {
    return (
      <div className="flex w-full items-center justify-center py-12">
        <div className="flex flex-col items-center gap-2">
          <MoreHorizontal className="h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto">
      <table className={cn('w-full border-collapse', className)}>
        <thead>
          <tr className="border-b border-white/10">
            {columns.map((column) => (
              <th
                key={String(column.accessor)}
                className={cn(
                  'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors',
                  column.sortable && 'cursor-pointer hover:text-foreground',
                  column.className
                )}
                onClick={() => column.sortable && handleSort(String(column.accessor))}
              >
                <div className="flex items-center gap-2">
                  {column.header}
                  {column.sortable && sortConfig.key === String(column.accessor) && (
                    <>
                      {sortConfig.direction === 'asc' ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cn(
                'border-b border-white/5 transition-colors',
                onRowClick && 'cursor-pointer hover:bg-white/5'
              )}
              onClick={() => onRowClick?.(row, rowIndex)}
            >
              {columns.map((column) => (
                <td
                  key={String(column.accessor)}
                  className={cn('px-4 py-3 text-sm text-foreground', column.className)}
                >
                  {getCellContent(column, row, rowIndex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { Table };
