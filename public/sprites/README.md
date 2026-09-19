# Illustrated city atlas

`city-atlas.png` was generated with the built-in image generation tool using the user's second city screenshot as the visual reference. It contains 16 independent transparent cells, read directly by `CityCanvas.tsx`; it is not a flattened city background.

Rows: homes and cafe; apartments, shop and library; hospital, school, park and construction; trees, garden, civic hall and transit.

The map uses these illustrations with existing canvas terrain and bridges. Housing, environment and transit policies change representative project lots to construction, then their category's sprite on a later turn. These visuals illustrate enactment; they are not a building-level simulation or a promise that every delayed financial effect has completed.

## Generation prompt

Use case: stylized-concept. Create a production 2D isometric city building sprite atlas for State of Us. The SECOND attached screenshot is the art reference: richly detailed illustrated pixel-art city game, warm brick, slate roofs, lush leafy trees, fine windows, storefront awnings, sidewalks. The FIRST screenshot is the style to replace, avoid its plain cuboids. Output a square transparent PNG atlas with exactly 4 columns and 4 rows of equally sized cells, 16 isolated sprites total, one object centered within each cell, generous transparent margins, no contact between cells, no text or labels or interface. Consistent 2:1 isometric projection, light upper left, fixed camera, same scale, crisp detailed hand-painted pixel edges, no 3D render. Row 1: red brick townhouses; cream Victorian house with garden; blue roof corner apartments; brick corner cafe with striped awning. Row 2: four-story affordable apartments; elegant five-story stone apartments; neighborhood shop; small library with green roof. Row 3: small hospital; school; leafy park with fountain; construction site with small crane. Row 4: cluster of lush deciduous trees; small community garden; red brick civic hall; transit shelter with blue bus. Each includes a compact diamond sidewalk/grass footprint, fully contained within its cell, transparent outside the footprint. Buildings modest height, carefully detailed, highly consistent professional game tileset. All cells equal, no grid lines.

## District layout and camera

The illustrated map uses a warm stone backdrop and slate-blue rivers. Shadyside has villas, garden lots and a village green; Downtown has denser apartment blocks and a civic square; Lawrenceville mixes shops and housing; Homewood has rowhouses and community gardens. The arrangement is illustrative, not geographically exact.

Static city artwork is cached in an offscreen canvas. Pointer capture, frame-driven camera updates, a short inertial glide and cursor-anchored wheel zoom keep navigation responsive. The shared viewport is committed after gestures settle, so dragging does not resize or rebuild the city.
