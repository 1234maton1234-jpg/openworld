# Model contract

Building limits and current upload behavior are verified against the project validator. Rigged avatars are supported through the animation contract below. Live `/api/world` rules override numeric limits when changed; format or placement changes require updating this reference.

## Buildings

- Units: meters; Y up; horizontal polygon coordinates are [X,Z]. Local boundary equals world polygon minus [plot.cx, plot.cz]. Older rectangular plots use width/depth around that center.
- The server centers the complete transformed model bounding box in X/Z on the plot center and places its lowest Y on the foundation. Moving the GLB root is not a way to choose a different position on the plot. Check every triangle after subtracting the model bounds' horizontal center. Roofs and accessories count toward both bounds and containment.
- Current limit: height 24 m; width/depth from the owned plot, not a universal 64 m square. Every projected triangle must fit the actual polygon, not merely its bounding rectangle. Avoid adding a base that extends beyond that polygon.
- Land ownership, public roads, water and other players' plots are not editable model space. The 2 m separation between claims is handled by the server; do not subtract an additional 2 m from the downloaded boundary as an invented requirement.

## GLB resources

- GLB 2.0, one scene, triangle primitives, ordinary PBR materials.
- Maximum 12 MiB, 100000 triangles, 512 nodes, 200 rendered primitives, 16 textures. Accessors at most 300000 elements.
- No extensions (including Draco, meshopt and material extensions), external URIs or external buffers. Buildings must not contain skins, animations or morph targets. Avatar upload accepts skins and animation clips under the contract below.
- Embedded PNG/JPEG only, maximum 2048×2048 each, total at most 16×1024×1024 pixels. No animated images.
- Finite coordinates and valid glTF required. Keep bounds within ±10000 m of the model origin; an empty or microscopic model is rejected.
- Prefer merged static geometry and reused materials where appropriate; preserve geometry needed for the requested silhouette and gameplay access.

## Avatars

- **Mandatory authoring requirement:** newly created character models must be rigged and skinned, not static figurines. Include a usable humanoid hierarchy (root/hips, spine, neck/head, paired upper/lower arms and hands, paired thighs/calves and feet), valid inverse bind matrices and normalized skin weights. Do not count merely adding bone names or parenting rigid body pieces as skinning.
- Author standing upright, facing -Z, Y up; target normalized height 1.8 m. Current accepted dimensions are width/depth at most 2 m and height 0.5–2.4 m.
- Verify deformation and movement for idle, walk, run, sitting and cycling. Arms must reach handlebars and legs must follow pedals without detached joints or severe stretching. Hair and clothes must follow their intended bones. Embedded named animation clips drive these actions, but actual in-game integration must be tested before claiming support.
- The default avatar is a behavioral reference: it currently animates separate procedural meshes, not a reusable skinned skeleton. Do not invent an existing bone-name contract or promise automatic compatibility.
- **Runtime contract:** all character meshes must have valid skin weights and joint indices. At most 4 skins and 128 joints per skin. Supply named clips `idle`, `walk`, `run`, `sit`, `cycle`; each clip must have 1–128 channels, positive duration no longer than 60 seconds, and at most 10000 keyframes per sampler. The runtime switches clips with a short crossfade; `sit` holds its final frame and `cycle` follows pedal phase. Bone names can vary because clips target the embedded skeleton. Author sit as a ready seated pose and cycle as one complete pedal turn. The client does not automatically retarget hand/foot contacts to vehicle geometry; inspect those contacts for each model.
- Building models remain static unless separately requested; this rigging requirement is specific to characters.
- `avatar set` replaces the current user's character directly and does not enter the building review queue. Use the same GitHub identity as the game. The client polls for updates roughly every 15 seconds.

## Review

- At most one pending submission per user, 20 submission versions and 20 unsubmitted drafts under current implementation.
- `plot upload` creates a draft; `plot submit ID` creates pending review. Only an administrator can approve it.
- Private assets are not public before approval. A rejected model requires correction. Deleting a plot removes its drafts and submissions; old IDs cannot be reused on a newly claimed plot.
