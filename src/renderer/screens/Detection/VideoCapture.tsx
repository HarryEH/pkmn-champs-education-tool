import React, { useEffect, useRef, useState } from 'react';
import { Button, Select } from '../../ui';
import { useSettingsStore } from '../../store/settings';
import { grabVideoFrame } from '../../../lib/detection/videoSource';
import type { RgbaImage } from '../../../lib/detection/image';

export interface VideoCaptureProps {
  /** Called with a grabbed still + its snapshot URL, to run the detect pipeline. */
  onGrab: (frame: RgbaImage, snapshotUrl: string) => void;
}

/**
 * Live-capture detection source (Elgato/USB) — SCAFFOLD.
 *
 * Lists video-input devices, previews the selected one, and grabs a still that
 * feeds the exact same CLIP pipeline as a dropped screenshot (via
 * `grabVideoFrame` → `RgbaImage`). The selected device id is persisted to
 * settings. Calibration + detection reuse the screenshot flow once a frame is
 * grabbed. Hardware-specific tuning lands with the real Elgato in hand.
 */
export function VideoCapture({ onGrab }: VideoCaptureProps) {
  const savedDeviceId = useSettingsStore((s) => s.settings.captureDeviceId);
  const updateSettings = useSettingsStore((s) => s.update);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>(savedDeviceId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Ask for permission (macOS prompt) then enumerate video inputs once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await window.api.media.requestCamera();
        const all = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const cams = all.filter((d) => d.kind === 'videoinput');
        setDevices(cams);
        if (!deviceId && cams[0]) setDeviceId(cams[0].deviceId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not list capture devices');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // (Re)start the preview stream whenever the chosen device changes.
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    setReady(false);
    setError(null);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open the capture device');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [deviceId]);

  const pickDevice = (id: string) => {
    setDeviceId(id);
    void updateSettings({ captureDeviceId: id });
  };

  const grab = () => {
    if (!videoRef.current) return;
    try {
      const { frame, snapshotUrl } = grabVideoFrame(videoRef.current);
      onGrab(frame, snapshotUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not grab a frame');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          value={deviceId}
          onChange={pickDevice}
          options={[
            { value: '', label: devices.length ? 'Select capture device…' : 'No devices found' },
            ...devices.map((d, i) => ({
              value: d.deviceId,
              label: d.label || `Capture device ${i + 1}`,
            })),
          ]}
          style={{ minWidth: 240 }}
        />
        <Button onClick={grab} disabled={!ready}>
          Grab still &amp; detect
        </Button>
      </div>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: '100%',
          maxHeight: 360,
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          background: '#000',
          objectFit: 'contain',
        }}
      />

      <span style={{ fontSize: 12, color: error ? 'var(--poke-red)' : 'var(--text-mut)' }}>
        {error
          ? error
          : ready
            ? 'Line up the Switch team-preview screen, then grab a still to calibrate + detect.'
            : 'Starting capture preview…'}
      </span>
    </div>
  );
}
