# FlowERP — Prospect Demo Checklist

This is a local/demo-only runbook. It documents seeded `.test` accounts with a
known password; never use them or this seed in production.

## Pre-demo

- Start PostgreSQL, apply migrations, then run `npm run seed:test-org` from the
  repository root.
- Start the API (`npm run dev:api`) and web app (`npm run dev:web`). The web app
  proxies API requests to `http://localhost:4000`.
- Sign in as `dispatcher@flowerp.test` with `FlowERP-Test-2026!` for the
  operations story. Use `driver@flowerp.test` with the same password only when
  showing the driver acceptance workspace. Use
  `ali@silkroadtraders.test` with the same password at `/portal/login` for the
  customer view.
- These credentials are **DEMO ONLY**. The test organization is
  `FlowERP Test Logistics` (`flowerp-test-logistics`).
- For the Fleet Tracking map, set `VITE_MAPBOX_ACCESS_TOKEN` to a public Mapbox
  token before starting the web app. `MAPBOX_SECRET_TOKEN` is only needed for
  API-powered directions/reverse geocoding; the core demo still works without
  it. GPS data is seeded locally, so a Traccar service is not required for this
  recorded flow.

## Demo — 3–5 minutes

1. **Today’s operation — `/app` (dispatcher).** Point out the live operations
   summary and the active Tashkent → Bukhara shipment. Say: “Dispatch, fleet,
   delivery risk, and financial indicators start from one operating view.”
   Expected: the dashboard has live operational data and dispatch links.

2. **Active multi-stop shipment — `/app/dispatches`, then open `DSP-000002`.**
   Say: “This priority shipment is accepted, in transit, and has a completed
   pickup, an intermediate Navoi stop, and final delivery in Bukhara.” Show
   Shohruh Toshmatov, Ford Transit `01A222BB`, the 87 km/h live state, and the
   Navoi intermediate-stop card. Expected: `IN TRANSIT`, accepted driver,
   three stops, and live vehicle state.

3. **Driver acceptance — sign in as `driver@flowerp.test`, open
   `/app/my-deliveries`, then select `DSP-000001`.** Say: “Drivers receive an
   action-focused job view and explicitly accept work before execution begins.”
   Expected: Bekzod Yusupov’s assigned Andijan → Tashkent delivery is waiting
   for acceptance and exposes the existing accept/decline workflow. Do not
   submit the action during a recorded pass; reset if you do.

4. **Route execution and vehicle position — sign back in as dispatcher; open
   `/app/routes`, open `RTE-0001`,
   then `/app/fleet-tracking`.** Say: “The route execution view puts the
   current stop and vehicle on the same operational plan; fleet tracking
   confirms the vehicle is moving near Navoi.” Expected: `RTE-0001` is `IN
   PROGRESS`, has Tashkent → Navoi → Bukhara stops, and the Fleet Tracking map
   shows Ford Transit `01A222BB` near Navoi. Select that vehicle in the existing
   Fleet Tracking list rather than typing an identifier.

5. **Customer visibility and ETA — log out, then `/portal/login`; open
   `ORD-<current year>-0004`.** Say: “The customer sees the same shipment in a
   customer-safe view: status, vehicle, current location, remaining distance,
   and ETA—without internal dispatcher data.” Expected: `DSP-000002`, `IN
   TRANSIT`, tracking/ETA, and the map action are visible.

6. **Completion, proof, and recovery — sign back in as dispatcher; open
   `DSP-000003`, then return to the dispatch board’s Operations Queue and open
   `ORD-<current year>-0008`.** Say: “Completed work retains delivery proof;
   exceptions do not disappear. A failed delivery is captured with its reason,
   then returned to the dispatcher as a re-dispatch decision.” Expected:
   `DSP-000003` is `DELIVERED` with one proof on file; `DSP-000004` shows
   `DELIVERY FAILED`, customer unavailable, and the queue marks the order
   `Re-dispatch needed` with the normal Assign workflow.

7. **Financial outcome — `/app/reports?tab=financial`.** Say: “The same
   operational records feed revenue, receivables, expense, and profitability
   views. The delivered Bukhara → Andijan shipment has a paid invoice and
   approved trip expenses.” Expected: financial report data is populated;
   `ORD-<current year>-0005` is the delivered, paid shipment.

## Direct handoffs

- Dashboard/dispatch list → dispatch detail: click `DSP-000002`.
- Dispatch detail → customer/order/fleet: use the existing customer, shipment,
  vehicle, and driver links.
- Route → dispatch/order: use the linked stop actions on `RTE-0001`.
- Portal orders → shipment detail: open `ORD-<current year>-0004` from the
  customer order list.
- Failed delivery → recovery: use the dispatch board’s Operations Queue entry
  for `ORD-<current year>-0008`; select **Assign** to start re-dispatch.

## Reset

Stop the API first. In PowerShell, from the repository root, run the following
against the **local demo database only**, then reseed:

```powershell
psql $env:DATABASE_URL -c "DELETE FROM organizations WHERE slug = 'flowerp-test-logistics';"
psql $env:DATABASE_URL -c "DELETE FROM users WHERE email LIKE '%@flowerp.test';"
npm run seed:test-org
```

The organization delete cascades through the seeded operational records,
including routes, dispatches, stops, proofs, invoices, and GPS positions. User
rows require the second statement because users can belong to more than one
organization.

## Troubleshooting

- **Map is blank:** confirm `VITE_MAPBOX_ACCESS_TOKEN` was present when the web
  app started; restart the web app after changing it. The route and portal
  views remain usable without a map token.
- **GPS is missing:** reset and reseed, then open `DSP-000002`; the matching
  vehicle is Ford Transit `01A222BB`. Check Fleet Tracking as dispatcher or
  admin—those roles can view telematics.
- **Portal cannot sign in or shows no shipment:** use the customer account
  above, clear the portal session/cookies, and confirm that the test
  organization was seeded successfully.
- **Staff session looks wrong after role switching:** sign out before logging
  in as the next demo persona. Do not mutate dispatch status during recording;
  reset instead.
