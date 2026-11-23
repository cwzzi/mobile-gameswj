'use strict';
// ===== battle3d.js: 전장 3D 렌더러 =====
// drawBattle3D()가 2D drawBattle()을 대신한다 (WebGL이 없으면 main.js가 2D를 그대로 쓴다).
// 규칙/상태(B)는 battle.js 그대로. 여기서는 B를 읽어서 그리기만 한다.
// 좌표: 게임 픽셀 (x, y) → 3D (x / T, 높이, y / T). 유닛 z(공중 높이 px) → 3D 높이 z / T.
// 전투가 바뀌면(B 객체가 다르면) b3Reset()이 지형/거점/장애물을 새로 만들고, 전투가 끝나면 b3Cleanup()이 정리·dispose 한다.
let B3 = null;
const B3_MULT = 1.35;          // 오픈월드 모델보다 크게(군중 속에서도 읽히도록)
const B3_PITCH = 56 * Math.PI / 180;
const B3_N = 22;

// ---------- 초기화 ----------
function b3Glow() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function b3AddMat(color, opacity, map) {
  return new THREE.MeshBasicMaterial({ color, map: map || null, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
}
function b3Init() {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(42, VW / VH, 1, 200);
  // 해 질 녘 전장: 낮게 깔린 주황빛 해(긴 그림자) + 보랏빛 하늘 + 먼지 안개, 화톳불·필살기가 블룸으로 빛난다
  scene.background = new THREE.Color(0x8a5a58);
  scene.fog = new THREE.Fog(0x9a6a60, 40, 100);
  const hemi = new THREE.HemisphereLight(0xb8a0c8, 0x3a2c22, 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffa868, 1.25);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 110;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  R3D.regScene(scene); R3D.regLight(sun);
  const pts = [];
  for (let k = 0; k < 3; k++) { const L = new THREE.PointLight(0xff8a3a, 0, 7, 2); scene.add(L); pts.push(L); }

  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x35502f }));
  skirt.position.set(BW / T / 2, -0.03, BH / T / 2); scene.add(skirt);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(BW / T, BH / T).rotateX(-Math.PI / 2), w3dGroundMat(null, BW / T));
  ground.position.set(BW / T / 2, 0, BH / T / 2); ground.receiveShadow = true; scene.add(ground);

  const glowTex = b3Glow();
  const glowGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const M = {
    glowGold: b3AddMat(0xffc83c, 0.55, glowTex), glowRed: b3AddMat(0xff2a1e, 0.6, glowTex), glowBlue: b3AddMat(0x6ab4ff, 0.4, glowTex),
    glowFire: b3AddMat(0xff8a30, 0.5, glowTex), glowHero: b3AddMat(0xffe27a, 0.28, glowTex),
    ringBlue: new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x4fa3ff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    ringRed: new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xe04a3a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    cap: new THREE.MeshBasicMaterial({ color: 0x4fa3ff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    trail: new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xfff6dc, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    dash: new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xbfe0ff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    aura: new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffd860, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    mring: new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false }), full: b3AddMat(0xffdc64, 0.8),
    teleLine: new THREE.LineBasicMaterial({ color: 0xff9a80, transparent: true, opacity: 0.95, fog: false }),
  };

  // 공용 지오메트리
  const G = {};
  G.dashRing = R3D.merge((() => { const P = []; for (let k = 0; k < 14; k++) P.push({ g: new THREE.RingGeometry(0.94, 1, 4, 1, k / 14 * Math.PI * 2, Math.PI * 2 / 14 * 0.58), c: '#ffffff' }); return P; })()).rotateX(-Math.PI / 2);
  G.glow = glowGeo;
  G.sec = {
    officer: new THREE.CircleGeometry(1, 28, -1.5, 3).rotateX(-Math.PI / 2),
    boss: new THREE.CircleGeometry(1, 32, -1.9, 3.8).rotateX(-Math.PI / 2),
  };
  const outline = A => { const pts = [0, 0.01, 0]; for (let i = 0; i <= 24; i++) { const th = -A + 2 * A * i / 24; pts.push(Math.cos(th), 0.01, -Math.sin(th)); } pts.push(0, 0.01, 0); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g; };
  G.secLine = { officer: outline(1.5), boss: outline(1.9) };
  G.rect = new THREE.PlaneGeometry(7.5, 1).translate(3.75, 0, 0).rotateX(-Math.PI / 2);
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.01, -0.5, 7.5, 0.01, -0.5, 7.5, 0.01, 0.5, 0, 0.01, 0.5], 3)); G.rectLine = g; }
  // 휘두르기 궤적(매 프레임 정점 갱신) / 돌진 줄무늬
  {
    const n = B3_N, pos = new Float32Array((n + 1) * 2 * 3), col = new Float32Array((n + 1) * 2 * 3), idx = [];
    for (let i = 0; i <= n; i++) {
      const t = Math.pow(i / n, 1.6);
      for (let s = 0; s < 2; s++) { const k = (i * 2 + s) * 3, b = t * (s ? 1 : 0.35); col[k] = b; col[k + 1] = b; col[k + 2] = b; }
      if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
    G.trail = g;
  }
  G.dash = (() => { const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); const c = new Float32Array(12); for (let i = 0; i < 4; i++) { const v = g.attributes.position.getX(i) > 0 ? 1 : 0.0; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; })();
  G.aura = (() => { const g = new THREE.CylinderGeometry(1.0, 0.75, 2.6, 28, 1, true); const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const v = 1 - Math.abs(p.getY(i)) / 1.3; const b = 0.15 + 0.85 * v * v; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = p.getY(i) < 0 ? b : b * 0.7; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; })();
  G.torus = new THREE.TorusGeometry(1, 0.045, 6, 36);
  G.fullRing = new THREE.RingGeometry(0.9, 1, 36, 1).rotateX(-Math.PI / 2);
  G.pole = R3D.cached('b3pole', () => R3D.merge([
    { g: R3D.prim.cyl(0.07, 0.09, 2.5, 6), c: '#5a3a20', p: [0, 1.25, 0] },
    { g: R3D.prim.ico(0.1, 0), c: '#d9b44a', p: [0, 2.55, 0] },
    { g: R3D.prim.cyl(0.25, 0.3, 0.15, 7), c: '#7a7468', p: [0, 0.07, 0] },
  ]));
  G.fire = R3D.cached('b3fire', () => R3D.merge([
    { g: R3D.prim.cyl(0.05, 0.05, 0.6, 5), c: '#4a3018', p: [0, 0.09, 0], r: [0, 0, 1.25] },
    { g: R3D.prim.cyl(0.05, 0.05, 0.6, 5), c: '#5a3a1e', p: [0, 0.09, 0], r: [0, 1.2, 1.25] },
    { g: R3D.prim.ico(0.13, 0), c: '#8a8780', p: [0.32, 0.08, 0.1] }, { g: R3D.prim.ico(0.12, 0), c: '#7a7770', p: [-0.3, 0.07, 0.2] },
    { g: R3D.prim.ico(0.12, 0), c: '#8a8780', p: [0.05, 0.07, -0.33] }, { g: R3D.prim.ico(0.12, 0), c: '#6f6c66', p: [-0.15, 0.07, 0.34] },
  ]));
  G.stake = R3D.cached('b3stake', () => R3D.merge([
    { g: R3D.prim.cyl(0.1, 0.13, 1.3, 5), c: '#7a5230', p: [0, 0.65, 0] },
    { g: R3D.prim.cone(0.1, 0.3, 5), c: '#8a6038', p: [0, 1.45, 0] },
    { g: R3D.prim.box(0.3, 0.06, 0.06), c: '#5a3a20', p: [0, 0.9, 0.1] },
  ]));
  G.rock = R3D.cached('b3rock', () => R3D.merge([
    { g: R3D.prim.ico(0.5, 0), c: '#8c9094', p: [0, 0.3, 0], s: [1.1, 0.75, 0.95] },
    { g: R3D.prim.ico(0.28, 0), c: '#74787d', p: [0.42, 0.14, 0.2] },
  ]));
  G.tree = R3D.cached('b3tree', () => R3D.merge([
    { g: R3D.prim.cyl(0.09, 0.14, 0.8, 5), c: '#6b4a2a', p: [0, 0.4, 0] },
    { g: R3D.prim.ico(0.62, 1), c: '#3f7a34', p: [0, 1.2, 0], s: [1, 1.1, 1] },
    { g: R3D.prim.ico(0.42, 1), c: '#559a40', p: [0.18, 1.72, 0.05] },
  ]));
  G.pine = R3D.cached('b3pine', () => R3D.merge([
    { g: R3D.prim.cyl(0.08, 0.12, 0.6, 5), c: '#5a3d22', p: [0, 0.3, 0] },
    { g: R3D.prim.cone(0.7, 1.0, 7), c: '#2c6238', p: [0, 0.95, 0] },
    { g: R3D.prim.cone(0.54, 0.9, 7), c: '#357342', p: [0, 1.5, 0] },
    { g: R3D.prim.cone(0.38, 0.8, 7), c: '#3f8450', p: [0, 2.0, 0] },
  ]));
  G.flame = w3dFlameGeo();

  // 한 번 만드는 영웅/연출 오브젝트
  const root = new THREE.Group(); scene.add(root);         // 전투마다 새로 채우는 부분(지형 위 물체)
  const fx = new THREE.Group(); scene.add(fx);              // 영웅 연출 (재사용)
  const mk = (geo, mat, ro) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = ro || 5; m.visible = false; m.frustumCulled = false; fx.add(m); return m; };
  const hero = {
    trail: mk(G.trail, M.trail, 6), dash: mk(G.dash, M.dash, 6), aura: mk(G.aura, M.aura, 6), glow: mk(G.glow, M.glowHero, 3), mglow: mk(G.glow, M.glowGold, 3), full: mk(G.fullRing, M.full, 4),
    rings: [0, 1, 2].map(() => { const m = new THREE.Mesh(G.torus, M.mring); m.rotation.x = Math.PI / 2; m.visible = false; m.renderOrder = 6; m.frustumCulled = false; fx.add(m); return m; }),
  };
  hero.glow.position.y = 0.05; hero.mglow.position.y = 0.06; hero.full.position.y = 0.07;

  const blobs = R3D.blobs(scene, 200);
  // 블룸용 HDR: 베기 궤적·돌진·필살 오라/고리를 1보다 밝게
  for (const k of ['trail', 'dash', 'aura', 'mring', 'full', 'glowGold', 'glowRed']) M[k].color.multiplyScalar(k === 'trail' ? 2.6 : 2.0);
  const glows = R3D.glows(scene, 60), pools = R3D.pools(scene, 40);
  B3 = { scene, cam, hemi, sun, pts, fxGlow: glows, fxPool: pools, ground, skirt, M, G, root, fx, hero, blobs, B: null, own: [], pool: new Map(), act: new Map(), frame: 0, lastT: performance.now(),
    tx: 0, tz: 0, dist: 30, frustum: new THREE.Frustum(), pm: new THREE.Matrix4(), sph: new THREE.Sphere(new THREE.Vector3(), 1), bases: [], stakes: null, glows: [], tele: { officer: [], boss: [], charge: [] },
    dummy: new THREE.Object3D(), heroRec: null, pr: {}, pa: {}, tex: null };
  // 공용 텔레그래프 풀
  const mkTele = (kind, geo, line) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2a1e, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 4; m.visible = false; m.frustumCulled = false;
    m.add(new THREE.Line(line, M.teleLine)); scene.add(m); B3.tele[kind].push(m);
  };
  for (let i = 0; i < 8; i++) { mkTele('officer', G.sec.officer, G.secLine.officer); mkTele('boss', G.sec.boss, G.secLine.boss); mkTele('charge', G.rect, G.rectLine); }
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(G.glow, M.glowGold); m.renderOrder = 3; m.visible = false; m.frustumCulled = false; scene.add(m); B3.glows.push(m); }
  R3D.onResize.push(b3Resize); b3Resize();
}
function b3Resize() {
  if (!B3) return;
  const c = B3.cam; c.aspect = VW / VH;
  const t = Math.tan(c.fov / 2 * Math.PI / 180);
  B3.dist = clamp(c.aspect < 1 ? 6.0 / (t * c.aspect) : 6.8 / t, 14, 60);
  c.far = B3.dist * 3; c.updateProjectionMatrix();
  B3.scene.fog.near = B3.dist * 0.95; B3.scene.fog.far = B3.dist * 2.4;
  const sh = clamp(Math.round(B3.dist * 0.6), 12, 24), sc = B3.sun.shadow.camera;
  sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh; sc.updateProjectionMatrix();
}

