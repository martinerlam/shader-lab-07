import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { clamp } from "./util.js";
import { createOrbitAndStirControls } from "./controls.js";
import { SIM_VERT, SIM_FRAG } from "./glsl_sim.js";
import { RENDER_VERT, RENDER_FRAG } from "./glsl_render.js";

export function main(){
  var canvas = document.getElementById("c");
  var hud = {
    caps: document.getElementById("caps"),
    fps: document.getElementById("fps"),
    reset: document.getElementById("reset"),
    diag: document.getElementById("diag"),
    debug: document.getElementById("debug"),
    c2k: document.getElementById("c2k"),
    c8k: document.getElementById("c8k"),
    c20k: document.getElementById("c20k"),

    flow: document.getElementById("flow"),
    flowV: document.getElementById("flowV"),
    flowScale: document.getElementById("flowScale"),
    flowScaleV: document.getElementById("flowScaleV"),
    stir: document.getElementById("stir"),
    stirV: document.getElementById("stirV"),
    stirR: document.getElementById("stirR"),
    stirRV: document.getElementById("stirRV"),

    damp: document.getElementById("damp"),
    dampV: document.getElementById("dampV"),
    bounce: document.getElementById("bounce"),
    bounceV: document.getElementById("bounceV"),

    bx: document.getElementById("bx"),
    bxV: document.getElementById("bxV"),
    by: document.getElementById("by"),
    byV: document.getElementById("byV"),
    bz: document.getElementById("bz"),
    bzV: document.getElementById("bzV")
  };

  function bindRange(el, out, fmt){
    function apply(){ out.textContent = parseFloat(el.value).toFixed(fmt); }
    el.addEventListener("input", apply);
    apply();
  }

  bindRange(hud.flow, hud.flowV, 2);
  bindRange(hud.flowScale, hud.flowScaleV, 2);
  bindRange(hud.stir, hud.stirV, 2);
  bindRange(hud.stirR, hud.stirRV, 2);
  bindRange(hud.damp, hud.dampV, 2);
  bindRange(hud.bounce, hud.bounceV, 2);
  bindRange(hud.bx, hud.bxV, 2);
  bindRange(hud.by, hud.byV, 2);
  bindRange(hud.bz, hud.bzV, 2);

  // Debug overlay (2D)
var debugEnabled = false;

// Overlay canvas for interaction visualization
var overlay = document.createElement("canvas");
overlay.id = "overlay";
overlay.style.position = "fixed";
overlay.style.left = "0";
overlay.style.top = "0";
overlay.style.width = "100%";
overlay.style.height = "100%";
overlay.style.pointerEvents = "none";
overlay.style.zIndex = "5";
document.body.appendChild(overlay);
var octx = overlay.getContext("2d");

function resizeOverlay(){
  overlay.width = Math.floor(innerWidth * Math.min(devicePixelRatio, 2));
  overlay.height = Math.floor(innerHeight * Math.min(devicePixelRatio, 2));
  octx.setTransform(1,0,0,1,0,0);
  octx.scale(Math.min(devicePixelRatio, 2), Math.min(devicePixelRatio, 2));
}
resizeOverlay();

function setDebug(v){
  debugEnabled = !!v;
  if (!debugEnabled){
    octx.clearRect(0,0,innerWidth,innerHeight);
  }
}

function toggleDebug(){ setDebug(!debugEnabled); }

if (hud.debug){
  hud.debug.addEventListener("click", toggleDebug);
}
window.addEventListener("keydown", function(e){
  if (e.key === "d" || e.key === "D") toggleDebug();
});

hud.diag.addEventListener("click", function(){ window.open("./diagnostic.html", "_blank"); });

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x05060a, 1);
  renderer.debug.checkShaderErrors = true;

  var gl = renderer.getContext();
  var isWebGL2 = (typeof WebGL2RenderingContext !== "undefined") && (gl instanceof WebGL2RenderingContext);
  if (!isWebGL2) throw new Error("WebGL2 required.");

  var extCBF = gl.getExtension("EXT_color_buffer_float");
  hud.caps.textContent = "caps: WebGL2 | EXT_color_buffer_float=" + String(!!extCBF);

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.10);

  var camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.01, 200);
  var target = new THREE.Vector3(0,0,0);
  var controls = createOrbitAndStirControls({ canvas: canvas, camera: camera, target: target });

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  var dir = new THREE.DirectionalLight(0xffffff, 0.95);
  dir.position.set(3, 6, 2);
  scene.add(dir);

  // Live bounds (half-extents)
  var BOUNDS = new THREE.Vector3(parseFloat(hud.bx.value), parseFloat(hud.by.value), parseFloat(hud.bz.value));

  // Wireframe container (scaled live)
  var boxMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2,2,2),
    new THREE.MeshBasicMaterial({ color:0xffffff, wireframe:true, transparent:true, opacity:0.25 })
  );
  scene.add(boxMesh);

  function applyBoundsVisual(){
    boxMesh.scale.set(BOUNDS.x*2, BOUNDS.y*2, BOUNDS.z*2);
  }

  // Sim scene (fullscreen quad)
  var simCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  var simScene = new THREE.Scene();
  var simPlane = new THREE.Mesh(new THREE.PlaneGeometry(2,2), null);
  simScene.add(simPlane);

  function ceilSqrt(n){ return Math.ceil(Math.sqrt(n)); }

  function makeMRT(size){
    var rt = new THREE.WebGLMultipleRenderTargets(size, size, 2, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping
    });
    rt.texture[0].name = "posTex";
    rt.texture[1].name = "velTex";
    return rt;
  }

  function makeInitDataTextures(size, count){
    var total = size * size;
    var pos = new Float32Array(total * 4);
    var vel = new Float32Array(total * 4);
    for (var i=0;i<total;i++){
      var ii = i*4;
      if (i < count){
        pos[ii+0] = (Math.random()*2 - 1) * BOUNDS.x;
        pos[ii+1] = (Math.random()*2 - 1) * BOUNDS.y;
        pos[ii+2] = (Math.random()*2 - 1) * BOUNDS.z;
        pos[ii+3] = 1.0;

        vel[ii+0] = (Math.random()*2 - 1) * 0.35;
        vel[ii+1] = (Math.random()*2 - 1) * 0.35;
        vel[ii+2] = (Math.random()*2 - 1) * 0.35;
        vel[ii+3] = 1.0;
      } else {
        pos[ii+0]=0; pos[ii+1]=0; pos[ii+2]=0; pos[ii+3]=1.0;
        vel[ii+0]=0; vel[ii+1]=0; vel[ii+2]=0; vel[ii+3]=1.0;
      }
    }

    var posTex = new THREE.DataTexture(pos, size, size, THREE.RGBAFormat, THREE.FloatType);
    posTex.needsUpdate = true;
    posTex.flipY = false;
    posTex.minFilter = THREE.NearestFilter;
    posTex.magFilter = THREE.NearestFilter;
    posTex.wrapS = THREE.ClampToEdgeWrapping;
    posTex.wrapT = THREE.ClampToEdgeWrapping;

    var velTex = new THREE.DataTexture(vel, size, size, THREE.RGBAFormat, THREE.FloatType);
    velTex.needsUpdate = true;
    velTex.flipY = false;
    velTex.minFilter = THREE.NearestFilter;
    velTex.magFilter = THREE.NearestFilter;
    velTex.wrapS = THREE.ClampToEdgeWrapping;
    velTex.wrapT = THREE.ClampToEdgeWrapping;

    return { posTex: posTex, velTex: velTex };
  }

  function makeSimMaterial(){
    return new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SIM_VERT,
      fragmentShader: SIM_FRAG,
      uniforms: {
        uPosTex: { value: null },
        uVelTex: { value: null },
        uDt: { value: 0.016 },

        uForce: { value: parseFloat(hud.flow.value) },
        uFlowScale: { value: parseFloat(hud.flowScale.value) },

        uDamp: { value: parseFloat(hud.damp.value) },
        uBounce: { value: parseFloat(hud.bounce.value) },
        uBounds: { value: BOUNDS.clone() },

        uPointerPos: { value: new THREE.Vector3() },
        uPointerVel: { value: new THREE.Vector3() },
        uStirStrength: { value: parseFloat(hud.stir.value) },
        uStirRadius: { value: parseFloat(hud.stirR.value) }
      }
    });
  }

  var simMat = makeSimMaterial();
  simPlane.material = simMat;

  function updateBoundsFromUI(){
    BOUNDS.set(parseFloat(hud.bx.value), parseFloat(hud.by.value), parseFloat(hud.bz.value));
    applyBoundsVisual();
    simMat.uniforms.uBounds.value.copy(BOUNDS);
  }
  hud.bx.addEventListener("input", updateBoundsFromUI);
  hud.by.addEventListener("input", updateBoundsFromUI);
  hud.bz.addEventListener("input", updateBoundsFromUI);

  function makeRenderMaterial(texSize, posTex, velTex){
    return new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: RENDER_VERT,
      fragmentShader: RENDER_FRAG,
      uniforms: {
        uPosTex: { value: posTex },
        uVelTex: { value: velTex },
        uTexSize: { value: texSize },
        uCubeScale: { value: 1.0 },
        uSpin: { value: 1.2 },
        uTime: { value: 0.0 },
        uColorA: { value: new THREE.Color("#3aa0ff") },
        uColorB: { value: new THREE.Color("#ff3a8a") },
        uBrightness: { value: 1.15 },
        uPointerPos: { value: new THREE.Vector3() },
        uStirRadius: { value: parseFloat(hud.stirR.value) },
        uDebug: { value: 0.0 },
        uStirEnabled: { value: 0.0 }
      }
    });
  }

  var cubeGeom = new THREE.BoxGeometry(0.06, 0.06, 0.06);

  // Simulation buffers + instances
  var count = 8000;
  var texSize = ceilSqrt(count);
  var rtA = makeMRT(texSize);
  var rtB = makeMRT(texSize);
  var init = makeInitDataTextures(texSize, count);

  var ping = 0;
  function srcRT(){ return ping === 0 ? rtA : rtB; }
  function dstRT(){ return ping === 0 ? rtB : rtA; }

  var cubes = new THREE.InstancedMesh(cubeGeom, makeRenderMaterial(texSize, rtA.texture[0], rtA.texture[1]), count);
  cubes.frustumCulled = false;
  scene.add(cubes);
  // Ensure render debug uniform matches current toggle
  if (cubes.material.uniforms.uDebug) cubes.material.uniforms.uDebug.value = debugEnabled ? 1.0 : 0.0;

  function seedInto(rt){
    // One sim step with dt=0 copies init textures into MRT
    simMat.uniforms.uDt.value = 0.0;

    // Freeze forces so this is a pure copy
    simMat.uniforms.uForce.value = 0.0;
    simMat.uniforms.uFlowScale.value = parseFloat(hud.flowScale.value);
    simMat.uniforms.uDamp.value = 0.0;
    simMat.uniforms.uBounce.value = 0.0;

    simMat.uniforms.uPointerPos.value.set(0,0,0);
    simMat.uniforms.uPointerVel.value.set(0,0,0);
    simMat.uniforms.uStirStrength.value = 0.0;
    simMat.uniforms.uStirRadius.value = parseFloat(hud.stirR.value);

    simMat.uniforms.uBounds.value.copy(BOUNDS);

    simMat.uniforms.uPosTex.value = init.posTex;
    simMat.uniforms.uVelTex.value = init.velTex;

    renderer.setRenderTarget(rt);
    renderer.render(simScene, simCam);
    renderer.setRenderTarget(null);

    // Restore live params
    simMat.uniforms.uForce.value = parseFloat(hud.flow.value);
    simMat.uniforms.uFlowScale.value = parseFloat(hud.flowScale.value);
    simMat.uniforms.uDamp.value = parseFloat(hud.damp.value);
    simMat.uniforms.uBounce.value = parseFloat(hud.bounce.value);
    simMat.uniforms.uStirStrength.value = parseFloat(hud.stir.value);
    simMat.uniforms.uStirRadius.value = parseFloat(hud.stirR.value);
  }

  seedInto(rtA);
  seedInto(rtB);

  function rebuild(newCount){
    count = newCount;
    texSize = ceilSqrt(count);

    scene.remove(cubes);
    cubes.geometry.dispose();
    cubes.material.dispose();

    rtA.dispose(); rtB.dispose();
    rtA = makeMRT(texSize);
    rtB = makeMRT(texSize);

    init = makeInitDataTextures(texSize, count);

    ping = 0;
    seedInto(rtA);
    seedInto(rtB);

    cubes = new THREE.InstancedMesh(cubeGeom, makeRenderMaterial(texSize, rtA.texture[0], rtA.texture[1]), count);
    cubes.frustumCulled = false;
    scene.add(cubes);
  // Ensure render debug uniform matches current toggle
  if (cubes.material.uniforms.uDebug) cubes.material.uniforms.uDebug.value = debugEnabled ? 1.0 : 0.0;
  }

  hud.reset.addEventListener("click", function(){
    init = makeInitDataTextures(texSize, count);
    seedInto(rtA);
    seedInto(rtB);
  });
  hud.c2k.addEventListener("click", function(){ rebuild(2000); });
  hud.c8k.addEventListener("click", function(){ rebuild(8000); });
  hud.c20k.addEventListener("click", function(){ rebuild(20000); });

  // Live uniform updates
  hud.flow.addEventListener("input", function(){ simMat.uniforms.uForce.value = parseFloat(hud.flow.value); });
  hud.flowScale.addEventListener("input", function(){ simMat.uniforms.uFlowScale.value = parseFloat(hud.flowScale.value); });
  hud.stir.addEventListener("input", function(){ simMat.uniforms.uStirStrength.value = parseFloat(hud.stir.value); });
  hud.stirR.addEventListener("input", function(){ simMat.uniforms.uStirRadius.value = parseFloat(hud.stirR.value); if (cubes && cubes.material && cubes.material.uniforms && cubes.material.uniforms.uStirRadius) cubes.material.uniforms.uStirRadius.value = parseFloat(hud.stirR.value); });

  hud.damp.addEventListener("input", function(){ simMat.uniforms.uDamp.value = parseFloat(hud.damp.value); });
  hud.bounce.addEventListener("input", function(){ simMat.uniforms.uBounce.value = parseFloat(hud.bounce.value); });

  window.addEventListener("resize", function(){
    resizeOverlay();
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // FPS
  var frames = 0, fpsLast = performance.now();
  function tickFPS(){
    frames++;
    var now = performance.now();
    var dt = now - fpsLast;
    if (dt >= 400){
      hud.fps.textContent = "FPS: " + String((frames * 1000 / dt).toFixed(0));
      frames = 0;
      fpsLast = now;
    }
  }

  var clock = new THREE.Clock();
  var time = 0;

  function stepSim(dt){
    var dts = clamp(dt, 0.0, 0.033);
    simMat.uniforms.uDt.value = dts;

    // keep bounds current (in case user drags fast)
    simMat.uniforms.uBounds.value.copy(BOUNDS);

    var stir = controls.getStirState();
    simMat.uniforms.uPointerPos.value.copy(stir.pointerWorld);
    simMat.uniforms.uPointerVel.value.copy(stir.pointerVel).multiplyScalar(1.75); // make stirring more obvious
    if (!stir.isStir) simMat.uniforms.uPointerVel.value.multiplyScalar(0.85);

// Feed interaction info to render shader for debug heatmap (uses simulation-space pos)
if (cubes && cubes.material && cubes.material.uniforms){
  if (cubes.material.uniforms.uPointerPos) cubes.material.uniforms.uPointerPos.value.copy(stir.pointerWorld);
  if (cubes.material.uniforms.uStirRadius) cubes.material.uniforms.uStirRadius.value = parseFloat(hud.stirR.value);
  if (cubes.material.uniforms.uStirEnabled) cubes.material.uniforms.uStirEnabled.value = stir.isStir ? 1.0 : 0.0;
}

    var src = srcRT();
    var dst = dstRT();
    simMat.uniforms.uPosTex.value = src.texture[0];
    simMat.uniforms.uVelTex.value = src.texture[1];

    renderer.setRenderTarget(dst);
    renderer.render(simScene, simCam);
    renderer.setRenderTarget(null);

    ping = 1 - ping;

    var latest = srcRT();
    cubes.material.uniforms.uPosTex.value = latest.texture[0];
    cubes.material.uniforms.uVelTex.value = latest.texture[1];
    cubes.material.uniforms.uTexSize.value = texSize;
  }

  function loop(){
    requestAnimationFrame(loop);
    var dt = clock.getDelta();
    stepSim(dt);
    time += dt;
    cubes.material.uniforms.uTime.value = time;
    renderer.render(scene, camera);

    if (debugEnabled){
  octx.clearRect(0,0,innerWidth,innerHeight);

  var stir = controls.getStirState();
  // Project pointerWorld to screen
  var p = stir.pointerWorld.clone();
  var v = stir.pointerVel.clone();
  var proj = p.project(camera);

  var sx = (proj.x * 0.5 + 0.5) * innerWidth;
  var sy = (-proj.y * 0.5 + 0.5) * innerHeight;

  // Estimate pixels per world unit at pointer depth
  var p2 = p.clone().add(new THREE.Vector3(1,0,0));
  var proj2 = p2.project(camera);
  var sx2 = (proj2.x * 0.5 + 0.5) * innerWidth;
  var pxPerWorld = Math.max(1e-3, Math.abs(sx2 - sx));

  var radiusWorld = parseFloat(hud.stirR.value);
  var radiusPx = radiusWorld * pxPerWorld;

  // Draw influence ring (soft falloff)
  var g = octx.createRadialGradient(sx, sy, 0, sx, sy, radiusPx);
  g.addColorStop(0.0, "rgba(255,120,80,0.30)");
  g.addColorStop(0.35, "rgba(255,120,80,0.14)");
  g.addColorStop(1.0, "rgba(255,120,80,0.00)");
  octx.fillStyle = g;
  octx.beginPath();
  octx.arc(sx, sy, radiusPx, 0, Math.PI*2);
  octx.fill();

  // Ring outline
  octx.strokeStyle = "rgba(255,170,120,0.65)";
  octx.lineWidth = 2;
  octx.beginPath();
  octx.arc(sx, sy, radiusPx, 0, Math.PI*2);
  octx.stroke();

  // Velocity arrow (direction + magnitude)
  var vm = Math.min(220, v.length() * 35);
  if (vm > 1){
    var dir2 = new THREE.Vector2(v.x, -v.y); // y inverted for screen
    if (dir2.length() > 1e-6) dir2.normalize();
    var ex = sx + dir2.x * vm;
    var ey = sy + dir2.y * vm;

    octx.strokeStyle = "rgba(120,200,255,0.9)";
    octx.lineWidth = 3;
    octx.beginPath();
    octx.moveTo(sx, sy);
    octx.lineTo(ex, ey);
    octx.stroke();

    // Arrow head
    var ang = Math.atan2(ey - sy, ex - sx);
    var ah = 10;
    octx.beginPath();
    octx.moveTo(ex, ey);
    octx.lineTo(ex - Math.cos(ang - 0.6)*ah, ey - Math.sin(ang - 0.6)*ah);
    octx.lineTo(ex - Math.cos(ang + 0.6)*ah, ey - Math.sin(ang + 0.6)*ah);
    octx.closePath();
    octx.fillStyle = "rgba(120,200,255,0.9)";
    octx.fill();
  }

  // Legend
  octx.fillStyle = "rgba(255,255,255,0.85)";
  octx.font = "12px ui-monospace";
  octx.fillText("debug overlay (D): radius=" + radiusWorld.toFixed(2) + "  stir=" + parseFloat(hud.stir.value).toFixed(2) + "  vel=" + v.length().toFixed(2), 12, innerHeight - 14);
  if (!stir.isStir){
    octx.fillStyle = "rgba(255,255,255,0.55)";
    octx.fillText("hold RIGHT mouse (or touch) and drag to stir", 12, innerHeight - 30);
  }
}

    tickFPS();
  }

  // Apply initial bounds once
  updateBoundsFromUI();

  loop();
}
