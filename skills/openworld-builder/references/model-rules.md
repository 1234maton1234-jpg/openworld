# Model contract

Building limits and current upload behavior are verified against the project validator. Rigged avatars are supported through the animation contract below. Live `/api/world` rules override numeric limits when changed; format or placement changes require updating this reference.

## Buildings

- Units: meters; Y up; horizontal polygon coordinates are [X,Z]. Local boundary equals world polygon minus [plot.cx, plot.cz]. Older rectangular plots use width/depth around that center.
- The server centers the complete transformed model bounding box in X/Z on the plot center and places its lowest Y on the foundation. Moving the GLB root is not a way to choose a different position on the plot. Check every triangle after subtracting the model bounds' horizontal center. Roofs and accessories count toward both bounds and containment.
- Height follows live rules (`height: null` means no height cap); width/depth come from the owned plot, not a universal 64 m square. Every projected triangle must fit the actual polygon, not merely its bounding rectangle. Avoid adding a base that extends beyond that polygon.
- Land ownership, public roads, water and other players' plots are not editable model space. The 2 m separation between claims is handled by the server; do not subtract an additional 2 m from the downloaded boundary as an invented requirement.

## Seat compatibility

Buildings with usable chairs, benches or sofas must include seat markers. The runtime reads glTF node `extras.interaction`, loaded as Three.js `node.userData.interaction`. A chair mesh or a node named `chair` alone does not enable sitting. Existing model-hash fallbacks are legacy exceptions, not an authoring interface.

Export a separate empty node for each sitting place, parented under the building or chair. Place its origin at the intended sitting point on the seat surface, not at the chair's floor origin or backrest. For example, this glTF node defines a seat at local `[2, 0.48, -3]`:

```json
{
  "name": "seat_01",
  "translation": [2, 0.48, -3],
  "extras": {"interaction": {"type": "seat", "yaw": 0}}
}
```

- `type` must be `seat`. `yaw` is a finite number in radians, defaulting to 0. The facing vector is `[-sin(yaw), 0, -cos(yaw)]` in the marker's local coordinates: 0 faces -Z, π/2 faces -X. Marker and parent transforms also rotate this direction; avoid applying the same turn twice. Keep markers upright and avoid mirrored/nonuniform scale.
- Position comes from the node origin and its parent transforms. Fields such as `interaction.position`, `height`, `radius` or `label` are not read. Do not put one marker on both a chair parent and its child, which creates duplicate interactions. A long bench needs one marker per usable place, with sufficient spacing.
- In Blender, add an Empty and set `marker["interaction"] = {"type": "seat", "yaw": 0.0}`; enable **Custom Properties** (`export_extras=True`) for GLB export. Keep the Empty in the exported selection. Blender-to-glTF axis conversion also affects marker orientation, so inspect the exported marker's world direction. In Three.js authoring, assign `marker.userData.interaction` before export. Inspect the final GLB JSON to confirm the empty node, parent relationship and nested extras survived optimization/export. Extras are standard glTF metadata, not a forbidden extension; buildings still remain static and need no skeleton.
- The current prompt requires the player to be within 3.2 m of the marker plus a 0.4 m upward offset, looking toward it (direction dot product at least 0.82), with no blocking geometry in the visibility test. Leave an accessible approach, legroom and room to stand; walls, tables and tall backrests can block interaction. Decorative geometry does not automatically create a safe approach.
- `F` sits down; `F` again stands at the player's pre-sit position. The seated camera is 0.95 m above the marker; the character root is 0.90 m below it. Check the default avatar's hips against the cushion and avoid floating or embedded legs. Custom avatars use their own `sit` clip and are not automatically fitted to arbitrary chair dimensions. Seat markers do not implement exclusive occupancy, adjustable seating or furniture animation.
- Verify the exported GLB in game: approach from the intended side, see `F · 坐下`, sit facing the right way, inspect first/third person, then stand without getting trapped. Check every distinct chair orientation and bench layout. If only metadata/local preview was checked, report in-game interaction as unverified; upload validation alone does not prove seat usability.

## GLB resources