// ---------- 전투 시작/끝 정리 ----------
function b3Free() {
  if (!B3) return;
  for (const [u, r] of B3.act) b3Release(u, r);
  for (const o of B3.own) { try { o.dispose(); } catch (e) {} }
  B3.own.length = 0;
  while (B3.root.children.length) B3.root.remove(B3.root.children[0]);
  B3.bases = []; B3.stakes = null; B3.tex = null; B3.B = null;
  B3.ground.material.map = null; B3.ground.material.needsUpdate = true;
  for (const m of B3.glows) m.visible = false;
  for (const k in B3.tele) for (const m of B3.tele[k]) m.visible = false;
  for (const k in B3.hero) { const h = B3.hero[k]; if (Array.isArray(h)) h.forEach(x => x.visible = false); else h.visible = false; }
  B3.heroRec = null;
}
function b3Cleanup() { if (B3 && B3.B) b3Free(); }

function b3Reset() {
  b3Free();
  const { G, M, root, own } = B3;
  B3.B = B;
  // 지면 텍스처
  const tex = R3D.ctex(bGround); tex.anisotropy = Math.min(4, R3D.maxAniso || 1); own.push(tex); B3.tex = tex;
  B3.ground.material.map = tex; B3.ground.material.color.set(0xffffff); B3.ground.material.needsUpdate = true;
  B3.tx = B.hero.x / T; B3.tz = B.hero.y / T;
  const D = B3.dummy;
  // 장애물 (인스턴스)
  const rocks = [], trees = [], pines = [];
  for (const o of B.obs) (o.kind === 'rock' ? rocks : o.v % 3 === 0 ? pines : trees).push(o);
  // CC0 모델이 있으면 나무/바위를 그걸로 (높이를 절차적 모델과 비슷하게 맞춤)
  const AP = typeof A3D !== 'undefined' && A3D.ready;
  const aGeo = (k, h) => { const g = AP && A3D.prop(k); if (!g) return null; g.computeBoundingBox(); return { g, k: h / (g.boundingBox.max.y || 1) }; };
  const aRock = aGeo('rock', 0.62), aTree = aGeo('round', 2.0), aPine = aGeo('pine', 2.3);
  const inst = (geo, list, scl, cast, ag) => {
    if (!list.length) return;
    if (ag) { geo = ag.g; scl *= ag.k; }
    const im = new THREE.InstancedMesh(geo, ag ? A3D.mat : R3D.mats.vc, list.length);
    im.frustumCulled = false; im.castShadow = cast; im.receiveShadow = true;
    const col = new THREE.Color();
    list.forEach((o, i) => {
      const s = scl * (0.85 + (o.v % 5) * 0.09);
      D.position.set(o.x / T, 0, o.y / T); D.rotation.set(0, o.v * 1.7, 0); D.scale.set(s, s * (0.9 + (o.v % 3) * 0.12), s); D.updateMatrix();
      im.setMatrixAt(i, D.matrix);
      const k = 0.88 + (o.v % 4) * 0.06; col.setRGB(k, k, k);
      if (ag && geo !== aRock.g) col.multiply(W3_TREE_TINT[geo === aPine.g ? 'pine' : 'round']);
      im.setColorAt(i, col);
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    root.add(im); own.push(im);
  };
  inst(G.rock, rocks, 0.9, true, aRock); inst(G.tree, trees, 1.15, true, aTree); inst(G.pine, pines, 1.1, true, aPine);
  // 거점
  const all = [B.allyBase, ...B.bases], slots = [];
  all.forEach((b, bi) => { for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; if (Math.abs(angDiff(a, Math.PI)) < 0.4 || Math.abs(angDiff(a, 0)) < 0.4) continue; slots.push([b.x / T + Math.cos(a) * 2.7, b.y / T + Math.sin(a) * 2.7, a + bi]); } });
  const st = new THREE.InstancedMesh(G.stake, R3D.mats.vc, slots.length); st.frustumCulled = false; st.castShadow = st.receiveShadow = true;
  slots.forEach((s, i) => { D.position.set(s[0], 0, s[1]); D.rotation.set(Math.sin(s[2] * 3) * 0.08, s[2], Math.cos(s[2] * 5) * 0.08); D.scale.set(1, 0.9 + (i % 3) * 0.12, 1); D.updateMatrix(); st.setMatrixAt(i, D.matrix); st.setColorAt(i, new THREE.Color(1, 1, 1)); });
  root.add(st); own.push(st);
  const fcol = B.f.color === '#3a3a44' ? '#2a2a30' : B.f.color;
  all.forEach(b => {
    const g = new THREE.Group(); g.position.set(b.x / T, 0, b.y / T); root.add(g);
    const pole = new THREE.Mesh(G.pole, R3D.mats.vc); pole.castShadow = true; g.add(pole);
    const sc = b.hq ? 1.35 : 1; pole.scale.set(sc, sc, sc);
    const fl = w3dFlag('#3a7ad8', 0.95, 0.6), fe = w3dFlag(fcol, 0.95, 0.6);
    for (const f of [fl, fe]) { f.mesh.position.set(0.05, 2.45 * sc, 0); f.mesh.scale.setScalar(sc); g.add(f.mesh); own.push(f.mesh.geometry); }
    const ring = new THREE.Mesh(G.dashRing, M.ringRed); ring.scale.set(2.5, 1, 2.5); ring.position.y = 0.07; ring.renderOrder = 4; g.add(ring);
    const cg = new THREE.RingGeometry(0.9, 1, 48, 1).rotateX(-Math.PI / 2); own.push(cg);
    const cap = new THREE.Mesh(cg, M.cap); cap.scale.set(2.5, 1, 2.5); cap.position.y = 0.09; cap.renderOrder = 5; cap.visible = false; g.add(cap);
    const fires = [-1.25, 1.25].map((dx, k) => {
      const f = new THREE.Group(); f.position.set(dx, 0, 0.62);
      const logs = new THREE.Mesh(G.fire, R3D.mats.vc); logs.castShadow = true; f.add(logs);
      const fm = new THREE.Mesh(G.flame, R3D.mats.fire); fm.scale.set(1.3, 1.45, 1.3); fm.position.y = 0.06; f.add(fm);
      const gl = new THREE.Mesh(G.glow, M.glowFire); gl.scale.setScalar(1.6); gl.position.y = 0.1; gl.renderOrder = 3; f.add(gl);
      g.add(f); return { fm, gl, ph: b.x * 0.01 + k * 2 };
    });
    B3.bases.push({ b, g, fl, fe, ring, cap, cg, fires, hq: !!b.hq, own: -1, capN: -1 });
  });
  B3.heroLook = Object.assign(eraLook('player'), { scale: 1.15 * B3_MULT * 1.18 }); // 시대별 군주 차림
}

// ---------- 유닛 풀 ----------
function b3Release(u, r) {
  const g = r.m.group; B3.scene.remove(g); g.rotation.x = 0; g.scale.setScalar(r.base); if (r.m.flash) r.m.flash(false);
  let p = B3.pool.get(r.pk); if (!p) B3.pool.set(r.pk, p = []);
  if (p.length < 40) p.push(r.m);
  B3.act.delete(u);
}
function b3Use(key, look, obj, make) {
  let r = B3.act.get(obj);
  if (r && r.pk !== key) { b3Release(obj, r); r = null; } // 모델이 바뀜(에셋 로딩 완료 등)
  if (!r) {
    const pool = B3.pool.get(key);
    let m = pool && pool.length ? pool.pop() : null;
    if (!m) { m = make ? make() : R3D.human(look); m.group.rotation.order = 'YXZ'; }
    r = { m, pk: key, yaw: null, lx: null, lz: null, lw: obj.walk || 0, seen: 0, base: look.scale || 1 };
    B3.scene.add(m.group); B3.act.set(obj, r);
  }
  r.seen = B3.frame; return r;
}
function b3View(x, z, rad) { B3.sph.center.set(x, 0.8, z); B3.sph.radius = rad; return B3.frustum.intersectsSphere(B3.sph); }

// ---------- 매 프레임 ----------
function drawBattle3D() {
  if (!B3) b3Init();
  if (B3.B !== B) b3Reset();
  const now = performance.now(), dt = Math.min(0.1, (now - B3.lastT) / 1000); B3.lastT = now;
  R3D.tick(dt); B3.frame++;
  const H = B.hero, tm = B.t, hx = H.x / T, hz = H.y / T, S3 = B3;

  // 카메라
  const kf = 1 - Math.exp(-dt * 8);
  S3.tx += (hx - S3.tx) * kf; S3.tz += (hz - S3.tz) * kf;
  if (Math.abs(hx - S3.tx) > 8 || Math.abs(hz - S3.tz) > 8) { S3.tx = hx; S3.tz = hz; }
  let sx = 0, sz = 0; if (shakeAmt > 0.1) { sx = rr(-shakeAmt, shakeAmt) * 0.03; sz = rr(-shakeAmt, shakeAmt) * 0.03; }
  const cam = S3.cam, D = S3.dist, ctx_ = clamp(S3.tx, 3, BW / T - 3), ctz = clamp(S3.tz, 3, BH / T - 1);
  cam.position.set(ctx_ + sx, Math.sin(B3_PITCH) * D, ctz + Math.cos(B3_PITCH) * D + sz);
  cam.lookAt(ctx_ + sx, 0, ctz + sz);
  cam.updateMatrixWorld();
  S3.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); S3.frustum.setFromProjectionMatrix(S3.pm);
  const scx = Math.round(ctx_), scz = Math.round(ctz - 2);
  S3.sun.target.position.set(scx, 0, scz); S3.sun.position.set(scx - 30, 15, scz + 20); S3.sun.target.updateMatrixWorld(); // 서쪽 낮은 해 → 긴 그림자

  // 거점
  for (const o of S3.bases) {
    const b = o.b, own = b === B.allyBase ? 0 : b.owner;
    if (own !== o.own) { o.own = own; o.fl.mesh.visible = own === 0; o.fe.mesh.visible = own !== 0; o.ring.material = own === 0 ? S3.M.ringBlue : S3.M.ringRed; }
    w3dWave(own === 0 ? o.fl : o.fe, tm * 1.0 + b.x * 0.01);
    o.ring.rotation.y = tm * 0.25;
    const cp = b.owner === 1 && b.cap > 0 ? b.cap : 0;
    if (cp > 0) {
      const n = Math.max(1, Math.round(cp * 48)); o.cap.visible = true;
      if (n !== o.capN) { o.capN = n; o.cg.setDrawRange(0, n * 6); }
      o.cap.rotation.y = 0;
    } else o.cap.visible = false;
    for (const f of o.fires) {
      const k = 1 + Math.sin(tm * 14 + f.ph) * 0.12 + Math.sin(tm * 23 + f.ph) * 0.08;
      f.fm.scale.set(1.3 * (1 + Math.sin(tm * 19 + f.ph) * 0.08), 1.45 * k, 1.3 * (1 + Math.cos(tm * 17 + f.ph) * 0.08));
      f.gl.material === S3.M.glowFire && (f.gl.scale.setScalar(1.5 + k * 0.3));
    }
    if (b.owner === 1 && !b.hq && rand() < 0.02) emit(b.x - 40 + (rand() < 0.5 ? 80 : 0), b.y + 14, 1, { color: '#ffb02e', kind: 'spark', smin: 10, smax: 30, up: 40, lmin: 0.4, lmax: 0.8, zmin: 1, zmax: 1.5 });
  }
  S3.M.glowFire.opacity = 0.45 + Math.sin(tm * 11) * 0.08;
  // 화톳불 빛: 빛무리 + 바닥 빛 + 가까운 불 몇 개는 실제 광원
  const GL = S3.fxGlow, PL = S3.fxPool; GL.begin(); PL.begin();
  const fires = [];
  for (const o of S3.bases) for (const f of o.fires) {
    const fx = o.g.position.x + f.fm.parent.position.x, fz = o.g.position.z + f.fm.parent.position.z, fl = 0.85 + Math.sin(tm * 17 + f.ph) * 0.1 + Math.sin(tm * 29 + f.ph) * 0.07;
    GL.add(fx, 0.55, fz, 1.3 * (0.9 + fl * 0.15), B3_FIRE, 0.8 * fl); PL.add(fx, 0.02, fz, 5, B3_FIRE, 0.45 * fl);
    fires.push({ x: fx, z: fz, d: (fx - S3.tx) ** 2 + (fz - S3.tz) ** 2, fl });
  }
  fires.sort((a, b) => a.d - b.d);
  const nReal = (R3D.fx ? R3D.fx.lights() : 4) - 1;
  S3.pts.forEach((L, i) => { L.visible = i < nReal; const f = fires[i]; if (!f || !L.visible) { L.intensity = 0; return; } L.position.set(f.x, 0.8, f.z); L.distance = 6; L.intensity = 1.4 * f.fl; });

  // 유닛
  let gi = 0, ti = { officer: 0, boss: 0, charge: 0 };
  const pose = { walk: 0, moving: false, swing: 0, yaw: 0 };
  const AV = typeof A3D !== 'undefined' ? A3D.ver : 0, BL = S3.blobs; BL.begin();
  for (const u of B.units) {
    const x = u.x / T, z = u.y / T;
    if (!b3View(x, z, 2.2)) continue;
    if (!u._l3 || u._v3 !== AV) {
      // 졸병/아군은 가벼운 모델 + 그림자맵 대신 발밑 그림자(군중이 많아서)
      const lk = Object.assign({}, enemyLook(u)); lk.scale = (lk.scale || 1) * B3_MULT;
      if (u.kind === 'grunt' || u.kind === 'ally') lk.lod = 1;
      u._l3 = lk; u._k3 = R3D.human.key(lk) + (lk.lod ? '|lo' : ''); u._v3 = AV;
    }
    const r = b3Use(u._k3, u._l3, u), g = r.m.group;
    const mv = Math.abs(u.walk - r.lw) > 1e-4; r.lw = u.walk;
    let sw = 0, fy;
    if (u.windup > 0) { sw = 1; fy = R3D.yaw(u.wdir); }
    else if (u.chargeT > 0) { fy = R3D.yaw(u.wdir); }
    else if (u.swing > 0) { sw = u.swing / 0.25; if (u.tgt) fy = R3D.yawTo(u.tgt.x - u.x, u.tgt.y - u.y); }
    else if (u.team === 1 && !u.dead && !mv) { const dx = H.x - u.x, dy = H.y - u.y; if (dx * dx + dy * dy < 90 * 90) fy = R3D.yawTo(dx, dy); }
    if (u.dead) fy = r.yaw === null ? 0 : r.yaw;
    pose.aim = u.wkind === 'aim' && u.windup > 0;
    if (pose.aim) sw = 0.35; // 조준 자세 (원거리 병종은 조준 클립)
    const mnt = u._l3.mount && !u.dead;
    pose.walk = u.walk; pose.moving = mv || u.chargeT > 0; pose.swing = sw; pose.sit = !!mnt;
    pose.yaw = w3dFaceMove(r, x, z, dt, fy);
    r.m.pose(pose); r.m.flash(u.hit > 0);
    let y = u.z / T, s = r.base;
    if (mnt) { // 기병: 말 + 안장 위 자세
      const HS = W3_HS / 1.45 * B3_MULT, hr = b3Use('horse|' + u._l3.mount, { scale: HS }, u._h || (u._h = {}), () => R3D.horse(u._l3.mount));
      hr.m.pose({ walk: u.walk * 0.7, moving: pose.moving, ridden: true, yaw: pose.yaw });
      hr.m.group.scale.setScalar(HS); hr.m.group.position.set(x, y, z);
      y += R3D.SADDLE_Y * HS;
    }
    pose.sit = false;
    if (u.dead) {
      const k = Math.min(1, (1 - u.deadT) * 4); g.rotation.x = -1.45 * k;
      if (u.deadT < 0.55) y -= (0.55 - u.deadT) * 0.9;
      if (u.deadT < 0.35) s *= Math.max(0.05, u.deadT / 0.35);
      y += 0.12 * k;
    } else g.rotation.x = 0;
    g.scale.setScalar(s); g.position.set(x, y, z);
    if (!u.dead || u.deadT > 0.4) BL.add(x, z, (u.kind === 'boss' ? 0.5 : u.kind === 'officer' ? 0.4 : 0.32) * (u.dead ? u.deadT : 1) * (1 - Math.min(0.5, u.z / T * 0.4)));
    // 지휘관 지면 광채 + 공격 예고
    if ((u.kind === 'boss' || u.kind === 'officer') && !u.dead && gi < S3.glows.length) {
      const gm = S3.glows[gi++]; gm.visible = true; gm.material = u.kind === 'boss' ? S3.M.glowRed : S3.M.glowGold;
      gm.position.set(x, 0.05, z); gm.scale.setScalar((u.kind === 'boss' ? 2.9 : 2.1) * (1 + Math.sin(tm * 5 + u.x) * 0.05));
    }
    if (u.windup > 0 && !u.dead) {
      if (u.wkind === 'sweep') {
        const k = u.kind === 'boss' ? 'boss' : 'officer', i = ti[k];
        if (i < S3.tele[k].length) {
          ti[k]++; const m = S3.tele[k][i], R = (u.kind === 'boss' ? 92 : 74) / T, prog = clamp(1 - u.windup / (u.kind === 'boss' ? 0.65 : 0.7), 0, 1);
          m.visible = true; m.position.set(x, 0.08, z); m.scale.set(R, 1, R); m.rotation.y = -u.wdir; m.material.opacity = 0.28 + prog * 0.4;
        }
      } else if (u.wkind === 'charge' && ti.charge < S3.tele.charge.length) {
        const m = S3.tele.charge[ti.charge++], prog = clamp(1 - u.windup / 0.8, 0, 1);
        m.visible = true; m.position.set(x, 0.08, z); m.rotation.y = -u.wdir; m.material.opacity = 0.25 + prog * 0.4;
      }
    }
  }
  for (let i = gi; i < S3.glows.length; i++) S3.glows[i].visible = false;
  for (const k in S3.tele) for (let i = ti[k]; i < S3.tele[k].length; i++) S3.tele[k][i].visible = false;
  // 영웅
  b3Hero(H, tm, dt, hx, hz, pose);
  BL.add(hx, hz, 0.45); BL.end();
  if (H.musouT > 0) { PL.add(hx, 0.02, hz, 7, B3_GOLD, 1.4); GL.add(hx, 1.2, hz, 2.6, B3_GOLD, 0.9); }
  GL.end(); PL.end();
  b3Grade(H);
  for (const [o, r] of S3.act) if (r.seen !== S3.frame) b3Release(o, r);

  R3D.render(S3.scene, cam);

  // ---------- 2D 오버레이 ----------
  R3D.overlay();
  const g = ctx, pr = S3.pr;
  const ppu = R3D.ppu(S3.tx, 0, S3.tz), ks = clamp(ppu / 32, 0.85, 1.6), pk = ppu / T;
  g.textAlign = 'center'; g.lineJoin = 'round';
  for (const u of B.units) {
    if (u.dead || !u._l3) continue;
    const x = u.x / T, z = u.y / T, sc = u._l3.scale;
    if (u.windup > 0 && u.kind === 'grunt') {
      R3D.project(x, u.z / T + 1.0 * sc + 0.45, z, pr); if (!pr.vis) continue;
      g.font = `900 ${Math.round(18 * ks)}px system-ui, sans-serif`; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText('!', pr.x, pr.y); g.fillStyle = '#ff3a2a'; g.fillText('!', pr.x, pr.y);
    } else if (u.kind === 'officer' || u.kind === 'boss') {
      R3D.project(x, u.z / T + 1.05 * sc + 0.2, z, pr); if (!pr.vis) continue;
      const w = (u.kind === 'boss' ? 64 : 48) * ks, h = 6 * ks;
      g.fillStyle = 'rgba(0,0,0,.65)'; rrect(g, pr.x - w / 2, pr.y, w, h, h / 2); g.fill();
      g.fillStyle = '#e44'; rrect(g, pr.x - w / 2 + 1, pr.y + 1, Math.max(2, (w - 2) * clamp(u.hp / u.maxHp, 0, 1)), h - 2, (h - 2) / 2); g.fill();
      g.font = `800 ${Math.round(12 * ks)}px system-ui, sans-serif`; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)';
      g.fillStyle = u.kind === 'boss' ? '#ff9a8a' : '#ffd54a';
      g.strokeText(u.name || '', pr.x, pr.y - 4 * ks); g.fillText(u.name || '', pr.x, pr.y - 4 * ks);
    } else if (u.team === 1 && u.hp < u.maxHp) {
      R3D.project(x, u.z / T + 1.0 * sc + 0.1, z, pr); if (!pr.vis) continue;
      const w = 20 * ks; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(pr.x - w / 2, pr.y, w, 3.5 * ks);
      g.fillStyle = '#e44'; g.fillRect(pr.x - w / 2, pr.y, w * clamp(u.hp / u.maxHp, 0, 1), 3.5 * ks);
    }
  }
  drawShots3D(g, B.shots, pr, ks, 0.75, 0);
  for (const o of S3.bases) if (o.hq && o.b.owner === 1) {
    R3D.project(o.b.x / T, 3.5, o.b.y / T, pr); if (!pr.vis) continue;
    g.font = `800 ${Math.round(13 * ks)}px system-ui, sans-serif`; g.lineWidth = 3.5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText('적 본진', pr.x, pr.y); g.fillStyle = '#ff9a8a'; g.fillText('적 본진', pr.x, pr.y);
  }
  // 파티클 (게임 픽셀 → 지면 근처로 투영)
  for (const q of parts) {
    R3D.project(q.x / T, 0.45, q.y / T + 0.4, pr); if (!pr.vis) continue;
    const a = clamp(q.life / q.max, 0, 1);
    g.globalAlpha = q.kind === 'smoke' ? a * 0.45 : a;
    g.fillStyle = q.color; const sz = q.size * pk;
    if (q.kind === 'spark') { g.strokeStyle = q.color; g.lineWidth = Math.max(1, sz * 0.6); g.beginPath(); g.moveTo(pr.x, pr.y); g.lineTo(pr.x - q.vx * 0.04 * pk, pr.y - q.vy * 0.04 * pk); g.stroke(); }
    else if (q.kind === 'ring') { g.strokeStyle = q.color; g.lineWidth = 3 * a; g.beginPath(); g.ellipse(pr.x, pr.y, sz, sz * 0.62, 0, 0, 7); g.stroke(); }
    else { g.beginPath(); g.arc(pr.x, pr.y, sz, 0, 7); g.fill(); }
  }
  g.globalAlpha = 1; g.textAlign = 'center';
  for (const f of floats) {
    R3D.project(f.x / T, 1.0, f.y / T + 1.1, pr); if (!pr.vis) continue;
    g.globalAlpha = clamp(f.t * 1.6, 0, 1);
    const pop = f.t > 0.85 ? 1 + (f.t - 0.85) * 3 : 1;
    g.font = `900 ${Math.round(f.size * pop * ks * 1.1)}px system-ui, sans-serif`;
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(f.s, pr.x, pr.y); g.fillStyle = f.c; g.fillText(f.s, pr.x, pr.y);
  }
  g.globalAlpha = 1;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const pf = R3D.fx && R3D.fx.on;
  if (!pf) { ctx.fillStyle = 'rgba(255,140,60,.05)'; ctx.fillRect(0, 0, VW, VH); } // 후처리가 있으면 색보정·비네트는 셰이더에서
  if (H.musouT > 0) { ctx.fillStyle = 'rgba(255,210,90,.07)'; ctx.fillRect(0, 0, VW, VH); }
  if (!pf) drawVignette(0.4);
  if (H.hurt > 0) { ctx.fillStyle = `rgba(200,0,0,${H.hurt * 0.7})`; ctx.fillRect(0, 0, VW, VH); }
  drawJoystick();
  hudBattle();
}

