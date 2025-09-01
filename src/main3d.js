import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Basic CONFIG mirroring 2D where relevant
const CONFIG = {
  G: 0.28,
  softening: 18,
  timeScale: 1.0,
  speedBoost: 1.8,
  physicsHz: 180,
  maxBodies: 600,
  gridSize: 48,
  // Painting defaults
  brushSize: 18,
  massPerDot: 4,
  spawnRate: 60,
  starMassThreshold: 1400,
  planetMassThreshold: 60,
  igniteGasFraction: 0.7,
  density: { gas: 0.7, rock: 3.2, ice: 1.2 },
  radiusScale: 2.2,
  worldW: 2400,
  worldH: 1600,
};

const State = {
  bodies: [],
  nextId: 1,
  accum: 0,
  trails: 'short',
  vectors: 'off',
  tool: 'gas',
  orbitAssist: false,
  edgeBehavior: 'wrap',
  neonMode: 'off',
  bloomOn: false,
  bloomStrength: 0.6,
};

// Physics helpers (2D in X/Y plane)
function mixDensity(frac){ const d=CONFIG.density; const inv=(frac.gas/d.gas)+(frac.rock/d.rock)+(frac.ice/d.ice); return inv>0?1/inv:d.rock; }
function radiusFromMassDensity(mass, density){ return Math.max(1.2, CONFIG.radiusScale * Math.cbrt(Math.max(mass/Math.max(density,1e-6),0))); }
function classify(mass, gas){ if (mass>=CONFIG.starMassThreshold && gas>=CONFIG.igniteGasFraction) return 'star'; if (mass>=CONFIG.planetMassThreshold) return 'planet'; return 'debris'; }
function createBody(x,y,mass,comp,vx=0,vy=0){ const sum=comp.gas+comp.rock+comp.ice||1; const mix={gas:comp.gas/sum, rock:comp.rock/sum, ice:comp.ice/sum}; const density=mixDensity(mix); const r=radiusFromMassDensity(mass,density); return { id:State.nextId++, x,y,vx,vy, ax:0,ay:0, mass, comp:mix, density, radius:r, type: classify(mass,mix.gas) }; }

function computeAccelerations(bodies){
  const n=bodies.length; for (let i=0;i<n;i++){ bodies[i].ax=0; bodies[i].ay=0; }
  const eps2 = CONFIG.softening*CONFIG.softening;
  for (let i=0;i<n;i++){
    const bi=bodies[i];
    for (let j=i+1;j<n;j++){
      const bj=bodies[j];
      const dx=bj.x-bi.x, dy=bj.y-bi.y; const invR=1/Math.sqrt(dx*dx+dy*dy+eps2); const invR3=invR*invR*invR; const f=CONFIG.G*invR3; const fx=dx*f, fy=dy*f;
      bi.ax += fx*bj.mass; bi.ay += fy*bj.mass; bj.ax -= fx*bi.mass; bj.ay -= fy*bi.mass;
    }
  }
  for (let i=0;i<n;i++){ const b=bodies[i]; b.ax/=b.mass; b.ay/=b.mass; }
}
function integrate(bodies, dt){ const sdt=dt*CONFIG.timeScale*CONFIG.speedBoost; const half=0.5*sdt; // leapfrog
  for (const b of bodies){ b.vx += b.ax*half; b.vy += b.ay*half; }
  for (const b of bodies){ b.x += b.vx*sdt; b.y += b.vy*sdt; }
  computeAccelerations(bodies);
  for (const b of bodies){ b.vx += b.ax*half; b.vy += b.ay*half; }
}

// Star color
function starColor(mass){ const m0=CONFIG.starMassThreshold; const t=Math.min(1,Math.max(0,(mass-m0)/(m0*4))); const stops=[{r:255,g:120,b:80},{r:255,g:210,b:110},{r:245,g:245,b:255},{r:200,g:220,b:255}]; const seg=t*(stops.length-1); const i=Math.floor(seg); const f=seg-i; const a=stops[i], b=stops[Math.min(i+1,stops.length-1)]; return new THREE.Color( (a.r+(b.r-a.r)*f)/255, (a.g+(b.g-a.g)*f)/255, (a.b+(b.b-a.b)*f)/255 ); }

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070c);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 50000);
camera.position.set(0, 800, 900);
camera.lookAt(0,0,0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const mount = document.getElementById('three-root');
renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
mount.appendChild(renderer.domElement);

// Postprocessing composer (for Bloom)
let composer, renderPass, bloomPass;
function setupComposer(){
  const w = mount.clientWidth || window.innerWidth;
  const h = mount.clientHeight || window.innerHeight;
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), State.bloomStrength, 0.4, 0.85);
  if (State.bloomOn) composer.addPass(bloomPass);
}
setupComposer();

