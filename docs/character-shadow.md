# Character shadow integration

Source: `delivery(1).zip`, `delivery/src/lighting/shadow/`, using the project's Three.js r180. Local fix: the adapter samples the walking surface beneath the avatar; camera depth includes airborne clearance so jumping head shadows are not clipped. Resolution, extent and PCF sample count are unchanged. Covered by `test/character-shadow.test.mjs`.

The local avatar uses a 256×256 shadow map covering 4 metres, with radius 4.7. It replaces that avatar's main-map casting, follows the atmosphere's directional light, and runs before either normal or postprocessed rendering. Terrain and building load callbacks refresh receiver materials; avatar changes reuse the same render target.

Open `/game` and press O for third person. Compare `/game?characterShadow=0` to disable the integration entirely. The world's `data-character-shadow` attribute reports injection counts and shadow depth diagnostics without GPU readback.

Scope: local avatar only. Existing avatar visibility remains authoritative, so an invisible first-person body does not cast a full-body shadow. Remote players do not allocate additional maps. VR behavior and mobile GPU performance have not been validated. Unsupported unlit/custom shader materials do not receive this shadow.

Browser self-check (uses the project's installed Three.js, not the supplied prebuilt bundle):

```powershell
npx esbuild test/browser/character-shadow.js --bundle --format=esm --outfile=work/shadow-check/check.js
```

Serve a page loading that module and check `#out` for 36 passes and zero failures. The fixture covers model replacement, streaming materials, light direction, shadow-map reuse, XR guard and directional-only light attenuation.
