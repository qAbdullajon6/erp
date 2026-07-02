import { AddExpenseDialog } from "@/components/finance/add-expense-dialog";
import { ExpenseTable } from "@/components/finance/expense-table";
import { ExpensesSummary } from "@/components/finance/expenses-summary";

export function ExpensesView() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AddExpenseDialog />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ExpenseTable />
        </div>
        <ExpensesSummary />
      </div>
    </div>
  );
}
