import type { CandidateLight } from './types.js';

export const CANDIDATE_STATE_METADATA_VERSION = 1 as const;

export type CandidateMetadataMode = 'v1' | 'legacy';

export interface NormalizedCandidateResponse {
  observedControlledEntityIds: string[];
  lights: CandidateLight[];
  metadataMode: CandidateMetadataMode;
  metadataWarning: string | null;
}

const INVALID_METADATA_WARNING =
  '[Lightener] Unsupported or malformed candidate_state_metadata. Expected v1 with boolean hidden, disabled, and missing on every light; using the legacy all-visible view.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid candidate response: ${field} must be a string`);
  }
  return value;
}

function displayStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function baseCandidate(
  value: unknown,
  index: number
): Omit<CandidateLight, 'hidden' | 'disabled' | 'missing'> {
  if (!isRecord(value)) {
    throw new Error(`Invalid candidate response: lights[${index}] must be an object`);
  }
  const entityId = requiredString(value.entity_id, `lights[${index}].entity_id`);
  return {
    entity_id: entityId,
    name: typeof value.name === 'string' ? value.name : entityId,
    available: typeof value.available === 'boolean' ? value.available : false,
    area_id: displayStringOrNull(value.area_id),
    area_name: displayStringOrNull(value.area_name),
  };
}

/**
 * Normalize the additive candidate-state contract at one compatibility boundary.
 *
 * A response is either complete v1 metadata for every row, or legacy for every
 * row. Legacy mode intentionally discards any partial state flags so a mixed
 * response can never hide only part of the candidate set.
 */
export function normalizeCandidateResponse(response: unknown): NormalizedCandidateResponse {
  if (!isRecord(response)) {
    throw new Error('Invalid candidate response: expected an object');
  }
  if (!Array.isArray(response.observed_controlled_entity_ids)) {
    throw new Error('Invalid candidate response: observed_controlled_entity_ids must be an array');
  }
  if (
    !response.observed_controlled_entity_ids.every(
      (entityId): entityId is string => typeof entityId === 'string'
    )
  ) {
    throw new Error(
      'Invalid candidate response: observed_controlled_entity_ids must contain strings'
    );
  }
  if (!Array.isArray(response.lights)) {
    throw new Error('Invalid candidate response: lights must be an array');
  }

  const rawLights = response.lights;
  const baseLights = rawLights.map(baseCandidate);
  const capabilities = response.capabilities;
  let metadataMode: CandidateMetadataMode = 'legacy';
  let metadataWarning: string | null = null;

  if (capabilities !== undefined) {
    if (!isRecord(capabilities)) {
      metadataWarning = INVALID_METADATA_WARNING;
    } else if (hasOwn(capabilities, 'candidate_state_metadata')) {
      if (capabilities.candidate_state_metadata !== CANDIDATE_STATE_METADATA_VERSION) {
        metadataWarning = INVALID_METADATA_WARNING;
      } else {
        const complete = rawLights.every(
          (light) =>
            isRecord(light) &&
            typeof light.hidden === 'boolean' &&
            typeof light.disabled === 'boolean' &&
            typeof light.missing === 'boolean'
        );
        if (complete) {
          metadataMode = 'v1';
        } else {
          metadataWarning = INVALID_METADATA_WARNING;
        }
      }
    }
  }

  const lights = baseLights.map((light, index) => {
    if (metadataMode === 'legacy') {
      return { ...light, hidden: false, disabled: false, missing: false };
    }
    const raw = rawLights[index] as Record<string, unknown>;
    return {
      ...light,
      hidden: raw.hidden as boolean,
      disabled: raw.disabled as boolean,
      missing: raw.missing as boolean,
    };
  });

  return {
    observedControlledEntityIds: [...response.observed_controlled_entity_ids],
    lights,
    metadataMode,
    metadataWarning,
  };
}

/** Freeze the dialog's two display partitions without affecting payload order. */
export function sortCandidatesAtDialogOpen(
  lights: readonly CandidateLight[],
  initialMemberIds: ReadonlySet<string>,
  language?: string
): CandidateLight[] {
  const collator = new Intl.Collator(language, { sensitivity: 'base', numeric: true });
  return [...lights].sort((left, right) => {
    const leftInitial = initialMemberIds.has(left.entity_id);
    const rightInitial = initialMemberIds.has(right.entity_id);
    if (leftInitial !== rightInitial) return leftInitial ? -1 : 1;
    return (
      collator.compare(left.name, right.name) || collator.compare(left.entity_id, right.entity_id)
    );
  });
}
