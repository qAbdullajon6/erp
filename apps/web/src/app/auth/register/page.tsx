"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isApiEnabled } from "@/lib/api-client";
import { useApiSession } from "@/lib/api-session";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validateRegisterForm,
  hasErrors,
  type RegisterFormErrors,
} from "@/lib/auth-validation";

function ErrorNotice({ message }: { message: string }) {
  const isConnectionError = message.startsWith("Could not reach the API");
  const Icon = isConnectionError ? WifiOff : AlertTriangle;
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export default function RegisterPage() {
  const router = useRouter();
  const { register, status, errorMessage } = useApiSession();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [organizationName, setOrganizationName] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<RegisterFormErrors>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errors = validateRegisterForm({
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      organizationName,
    });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    try {
      await register(
        { firstName, lastName, email, password, organizationName },
        true, // registering implies remember-me: the user just created this session
      );
      router.replace("/customers");
    } catch {
      // surfaced via errorMessage below
    }
  }

  const apiDisabled = !isApiEnabled();

  return (
    <Card className="w-full max-w-lg">
      <CardContent className="space-y-5 py-7">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Create your organization</h1>
          <p className="text-sm text-muted-foreground">
            Registration creates one user account, one organization, and makes you its admin.
          </p>
        </div>

        {apiDisabled && (
          <p className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Connected Mode is disabled in this environment (demo mode). Set{" "}
            <code className="rounded bg-muted px-1">NEXT_PUBLIC_DATA_MODE=api</code> to register for
            real — see docs/CONNECTED_MODE_AUTH_UI.md.
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="register-first-name">First name</Label>
              <Input
                id="register-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <FieldError message={fieldErrors.firstName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="register-last-name">Last name</Label>
              <Input
                id="register-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
              <FieldError message={fieldErrors.lastName} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <FieldError message={fieldErrors.email} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="register-password">Password</Label>
              <Input
                id="register-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FieldError message={fieldErrors.password} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="register-confirm-password">Confirm password</Label>
              <Input
                id="register-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <FieldError message={fieldErrors.confirmPassword} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH} characters.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="register-org-name">Organization name</Label>
            <Input
              id="register-org-name"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="e.g. Acme Logistics"
            />
            <FieldError message={fieldErrors.organizationName} />
            <p className="text-xs text-muted-foreground">
              A URL-friendly slug is generated from this automatically. Timezone and default
              currency can be set afterward in Organization Settings.
            </p>
          </div>

          {errorMessage && <ErrorNotice message={errorMessage} />}

          <Button type="submit" disabled={status === "loading"} className="w-full gap-1.5">
            {status === "loading" && <Loader2 className="size-4 animate-spin" />}
            {status === "loading" ? "Creating your organization…" : "Create organization"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-foreground underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
