'use strict';
// ===== world3d.js: 오픈월드 3D 렌더러 =====
// drawWorld3D()가 2D drawWorld()를 대신한다 (WebGL이 없으면 main.js가 2D를 그대로 쓴다).
// 게임 규칙은 world.js 그대로이고, 여기서는 상태(S, owner, bandits ...)를 읽어서 그리기만 한다.
// world.js 훅: setTile → w3dNotify('tile', i) / recomputeOwner → w3dNotify('owner')
const CK = 16, NCK = W / CK, TPX = 16; // 청크 크기(타일), 청크 수(한 변), 지면 텍스처 타일당 px
const W3_PITCH = 53 * Math.PI / 180;
let W3 = null;
const w3dDirtyTiles = [];
let w3dOwnerDirty = false;
function w3dNotify(kind, i) {
  if (!W3) return;
  if (kind === 'tile') w3dDirtyTiles.push(i); else if (kind === 'owner') w3dOwnerDirty = true;
}

// ---------- 초기화 ----------
function w3dInit() {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(42, VW / VH, 1, 160);
  scene.background = new THREE.Color(0x9ccbe6);
  scene.fog = new THREE.Fog(0x9ccbe6, 40, 90);
  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x5a6a40, 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, 0.85);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -21; sc.right = 21; sc.top = 21; sc.bottom = -21; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const pts = [];
  for (let k = 0; k < 4; k++) { const L = new THREE.PointLight(0xffa050, 0, 7, 2); scene.add(L); pts.push(L); }

  // 바다: 깊은 바닥 + 반투명 수면 + 물결 반짝임
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1f4a6c }));
  ocean.position.set(W / 2, -0.72, H / 2); scene.add(ocean);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x3a92c8, transparent: true, opacity: 0.52, shininess: 70, specular: 0x9fd8ff, depthWrite: false }));
  water.position.set(W / 2, -0.1, H / 2); water.renderOrder = 1; scene.add(water);
  const wc = document.createElement('canvas'); wc.width = wc.height = 128;
  const wg = wc.getContext('2d'); wg.fillStyle = '#000'; wg.fillRect(0, 0, 128, 128);
  const wr = mulberry(77);
  wg.strokeStyle = 'rgba(255,255,255,.55)'; wg.lineWidth = 2; wg.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    const x = wr() * 128, y = wr() * 128, l = 8 + wr() * 12;
    for (const ox of [0, -128, 128]) for (const oy of [0, -128, 128]) { wg.beginPath(); wg.moveTo(x + ox, y + oy); wg.quadraticCurveTo(x + ox + l / 2, y + oy - 4, x + ox + l, y + oy); wg.stroke(); }
  }
  const wtex = new THREE.CanvasTexture(wc); wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.repeat.set(700 / 5, 700 / 5);
  const waves = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: wtex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.22, fog: false }));
  waves.position.set(W / 2, -0.085, H / 2); waves.renderOrder = 2; scene.add(waves);

  // 숲 재질: 바람에 흔들림 + 벌목 중인 칸은 크게 흔들림
  const uTime = { value: 0 }, uChop = { value: new THREE.Vector3(-99, -99, 0) };
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  treeMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime; sh.uniforms.uChop = uChop;
    sh.vertexShader = 'uniform float uTime;\nuniform vec3 uChop;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  float hgt = max(0.0, position.y - 0.25);
  float sw = sin(uTime * 1.7 + ip.x * 0.8 + ip.y * 0.6) * 0.03 * hgt;
  float inT = step(abs(ip.x - uChop.x), 0.5) * step(abs(ip.y - uChop.y), 0.5);
  sw += sin(uTime * 55.0) * uChop.z * inT * 0.5 * hgt;
  transformed.x += sw; transformed.z += sw * 0.5;
#endif`);
  };
  treeMat.customProgramCacheKey = () => 'w3tree';
  const goldMat = new THREE.MeshLambertMaterial({ color: 0xffd34d, emissive: 0x7a5200 });

  // 행동 대상 고리 / 휘두르기 궤적
  const ringParts = [];
  for (let k = 0; k < 10; k++) ringParts.push({ g: new THREE.RingGeometry(0.5, 0.6, 4, 1, k / 10 * Math.PI * 2, Math.PI * 2 / 10 * 0.6), c: '#fff0b4' });
  const ring = new THREE.Mesh(R3D.merge(ringParts).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  ring.renderOrder = 3; scene.add(ring);
  const slash = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 18, 1, -1.1, 2.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  slash.renderOrder = 4; scene.add(slash);

  W3 = { scene, cam, hemi, sun, pts, water, waves, wtex, treeMat, goldMat, uTime, uChop, ring, slash,
    frustum: new THREE.Frustum(), pm: new THREE.Matrix4(), chunks: [], dyn: new Map(), pool: new Map(), frame: 0,
    arrows: [], S: null, tx: 0, tz: 0, lastT: performance.now(), dist: 30, look: new WeakMap() };
  R3D.onResize.push(w3dResize); w3dResize();
}
function w3dResize() {
  const c = W3.cam; c.aspect = VW / VH;
  const t = Math.tan(c.fov / 2 * Math.PI / 180);
  W3.dist = clamp(c.aspect < 1 ? 5.4 / (t * c.aspect) : 6.2 / t, 12, 40);
  c.far = W3.dist * 3; c.updateProjectionMatrix();
  W3.scene.fog.near = W3.dist * 1.05; W3.scene.fog.far = W3.dist * 2.2;
}

// ---------- 새 세계(새 게임/불러오기) ----------
function w3dReset() {
  W3.S = S;
  for (const c of W3.chunks) { w3dFreeGround(c); w3dFreeProps(c); }
  W3.chunks = [];
  for (let cz = 0; cz < NCK; cz++) for (let cx = 0; cx < NCK; cx++)
    W3.chunks.push({ cx, cz, box: new THREE.Box3(new THREE.Vector3(cx * CK - 2, -1, cz * CK - 2), new THREE.Vector3(cx * CK + CK + 2, 3.5, cz * CK + CK + 2)), ground: null, gDirty: true, props: null, pDirty: true });
  const ch = W3.ch = new Float32Array((W + 1) * (H + 1));
  for (let vz = 0; vz <= H; vz++) for (let vx = 0; vx <= W; vx++) {
    let allW = true, md = 9;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const x = vx + dx, z = vz + dz;
      if (tileAt(x, z) !== WATER) { allW = false; break; }
      md = Math.min(md, (x < 0 || z < 0 || x >= W || z >= H) ? 6 : waterDepth[z * W + x]);
    }
    ch[vz * (W + 1) + vx] = allW ? -(0.2 + 0.075 * Math.min(md, 6)) : 0;
  }
  W3.prevHp = S.hp.slice(); W3.ownSnap = owner.slice();
  for (const [o, r] of W3.dyn) w3dDrop(o, r);
  w3dDirtyTiles.length = 0; w3dOwnerDirty = false;
  W3.tx = S.player.x / T; W3.tz = S.player.y / T;
}

