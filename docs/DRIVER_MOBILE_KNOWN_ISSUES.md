# Driver Mobile App — Known Issues (Phase 4)

Honest list of everything known to be wrong, risky, or unverified going
into the first real-world GPS test. Nothing here is fixed silently and
nothing here is hidden — that's the point of this document.

---

## Fixed this session

### Unbounded retry loop on start failure

**Status: fixed and re-verified live.**

`startTracking()`'s catch block used to set `lifecycleStatus: 'error'`,
and `TrackingProvider`'s effect treated `'error'` as an immediate
auto-retry trigger with no delay. When the underlying start call rejects
*immediately* (reproduced live this session against the web-preview
target, where `expo-location`'s web shim has no `startLocationUpdatesAsync`
implementation at all — see "Unverifiable in web preview" below), this
produced a genuine tight loop: 10,000+ log lines and a fully unresponsive
UI in under a second, all from `error → effect re-fires → startTracking
→ error again`, no delay in between. This is very plausibly what was
behind the "loop / memory filling up" concern raised earlier in this
project.

Fixed by moving retry ownership entirely into
`services/tracking/tracking-orchestrator.ts` (`scheduleRetry`/
`cancelRetry`, `RETRY_BACKOFF_MS = 30_000`), removing `'error'` from
`TrackingProvider`'s reactive trigger condition, and cancelling any
pending retry on `stopTracking()` (logout/dispatch-end). Re-verified live:
a continuous 38-second in-page measurement showed exactly one retry, and
the UI stayed fully responsive throughout.

**Why this matters beyond web preview**: the web shim just made the
failure *immediate and reproducible*. The same code path — an OS-level
rejection of `startLocationUpdatesAsync` — can happen on a real device
too (location services toggled off at the OS level, a transient native
error, etc.), and would have hit the same unbounded loop before this fix.
This was a real defect, not a web-only artifact.

### Bogus `NOTIFICATIONS` permission entry

**Status: fixed.** `app.json`'s `android.permissions` array included the
string `"NOTIFICATIONS"`, which is not a real Android permission constant
— it produced a dead `<uses-permission android:name="android.permission.
NOTIFICATIONS"/>` entry in the manifest that does nothing. The real
Android 13+ permission (`POST_NOTIFICATIONS`) was never missing — it's
supplied automatically by `expo-notifications`' own library manifest —
so this was cosmetic dead weight, not a functional gap. Removed.

### GPS status card silently relabeling `'error'` as "Stopped"

**Status: fixed.** `features/tracking/components/gps-status-card.tsx`
collapsed any non-tracking, non-starting `lifecycleStatus` into "Stopped",
including `'error'`. A driver whose tracking had actually failed would
see the same muted "Stopped" label as one who simply isn't on a dispatch
— no distinction. Now shows "Error" with a warning tone when
`lifecycleStatus === 'error'`.

---

## Open — accepted risk for this phase (would require new features to close)

These are real gaps. Closing them would mean adding code beyond what
Phase 4 authorizes ("no new features, focus only on reliability"), so
they're documented instead, with the manual mitigation available today.

### No battery-optimization exemption request flow

The app never asks the OS to exempt it from battery optimization
(`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is not used anywhere in this
codebase). On stock Android this is usually fine for a foreground-
service-backed tracker. On Xiaomi/Redmi/POCO (MIUI/HyperOS), Samsung, and
Huawei devices, aggressive OEM battery/autostart managers are a
well-documented cause of background location silently dying even with all
permissions correctly granted. **Mitigation today is manual**: the tester
or driver must go into the OEM's own battery settings and disable
restrictions for this app (steps in
`DRIVER_MOBILE_TESTING_CHECKLIST.md` §8). Building an in-app
"exempt me from battery optimization" prompt is a reasonable Phase 5
candidate, not something added here.

### No automatic relaunch after device reboot

Android does not restart arbitrary apps in the foreground after boot, and
this app has no boot receiver to relaunch itself. **Expected behavior**:
after a device reboot, tracking does not resume until the driver manually
reopens the app — this is a real gap for a fleet-tracking product (a
phone that reboots mid-shift goes dark until someone notices and reopens
the app), but adding a boot-triggered relaunch/foreground-service restart
is new functionality, out of scope this phase. Documented as a manual
step in the testing checklist (§3) rather than silently assumed away.

### No crash reporting

No Sentry, Crashlytics, or equivalent is wired into this app. If the
release APK crashes in the field, there is no automated report — the only
diagnostic trail is `adb logcat` captured live from the device, or
whatever the driver can describe after the fact. For a first, closely-
supervised field test this is tolerable (a human is watching); it stops
being tolerable the moment this ships to drivers unsupervised. Flagged
for a future phase, not added here (new dependency + instrumentation is
squarely a new feature).

### No OTA / update mechanism

`expo-updates` is not installed. Every new build requires a manual
reinstall on every test device — there is no remote rollout, no staged
percentage, no "push a fix without a new APK." Fine for a single-driver
first test; a real constraint the moment more than one or two devices are
in the field, since fixes can't be pushed at all after this point:
duct-tape rollback plan is "keep the old APK file around" (Production
Checklist), not a real one.

### Hidden dev diagnostics screen is unreachable in the release build

Not a bug — a deliberate consequence of a Phase 3 design decision, but
worth stating plainly so it doesn't cause confusion mid-field-test:
`app/(driver)/dev-diagnostics.tsx` is gated on `__DEV__`, which is `false`
in the release/production JS bundle. The screen exists and is correct,
but nobody testing the actual production APK will be able to reach it.
Ground truth during the release-APK field test is the Home screen's GPS
Tracking card (real data, always available) plus the Fleet Tracking map —
not the diagnostics screen. See Testing Checklist §9 if deeper
introspection is genuinely needed (build the `development` EAS profile
instead, as a parallel/preliminary pass).

---

## Unverifiable in web preview — needs the real device pass in this phase

These were true throughout Phase 3 and remain true; restated here because
Phase 4 is the first point where they actually get checked:

- **True background delivery with the screen off.** `expo-location`'s web
  shim (`ExpoLocation.web.js`) has no `startLocationUpdatesAsync`
  implementation at all — confirmed by reading the source this session,
  and by reproducing the resulting immediate-rejection loop live. Nothing
  about background location has ever been exercised against a real OS
  location engine before this phase.
- **Foreground-service notification behavior** (persistence, correct
  timing under Android 14's stricter start rules) — confirmed correct at
  the *manifest* level this session (`foregroundServiceType="location"`
  present via `expo-location`'s library manifest); runtime behavior needs
  a real API 34+ device (Testing Checklist §7).
- **Approximate-only location grants (Android 12+ "Precise: Off").** Code
  doesn't special-case this, sends whatever accuracy the OS gives it — 
  should degrade gracefully in theory, unconfirmed on a real device
  (Testing Checklist §6).
- **Real battery drain.** No way to measure this outside a physical
  device running a multi-hour session (Testing Checklist §5).

---

## Not a defect, just worth remembering

- **`compileSdkVersion`/`targetSdkVersion` resolve to API 36 (Android 16)**
  by default — no explicit override exists anywhere in this project. This
  is correct/current, not a gap, but means the *strictest* current
  Android runtime enforcement applies; keep that in mind when triaging any
  permission/foreground-service issue that shows up in the field — it's
  more likely a real Android-14/15/16 rule than a version-targeting quirk.
