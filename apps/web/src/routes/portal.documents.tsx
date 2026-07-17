import { createFileRoute, Link } from "@tanstack/react-router";
import { usePortalDocuments } from "@/lib/api/portal-documents";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, FileSignature, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/portal/documents")({
  head: () => ({
    meta: [{ title: "Documents — Customer Portal" }],
  }),
  component: PortalDocumentsPage,
});

function PortalDocumentsPage() {
  const { data: documents, loading, error } = usePortalDocuments();

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Documents</h1>
          <p className="mt-1 text-muted-foreground">Access your delivery proofs and invoices.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Documents</h1>
        <p className="mt-1 text-muted-foreground">Access your delivery proofs and invoices.</p>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No documents available.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="transition-colors hover:bg-muted/20">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        doc.type === "POD"
                          ? "bg-success/10 text-success"
                          : "bg-brand/10 text-brand"
                      }`}
                    >
                      {doc.type === "POD" ? (
                        <FileSignature className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <Badge
                        variant={doc.type === "POD" ? "success" : "brand"}
                        className="mb-2"
                      >
                        {doc.type === "POD" ? "POD" : "Invoice"}
                      </Badge>
                      <p className="truncate text-sm font-medium text-foreground">
                        {doc.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(doc.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  {doc.type === "POD" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      asChild
                    >
                      <a href={doc.downloadUrl} download>
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      asChild
                    >
                      <Link
                        to="/portal/invoices/$invoiceId"
                        params={{ invoiceId: doc.entityId }}
                      >
                        <ArrowRight className="h-4 w-4" />
                        View Invoice
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
