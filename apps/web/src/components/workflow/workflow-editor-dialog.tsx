'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useWorkflowTriggers, useWorkflowActions, useCreateWorkflow } from '@/hooks/use-workflows';
import type { WorkflowConfig, WorkflowCondition, WorkflowActionConfig } from '@/lib/api/workflows';
import { Loader2, Plus, Trash2, Zap } from 'lucide-react';

const COMPARISON_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'in', label: 'in (comma list)' },
  { value: 'not_in', label: 'not in (comma list)' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

function emptyCondition(): WorkflowCondition {
  return { field: '', operator: 'equals', value: '' };
}

function emptyAction(): WorkflowActionConfig {
  return { type: '', config: {} };
}

export function WorkflowEditorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [config, setConfig] = useState<WorkflowConfig>({
    trigger: { event: '' },
    conditions: { operator: 'AND', conditions: [] },
    actions: [],
  });

  const { data: triggers } = useWorkflowTriggers();
  const { data: actions } = useWorkflowActions();
  const createMutation = useCreateWorkflow();

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setActive(true);
      setConfig({ trigger: { event: triggers[0]?.type ?? '' }, conditions: { operator: 'AND', conditions: [] }, actions: [] });
    }
  }, [open, triggers]);

  const handleAddCondition = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      conditions: {
        ...prev.conditions!,
        conditions: [...prev.conditions!.conditions, emptyCondition()],
      },
    }));
  }, []);

  const handleConditionChange = useCallback((index: number, patch: Partial<WorkflowCondition>) => {
    setConfig((prev) => ({
      ...prev,
      conditions: {
        ...prev.conditions!,
        conditions: prev.conditions!.conditions.map((c, i) =>
          i === index ? { ...(c as WorkflowCondition), ...patch } : c,
        ),
      },
    }));
  }, []);

  const handleRemoveCondition = useCallback((index: number) => {
    setConfig((prev) => ({
      ...prev,
      conditions: {
        ...prev.conditions!,
        conditions: prev.conditions!.conditions.filter((_, i) => i !== index),
      },
    }));
  }, []);

  const handleAddAction = useCallback(() => {
    setConfig((prev) => ({ ...prev, actions: [...prev.actions, emptyAction()] }));
  }, []);

  const handleActionChange = useCallback((index: number, patch: Partial<WorkflowActionConfig>) => {
    setConfig((prev) => ({
      ...prev,
      actions: prev.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
  }, []);

  const handleRemoveAction = useCallback((index: number) => {
    setConfig((prev) => ({ ...prev, actions: prev.actions.filter((_, i) => i !== index) }));
  }, []);

  const handleSave = useCallback(() => {
    createMutation.mutate(
      { name, description, active, config },
      {
        onSuccess: () => {
          toast.success('Workflow created');
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create workflow'),
      },
    );
  }, [name, description, active, config, createMutation, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand" />
            Create Workflow
          </DialogTitle>
          <DialogDescription>
            Automate actions in response to events in your organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="wf-name">Name</Label>
            <Input
              id="wf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Notify on high-value order"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wf-desc">Description (optional)</Label>
            <Textarea
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this workflow do?"
              rows={2}
            />
          </div>

          {/* Trigger */}
          <div className="space-y-2 rounded-lg border border-brand/10 p-4">
            <Label className="text-sm font-semibold">When this happens (Trigger)</Label>
            <Select
              value={config.trigger.event}
              onValueChange={(v) => setConfig((prev) => ({ ...prev, trigger: { ...prev.trigger, event: v } }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a trigger event" />
              </SelectTrigger>
              <SelectContent>
                {triggers.map((t) => (
                  <SelectItem key={t.type} value={t.type}>
                    {t.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {config.trigger.event && (
              <p className="text-xs text-muted-foreground">
                {triggers.find((t) => t.type === config.trigger.event)?.description}
              </p>
            )}
          </div>

          {/* Conditions */}
          <div className="space-y-2 rounded-lg border border-brand/10 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Only if (Conditions) — optional</Label>
              <Button variant="outline" size="sm" onClick={handleAddCondition} className="gap-1">
                <Plus className="h-3 w-3" />
                Add condition
              </Button>
            </div>
            {config.conditions?.conditions.map((c, i) => {
              const cond = c as WorkflowCondition;
              return (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={cond.field}
                    onChange={(e) => handleConditionChange(i, { field: e.target.value })}
                    placeholder="field (e.g. payload.price)"
                    className="flex-1"
                  />
                  <Select
                    value={cond.operator}
                    onValueChange={(v) => handleConditionChange(i, { operator: v })}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPARISON_OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={String(cond.value ?? '')}
                    onChange={(e) => handleConditionChange(i, { value: e.target.value })}
                    placeholder="value"
                    className="w-32"
                  />
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveCondition(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {config.conditions?.conditions.length === 0 && (
              <p className="text-xs text-muted-foreground">Runs whenever the trigger fires.</p>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2 rounded-lg border border-brand/10 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Then do (Actions)</Label>
              <Button variant="outline" size="sm" onClick={handleAddAction} className="gap-1" disabled={actions.length === 0}>
                <Plus className="h-3 w-3" />
                Add action
              </Button>
            </div>
            {config.actions.map((a, i) => (
              <div key={i} className="space-y-2 rounded border border-brand/5 p-3">
                <div className="flex items-center gap-2">
                  <Select
                    value={a.type}
                    onValueChange={(v) => handleActionChange(i, { type: v, config: {} })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select an action" />
                    </SelectTrigger>
                    <SelectContent>
                      {actions.map((act) => (
                        <SelectItem key={act.type} value={act.type}>
                          {act.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveAction(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {a.type && (
                  <p className="text-xs text-muted-foreground">
                    {actions.find((act) => act.type === a.type)?.description}
                  </p>
                )}
                {a.type === 'send_notification' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={String(a.config.title ?? '')}
                      onChange={(e) => handleActionChange(i, { config: { ...a.config, title: e.target.value } })}
                      placeholder="Notification title"
                    />
                    <Input
                      value={String(a.config.message ?? '')}
                      onChange={(e) => handleActionChange(i, { config: { ...a.config, message: e.target.value } })}
                      placeholder="Message (use {{field}})"
                    />
                  </div>
                )}
                {a.type === 'send_email' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={String(a.config.to ?? '')}
                      onChange={(e) => handleActionChange(i, { config: { ...a.config, to: e.target.value } })}
                      placeholder="To (email or blank)"
                    />
                    <Input
                      value={String(a.config.subject ?? '')}
                      onChange={(e) => handleActionChange(i, { config: { ...a.config, subject: e.target.value } })}
                      placeholder="Subject"
                    />
                  </div>
                )}
                {(a.type === 'update_entity' || a.type === 'create_entity') && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={String(a.config.entityType ?? '')}
                      onChange={(e) => handleActionChange(i, { config: { ...a.config, entityType: e.target.value } })}
                      placeholder="Entity type (e.g. Order)"
                    />
                    <Input
                      value={String(a.config.entityId ?? '')}
                      onChange={(e) => handleActionChange(i, { config: { ...a.config, entityId: e.target.value } })}
                      placeholder="Entity ID (blank = from event)"
                    />
                  </div>
                )}
                {a.type === 'flag_for_review' && (
                  <Input
                    value={String(a.config.reason ?? '')}
                    onChange={(e) => handleActionChange(i, { config: { ...a.config, reason: e.target.value } })}
                    placeholder="Reason for review"
                  />
                )}
                {a.type === 'assign_driver' && (
                  <Input
                    value={String(a.config.driverId ?? '')}
                    onChange={(e) => handleActionChange(i, { config: { ...a.config, driverId: e.target.value } })}
                    placeholder="Driver ID (blank = auto-assign)"
                  />
                )}
                {a.type === 'webhook' && (
                  <Input
                    value={String(a.config.url ?? '')}
                    onChange={(e) => handleActionChange(i, { config: { ...a.config, url: e.target.value } })}
                    placeholder="https://example.com/webhook"
                  />
                )}
              </div>
            ))}
            {config.actions.length === 0 && (
              <p className="text-xs text-muted-foreground">Add at least one action to run.</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="wf-active" />
            <Label htmlFor="wf-active">Active</Label>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name || !config.trigger.event || config.actions.length === 0 || createMutation.isPending}
            className="gap-2 bg-gradient-brand text-brand-foreground hover:opacity-90"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Create Workflow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
