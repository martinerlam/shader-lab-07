export const SIM_VERT = `
precision highp float;
in vec3 position;
out vec2 vUv;
void main(){
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SIM_FRAG = `
precision highp float;

in vec2 vUv;

uniform sampler2D uPosTex;
uniform sampler2D uVelTex;

uniform float uDt;
uniform float uForce;
uniform float uFlowScale;
uniform float uDamp;
uniform float uBounce;
uniform vec3  uBounds;

uniform vec3  uPointerPos;
uniform vec3  uPointerVel;
uniform float uStirStrength;
uniform float uStirRadius;

layout(location=0) out vec4 outPos;
layout(location=1) out vec4 outVel;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float soft01(float x){ return clamp(x, 0.0, 1.0); }

vec3 wallRepel(vec3 p, vec3 b, float skin, float strength){
  // Signed distance to each wall (positive inside)
  float dx = b.x - abs(p.x);
  float dy = b.y - abs(p.y);
  float dz = b.z - abs(p.z);

  vec3 f = vec3(0.0);
  // quadratic falloff inside a 'skin' band near the wall
  if (dx < skin) f.x = sign(p.x) * -strength * pow(soft01((skin - dx) / max(1e-4, skin)), 2.0);
  if (dy < skin) f.y = sign(p.y) * -strength * pow(soft01((skin - dy) / max(1e-4, skin)), 2.0);
  if (dz < skin) f.z = sign(p.z) * -strength * pow(soft01((skin - dz) / max(1e-4, skin)), 2.0);
  return f;
}

vec3 tinyJitter(vec2 uv){
  // deterministic tiny noise per particle
  float n1 = hash12(uv + vec2(12.3, 45.6));
  float n2 = hash12(uv + vec2(78.9, 10.1));
  float n3 = hash12(uv + vec2(33.3, 66.6));
  return vec3(n1, n2, n3) - 0.5;
}

vec3 vortexField(vec3 p, float t){
  float a = sin(p.y + t) + cos(p.z * 1.3 - t * 0.7);
  float b = sin(p.z + t * 0.9) + cos(p.x * 1.1 + t * 0.6);
  float c = sin(p.x - t * 0.8) + cos(p.y * 1.2 + t * 0.5);
  vec3 v = vec3(a - b, b - c, c - a);
  return normalize(v + 1e-6);
}

vec3 stirVortex(vec3 p, vec3 center, vec3 vel, float radius, float strength){
  vec3 d = p - center;
  float dist = length(d);
  float s = exp(- (dist*dist) / max(1e-4, radius*radius));
  vec3 vdir = normalize(vel + vec3(0.0001));
  vec3 axis = normalize(vec3(-vdir.y, vdir.x, 0.35));
  vec3 swirl = cross(axis, normalize(d + 1e-6));
  float vmag = clamp(length(vel) * 0.12, 0.0, 2.5);
  return swirl * (strength * s * vmag);
}

void main(){
  vec3 pos = texture(uPosTex, vUv).xyz;
  vec3 vel = texture(uVelTex, vUv).xyz;

  float t = hash12(vUv) * 10.0 + dot(pos, vec3(0.13, 0.17, 0.11));
  vec3 flow = vortexField(pos * (0.55 / max(0.0001, uFlowScale)), t * 0.55);
  vec3 acc = flow * uForce;

  acc += stirVortex(pos, uPointerPos, uPointerVel, uStirRadius, uStirStrength);

  // Soft wall repulsion band to prevent corner sticking
  acc += wallRepel(pos, uBounds, 0.18, 3.0);

  // Tiny jitter to break symmetry (very small)
  vel += tinyJitter(vUv) * (0.02 * uDt);

  vel += acc * uDt;
  vel *= exp(-uDamp * uDt);
  pos += vel * uDt;

  vec3 b = uBounds;

// Hard bounds + bounce on normal component, plus tangential damping to avoid corner trapping
float tangentialDamp = 0.92;

if (pos.x < -b.x) { pos.x = -b.x; vel.x = abs(vel.x) * uBounce; vel.yz *= tangentialDamp; }
if (pos.x >  b.x) { pos.x =  b.x; vel.x = -abs(vel.x) * uBounce; vel.yz *= tangentialDamp; }
if (pos.y < -b.y) { pos.y = -b.y; vel.y = abs(vel.y) * uBounce; vel.xz *= tangentialDamp; }
if (pos.y >  b.y) { pos.y =  b.y; vel.y = -abs(vel.y) * uBounce; vel.xz *= tangentialDamp; }
if (pos.z < -b.z) { pos.z = -b.z; vel.z = abs(vel.z) * uBounce; vel.xy *= tangentialDamp; }
if (pos.z >  b.z) { pos.z =  b.z; vel.z = -abs(vel.z) * uBounce; vel.xy *= tangentialDamp; }

outPos = vec4(pos, 1.0);
outVel = vec4(vel, 1.0);
}
`;
