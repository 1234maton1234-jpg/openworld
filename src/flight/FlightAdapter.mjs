/**
 * Host integration for the plane — the half of the flight code whose shape is
 * decided by the game rather than by the aerodynamics.
 *
 * `FlightModel.mjs` answers "given these controls and this airspeed, where does
 * the aircraft go next"; this file answers the questions only the host can:
 *
 * 1. **How often to integrate.** The model is stiff enough that a single 60 fps
 *    step visibly changes the answer, and the host hands us whatever `dt` the
 *    frame produced (a tab that was backgrounded can deliver a large one), so
 *    the frame is cut into fixed 1/120 s substeps and clamped to 50 ms of
 *    simulated time. Same treatment the boat branch already used.
 *
 * 2. **Whether a move is legal.** Collision lives in `vehicles.mjs`'s `clear()`
 *    and is passed in as `canMove`, so this file stays free of the building
 *    grid. A blocked substep zeroes the airspeed and abandons the rest of the
 *    frame, which is what the boat and car branches do too.
 *
 * 3. **What "the ground" is.** The terrain solver reports water as anything
 *    below `WATER_LEVEL`, and water is not a runway, so an aircraft over it
 *    flies against `MIN_RUNWAY`. Resolved once per frame rather than per
 *    substep — `surface()` walks the building grid and would otherwise be
 *    called six times a frame instead of once.
 */

import {stepFlight} from './FlightModel.mjs';

export const INTEGRATION_HZ=120,MAX_FRAME=.05,WATER_LEVEL=.5,MIN_RUNWAY=.8;

// Lowest surface the aircraft may rest on at (x,z): the terrain where there is
// land, a fixed minimum where there is only water.
export const runwayFloor=surface=>(x,z)=>{const h=surface(x,z);return h>=WATER_LEVEL?h:MIN_RUNWAY;};

// Fixed-substep integrator. Mutates v in place so the caller's object identity
// survives, matching the car and boat branches of driveStep.
export function stepPlane(v,input,dt,canMove,floorAt){
  dt=Math.max(0,Math.min(dt,MAX_FRAME));
  const steps=Math.max(1,Math.ceil(dt*INTEGRATION_HZ)),step=dt/steps;
  const floor=floorAt?floorAt(v.x,v.z):null;
  for(let i=0;i<steps;i++){
    const next=stepFlight(v,input,step,floor);
    if(!canMove(next.x,next.z,v.heading,next.y)){v.speed=0;break;}
    v.x=next.x;v.y=next.y;v.z=next.z;
  }
}