// ---------- 지면 (청크별 캔버스 텍스처) ----------
const W3_WATER_BED = ['#1d4669', '#d4c189', '#8fc4a0', '#4f9ea2', '#357f98', '#29638a', '#1d4669'];
function w3dBaseCol(t, x, y) {
  const h = hash2(x, y), patch = hash2(x >> 2, (y >> 2) + 777);
  if (t === WATER) return W3_WATER_BED[(x < 0 || y < 0 || x >= W || y >= H) ? 6 : waterDepth[y * W + x] || 6];
  if (t === SAND) return shadeHex('#e6d39a', 0.95 + h * 0.08);
  if (t === FOREST) return shadeHex('#4a8338', 0.9 + h * 0.08 + patch * 0.06);
  if (t === MOUNTAIN || t === GOLD) return shadeHex('#828c66', 0.92 + h * 0.1);
  return shadeHex('#74b552', 0.9 + h * 0.06 + patch * 0.1);
}
const w3dSmall = document.createElement('canvas'); w3dSmall.width = w3dSmall.height = CK + 2;
const w3dSmallG = w3dSmall.getContext('2d');
const w3dBed = document.createElement('canvas'); w3dBed.width = w3dBed.height = CK * TPX;
const w3dBedG = w3dBed.getContext('2d');
function w3dMakeGround(c) {
  const geo = new THREE.PlaneGeometry(CK, CK, CK, CK).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = Math.round(pos.getX(i) + CK / 2) + c.cx * CK, vz = Math.round(pos.getZ(i) + CK / 2) + c.cz * CK;
    pos.setY(i, W3.ch[vz * (W + 1) + vx]);
  }
  geo.computeVertexNormals();
  const can = document.createElement('canvas'); can.width = can.height = CK * TPX;
  const tex = new THREE.CanvasTexture(can); tex.anisotropy = Math.min(4, R3D.maxAniso || 1);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  mesh.position.set(c.cx * CK + CK / 2, 0, c.cz * CK + CK / 2); mesh.receiveShadow = true;
  c.ground = mesh; c.can = can; c.g = can.getContext('2d'); c.tex = tex; c.gDirty = true;
  W3.scene.add(mesh);
}
function w3dFreeGround(c) {
  if (!c.ground) return;
  W3.scene.remove(c.ground); c.ground.geometry.dispose(); c.ground.material.dispose(); c.tex.dispose(); c.ground = null;
}
function w3dPaint(c) {
  const g = c.g, x0 = c.cx * CK, y0 = c.cz * CK, P = TPX;
  // 육지: 타일색을 부드럽게 섞는다 (물 칸은 모래색으로 → 물가가 자연스럽게 모래톱)
  let hasWater = false;
  for (let j = -1; j <= CK; j++) for (let i = -1; i <= CK; i++) {
    const x = x0 + i, y = y0 + j, t = tileAt(x, y);
    if (t === WATER) hasWater = true;
    w3dSmallG.fillStyle = t === WATER ? '#e2cf96' : w3dBaseCol(t, x, y); w3dSmallG.fillRect(i + 1, j + 1, 1, 1);
  }
  g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true;
  g.drawImage(w3dSmall, 0, 0, CK + 2, CK + 2, -P, -P, (CK + 2) * P, (CK + 2) * P);
  // 물 밑바닥: 깊이에 따라 섞은 색을 물 칸에만
  if (hasWater) {
    for (let j = -1; j <= CK; j++) for (let i = -1; i <= CK; i++) { const x = x0 + i, y = y0 + j, t = tileAt(x, y); w3dSmallG.fillStyle = t === WATER ? w3dBaseCol(t, x, y) : '#d8c48a'; w3dSmallG.fillRect(i + 1, j + 1, 1, 1); }
    w3dBedG.setTransform(1, 0, 0, 1, 0, 0); w3dBedG.imageSmoothingEnabled = true;
    w3dBedG.drawImage(w3dSmall, 0, 0, CK + 2, CK + 2, -P, -P, (CK + 2) * P, (CK + 2) * P);
    for (let j = 0; j < CK; j++) for (let i = 0; i < CK; i++) if (S.tiles[(y0 + j) * W + x0 + i] === WATER) g.drawImage(w3dBed, i * P, j * P, P, P, i * P, j * P, P, P);
  }
  const own = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : owner[y * W + x];
  for (let j = 0; j < CK; j++) for (let i = 0; i < CK; i++) {
    const x = x0 + i, y = y0 + j, t = S.tiles[y * W + x], px = i * P, py = j * P, h = hash2(x, y);
    if (t === GRASS) {
      g.strokeStyle = 'rgba(40,95,30,.28)'; g.lineWidth = 1;
      for (let k = 0; k < (h > 0.5 ? 2 : 1); k++) { const hx = px + 2 + hash2(x * 7 + k, y) * 12, hy = py + 3 + hash2(x, y * 7 + k) * 11; g.beginPath(); g.moveTo(hx - 1.5, hy - 2); g.lineTo(hx, hy); g.lineTo(hx + 1.5, hy - 2.5); g.stroke(); }
      g.fillStyle = 'rgba(255,255,220,.16)'; for (let k = 0; k < 2; k++) g.fillRect(px + hash2(x + k, y * 3) * 15, py + hash2(x * 3, y + k) * 15, 1.2, 1.2);
      if (h > 0.88) { const cols = ['#fff', '#ffd54a', '#ff8fb0', '#b8a0ff']; for (let k = 0; k < 3; k++) { g.fillStyle = cols[(k + (h * 40 | 0)) % 4]; g.beginPath(); g.arc(px + 3 + hash2(x + k * 3, y) * 10, py + 3 + hash2(x, y + k * 3) * 10, 1.1, 0, 7); g.fill(); } }
    } else if (t === FOREST) {
      for (let k = 0; k < 5; k++) { g.fillStyle = k < 3 ? 'rgba(20,55,15,.35)' : 'rgba(110,80,40,.35)'; g.beginPath(); g.arc(px + hash2(x * 5 + k, y) * 16, py + hash2(x, y * 5 + k) * 16, 1.3, 0, 7); g.fill(); }
    } else if (t === SAND) {
      g.fillStyle = 'rgba(150,120,70,.3)'; for (let k = 0; k < 4; k++) g.fillRect(px + hash2(x * 5 + k, y) * 15, py + hash2(x, y * 5 + k) * 15, 1, 1);
    } else if (t === MOUNTAIN || t === GOLD) {
      g.fillStyle = 'rgba(70,70,80,.3)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(px + hash2(x * 5 + k, y) * 16, py + hash2(x, y * 5 + k) * 16, 1.2, 0, 7); g.fill(); }
    }
    // 물가: 해변 띠 / 물거품
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nt = tileAt(x + dx, y + dy);
      if (t !== WATER && nt === WATER) {
        const gr = dx ? g.createLinearGradient(px + (dx > 0 ? P : 0), 0, px + (dx > 0 ? P - 6 : 6), 0) : g.createLinearGradient(0, py + (dy > 0 ? P : 0), 0, py + (dy > 0 ? P - 6 : 6));
        if (t !== SAND) { gr.addColorStop(0, 'rgba(230,212,156,.85)'); gr.addColorStop(1, 'rgba(230,212,156,0)'); }
        else { gr.addColorStop(0, 'rgba(170,150,100,.45)'); gr.addColorStop(1, 'rgba(170,150,100,0)'); }
        g.fillStyle = gr; g.fillRect(px, py, P, P);
      } else if (t === WATER && nt !== WATER) {
        const gr = dx ? g.createLinearGradient(px + (dx > 0 ? P : 0), 0, px + (dx > 0 ? P - 5 : 5), 0) : g.createLinearGradient(0, py + (dy > 0 ? P : 0), 0, py + (dy > 0 ? P - 5 : 5));
        gr.addColorStop(0, 'rgba(255,255,255,.6)'); gr.addColorStop(0.4, 'rgba(220,245,250,.3)'); gr.addColorStop(1, 'rgba(200,240,250,0)');
        g.fillStyle = gr; g.fillRect(px, py, P, P);
      }
    }
    // 영토
    const o = owner[y * W + x];
    if (o >= 0) {
      const col = TOWN_COLORS[o % TOWN_COLORS.length];
      g.fillStyle = col; g.globalAlpha = 0.16; g.fillRect(px, py, P, P);
      g.globalAlpha = 0.95; const b = 2;
      if (own(x - 1, y) !== o) g.fillRect(px, py, b, P);
      if (own(x + 1, y) !== o) g.fillRect(px + P - b, py, b, P);
      if (own(x, y - 1) !== o) g.fillRect(px, py, P, b);
      if (own(x, y + 1) !== o) g.fillRect(px, py + P - b, P, b);
      g.globalAlpha = 1;
    }
  }
  c.tex.needsUpdate = true;
}

