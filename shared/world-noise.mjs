import {hash as legacyHash} from './terrain.mjs';
export const WORLD_SEED=90620281;
export const hash=(x,z,salt=0)=>legacyHash(x,z,salt^WORLD_SEED);
