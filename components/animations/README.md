# Map animation segments

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