// ---------- 숲 / 산 (청크별 InstancedMesh) ----------
const W3_SPOTS = [[0.28, 0.3], [0.72, 0.26], [0.3, 0.72], [0.74, 0.7]];
function w3dPropGeo(k) {
  const { box, cyl, cone, ico } = R3D.prim;
  return R3D.cached('prop|' + k, () => {
    if (k === 'round' || k === 'fruit') {
      const P = [
        { g: cyl(0.05, 0.075, 0.42, 5), c: '#6e4a2c', p: [0, 0.21, 0] },
        { g: ico(0.32, 0), c: '#3b8a35', p: [0, 0.62, 0], s: [1, 0.9, 1] },
        { g: ico(0.22, 0), c: '#4c9a38', p: [0.1, 0.82, 0.05] },
        { g: ico(0.18, 0), c: '#357d30', p: [-0.16, 0.55, 0.1] },
      ];
      if (k === 'fruit') for (const [x, y, z] of [[0.2, 0.6, 0.22], [-0.12, 0.72, 0.25], [0.05, 0.5, 0.3], [0.28, 0.75, 0.05]]) P.push({ g: ico(0.045, 0), c: '#e04a3a', p: [x, y, z] });
      return R3D.merge(P);
    }
    if (k === 'pine') return R3D.merge([
      { g: cyl(0.04, 0.06, 0.3, 5), c: '#5a3a22', p: [0, 0.15, 0] },
      { g: cone(0.34, 0.48, 7), c: '#255f37', p: [0, 0.48, 0] },
      { g: cone(0.27, 0.42, 7), c: '#2c6c3e', p: [0, 0.74, 0] },
      { g: cone(0.18, 0.34, 7), c: '#347a45', p: [0, 0.98, 0] },
    ]);
    if (k === 'mA') return R3D.merge([
      { g: cone(0.8, 1.55, 6), c: '#8d8f99', p: [0, 0.775, 0] },
      { g: cone(0.8 * 0.33, 1.55 * 0.33, 6), c: '#f4f6fb', p: [0, 1.55 - 1.55 * 0.33 / 2 + 0.01, 0], s: 1.05 },
      { g: ico(0.2, 0), c: '#7a7c84', p: [0.45, 0.1, 0.35] },
    ]);
    if (k === 'mB') return R3D.merge([
      { g: cone(0.62, 1.25, 5), c: '#8a8c96', p: [-0.18, 0.625, 0.08] },
      { g: cone(0.62 * 0.3, 1.25 * 0.3, 5), c: '#f4f6fb', p: [-0.18, 1.25 - 1.25 * 0.3 / 2 + 0.01, 0.08], s: 1.06 },
      { g: cone(0.55, 0.95, 5), c: '#9a9ca6', p: [0.3, 0.475, -0.18] },
      { g: ico(0.18, 0), c: '#7a7c84', p: [0.3, 0.08, 0.38] },
    ]);
    if (k === 'tuft') return R3D.merge([
      { g: cone(0.03, 0.22, 3), c: '#4f9a3a', p: [0, 0.1, 0], r: [0.2, 0, 0.1] },
      { g: cone(0.03, 0.18, 3), c: '#5aa840', p: [0.06, 0.08, 0.02], r: [0, 0, -0.45] },
      { g: cone(0.03, 0.17, 3), c: '#478f35', p: [-0.06, 0.08, -0.01], r: [0, 0, 0.45] },
      { g: cone(0.025, 0.15, 3), c: '#5aa840', p: [0.01, 0.07, 0.06], r: [0.5, 0, 0] },
    ]);
    if (k === 'rock') return R3D.merge([
      { g: ico(0.17, 0), c: '#8d8f96', p: [0, 0.08, 0], s: [1, 0.7, 0.9] },
      { g: ico(0.1, 0), c: '#a0a2a9', p: [0.15, 0.04, 0.08] },
    ]);
    if (k === 'nug') {
      const P = [];
      for (const [a, y, r] of [[-0.5, 0.3, 0.09], [0.3, 0.5, 0.08], [0, 0.78, 0.07], [0.75, 0.22, 0.08], [-0.15, 0.15, 0.07]]) {
        const rad = 0.8 * (1 - y / 1.55) + 0.02;
        P.push({ g: ico(r, 0), c: '#ffd34d', p: [Math.sin(a) * rad, y, Math.cos(a) * rad] });
      }
      return R3D.merge(P);
    }
  });
}
const w3dM4 = new THREE.Matrix4(), w3dQ = new THREE.Quaternion(), w3dV = new THREE.Vector3(), w3dSc = new THREE.Vector3(), w3dCol = new THREE.Color(), w3dUp = new THREE.Vector3(0, 1, 0);
function w3dBuildProps(c) {
  w3dFreeProps(c);
  const L = { round: [], fruit: [], pine: [], mA: [], mB: [], nug: [], tuft: [], rock: [] };
  const x0 = c.cx * CK, y0 = c.cz * CK;
  for (let y = y0; y < y0 + CK; y++) for (let x = x0; x < x0 + CK; x++) {
    const i = y * W + x, t = S.tiles[i], h = hash2(x, y);
    if (t === FOREST) {
      const n = Math.min(4, S.hp[i]), pine = hash2(x, y + 99) > 0.62;
      for (let k = 0; k < n; k++) {
        const sp = W3_SPOTS[(k + (h * 4 | 0)) % 4], r = hash2(x + k * 13, y + 5);
        const kind = pine ? 'pine' : (hash2(x + k * 7, y + 3) > 0.85 ? 'fruit' : 'round');
        L[kind].push([x + sp[0] + (r - 0.5) * 0.14, y + sp[1] + (hash2(x, y + k * 11) - 0.5) * 0.12, r * 6.28, 1.0 + hash2(x * 3 + k, y) * 0.35, 1.4, r]);
      }
    } else if (t === MOUNTAIN || t === GOLD) {
      const gold = t === GOLD;
      const kind = gold || h < 0.55 ? 'mA' : 'mB';
      const s = 1.0 + hash2(x + 3, y) * 0.2, sy = 1.25 + hash2(x, y + 3) * 0.5;
      L[kind].push([x + 0.5 + (h - 0.5) * 0.1, y + 0.5, gold ? 0 : h * 6.28, s, sy, h]);
      if (gold) L.nug.push([x + 0.5 + (h - 0.5) * 0.1, y + 0.5, 0, s, sy, h]);
    } else if ((t === GRASS || t === SAND) && owner[i] < 0) { // 영토 밖 풀숲·바위 (영토 안은 건물 자리라 비움)
      const h2 = hash2(x + 17, y + 31), h3 = hash2(x + 5, y + 71);
      if (t === GRASS && h2 < 0.3) L.tuft.push([x + 0.2 + h3 * 0.6, y + 0.2 + hash2(x, y + 9) * 0.6, h2 * 20, 1.3 + h3 * 0.7, 1, h3]);
      if (h2 > (t === SAND ? 0.95 : 0.975)) L.rock.push([x + 0.3 + h3 * 0.4, y + 0.3 + hash2(x + 9, y) * 0.4, h3 * 6, 0.8 + h2 * 0.6, 0.7, h3]);
    }
  }
  const grp = new THREE.Group();
  for (const k in L) {
    const list = L[k]; if (!list.length) continue;
    const tree = k === 'round' || k === 'fruit' || k === 'pine' || k === 'tuft';
    const m = new THREE.InstancedMesh(w3dPropGeo(k), tree ? W3.treeMat : k === 'nug' ? W3.goldMat : R3D.mats.vc, list.length);
    list.forEach((e, n) => {
      w3dV.set(e[0], 0, e[1]); w3dQ.setFromAxisAngle(w3dUp, e[2]); w3dSc.set(e[3], e[3] * e[4], e[3]);
      w3dM4.compose(w3dV, w3dQ, w3dSc); m.setMatrixAt(n, w3dM4);
      if (k !== 'nug') { const v = e[5]; w3dCol.setRGB(0.9 + v * 0.2, 0.9 + ((v * 7) % 1) * 0.2, 0.88 + ((v * 13) % 1) * 0.15); m.setColorAt(n, w3dCol); }
    });
    m.castShadow = k !== 'tuft'; m.receiveShadow = !tree; m.frustumCulled = false;
    grp.add(m);
  }
  c.props = grp; c.pDirty = false; W3.scene.add(grp);
}
function w3dFreeProps(c) {
  if (!c.props) return;
  W3.scene.remove(c.props); for (const m of c.props.children) m.dispose(); c.props = null;
}

