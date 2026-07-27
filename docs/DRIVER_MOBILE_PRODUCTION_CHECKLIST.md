# Driver Mobile App — Production Readiness Checklist (Phase 4)

Release sign-off list for the first real-world GPS test build. This is a
**direct-install APK for internal field testing**, not a Play Store
submission — items specific to a Play Store release are called out
separately at the end and are explicitly out of scope for this pass.

## Build

- [ ] `eas.json` present at `apps/mobile/eas.json` with `development`,
      `preview`, `production` profiles, all Android outputs set to
      `buildType: "apk"` (installable directly, not an `.aab`).
- [ ] Run from `apps/mobile`: `eas login` (your Expo account — this
      repo/session has no stored credentials and cannot do this step for
      you), then `eas build:configure` if this is the first build for this
      project (links `app.json` to an EAS project id), then
      `eas build --platform android --profile production`.
- [ ] No local Android SDK/JDK is required for this path — the build runs
      on Expo's infrastructure. (A fully local Gradle build was evaluated
      and is possible but requires installing a JDK + Android SDK in this
      environment first; EAS Build is the lower-friction path for a first
      test and is what this checklist assumes.)
- [ ] Confirm the resulting build's version: `app.json` currently has
      `"version": "1.0.0"`; `production` profile has `autoIncrement: true`
      for `versionCode`, so each production build bumps it automatically —
      confirm the build you're about to distribute is the one you think it
      is (`eas build:list`).

## Environment

- [ ] `EXPO_PUBLIC_API_URL` resolves to `https://api.flowerp.uz` for both
      `preview` and `production` profiles (baked into `eas.json` directly —
      this is public, non-secret client config, safe to commit). Verified
      reachable this session: `GET https://api.flowerp.uz/health` → `200`.
      **Do not build with the `development` profile for field distribution**
      — it has no `env` override and falls back to
      `http://localhost:4000`, which is meaningless on a driver's phone.

## Permissions (verified against the actual generated manifest, not just app.json)

Verified this session by running `expo prebuild` into a scratch copy and
reading the real generated `AndroidManifest.xml`, plus the native library
manifests of `expo-location` and `expo-notifications` that merge into it
at Gradle build time:

- [x] `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` — present.
- [x] `ACCESS_BACKGROUND_LOCATION` — present (from the `expo-location`
      config plugin, `isAndroidBackgroundLocationEnabled: true`).
- [x] `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` — present.
- [x] `<service android:name=".services.LocationTaskService"
      android:foregroundServiceType="location">` — present, declared in
      `expo-location`'s own library manifest (merges in automatically;
      required for Android 14+ or the foreground service start would
      crash with `MissingForegroundServiceTypeException`).
- [x] `POST_NOTIFICATIONS` — present, declared in `expo-notifications`'s
      own library manifest (Android 13+ runtime notification permission).
- [x] `INTERNET` — present.
- [x] Fixed this session: `app.json`'s `android.permissions` array had a
      bogus `"NOTIFICATIONS"` entry (not a real Android permission
      constant — the real one is `POST_NOTIFICATIONS`, already supplied
      correctly via the library manifest above). Removed; harmless but
      dead, not a functional gap.
- [ ] Physical-device confirmation that all of the above actually prompt
      and grant correctly is in `DRIVER_MOBILE_TESTING_CHECKLIST.md` §2 —
      manifest presence is necessary but not sufficient, still needs a
      real device pass.

## Android SDK targeting

- [ ] `compileSdkVersion`/`targetSdkVersion` are **not** overridden
      anywhere in this project (no `expo-build-properties` plugin, no
      explicit values in `app.json` or the generated `android/*.gradle`
      files) — confirmed they fall through to the Expo Modules Core Gradle
      plugin's default, **API 36 (Android 16)**, for this Expo SDK 57
      toolchain. This means the strictest current foreground-service and
      background-location runtime rules apply, which is the right target
      for a build shipping in 2026 — no action needed, just documented so
      it's not mistaken for using an old lenient target by accident.

## Tracking correctness (carried over from Phase 3, re-confirmed live)

- [x] Adaptive interval (moving: High/7s/15m, stopped: Low/45s/50m,
      60s hysteresis) implemented and unchanged.
- [x] Heartbeat (30s safety-net cadence) implemented and unchanged.
- [x] Offline queue + idempotency-key dedup + reconnect-triggered flush
      implemented and unchanged.
- [x] **Retry-loop bug found and fixed this session**: a start failure
      that rejects immediately used to retry with zero backoff, spinning
      thousands of times per second and freezing the UI — this is very
      likely the root cause of the "loop / memory filling up" behavior
      flagged earlier. Fixed with a 30s backoff owned by the orchestrator
      (`RETRY_BACKOFF_MS`, `tracking-orchestrator.ts`); re-verified live
      (single retry per continuous 38s window, UI stayed responsive
      throughout). See `DRIVER_MOBILE_KNOWN_ISSUES.md` for the mechanism.
- [x] Logout and dispatch-ending both correctly stop tracking (verified
      live this session: `POST /auth/logout 200`, redirect to `/login`;
      `stopTracking()` now also cancels any pending retry).

## Backend contract

- [x] `docs/DRIVER_MOBILE_GPS.md` is the source of truth; the app was
      built directly against it in Phase 3 and re-verified live against
      the real `apps/api` backend this session (not just mocked).
- [ ] Confirm the production API (`api.flowerp.uz`) is running the same
      backend version this mobile build was tested against — this
      checklist can't verify that from here; confirm via your deployment
      pipeline / `docs/DEPLOYMENT_PIPELINE.md`.

## Signing & distribution

- [ ] First `eas build` will auto-generate and store an Android signing
      keystore on Expo's servers unless you provide your own
      (`eas credentials`). For a pure sideload/internal test this doesn't
      block anything, but **note which path you took** — if you ever move
      to a Play Store release under the same package name
      (`uz.flowerp.driver`), you must keep using the same keystore, so
      losing track of an auto-generated one now is a real future problem,
      not a today problem.
- [ ] Distribution for this first test is direct APK install (`adb
      install` or file transfer) — no Play Store, no staged rollout, no
      auto-update mechanism (`expo-updates` is not installed in this
      project). A new build means a new manual install on every test
      device; there is no OTA path yet.

## Rollback plan (for this direct-install phase)

- [ ] Keep the previous working APK file on hand for every device you
      install to. Rollback = uninstall current APK, install the previous
      one, have the driver log in again (no automated rollback exists,
      and building one — auto-update, staged rollout — would be a new
      feature, out of scope this phase).
- [ ] If a build misbehaves in the field, capture `adb logcat` from the
      device before uninstalling — there is no remote crash reporting
      (see Known Issues), so on-device logs at the time of failure are the
      only diagnostic trail available.

## Explicitly out of scope for this pass (Play Store path)

Only relevant once this app moves beyond direct-install field testing:

- [ ] Switch `production.android.buildType` from `apk` to the default
      (`aab`) for Play Store submission.
- [ ] Play Store data-safety form (location data collection disclosure —
      required given `ACCESS_BACKGROUND_LOCATION` usage).
- [ ] Android 14+ "prominent disclosure" background-location runtime
      dialog before the permission prompt, if Play Store policy requires
      it for this app's category at submission time.
- [ ] `expo-updates` / OTA strategy, staged rollout percentage, Play Store
      internal testing track.
