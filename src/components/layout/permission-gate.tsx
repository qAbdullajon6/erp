"use client";

import * as React from "react";
import { useRole } from "@/lib/role";
import { hasCapability, type Capability } from "@/lib/permissions";

export function PermissionGate({
  capability,
  fallback = null,
  children,
}: {
  capability: Capability;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { role } = useRole();
  if (!hasCapability(role, capability)) return <>{fallback}</>;
  return <>{children}</>;
}
