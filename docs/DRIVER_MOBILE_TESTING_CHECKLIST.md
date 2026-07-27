# Driver Mobile App — Field Testing Checklist (Phase 4)

Procedure for the first real-world GPS test of the release APK
(`uz.flowerp.driver`, `app.json` version `1.0.0`) on a physical Android
device. Every step below requires a real device — none of this is
verifiable in Expo web preview or an emulator, because the thing under
test is exactly what emulators fake (real GPS hardware, real Doze/App
Standby, real OEM battery managers, real screen-lock behavior).

Run every section on at least one **stock Android** device (Pixel or
AOSP-close) and, if available, one **aggressive-OEM** device (Xiaomi/
Redmi/POCO on MIUI/HyperOS, Samsung, or Huawei) — OEM battery managers are
the single most common reason a GPS tracker silently stops working in the
field, and stock Android will not surface that class of bug.

Record: device model, Android version, build fingerprint (`Settings →
About phone → Build number`), and the result of every step. A failed step
blocks release — do not skip ahead and "fix later."

---

## 0. Pre-flight (before installing anything)

- [ ] `EXPO_PUBLIC_API_URL` for the build actually used is `https://api.flowerp.uz`
      (verify via `eas build:list` → build details → env, or by checking
      Settings → long-press version footer → dev diagnostics **if** this is
      a `development`/dev-client build — the release APK will NOT expose
      diagnostics; see §9). Confirm `curl -s https://api.flowerp.uz/health`
      returns 200 from the tester's own network before starting.
- [ ] The test driver account has a real `Driver` profile row and is a
      member of the org whose dispatch you'll assign (server 404s "No
      driver profile is linked to your account" otherwise — this is a
      backend account-provisioning check, not an app bug).
- [ ] A dispatch is ready to assign to the test driver + a vehicle, in a
      status the tracking contract treats as live (`ASSIGNED` /
      `EN_ROUTE_TO_PICKUP` / `AT_PICKUP` / `IN_TRANSIT` — see
      `docs/DRIVER_MOBILE_GPS.md` §1).
- [ ] Fleet Tracking map (dispatcher-side) is open in a browser tab so you
      can watch the phone appear live, not just trust the phone's own UI.

## 1. Install

- [ ] Install the release APK via `adb install <file>.apk` or by
      transferring the file to the device and opening it (enable "install
      unknown apps" for the file source first — this is expected friction
      for a sideloaded APK, not a bug).
- [ ] App launches to the login screen without a crash or white screen.

## 2. Permissions — verify each one individually

Do **not** just tap "Allow" on whatever dialog appears — check the actual
resulting state in `Settings → Apps → FlowERP Driver → Permissions` after
each step, since Android's dialog wording and the underlying grant don't
always match 1:1 (e.g. "While using the app" vs "Allow all the time").

- [ ] **Foreground location**: triggered automatically the first time
      tracking tries to start (Account tab also has a manual toggle). After
      granting, `Settings → Apps → FlowERP Driver → Permissions →
      Location` shows "Allowed only while using the app" at minimum.
- [ ] **Background location**: Account tab → "Background tracking" toggle.
      Android will show a *second*, separate system dialog/settings page
      for "Allow all the time" — this cannot be granted from the app's own
      permission prompt on Android 11+, by OS design. Confirm the OS
      Settings page actually flips to "Allow all the time" after walking
      through it, not just that the in-app switch looks on.
- [ ] **Notifications**: first prompted when the app tries to show the
      foreground-service notification, or via Account → Notifications
      toggle. Android 13+ requires this as a runtime grant
      (`POST_NOTIFICATIONS`) — confirm the notification permission is
      "Allowed" in Settings, not just assumed from install.
