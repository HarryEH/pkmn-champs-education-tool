import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '../../ui';
import { useSessionStore } from '../../store/session';
import { useSettingsStore } from '../../store/settings';
import { useTeamsStore } from '../../store/teams';
import { FIXTURE_MY_TEAM, FIXTURE_OPPONENT_TEAM } from '../../../shared/fixtures';
import type { NormalizedRect } from '../../../shared/types';
import { loadImageFromFile } from '../../../lib/detection/imageSource';
import { cropRegions } from '../../../lib/detection/cropRegions';
import { detectOpponentTeam } from '../../../lib/detection/detectionPipeline';
import {
  getEmbedderStatus,
  preloadEmbedder,
  type EmbedderStatus,
} from '../../../lib/detection/embedder';
import type { RgbaImage } from '../../../lib/detection/image';
import { CalibrationOverlay } from './CalibrationOverlay';
import { SlotList } from './SlotList';
import { OpponentDashboard } from './OpponentDashboard';
import { BOX_EMBEDDING_TABLE, DEFAULT_CALIBRATION_RECTS, LEGAL_SPECIES_IDS } from './constants';

/**
 * Flow B — Detection + analysis dashboard (E1a + E2).
 *
 * Drop/select a Nintendo Switch team-preview screenshot, calibrate the six
 * opponent icon boxes (pre-seeded with a reasonable default), run the
 * icon-hash detection pipeline, then review/override the detected team and
 * the full matchup/speed/damage analysis against the active team.
 */
export function DetectionScreen() {
  const opponent = useSessionStore((s) => s.opponent);
  const setOpponent = useSessionStore((s) => s.setOpponent);
  const overrideSlot = useSessionStore((s) => s.overrideSlot);

  const calibrationRegions = useSettingsStore((s) => s.settings.calibrationRegions);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const setCalibrationRegions = useSettingsStore((s) => s.setCalibrationRegions);

  const teams = useTeamsStore((s) => s.teams);
  const activeTeamId = useTeamsStore((s) => s.activeTeamId);
  const myTeam = useMemo(
    () => teams.find((t) => t.id === activeTeamId) ?? FIXTURE_MY_TEAM,
    [teams, activeTeamId],
  );

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [frame, setFrame] = useState<RgbaImage | null>(null);
  const [crops, setCrops] = useState<RgbaImage[] | undefined>(undefined);
  const [rects, setRects] = useState<NormalizedRect[]>(DEFAULT_CALIBRATION_RECTS);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<EmbedderStatus>(getEmbedderStatus());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Kick off the (first-run) CLIP model download as soon as the screen mounts, and
  // poll its status so the Detect button can reflect "loading model…". The model is
  // cached after the first download, so later sessions resolve to 'ready' quickly.
  useEffect(() => {
    preloadEmbedder();
    setModelStatus(getEmbedderStatus());
    const id = setInterval(() => {
      const status = getEmbedderStatus();
      setModelStatus(status);
      if (status === 'ready' || status === 'error') clearInterval(id);
    }, 400);
    return () => clearInterval(id);
  }, []);

  // Load persisted calibration once settings hydrate.
  useEffect(() => {
    if (settingsHydrated && calibrationRegions?.length === 6) {
      setRects(calibrationRegions);
    }
  }, [settingsHydrated, calibrationRegions]);

  // Revoke the screenshot's object URL on replace/unmount.
  useEffect(() => {
    if (!imageUrl) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const loadFile = async (file: File) => {
    setError(null);
    setCrops(undefined);
    try {
      const rgba = await loadImageFromFile(file);
      setFrame(rgba);
      setImageUrl(URL.createObjectURL(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load image');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void loadFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
    e.target.value = '';
  };

  const handleDetect = async () => {
    if (!frame) return;
    setDetecting(true);
    setError(null);
    try {
      const result = await detectOpponentTeam(frame, rects, BOX_EMBEDDING_TABLE, {
        legalOnly: LEGAL_SPECIES_IDS,
      });
      setCrops(cropRegions(frame, rects));
      setOpponent(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detection failed');
    } finally {
      setDetecting(false);
    }
  };

  const handleLoadSample = () => {
    setCrops(undefined);
    setOpponent(FIXTURE_OPPONENT_TEAM);
  };

  return (
    <div
      style={{
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
        maxWidth: 1100,
      }}
    >
      <header>
        <h1 style={{ margin: 0 }}>Detection &amp; Analysis</h1>
        <p style={{ color: 'var(--text-mut)', margin: '4px 0 0' }}>
          Drop a Nintendo Switch team-preview screenshot to detect the opponent&apos;s 6
          Pokémon, then review the matchup, speed, and damage analysis below.
        </p>
      </header>

      <Card
        title="Team preview screenshot"
        actions={
          <Button variant="ghost" size="sm" onClick={handleLoadSample}>
            Load sample opponent
          </Button>
        }
      >
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed var(--border)',
            borderRadius: 'var(--radius)',
            padding: 'var(--space-5)',
            textAlign: 'center',
            cursor: 'pointer',
            color: 'var(--text-mut)',
            fontSize: 13,
            marginBottom: imageUrl ? 'var(--space-4)' : 0,
          }}
        >
          {imageUrl
            ? 'Drop a new screenshot to replace it, or click to browse'
            : 'Drop a team-preview screenshot here, or click to browse'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        {error && (
          <p style={{ color: 'var(--poke-red)', fontSize: 13, marginTop: 'var(--space-2)' }}>
            {error}
          </p>
        )}

        {imageUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <CalibrationOverlay imageUrl={imageUrl} rects={rects} onChange={setRects} />
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Button
                onClick={() => void handleDetect()}
                disabled={detecting || !frame || modelStatus === 'loading'}
              >
                {detecting
                  ? 'Detecting…'
                  : modelStatus === 'loading'
                    ? 'Loading model…'
                    : 'Detect'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCalibrationRegions(rects)}>
                Save calibration
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRects(DEFAULT_CALIBRATION_RECTS)}
              >
                Reset to defaults
              </Button>
              <span style={{ fontSize: 12, color: 'var(--text-mut)' }}>
                {modelStatus === 'error'
                  ? 'Image model failed to load — check your connection and retry.'
                  : modelStatus === 'loading'
                    ? 'Downloading the image-recognition model (first run only)…'
                    : 'Drag/resize the 6 boxes over each opponent icon, then Detect.'}
              </span>
            </div>
          </div>
        )}
      </Card>

      {opponent && (
        <>
          <SlotList opponent={opponent} crops={crops} onOverride={overrideSlot} />
          <OpponentDashboard opponent={opponent} myTeam={myTeam} />
        </>
      )}
    </div>
  );
}
