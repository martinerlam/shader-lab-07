import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
const out = document.getElementById("out");
const canvas = document.getElementById("c");
function line(s){ out.innerHTML += s + "<br/>"; }
function ok(label, value){ line('<span class="ok">OK</span> ' + label + " " + (value||"")); }
function bad(label, value){ line('<span class="bad">NO</span> ' + label + " " + (value||"")); }
function tag(text){ return '<span class="tag">' + text + "</span>"; }

out.innerHTML = "";
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x06070a, 1);

const gl = renderer.getContext();
const isWebGL2 = (typeof WebGL2RenderingContext !== "undefined") && (gl instanceof WebGL2RenderingContext);
ok("WebGL2", String(isWebGL2));
ok("Three revision", THREE.REVISION);

const ext = gl.getExtension("EXT_color_buffer_float");
ok("EXT_color_buffer_float", String(!!ext));

function tryFBO(internalFormat, format, type){
  if (!isWebGL2) return false;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 2, 2, 0, format, type, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(tex);
  return status === gl.FRAMEBUFFER_COMPLETE;
}

if (isWebGL2){
  const halfOk = tryFBO(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
  const floatOk = tryFBO(gl.RGBA32F, gl.RGBA, gl.FLOAT);
  ok("FBO RGBA16F", halfOk ? "YES" : "NO");
  ok("FBO RGBA32F", floatOk ? "YES" : "NO");
  line("<br/>");
  if (halfOk || floatOk) ok("GPU sim possible", "YES " + tag(halfOk ? "RGBA16F OK" : "RGBA32F OK"));
  else bad("GPU sim possible", "NO");
}
line("<br/><span class='small'>Back: <a href='./index.html'>index.html</a></span>");