- GLB 2.0, one scene, triangle primitives, ordinary PBR materials.
- All categories: maximum 32 MiB, 100000 rendered triangles, 300000 rendered vertices, 512 nodes, 200 rendered primitives, 64 materials and 16 textures. Accessors at most 300000 elements; total decoded accessor allocation, including sparse data and animation, at most 32 MiB. At most 32 animation clips; avatars allow 4 skins and 128 joints per skin.
- No extensions (including Draco, meshopt and material extensions), external URIs or external buffers. Buildings must not contain skins, animations or morph targets. Avatar upload accepts skins and animation clips under the contract below.
- Embedded PNG/JPEG only, maximum 2048×2048 each, total at most 16×1024×1024 pixels. No animated images.
- Finite coordinates and valid glTF required. Keep bounds within ±10000 m of the model origin; an empty or microscopic model is rejected.
- Prefer merged static geometry and reused materials where appropriate; preserve geometry needed for the requested silhouette and gameplay access.
- The server generates visual LOD derivatives on demand, targeting 50% and 20% geometry with 1024/512 px textures. These are targets, not guaranteed ratios. Upload the finished original; automatic optimization does not bypass upload limits or replace authoring quality checks. Preserve silhouette with geometry and use textures for small details.
- Preserve node hierarchy, transforms, extras, avatar skin bindings/animation, seat markers and separately named moving vehicle parts. Never merge wheels into the body merely to reduce draws. Visual LOD does not replace original building collision or interaction data. Test animation, wheel rotation and seating after export, at near and far viewing distances.
- The client prioritizes nearby models within aggregate triangle, texture and draw budgets. A model passing upload validation can still be reduced or temporarily hidden in a crowded scene. Texture memory estimates include RGBA8 mipmaps and are not measured total GPU memory.

## Lighting tiers

These four tiers are a modeling convention for building and avatar emissive materials, not CLI options or runtime light presets. Follow the user's requested tier for each relevant surface; ordinary non-emitting surfaces remain at tier 0.

| Tier | Appearance | Typical use |
| --- | --- | --- |
| 0 | No emission; still receives the world's ambient and direct lighting. | Walls, unlit windows, switched-off lamps. |
| 1 | Very faint glow, subtle even at night. | Small indicators and restrained decorative accents. |
| 2 | Normal illuminated-window brightness, clearly lit without losing color or detail. | Lit windows and ordinary luminous panels. |
| 3 | Brightest tier, visibly stronger than tier 2 while retaining color and avoiding large overexposed areas. | Small lamp faces and strong luminous accents. |

- Use standard PBR `emissiveFactor` and optional embedded `emissiveTexture`; tier 0 uses `[0, 0, 0]`. Tier numbers are labels, not values to copy into `emissiveFactor`. Tune tiers 1–3 under the same exposure and world lighting so their relative brightness is clear.
- Do not export light objects or use light/material extensions, including `KHR_lights_punctual` and `KHR_materials_emissive_strength`. Emissive surfaces do not by themselves illuminate nearby geometry; world illumination remains controlled by the site.
- Keep emission limited to intended luminous parts instead of making the entire model glow. Inspect day and night appearance when the game preview is available, and report the selected tiers and any unverified preview conditions with the artifact.

## Avatars

- **Mandatory authoring requirement:** newly created character models must be rigged and skinned, not static figurines. Include a usable humanoid hierarchy (root/hips, spine, neck/head, paired upper/lower arms and hands, paired thighs/calves and feet), valid inverse bind matrices and normalized skin weights. Do not count merely adding bone names or parenting rigid body pieces as skinning.
- Author standing upright, facing -Z, Y up; target normalized height 1.8 m. Current accepted dimensions are width/depth at most 2 m and height 0.5–2.4 m.
- Verify deformation and movement for idle, walk, run, sitting and cycling. Arms must reach handlebars and legs must follow pedals without detached joints or severe stretching. Hair and clothes must follow their intended bones. Embedded named animation clips drive these actions, but actual in-game integration must be tested before claiming support.
- The default avatar is a behavioral reference: it currently animates separate procedural meshes, not a reusable skinned skeleton. Do not invent an existing bone-name contract or promise automatic compatibility.
- **Runtime contract:** all character meshes must have valid skin weights and joint indices. At most 4 skins and 128 joints per skin. Supply named clips `idle`, `walk`, `run`, `sit`, `cycle`; each clip must have 1–128 channels, positive duration no longer than 60 seconds, and at most 10000 keyframes per sampler. The runtime switches clips with a short crossfade; `sit` holds its final frame and `cycle` follows pedal phase. Bone names can vary because clips target the embedded skeleton. Author sit as a ready seated pose and cycle as one complete pedal turn. The client does not automatically retarget hand/foot contacts to vehicle geometry; inspect those contacts for each model.
- Building models remain static unless separately requested; this rigging requirement is specific to characters.
- `avatar set` replaces the current user's character directly and does not enter the building review queue. Use the same GitHub identity as the game. The client polls for updates roughly every 15 seconds.

