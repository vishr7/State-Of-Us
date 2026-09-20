# Map animation segments

## Power outage event scene

Preview `PowerOutageAnimation.tsx` at `/demo/power-outage` with `npm run dev`.
The page includes a large version and a 360px result panel matching the existing
neighborhood drawer. The panel starts on demand for a lit/dark comparison.

```tsx
import PowerOutageAnimation from '@/components/animations/PowerOutageAnimation';

<PowerOutageAnimation width="100%" autoPlay loop={false} showReplayButton />
```

Props: `width`, `height` (numeric pixels or CSS sizes), `autoPlay` (true), `loop`
(false), `onComplete`, `className`, `showReplayButton` (true), and
`showEmergencyLights` (true). Callbacks must come from a client component. Mount
on an event or change the React `key` to start afresh; hide controls for overlays.
This component has no API, simulation, event-classification or state-store hooks.

The 360×280 SVG caps width to its container and letterboxes explicit heights
without cropping. Window glass stays roughly 5px wide inside a padded 360px panel.
The source apartment and garden are atlas cells 4 and 13, unchanged. Fourteen
small facade-aligned window overlays, the sprite's two existing streetlamps, a utility box,
and an optional amber backup light use the existing warm gold/slate palette.
The atlas has baked-in daytime shading; twilight tint preserves its texture,
so this is illustrative lighting rather than a relit sprite or live map tile.

Playback lasts 4.5 seconds: a powered hold, two low-amplitude local lighting dips,
three staggered circuits switching off, streetlamp loss, a tiny contact spark,
and a stable dark scene. Only local lights dip; ambient shading changes smoothly.
Fixed glass positions, circuit offsets and pure timeline math avoid render-time
randomness. SSR and the first client render both show the powered state.

Reduced motion shows the final outage even with autoplay disabled. Turning the
preference on during playback settles immediately; looping is suppressed.
Completion fires once per completed play, including reduced-motion autoplay.
Replay cancels the current play. Explicit looping holds the final state for 1.4
seconds between plays. Unmount cleans up frames, timers and preference listeners.
An accessible SVG description, polite status and keyboard replay are included.

## Protest event scene

`ProtestEventAnimation.tsx` is a decorative, reusable scene. Preview it at
`/demo/protest` with `npm run dev`; the page includes a large scene and a 360px
result panel using the existing drawer palette and spacing.

```tsx
import ProtestEventAnimation from '@/components/animations/ProtestEventAnimation';

<ProtestEventAnimation width="100%" autoPlay loop={false} showReplayButton />
```

Optional props: `width`, `height` (CSS sizes or numeric pixels), `autoPlay`
(default true), `loop` (default false), `onComplete`, `className`, and
`showReplayButton` (default true). Pass callbacks from a client component.
Hide controls for overlays; mount on an event or change `key` to start a new
sequence. No event classification, API calls or game-state changes are included.

The 360×280 scene preserves its aspect ratio and letterboxes explicit heights.
Width is capped by its parent. Nine citizens remain about 24px tall in a padded
360px panel. Very narrow containers or short explicit heights reduce readability.
The civic hall (14), shop (6), and trees (12) reuse `city-atlas.png`. Citizens use
the actual map renderer via `drawCitizen`, with fixed IDs and outfit colors;
their proportions, cosmetics and palette are unchanged. Signs are small canvas
pixel shapes with equality, home and heart symbols. No additional assets.

A 4.6-second timeline staggers entrances, walking strides, sign raises and subtle
individual bobbing/waving, then stops on a stable crowd. A single canvas avoids
per-person DOM trees and per-frame React updates. Fixed configurations and pure
frame math ensure repeatability; browser APIs run only after hydration. The
server renders the city backdrop and an accessible scene description.

Reduced motion shows the complete static protest, even with autoplay disabled.
Turning reduced motion on during playback settles immediately. Explicit looping
pauses 1.2 seconds between plays and is suppressed for reduced motion. Completion
fires once per completed play (including reduced-motion autoplay); replay cancels
the previous play. Unmount cancels animation frames, listeners and loop timers.
The live region announces gathering/completion; replay is keyboard accessible.