const B3_FIRE = new THREE.Color('#ff7428'), B3_GOLD = new THREE.Color('#ffc040');
// 전장 색감: 노을빛 (그림자는 보라, 밝은 곳은 주황). 필살 중엔 조금 더 밝고 블룸 세게
function b3Grade(H) {
  const G = R3D.grade, m = H.musouT > 0 ? 1 : 0;
  G.exposure = 1.16 + m * 0.06; G.bloom = 0.62 + m * 0.3; G.threshold = 1.15; G.knee = 0.6; G.sat = 1.14; G.contrast = 1.07; G.vignette = 0.42;
  G.lift.setRGB(0.014, 0.004, 0.024); G.gain.setRGB(1.05, 0.98, 0.9);
  R3D.renderer.toneMappingExposure = R3D.fx && R3D.fx.on ? 1 : 1.1;
  if (R3D.uWin) R3D.uWin.value = 0;
  if (R3D.uRim) R3D.uRim.value.setRGB(1.0, 0.72, 0.45).multiplyScalar(0.3);
}
function b3Hero(H, tm, dt, hx, hz, pose) {
  const S3 = B3, hr = S3.hero, look = S3.heroLook;
  const r = b3Use('hero|' + R3D.human.key(look), look, H); S3.heroRec = r;
  const g = r.m.group, c = H.atkT > 0 ? COMBO[H.combo - 1] : null;
  let sw = 0;
  if (c) sw = H.atkT / c.dur; else if (H.musouT > 0) sw = (tm * 7) % 1;
  pose.walk = H.walk; pose.moving = H.moving; pose.swing = sw; pose.yaw = R3D.yaw(H.dir); pose.aim = false;
  r.m.pose(pose); r.m.flash(H.hurt > 0.15);
  g.rotation.x = H.dashT > 0 ? 0.45 : 0;
  g.scale.setScalar(r.base); g.position.set(hx, 0, hz);
  // 발밑 광채 / 필살 게이지 완료 고리
  hr.glow.visible = true; hr.glow.position.x = hx; hr.glow.position.z = hz; hr.glow.scale.setScalar(1.15 + Math.sin(tm * 4) * 0.05);
  const full = H.mg >= 100 && H.musouT <= 0;
  hr.full.visible = full;
  if (full) { hr.full.position.x = hx; hr.full.position.z = hz; hr.full.scale.setScalar(1.15 + Math.sin(tm * 8) * 0.1); hr.full.material.opacity = 0.55 + Math.sin(tm * 8) * 0.25; }
  // 휘두르기 궤적
  const tr = hr.trail;
  if (c) {
    const p = 1 - H.atkT / c.dur, sgn = H.combo % 2 ? 1 : -1, span = Math.min(c.arc, 6.6);
    const a0 = H.dir - span / 2 * sgn, a1 = a0 + span * Math.min(1, p * 1.5) * sgn, R = c.r / T;
    const pos = tr.geometry.attributes.position, arr = pos.array, n = B3_N;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n, ca = Math.cos(a), sa = Math.sin(a);
      arr[i * 6] = ca * R * 0.4; arr[i * 6 + 1] = 0; arr[i * 6 + 2] = sa * R * 0.4;
      arr[i * 6 + 3] = ca * R; arr[i * 6 + 4] = 0; arr[i * 6 + 5] = sa * R;
    }
    pos.needsUpdate = true;
    tr.visible = true; tr.position.set(hx, 0.95, hz); tr.material.opacity = 0.95 * (1 - p * 0.55);
  } else tr.visible = false;
  // 돌진 잔상
  const ds = hr.dash;
  if (H.dashT > 0) {
    const len = 3.4, a = H.dir;
    ds.visible = true; ds.scale.set(len, 1, 1.5); ds.rotation.y = -a;
    ds.position.set(hx - Math.cos(a) * len / 2, 0.45, hz - Math.sin(a) * len / 2); ds.material.opacity = clamp(H.dashT / 0.26, 0, 1) * 0.85;
  } else ds.visible = false;
  // 필살: 황금 오라 + 회전 고리
  if (H.musouT > 0) {
    const t = tm * 9;
    hr.aura.visible = true; hr.aura.position.set(hx, 1.3, hz); hr.aura.rotation.y = t * 0.5; hr.aura.scale.set(1.5 + Math.sin(t) * 0.1, 1.2, 1.5 + Math.sin(t) * 0.1);
    hr.mglow.visible = true; hr.mglow.position.x = hx; hr.mglow.position.z = hz; hr.mglow.scale.setScalar(3.4 + Math.sin(t * 1.3) * 0.2);
    hr.rings.forEach((m, i) => {
      m.visible = true; const s = 2.8 - i * 0.55 + Math.sin(t + i) * 0.15;
      m.position.set(hx, 0.35 + i * 0.7, hz); m.scale.set(s, s, s); m.rotation.set(Math.PI / 2 + Math.sin(t * 0.7 + i) * 0.25, 0, t * (i % 2 ? 1.4 : -1.1));
    });
  } else { hr.aura.visible = false; hr.mglow.visible = false; hr.rings.forEach(m => m.visible = false); }
}
