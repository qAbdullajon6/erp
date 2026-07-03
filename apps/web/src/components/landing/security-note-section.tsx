import { ShieldCheck } from "lucide-react";

export function SecurityNoteSection() {
  return (
    <section className="border-t border-border/60 bg-muted/20 py-10">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-6">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Demo environment using local browser storage. Production deployments can use secure
          authentication and database infrastructure.
        </p>
      </div>
    </section>
  );
}
