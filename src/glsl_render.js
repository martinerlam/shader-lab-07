export const RENDER_VERT = `
precision highp float;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;
uniform vec3 cameraPosition;

uniform sampler2D uPosTex;
uniform sampler2D uVelTex;
uniform float uTexSize;

uniform float uCubeScale;
uniform float uSpin;
uniform float uTime;

uniform vec3 uPointerPos;
uniform float uStirRadius;
uniform float uDebug;
uniform float uStirEnabled;

in vec3 position;
in vec3 normal;
in mat4 instanceMatrix;

out vec3 vNormalW;
out vec3 vViewDir;
out float vSpeed;
out float vHeightT;
out float vInfluence;

vec2 idToUv(float id, float size){
  float x = mod(id, size);
  float y = floor(id / size);
  return (vec2(x, y) + 0.5) / size;
}

void main(){
  float id = float(gl_InstanceID);
  vec2 uv = idToUv(id, uTexSize);

  vec3 pos = texture(uPosTex, uv).xyz;
  vec3 vel = texture(uVelTex, uv).xyz;

  vec3 transformed = position * uCubeScale;

  float angY = uTime * uSpin + id * 0.0123;
  float cy = cos(angY), sy = sin(angY);
  mat2 rotY = mat2(cy, -sy, sy, cy);
  transformed.xz = rotY * transformed.xz;

  float angX = uTime * (uSpin * 0.55) + id * 0.0091;
  float cx = cos(angX), sx = sin(angX);
  mat2 rotX = mat2(cx, -sx, sx, cx);
  transformed.yz = rotX * transformed.yz;

  vec4 wpos = modelMatrix * vec4(pos + transformed, 1.0);

  vSpeed = length(vel);
  vHeightT = clamp((pos.y + 1.5) / 3.0, 0.0, 1.0);

// Interaction influence (Gaussian falloff). Only meaningful when stirring.
float d = length(pos - uPointerPos);
float s = exp(- (d*d) / max(1e-4, uStirRadius*uStirRadius));
vInfluence = s * uStirEnabled;

  vec3 nW = normalize(mat3(modelMatrix) * normal);
  vNormalW = nW;
  vViewDir = normalize(cameraPosition - wpos.xyz);

  gl_Position = projectionMatrix * viewMatrix * wpos;
}
`;

export const RENDER_FRAG = `
precision highp float;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uBrightness;
uniform float uDebug;

in vec3 vNormalW;
in vec3 vViewDir;
in float vSpeed;
in float vHeightT;
in float vInfluence;

out vec4 outColor;

vec3 paletteGradient(vec3 a, vec3 b, float t){
  return mix(a, b, clamp(t, 0.0, 1.0));
}

void main(){
  vec3 base = paletteGradient(uColorA, uColorB, vHeightT) * uBrightness;
  float s = clamp(vSpeed * 0.35, 0.0, 1.0);
  base = mix(base, base + vec3(0.6, 0.2, 0.35) * uBrightness, s);

  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vViewDir);
  vec3 L = normalize(vec3(0.45, 0.85, 0.35));
  float ndl = max(dot(N, L), 0.0);

  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 64.0) * 0.18;

  vec3 lit = base * (0.22 + 0.90 * ndl) + spec;

// Debug heatmap overlay: highlight influenced cubes
if (uDebug > 0.5){
  float h = clamp(vInfluence, 0.0, 1.0);
  vec3 heat = mix(vec3(0.15, 0.15, 0.18), vec3(1.0, 0.45, 0.10), h);
  // Blend on top of lighting, keep some base
  lit = mix(lit, heat * (0.55 + 0.65 * h), 0.75);
}

outColor = vec4(lit, 1.0);
}
`;