// Lights (ambient fill); main light is star emissive
scene.add(new THREE.AmbientLight(0x223344, 0.4));

// Root group
const root = new THREE.Group(); scene.add(root);

// Mesh factory
function makePlanetMesh(body){
  const geo = new THREE.SphereGeometry(body.radius, Math.max(16, Math.min(64, Math.round(body.radius*1.5))), Math.max(12, Math.min(48, Math.round(body.radius))));
  const dom = (body.comp.gas>=body.comp.ice && body.comp.gas>=body.comp.rock) ? 'gas' : (body.comp.ice>=body.comp.gas && body.comp.ice>=body.comp.rock ? 'ice' : 'rock');
  let color;
  if (dom==='gas') color = new THREE.Color(0xcabeb0);
  else if (dom==='ice') color = new THREE.Color(0xd8f2ff);
  else color = new THREE.Color(0xb08f78);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: dom==='ice'?0.2:0.75, metalness:0.0, clearcoat: dom!=='rock'? 0.25: 0.0, transmission: 0.0 });
  // Small emissive term so bodies are visible even with low light
  mat.emissive = color.clone().multiplyScalar(0.08);
  mat.emissiveIntensity = 0.6;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.type = 'planet';
  addOutline(mesh, outlineColorForBody(body));
  return mesh;
}

