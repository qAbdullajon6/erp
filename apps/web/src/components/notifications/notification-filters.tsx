'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { NotificationCategory, NotificationSeverity } from '@/lib/api/notifications';

interface NotificationFiltersProps {
  search: string;
  category?: NotificationCategory;
  severity?: NotificationSeverity;
  isRead?: boolean;
  isArchived: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value?: NotificationCategory) => void;
  onSeverityChange: (value?: NotificationSeverity) => void;
  onIsReadChange: (value?: boolean) => void;
  onIsArchivedChange: (value: boolean) => void;
}

export function NotificationFilters({
  search,
  category,
  severity,
  isRead,
  isArchived,
  onSearchChange,
  onCategoryChange,
  onSeverityChange,
  onIsReadChange,
  onIsArchivedChange,
}: NotificationFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search notifications..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select value={category || 'all'} onValueChange={(v) => onCategoryChange(v === 'all' ? undefined : v as NotificationCategory)}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          <SelectItem value="OPERATIONS">Operations</SelectItem>
          <SelectItem value="FINANCE">Finance</SelectItem>
          <SelectItem value="CUSTOMERS">Customers</SelectItem>
          <SelectItem value="FLEET">Fleet</SelectItem>
        </SelectContent>
      </Select>

      <Select value={severity || 'all'} onValueChange={(v) => onSeverityChange(v === 'all' ? undefined : v as NotificationSeverity)}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Severity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Severities</SelectItem>
          <SelectItem value="CRITICAL">Critical</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
          <SelectItem value="MEDIUM">Medium</SelectItem>
          <SelectItem value="LOW">Low</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={isRead === undefined ? 'all' : isRead ? 'read' : 'unread'}
        onValueChange={(v) => onIsReadChange(v === 'all' ? undefined : v === 'read')}
      >
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="unread">Unread</SelectItem>
          <SelectItem value="read">Read</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant={isArchived ? 'default' : 'outline'}
        size="sm"
        onClick={() => onIsArchivedChange(!isArchived)}
      >
        {isArchived ? 'Show Active' : 'Show Archived'}
      </Button>
    </div>
  );
}
