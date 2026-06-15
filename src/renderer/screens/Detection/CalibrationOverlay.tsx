import React, { useRef } from 'react';
import type { NormalizedRect } from '../../../shared/types';

export interface CalibrationOverlayProps {
  /** Object URL (or data URL) of the screenshot to calibrate against. */
  imageUrl: string;
  /** Six normalized (0-1) calibration rects, slot order preserved. */
  rects: NormalizedRect[];
  onChange: (rects: NormalizedRect[]) => void;
}

type DragMode = 'move' | 'resize';

/** Smallest a rect can shrink to (normalized units), so it never disappears. */
const MIN_SIZE = 0.02;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Draggable/resizable overlay for the six opponent-icon calibration rects,
 * shown over a static team-preview screenshot. Coordinates are normalized
 * (0-1) so they survive different screenshot resolutions.
 *
 * Drag math snapshots the rect array + pointer position at `pointerdown` and
 * computes every subsequent frame as `start + delta` against that snapshot —
 * never against the latest `rects` prop — so re-renders triggered by
 * `onChange` mid-drag can't cause drift.
 */
export function CalibrationOverlay({ imageUrl, rects, onChange }: CalibrationOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag =
    (index: number, mode: DragMode) =>
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;

      const bounds = container.getBoundingClientRect();
      const startRect = rects[index];
      const rectsSnapshot = rects;
      const startPointer = { x: e.clientX, y: e.clientY };

      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - startPointer.x) / bounds.width;
        const dy = (ev.clientY - startPointer.y) / bounds.height;

        const updated: NormalizedRect =
          mode === 'move'
            ? {
                ...startRect,
                x: clamp(startRect.x + dx, 0, 1 - startRect.w),
                y: clamp(startRect.y + dy, 0, 1 - startRect.h),
              }
            : {
                ...startRect,
                w: clamp(startRect.w + dx, MIN_SIZE, 1 - startRect.x),
                h: clamp(startRect.h + dy, MIN_SIZE, 1 - startRect.y),
              };

        onChange(rectsSnapshot.map((r, i) => (i === index ? updated : r)));
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        userSelect: 'none',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        lineHeight: 0,
      }}
    >
      <img
        src={imageUrl}
        alt="Team preview screenshot"
        draggable={false}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
      {rects.map((rect, i) => (
        <div
          key={i}
          onPointerDown={startDrag(i, 'move')}
          style={{
            position: 'absolute',
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`,
            height: `${rect.h * 100}%`,
            boxSizing: 'border-box',
            border: '2px solid var(--poke-red)',
            background: 'color-mix(in srgb, var(--poke-red) 15%, transparent)',
            cursor: 'move',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: 4,
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--poke-white)',
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            }}
          >
            {i + 1}
          </span>
          <div
            onPointerDown={startDrag(i, 'resize')}
            style={{
              position: 'absolute',
              right: -5,
              bottom: -5,
              width: 12,
              height: 12,
              background: 'var(--poke-red)',
              border: '2px solid var(--poke-white)',
              borderRadius: '50%',
              cursor: 'nwse-resize',
            }}
          />
        </div>
      ))}
    </div>
  );
}
