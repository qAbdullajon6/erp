import { useEffect, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/lib/api/auth';
import {
  useExpensesQuery,
  useApproveExpenseMutation,
  useRejectExpenseMutation,
  type ExpenseCategory,
  type ExpenseStatus,
} from '@/lib/api/expenses';
import type { MembershipRole } from '@/lib/api/organizations';
import { formatMoney } from '@/lib/format';
import { EXPENSE_APPROVE_ROLES, EXPENSE_WRITE_ROLES } from '@/lib/role-access';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/list-states';
import { PaginationBar } from '@/components/shared/pagination-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ExpenseCreateDialog } from './expense-create-dialog';

const STATUS_OPTIONS: ExpenseStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];
const CATEGORY_OPTIONS: ExpenseCategory[] = ['FUEL', 'TOLL', 'MAINTENANCE', 'DRIVER_ADVANCE', 'PARKING', 'INSURANCE', 'OTHER'];

export function ExpensesList() {
  const navigate = useNavigate({ from: '/app/finance' });
  const searchState = useSearch({ from: '/app/finance' });
  const page = searchState.expensePage || 1;
  const search = searchState.expenseSearch || '';
  const status = (searchState.expenseStatus || '') as ExpenseStatus | '';
  const category = (searchState.expenseCategory || '') as ExpenseCategory | '';
  const [localSearch, setLocalSearch] = useState(search);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approveId, setApproveId] = useState<string | null>(null);
  const { data: currentUser } = useCurrentUser();
  const role = currentUser?.membership.role as MembershipRole | undefined;
  const canWrite = Boolean(role && EXPENSE_WRITE_ROLES.includes(role));
  const canApprove = Boolean(role && EXPENSE_APPROVE_ROLES.includes(role));

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const debouncedSearch = useDebouncedValue(localSearch, 300);
  useEffect(() => {
    if (debouncedSearch === search) return;
    void navigate({
      to: '/app/finance',
      search: (prev) => ({ ...prev, expensePage: undefined, expenseSearch: debouncedSearch || undefined }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const setStatus = (next: ExpenseStatus | '') => {
    void navigate({
      to: '/app/finance',
      search: (prev) => ({ ...prev, expensePage: undefined, expenseStatus: next || undefined }),
    });
  };

  const setCategory = (next: ExpenseCategory | '') => {
    void navigate({
      to: '/app/finance',
      search: (prev) => ({ ...prev, expensePage: undefined, expenseCategory: next || undefined }),
    });
  };

  const setPage = (next: number) => {
    void navigate({
      to: '/app/finance',
      search: (prev) => ({ ...prev, expensePage: next === 1 ? undefined : next }),
    });
  };

  const { data, isLoading, isError, error, refetch } = useExpensesQuery({
    page,
    limit: 20,
    search: search || undefined,
    status: status || undefined,
    category: category || undefined,
  });

  const { mutateAsync: approve, isPending: approving } = useApproveExpenseMutation();
  const { mutateAsync: reject, isPending: rejecting } = useRejectExpenseMutation();

  const handleApprove = async (id: string) => {
    try {
      await approve(id);
      toast.success('Expense approved');
      setApproveId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve expense');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await reject({ id, rejectionReason: rejectionReason || undefined });
      toast.success('Expense rejected');
      setRejectingId(null);
      setRejectionReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject expense');
    }
  };

  const selectFocus =
    'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Loading...' : isError ? 'Error loading expenses' : `${data?.meta.total ?? 0} expenses`}
        </p>
        {canWrite && <ExpenseCreateDialog />}
      </div>

      <div className="grid gap-4 rounded-lg border border-brand/10 bg-surface p-4 sm:grid-cols-3">
        <div>
          <label htmlFor="expense-search" className="text-sm font-medium text-foreground">Search</label>
          <Input
            id="expense-search"
            placeholder="Expense number, description..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="expense-status" className="text-sm font-medium text-foreground">Status</label>
          <select
            id="expense-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ExpenseStatus | '')}
            className={selectFocus}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="expense-category" className="text-sm font-medium text-foreground">Category</label>
          <select
            id="expense-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}
            className={selectFocus}
          >
            <option value="">All Categories</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {isLoading && <LoadingState label="Loading expenses..." />}

        {isError && !isLoading && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load expenses'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <EmptyState title="No expenses found" description="Try adjusting search or filters." />
        )}

        {!isLoading && (data?.items.length ?? 0) > 0 && (
          <div className="divide-y divide-brand/10">
            {data!.items.map((expense) => (
              <div key={expense.id} className="px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{expense.expenseNumber}</span>
                      <StatusBadge status={expense.status} />
                      <span className="text-xs text-muted-foreground">{expense.category.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{expense.description}</p>
                    {expense.status === 'REJECTED' && expense.rejectionReason && (
                      <p className="mt-1 text-xs text-destructive">Reason: {expense.rejectionReason}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold text-foreground">
                      {formatMoney(expense.amount, expense.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">{new Date(expense.expenseDate).toLocaleDateString()}</div>
                  </div>
                  {canApprove && expense.status === 'PENDING' && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" onClick={() => setApproveId(expense.id)} disabled={approving}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectingId(rejectingId === expense.id ? null : expense.id);
                          setRejectionReason('');
                        }}
                        disabled={rejecting}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
                {canApprove && rejectingId === expense.id && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-background/60 p-3">
                    <Input
                      placeholder="Rejection reason (optional)"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="flex-1"
                    />
                    <Button size="sm" variant="destructive" onClick={() => handleReject(expense.id)} disabled={rejecting}>
                      {rejecting ? 'Rejecting...' : 'Confirm'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectingId(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!isLoading && (data?.items.length ?? 0) > 0 && (data?.meta.totalPages ?? 1) > 1 && (
        <PaginationBar
          page={data!.meta.page}
          totalPages={data!.meta.totalPages}
          total={data!.meta.total}
          onPageChange={setPage}
        />
      )}

      <ConfirmDialog
        open={!!approveId}
        onOpenChange={(open) => !open && setApproveId(null)}
        title="Approve this expense?"
        description="Approved expenses are locked for payment processing."
        confirmLabel={approving ? 'Approving...' : 'Approve'}
        onConfirm={() => {
          if (approveId) void handleApprove(approveId);
        }}
      />
    </div>
  );
}
