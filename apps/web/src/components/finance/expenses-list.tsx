import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useExpensesQuery,
  useApproveExpenseMutation,
  useRejectExpenseMutation,
  type ExpenseCategory,
  type ExpenseStatus,
} from '@/lib/api/expenses';
import { formatMoney } from '@/lib/format';
import { ExpenseCreateDialog } from './expense-create-dialog';

const STATUS_OPTIONS: ExpenseStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];
const CATEGORY_OPTIONS: ExpenseCategory[] = ['FUEL', 'TOLL', 'MAINTENANCE', 'DRIVER_ADVANCE', 'PARKING', 'INSURANCE', 'OTHER'];

function getStatusBadgeClass(status: ExpenseStatus) {
  switch (status) {
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800';
    case 'APPROVED':
      return 'bg-green-100 text-green-800';
    case 'REJECTED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function ExpensesList() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ExpenseStatus | ''>('');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Loading...' : isError ? 'Error loading expenses' : `${data?.meta.total ?? 0} expenses`}
        </p>
        <ExpenseCreateDialog />
      </div>

      <div className="grid gap-4 rounded-lg border border-brand/10 bg-surface p-4 sm:grid-cols-3">
        <div>
          <label className="text-sm font-medium text-foreground">Search</label>
          <Input
            placeholder="Expense number, description..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ExpenseStatus | '');
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
          <label className="text-sm font-medium text-foreground">Category</label>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ExpenseCategory | '');
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="p-6">
            <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load expenses'}
              <button onClick={() => refetch()} className="ml-2 font-semibold underline hover:no-underline">
                Retry
              </button>
            </div>
          </div>
        )}

        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No expenses found</p>
          </div>
        )}

        {!isLoading && (data?.items.length ?? 0) > 0 && (
          <div className="divide-y divide-brand/10">
            {data!.items.map((expense) => (
              <div key={expense.id} className="px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{expense.expenseNumber}</span>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClass(expense.status)}`}>
                        {expense.status}
                      </span>
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
                  {expense.status === 'PENDING' && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" onClick={() => handleApprove(expense.id)} disabled={approving}>
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
                {rejectingId === expense.id && (
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
        <div className="flex items-center justify-between rounded-lg border border-brand/10 bg-surface p-4">
          <div className="text-sm text-muted-foreground">
            Page {data!.meta.page} of {data!.meta.totalPages} ({data!.meta.total} total)
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} variant="outline" size="sm">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => setPage((p) => Math.min(data!.meta.totalPages, p + 1))}
              disabled={page === data!.meta.totalPages}
              variant="outline"
              size="sm"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
