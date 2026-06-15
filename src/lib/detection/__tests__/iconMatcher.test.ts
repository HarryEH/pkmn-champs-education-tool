/**
 * Matcher auto-accept gate (R7). The ranking + legal-filter behaviour of
 * matchEmbedding is covered in boxEmbeddings.test.ts; this focuses on the
 * confidence mapping and the threshold + margin auto-accept logic.
 */
import { describe, it, expect } from 'vitest';
import {
  AUTO_ACCEPT_MARGIN,
  AUTO_ACCEPT_THRESHOLD,
  cosineToConfidence,
  isAutoAcceptable,
  type MatchCandidate,
} from '../iconMatcher';

const c = (speciesId: string, confidence: number): MatchCandidate => ({ speciesId, confidence });

describe('cosineToConfidence', () => {
  it('maps [-1,1] -> [0,1] monotonically', () => {
    expect(cosineToConfidence(1)).toBeCloseTo(1, 6);
    expect(cosineToConfidence(0)).toBeCloseTo(0.5, 6);
    expect(cosineToConfidence(-1)).toBeCloseTo(0, 6);
    expect(cosineToConfidence(0.4)).toBeGreaterThan(cosineToConfidence(0.2));
  });
});

describe('isAutoAcceptable', () => {
  const above = AUTO_ACCEPT_THRESHOLD + 0.1;

  it('is false for an empty candidate list', () => {
    expect(isAutoAcceptable([])).toBe(false);
  });

  it('is false when top-1 is below the threshold', () => {
    expect(isAutoAcceptable([c('x', AUTO_ACCEPT_THRESHOLD - 0.05), c('y', 0.1)])).toBe(false);
  });

  it('is false when the margin over the runner-up is too small', () => {
    // Both above threshold but nearly tied -> a coin flip, so prompt.
    expect(isAutoAcceptable([c('x', above), c('y', above - AUTO_ACCEPT_MARGIN / 2)])).toBe(false);
  });

  it('is true when top-1 clears the threshold with a clear margin', () => {
    expect(isAutoAcceptable([c('x', above), c('y', above - AUTO_ACCEPT_MARGIN - 0.05)])).toBe(true);
  });

  it('accepts a lone candidate above the threshold (no runner-up)', () => {
    expect(isAutoAcceptable([c('x', above)])).toBe(true);
  });
});
