import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TableDensity = "comfortable" | "compact";

export interface ColumnOption {
  key: string;
  label: string;
}

/// A new primitive, justified: every "professional data table" ask (Orders,
/// and every list screen after it) wants column visibility + density without
/// a full react-table adoption. Built from DropdownMenu + its existing
/// checkbox/radio item variants — no new dependency.
export function ViewOptions({
  columns,
  visibleColumns,
  onToggleColumn,
  density,
  onDensityChange,
}: {
  columns: ColumnOption[];
  visibleColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  density: TableDensity;
  onDensityChange: (density: TableDensity) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Density</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={density} onValueChange={(v) => onDensityChange(v as TableDensity)}>
          <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={visibleColumns.has(column.key)}
            onCheckedChange={() => onToggleColumn(column.key)}
            onSelect={(e) => e.preventDefault()}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