## Vehicles

### Mandatory cockpit controls and instruments

- Every newly authored car must include a steering wheel that turns with steering input and an instrument display that updates from actual driving state. A fixed wheel, painted dial or static dashboard texture does not satisfy this requirement.
- Export exactly one node named `steering-wheel`, containing the complete moving rim, spokes and hub. Put its origin at the steering shaft center and align its local Z axis with the shaft. The runtime sets its local `rotation.z = (vehicle.steer || 0) * 1.5`; author neutral Z rotation as zero and place any fixed mounting orientation on a parent node. Keep the stationary column/dashboard outside the moving assembly. Do not merge the wheel into the car body or bake an animation clip.
- Export exactly one mesh named `instrument-screen` for the visible instrument face, with valid UVs and a single, dedicated textured material. The runtime replaces its color map with a canvas texture and sets its material color to white; do not share that material with the dashboard, trim or other geometry. Orient the face toward the driver, with upright, unmirrored UVs covering the display.
- For a circular dial, export glTF node `extras.roundDial = true` on `instrument-screen` (Three.js: `screen.userData.roundDial = true`). The runtime draws a 512×512 dial with a moving speed needle, numeric km/h and R/D/N indicator; its needle scale ends at 200 km/h. Omit the flag for the 512×256 rectangular display with speed, R/D/N and driving/braking status. R/D/N is inferred from travel direction and rest, not a simulated gearbox. The dashboard housing itself stays fixed.
- Verify the final GLB in game from the driver's first-person view: neutral alignment, left/right steering and return to center; accelerating, stopping, reversing and braking; readable instruments without wheel/dashboard obstruction. Verify the exported node names, pivot, UVs and `roundDial` extras survive export. State any unverified behavior explicitly; node names and upload acceptance alone do not prove working controls.
- Planes and boats must have appropriate modeled steering/pilot controls and instruments. The current runtime calls this animation/display contract only for cars; merely using these node names does not animate plane or boat controls or instruments. Report this runtime limitation, and do not claim functional aircraft/marine instruments or invent unsupported bindings.

### Seating layout

- Personal cars, planes and boats support **1, 2 or 4 seats total, including the driver**. Seat 0 is reserved for the owner/driver; other players use passenger seats. A one-seat car cannot carry passengers. Only summoned personal cars participate in shared seating; the locally spawned demonstration vehicles are not shared instances.
- New vehicle models should declare `extras.vehicle.seats` on exactly one exported node. Each entry is a seat-surface point `[X,Y,Z]` in meters, relative to the **complete car's centered X/Z and ground-level bottom**, after Y-up/-Z-forward export. These are normalized car-space coordinates, not the declaring node's local coordinates; node transforms do not rotate or translate the array. All seats face the car's forward -Z direction. Do not use building `interaction.type="seat"` markers for vehicles.
- Four-seat example (omit the last two entries for a two-seat car; use `[[0,0.65,0]]` for a one-seat car):

```json
{"extras":{"vehicle":{"seats":[[-0.35,0.65,-0.3],[0.35,0.65,-0.3],[-0.35,0.65,0.6],[0.35,0.65,0.6]]}}}
```