// ---------- 건물 모델 ----------
function w3dPrism(w, h, d) { // 박공지붕: 단면 삼각형(폭 w, 높이 h)을 z로 d만큼 (용마루는 z축)
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}
function w3dMerlons(P, x0, z0, x1, z1, y, col, skip) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 0.2)), along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  for (let k = 0; k <= n; k++) {
    if (k % 2) continue;
    const x = lerp(x0, x1, k / n), z = lerp(z0, z1, k / n);
    if (skip && skip(x, z)) continue;
    P.push({ g: R3D.prim.box(along ? 0.1 : 0.16, 0.09, along ? 0.16 : 0.1), c: col, p: [x, y + 0.045, z] });
  }
}
function w3dCastle(lv) {
  return R3D.cached('castle' + lv, () => {
    const { box, cyl, cone } = R3D.prim;
    const st = '#ebe0c6', st2 = '#cfc1a0', dk = '#3f2c1a', roof = '#3f6fc8', gold = '#f2c14e';
    const s = 1.5 + lv * 0.24, hs = s / 2, wh = 0.32 + lv * 0.07, th = 0.14, gw = 0.36, seg = (s - gw) / 2;
    const P = [], G = [];
    P.push({ g: box(s + 0.24, 0.06, s + 0.24), c: '#a29374', p: [0, 0.03, 0] });
    P.push({ g: box(s, wh, th), c: st2, p: [0, wh / 2, -hs] });
    P.push({ g: box(th, wh, s), c: st2, p: [-hs, wh / 2, 0] });
    P.push({ g: box(th, wh, s), c: st2, p: [hs, wh / 2, 0] });
    P.push({ g: box(seg, wh, th), c: st, p: [-(gw / 2 + seg / 2), wh / 2, hs] });
    P.push({ g: box(seg, wh, th), c: st, p: [gw / 2 + seg / 2, wh / 2, hs] });
    P.push({ g: box(gw + 0.18, wh + 0.14, th + 0.1), c: st, p: [0, (wh + 0.14) / 2, hs] });
    P.push({ g: box(gw - 0.08, wh * 0.72, 0.03), c: dk, p: [0, wh * 0.36, hs + th / 2 + 0.06] });
    const skipGate = (x, z) => z > 0 && Math.abs(x) < gw / 2 + 0.1;
    w3dMerlons(P, -hs, -hs, hs, -hs, wh, st, null);
    w3dMerlons(P, -hs, hs, hs, hs, wh, st, skipGate);
    w3dMerlons(P, -hs, -hs, -hs, hs, wh, st, null);
    w3dMerlons(P, hs, -hs, hs, hs, wh, st, null);
    w3dMerlons(P, -gw / 2 - 0.09, hs, gw / 2 + 0.09, hs, wh + 0.14, st, null);
    if (lv === 5) { P.push({ g: box(s + 0.02, 0.04, th + 0.02), c: gold, p: [0, wh - 0.06, hs] }); P.push({ g: box(s + 0.02, 0.04, th + 0.02), c: gold, p: [0, wh - 0.06, -hs] }); }
    // 망루
    const towers = lv >= 3 ? [[-hs, hs], [hs, hs], [-hs, -hs], [hs, -hs]] : lv >= 2 ? [[-hs, hs], [hs, hs]] : [];
    const tH = wh + 0.32 + lv * 0.04;
    for (const [x, z] of towers) {
      P.push({ g: cyl(0.2, 0.23, tH, 8), c: st, p: [x, tH / 2, z] });
      P.push({ g: cyl(0.26, 0.24, 0.1, 8), c: st2, p: [x, tH + 0.05, z] });
      if (lv >= 4) P.push({ g: cone(0.3, 0.42, 8), c: roof, p: [x, tH + 0.31, z] });
      else for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P.push({ g: box(0.08, 0.09, 0.08), c: st, p: [x + Math.sin(a) * 0.21, tH + 0.145, z + Math.cos(a) * 0.21] }); }
      G.push({ g: box(0.07, 0.11, 0.02), c: '#fff', p: [x, tH * 0.62, z + 0.215] });
    }
    let topY, fx = 0, fz = -0.15;
    if (lv <= 2) { // 마을회관
      P.push({ g: box(0.66, 0.4, 0.52), c: '#f1e4c6', p: [0, 0.2, -0.12] });
      P.push({ g: w3dPrism(0.6, 0.3, 0.76).rotateY(Math.PI / 2), c: '#c8553a', p: [0, 0.4, -0.12] });
      P.push({ g: box(0.13, 0.22, 0.02), c: dk, p: [0, 0.11, 0.15] });
      G.push({ g: box(0.1, 0.09, 0.02), c: '#fff', p: [-0.2, 0.25, 0.15] }); G.push({ g: box(0.1, 0.09, 0.02), c: '#fff', p: [0.2, 0.25, 0.15] });
      topY = 0.7; fx = 0.3; fz = -0.12;
    } else { // 성채
      const kw = 0.72 + lv * 0.06, kh = 0.85 + (lv - 3) * 0.28;
      P.push({ g: box(kw, kh, kw), c: st, p: [0, kh / 2, -0.15] });
      P.push({ g: box(kw + 0.06, 0.05, kw + 0.06), c: st2, p: [0, kh * 0.55, -0.15] });
      P.push({ g: box(0.16, 0.24, 0.02), c: dk, p: [0, 0.12, -0.15 + kw / 2 + 0.01] });
      for (const wx of [-kw * 0.25, kw * 0.25]) G.push({ g: box(0.08, 0.13, 0.02), c: '#fff', p: [wx, kh * 0.72, -0.15 + kw / 2 + 0.01] });
      if (lv >= 4) {
        P.push({ g: cone(kw * 0.78, 0.55 + (lv - 4) * 0.25, 4), c: roof, p: [0, kh + (0.55 + (lv - 4) * 0.25) / 2, -0.15], r: [0, Math.PI / 4, 0] });
        topY = kh + 0.55 + (lv - 4) * 0.25;
        if (lv === 5) P.push({ g: cyl(0.03, 0.03, 0.06, 6), c: gold, p: [0, topY, -0.15] });
      } else {
        w3dMerlons(P, -kw / 2, -0.15 - kw / 2, kw / 2, -0.15 - kw / 2, kh, st, null); w3dMerlons(P, -kw / 2, -0.15 + kw / 2, kw / 2, -0.15 + kw / 2, kh, st, null);
        w3dMerlons(P, -kw / 2, -0.15 - kw / 2, -kw / 2, -0.15 + kw / 2, kh, st, null); w3dMerlons(P, kw / 2, -0.15 - kw / 2, kw / 2, -0.15 + kw / 2, kh, st, null);
        topY = kh;
      }
    }
    P.push({ g: cyl(0.018, 0.018, 0.6, 4), c: '#3a2a1a', p: [fx, topY + 0.3, fz] });
    return { main: R3D.merge(P), glow: R3D.merge(G), flag: [fx + 0.02, topY + 0.58, fz], top: topY + 0.65 };
  });
}
function w3dBuildingGeo(type) {
  return R3D.cached('bld|' + type, () => {
    const { box, cyl, cone, ico } = R3D.prim;
    const P = [], G = [];
    let flag = null;
    if (type === 'house') {
      P.push({ g: box(0.62, 0.4, 0.5), c: '#f1e4c6', p: [0, 0.2, 0] });
      for (const [x, z] of [[-0.31, 0.25], [0.31, 0.25], [-0.31, -0.25], [0.31, -0.25]]) P.push({ g: box(0.05, 0.4, 0.05), c: '#6b4a2e', p: [x, 0.2, z] });
      P.push({ g: box(0.64, 0.05, 0.52), c: '#6b4a2e', p: [0, 0.4, 0] });
      P.push({ g: w3dPrism(0.66, 0.32, 0.78).rotateY(Math.PI / 2), c: '#c8553a', p: [0, 0.42, 0] });
      P.push({ g: box(0.09, 0.24, 0.09), c: '#7a7a80', p: [0.2, 0.62, -0.08] });
      P.push({ g: box(0.13, 0.23, 0.02), c: '#5b3a20', p: [-0.13, 0.115, 0.255] });
      G.push({ g: box(0.13, 0.1, 0.02), c: '#fff', p: [0.14, 0.24, 0.255] });
    } else if (type === 'farm') {
      P.push({ g: box(0.92, 0.05, 0.92), c: '#8a6438', p: [0, 0.025, 0] });
      for (let r = 0; r < 4; r++) {
        const z = -0.33 + r * 0.22;
        P.push({ g: box(0.84, 0.03, 0.07), c: '#6f4e2a', p: [0, 0.06, z] });
        for (let j = 0; j < 5; j++) P.push({ g: cone(0.055, 0.17, 4), c: (r + j) % 3 ? '#e8c547' : '#9cc94a', p: [-0.32 + j * 0.16, 0.14, z] });
      }
      for (const z of [-0.47, 0.47]) P.push({ g: box(0.96, 0.04, 0.03), c: '#a07a4a', p: [0, 0.12, z] });
      for (const x of [-0.47, 0.47]) P.push({ g: box(0.03, 0.04, 0.96), c: '#a07a4a', p: [x, 0.12, 0] });
      for (const [x, z] of [[-0.47, -0.47], [0.47, -0.47], [-0.47, 0.47], [0.47, 0.47]]) P.push({ g: box(0.05, 0.18, 0.05), c: '#7a5a30', p: [x, 0.09, z] });
    } else if (type === 'tower') {
      P.push({ g: cyl(0.2, 0.25, 1.15, 8), c: '#b8b8c0', p: [0, 0.575, 0] });
      P.push({ g: cyl(0.215, 0.23, 0.04, 8), c: '#8a8a92', p: [0, 0.45, 0] });
      P.push({ g: cyl(0.31, 0.27, 0.14, 8), c: '#c6c6cc', p: [0, 1.22, 0] });
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; P.push({ g: box(0.09, 0.1, 0.09), c: '#c6c6cc', p: [Math.sin(a) * 0.26, 1.34, Math.cos(a) * 0.26] }); }
      P.push({ g: box(0.12, 0.22, 0.02), c: '#222222', p: [0, 0.11, 0.245] });
      P.push({ g: cyl(0.015, 0.015, 0.55, 4), c: '#3a2a1a', p: [0, 1.55, 0] });
      G.push({ g: box(0.07, 0.12, 0.02), c: '#fff', p: [0, 0.8, 0.22] });
      flag = [0.015, 1.8, 0];
    } else if (type === 'market') {
      for (const [x, z] of [[-0.36, -0.22], [0.36, -0.22], [-0.36, 0.26], [0.36, 0.26]]) P.push({ g: cyl(0.025, 0.025, 0.62, 4), c: '#7a5230', p: [x, 0.31, z] });
      P.push({ g: box(0.78, 0.28, 0.3), c: '#a0703e', p: [0, 0.14, 0.12] });
      P.push({ g: box(0.8, 0.03, 0.32), c: '#7a5230', p: [0, 0.29, 0.12] });
      [['#e8c547', -0.25], ['#e8c547', -0.12], ['#d9483b', 0.02], ['#9cc94a', 0.16], ['#d9483b', 0.28]].forEach(([c, x]) => P.push({ g: ico(0.055, 0), c, p: [x, 0.34, 0.12] }));
      for (let k = 0; k < 6; k++) P.push({ g: box(0.14, 0.03, 0.66), c: k % 2 ? '#fdf6e8' : '#d9483b', p: [-0.35 + k * 0.14, 0.63, 0.02], r: [0.22, 0, 0] });
      P.push({ g: box(0.22, 0.22, 0.2), c: '#6b4a2a', p: [0.22, 0.11, -0.2] });
    }
    if (!P.length && typeof w3dResBldGeo === 'function') return w3dResBldGeo(type); // tap-to-act / resource buildings
    return { main: R3D.merge(P), glow: G.length ? R3D.merge(G) : null, flag };
  });
}
function w3dCampGeo() {
  return R3D.cached('camp', () => {
    const { box, cyl, cone, ico } = R3D.prim;
    const tx = -0.15, tz = -0.15, hw = 0.62 * Math.SQRT1_2;
    const P = [
      { g: cone(0.62, 0.9, 4), c: '#8e2b23', p: [tx, 0.45, tz], r: [0, Math.PI / 4, 0] },
      { g: box(0.24, 0.34, 0.02), c: '#1a0806', p: [tx, 0.17, tz + hw * (1 - 0.17 / 0.9) + 0.015], r: [-Math.atan(hw / 0.9), 0, 0] },
      { g: cyl(0.02, 0.02, 0.36, 4), c: '#4a3020', p: [tx, 1.05, tz] },
      { g: box(0.22, 0.22, 0.22), c: '#6b4a2a', p: [0.32, 0.11, -0.42] },
      { g: box(0.34, 0.06, 0.07), c: '#4a3020', p: [0.45, 0.04, 0.38], r: [0, 0.5, 0] },
      { g: box(0.34, 0.06, 0.07), c: '#4a3020', p: [0.45, 0.04, 0.38], r: [0, -0.5, 0] },
    ];
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P.push({ g: ico(0.05, 0), c: '#77777f', p: [0.45 + Math.sin(a) * 0.2, 0.03, 0.38 + Math.cos(a) * 0.2] }); }
    return R3D.merge(P);
  });
}
const w3dFlameGeo = () => R3D.cached('flame', () => R3D.merge([
  { g: R3D.prim.cone(0.14, 0.36, 6), c: '#ff8a1e', p: [0, 0.18, 0] },
  { g: R3D.prim.cone(0.08, 0.24, 5), c: '#fff1a0', p: [0, 0.14, 0.02] },
]));
const w3dFlagMats = new Map();
function w3dFlag(col, w, h) {
  w = w || 0.44; h = h || 0.28;
  const geo = new THREE.PlaneGeometry(w, h, 5, 1).translate(w / 2, -h / 2, 0);
  let mat = w3dFlagMats.get(col);
  if (!mat) { mat = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide }); w3dFlagMats.set(col, mat); }
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true;
  return { mesh, base: geo.attributes.position.array.slice(), w, ph: Math.random() * 6 };
}
function w3dWave(f, t) {
  const a = f.mesh.geometry.attributes.position, arr = a.array;
  for (let i = 0; i < a.count; i++) { const x = f.base[i * 3]; arr[i * 3 + 2] = Math.sin(t * 6 - x * 10 + f.ph) * 0.07 * (x / f.w); arr[i * 3 + 1] = f.base[i * 3 + 1] - (x / f.w) * 0.03; }
  a.needsUpdate = true;
}

