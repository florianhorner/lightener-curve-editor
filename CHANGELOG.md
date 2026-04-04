# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.9.0-dev.1] - 2026-04-04

### Added

- Colorblind-safe curve palette: replaced green colors with indigo and brown
- Shape markers in legend (circle, square, diamond, triangle, bar) for color-independent identification
- Loading indicator with pulse animation while curves are being fetched
- "Editing: {name}" label in graph header showing which curve is selected
- Retry links on load and save errors ("Tap to retry")
- Keyboard support for scrubber slider (arrow keys, Shift+arrow, Home/End)
- CSS type scale custom properties (--text-xs/sm/md/lg) for consistent typography
- Synced side-by-side light/dark demo cards in dev.html

### Fixed

- Right-click to remove control points now works (pointerdown was intercepting right-click button)
- Success status now uses blue (#2563EB) with checkmark icon instead of green (colorblind-safe)
- Error messages now include warning triangle icon for visual distinction from success
- Hint text contrast bumped from 0.6 to 0.8 opacity for WCAG AA compliance
- Selection hint centered in graph area instead of hidden in bottom corner

## [2.8.1] - 2026-04-04

### Fixed

- Restored Lightener setup for migrated configurations
- Fixed brightness mapping migration handling to avoid double-wrapping
- Fixed the `configuration.yaml` setup path when using migrated config data

### Added

- Interactive brightness curve editor card (`custom:lightener-curve-card`)
  - Visual editing of per-light brightness curves directly in the HA dashboard
  - Smooth bezier curves with gradient fills
  - Colorblind-accessible dash patterns to distinguish curves
  - Brightness scrubber with real-time bar gauge readouts per light
  - Keyboard shortcuts: Ctrl+S to save, Esc to cancel
  - Unsaved-changes guard (browser prompt before navigating away)
  - Light and dark theme support via Home Assistant CSS custom properties
  - Mobile-responsive layout with touch-optimised controls
- WebSocket API (`lightener/get_curves`, `lightener/save_curves`) for reading and writing brightness configs from the frontend
  - Read access available to all authenticated users (for dashboard display)
  - Write access restricted to Home Assistant administrators

### Changed

- Renamed HACS display name to "Lightener Curve Editor" to avoid confusion with upstream

### Fixed

- Home Assistant 2026.x compatibility (`async_register_static_paths` API)
- Overlapping curves: selected curve now renders on top so all control points stay clickable
- Curve load race condition when Home Assistant sends rapid state updates
- Legend name truncation for long entity names
- Dirty-state indicator not clearing after save
- Small hit targets making control points hard to grab
- Timer leak when card is removed from the DOM

### Also includes

- Recent UI polish, theming, mobile, and release-readiness improvements validated in the release candidate

## [2.4.0] - Upstream

This version matches [fredck/lightener](https://github.com/fredck/lightener) v2.4.0,
from which this fork was created. All upstream functionality is included unchanged.