The scene is an illustrative civic square rather than a live map tile. The
preview does not wire it to simulation events. Canvas citizens appear after
hydration, as with the existing resident portraits.

`demolition.ts` draws a wrecking ball falling from the sky, an impact ring and dust.
At impact, CityCanvas removes the target building from both cached sprite layers,
leaving the ground visible. Animations use world coordinates so zoom and pan stay
aligned. Reduced-motion preferences skip the falling ball.

Trigger a segment after an event is confirmed or its decision resolves:

```ts
useAnimationStore.getState().demolish({ id: event.id, tx, ty });
```

Import `useAnimationStore` from this folder's `store.ts`. Supply the actual map
tile, not screen pixels. Invalid tiles and protected landmarks are rejected.
IDs are deduplicated and segments run in order. Removal lasts for the browser
session; this visual store does not mutate simulation finances or database lots.
Persist authoritative cleared lots separately when building-level storage exists.

The map also recognizes active events whose title explicitly says demolition or
demolish and selects an ordinary building near the affected neighborhood as a
representative lot. This is a visual location, not a real street address.

## Standalone wrecking-ball demolition

Run `npm run dev` and visit `/demo/demolition` for the standalone preview.

```tsx
// Inside a client component:
import WreckingBallDemolition from '@/components/animations/WreckingBallDemolition';

<WreckingBallDemolition
  width="100%"
  height="auto"
  autoPlay
  loop={false}
  showReplayButton
  onImpact={() => console.log('Impact')}
  onComplete={() => console.log('Complete')}
/>
```

All props are optional. Defaults are shown above; `className` is also accepted. Width is capped by the container. Numeric dimensions use pixels; strings accept CSS sizes. SVG preserves its aspect ratio.

The scene uses a compact 430×395 viewBox. The ball begins just above the scene, enters from the top and remains within the frame through impact and settling. It fits the 360px neighborhood-drawer width, including normal panel padding. Controls wrap and become more compact below 380px. Explicit height uses SVG containment without cropping; omit height for the natural aspect ratio. `/demo/demolition` includes both a large preview and a 360px result-panel example; the smaller example starts on button press.

There is no crane or cable. A large faceted steel ball falls vertically with quadratic acceleration, briefly recoils at the roof and follows the collapsing structure down into the rubble. Strong damped shaking, spreading cracks, staggered falling sections, overlapping dust and a short settle share one timeline. Geometry tests cover acceleration, constant horizontal position, bounds after entry and continuity at phase boundaries.

The 4.8-second Framer Motion timeline hits at about 1.68 seconds. A single progress value drives deterministic sprite bands, ball position and dust. Each callback fires once per play; replay starts a fresh play. Unmounting stops playback and pending loop restarts. `autoPlay={false}` initially holds the intact scene and shows a Start button. For an externally triggered event, mount the component when needed, or change its React `key` to restart it.

Looping is explicit and pauses for one second between plays. Reduced motion skips to rubble with a short 150ms lifecycle, still fires both callbacks, and disables looping. The preference is read after hydration, once per mount; remount to pick up a changed OS preference. The server and initial browser render always contain the same intact scene and SVG attributes. The status is announced through a polite live region, and the button supports keyboard focus.

Art uses the existing `public/sprites/city-atlas.png` directly, with the same 4×4 cell layout as CityCanvas: apartment (4), shop (6), trees (12) and garden (13). No new image assets are required. Warm ground, slate streets, green terrain, isometric rubble and flat shaded steel match the map palette. Collapse slices the apartment illustration while preserving its sidewalk base; this is a visual effect, not new building artwork.

This is a decorative animation, not a physics simulation. It does not call APIs or change game state. The demo is intentionally separate from event UI. Browser visual regression tooling is not currently installed in this repository.
