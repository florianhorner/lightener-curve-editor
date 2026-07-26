export interface ControlPoint {
  lightener: number; // 0-100
  target: number; // 0-100
}

export interface LightCurve {
  entityId: string;
  friendlyName: string;
  controlPoints: ControlPoint[];
  visible: boolean;
  color: string;
}

/** One normalized candidate shown by the transactional membership editor. */
export interface CandidateLight {
  entity_id: string;
  name: string;
  available: boolean;
  area_id: string | null;
  area_name: string | null;
  hidden: boolean;
  disabled: boolean;
  missing: boolean;
}

export interface MembershipResponse {
  entities: Record<string, { brightness: Record<string, string> }>;
  added_entity_ids: string[];
  removed_entity_ids: string[];
}

/** Minimal subset of the Home Assistant `hass` object used by this card. */
export interface Hass {
  user: { is_admin: boolean };
  locale?: { language?: string };
  callWS: <T>(msg: Record<string, unknown>) => Promise<T>;
  callApi: <T>(method: string, path: string, body?: Record<string, unknown>) => Promise<T>;
  callService: (domain: string, service: string, data?: Record<string, unknown>) => Promise<void>;
  states: Record<
    string,
    { attributes: { friendly_name?: string; brightness?: number }; state: string }
  >;
  /** Entity-registry display data; absent until HA hydrates it. */
  entities?: Record<string, { platform?: string }>;
}
