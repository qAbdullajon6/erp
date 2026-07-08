import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects: async () => [
    // Redirect old routes to new /app/* routes
    { source: "/orders", destination: "/app/orders", permanent: true },
    { source: "/customers", destination: "/app/customers", permanent: true },
    { source: "/dispatch", destination: "/app/dispatch", permanent: true },
    { source: "/drivers", destination: "/app/drivers", permanent: true },
    { source: "/finance", destination: "/app/finance", permanent: true },
    { source: "/reports", destination: "/app/reports", permanent: true },
    { source: "/notifications", destination: "/app/notifications", permanent: true },
    { source: "/my-deliveries", destination: "/app/my-deliveries", permanent: true },
    { source: "/ai-assistant", destination: "/app/ai-assistant", permanent: true },
    { source: "/settings/organization", destination: "/app/settings/organization", permanent: true },
    { source: "/settings/members", destination: "/app/settings/members", permanent: true },
  ],
};

export default nextConfig;