// ---------- 동적 오브젝트 풀 ----------
function w3dUse(obj, pk, make) {
  let r = W3.dyn.get(obj);
  if (r && r.pk !== pk) { w3dDrop(obj, r); r = null; }
  if (!r) {
    const pool = W3.pool.get(pk);
    const m = pool && pool.length ? pool.pop() : make();
    r = { m, pk, yaw: null, lx: null, lz: null };
    W3.scene.add(m.group); W3.dyn.set(obj, r);
  }
  r.seen = W3.frame; return r;
}
function w3dDrop(obj, r) {
  W3.scene.remove(r.m.group); W3.dyn.delete(obj);
  if (r.m.flash) r.m.flash(false);
  let p = W3.pool.get(r.pk); if (!p) W3.pool.set(r.pk, p = []);
  if (p.length < 30) p.push(r.m);
}
const w3dSphere = new THREE.Sphere(new THREE.Vector3(), 1);
function w3dInView(x, z, r) { w3dSphere.center.set(x, 0.6, z); w3dSphere.radius = r; return W3.frustum.intersectsSphere(w3dSphere); }
// 이동 방향으로 부드럽게 돌기
function w3dFaceMove(r, x, z, dt, forceYaw) {
  let target = forceYaw;
  if (target === undefined && r.lx !== null) { const dx = x - r.lx, dz = z - r.lz; if (dx * dx + dz * dz > 1e-5) target = Math.atan2(dx, dz); }
  r.lx = x; r.lz = z;
  if (r.yaw === null) r.yaw = target !== undefined ? target : 0;
  else if (target !== undefined) r.yaw += angDiff(target, r.yaw) * Math.min(1, dt * 12);
  return r.yaw;
}

// ---------- 모습 ----------
const W3_HS = 1.4; // 말 크기
const W3_BSCALE = { house: [1.25, 1.4, 1.25], tower: [1.15, 1.45, 1.15], market: [1.2, 1.35, 1.2], farm: [1, 1.3, 1] };
const W3_LOOK = {
  player: { body: '#2b5fb8', trim: '#f2c14e', cape: '#c0392b', hat: 'crown', weapon: 'sword', armor: true, scale: 1.45 * 1.1 },
  bandit: { body: '#7a2a22', trim: '#2a1a12', legs: '#2a2420', hat: 'hood', helm: '#3a2a22', weapon: 'club', scale: 1.45 },
};
function w3dWarLook(cmd) {
  const f = FACTIONS[S.war ? S.war.faction : 0];
  return cmd ? { body: f.color, trim: '#c9a040', legs: '#2a2420', hat: 'horned', helm: '#8a7a50', weapon: 'axe', armor: true, cape: '#5a1a1a', scale: 1.45 * 1.3 }
    : { body: f.color, trim: '#2a2218', legs: '#2a2420', hat: 'helm', helm: '#6a6a70', plume: f.plume, weapon: 'spear', scale: 1.45 };
}
function w3dHuman(obj, look) { const key = R3D.human.key(look); return w3dUse(obj, 'h|' + key, () => R3D.human(look)); }

