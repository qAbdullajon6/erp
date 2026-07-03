"use client";

import * as React from "react";
import { AlertTriangle, Loader2, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient, type ApiMember, type ApiMembershipRole } from "@/lib/api-client";
import { useApiSession } from "@/lib/api-session";

type LoadState = "loading" | "loaded" | "error";

const ROLE_OPTIONS: { value: ApiMembershipRole; label: string }[] = [
  { value: "ADMIN", label: "Admin/Owner" },
  { value: "OPERATIONS_MANAGER", label: "Operations Manager" },
  { value: "DISPATCHER", label: "Dispatcher" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "DRIVER", label: "Driver" },
  { value: "SALES_CRM_MANAGER", label: "Sales/CRM Manager" },
];

function AddMemberForm({ onAdded }: { onAdded: () => void }) {
  const { callApi } = useApiSession();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<ApiMembershipRole>("DISPATCHER");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await callApi((token) => apiClient.addMember(token, { email, role }));
      setEmail("");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
      <p className="text-xs text-muted-foreground">
        Adds an <span className="font-medium">existing</span> FlowERP AI account to this
        organization by email. There is no email-invitation flow yet — if this person doesn&apos;t
        have an account, they need to register one first (see /auth/register) before you can add
        them here. No email is sent by this action.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="add-member-email" className="mb-1 block text-xs text-muted-foreground">
            Email
          </Label>
          <Input
            id="add-member-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-56"
            required
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as ApiMembershipRole)}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
          <UserPlus className="size-3.5" />
          {submitting ? "Adding…" : "Add member"}
        </Button>
        {error && <p className="w-full text-xs text-destructive">{error}</p>}
      </form>
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  onChanged,
}: {
  member: ApiMember;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const { callApi } = useApiSession();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleRoleChange(role: ApiMembershipRole) {
    setBusy(true);
    setError(null);
    try {
      await callApi((token) => apiClient.updateMember(token, member.id, { role }));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change role");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Remove ${member.user.firstName} ${member.user.lastName} from this organization?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callApi((token) => apiClient.removeMember(token, member.id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
      setBusy(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {member.user.firstName} {member.user.lastName}
        {isSelf && (
          <Badge variant="outline" className="ml-2 text-[10px]">
            You
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{member.user.email}</TableCell>
      <TableCell>
        <Select value={member.role} onValueChange={(v) => handleRoleChange(v as ApiMembershipRole)}>
          <SelectTrigger className="w-52" disabled={busy || member.status !== "ACTIVE"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </TableCell>
      <TableCell>
        <Badge variant="outline">{member.status}</Badge>
      </TableCell>
      <TableCell className="text-right">
        {member.status !== "REMOVED" && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={handleRemove}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Remove
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function MembersSettingsView() {
  const { callApi, session } = useApiSession();
  const [members, setMembers] = React.useState<ApiMember[]>([]);
  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadState("loading");
      setErrorMessage(null);
    });

    callApi((token) => apiClient.listMembers(token)).then(
      (result) => {
        if (cancelled) return;
        setMembers(result);
        setLoadState("loaded");
      },
      (error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load members");
        setLoadState("error");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [callApi, reloadToken]);

  const reload = () => setReloadToken((n) => n + 1);

  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <AddMemberForm onAdded={reload} />

        {loadState === "loading" && (
          <p className="flex items-center gap-1.5 py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading members…
          </p>
        )}

        {loadState === "error" && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle className="size-5 text-destructive" />
            <p className="text-sm text-destructive">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={reload} className="gap-1.5">
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        )}

        {loadState === "loaded" && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isSelf={member.id === session?.membership.id}
                  onChanged={reload}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
