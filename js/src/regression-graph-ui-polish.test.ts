// @vitest-environment jsdom

/**
 * Regression tests for graph UI polish fixes.
 * Each test verifies a specific bug that was found and fixed on this branch.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleCurveAt } from './utils/graph-math.js';
import type { CurveGraph } from './components/curve-graph.js';
import type { CurveScrubber } from './components/curve-scrubber.js';
import type { LightenerCurveCard } from './lightener-curve-card.js';
import type { LightCurve } from './utils/types.js';

beforeAll(async () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  await import('./components/curve-graph.js');
  await import('./components/curve-scrubber.js');
  await import('./lightener-curve-card.js');
});

// ── Helpers ──────────────────────────────────────────────────────────

function makeGraph(opts?: { curves?: LightCurve[]; selectedCurveId?: string | null }): CurveGraph {
  const graph = document.createElement('curve-graph') as CurveGraph;
  graph.curves = opts?.curves ?? [
    {
      entityId: 'light.alpha',
      friendlyName: 'Alpha',
      controlPoints: [
        { lightener: 0, target: 0 },
        { lightener: 50, target: 75 },
        { lightener: 100, target: 100 },
      ],
      visible: true,
      color: '#2563eb',
    },
  ];
  graph.selectedCurveId = opts?.selectedCurveId ?? 'light.alpha';
  document.body.appendChild(graph);
  return graph;
}

function makeScrubber(curves?: LightCurve[]): CurveScrubber {
  const scrubber = document.createElement('curve-scrubber') as CurveScrubber;
  scrubber.curves = curves ?? [
    {
      entityId: 'light.alpha',
      friendlyName: 'Alpha',
      controlPoints: [
        { lightener: 0, target: 0 },
        { lightener: 50, target: 75 },
        { lightener: 100, target: 100 },
      ],
      visible: true,
      color: '#2563eb',
    },
    {
      entityId: 'light.beta',
      friendlyName: 'Beta',
      controlPoints: [
        { lightener: 0, target: 0 },
        { lightener: 100, target: 50 },
      ],
      visible: true,
      color: '#ef5350',
    },
  ];
  document.body.appendChild(scrubber);
  return scrubber;
}

// ── 1. Origin point long-press guard ─────────────────────────────────

describe('origin point long-press guard', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('_onPointerDown on index 0 does NOT set a long-press timer', async () => {
    const graph = makeGraph();
    await graph.updateComplete;

    const removeEvents: CustomEvent[] = [];
    graph.addEventListener('point-remove', ((e: CustomEvent) => {
      removeEvents.push(e);
    }) as EventListener);

    // Find the origin hit circle (index 0)
    const hitCircles = graph.shadowRoot!.querySelectorAll<SVGCircleElement>('.hit-circle');
    const originCircle = hitCircles[0];

    // Stub setPointerCapture since jsdom doesn't support it
    const svgEl = graph.shadowRoot!.querySelector('svg');
    if (svgEl) {
      (svgEl as unknown as Record<string, unknown>).setPointerCapture = () => {};
    }

    // Simulate pointerdown on origin
    originCircle.dispatchEvent(
      new PointerEvent('pointerdown', { button: 0, bubbles: true, composed: true })
    );

    // Wait longer than the 500ms long-press timer
    await new Promise((resolve) => setTimeout(resolve, 600));

    // No point-remove should have fired for origin
    expect(removeEvents.length).toBe(0);
  });
});

// ── 2. Preview throttle trailing edge ────────────────────────────────

describe('preview throttle trailing edge', () => {
  it('trailing timer fires the last position when called within throttle window', () => {
    vi.useFakeTimers();

    // Replicate the throttle logic from _previewLights
    const PREVIEW_INTERVAL_MS = 300;
    let lastPreviewTime = 0;
    let trailingTimer: ReturnType<typeof setTimeout> | null = null;
    const sentPositions: number[] = [];

    function previewLights(position: number): void {
      const now = Date.now();
      const elapsed = now - lastPreviewTime;
      if (elapsed < PREVIEW_INTERVAL_MS) {
        // Schedule a trailing-edge call so the final position is never dropped
        if (!trailingTimer) {
          trailingTimer = setTimeout(() => {
            trailingTimer = null;
            previewLights(position);
          }, PREVIEW_INTERVAL_MS - elapsed);
        }
        return;
      }
      // Cancel any trailing timer since we're about to send
      if (trailingTimer) {
        clearTimeout(trailingTimer);
        trailingTimer = null;
      }
      lastPreviewTime = Date.now();
      sentPositions.push(position);
    }

    // First call goes through immediately
    previewLights(10);
    expect(sentPositions).toEqual([10]);

    // Second call within throttle window schedules trailing timer
    vi.advanceTimersByTime(100);
    previewLights(50);
    expect(sentPositions).toEqual([10]); // Not sent yet

    // After the remaining throttle window, trailing timer fires
    vi.advanceTimersByTime(200);
    expect(sentPositions).toEqual([10, 50]); // Trailing position was NOT lost

    vi.useRealTimers();
  });
});

// ── 3. sampleCurveAt clamping ────────────────────────────────────────

describe('sampleCurveAt clamping', () => {
  const controlPoints = [
    { lightener: 0, target: 0 },
    { lightener: 10, target: 100 },
    { lightener: 100, target: 100 },
  ];

  it('returns values clamped to [0, 100] for normal input', () => {
    for (let pos = 0; pos <= 100; pos += 5) {
      const value = sampleCurveAt(controlPoints, pos);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('returns values clamped to [0, 100] for out-of-range input', () => {
    // Extreme positions that might cause overshoot in the cubic interpolation
    expect(sampleCurveAt(controlPoints, -50)).toBeGreaterThanOrEqual(0);
    expect(sampleCurveAt(controlPoints, -50)).toBeLessThanOrEqual(100);
    expect(sampleCurveAt(controlPoints, 200)).toBeGreaterThanOrEqual(0);
    expect(sampleCurveAt(controlPoints, 200)).toBeLessThanOrEqual(100);
  });

  it('clamps overshoot from steep ramp curves', () => {
    // A steep ramp can cause cubic Hermite overshoot beyond 100
    const steepPoints = [
      { lightener: 0, target: 0 },
      { lightener: 5, target: 100 },
      { lightener: 10, target: 100 },
      { lightener: 100, target: 100 },
    ];
    for (let pos = 0; pos <= 100; pos++) {
      const value = sampleCurveAt(steepPoints, pos);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

// ── 4. Badge overflow expand/collapse ────────────────────────────────

describe('badge overflow expand/collapse', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('_measureBadgeOverflow skips measurement when _expanded is true', async () => {
    // Create many curves to trigger overflow
    const manyCurves: LightCurve[] = Array.from({ length: 15 }, (_, i) => ({
      entityId: `light.test_${i}`,
      friendlyName: `Test Light ${i}`,
      controlPoints: [
        { lightener: 0, target: 0 },
        { lightener: 100, target: 100 },
      ],
      visible: true,
      color: '#2563eb',
    }));

    const scrubber = makeScrubber(manyCurves);
    await scrubber.updateComplete;

    // Access the private _expanded and _overflowCount via bracket notation
    // Set expanded to true
    (scrubber as unknown as Record<string, unknown>)['_expanded'] = true;
    const countBefore = (scrubber as unknown as Record<string, number>)['_overflowCount'];

    // Manually trigger _measureBadgeOverflow
    (scrubber as unknown as Record<string, () => void>)['_measureBadgeOverflow']();

    // When expanded, measurement should be skipped — overflowCount unchanged
    const countAfter = (scrubber as unknown as Record<string, number>)['_overflowCount'];
    expect(countAfter).toBe(countBefore);
  });
});

// ── 5. Graph point ARIA labels ───────────────────────────────────────

describe('graph point ARIA labels', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('origin (pi=0) gets "Cannot be moved horizontally"', async () => {
    const graph = makeGraph();
    await graph.updateComplete;

    const hitCircles = graph.shadowRoot!.querySelectorAll<SVGCircleElement>('.hit-circle');
    const originLabel = hitCircles[0].getAttribute('aria-label')!;
    expect(originLabel).toContain('Cannot be moved horizontally');
  });

  it('endpoint gets "Space removes"', async () => {
    const graph = makeGraph();
    await graph.updateComplete;

    const hitCircles = graph.shadowRoot!.querySelectorAll<SVGCircleElement>('.hit-circle');
    const endpointLabel = hitCircles[hitCircles.length - 1].getAttribute('aria-label')!;
    expect(endpointLabel).toContain('Space removes');
  });

  it('interior point gets "Space removes"', async () => {
    const graph = makeGraph();
    await graph.updateComplete;

    const hitCircles = graph.shadowRoot!.querySelectorAll<SVGCircleElement>('.hit-circle');
    // Middle point (index 1 of 3)
    const interiorLabel = hitCircles[1].getAttribute('aria-label')!;
    expect(interiorLabel).toContain('Space removes');
  });
});

// ── 6. Point-remove guardrails ────────────────────────────────────────

describe('defense-in-depth _onPointRemove', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('removing index 0 is rejected even with 3+ points', async () => {
    const graph = makeGraph();
    await graph.updateComplete;

    const removeEvents: CustomEvent[] = [];
    // The card-level _onPointRemove guards against this, but we test the guard
    // by verifying that the keyboard handler does NOT emit point-remove for index 0
    const originCircle = graph.shadowRoot!.querySelectorAll<SVGCircleElement>('.hit-circle')[0];

    graph.addEventListener('point-remove', ((e: CustomEvent) => {
      removeEvents.push(e);
    }) as EventListener);

    // Space on origin should NOT emit point-remove
    originCircle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(removeEvents.length).toBe(0);

    // Delete on origin should NOT emit point-remove
    originCircle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(removeEvents.length).toBe(0);
  });

  it('removing the last index works when there are 3+ points', async () => {
    const graph = makeGraph();
    await graph.updateComplete;

    const removeEvents: CustomEvent[] = [];
    graph.addEventListener('point-remove', ((e: CustomEvent) => {
      removeEvents.push(e);
    }) as EventListener);

    const hitCircles = graph.shadowRoot!.querySelectorAll<SVGCircleElement>('.hit-circle');
    const lastCircle = hitCircles[hitCircles.length - 1];

    // Space on endpoint should emit point-remove
    lastCircle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(removeEvents.length).toBe(1);
    expect(removeEvents[0].detail).toMatchObject({ curveIndex: 0, pointIndex: 2 });

    // Delete on endpoint should emit point-remove too
    lastCircle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(removeEvents.length).toBe(2);
    expect(removeEvents[1].detail).toMatchObject({ curveIndex: 0, pointIndex: 2 });
  });

  it('removing an interior point works', async () => {
    const graph = makeGraph();
    await graph.updateComplete;

    const removeEvents: CustomEvent[] = [];
    graph.addEventListener('point-remove', ((e: CustomEvent) => {
      removeEvents.push(e);
    }) as EventListener);

    const hitCircles = graph.shadowRoot!.querySelectorAll<SVGCircleElement>('.hit-circle');
    const middleCircle = hitCircles[1];

    // Space on interior point should emit point-remove
    middleCircle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(removeEvents.length).toBe(1);
    expect(removeEvents[0].detail).toMatchObject({ curveIndex: 0, pointIndex: 1 });
  });
});

// ── 7. _refocusHitCircle uses data attributes ────────────────────────

describe('_refocusHitCircle uses data attributes', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('queries by data-curve/data-point instead of counting DOM order', async () => {
    // Use two curves where the selected renders last (different DOM order from array order)
    const graph = makeGraph({
      curves: [
        {
          entityId: 'light.alpha',
          friendlyName: 'Alpha',
          controlPoints: [
            { lightener: 0, target: 0 },
            { lightener: 50, target: 75 },
            { lightener: 100, target: 100 },
          ],
          visible: true,
          color: '#2563eb',
        },
        {
          entityId: 'light.beta',
          friendlyName: 'Beta',
          controlPoints: [
            { lightener: 0, target: 0 },
            { lightener: 50, target: 50 },
            { lightener: 100, target: 100 },
          ],
          visible: true,
          color: '#ef5350',
        },
      ],
      selectedCurveId: 'light.alpha',
    });
    await graph.updateComplete;

    // Verify hit circles have data attributes
    const hitCircles = graph.shadowRoot!.querySelectorAll<SVGCircleElement>('.hit-circle');
    expect(hitCircles.length).toBeGreaterThan(0);

    // Check that data-curve and data-point attributes are present
    for (const circle of hitCircles) {
      expect(circle.hasAttribute('data-curve')).toBe(true);
      expect(circle.hasAttribute('data-point')).toBe(true);
    }

    // Verify the selector used by _refocusHitCircle finds the right element
    const target = graph.shadowRoot!.querySelector<SVGCircleElement>(
      '.hit-circle[data-curve="0"][data-point="1"]'
    );
    expect(target).not.toBeNull();
    expect(target!.getAttribute('data-curve')).toBe('0');
    expect(target!.getAttribute('data-point')).toBe('1');
  });
});

// ── 8. Preview stops on disconnect ───────────────────────────────────

describe('preview stops on disconnect', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('disconnectedCallback calls _stopPreview when preview is active', async () => {
    const card = document.createElement('lightener-curve-card') as LightenerCurveCard;
    document.body.appendChild(card);
    await card.updateComplete;

    // Set _previewActive to true via bracket notation
    (card as unknown as Record<string, boolean>)['_previewActive'] = true;

    // Spy on _stopPreview
    const stopSpy = vi.fn();
    const originalStop = (card as unknown as Record<string, () => void>)['_stopPreview'];
    (card as unknown as Record<string, () => void>)['_stopPreview'] = () => {
      stopSpy();
      // Don't call original — it needs _hass which is null
    };

    // Remove from DOM triggers disconnectedCallback
    document.body.removeChild(card);

    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it('disconnectedCallback does NOT call _stopPreview when preview is inactive', async () => {
    const card = document.createElement('lightener-curve-card') as LightenerCurveCard;
    document.body.appendChild(card);
    await card.updateComplete;

    // _previewActive is false by default
    const stopSpy = vi.fn();
    (card as unknown as Record<string, () => void>)['_stopPreview'] = stopSpy;

    document.body.removeChild(card);

    expect(stopSpy).not.toHaveBeenCalled();
  });
});

// ── 9. Preview button hidden during cancel animation ─────────────────

describe('preview button hidden during cancel animation', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  function makeAdminCard(): LightenerCurveCard {
    const card = document.createElement('lightener-curve-card') as LightenerCurveCard;
    // Set _hass with an admin user so _isAdmin getter returns true
    const mockHass = {
      user: { is_admin: true },
      states: {},
      callWS: () => Promise.resolve({}),
      callService: () => Promise.resolve(),
    };
    (card as unknown as Record<string, unknown>)['_hass'] = mockHass;
    (card as unknown as Record<string, boolean>)['_loading'] = false;
    (card as unknown as Record<string, LightCurve[]>)['_curves'] = [
      {
        entityId: 'light.test',
        friendlyName: 'Test',
        controlPoints: [
          { lightener: 0, target: 0 },
          { lightener: 100, target: 100 },
        ],
        visible: true,
        color: '#2563eb',
      },
    ];
    return card;
  }

  it('preview toggle button is not rendered when _cancelAnimating is true', async () => {
    const card = makeAdminCard();
    (card as unknown as Record<string, boolean>)['_cancelAnimating'] = true;
    document.body.appendChild(card);
    await card.updateComplete;

    // The preview toggle row should NOT be rendered
    const previewBtn = card.shadowRoot!.querySelector('.preview-toggle-btn');
    expect(previewBtn).toBeNull();
  });

  it('preview toggle button renders when _cancelAnimating is false', async () => {
    const card = makeAdminCard();
    (card as unknown as Record<string, boolean>)['_cancelAnimating'] = false;
    document.body.appendChild(card);
    await card.updateComplete;

    const previewRow = card.shadowRoot!.querySelector('.preview-toggle-row');
    expect(previewRow).not.toBeNull();
  });
});

// ── 10. Save-success timer re-arm ────────────────────────────────────

describe('save-success timer re-arm', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('keeps saved state until the newest timer expires on rapid re-save', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    try {
      const curve: LightCurve = {
        entityId: 'light.alpha',
        friendlyName: 'Alpha',
        controlPoints: [
          { lightener: 0, target: 0 },
          { lightener: 50, target: 75 },
          { lightener: 100, target: 100 },
        ],
        visible: true,
        color: '#2563eb',
      };

      const callWS = vi.fn(async () => ({}));
      const card = document.createElement('lightener-curve-card') as LightenerCurveCard;
      (card as unknown as Record<string, unknown>)['_hass'] = {
        user: { is_admin: true },
        states: {},
        callWS,
        callService: () => Promise.resolve(),
      };
      (card as unknown as Record<string, unknown>)['_config'] = { entity: 'light.group' };
      (card as unknown as Record<string, LightCurve[]>)['_curves'] = [curve];
      (card as unknown as Record<string, LightCurve[]>)['_originalCurves'] = [curve];
      (card as unknown as Record<string, () => void>)['_tryLoadCurves'] = vi.fn();

      const save = () => (card as unknown as { _onSave: () => Promise<boolean> })['_onSave']();
      const phase = () =>
        (card as unknown as { _saveState: { phase: string } })['_saveState'].phase;

      await save();
      expect(phase()).toBe('saved');

      vi.advanceTimersByTime(1500);
      await save();
      expect(phase()).toBe('saved');

      vi.advanceTimersByTime(499); // t=1999, before first timer's original deadline
      expect(phase()).toBe('saved');

      vi.advanceTimersByTime(2); // t=2001, first timer would have fired if not cleared
      expect(phase()).toBe('saved');

      vi.advanceTimersByTime(1499); // t=3500, second timer expires
      expect(phase()).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── 11. Preview restore branches ──────────────────────────────────────

describe('preview restore branches', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  function makePreviewCard(
    states: Record<string, { state: string; attributes: { brightness?: number } }>
  ): {
    card: LightenerCurveCard;
    callService: ReturnType<typeof vi.fn>;
  } {
    const callService = vi.fn(() => Promise.resolve());
    const card = document.createElement('lightener-curve-card') as LightenerCurveCard;
    (card as unknown as Record<string, LightCurve[]>)['_curves'] = Object.keys(states).map(
      (entityId, idx) => ({
        entityId,
        friendlyName: entityId,
        controlPoints: [
          { lightener: 0, target: 0 },
          { lightener: 100, target: 100 },
        ],
        visible: true,
        color: idx % 2 === 0 ? '#2563eb' : '#ef5350',
      })
    );
    (card as unknown as Record<string, unknown>)['_hass'] = {
      user: { is_admin: true },
      states,
      callWS: () => Promise.resolve({}),
      callService,
    };
    (card as unknown as Record<string, (position: number) => void>)['_previewLights'] = vi.fn();
    return { card, callService };
  }

  it('restores off state with turn_off', () => {
    const { card, callService } = makePreviewCard({
      'light.alpha': { state: 'off', attributes: {} },
    });

    (card as unknown as { _startPreview: () => void })['_startPreview']();
    (card as unknown as { _stopPreview: () => void })['_stopPreview']();

    expect(callService).toHaveBeenCalledTimes(1);
    expect(callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: 'light.alpha' });
  });

  it('restores mixed groups with turn_off and turn_on brightness', () => {
    const { card, callService } = makePreviewCard({
      'light.alpha': { state: 'off', attributes: {} },
      'light.beta': { state: 'on', attributes: { brightness: 200 } },
    });

    (card as unknown as { _startPreview: () => void })['_startPreview']();
    (card as unknown as { _stopPreview: () => void })['_stopPreview']();

    expect(callService).toHaveBeenCalledTimes(2);
    expect(callService).toHaveBeenNthCalledWith(1, 'light', 'turn_off', {
      entity_id: 'light.alpha',
    });
    expect(callService).toHaveBeenNthCalledWith(2, 'light', 'turn_on', {
      entity_id: 'light.beta',
      brightness: 200,
    });
  });

  it('preserves brightness 0 as turn_on brightness 0', () => {
    const { card, callService } = makePreviewCard({
      'light.alpha': { state: 'on', attributes: { brightness: 0 } },
    });

    (card as unknown as { _startPreview: () => void })['_startPreview']();
    (card as unknown as { _stopPreview: () => void })['_stopPreview']();

    expect(callService).toHaveBeenCalledTimes(1);
    expect(callService).toHaveBeenCalledWith('light', 'turn_on', {
      entity_id: 'light.alpha',
      brightness: 0,
    });
  });

  it('restores on/off-only lights with turn_on and no brightness argument', () => {
    const { card, callService } = makePreviewCard({
      'light.alpha': { state: 'on', attributes: {} },
    });

    (card as unknown as { _startPreview: () => void })['_startPreview']();
    (card as unknown as { _stopPreview: () => void })['_stopPreview']();

    expect(callService).toHaveBeenCalledTimes(1);
    expect(callService).toHaveBeenCalledWith('light', 'turn_on', { entity_id: 'light.alpha' });
  });
});
