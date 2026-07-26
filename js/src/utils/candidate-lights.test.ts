import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeCandidateResponse, sortCandidatesAtDialogOpen } from './candidate-lights.js';
import type { CandidateLight } from './types.js';

function candidate(entityId: string, name: string): CandidateLight {
  return {
    entity_id: entityId,
    name,
    available: true,
    area_id: null,
    area_name: null,
    hidden: false,
    disabled: false,
    missing: false,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeCandidateResponse', () => {
  it('keeps rows with malformed presentation metadata and leaves warning policy to callers', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const normalized = normalizeCandidateResponse({
      capabilities: { candidate_state_metadata: 1 },
      observed_controlled_entity_ids: ['light.presentation_fallback'],
      lights: [
        {
          entity_id: 'light.presentation_fallback',
          name: { unexpected: true },
          available: 'sometimes',
          area_id: 42,
          area_name: undefined,
          hidden: false,
          disabled: false,
          missing: false,
        },
      ],
    });

    expect(normalized).toMatchObject({
      metadataMode: 'v1',
      metadataWarning: null,
      lights: [
        {
          entity_id: 'light.presentation_fallback',
          name: 'light.presentation_fallback',
          available: false,
          area_id: null,
          area_name: null,
        },
      ],
    });
    expect(warning).not.toHaveBeenCalled();
  });

  it('returns metadata warnings without keeping module-global warning state or logging', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = {
      capabilities: { candidate_state_metadata: 2 },
      observed_controlled_entity_ids: [],
      lights: [candidate('light.legacy', 'Legacy')],
    };

    const first = normalizeCandidateResponse(response);
    const second = normalizeCandidateResponse(response);

    expect(first.metadataWarning).toContain('legacy all-visible');
    expect(second.metadataWarning).toBe(first.metadataWarning);
    expect(warning).not.toHaveBeenCalled();
  });

  it('keeps entity ids strict', () => {
    expect(() =>
      normalizeCandidateResponse({
        observed_controlled_entity_ids: [],
        lights: [
          {
            entity_id: null,
            name: 'Invalid',
            available: true,
            area_id: null,
            area_name: null,
          },
        ],
      })
    ).toThrow('lights[0].entity_id must be a string');
  });

  it('falls the whole response back when any claimed-v1 state flag is malformed', () => {
    const normalized = normalizeCandidateResponse({
      capabilities: { candidate_state_metadata: 1 },
      observed_controlled_entity_ids: [],
      lights: [
        {
          ...candidate('light.complete', 'Complete'),
          hidden: true,
        },
        {
          ...candidate('light.malformed', 'Malformed'),
          disabled: 'user',
        },
      ],
    });

    expect(normalized.metadataMode).toBe('legacy');
    expect(normalized.metadataWarning).toContain('legacy all-visible');
    expect(
      normalized.lights.map(({ hidden, disabled, missing }) => ({
        hidden,
        disabled,
        missing,
      }))
    ).toEqual([
      { hidden: false, disabled: false, missing: false },
      { hidden: false, disabled: false, missing: false },
    ]);
  });
});

describe('sortCandidatesAtDialogOpen', () => {
  it('uses stable in-partition ordering without mutating the source array', () => {
    const duplicateFirst = candidate('light.same', 'Lamp 2');
    const duplicateSecond = { ...duplicateFirst, available: false };
    const lights = [
      candidate('light.lamp_10', 'Lamp 10'),
      duplicateFirst,
      candidate('light.current', 'Current'),
      candidate('light.lamp_3', 'Lamp 3'),
      duplicateSecond,
    ];

    const sorted = sortCandidatesAtDialogOpen(lights, new Set(['light.current']), 'en');

    expect(sorted).toEqual([lights[2], duplicateFirst, duplicateSecond, lights[3], lights[0]]);
    expect(lights[0].entity_id).toBe('light.lamp_10');
  });
});
