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
import { describeError } from '@/lib/api/describe-error';
import { formatMoney } from '@/lib/format';
import { EXPENSE_APPROVE_ROLES, EXPENSE_WRITE_ROLES } from '@/lib/role-access';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { ErrorState, EmptyState, ListSkeleton } from '@/components/shared/list-states';
import { ListToolbar, FilterSelect } from '@/components/shared/list-toolbar';
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
      toast.error(describeError(err, 'Failed to approve expense'));
    }
  };

  const handleReject = async (id: string) => {
    try {
      await reject({ id, rejectionReason: rejectionReason || undefined });
      toast.success('Expense rejected');
      setRejectingId(null);
      setRejectionReason('');
    } catch (err) {
      toast.error(describeError(err, 'Failed to reject expense'));
    }
  };

  const rejectingExpense = data?.items.find((e) => e.id === rejectingId);
  const approveExpense = data?.items.find((e) => e.id === approveId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Loading...' : isError ? 'Error loading expenses' : `${data?.meta.total ?? 0} expenses`}
        </p>
        {canWrite && <ExpenseCreateDialog />}
      </div>

      <ListToolbar
        searchValue={localSearch}
        onSearchChange={setLocalSearch}
        searchPlaceholder="Expense number, description..."
      >
        <FilterSelect label="Status" value={status} onChange={(next) => setStatus(next as ExpenseStatus | '')}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Category"
          value={category}
          onChange={(next) => setCategory(next as ExpenseCategory | '')}
        >
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, ' ')}
            </option>
          ))}
        </FilterSelect>
      </ListToolbar>

      <div className="overflow-hidden rounded-lg border border-brand/10">
        {isLoading && <ListSkeleton rows={6} showAvatar={false} label="Loading expenses" />}

        {isError && !isLoading && (
          <ErrorState message={describeError(error, 'Failed to load expenses')} onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <EmptyState
            title={search || status || category ? 'No expenses match these filters' : 'No expenses yet'}
            description={
              search || status || category
                ? 'Clear the search box or widen the status and category filters.'
                : 'Fuel, tolls and driver advances logged against a trip show up here for approval.'
            }
          />
        )}

        {!isLoading && (data?.items.length ?? 0) > 0 && (
          <div className="divide-y divide-brand/10">
            {data!.items.map((expense) => (
              <div
                key={expense.id}
                // Stacked below sm: the identity line, the money and two action
                // buttons cannot share one row at 390px without the buttons
                // being squeezed to a few pixels wide.
                className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-foreground">{expense.expenseNumber}</span>
                    <StatusBadge status={expense.status} />
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {expense.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{expense.description}</p>
                  {expense.status === 'REJECTED' && expense.rejectionReason && (
                    <p className="mt-1 text-xs text-destructive">Reason: {expense.rejectionReason}</p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="sm:text-right">
                    <div className="font-mono text-sm font-semibold text-foreground">
                      {formatMoney(expense.amount, expense.currency)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(expense.expenseDate).toLocaleDateString()}
                    </div>
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
                          setRejectingId(expense.id);
                          setRejectionReason('');
                        }}
                        disabled={rejecting}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
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
        description={
          approveExpense
            ? `${approveExpense.expenseNumber} for ${formatMoney(approveExpense.amount, approveExpense.currency)} will be approved and locked for payment processing. Approval cannot be undone from this screen.`
            : 'Approved expenses are locked for payment processing.'
        }
        confirmLabel={approving ? 'Approving...' : 'Approve expense'}
        onConfirm={() => {
          if (approveId) void handleApprove(approveId);
        }}
      />

      {/* Rejection used to happen in an inline strip inside the row, where the
          only thing naming the expense was the row it had scrolled past. It is
          the destructive half of the pair, so it gets the same dialog as
          approval — stating which expense, for how much, and that the reason is
          shown back to whoever filed it. */}
      <ConfirmDialog
        open={!!rejectingId}
        onOpenChange={(open) => {
          if (!open) {
            setRejectingId(null);
            setRejectionReason('');
          }
        }}
        title="Reject this expense?"
        description={
          rejectingExpense
            ? `${rejectingExpense.expenseNumber} for ${formatMoney(rejectingExpense.amount, rejectingExpense.currency)} will be rejected. The person who filed it can correct and resubmit, so this is reversible by them, not by you.`
            : 'The person who filed this expense can correct and resubmit it.'
        }
        confirmLabel={rejecting ? 'Rejecting...' : 'Reject expense'}
        destructive
        onConfirm={() => {
          if (rejectingId) void handleReject(rejectingId);
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="expense-rejection-reason" className="text-sm font-medium text-foreground">
            Reason <span className="font-normal text-muted-foreground">(optional, shown to the filer)</span>
          </label>
          <Input
            id="expense-rejection-reason"
            placeholder="e.g. missing fuel receipt"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