// ---------- 매 프레임 ----------
const w3dC1 = new THREE.Color(), w3dC2 = new THREE.Color();
const W3_SKY = { day: new THREE.Color('#9ccbe6'), dusk: new THREE.Color('#e9a46f'), night: new THREE.Color('#0d1530') };
const W3_SUN = { day: new THREE.Color('#fff3e0'), dusk: new THREE.Color('#ffa35c'), night: new THREE.Color('#7f98e6') };
function w3dLighting(lightSrc) {
  const d = dayInfo(), night = clamp(d.dark / 0.6, 0, 1), dusk = d.dusk * (1 - night);
  const mix3 = (o, out) => { out.copy(o.day).lerp(o.dusk, dusk * 0.85); out.lerp(o.night, night); return out; };
  mix3(W3_SKY, W3.scene.background); W3.scene.fog.color.copy(W3.scene.background);
  mix3(W3_SUN, W3.sun.color);
  W3.sun.intensity = lerp(0.88, 0.32, night) * (1 - dusk * 0.15);
  W3.hemi.intensity = lerp(0.62, 0.42, night);
  W3.hemi.color.set('#d8ecff').lerp(w3dC1.set('#4a5a9a'), night);
  W3.hemi.groundColor.set('#5a6a40').lerp(w3dC1.set('#1a1c34'), night);
  R3D.mats.glow.emissiveIntensity = clamp((night - 0.05) * 1.6 + dusk * 0.35, 0, 1.3);
  W3.waves.material.opacity = lerp(0.22, 0.08, night);
  W3.water.material.color.set('#3a92c8').lerp(w3dC1.set('#1a3a68'), night * 0.6);
  // 밤: 가까운 불빛 3개 + 영주 주변 은은한 빛 (빛 개수는 고정 → 셰이더 재컴파일 없음)
  const p = S.player, px = p.x / T, pz = p.y / T;
  lightSrc.sort((a, b) => ((a.x - px) ** 2 + (a.z - pz) ** 2) - ((b.x - px) ** 2 + (b.z - pz) ** 2));
  const k = clamp((night - 0.1) * 1.5, 0, 1);
  for (let i = 0; i < 3; i++) {
    const L = W3.pts[i], s = lightSrc[i];
    if (!s || k <= 0) { L.intensity = 0; continue; }
    L.position.set(s.x, s.y, s.z); L.color.set(s.col); L.distance = s.r;
    L.intensity = k * s.k * (s.fire ? 0.85 + Math.sin(S.time * 17 + i) * 0.1 + Math.sin(S.time * 29) * 0.06 : 1);
  }
  const L = W3.pts[3]; L.position.set(px, 1.6, pz + 0.3); L.color.set('#ffd9a0'); L.distance = 5.5; L.intensity = k * 0.9;
  return { night, dusk };
}

