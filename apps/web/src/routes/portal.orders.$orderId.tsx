import { createFileRoute, Link } from "@tanstack/react-router";
import {
  usePortalOrder,
  usePortalOrderTimeline,
  usePortalOrderTracking,
} from "@/lib/api/portal-orders";
import { formatDate, formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Clock, MapPin, Navigation, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/portal/orders/$orderId")({
  head: () => ({
    meta: [{ title: "Order Detail — Customer Portal" }],
  }),
  component: PortalOrderDetailPage,
});

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  PENDING: "bg-warning/10 text-warning border-warning/20",
  ASSIGNED: "bg-brand/10 text-brand border-brand/20",
  PICKED_UP: "bg-brand/10 text-brand border-brand/20",
  IN_TRANSIT: "bg-brand/10 text-brand border-brand/20",
  DELIVERED: "bg-success/10 text-success border-success/20",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/20",
};

const LIVE_STATUSES = new Set(["ASSIGNED", "PICKED_UP", "IN_TRANSIT"]);

function PortalOrderDetailPage() {
  const { orderId } = Route.useParams();
  const { data: order, loading, error, refetch } = usePortalOrder(orderId);
  const { data: timeline, isLoading: timelineLoading } = usePortalOrderTimeline(orderId);
  const trackingEnabled = Boolean(order && LIVE_STATUSES.has(order.status));
  const {
    data: tracking,
    isLoading: trackingLoading,
    isFetching: trackingFetching,
    refetch: refetchTracking,
  } = usePortalOrderTracking(orderId, trackingEnabled);

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
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
          <Button asChild variant="outline">
            <Link to="/portal/orders">Back to orders</Link>
          </Button>
        </div>
      </div>
    );
  }

  const mapUrl =
    tracking?.tracking != null
      ? `https://www.google.com/maps?q=${tracking.tracking.latitude},${tracking.tracking.longitude}`
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/portal/orders">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to orders</span>
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            {order.orderNumber}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Order details and shipment progress
          </p>
        </div>
        <Badge className={STATUS_COLORS[order.status]} variant="outline">
          {order.status.replace(/_/g, " ")}
        </Badge>
      </div>

      {trackingEnabled ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Navigation className="h-5 w-5" />
              Live shipment location
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => void refetchTracking()}
              disabled={trackingFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${trackingFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {trackingLoading ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : tracking?.tracking ? (
              <>
                <p className="text-foreground">
                  Vehicle last reported near{" "}
                  <span className="font-medium">
                    {tracking.tracking.latitude.toFixed(5)}, {tracking.tracking.longitude.toFixed(5)}
                  </span>
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {tracking.tracking.speedKph != null ? (
                    <span>Speed: {Math.round(tracking.tracking.speedKph)} km/h</span>
                  ) : null}
                  {tracking.tracking.movementState ? (
                    <span>State: {tracking.tracking.movementState.replace(/_/g, " ")}</span>
                  ) : null}
                  {tracking.tracking.lastUpdatedAt ? (
                    <span>Updated: {formatDateTime(tracking.tracking.lastUpdatedAt)}</span>
                  ) : null}
                </div>
                {mapUrl ? (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-brand/10 px-4 py-2 text-sm font-medium text-brand"
                  >
                    <MapPin className="h-4 w-4" />
                    Open location in Maps
                  </a>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">
                {tracking?.message ?? "Live tracking is not available for this shipment yet."}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pickup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Address:</span> {order.pickupAddress}
            </p>
            <p>
              <span className="text-muted-foreground">City:</span> {order.pickupCity}
            </p>
            <p>
              <span className="text-muted-foreground">Date:</span> {formatDate(order.pickupDate)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Address:</span> {order.deliveryAddress}
            </p>
            <p>
              <span className="text-muted-foreground">City:</span> {order.deliveryCity}
            </p>
            <p>
              <span className="text-muted-foreground">Date:</span> {formatDate(order.deliveryDate)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cargo details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Description:</span> {order.cargoDescription}
          </p>
          {order.notes ? (
            <p>
              <span className="text-muted-foreground">Notes:</span> {order.notes}
            </p>
          ) : null}
          {order.deliveryNotes ? (
            <p>
              <span className="text-muted-foreground">Delivery notes:</span> {order.deliveryNotes}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            Shipment timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timelineLoading ? (
            <Skeleton className="h-32 rounded-lg" />
          ) : timeline && timeline.length > 0 ? (
            <div className="relative space-y-0">
              {timeline.map((entry, idx) => (
                <div key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {idx < timeline.length - 1 ? (
                    <div className="absolute left-[11px] top-5 h-full w-px bg-border" />
                  ) : null}
                  <div
                    className={`relative z-10 mt-1 h-[22px] w-[22px] shrink-0 rounded-full border-2 ${
                      idx === timeline.length - 1
                        ? "border-brand bg-brand/20"
                        : "border-border bg-background"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {entry.status.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
                    {entry.note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{entry.note}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Status history will appear here as this shipment progresses.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
