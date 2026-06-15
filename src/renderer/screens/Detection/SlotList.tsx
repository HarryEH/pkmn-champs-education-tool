import React, { useEffect, useRef } from 'react';
import { Card, Select } from '../../ui';
import { pokemonIconStyle } from '../../components/pokemonIcon';
import type { OpponentTeam } from '../../../shared/types';
import type { RgbaImage } from '../../../lib/detection/image';
import { gen } from '../../../lib/calc/gen';
import { isChampionsLegal } from '../../../lib/detection/championsLegality';
import { LEGALITY_INDEX, SPECIES_OPTIONS } from './constants';

export interface SlotListProps {
  opponent: OpponentTeam;
  /** Per-slot icon crops from the last detection run, for thumbnails. */
  crops?: RgbaImage[];
  onOverride: (index: number, speciesId: string) => void;
}

const SELECT_OPTIONS = [{ value: '', label: 'Select species…' }, ...SPECIES_OPTIONS];

function speciesName(speciesId: string): string {
  return gen.species.get(speciesId)?.name ?? speciesId;
}

/** Renders one detection crop (a small RGBA image) to a pixelated thumbnail. */
function CropThumbnail({ crop }: { crop: RgbaImage }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data =
      crop.data instanceof Uint8ClampedArray ? crop.data : new Uint8ClampedArray(crop.data);
    ctx.putImageData(new ImageData(data, crop.width, crop.height), 0, 0);
  }, [crop]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: 56,
        height: 56,
        flex: '0 0 auto',
        imageRendering: 'pixelated',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-2)',
      }}
    />
  );
}

/**
 * One detected slot's quick-pick candidates — clicking sets the slot's
 * species directly, for when the right answer is a near-miss runner-up.
 */
function CandidateChips({
  candidates,
  selected,
  onPick,
}: {
  candidates: OpponentTeam['slots'][number]['candidates'];
  selected: string | null;
  onPick: (speciesId: string) => void;
}) {
  if (candidates.length < 2) return null;
  return (
    <div style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {candidates.map((c) => (
        <button
          key={c.speciesId}
          type="button"
          onClick={() => onPick(c.speciesId)}
          style={{
            font: 'inherit',
            fontSize: 11,
            padding: '2px 8px',
            border: `1px solid ${c.speciesId === selected ? 'var(--poke-red)' : 'var(--border)'}`,
            borderRadius: 999,
            background: c.speciesId === selected ? 'var(--surface-2)' : 'transparent',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          {speciesName(c.speciesId)} {Math.round(c.confidence * 100)}%
        </button>
      ))}
    </div>
  );
}

/**
 * Detected-opponent slot grid (E1a): crop thumbnail, top-candidate confidence,
 * Reg M-A legality flag, and an override dropdown / quick-pick chips for
 * manual correction.
 */
export function SlotList({ opponent, crops, onOverride }: SlotListProps) {
  return (
    <Card title="Detected opponent team">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        {opponent.slots.map((slot, i) => {
          const crop = crops?.[i];
          const top = slot.candidates[0];
          const legal = slot.speciesId ? isChampionsLegal(LEGALITY_INDEX, slot.speciesId) : true;

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-start',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: 'var(--space-3)',
              }}
            >
              {crop && <CropThumbnail crop={crop} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-mut)' }}>
                    Slot {i + 1}
                  </span>
                  {top && (
                    <span style={{ fontSize: 11, color: 'var(--text-mut)' }}>
                      {Math.round(top.confidence * 100)}% match
                    </span>
                  )}
                </div>

                {slot.speciesId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={pokemonIconStyle(slot.speciesId)} aria-hidden />
                    <span style={{ fontWeight: 700 }}>{speciesName(slot.speciesId)}</span>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-mut)', fontSize: 13 }}>
                    Unconfirmed — pick below
                  </div>
                )}

                {slot.speciesId && !legal && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--poke-red)',
                    }}
                  >
                    Not legal this regulation — double-check this slot
                  </div>
                )}

                <div style={{ marginTop: 'var(--space-2)' }}>
                  <Select
                    options={SELECT_OPTIONS}
                    value={slot.speciesId ?? ''}
                    onChange={(value) => onOverride(i, value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <CandidateChips
                  candidates={slot.candidates}
                  selected={slot.speciesId}
                  onPick={(speciesId) => onOverride(i, speciesId)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