- Every point must contain three finite numbers. Car: X within ±0.85 m, Y 0.3–1.2 m, Z within ±1.5 m. Plane: X within ±4.8 m, Y 0.3–3.1 m, Z within ±3.7 m. Boat: X within ±1.3 m, Y 0.3–2.6 m, Z within ±3.2 m. Horizontal distance between seats must be at least 0.45 m. Declared points must fit the actual car bounds with at least 0.3 m remaining above the seat; this is only a coarse validation, not sufficient human headroom. Plan roughly 0.75–0.95 m from cushion to roof, legroom, unobstructed windows, and room on both sides for entry/exit. Do not add four markers inside a body that physically fits only two people. Older models without metadata use a two-seat fallback at X ±0.35, Y 0.65, Z 0; planes without seat metadata instead use X ±0.35, Y 1.15, Z -0.6. These fallbacks do not prove a good physical fit.
- Blender export: set a root Empty custom property `root["vehicle"] = {"seats": [[-0.35, 0.65, 0], [0.35, 0.65, 0]]}` and enable Custom Properties (`export_extras=True`). The numeric array is already in final game coordinates; Blender's axis conversion does not convert custom property numbers. Inspect the GLB JSON and use the normal `vehicle set` CLI command; there is no extra seat-count CLI flag. Building seat metadata and vehicle layout metadata are separate contracts.
- The seated avatar root is 0.87 m below the cushion and the first-person eye is 0.75 m above it. Fit the seat, dashboard, windshield and steering wheel around these points; avoid an opaque body shell across the interior. Custom avatar `sit` clips may have different proportions, so test contacts rather than promising universal fit. Passengers cannot steer or accelerate, and decorative door meshes do not automatically open.
- Nearby players look toward a stopped personal car and press `F` to board an available passenger seat, then `F` to exit. The server owns occupancy, rejects full cars and boarding while moving, and derives passenger positions from the car. Recall, owner disconnect, or invalidated seating releases passengers. Verify driver/passenger first and third person, simultaneous boarding, turning, safe exit, recall and disconnect. Model validation does not replace these multiplayer checks.

- Choose the runtime category explicitly: `car` (width 1.9 m, height 0.5–2 m, length 4.1 m), `plane` (wingspan 10 m, height 0.5–3.5 m, length 8 m), or `boat` (beam 3 m, height 0.5–3 m, length 7 m). These are maximum dimensions. Use meters, Y up, front facing -Z. The complete model is centered in X/Z and its bottom rests on the ground. Use the seating layout above for occupant and camera positions. Model geometry does not change the collision footprint.
- Export a self-contained static PBR GLB within the same GLB resource limits above; no skins, baked animation clips, morph targets or extensions. Vehicle models do not need humanoid bones.
- For animated wheels, export four separate assemblies named `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr` (front/rear, left/right). Each node origin must be at its axle center, with every tire/rim part beneath that node. Do not nest one wheel assembly in another. The runtime rotates the assembly around car X and steers front wheels around car Y. Unnamed or body-merged wheels stay static; inspect rolling, steering and first-person visibility in game before claiming correct integration.
- Upload with `node "<skill>/scripts/openworld.mjs" vehicle set "car.glb"` using the player's GitHub identity. The website does not accept GLB uploads. Add `--category plane` or `--category boat` for other categories; omitting it selects `car`. This replaces only that account's model in the selected category and preserves its other categories, becomes available publicly and does not enter building review. Do not claim it was reviewed. Existing online appearances may take about 15 seconds to update.
- Select a category in the account panel, then `P` summons or recalls one personal vehicle; `F` enters/exits and `O` changes perspective. Each category has a default model. Cars and planes need clear dry ground; boats need nearby water at least 0.8 m deep across the hull footprint and sufficient overhead clearance. Boat model bottoms sit 0.35 m below water level; keep seats and decks above that waterline. Planes use W/S throttle, A/D steering, E/Q climb/descent after reaching 12 m/s, Space braking, and a 600 m altitude ceiling. Boats use W/S throttle, A/D steering and Space braking. Land or dock and stop before exit/recall; no parachute or swimming is provided. For planes, use a pilot seat around Y 1.15, Z -0.6 and model a usable cockpit view. An optional node named `propeller` rotates around its own local Z axis; center its origin on the shaft. Disconnecting recalls the vehicle; the uploaded model remains saved for next time. Cars are personal instances, not shared vehicles that other players can claim or drive.

## Review

- At most one pending submission per user, 20 submission versions and 20 unsubmitted drafts under current implementation.
- `plot upload` creates a draft; `plot submit ID` creates pending review. Only an administrator can approve it.
- Private assets are not public before approval. A rejected model requires correction. Deleting a plot removes its drafts and submissions; old IDs cannot be reused on a newly claimed plot.