function makeStarMesh(body){
  const geo = new THREE.SphereGeometry(body.radius, 48, 32);
  // Limb-darkening shader
  const col = starColor(body.mass);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col }, uRadius: { value: body.radius } },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vPos; uniform vec3 uColor; uniform float uRadius; void main(){ float r = length(vPos)/uRadius; float limb = smoothstep(1.0, 0.2, r); vec3 col = uColor*(0.6+0.4*limb); gl_FragColor = vec4(col, 1.0); }`,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.type = 'star';
  // small emissive halo
  const haloGeo = new THREE.SphereGeometry(body.radius*1.8, 32, 16);
  const haloMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending });
  const halo = new THREE.Mesh(haloGeo, haloMat); mesh.add(halo);
  addOutline(mesh, new THREE.Color(0xffd166));
  return mesh;
}

// Create scene bodies group mapping id->mesh
const bodyToMesh = new Map();

function addBodyMesh(body){
  const mesh = (body.type==='star') ? makeStarMesh(body) : makePlanetMesh(body);
  mesh.position.set(body.x, 0, body.y);
  root.add(mesh);
  bodyToMesh.set(body.id, mesh);
}

// ===== 80's neon outline helpers =====
function outlineColorForBody(body){
  if (body.type === 'star') return new THREE.Color(0xffd166);
  const c = body.comp;
  if (c.gas >= c.ice && c.gas >= c.rock) return new THREE.Color(0x00eaff); // neon cyan for gas
  if (c.ice >= c.gas && c.ice >= c.rock) return new THREE.Color(0x8ad8ff); // light blue for ice
  return new THREE.Color(0xff5e3a); // neon orange for rock
}
function addOutline(mesh, color){
  const outlineGeo = mesh.geometry.clone();
  const outlineMat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const outline = new THREE.Mesh(outlineGeo, outlineMat);
  outline.scale.setScalar(1.08);
  mesh.add(outline);
  mesh.userData.outline = outline;
}

// Lighting: ambient + hemisphere + a strong point light at the largest star
const hemi = new THREE.HemisphereLight(0x778899, 0x0a0c12, 0.8); scene.add(hemi);
const starLight = new THREE.PointLight(0xffffff, 10.0, 0, 2.0); scene.add(starLight);
function updateStarLight(){
  const s = largestStar();
  if (s){
    starLight.position.set(s.x, 0, s.y);
    const base = parseFloat(document.getElementById('starIntensity')?.value || 10);
    const mRatio = Math.max(0.5, s.mass / CONFIG.starMassThreshold);
    const factor = Math.pow(mRatio, 0.6);
    starLight.intensity = base * factor;
    const mesh = bodyToMesh.get(s.id);
    if (mesh && mesh.userData.type === 'star'){
      const newCol = starColor(s.mass);
      if (mesh.material && mesh.material.uniforms){
        mesh.material.uniforms.uColor.value = newCol;
        mesh.material.uniforms.uRadius.value = s.radius;
      }
      const halo = mesh.children.find(ch => ch !== undefined && ch.isMesh) || null;
      if (halo && halo.material){
        halo.scale.setScalar(1.6 + 0.6 * factor);
        halo.material.opacity = 0.12 + 0.18 * Math.min(1.0, factor);
      }
    }
  }
}

// Seeding: read from localStorage if available, else preset
function loadFromLocal(){
  try{ const raw = localStorage.getItem('solar-sandbox-state-v1'); if (!raw) return false; const data=JSON.parse(raw); if (!Array.isArray(data.bodies)) return false; State.bodies = data.bodies.map(b=>createBody(b.x, b.y, b.mass, b.comp, b.vx, b.vy)); return true; }catch(e){ return false; }
}

function seedPreset(){
  State.bodies.length = 0; const cx=0, cy=0; const star = createBody(cx, cy, CONFIG.starMassThreshold*1.6, {gas:0.92,rock:0.06,ice:0.02},0,0); State.bodies.push(star);
  const planets = 6; let r=160; for (let i=0;i<planets;i++){ const ang=Math.random()*Math.PI*2; const x=cx+r*Math.cos(ang), y=cy+r*Math.sin(ang); const comp = i<2? {gas:0.08,rock:0.86,ice:0.06}: (i<4? {gas:0.5,rock:0.25,ice:0.25}: {gas:0.25,rock:0.15,ice:0.6}); const m = CONFIG.planetMassThreshold*(i<2?0.8+Math.random()*1.2 : (i<4? 1.2+Math.random()*2.0 : 2.0+Math.random()*3.0)); const v = Math.sqrt(CONFIG.G*star.mass / r) * (0.96 + Math.random()*0.05); const vx = -Math.sin(ang)*v, vy=Math.cos(ang)*v; State.bodies.push(createBody(x,y,m,comp,vx,vy)); r*=1.35+Math.random()*0.2; }
}

if (!loadFromLocal()) seedPreset();
for (const b of State.bodies) addBodyMesh(b);
// Initialize accelerations for leapfrog stability and set light
computeAccelerations(State.bodies);
updateStarLight();

// Camera controls (basic mouse drag to rotate around Z)
let rotDown=false, lastX=0, lastY=0, rotY=0, rotX=0;
renderer.domElement.addEventListener('contextmenu', e=>{ e.preventDefault(); });
renderer.domElement.addEventListener('mousedown', e=>{ if (e.button===2){ rotDown=true; lastX=e.clientX; lastY=e.clientY; } else if (e.button===0){ paint.down=true; } });
window.addEventListener('mouseup', e=>{ if (e.button===2) rotDown=false; if (e.button===0) paint.down=false; });
window.addEventListener('mousemove', e=>{ setMouse(e); if(!rotDown) return; const dx=e.clientX-lastX, dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; rotY += dx*0.003; rotX = THREE.MathUtils.clamp(rotX + dy*0.003, -0.8, 0.8); updateCamera(); });
function updateCamera(){ const d=1100; const cx=0, cy=0; camera.position.set(Math.sin(rotY)*d*Math.cos(rotX), d*Math.sin(rotX), Math.cos(rotY)*d*Math.cos(rotX)); camera.lookAt(cx,0,cy); }
updateCamera();

window.addEventListener('resize', ()=>{ const w = mount.clientWidth || window.innerWidth; const h = mount.clientHeight || window.innerHeight; camera.aspect = w/h; camera.updateProjectionMatrix(); renderer.setSize(w, h); if (composer){ composer.setSize(w, h); if (bloomPass) bloomPass.setSize(w, h); } });

// Animation loop (fixed-step physics)
let last = performance.now()/1000;
function loop(nowMs){ const now=nowMs/1000; let dt=now-last; last=now; dt=Math.min(0.05, Math.max(0, dt)); const step=1/CONFIG.physicsHz; State.accum += dt; while(State.accum>=step){ if(!UI.paused) { tickPaint(step); integrate(State.bodies, step); resolveCollisions(); handleEdges3D(); updateStarLight(); } State.accum -= step; }
  // Update meshes
  for (const b of State.bodies){ const m = bodyToMesh.get(b.id); if (!m) continue; m.position.set(b.x, 0, b.y); m.rotation.y += 0.002; updateTrail(b, m); updateVector(b, m); }
  updateHUD();
  if (State.bloomOn) composer.render(); else renderer.render(scene, camera);
  requestAnimationFrame(loop); }
requestAnimationFrame(loop);

// ===== UI Side Panel =====
const UI = {
  tool: document.getElementById('tool'),
  brushSize: document.getElementById('brushSize'),
  brushSizeVal: document.getElementById('brushSizeVal'),
  massPerDot: document.getElementById('massPerDot'),
  massPerDotVal: document.getElementById('massPerDotVal'),
  spawnRate: document.getElementById('spawnRate'),
  spawnRateVal: document.getElementById('spawnRateVal'),
  gravityG: document.getElementById('gravityG'),
  gravityGVal: document.getElementById('gravityGVal'),
  timeScale: document.getElementById('timeScale'),
  timeScaleVal: document.getElementById('timeScaleVal'),
  softening: document.getElementById('softening'),
  softeningVal: document.getElementById('softeningVal'),
  trails: document.getElementById('trails'),
  vectors: document.getElementById('vectors'),
  edge3d: document.getElementById('edge3d'),
  neonMode: document.getElementById('neonMode'),
  starIntensity: document.getElementById('starIntensity'),
  starIntensityVal: document.getElementById('starIntensityVal'),
  bloom: document.getElementById('bloom'),
  bloomStrength: document.getElementById('bloomStrength'),
  bloomStrengthVal: document.getElementById('bloomStrengthVal'),
  orbitAssist: document.getElementById('orbitAssist'),
  seedDemo: document.getElementById('seedDemo'),
  randomBelt: document.getElementById('randomBelt'),
  presetSystem: document.getElementById('presetSystem'),
  togglePause: document.getElementById('togglePause'),
  clear: document.getElementById('clear'),
  save: document.getElementById('save'),
  load: document.getElementById('load'),
  capInfo: document.getElementById('capInfo'),
  hud: document.getElementById('hud'),
  paused: false,
};

function bindUI(){
  const bindRange = (el, label, setter, fmt=v=>v)=>{ setter(+el.value); label.textContent = fmt(el.value); el.addEventListener('input', ()=>{ setter(+el.value); label.textContent = fmt(el.value); updateCap(); }); };
  UI.tool.addEventListener('change', ()=>{ State.tool = UI.tool.value; }); State.tool = UI.tool.value;
  bindRange(UI.brushSize, UI.brushSizeVal, v=>CONFIG.brushSize=v, v=>`${v}`);
  bindRange(UI.massPerDot, UI.massPerDotVal, v=>CONFIG.massPerDot=v, v=>`${v}`);
  bindRange(UI.spawnRate, UI.spawnRateVal, v=>CONFIG.spawnRate=v, v=>`${v}/s`);
  bindRange(UI.gravityG, UI.gravityGVal, v=>CONFIG.G=v, v=>`${v}`);
  bindRange(UI.timeScale, UI.timeScaleVal, v=>CONFIG.timeScale=v, v=>`${v}x`);
  bindRange(UI.softening, UI.softeningVal, v=>CONFIG.softening=v, v=>`${v}`);
  UI.trails.addEventListener('change', ()=>{ State.trails = UI.trails.value; resetAllTrails(); }); State.trails = UI.trails.value;
  UI.vectors.addEventListener('change', ()=>{ State.vectors = UI.vectors.value; resetAllVectors(); }); State.vectors = UI.vectors.value;
  if (UI.edge3d){ UI.edge3d.addEventListener('change', ()=>{ State.edgeBehavior = UI.edge3d.value; }); State.edgeBehavior = UI.edge3d.value; }
  if (UI.neonMode){ UI.neonMode.addEventListener('change', ()=>{ State.neonMode = UI.neonMode.value; applyNeonMode(); }); State.neonMode = UI.neonMode.value; }
  if (UI.starIntensity){ bindRange(UI.starIntensity, UI.starIntensityVal, v=>{ starLight.intensity=v; }, v=>`${v}`); }
  if (UI.bloom){ UI.bloom.addEventListener('change', ()=>{ State.bloomOn = UI.bloom.value==='on'; setupComposer(); }); State.bloomOn = UI.bloom.value==='on'; }
  if (UI.bloomStrength){ bindRange(UI.bloomStrength, UI.bloomStrengthVal, v=>{ State.bloomStrength=v; if (bloomPass) bloomPass.strength = v; }, v=>`${v}`); }
  if (UI.orbitAssist){ UI.orbitAssist.addEventListener('change', ()=>{ State.orbitAssist = UI.orbitAssist.value==='on'; }); State.orbitAssist = UI.orbitAssist.value==='on'; }
  UI.seedDemo.addEventListener('click', ()=>{ seedDemo(); });
  UI.randomBelt.addEventListener('click', ()=>{ seedRandomBelt(); });
  UI.presetSystem.addEventListener('click', ()=>{ seedPreset(); rebuildMeshes(); });
  UI.togglePause.addEventListener('click', ()=>{ UI.paused = !UI.paused; UI.togglePause.textContent = UI.paused?'Resume':'Pause'; });
  UI.clear.addEventListener('click', ()=>{ clearAll(); });
  UI.save.addEventListener('click', saveToLocal);
  UI.load.addEventListener('click', ()=>{ loadFromLocalStorage(); rebuildMeshes(); });
  updateCap();
}

function updateHUD(){
  UI.hud.textContent = `Bodies: ${State.bodies.length}/${CONFIG.maxBodies} | Trails: ${State.trails} | Vectors: ${State.vectors}`;
}
function updateCap(){ UI.capInfo.textContent = `Cap: ${State.bodies.length} / ${CONFIG.maxBodies} bodies`; }
bindUI();

function applyNeonMode(){ const s=document.getElementById('scanlines'); if (State.neonMode==='on'){ scene.background = new THREE.Color(0x6050dc); if (s) s.style.opacity='0.25'; } else { scene.background = new THREE.Color(0x05070c); if (s) s.style.opacity='0'; } }
applyNeonMode();

// ===== Painting (raycast plane) =====
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
const tmpVec = new THREE.Vector3();
const paint = { down:false, spawnAccum:0, lastX:0, lastY:0 };

function setMouse(e){ const rect = renderer.domElement.getBoundingClientRect(); mouse.x = ((e.clientX-rect.left)/rect.width)*2-1; mouse.y = -((e.clientY-rect.top)/rect.height)*2+1; }

function intersectPoint(){ raycaster.setFromCamera(mouse, camera); if (raycaster.ray.intersectPlane(plane, tmpVec)) return tmpVec.clone(); return null; }

function tickPaint(dt){ if (!paint.down) return; if (State.bodies.length >= CONFIG.maxBodies) return; const p = intersectPoint(); if (!p) return; const rate = CONFIG.spawnRate; paint.spawnAccum += rate*dt; const dots = Math.min(50, Math.floor(paint.spawnAccum)); paint.spawnAccum -= dots; for (let i=0;i<dots;i++){ const ang=Math.random()*Math.PI*2; const rad=(Math.random()*CONFIG.brushSize*0.6); const px=p.x+Math.cos(ang)*rad, py=p.z+Math.sin(ang)*rad; if (State.tool==='eraser'){ eraseAt(px,py, CONFIG.brushSize); continue; } const mass = CONFIG.massPerDot*(0.6+Math.random()*0.8); const comp = State.tool==='gas'? {gas:0.95, rock:0.03, ice:0.02}: State.tool==='rock'? {gas:0.05, rock:0.9, ice:0.05}: {gas:0.1, rock:0.1, ice:0.8}; let vx=0, vy=0; if (State.orbitAssist){ const star = largestStar(); if (star){ const rx=px-star.x, ry=py-star.y; const r=Math.hypot(rx,ry); if (r>Math.max(10, (star.radius||10)*1.2)){ const v=Math.sqrt(CONFIG.G*star.mass/r); const tx=-ry/r, ty=rx/r; vx += tx*v; vy += ty*v; } } } const body=createBody(px,py,mass,comp,vx,vy); State.bodies.push(body); addBodyMesh(body); }
}

function eraseAt(x,y, brush){ const r2=brush*brush; const toRemove=[]; State.bodies.forEach((b,idx)=>{ const dx=b.x-x, dy=b.y-y; if (dx*dx+dy*dy<=r2){ toRemove.push(idx); } }); for (let i=toRemove.length-1;i>=0;i--){ const idx=toRemove[i]; const b=State.bodies[idx]; const m=bodyToMesh.get(b.id); if (m){ root.remove(m); bodyToMesh.delete(b.id);} State.bodies.splice(idx,1);} updateCap(); }

// Hook paint into loop by wrapping the integrate loop
const _integrate = integrate;
integrate = function(bodies, step){ tickPaint(step); _integrate(bodies, step); };

// ===== Collisions & Merging (2D on plane) =====
const hash = new Map();
function rebuildHash(){ hash.clear(); const gs=CONFIG.gridSize; for (let i=0;i<State.bodies.length;i++){ const b=State.bodies[i]; const gx=Math.floor(b.x/gs), gy=Math.floor(b.y/gs); const key=gx+','+gy; if(!hash.has(key)) hash.set(key, []); hash.get(key).push(i); } }
function resolveCollisions(){ rebuildHash(); const dirs=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]; const removed=new Set(); const bodies=State.bodies; for (let i=0;i<bodies.length;i++){ if (removed.has(i)) continue; const A=bodies[i]; const gx=Math.floor(A.x/CONFIG.gridSize), gy=Math.floor(A.y/CONFIG.gridSize); for (const [dx,dy] of dirs){ const cell=hash.get((gx+dx)+','+(gy+dy)); if(!cell) continue; for (const j of cell){ if (j<=i||removed.has(j)) continue; const B=bodies[j]; const dxp=B.x-A.x, dyp=B.y-A.y; const rs=(A.radius+B.radius); if (dxp*dxp + dyp*dyp <= rs*rs){ const [big, small, smallIdx] = (A.mass>=B.mass)?[A,B,j]:[B,A,i]; mergeBodies(big, small); removed.add(smallIdx); } } } }
  if (removed.size){ // remove meshes too
    const keep=[]; for (let idx=0; idx<bodies.length; idx++){ if (!removed.has(idx)) keep.push(bodies[idx]); else { const b=bodies[idx]; const m=bodyToMesh.get(b.id); if (m){ root.remove(m); bodyToMesh.delete(b.id);} } } State.bodies = keep; updateCap(); }
}
function mergeBodies(A,B){ const M=A.mass+B.mass; const vx=(A.vx*A.mass+B.vx*B.mass)/M; const vy=(A.vy*A.mass+B.vy*B.mass)/M; const x=(A.x*A.mass+B.x*B.mass)/M; const y=(A.y*A.mass+B.y*B.mass)/M; const comp={ gas:(A.comp.gas*A.mass+B.comp.gas*B.mass)/M, rock:(A.comp.rock*A.mass+B.comp.rock*B.mass)/M, ice:(A.comp.ice*A.mass+B.comp.ice*B.mass)/M }; A.mass=M; A.vx=vx; A.vy=vy; A.x=x; A.y=y; A.comp=comp; A.density=mixDensity(comp); A.radius=radiusFromMassDensity(M, A.density); const prevType=A.type; A.type=classify(A.mass, A.comp.gas); const mesh=bodyToMesh.get(A.id); if (mesh){ // Update geometry scale
  const s=A.radius/(mesh.geometry.parameters.radius||A.radius); mesh.scale.setScalar(s); }
  // If classification changed, rebuild mesh accordingly
  if (prevType !== A.type){ const old=bodyToMesh.get(A.id); if (old){ root.remove(old); } const newMesh = (A.type==='star')? makeStarMesh(A) : makePlanetMesh(A); newMesh.position.set(A.x, 0, A.y); root.add(newMesh); bodyToMesh.set(A.id, newMesh); }
}

// ===== Trails & Vectors =====
function resetAllTrails(){ for (const [id, m] of bodyToMesh){ if (m.userData.trail){ root.remove(m.userData.trail); m.userData.trail=null; m.userData.trailPts=[]; } } }
function updateTrail(b, mesh){ const mode=State.trails; const maxLen = mode==='short'?24: mode==='long'?60: 0; if (!maxLen) return; if (!mesh.userData.trail){ const geom=new THREE.BufferGeometry(); const arr=new Float32Array(maxLen*3); geom.setAttribute('position', new THREE.BufferAttribute(arr,3)); const mat=new THREE.LineBasicMaterial({ color: 0x88aaff, transparent:true, opacity:0.35 }); const line=new THREE.Line(geom, mat); root.add(line); mesh.userData.trail=line; mesh.userData.trailIdx=0; }
  const line=mesh.userData.trail; const attr=line.geometry.getAttribute('position'); const arr=attr.array; // shift
  for (let i=0;i<(maxLen-1);i++){ arr[i*3]=arr[(i+1)*3]; arr[i*3+1]=arr[(i+1)*3+1]; arr[i*3+2]=arr[(i+1)*3+2]; }
  arr[(maxLen-1)*3]=b.x; arr[(maxLen-1)*3+1]=0; arr[(maxLen-1)*3+2]=b.y; attr.needsUpdate=true; }

function resetAllVectors(){ for (const [id,m] of bodyToMesh){ if (m.userData.vec){ root.remove(m.userData.vec); m.userData.vec=null; } } }
function updateVector(b, mesh){ if (State.vectors==='off') return; if (!mesh.userData.vec){ const geom=new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6),3)); const mat=new THREE.LineBasicMaterial({ color: State.vectors==='vel'?0x58e6a9:0xffb86b }); const line=new THREE.Line(geom, mat); root.add(line); mesh.userData.vec=line; }
  const scale = State.vectors==='vel'? 0.8 : 120.0; const vx = State.vectors==='vel'? b.vx : b.ax*scale; const vy = State.vectors==='vel'? b.vy : b.ay*scale; const attr=mesh.userData.vec.geometry.getAttribute('position'); const a=attr.array; a[0]=b.x; a[1]=0; a[2]=b.y; a[3]=b.x+vx; a[4]=0; a[5]=b.y+vy; attr.needsUpdate=true; }

// ===== Seeds / Save / Load / Clear =====
function largestStar(){ let s=null; for (const b of State.bodies) if (b.type==='star' && (!s || b.mass>s.mass)) s=b; return s; }
function seedDemo(){ clearAll(); const star = createBody(0,0, CONFIG.starMassThreshold*1.2, {gas:0.85,rock:0.1,ice:0.05},0,0); State.bodies.push(star); const mk=(r,m,comp)=>{ const a=Math.random()*Math.PI*2; const x=r*Math.cos(a), y=r*Math.sin(a); const v=Math.sqrt(CONFIG.G*star.mass/r); const vx=-Math.sin(a)*v, vy=Math.cos(a)*v; State.bodies.push(createBody(x,y,m,comp,vx,vy)); }; mk(160, CONFIG.planetMassThreshold*1.2, {gas:0.1,rock:0.85,ice:0.05}); mk(280, CONFIG.planetMassThreshold*3.0, {gas:0.7,rock:0.25,ice:0.05}); mk(380, CONFIG.planetMassThreshold*2.4, {gas:0.25,rock:0.2,ice:0.55}); rebuildMeshes(); }
function seedRandomBelt(){ let s=largestStar(); if (!s){ const star=createBody(0,0, CONFIG.starMassThreshold*1.1, {gas:0.9,rock:0.08,ice:0.02},0,0); State.bodies.push(star); s=star; } const base=260+Math.random()*160; const spread=60; const count=120+Math.floor(Math.random()*120); for (let i=0;i<count && State.bodies.length<CONFIG.maxBodies;i++){ const r=base + (Math.random()-0.5)*spread; const ang=Math.random()*Math.PI*2; const x=r*Math.cos(ang), y=r*Math.sin(ang); const vc=Math.sqrt(CONFIG.G*s.mass/r) * (0.9 + Math.random()*0.2); const dir = Math.random()<0.92?1:-1; const vx=-Math.sin(ang)*vc*dir, vy=Math.cos(ang)*vc*dir; const m=1+Math.random()*3; const mix=Math.random(); const comp=mix<0.4?{gas:0.1,rock:0.7,ice:0.2}:mix<0.8?{gas:0.2,rock:0.2,ice:0.6}:{gas:0.6,rock:0.3,ice:0.1}; State.bodies.push(createBody(x,y,m,comp,vx,vy)); } rebuildMeshes(); }
function clearAll(){ // remove meshes
  for (const [id,m] of bodyToMesh){ root.remove(m); } bodyToMesh.clear(); State.bodies.length=0; updateCap(); }
function rebuildMeshes(){ for (const [id,m] of bodyToMesh){ root.remove(m); } bodyToMesh.clear(); for (const b of State.bodies) addBodyMesh(b); updateCap(); }
function saveToLocal(){ const payload={ version:1, config:{ G:CONFIG.G, softening:CONFIG.softening, timeScale:CONFIG.timeScale, brushSize:CONFIG.brushSize, massPerDot:CONFIG.massPerDot, spawnRate:CONFIG.spawnRate, trails:State.trails, vectors:State.vectors }, bodies: State.bodies.map(b=>({id:b.id,x:b.x,y:b.y,vx:b.vx,vy:b.vy,mass:b.mass,comp:b.comp})) }; localStorage.setItem('solar-sandbox-state-v1', JSON.stringify(payload)); }
function loadFromLocalStorage(){ try{ const raw=localStorage.getItem('solar-sandbox-state-v1'); if(!raw) return; const data=JSON.parse(raw); CONFIG.G=data.config?.G ?? CONFIG.G; CONFIG.softening=data.config?.softening ?? CONFIG.softening; CONFIG.timeScale=data.config?.timeScale ?? CONFIG.timeScale; CONFIG.brushSize=data.config?.brushSize ?? CONFIG.brushSize; CONFIG.massPerDot=data.config?.massPerDot ?? CONFIG.massPerDot; CONFIG.spawnRate=data.config?.spawnRate ?? CONFIG.spawnRate; State.trails = data.config?.trails ?? State.trails; State.vectors = data.config?.vectors ?? State.vectors; State.bodies = data.bodies.map(b=>createBody(b.x,b.y,b.mass,b.comp,b.vx,b.vy)); }catch(e){} }

// Edges behavior (3D plane)
function handleEdges3D(){ const W=CONFIG.worldW/2, H=CONFIG.worldH/2; const eb=State.edgeBehavior; if (eb==='wrap'){ for (const b of State.bodies){ if (b.x < -W) b.x += 2*W; else if (b.x > W) b.x -= 2*W; if (b.y < -H) b.y += 2*H; else if (b.y > H) b.y -= 2*H; } } else if (eb==='bounce'){ for (const b of State.bodies){ if (b.x - b.radius < -W && b.vx < 0){ b.x = -W + b.radius; b.vx = -b.vx; } if (b.x + b.radius > W && b.vx > 0){ b.x = W - b.radius; b.vx = -b.vx; } if (b.y - b.radius < -H && b.vy < 0){ b.y = -H + b.radius; b.vy = -b.vy; } if (b.y + b.radius > H && b.vy > 0){ b.y = H - b.radius; b.vy = -b.vy; } } } else if (eb==='void'){ for (let i=State.bodies.length-1;i>=0;i--){ const b=State.bodies[i]; if (b.x < -W-50 || b.x > W+50 || b.y < -H-50 || b.y > H+50){ const m=bodyToMesh.get(b.id); if (m){ root.remove(m); bodyToMesh.delete(b.id);} State.bodies.splice(i,1); } } updateCap(); }
}