function drawWorld3D() {
  if (!W3) w3dInit();
  if (W3.S !== S) w3dReset();
  const now = performance.now(), dt = Math.min(0.1, (now - W3.lastT) / 1000); W3.lastT = now;
  R3D.tick(dt);
  W3.frame++;
  const p = S.player, tm = S.time, px = p.x / T, pz = p.y / T;
  W3.uTime.value = tm;

  // 카메라
  const kf = 1 - Math.exp(-dt * 10);
  W3.tx += (px - W3.tx) * kf; W3.tz += (pz - W3.tz) * kf;
  if (Math.abs(px - W3.tx) > 6 || Math.abs(pz - W3.tz) > 6) { W3.tx = px; W3.tz = pz; }
  let sx = 0, sz = 0; if (shakeAmt > 0.1) { sx = rr(-shakeAmt, shakeAmt) * 0.025; sz = rr(-shakeAmt, shakeAmt) * 0.025; }
  const cam = W3.cam, D = W3.dist;
  cam.position.set(W3.tx + sx, Math.sin(W3_PITCH) * D, W3.tz + Math.cos(W3_PITCH) * D + sz);
  cam.lookAt(W3.tx + sx, 0, W3.tz + sz);
  cam.updateMatrixWorld();
  W3.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); W3.frustum.setFromProjectionMatrix(W3.pm);

  // 그림자 카메라: 화면 중심보다 조금 북쪽(위), 1단위 격자에 맞춰 흔들림 방지
  const scx = Math.round(W3.tx), scz = Math.round(W3.tz - 3);
  W3.sun.target.position.set(scx, 0, scz); W3.sun.position.set(scx + 14, 30, scz + 18);
  W3.sun.target.updateMatrixWorld();

  // 바뀐 타일/영토 반영
  const markG = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; W3.chunks[((y / CK) | 0) * NCK + ((x / CK) | 0)].gDirty = true; };
  for (const i of w3dDirtyTiles) {
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) markG(x + dx, y + dy);
    W3.chunks[((y / CK) | 0) * NCK + ((x / CK) | 0)].pDirty = true; W3.prevHp[i] = S.hp[i];
  }
  w3dDirtyTiles.length = 0;
  const ptx = Math.floor(px), pty = Math.floor(pz);
  for (let y = Math.max(0, pty - 3); y <= Math.min(H - 1, pty + 3); y++) for (let x = Math.max(0, ptx - 3); x <= Math.min(W - 1, ptx + 3); x++) {
    const i = y * W + x;
    if (S.hp[i] !== W3.prevHp[i]) { W3.prevHp[i] = S.hp[i]; if (S.tiles[i] === FOREST) W3.chunks[((y / CK) | 0) * NCK + ((x / CK) | 0)].pDirty = true; }
  }
  if (w3dOwnerDirty) {
    w3dOwnerDirty = false;
    const snap = W3.ownSnap;
    for (let i = 0; i < W * H; i++) if (owner[i] !== snap[i]) { const x = i % W, y = (i / W) | 0; markG(x, y); markG(x + 1, y); markG(x - 1, y); markG(x, y + 1); markG(x, y - 1); W3.chunks[((y / CK) | 0) * NCK + ((x / CK) | 0)].pDirty = true; }
    snap.set(owner);
  }
  // 청크: 보이는 것만 만들고 그린다
  let budget = 3;
  for (const c of W3.chunks) {
    const vis = W3.frustum.intersectsBox(c.box);
    if (vis) {
      if (!c.ground) w3dMakeGround(c);
      if (c.gDirty && (!c.painted || budget-- > 0)) { w3dPaint(c); c.gDirty = false; c.painted = true; }
      if (!c.props || c.pDirty) w3dBuildProps(c);
    }
    if (c.ground) c.ground.visible = vis;
    if (c.props) c.props.visible = vis;
  }
  // 벌목 흔들림
  let chopI = -1, chopV = 0;
  for (const [i, v] of chopFx) if (S.tiles[i] === FOREST && v > chopV) { chopV = v; chopI = i; }
  if (chopI >= 0) W3.uChop.value.set(chopI % W + 0.5, ((chopI / W) | 0) + 0.5, chopV * 4); else W3.uChop.value.z = 0;
  W3.wtex.offset.set((tm * 0.01) % 1, (tm * 0.006) % 1);

  // 동적 오브젝트
  const bars = [], labels = [], lights = [], coins = [];
  for (const t of S.towns) {
    const x = t.x + 0.5, z = t.y + 0.5;
    if (!w3dInView(x, z, 3)) continue;
    const col = TOWN_COLORS[t.id % TOWN_COLORS.length];
    const r = w3dUse(t, 'town|' + col, () => {
      const group = new THREE.Group(), main = new THREE.Mesh(undefined, R3D.mats.vc), glow = new THREE.Mesh(undefined, R3D.mats.glow), flag = w3dFlag(col);
      main.castShadow = main.receiveShadow = true; group.add(main, glow, flag.mesh);
      return { group, main, glow, flag, lv: 0 };
    });
    const m = r.m, lv = townLevel(t);
    if (m.lv !== lv) { const cg = w3dCastle(lv); m.main.geometry = cg.main; m.glow.geometry = cg.glow; m.flag.mesh.position.set(...cg.flag); m.lv = lv; m.top = cg.top; }
    m.group.position.set(x, 0, z); m.group.scale.set(1.08, 1.4, 1.08); w3dWave(m.flag, tm);
    labels.push({ x, y: m.top * 1.4 + 0.35, z, s: `${t.name} Lv${lv}`, war: S.war && S.war.town === t.id });
    lights.push({ x, y: 1.4, z: z + 0.9, col: '#ffbb66', r: 6 + lv, k: 1.3 });
  }
  for (const b of S.buildings) {
    const x = b.x + 0.5, z = b.y + 0.5;
    if (!w3dInView(x, z, 1.5)) continue;
    const col = TOWN_COLORS[b.town % TOWN_COLORS.length];
    const r = w3dUse(b, 'b|' + b.type + (b.type === 'tower' ? col : ''), () => {
      const bg = w3dBuildingGeo(b.type), group = new THREE.Group(), main = new THREE.Mesh(bg.main, R3D.mats.vc);
      main.castShadow = main.receiveShadow = true; group.add(main);
      if (bg.glow) group.add(new THREE.Mesh(bg.glow, R3D.mats.glow));
      let flag = null; if (bg.flag) { flag = w3dFlag(col, 0.3, 0.19); flag.mesh.position.set(...bg.flag); group.add(flag.mesh); }
      return { group, flag };
    });
    r.m.group.position.set(x, 0, z); r.m.group.scale.set(...(W3_BSCALE[b.type] || [1, 1, 1]));
    if (r.m.flag) w3dWave(r.m.flag, tm);
    if (b.type === 'tower') lights.push({ x, y: 1.6, z: z + 0.5, col: '#ffbb66', r: 5, k: 0.9 });
  }
  for (const c of S.camps) {
    const x = c.x + 0.5, z = c.y + 0.5;
    if (!w3dInView(x, z, 2)) continue;
    const r = w3dUse(c, 'camp', () => {
      const group = new THREE.Group(); group.scale.set(1.3, 1.45, 1.3); const main = new THREE.Mesh(w3dCampGeo(), R3D.mats.vc), flame = new THREE.Mesh(w3dFlameGeo(), R3D.mats.fire), flag = w3dFlag('#2a1a1a', 0.3, 0.2);
      main.castShadow = main.receiveShadow = true; flame.position.set(0.45, 0.04, 0.38); flag.mesh.position.set(-0.13, 1.22, -0.15);
      group.add(main, flame, flag.mesh); return { group, flame, flag };
    });
    const m = r.m;
    m.group.position.set(x + (c.hit ? rr(-0.06, 0.06) : 0), 0, z);
    const f = 1 + Math.sin(tm * 14 + c.x) * 0.12 + Math.sin(tm * 23) * 0.08;
    m.flame.scale.set(1 + Math.sin(tm * 19) * 0.08, f, 1 + Math.cos(tm * 17) * 0.08);
    w3dWave(m.flag, tm);
    bars.push({ x, y: 2.1, z, f: c.hp / c.maxHp, col: '#e44' });
    lights.push({ x: x + 0.58, y: 0.8, z: z + 0.5, col: '#ff9a40', r: 6, k: 1.6, fire: true });
    if (rand() < 0.08) emit((c.x + 0.5) * T + 0.58 * T, (c.y + 0.5) * T + 0.5 * T - 8, 1, { color: '#ffb02e', kind: 'spark', smin: 10, smax: 30, up: 40, lmin: 0.4, lmax: 0.8, zmin: 1, zmax: 1.5 });
  }
  for (const h of S.horses) {
    if (h.ridden) continue;
    const x = h.x / T, z = h.y / T; if (!w3dInView(x, z, 1)) continue;
    const r = w3dUse(h, 'horse|' + h.col, () => { const m = R3D.horse(h.col); m.group.scale.setScalar(W3_HS); return m; });
    const mv = !!(h.vx || h.vy);
    r.m.pose({ walk: h.walk, moving: mv, ridden: false, yaw: w3dFaceMove(r, x, z, dt, mv ? Math.atan2(h.vx, h.vy) : undefined) });
    r.m.group.position.set(x, 0, z);
  }
  for (const v of villagers) {
    const x = v.x / T, z = v.y / T; if (!w3dInView(x, z, 1)) continue;
    let lk = W3.look.get(v);
    if (!lk) { lk = { body: v.body, legs: '#4a3a2a', hat: rand() > 0.5 ? 'band' : null, helm: '#e8d8b0', hair: ['#3a2414', '#6a4a2a', '#222'][ri(3)], scale: 1.1 }; W3.look.set(v, lk); }
    const r = w3dHuman(v, lk);
    const moved = r.lx !== null && (Math.abs(x - r.lx) + Math.abs(z - r.lz)) > 1e-4;
    r.m.pose({ walk: v.walk, moving: moved, yaw: w3dFaceMove(r, x, z, dt) });
    r.m.group.position.set(x, 0, z);
  }
  for (const b of bandits) {
    const x = b.x / T, z = b.y / T; if (!w3dInView(x, z, 1.5)) continue;
    const look = b.war ? w3dWarLook(b.cmd) : W3_LOOK.bandit;
    const r = w3dHuman(b, look);
    const dpx = p.x - b.x, dpy = p.y - b.y, near = dpx * dpx + dpy * dpy < 44 * 44;
    const moved = r.lx !== null && (Math.abs(x - r.lx) + Math.abs(z - r.lz)) > 1e-4;
    r.m.pose({ walk: b.walk, moving: moved, swing: (b.swing || 0) / 0.25, yaw: w3dFaceMove(r, x, z, dt, near ? Math.atan2(dpx, dpy) : undefined) });
    r.m.flash(b.hit > 0);
    r.m.group.position.set(x, 0, z);
    const sc = look.scale || 1;
    bars.push({ x, y: 1.12 * sc + 0.1, z, f: b.hp / (b.maxHp || 3), col: '#e44' });
    if (b.loot) coins.push({ x, y: 0.5, z });
  }
  // 영주
  {
    const r = w3dHuman(p, W3_LOOK.player), yaw = R3D.yaw(p.dir || 0);
    const sw = swing > 0 ? swing / 0.2 : 0;
    if (p.mounted) {
      const h = S.horses.find(h => h.ridden);
      const hr = w3dUse(h || 'riderHorse', 'horse|' + (h ? h.col : '#8b5a2b'), () => { const m = R3D.horse(h ? h.col : '#8b5a2b'); m.group.scale.setScalar(W3_HS); return m; });
      hr.m.pose({ walk: (p.walk || 0) * 0.6, moving: p.moving, ridden: true, yaw }); hr.m.group.position.set(px, 0, pz);
      r.m.pose({ sit: true, swing: sw, yaw }); r.m.group.position.set(px, R3D.SADDLE_Y * W3_HS, pz);
    } else {
      r.m.pose({ walk: p.walk, moving: p.moving, swing: sw, yaw }); r.m.group.position.set(px, 0, pz);
    }
    r.m.flash(p.hurt > 0.15);
    bars.push({ x: px, y: p.mounted ? 2.7 : 2.05, z: pz, f: p.hp / heroMaxHp(), col: '#4c4' });
    W3.slash.visible = swing > 0;
    if (swing > 0) {
      W3.slash.position.set(px, (p.mounted ? 1.4 : 0.75), pz); W3.slash.scale.setScalar(1.4); W3.slash.rotation.y = -(p.dir || 0);
      W3.slash.material.opacity = Math.min(1, swing * 5);
    }
  }
  for (const [o, r] of W3.dyn) if (r.seen !== W3.frame) w3dDrop(o, r);

  // 화살
  for (let i = 0; i < Math.max(arrows.length, W3.arrows.length); i++) {
    let m = W3.arrows[i];
    if (i >= arrows.length) { if (m) m.visible = false; continue; }
    if (!m) {
      m = new THREE.Mesh(R3D.cached('arrow', () => R3D.merge([{ g: R3D.prim.box(0.03, 0.03, 0.42), c: '#4a3420' }, { g: R3D.prim.cone(0.035, 0.08, 4), c: '#cccccc', p: [0, 0, 0.24], r: [Math.PI / 2, 0, 0] }, { g: R3D.prim.box(0.07, 0.01, 0.08), c: '#eeeeee', p: [0, 0, -0.18] }])), R3D.mats.vc);
      W3.scene.add(m); W3.arrows.push(m);
    }
    const a = arrows[i]; m.visible = true;
    m.position.set(a.x / T, 0.95, (a.y + 18) / T); m.rotation.set(0, R3D.yaw(a.ang || 0), 0);
  }

  // 행동 대상
  const act = contextAction(), amk = autoMarker(); // amk: tap-to-act 대상 표시
  if (amk) {
    W3.ring.visible = true; W3.ring.position.set(amk.x, 0.04, amk.z); W3.ring.rotation.y = tm * 2.4;
    W3.ring.scale.setScalar(amk.rs * (1.1 + Math.sin(tm * 8) * 0.1));
  } else if (act) {
    let tx, tz, rs = 1;
    if (act.kind === 'harvest') { tx = act.target.x + 0.5; tz = act.target.y + 0.5; rs = act.target.t === FOREST ? 1.05 : 1.4; }
    else if (act.kind === 'mount') { tx = act.target.x / T; tz = act.target.y / T; rs = 1.4; }
    else if (act.kind === 'camp') { tx = act.target.x + 0.5; tz = act.target.y + 0.5; rs = 1.5; }
    else { tx = act.target.x / T; tz = act.target.y / T; rs = 0.9; }
    W3.ring.visible = true; W3.ring.position.set(tx, 0.04, tz); W3.ring.rotation.y = tm * 1.2;
    W3.ring.scale.setScalar(rs * (1 + Math.sin(tm * 6) * 0.05));
  } else W3.ring.visible = false;

  const L = w3dLighting(lights);
  R3D.render(W3.scene, W3.cam);

  // ---------- 2D 오버레이 ----------
  R3D.overlay();
  const g = ctx, pr = {};
  const ppu = R3D.ppu(W3.tx, 0, W3.tz), ks = clamp(ppu / 32, 0.85, 1.6);
  for (const l of labels) {
    R3D.project(l.x, l.y, l.z, pr); if (!pr.vis) continue;
    g.textAlign = 'center'; g.font = `800 ${Math.round(12 * ks)}px system-ui, sans-serif`;
    const tw = g.measureText(l.s).width + 12 * ks, hh = 17 * ks;
    g.fillStyle = 'rgba(0,0,0,.55)'; rrect(g, pr.x - tw / 2, pr.y - hh, tw, hh, hh / 2); g.fill();
    g.fillStyle = '#fff'; g.fillText(l.s, pr.x, pr.y - 4.5 * ks);
    if (l.war) { g.font = `${Math.round(20 * ks)}px system-ui`; g.fillText('⚔️', pr.x + tw / 2 + 12 * ks, pr.y - 2 + Math.sin(tm * 6) * 2); }
  }
  for (const c of coins) { R3D.project(c.x + 0.25, c.y, c.z, pr); g.fillStyle = '#ffd34d'; g.strokeStyle = '#7a5200'; g.lineWidth = 1; g.beginPath(); g.arc(pr.x, pr.y, 3.5 * ks, 0, 7); g.fill(); g.stroke(); }
  for (const b of bars) {
    R3D.project(b.x, b.y, b.z, pr); if (!pr.vis) continue;
    const w = 28 * ks, hgt = 5 * ks;
    g.fillStyle = 'rgba(0,0,0,.6)'; rrect(g, pr.x - w / 2, pr.y, w, hgt, hgt / 2); g.fill();
    g.fillStyle = b.col; rrect(g, pr.x - w / 2 + 1, pr.y + 1, (w - 2) * clamp(b.f, 0, 1), hgt - 2, (hgt - 2) / 2); g.fill();
  }
  // 파티클 (게임 픽셀 좌표 → 지면 근처 높이로 투영)
  const pk = ppu / T;
  for (const q of parts) {
    R3D.project(q.x / T, 0.35, q.y / T, pr); if (!pr.vis) continue;
    const a = clamp(q.life / q.max, 0, 1);
    g.globalAlpha = q.kind === 'smoke' ? a * 0.45 : a;
    g.fillStyle = q.color; const sz = q.size * pk;
    if (q.kind === 'spark') { g.strokeStyle = q.color; g.lineWidth = sz * 0.6; g.beginPath(); g.moveTo(pr.x, pr.y); g.lineTo(pr.x - q.vx * 0.04 * pk, pr.y - q.vy * 0.04 * pk); g.stroke(); }
    else if (q.kind === 'ring') { g.strokeStyle = q.color; g.lineWidth = 3 * a; g.beginPath(); g.arc(pr.x, pr.y, sz, 0, 7); g.stroke(); }
    else { g.beginPath(); g.arc(pr.x, pr.y, sz, 0, 7); g.fill(); }
  }
  g.globalAlpha = 1;
  g.textAlign = 'center';
  for (const f of floats) {
    R3D.project(f.x / T, 1.1, f.y / T, pr); if (!pr.vis) continue;
    g.globalAlpha = clamp(f.t * 1.6, 0, 1);
    const pop = f.t > 0.85 ? 1 + (f.t - 0.85) * 3 : 1;
    g.font = `900 ${Math.round(f.size * pop * ks)}px system-ui, sans-serif`;
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(f.s, pr.x, pr.y); g.fillStyle = f.c; g.fillText(f.s, pr.x, pr.y);
  }
  g.globalAlpha = 1;
  drawVignette(0.22 + L.night * 0.15);
  drawJoystick();
  if (p.hurt > 0) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = `rgba(200,0,0,${p.hurt * 0.8})`; ctx.fillRect(0, 0, VW, VH); }
  $('hint').textContent = act ? `행동: ${act.label}` : '';
  $('hint').style.display = act ? 'block' : 'none';
}


