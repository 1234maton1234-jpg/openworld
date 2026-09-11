import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('public pages use openworldcraft branding and expose the builder skill while claiming land',async()=>{
  const [landing,game,admin,map,cockpit]=await Promise.all(['public/index.html','public/game.html','public/admin.html','src/world-map.mjs','src/cockpit.mjs'].map(file=>readFile(file,'utf8')));
  for(const source of [landing,game,admin,map,cockpit])assert.match(source,/openworldcraft/i);
  assert.match(game,/https:\/\/github\.com\/Mirako-Official\/openworld-builder/);
  assert.match(game,/id="builder-skill"/);assert.match(game,/id="builder-onboarding"/);assert.match(game,/id="builder-installed" disabled/);
  assert.doesNotMatch(game,/id="admin"|审核工作台/);
});
