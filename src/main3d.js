import * as THREE from 'three';

// Basic CONFIG mirroring 2D where relevant
const CONFIG = {
  G: 0.28,
  softening: 18,
  timeScale: 1.0,
  speedBoost: 1.8,
  physicsHz: 180,
  maxBodies: 600,
  gridSize: 48,
  starMassThreshold: 1400,
  planetMassThreshold: 60,
  igniteGasFraction: 0.7,
  density: { gas: 0.7, rock: 3.2, ice: 1.2 },
  radiusScale: 2.2,
};

const State = {
  bodies: [],
  nextId: 1,
  accum: 0,
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
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Lights (ambient fill); main light is star emissive
scene.add(new THREE.AmbientLight(0x223344, 0.4));

// Root group
const root = new THREE.Group(); scene.add(root);

// Mesh factory
function makePlanetMesh(body){
  const geo = new THREE.SphereGeometry(body.radius, Math.max(16, Math.min(64, Math.round(body.radius*1.5))), Math.max(12, Math.min(48, Math.round(body.radius))));
  const dom = (body.comp.gas>=body.comp.ice && body.comp.gas>=body.comp.rock) ? 'gas' : (body.comp.ice>=body.comp.gas && body.comp.ice>=body.comp.rock ? 'ice' : 'rock');
  let color;
  if (dom==='gas') color = new THREE.Color(0xcabeb0/0xffffff);
  else if (dom==='ice') color = new THREE.Color(0xd8f2ff/0xffffff);
  else color = new THREE.Color(0xb08f78/0xffffff);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: dom==='ice'?0.2:0.7, metalness:0.0, clearcoat: dom!=='rock'? 0.3: 0.0, transmission: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.type = 'planet';
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

// Camera controls (basic mouse drag to rotate around Z)
let isDown=false, lastX=0, lastY=0, rotY=0, rotX=0;
renderer.domElement.addEventListener('mousedown', e=>{ isDown=true; lastX=e.clientX; lastY=e.clientY; });
window.addEventListener('mouseup', ()=>{ isDown=false; });
window.addEventListener('mousemove', e=>{ if(!isDown) return; const dx=e.clientX-lastX, dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; rotY += dx*0.003; rotX = THREE.MathUtils.clamp(rotX + dy*0.003, -0.8, 0.8); updateCamera(); });
function updateCamera(){ const d=1100; const cx=0, cy=0; camera.position.set(Math.sin(rotY)*d*Math.cos(rotX), d*Math.sin(rotX), Math.cos(rotY)*d*Math.cos(rotX)); camera.lookAt(cx,0,cy); }
updateCamera();

window.addEventListener('resize', ()=>{ camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

// Animation loop (fixed-step physics)
let last = performance.now()/1000;
function loop(nowMs){ const now=nowMs/1000; let dt=now-last; last=now; dt=Math.min(0.05, Math.max(0, dt)); const step=1/CONFIG.physicsHz; State.accum += dt; while(State.accum>=step){ integrate(State.bodies, step); State.accum -= step; }
  // Update meshes
  for (const b of State.bodies){ const m = bodyToMesh.get(b.id); if (!m) continue; m.position.set(b.x, 0, b.y); m.rotation.y += 0.002; }
  renderer.render(scene, camera); requestAnimationFrame(loop); }
requestAnimationFrame(loop);

