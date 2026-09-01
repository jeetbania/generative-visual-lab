/**
 * Behavior primitives — how an agent (a particle, a strand control point, an
 * anchor) responds to a sampled field vector. These are the generic verbs
 * that let ANY field drive ANY geometry:
 *
 *   FieldEngine.sample(x,y,t)  --field vector-->  a Behavior  --new x,y,vx,vy-->  Agent
 *
 * A particle system, a strand point and an elastic-grid node all move
 * through one of these — only the field feeding them and the shape drawn on
 * top differs. That's the composability the design-system pass asked for:
 * "a particle system should be able to follow a magnetic field" and "a
 * string system should be able to follow curl noise" are both just this
 * file's `accelerate` / `spring` behaviors fed by different FieldEngine
 * configurations.
 */

export interface Agent {
  x: number; y: number;
  vx: number; vy: number;
}

export interface Vec2 { x: number; y: number }

/** Pure advection — velocity IS the field (no inertia). Used by flow-field
 *  style effects where particles trace streamlines directly. */
export function behaviorFlow(agent: Agent, field: Vec2, dt: number, speed = 1) {
  agent.vx = field.x * speed;
  agent.vy = field.y * speed;
  agent.x += agent.vx * dt;
  agent.y += agent.vy * dt;
}

/** Newtonian accelerate-and-drag — the field is a force, not a velocity.
 *  Used by magnetic/gravitational/attractor systems. */
export function behaviorAccelerate(agent: Agent, field: Vec2, dt: number, opts: { accel?: number; drag?: number; maxSpeed?: number } = {}) {
  const accel = opts.accel ?? 1, drag = opts.drag ?? 0.02;
  agent.vx = (agent.vx + field.x * accel * dt) * (1 - drag);
  agent.vy = (agent.vy + field.y * accel * dt) * (1 - drag);
  if (opts.maxSpeed) {
    const s = Math.hypot(agent.vx, agent.vy);
    if (s > opts.maxSpeed) { agent.vx = (agent.vx / s) * opts.maxSpeed; agent.vy = (agent.vy / s) * opts.maxSpeed; }
  }
  agent.x += agent.vx * dt;
  agent.y += agent.vy * dt;
}

/**
 * Spring-damper toward a rest position, with the field as an extra applied
 * force — this is how String Field's strands stay coherent while still
 * bending to turbulence/mouse fields. `dt` is expected ~1 at 60fps (i.e.
 * `ctx.dt * 60`), matching every other Behavior in this file; internally the
 * FORCE term (not the velocity->position integration) is applied at a much
 * smaller effective step so a full-strength repel force (calibrated for
 * accelerate-behavior particles) can't blow a displacement-based spring past
 * its neighborhood in a single frame.
 */
export function behaviorSpring(agent: Agent, rest: Vec2, field: Vec2, dt: number, spring: number, damping: number) {
  const forceStep = dt * 0.06;
  const fx = (rest.x - agent.x) * spring + field.x;
  const fy = (rest.y - agent.y) * spring + field.y;
  agent.vx = (agent.vx + fx * forceStep) * damping;
  agent.vy = (agent.vy + fy * forceStep) * damping;
  agent.x += agent.vx * dt;
  agent.y += agent.vy * dt;
}

/** Orbit a center at a target radius/angular speed, with the field able to
 *  perturb the radius (in) or the angular speed (tangential component). */
export function behaviorOrbit(
  agent: { x: number; y: number; angle: number; radius: number },
  center: Vec2, targetRadius: number, angularSpeed: number, dt: number,
  field: Vec2 = { x: 0, y: 0 }, radiusSpring = 0.06,
) {
  const dx = Math.cos(agent.angle), dy = Math.sin(agent.angle);
  const radial = field.x * dx + field.y * dy;
  const tangential = -field.x * dy + field.y * dx;
  agent.radius += (targetRadius - agent.radius) * radiusSpring + radial * dt;
  agent.angle += angularSpeed * dt + tangential * dt * 0.002;
  agent.x = center.x + Math.cos(agent.angle) * agent.radius;
  agent.y = center.y + Math.sin(agent.angle) * agent.radius;
}
