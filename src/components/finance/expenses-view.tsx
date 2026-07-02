import { ExpenseList } from "@/components/finance/expense-list";
import { ExpensesSummary } from "@/components/finance/expenses-summary";

export function ExpensesView() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <ExpenseList />
      </div>
      <ExpensesSummary />
    </div>
  );
}