- [ ] **Battery optimization**: `Settings → Apps → FlowERP Driver →
      Battery` — record whether it's "Unrestricted", "Optimized", or
      "Restricted". The app does **not** currently request exemption from
      battery optimization (no such flow exists in this codebase — see
      Known Issues). On a stock/Pixel device "Optimized" is usually fine
      for a foreground-service-backed tracker. On Xiaomi/Samsung/Huawei,
      "Optimized" (or whatever the OEM's equivalent default is) is a
      **known cause of background tracking silently dying** — see §5 and
      §8. Note the setting either way; if background tracking fails in §4
      on that device, this is the first thing to check.

## 3. Startup sequence

- [ ] **Cold start**: force-stop the app (`Settings → Apps → FlowERP
      Driver → Force stop`), then launch from the app drawer. Confirm it
      reaches the login screen (if logged out) or Home (if a session was
      persisted) without hanging on a blank/splash screen.
- [ ] **Warm start**: background the app (home button), wait 10s, bring it
      back to foreground. Confirm state is preserved (still on the same
      screen, GPS Tracking card still shows the same status it had before
      backgrounding, not reset to "Stopped").
- [ ] **Killed app** (swiped away from recents) while a dispatch is active
      and tracking is running: swipe the app away, wait 30s, reopen from
      the app drawer. Confirm tracking resumes automatically (Home → GPS
      Tracking card → "Tracking" within a few seconds) without requiring
      the driver to do anything — this is `TrackingProvider`'s mount effect
      re-evaluating a still-live dispatch, not a special "was I tracking"
      flag, so it should just work; confirm it actually does on-device.
- [ ] **Device reboot** while a dispatch is active: reboot the phone, do
      **not** open the app manually, wait 2 minutes. Check Fleet Tracking
      map for a new position. This is the one case where the app has *no*
      code path to auto-launch itself — Android does not restart arbitrary
      apps in the foreground after boot, and this app does not use a boot
      receiver to relaunch itself (that would be a new feature). **Expected
      result: tracking does NOT resume until the driver manually reopens
      the app.** Confirm this expectation, and confirm that once reopened,
      tracking resumes on its own (same as killed-app case above).

## 4. Full tracking lifecycle (single continuous run)

Walk through the whole chain in one session, checking the Home screen's
GPS Tracking card and the Fleet Tracking map at each arrow:

```
Login → Dispatch assigned → Tracking starts → Heartbeat → Background →
Screen locked → Screen unlocked → Network lost → Reconnect → Logout →
Tracking stops
```

- [ ] **Login**: real driver credentials, reaches Home.
- [ ] **Dispatch assigned**: dispatcher assigns the prepared dispatch (or
      it's already assigned before login). Home → "Active Job" card
      appears within one poll cycle.
- [ ] **Tracking starts**: GPS card flips from "Stopped"/"Waiting" to
      "Starting…" then "Tracking" without manual action. Fleet Tracking
      map shows the vehicle appear.
- [ ] **Heartbeat**: leave the phone stationary indoors (weak/no fix) for
      2+ minutes. "Heartbeat" age on the GPS card should never exceed ~30s
      stale even while no new position lands.
- [ ] **Background**: press home button, leave app backgrounded for 5+
      minutes while driving/walking. Confirm the persistent foreground-
      service notification ("Sharing your location…") stays visible the
      whole time, and Fleet Tracking map keeps updating.
- [ ] **Screen locked**: lock the screen (power button) for 5+ minutes
      while moving. This is the single most important real-device check —
      it cannot be simulated. Confirm Fleet Tracking map keeps updating
      with the screen off.
- [ ] **Screen unlocked**: unlock, confirm the app's own UI (if reopened)
      reflects an unbroken tracking session (no gap, no restart).
- [ ] **Network lost**: enable Airplane Mode for 2+ minutes while tracking
      is running. GPS card should show the network/offline state honestly
      (not claim "Connected"); positions should keep queuing locally
      (dev-diagnostics — dev-client build only — shows queue size growing).
- [ ] **Reconnect**: disable Airplane Mode. Confirm the queued backlog
      flushes automatically within ~20s (no manual action, no app
      restart) and Fleet Tracking map catches up to real position.
- [ ] **Logout**: Account → Sign out. Confirm the foreground-service
      notification disappears immediately and Fleet Tracking map stops
      receiving updates for this driver.
- [ ] **Tracking stops**: confirm no location icon/indicator remains in
      the Android status bar after logout, and battery/location usage in
      Settings shows the app is no longer active in background.

## 5. Battery usage

- [ ] Fully charge the device, note the % at test start.
- [ ] Run an uninterrupted 2+ hour tracking session (driving or walking
      with the app backgrounded/screen locked per §4).
- [ ] `Settings → Battery → App usage` (or equivalent OEM screen) → record
      FlowERP Driver's % of total battery drain and "background usage"
      time for the test window.
- [ ] Compare moving-vs-stationary drain if possible: the app is designed
      to use `High` accuracy / 7s interval only while classified as moving,
      dropping to `Low` accuracy / 45s interval within ~60s of sustained
      stop (see `services/tracking/tracking-config.ts`) — stationary
      periods should show visibly lower drain than continuous driving.
- [ ] Flag anything that looks like a drain outlier (e.g. GPS chip held at
      high-accuracy continuously with no idle drop) for follow-up — this
      checklist can observe symptoms but diagnosing a specific drain cause
      needs `adb shell dumpsys batterystats`, out of scope for a first
      field pass.

## 6. Android 13 (API 33) specific

- [ ] Runtime notification permission prompt appears (not just requested
      silently) — Android 13 made `POST_NOTIFICATIONS` a runtime grant;
      confirm the app actually shows a system dialog for it.
- [ ] Try granting **only** "Precise: Off" (approximate/coarse location
      only) when the location permission dialog first appears. Confirm the
      app doesn't crash and degrades sensibly (lower accuracy fixes still
      post successfully) rather than getting stuck.

## 7. Android 14 (API 34) specific

This build's `targetSdkVersion`/`compileSdkVersion` resolves to Android 16
(API 36) by default (no override in `app.json` — see Production
Checklist), so Android 14's foreground-service rules apply in full and
then some.

- [ ] Confirm the foreground-service location notification appears
      **immediately** when tracking starts, not delayed — Android 14
      enforces stricter timing on when a foreground service must post its
      notification after starting.
- [ ] Confirm the app does **not** crash with a
      `MissingForegroundServiceTypeException` or similar on tracking start
      — verified at the manifest level this session (expo-location's own
      library manifest declares `foregroundServiceType="location"` on its
      service), but only a real API-34+ device proves it holds at runtime.
- [ ] If the dispatch/tracking-start happens while the app is fully
      backgrounded (not freshly foregrounded by the driver), confirm the
      foreground service still starts — Android 14 restricts starting new
      foreground services from the background in some circumstances;
      confirm this app's flow doesn't hit that restriction (it starts
      tracking from a `useEffect` reacting to an authenticated session +
      live dispatch, which should run while the app is in the foreground
      React tree, but device-level confirmation matters more than the
      theory here).

## 8. OEM battery-manager gauntlet (if a Xiaomi/Samsung/Huawei device is available)

- [ ] Repeat §4's "Screen locked" step for 15+ minutes specifically on the
      OEM device. If tracking dies, check the OEM's own battery/autostart
      manager (e.g. MIUI Security app → Battery → App battery saver → set
      to "No restrictions"; Samsung → Settings → Battery → Background
      usage limits → remove from "Sleeping apps"). This is manual,
      per-device, per-OEM settings work — not something the app can fix
      itself without adding a battery-optimization-exemption request flow,
      which is out of scope for this phase (see Known Issues).

## 9. Diagnostics availability note

`app/(driver)/dev-diagnostics.tsx` is gated on `__DEV__`, which is `false`
in the release/production JS bundle produced by the `production` and
`preview` EAS build profiles. **The hidden diagnostics screen will not be
reachable in the APK this checklist tests.** For deeper introspection
during the first field test (raw coordinates, queue size, packet
success/fail counts, last server response), either:

- build and install the `development` EAS profile instead (connects to a
  Metro dev server, `__DEV__` true, diagnostics reachable) for a
  parallel/preliminary pass, or
- rely on the Home screen's GPS Tracking card (always available, real
  data) plus the Fleet Tracking map as the source of truth for the
  release-APK pass.

This is expected behavior, not a bug to fix — see Known Issues.
