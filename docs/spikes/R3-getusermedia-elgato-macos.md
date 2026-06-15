# R3 — `getUserMedia` for an Elgato HD60X in the Electron renderer (macOS)

**Owner:** WS-D · **Date:** 2026-06-15 · **Status:** research memo (no hardware on hand)

## Question

For an **Elgato HD60X** capture card in the Electron **renderer** on **macOS**,
is `systemPreferences.askForMediaAccess('camera')` in main (already implemented
in `src/main/media.ts`) sufficient, and does
`navigator.mediaDevices.getUserMedia({ video: { deviceId } })` work **without**
`desktopCapturer`?

## Short answer

**Yes.** A USB/Thunderbolt HDMI capture card such as the HD60X presents itself
to macOS as a **standard UVC video device** — i.e. a webcam. It is therefore a
normal `videoinput` device reachable through the ordinary camera path:

- It appears in `navigator.mediaDevices.enumerateDevices()` as `kind:
'videoinput'`.
- It is opened with plain `getUserMedia({ video: { deviceId: { exact: id } } })`.
- **No `desktopCapturer`.** `desktopCapturer` is for capturing _screens/windows
  of the host machine_; the Elgato is an external camera-class input, not a
  desktop source, so that whole API is irrelevant here.

## macOS permission gotcha (the load-bearing detail)

Because the card is treated as a camera, macOS gates it behind the **Camera**
TCC privacy permission. In a packaged Electron app the renderer's
`getUserMedia` will **silently fail / reject with `NotAllowedError`** unless the
camera permission has been granted to the _app_ first. The implemented flow is
correct:

1. Main process calls `systemPreferences.getMediaAccessStatus('camera')` and, if
   not `granted`, `systemPreferences.askForMediaAccess('camera')` **before** the
   renderer ever calls `getUserMedia` (see `requestCameraAccess()` in
   `src/main/media.ts`, invoked from `src/main.ts` at startup).
2. The renderer then calls `getUserMedia` normally.

Caveats to keep in mind (for WS-E who owns the capture wiring):

- **Entitlements / Info.plist:** a hardened-runtime packaged build needs the
  `com.apple.security.device.camera` entitlement and an `NSCameraUsageDescription`
  string, or the prompt never shows and access is denied. This is a packaging
  concern (electron-forge config), flagged here so it isn't discovered late.
- **First-launch race:** `askForMediaAccess` resolves only after the user
  answers the OS dialog. The renderer must not enumerate/open the device until
  that resolves; gate the capture UI on the `mediaRequestCamera` IPC result.
- **`enumerateDevices` labels are empty until permission is granted** — device
  _labels_ (so the user can pick "Elgato HD60X" by name) only populate after the
  first successful `getUserMedia` / granted permission. WS-E's device picker
  should request access first, then re-enumerate to show friendly labels.
- **HDMI source must be active.** With nothing plugged into the card's HDMI-in,
  the device may still open but deliver black frames; detection should tolerate
  "no signal" gracefully rather than mis-hashing a black frame.

## Why this motivates normalized calibration rects (relevant to WS-D)

Capture cards report **variable frame geometry**: the HD60X can surface 1080p or
720p, and the rendered `<video>` element's `videoWidth`/`videoHeight` depend on
the source console's output resolution and the negotiated `getUserMedia`
constraints. The team-preview icon row therefore sits at different _pixel_
coordinates on different setups, but at a **stable fraction** of the frame.

That is exactly why `Settings.calibrationRegions` are stored as
**`NormalizedRect` (0–1)** and `cropRegions.ts` multiplies them by the actual
frame dimensions at capture time: one calibration survives any resolution /
aspect-ratio the card hands us. If we stored pixel rects, every resolution
change would silently mis-crop. (WS-D verified this end-to-end in
`cropRegions.test.ts`, which crops a synthetic frame by normalized rects and
checks the sliced pixels exactly.)

## Recommended `getUserMedia` constraints (suggestion for WS-E)

```ts
await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: {
    deviceId: { exact: settings.captureDeviceId },
    // Hint full HD; the card downsamples to source. Detection is resolution-
    // independent thanks to normalized rects, so this is only a quality hint.
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
});
```

## Verdict

The implemented main-process permission request is **sufficient**; the renderer
uses the **ordinary camera `getUserMedia` path with a `deviceId`**, no
`desktopCapturer`. The remaining work is packaging entitlements + a permission-
gated device picker, both owned by WS-E. WS-D's pipeline already consumes
whatever frame size the device yields via normalized rects.
