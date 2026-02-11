import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { clamp } from "./util.js";

export function createOrbitAndStirControls(opts){
  const canvas = opts.canvas, camera = opts.camera, target = opts.target;
  let radius = 6.0, theta = 1.25, phi = 0.25;

  function updateCamera(){
    theta = clamp(theta, 0.02, Math.PI - 0.02);
    const x = radius * Math.sin(theta) * Math.sin(phi);
    const y = radius * Math.cos(theta);
    const z = radius * Math.sin(theta) * Math.cos(phi);
    camera.position.set(target.x + x, target.y + y, target.z + z);
    camera.lookAt(target);
  }
  updateCamera();

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  let isOrbit=false, isStir=false, lastX=0, lastY=0;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0,0,1), 0);
  const hit = new THREE.Vector3();

  const pointerWorld = new THREE.Vector3();
  const lastPointerWorld = new THREE.Vector3();
  const pointerVel = new THREE.Vector3();
  const velSmoothed = new THREE.Vector3();
  let lastPointerTime = performance.now();

  function setNDC(e){
    const r = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
  }
  function updatePointerWorld(){
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(plane, hit);
    if (Number.isFinite(hit.x)) pointerWorld.copy(hit);
  }
  function updatePointerVelocity(){
    const now = performance.now();
    const dt = Math.max(0.001, (now - lastPointerTime) / 1000);
    lastPointerTime = now;
    const rawVel = pointerWorld.clone().sub(lastPointerWorld).divideScalar(dt);
    lastPointerWorld.copy(pointerWorld);
    velSmoothed.lerp(rawVel, 0.22);
    pointerVel.copy(velSmoothed);
  }

  function onDown(e){
    canvas.setPointerCapture(e.pointerId);
    const isTouch = e.pointerType === "touch";
    const isRight = e.button === 2;
    if (isTouch || isRight){
      isStir = true;
      setNDC(e); updatePointerWorld();
      lastPointerWorld.copy(pointerWorld);
      lastPointerTime = performance.now();
      pointerVel.set(0,0,0); velSmoothed.set(0,0,0);
    } else {
      isOrbit = true;
      lastX=e.clientX; lastY=e.clientY;
    }
  }
  function onMove(e){
    if (isOrbit){
      const dx=e.clientX-lastX, dy=e.clientY-lastY;
      lastX=e.clientX; lastY=e.clientY;
      phi -= dx*0.005; theta -= dy*0.005;
      updateCamera();
    }
    if (isStir){
      setNDC(e); updatePointerWorld(); updatePointerVelocity();
    }
  }
  function onUp(){ isOrbit=false; isStir=false; }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  canvas.addEventListener("wheel", (e)=>{
    e.preventDefault();
    radius *= (e.deltaY>0)?1.08:0.92;
    radius = clamp(radius, 1.5, 40);
    updateCamera();
  }, {passive:false});

  return { getStirState: ()=>({ isStir, pointerWorld, pointerVel }) };
}
