import React from 'react';

/** Flow C — In-Battle 4v4 view. Phase-0 placeholder; WS-F owns this screen. */
export function InBattleScreen() {
  return (
    <div style={{ padding: 'var(--space-6)' }}>
      <h1 style={{ marginTop: 0 }}>In-Battle</h1>
      <p style={{ color: 'var(--text-mut)' }}>
        Pick your 4, mark the opponent&apos;s active mons, and flip field-state toggles for live
        speed and damage. (WS-F)
      </p>
    </div>
  );
}
