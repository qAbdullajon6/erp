import { createFileRoute, Link } from "@tanstack/react-router";
import { usePortalOrder, usePortalOrderTimeline, usePortalOrderDeliveryProofs } from "@/lib/api/portal-orders";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, Clock } from "lucide-react";

export const Route = createFileRoute("/portal/orders/$orderId")({
  head: () => ({
    meta: [{ title: "Order Detail — Customer Portal" }],
  }),
  component: PortalOrderDetailPage,
});

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-warning/10 text-warning border-warning/20",
  ASSIGNED: "bg-brand/10 text-brand border-brand/20",
  PICKED_UP: "bg-brand/10 text-brand border-brand/20",
  IN_TRANSIT: "bg-brand/10 text-brand border-brand/20",
  DELIVERED: "bg-success/10 text-success border-success/20",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/20",
};

function PortalOrderDetailPage() {
  const { orderId } = Route.useParams();
  const { data: order, loading, error } = usePortalOrder(orderId);
  const { data: timeline } = usePortalOrderTimeline(orderId);
  const { data: proofsData } = usePortalOrderDeliveryProofs(orderId);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="text-sm text-destructive">{error || "Order not found."}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/portal/orders">Back to orders</Link>
        </Button>
      </div>
    );
  }

  const proofs = proofsData?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/portal/orders">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">{order.orderNumber}</h1>
          <p className="mt-1 text-muted-foreground">Order details and tracking</p>
        </div>
        <Badge className={STATUS_COLORS[order.status]} variant="outline">
          {order.status.replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pickup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Address:</span> {order.pickupAddress}</p>
            <p><span className="text-muted-foreground">City:</span> {order.pickupCity}</p>
            <p><span className="text-muted-foreground">Date:</span> {formatDate(order.pickupDate)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Address:</span> {order.deliveryAddress}</p>
            <p><span className="text-muted-foreground">City:</span> {order.deliveryCity}</p>
            <p><span className="text-muted-foreground">Date:</span> {formatDate(order.deliveryDate)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cargo Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Description:</span> {order.cargoDescription}</p>
          {order.notes && <p><span className="text-muted-foreground">Notes:</span> {order.notes}</p>}
          {order.deliveryNotes && (
            <p><span className="text-muted-foreground">Delivery Notes:</span> {order.deliveryNotes}</p>
          )}
        </CardContent>
      </Card>

      {timeline && timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-0">
              {timeline.map((entry, idx) => (
                <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {idx < timeline.length - 1 && (
                    <div className="absolute left-[11px] top-5 h-full w-px bg-border" />
                  )}
                  <div
                    className={`relative z-10 mt-1 h-[22px] w-[22px] shrink-0 rounded-full border-2 ${
                      idx === 0 ? "border-brand bg-brand/20" : "border-border bg-background"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {entry.status.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p>
                    {entry.note && (
                      <p className="mt-1 text-xs text-muted-foreground">{entry.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {proofs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Delivery Proofs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {proofs.map((proof) => (
                <div
                  key={proof.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {proof.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(proof.uploadedAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                  >
                    <a
                      href={`/api/customer-portal/orders/${orderId}/delivery-proof/${proof.id}/file`}
                      download
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
