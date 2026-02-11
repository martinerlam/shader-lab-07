Fluid Cubes - GitHub Pages optimized (based on v0.4.5b debug influence heatmap)

What this is
- WebGL2 + Three.js instanced cubes driven by a GPU ping-pong simulation (MRT).
- Position/velocity live in floating point textures; a fullscreen shader updates them every frame.

What's new vs v0.4.1e
- Live bounding-box controls (X / Y / Z half-extents) via sliders.
  - Updates the visual wireframe container.
  - Updates the sim collision bounds (uBounds) immediately.
- Expanded force controls:
  - Flow Force (uForce): strength of the procedural vortex field.
  - Flow Scale (uFlowScale): spatial frequency of the flow field (higher = smoother; lower = more turbulent).
  - Stir Strength / Stir Radius: mouse/touch interaction strength + falloff radius.

Run locally
  python3 -m http.server 8000

Open
  http://localhost:8000/index.html


Fixes in v0.4.3:
- Adds a soft inward 'wall repulsion' zone near the bounds to prevent corner sticking.
- Adds tangential damping on wall hits to reduce energy loss into corners.
- Adds tiny per-particle jitter to break perfect symmetry.


New in v0.4.4:
- Stronger, more obvious interaction (stir force scaling + defaults).
- Debug overlay toggle (button or 'D') that visualizes the interaction radius, falloff ring, and pointer velocity.


New in v0.4.5:
- Debug mode now also applies an in-scene cube heatmap based on interaction influence (radius falloff).
  This gives a direct visual correlation between Stir/Radius and what cubes are being affected.

Hotfix: Fix render shader compile by declaring uDebug uniform in fragment shader.


Logo
- Top-right logo is loaded from ./logo.png. Replace logo.png with your own image (same filename).


GitHub Pages (recommended)
- Upload these files to the repo root so index.html sits at /index.html.
- Settings -> Pages -> Deploy from branch -> main -> /(root).
- Your site will be: https://<username>.github.io/<repo-name>/

Logo
- Replace ./logo.png with your logo (same filename).
