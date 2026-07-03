import Link from "next/link";
import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/// Route/UI placeholder only — apps/api has no password-reset-token issuance
/// or consumption endpoint in this phase (that would need email delivery,
/// which doesn't exist yet either). Rendered regardless of any ?token=
/// query param; nothing here is wired to a backend call. See
/// docs/CONNECTED_MODE_AUTH_UI.md for why this was deliberately deferred.
export default function ResetPasswordPage() {
  return (
    <Card className="w-full max-w-md">
      <CardContent className="space-y-4 py-8 text-center">
        <Construction className="mx-auto size-6 text-muted-foreground" />
        <p className="text-sm font-medium">Password reset links aren&apos;t available yet</p>
        <p className="text-sm text-muted-foreground">
          This is a placeholder page for a future phase — apps/api does not yet issue or accept
          password-reset tokens (that requires real email delivery, which this local development
          environment doesn&apos;t have configured). Nothing on this page contacts the API.
        </p>
        <Link href="/auth/login" className="text-sm underline underline-offset-2">
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