// --- tap-to-act / resource buildings ---
// 벌목소·채석장·금광용 간단한 절차적 모델 (다른 모델이 없을 때 w3dBuildingGeo가 사용)
Object.assign(W3_BSCALE, { lumber: [1.2, 1.35, 1.2], quarry: [1.2, 1.3, 1.2], mine: [1.2, 1.3, 1.2] });
function w3dResBldGeo(type) {
  const { box, cyl, cone, ico } = R3D.prim, P = [], G = [];
  if (type === 'lumber') {
    P.push({ g: box(0.7, 0.04, 0.6), c: '#8a6a40', p: [0, 0.02, 0] });
    P.push({ g: box(0.46, 0.3, 0.4), c: '#a0703e', p: [-0.08, 0.17, -0.06] });
    P.push({ g: w3dPrism(0.52, 0.22, 0.46).rotateY(Math.PI / 2), c: '#6b4a2e', p: [-0.08, 0.32, -0.06] });
    G.push({ g: box(0.1, 0.1, 0.02), c: '#fff', p: [-0.08, 0.2, 0.15] });
    for (let k = 0; k < 3; k++) P.push({ g: cyl(0.06, 0.06, 0.32, 6), c: k % 2 ? '#c8a060' : '#b08a4c', p: [0.3, 0.07 + (k > 1 ? 0.1 : 0), 0.12 - (k % 2) * 0.12 + (k > 1 ? 0.06 : 0)], r: [0, 0, Math.PI / 2] });
    P.push({ g: box(0.04, 0.28, 0.04), c: '#5b3a20', p: [0.3, 0.14, -0.22], r: [0, 0, 0.3] });
    P.push({ g: box(0.12, 0.05, 0.02), c: '#cfd4d8', p: [0.34, 0.27, -0.22] });
  } else if (type === 'quarry') {
    P.push({ g: box(0.72, 0.04, 0.62), c: '#8c8574', p: [0, 0.02, 0] });
    P.push({ g: ico(0.2, 0), c: '#9a9a9c', p: [-0.18, 0.15, -0.05], s: [1.2, 0.9, 1] });
    P.push({ g: ico(0.14, 0), c: '#7e7e82', p: [0.12, 0.1, 0.1] });
    P.push({ g: box(0.26, 0.14, 0.2), c: '#b8b0a0', p: [0.18, 0.11, -0.2] });
    P.push({ g: box(0.04, 0.34, 0.04), c: '#6b4a2e', p: [-0.3, 0.2, 0.2], r: [0, 0, 0.5] });
    P.push({ g: box(0.18, 0.04, 0.04), c: '#8a8e94', p: [-0.37, 0.35, 0.2], r: [0, 0, 0.5] });
    P.push({ g: box(0.22, 0.12, 0.16), c: '#6b4a2a', p: [0.26, 0.1, 0.24] });
    P.push({ g: cyl(0.04, 0.04, 0.2, 5), c: '#2a2a2e', p: [0.26, 0.04, 0.34], r: [0, 0, Math.PI / 2] });
  } else { // mine
    P.push({ g: box(0.74, 0.04, 0.64), c: '#6e6a58', p: [0, 0.02, 0] });
    P.push({ g: ico(0.36, 0), c: '#7a7468', p: [0, 0.14, -0.14], s: [1.3, 0.8, 0.9] });
    P.push({ g: box(0.26, 0.28, 0.06), c: '#1c1812', p: [0, 0.16, 0.06] });
    P.push({ g: box(0.05, 0.3, 0.05), c: '#6b4a2e', p: [-0.16, 0.17, 0.08] });
    P.push({ g: box(0.05, 0.3, 0.05), c: '#6b4a2e', p: [0.16, 0.17, 0.08] });
    P.push({ g: box(0.4, 0.05, 0.06), c: '#6b4a2e', p: [0, 0.33, 0.08] });
    P.push({ g: ico(0.07, 0), c: '#ffd34d', p: [0.3, 0.12, 0.12] });
    P.push({ g: ico(0.05, 0), c: '#ffd34d', p: [0.24, 0.07, 0.2] });
    P.push({ g: box(0.2, 0.1, 0.14), c: '#5a4a3a', p: [-0.3, 0.08, 0.22] });
    G.push({ g: box(0.06, 0.06, 0.02), c: '#fff', p: [0, 0.38, 0.1] });
  }
  return { main: R3D.merge(P), glow: G.length ? R3D.merge(G) : null, flag: null };
}
