import {VEHICLE_TYPES} from '../shared/vehicle-types.mjs';

// Point-mass aerodynamic model for the plane. Lift grows with the square of the
// airspeed and with the angle of attack, collapses past the stall angle and
// carries induced drag; the flight-path and bank angles each have their own
// inertia, so the nose leads the trajectory instead of moving the aircraft
// vertically on the frame the key is pressed.
export const FLIGHT={
  gravity:9.8,
  stallSpeed:12,        // reference speed the lift constant is calibrated against
  clAlpha:1.6,          // lift-curve slope, per radian
  alphaStall:.28,       // 16 deg
  stallDecay:4,
  stallFloor:.25,       // residual lift once fully stalled
  cd0:2.58e-3,          // parasitic drag, calibrated so full thrust balances drag at VEHICLE_TYPES.plane.max
  induced:.026,         // induced drag
  thetaMax:.38,         // 21.8 deg; stays under the .4 pose clamp in shared/player-state.mjs
  pitchRate:4.5,
  bankMax:1.22,         // 70 deg
  bankRate:2.2,
  bankReturn:1.4,       // wings level themselves when the stick is centred
  airbrake:14,
  overspeed:1.25,       // diving may exceed the level maximum
  groundFriction:.6,
};
export const CLMAX=FLIGHT.clAlpha*FLIGHT.alphaStall;
// Chosen so that CLMAX at stallSpeed produces exactly one gravity of lift; the
// 12 m/s takeoff threshold is therefore emergent rather than hard-coded.
const LIFT_K=FLIGHT.gravity/(FLIGHT.stallSpeed**2*CLMAX);
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
const approach=(from,to,rate,dt)=>from+(to-from)*(1-Math.exp(-rate*dt));

export function liftCoefficient(alpha){
  const magnitude=Math.abs(alpha);
  if(magnitude<=FLIGHT.alphaStall)return FLIGHT.clAlpha*alpha;
  return Math.sign(alpha)*CLMAX*Math.max(FLIGHT.stallFloor,1-(magnitude-FLIGHT.alphaStall)*FLIGHT.stallDecay);
}

// v.speed is total airspeed, v.gamma the flight-path angle, v.theta the nose
// attitude and v.bank the roll angle (positive rolls right). floor is the
// surface height under the aircraft, or null when the caller has none.
export function stepFlight(v,input,dt,surfaceY){
  const spec=VEHICLE_TYPES.plane,ground=surfaceY==null?-Infinity:surfaceY;
  v.speed??=0;v.gamma??=0;v.theta??=0;v.bank??=0;
  const elevator=Number(!!input.up)-Number(!!input.down);
  const aileron=Number(!!input.right)-Number(!!input.left);
  const throttle=Number(!!input.forward)-Number(!!input.back);
  const onGround=v.y<=ground+.02;

  // The elevator holds the nose attitude, the ailerons hold the bank angle; on
  // the ground the ailerons level the wings and steer the nosewheel instead.
  v.theta=approach(v.theta,elevator*FLIGHT.thetaMax,FLIGHT.pitchRate,dt);
  if(onGround){
    v.bank=approach(v.bank,0,FLIGHT.bankRate,dt);
    v.heading-=aileron*Math.min(.5,Math.abs(v.speed)*.04)*dt;
  }else v.bank=approach(v.bank,aileron*FLIGHT.bankMax,aileron?FLIGHT.bankRate:FLIGHT.bankReturn,dt);

  // Angle of attack is the nose attitude measured against the trajectory, so a
  // climbing aircraft settles at a small alpha while a slow one stalls.
  const alpha=clamp(v.theta-v.gamma,-1.2,1.2),cl=liftCoefficient(alpha);
  const airspeed2=v.speed*v.speed,lift=LIFT_K*airspeed2*cl*Math.cos(v.bank);
  const drag=airspeed2*(FLIGHT.cd0+FLIGHT.induced*cl*cl)+(input.brake?FLIGHT.airbrake:0)+(onGround?FLIGHT.groundFriction:0);
  const thrust=throttle&&!input.brake?throttle*spec.accel:0;
  // The point mass model degenerates at zero airspeed: there is no trajectory to
  // accelerate along and none to pitch, so a parked aircraft would otherwise
  // creep forward on the gravity-along-path term alone.
  const flying=v.speed>.5;
  const alongPath=flying?FLIGHT.gravity*Math.sin(v.gamma):0;
  v.speed=clamp(v.speed+(thrust-drag-alongPath)*dt,0,spec.max*FLIGHT.overspeed);
  // Rolling to a halt must not undo the first increment of a standing start.
  if(onGround&&!thrust&&v.speed<.5)v.speed=0;

  const inertia=Math.max(4,v.speed);
  v.gamma=clamp(v.gamma+(flying?(lift-FLIGHT.gravity*Math.cos(v.gamma))/inertia*dt:0),-1.4,1.4);
  if(onGround&&v.gamma<0)v.gamma=0;
  if(flying&&!onGround)v.heading-=lift*Math.sin(v.bank)/inertia*dt;

  v.pitch=v.theta;v.roll=-v.bank;
  const forward=v.speed*Math.cos(v.gamma)*dt;
  let y=v.y+v.speed*Math.sin(v.gamma)*dt;
  if(y<=ground){y=ground;if(v.gamma<0)v.gamma=0;}
  return {x:v.x-Math.sin(v.heading)*forward,y:Math.min(600,y),z:v.z-Math.cos(v.heading)*forward};
}
