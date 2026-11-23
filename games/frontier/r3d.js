'use strict';
// ===== r3d.js: 공용 Three.js 레이어 (렌더러 · 모델 공장 · 2D 오버레이 투영) =====
// WebGL 캔버스(#gl)는 기존 2D 캔버스(#game) "뒤"에 깔린다. #game은 투명 오버레이가 되어
// 글자·체력바·파티클·조이스틱을 그리고, 터치 입력도 계속 #game이 받는다.
//
// 좌표 규약: 1 타일 = 1 단위. 게임 픽셀 좌표 (px, py) → 3D (px / T, 높이, py / T). +y가 위, +z가 남쪽(화면 아래).
// 모델은 발밑이 원점, +z 방향을 바라본다. 2D 각도 a(atan2(dy, dx))를 바라보게 하려면 rotation.y = R3D.yaw(a).
//
// API (전역 R3D)
//   R3D.available()              WebGL 사용 가능? (주소에 ?2d 를 붙이거나 localStorage 'frontier-render'='2d' 면 false → 2D로 대체)
//   R3D.init()                   렌더러 생성(1회). 성공하면 true. R3D.renderer / R3D.canvas
//   R3D.show(on)                 WebGL 캔버스 보이기/숨기기
//   R3D.render(scene, camera)    그리기 + 투영용 카메라 기억 (이후 project/ppu가 이 카메라 기준)
//   R3D.project(x, y, z, out?)   3D 단위 좌표 → 화면 CSS px {x, y, vis}
//   R3D.ppu(x, y, z)             그 지점에서 1단위 = 화면 몇 px
//   R3D.overlay()                2D 오버레이 지우고 ctx를 CSS px 변환으로 맞춤 (그 위에 그리면 됨)
//   R3D.yaw(a) / R3D.yawTo(dx,dz) 2D 각도/벡터 → rotation.y
//   R3D.mats                     공용 재질 {vc: 버텍스컬러 Lambert, flash: 흰색 피격, glow: 밤에 빛나는 창문, fire: 불꽃}
//   R3D.merge(parts)             [{g: geometry, c: '#색', p:[x,y,z], r:[rx,ry,rz], s: 수 또는 [sx,sy,sz]}] → 버텍스컬러 지오메트리 1개
//   R3D.cached(key, fn)          지오메트리 캐시
//   R3D.human(look)              사람 모델. look = drawHuman 옵션과 같음:
//                                {body, trim, legs, skin, hair, hat:'crown'|'helm'|'horned'|'hood'|'band', helm, plume,
//                                 weapon:'sword'|'spear'|'axe'|'club'|'glaive', cape, armor, scale}
//        → { group, key, pose({walk, moving, swing(0..1, 1=막 휘두름 시작), sit, yaw}), flash(on) }  키 약 1단위(scale 1)
//          메시 5개(몸통+머리+모자 / 다리 2 / 팔 2(무기 포함)), 같은 외형은 지오메트리 공유 → 100명도 가볍다
//   R3D.human.key(look)          외형 키(풀링용)
//   R3D.horse(col, cloth)        말 모델 → { group, pose({walk, moving, ridden, yaw}), seat()? }  안장 높이 R3D.seat(m) (그룹 배율 전)
//                                사실적 스타일이면 horse.glb (RA.horse, Idle/Walk/Gallop), 아니면 절차적 상자 말. 키는 R3D.horse.key(col, cloth)
//   R3D.autoRes                  true면 느릴 때 해상도(픽셀비)를 자동으로 낮춤
//   R3D.blobs(scene, max)        발밑 둥근 그림자(InstancedMesh 1개) → { begin(), add(x, z, r, a), end() }
//   R3D.ctex(canvas)             캔버스 텍스처(sRGB)
//   색 관리: sRGB 출력 + ACES 톤매핑, 색 값('#hex')은 sRGB로 해석되어 선형으로 계산된다.
//   assets3d.js(A3D)가 CC0 glTF 캐릭터를 불러오면 R3D.human 이 자동으로 그 모델을 돌려준다(키도 바뀜).
const R3D = (() => {
  if (typeof THREE === 'undefined') return { ok: false, available: () => false, init: () => false, show() {}, tick() {} };
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
  const R = { ok: false, autoRes: true, SADDLE_Y: 0.5 };
  let renderer = null, canvas = null, lastCam = null, shown = true;

  R.available = () => {
    try {
      if (typeof THREE === 'undefined') return false;
      if (/[?&]2d\b/.test(location.search)) return false;
      try { if (localStorage.getItem('frontier-render') === '2d') return false; } catch (e) {}
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false;
      const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
      return true;
    } catch (e) { return false; }
  };

  R.init = () => {
    if (R.ok) return true;
    try {
      canvas = document.createElement('canvas'); canvas.id = 'gl';
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;';
      document.body.insertBefore(canvas, cv);
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      R.pr = Math.min(2, window.devicePixelRatio || 1);
      renderer.setPixelRatio(R.pr);
      renderer.setSize(VW, VH, false);
      canvas.addEventListener('webglcontextlost', e => e.preventDefault());
      resizeHooks.push(() => { renderer.setSize(VW, VH, false); for (const f of R.onResize) f(); });
      R.renderer = renderer; R.canvas = canvas; R.ok = true;
      R.maxAniso = renderer.capabilities.getMaxAnisotropy();
      initMats();
      if (R.fx) { try { R.fx.init(); } catch (e) { console.warn('post fx init failed', e); R.fx.on = false; } }
      return true;
    } catch (e) {
      console.warn('WebGL init failed, 2D fallback', e);
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      R.ok = false; return false;
    }
  };
  R.onResize = [];
  R.show = on => { if (!canvas || shown === on) return; shown = on; canvas.style.display = on ? 'block' : 'none'; };

  // 느린 기기면 해상도를 조금씩 낮춘다
  let fAcc = 0, fN = 0;
  R.stats = { calls: 0, tris: 0 };
  R.render = (scene, cam) => {
    lastCam = cam;
    const inf = renderer.info; inf.reset();
    if (R.fx && R.fx.on) R.fx.render(scene, cam); // post3d.js: HDR + 블룸 + 톤매핑 + 색보정
    else { renderer.setRenderTarget(null); renderer.render(scene, cam); }
    R.stats.calls = inf.render.calls; R.stats.tris = inf.render.triangles;
  };
  R.tick = dt => {
    if (R.fx) return R.fx.tick(dt); // 품질 단계 자동 조절
    if (!R.autoRes) return;
    fAcc += dt; fN++;
    if (fAcc > 2.5) {
      const avg = fAcc / fN; fAcc = 0; fN = 0;
      if (avg > 1 / 40 && R.pr > 1) { R.pr = Math.max(1, R.pr - 0.25); renderer.setPixelRatio(R.pr); renderer.setSize(VW, VH, false); }
    }
  };

  const pv = new THREE.Vector3();
  R.project = (x, y, z, out) => {
    out = out || {};
    pv.set(x, y, z).project(lastCam);
    out.x = (pv.x + 1) / 2 * VW; out.y = (1 - pv.y) / 2 * VH; out.vis = pv.z > -1 && pv.z < 1;
    return out;
  };
  const pa = {}, pb = {};
  R.ppu = (x, y, z) => { R.project(x, y, z, pa); R.project(x + 1, y, z, pb); return Math.hypot(pb.x - pa.x, pb.y - pa.y); };
  R.overlay = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  };
  // --- tap-to-act / resource buildings ---
  // 화면(CSS px) → 지면(y=0) 위 타일 단위 좌표 {x, z}. 마지막으로 render한 카메라 기준. 하늘을 가리키면 null
  const uv = new THREE.Vector3();
  R.unproject = (sx, sy) => {
    if (!lastCam) return null;
    uv.set(sx / VW * 2 - 1, 1 - sy / VH * 2, 0.5).unproject(lastCam);
    const o = lastCam.position, dy = uv.y - o.y; if (dy >= -1e-6) return null;
    const t = -o.y / dy; return { x: o.x + (uv.x - o.x) * t, z: o.z + (uv.z - o.z) * t };
  };
  // --- end tap-to-act ---
  R.yaw = a => Math.PI / 2 - a;
  R.yawTo = (dx, dz) => Math.atan2(dx, dz);

  // ---------- 재질 ----------
  function initMats() {
    R.mats = {
      vc: new THREE.MeshLambertMaterial({ vertexColors: true }),
      flash: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      glow: new THREE.MeshLambertMaterial({ color: 0x3a2c1c, emissive: 0xffc860, emissiveIntensity: 0 }),
      fire: new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.4, 2.4, 2.4) }), // HDR: 블룸으로 빛남
    };
  }

  // ---------- 지오메트리 합치기 ----------
  const cache = new Map();
  R.cached = (key, fn) => { let g = cache.get(key); if (!g) { g = fn(); cache.set(key, g); } return g; };
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), te = new THREE.Euler(), tp = new THREE.Vector3(), ts = new THREE.Vector3(), tc = new THREE.Color();
  R.merge = parts => {
    let n = 0;
    const geos = parts.map(pt => {
      const g = pt.g.index ? pt.g.toNonIndexed() : pt.g.clone();
      const p = pt.p || [0, 0, 0], r = pt.r || [0, 0, 0], s = pt.s === undefined ? 1 : pt.s;
      te.set(r[0], r[1], r[2]); tq.setFromEuler(te); tp.set(p[0], p[1], p[2]);
      if (typeof s === 'number') ts.set(s, s, s); else ts.set(s[0], s[1], s[2]);
      tm.compose(tp, tq, ts); g.applyMatrix4(tm);
      n += g.attributes.position.count;
      return g;
    });
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    geos.forEach((g, k) => {
      const a = g.attributes.position.array; pos.set(a, o * 3);
      const cnt = g.attributes.position.count;
      if (parts[k].c === null && g.attributes.color) col.set(g.attributes.color.array, o * 3); // 이미 색이 칠해진 조각 (R.weaponGeo)
      else { tc.set(parts[k].c || '#ffffff'); for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = tc.r; col[(o + i) * 3 + 1] = tc.g; col[(o + i) * 3 + 2] = tc.b; } }
      o += cnt; g.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeVertexNormals(); // 인덱스 없음 → 면 법선 = 로우폴리 플랫 셰이딩
    out.computeBoundingSphere();
    return out;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, s || 6);
  const cone = (r, h, s) => new THREE.ConeGeometry(r, h, s || 6);
  const ico = (r, d) => new THREE.IcosahedronGeometry(r, d || 0);
  const cap = (r, ws, hs) => new THREE.SphereGeometry(r, ws || 8, hs || 3, 0, Math.PI * 2, 0, Math.PI / 2);
  R.prim = { box, cyl, cone, ico, cap };

  // ---------- 사람 ----------
  const DEF = { body: '#2b5fb8', trim: '#3a2a1a', legs: '#3b3127', skin: '#f0c597', hair: '#3a2414', hat: null, helm: '#777777', plume: null, weapon: null, cape: null, armor: false, scale: 1 };
  const hkey = o => [o.body, o.trim, o.legs, o.skin, o.hair, o.hat, o.helm, o.plume, o.weapon, o.cape, o.armor ? 1 : 0].join('|');
  function torsoGeo(o) {
    return R.cached('torso|' + hkey(o), () => {
      const P = [
        { g: cyl(0.14, 0.17, 0.34, 6), c: o.body, p: [0, 0.47, 0] },
        { g: cyl(0.175, 0.175, 0.055, 6), c: o.trim, p: [0, 0.36, 0] },
        { g: cyl(0.06, 0.07, 0.06, 6), c: o.skin, p: [0, 0.65, 0] },
        { g: ico(0.17, 1), c: o.skin, p: [0, 0.8, 0] },
        { g: box(0.035, 0.055, 0.02), c: '#1a1a1a', p: [0.06, 0.8, 0.158] },
        { g: box(0.035, 0.055, 0.02), c: '#1a1a1a', p: [-0.06, 0.8, 0.158] },
      ];
      const hat = o.hat;
      if (hat === 'shako') { P.push({ g: cyl(0.15, 0.135, 0.2, 8), c: o.helm, p: [0, 0.97, 0] }); P.push({ g: box(0.2, 0.02, 0.1), c: '#111', p: [0, 0.88, 0.15] }); P.push({ g: ico(0.04, 0), c: o.plume || '#c22', p: [0, 1.1, 0.06] }); }
      else if (hat === 'kepi') { P.push({ g: cyl(0.15, 0.17, 0.12, 8), c: o.helm, p: [0, 0.93, -0.01], r: [-0.15, 0, 0] }); P.push({ g: box(0.2, 0.02, 0.1), c: '#111', p: [0, 0.88, 0.15] }); }
      if (hat !== 'helm' && hat !== 'horned' && hat !== 'hood') P.push({ g: cap(0.178, 8, 3), c: o.hair, p: [0, 0.81, -0.01], r: [-0.55, 0, 0] });
      if (o.armor) { P.push({ g: box(0.13, 0.08, 0.2), c: o.trim, p: [0.17, 0.62, 0], r: [0, 0, -0.3] }); P.push({ g: box(0.13, 0.08, 0.2), c: o.trim, p: [-0.17, 0.62, 0], r: [0, 0, 0.3] }); }
      if (o.cape) P.push({ g: box(0.32, 0.46, 0.03), c: o.cape, p: [0, 0.42, -0.17], r: [0.16, 0, 0] });
      if (hat === 'crown') {
        P.push({ g: cyl(0.12, 0.125, 0.07, 8), c: '#f2c14e', p: [0, 0.95, 0] });
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; P.push({ g: cone(0.03, 0.08, 4), c: '#f2c14e', p: [Math.sin(a) * 0.105, 1.02, Math.cos(a) * 0.105] }); }
        P.push({ g: box(0.04, 0.04, 0.02), c: '#d9483b', p: [0, 0.955, 0.125] });
      } else if (hat === 'helm' || hat === 'horned') {
        P.push({ g: cap(0.19, 8, 3), c: o.helm, p: [0, 0.8, 0], s: [1, 1.08, 1] });
        P.push({ g: cyl(0.2, 0.2, 0.03, 8), c: o.helm, p: [0, 0.8, 0] });
        if (hat === 'horned') {
          P.push({ g: cone(0.045, 0.2, 5), c: '#e8e0c8', p: [0.19, 0.95, 0], r: [0, 0, -0.7] });
          P.push({ g: cone(0.045, 0.2, 5), c: '#e8e0c8', p: [-0.19, 0.95, 0], r: [0, 0, 0.7] });
        } else if (o.plume) P.push({ g: box(0.05, 0.11, 0.26), c: o.plume, p: [0, 1.0, -0.06], r: [0.25, 0, 0] });
      } else if (hat === 'hood') {
        P.push({ g: cap(0.2, 8, 3), c: o.helm, p: [0, 0.79, -0.01], r: [-0.25, 0, 0], s: [1, 1.1, 1] });
        P.push({ g: box(0.3, 0.2, 0.06), c: o.helm, p: [0, 0.68, -0.15], r: [0.2, 0, 0] });
      } else if (hat === 'band') {
        P.push({ g: cyl(0.182, 0.182, 0.045, 8), c: o.helm, p: [0, 0.86, 0] });
      }
      return R.merge(P);
    });
  }
  const legGeo = col => R.cached('leg|' + col, () => R.merge([
    { g: box(0.11, 0.28, 0.12), c: col, p: [0, -0.14, 0] },
    { g: box(0.125, 0.07, 0.17), c: '#3a2818', p: [0, -0.265, 0.02] },
  ]));
  const armGeo = (body, skin) => R.cached('arm|' + body + skin, () => R.merge([
    { g: box(0.085, 0.25, 0.09), c: body, p: [0, -0.12, 0] },
    { g: ico(0.055, 0), c: skin, p: [0, -0.27, 0] },
  ]));
  function weaponArmGeo(o) {
    return R.cached('warm|' + [o.body, o.skin, o.weapon, o.plume].join('|'), () => {
      const P = [{ g: box(0.085, 0.25, 0.09), c: o.body, p: [0, -0.12, 0] }, { g: ico(0.055, 0), c: o.skin, p: [0, -0.27, 0] }];
      const hy = -0.27, X = [Math.PI / 2, 0, 0];
      switch (o.weapon) {
        case 'sword':
          P.push({ g: box(0.035, 0.035, 0.13), c: '#5a3a20', p: [0, hy, -0.02] });
          P.push({ g: box(0.16, 0.035, 0.035), c: '#d9b44a', p: [0, hy, 0.06] });
          P.push({ g: box(0.045, 0.018, 0.5), c: '#e6ecf2', p: [0, hy, 0.32] });
          P.push({ g: cone(0.032, 0.08, 4), c: '#e6ecf2', p: [0, hy, 0.61], r: X });
          break;
        case 'spear':
          P.push({ g: cyl(0.018, 0.018, 1.15, 5), c: '#7a5230', p: [0, hy, 0.2], r: X });
          P.push({ g: cone(0.045, 0.16, 5), c: '#dfe5ea', p: [0, hy, 0.85], r: X });
          P.push({ g: box(0.05, 0.05, 0.05), c: o.plume || '#cc2222', p: [0, hy, 0.75] });
          break;
        case 'glaive':
          P.push({ g: cyl(0.022, 0.022, 1.25, 5), c: '#3a2a1a', p: [0, hy, 0.2], r: X });
          P.push({ g: box(0.03, 0.17, 0.36), c: '#e8eef4', p: [0, hy + 0.06, 0.95], r: [-0.2, 0, 0] });
          P.push({ g: box(0.06, 0.06, 0.04), c: '#d9b44a', p: [0, hy, 0.8] });
          break;
        case 'axe':
          P.push({ g: cyl(0.022, 0.022, 0.6, 5), c: '#6b4a2a', p: [0, hy, 0.18], r: X });
          P.push({ g: box(0.025, 0.24, 0.15), c: '#c9ced4', p: [0, hy + 0.07, 0.42] });
          break;
        case 'club':
          P.push({ g: cyl(0.065, 0.028, 0.48, 6), c: '#7a5230', p: [0, hy, 0.22], r: X });
          break;
        default: { const g = R.weaponGeo(o.weapon); if (g) P.push({ g, c: null, p: [0, hy, 0], r: X }); }
      }
      return R.merge(P);
    });
  }
  // 원거리·장창 무기 (손에서 +Y 방향으로 뻗음. 1 = 사람 키). A3D 캐릭터의 손 뼈에도 붙인다
  R.weaponGeo = w => R.cached('wpn|' + w, () => {
    const P = [];
    if (w === 'bow') {
      for (let k = -2; k <= 2; k++) { const a = k * 0.33; P.push({ g: box(0.025, 0.12, 0.025), c: '#6b4a2a', p: [0, Math.sin(a) * 0.3, Math.cos(a) * 0.3 - 0.3], r: [-a, 0, 0] }); }
      P.push({ g: box(0.008, 0.56, 0.008), c: '#e8e0c8', p: [0, 0, -0.1] });
    } else if (w === 'sling') {
      P.push({ g: box(0.012, 0.22, 0.012), c: '#8a6a40', p: [0, -0.1, 0] });
      P.push({ g: ico(0.035, 0), c: '#9a9a90', p: [0, -0.22, 0] });
    } else if (w === 'xbow') {
      P.push({ g: box(0.04, 0.38, 0.05), c: '#6b4a2a', p: [0, 0.12, 0] });
      P.push({ g: box(0.36, 0.03, 0.03), c: '#4a4a50', p: [0, 0.28, 0] });
    } else if (w === 'musket') {
      P.push({ g: box(0.045, 0.24, 0.06), c: '#6b4a2a', p: [0, -0.02, 0] });
      P.push({ g: cyl(0.016, 0.016, 0.5, 5), c: '#3a3a40', p: [0, 0.32, 0.01] });
      P.push({ g: box(0.05, 0.03, 0.07), c: '#c9a040', p: [0, 0.1, 0] });
    } else if (w === 'rifle') { // 후장식 소총 + 총검
      P.push({ g: box(0.04, 0.22, 0.055), c: '#5a3a22', p: [0, -0.04, 0] });
      P.push({ g: cyl(0.013, 0.013, 0.56, 5), c: '#2e3034', p: [0, 0.34, 0.012] });
      P.push({ g: box(0.035, 0.32, 0.04), c: '#6a4a2c', p: [0, 0.22, -0.004] });
      P.push({ g: box(0.012, 0.2, 0.02), c: '#dfe5ea', p: [0, 0.71, 0.03] });
      P.push({ g: box(0.045, 0.04, 0.06), c: '#3a3c40', p: [0, 0.08, 0] });
    } else if (w === 'rammer') { // 야포병의 장전 꽂을대 (긴 자루 + 솔)
      P.push({ g: cyl(0.014, 0.014, 1.05, 5), c: '#7a5a34', p: [0, 0.32, 0] });
      P.push({ g: cyl(0.04, 0.04, 0.12, 6), c: '#3a3028', p: [0, 0.88, 0] });
    } else if (w === 'club') { // 부족 몽둥이: 나무 자루 + 돌 머리
      P.push({ g: cyl(0.02, 0.026, 0.42, 5), c: '#6b4a2a', p: [0, 0.14, 0] });
      P.push({ g: ico(0.06, 0), c: '#7c766c', p: [0, 0.36, 0], s: [1, 1.3, 1] });
      P.push({ g: box(0.05, 0.03, 0.05), c: '#a8865a', p: [0, 0.3, 0] });
    } else if (w === 'pike' || w === 'spear') {
      const L = w === 'pike' ? 1.5 : 1.0;
      P.push({ g: cyl(0.016, 0.016, L, 5), c: '#7a5230', p: [0, L * 0.3, 0] });
      P.push({ g: cone(0.04, 0.14, 5), c: '#dfe5ea', p: [0, L * 0.8 + 0.07, 0] });
    } else return null;
    return R.merge(P);
  });
  function human(look) {
    const o = Object.assign({}, DEF, look || {});
    for (const k of ['weapon', 'hat', 'plume', 'cape']) if (!o[k]) o[k] = null;
    const mat = R.mats.vc;
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
    const torso = new THREE.Mesh(torsoGeo(o), mat);
    const legL = new THREE.Mesh(legGeo(o.legs), mat); legL.position.set(0.075, 0.3, 0);
    const legR = new THREE.Mesh(legGeo(o.legs), mat); legR.position.set(-0.075, 0.3, 0);
    const armL = new THREE.Mesh(armGeo(o.body, o.skin), mat); armL.position.set(0.205, 0.6, 0);
    const armR = new THREE.Mesh(o.weapon ? weaponArmGeo(o) : armGeo(o.body, o.skin), mat); armR.position.set(-0.205, 0.6, 0);
    const meshes = [torso, legL, legR, armL, armR];
    for (const m of meshes) { m.castShadow = true; body.add(m); }
    group.scale.setScalar(o.scale || 1);
    let fl = false;
    return {
      group, key: hkey(o) + '|' + (o.scale || 1), look: o,
      pose(p) {
        const w = p.walk || 0, mv = !!p.moving, a = mv ? Math.sin(w) : 0;
        if (p.sit) { legL.rotation.set(-1.25, 0, 0.5); legR.rotation.set(-1.25, 0, -0.5); body.position.y = 0; }
        else { legL.rotation.set(a * 0.75, 0, 0); legR.rotation.set(-a * 0.75, 0, 0); body.position.y = mv ? Math.abs(Math.cos(w)) * 0.035 : 0; }
        armL.rotation.set(-a * 0.6, 0, 0.1);
        if (p.swing > 0) {
          const k = 1 - Math.min(1, p.swing), e = 1 - (1 - k) * (1 - k);
          armR.rotation.set(-2.8 + 2.5 * e, 0, -0.5 + 0.9 * e);
        } else armR.rotation.set(o.weapon ? -0.55 + a * 0.15 : a * 0.6, 0, -0.1);
        if (p.yaw !== undefined) group.rotation.y = p.yaw;
      },
      flash(on) { if (on === fl) return; fl = on; for (const m of meshes) m.material = on ? R.mats.flash : mat; },
    };
  }
  human.key = look => { const o = Object.assign({}, DEF, look || {}); return hkey(o) + '|' + (o.scale || 1); };
  // CC0 캐릭터가 준비됐으면 그걸, 아니면 절차적 모델
  const useA = () => typeof A3D !== 'undefined' && A3D.chars;
  R.human = look => (useA() && A3D.human(look || {})) || human(look);
  R.human.key = look => useA() ? A3D.humanKey(look || {}) : human.key(look);
  R.human.proc = human;

  // ---------- 발밑 그림자 (부드러운 원, 인스턴스 1개) ----------
  let blobTex = null;
  R.blobs = (scene, max) => {
    if (!blobTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 31);
      gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); blobTex = new THREE.CanvasTexture(c);
    }
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x0a1408, opacity: 0.42, polygonOffset: true, polygonOffsetFactor: -2 }), max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.renderOrder = 1; m.count = 0;
    scene.add(m);
    const mm = new THREE.Matrix4();
    let n = 0;
    return {
      mesh: m,
      begin() { n = 0; },
      add(x, z, r, y) { if (n >= max) return; mm.makeScale(r * 2, 1, r * 2); mm.setPosition(x, (y || 0) + 0.025, z); m.setMatrixAt(n++, mm); },
      end() { m.count = n; m.instanceMatrix.needsUpdate = true; },
    };
  };
  R.ctex = c => { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; };

  // ---------- 말 ----------
  const horseBody = col => R.cached('horse|' + col, () => {
    const dk = '#2a1a0e';
    return R.merge([
      { g: cyl(0.17, 0.17, 0.78, 6), c: col, p: [0, 0.6, 0], r: [Math.PI / 2, 0, 0] },
      { g: box(0.3, 0.3, 0.3), c: col, p: [0, 0.62, 0.3] },
      { g: box(0.15, 0.4, 0.17), c: col, p: [0, 0.86, 0.43], r: [0.55, 0, 0] },
      { g: box(0.14, 0.15, 0.32), c: col, p: [0, 1.04, 0.58], r: [0.45, 0, 0] },
      { g: box(0.12, 0.1, 0.12), c: '#3a2a22', p: [0, 0.97, 0.72], r: [0.45, 0, 0] },
      { g: box(0.05, 0.36, 0.12), c: dk, p: [0, 0.94, 0.38], r: [0.55, 0, 0] },
      { g: cone(0.03, 0.08, 4), c: col, p: [0.045, 1.16, 0.5] },
      { g: cone(0.03, 0.08, 4), c: col, p: [-0.045, 1.16, 0.5] },
      { g: box(0.022, 0.022, 0.022), c: '#111111', p: [0.072, 1.08, 0.6] },
      { g: box(0.022, 0.022, 0.022), c: '#111111', p: [-0.072, 1.08, 0.6] },
      { g: box(0.07, 0.36, 0.09), c: dk, p: [0, 0.55, -0.46], r: [-0.35, 0, 0] },
    ]);
  });
  const horseLeg = col => R.cached('hleg|' + col, () => R.merge([
    { g: box(0.085, 0.42, 0.09), c: col, p: [0, -0.21, 0] },
    { g: box(0.095, 0.08, 0.1), c: '#2a2018', p: [0, -0.41, 0] },
  ]));
  const saddleGeo = () => R.cached('saddle', () => R.merge([
    { g: box(0.36, 0.05, 0.34), c: '#6b2a1f', p: [0, 0.78, 0] },
    { g: box(0.1, 0.07, 0.06), c: '#6b2a1f', p: [0, 0.82, 0.15] },
    { g: box(0.03, 0.18, 0.03), c: '#d9b44a', p: [0.19, 0.66, 0] },
    { g: box(0.03, 0.18, 0.03), c: '#d9b44a', p: [-0.19, 0.66, 0] },
  ]));
  // 사실적 말(real3d.js RA.horse, horse.glb)이 준비됐으면 그걸, 아니면(귀여운 스타일·로딩 전·실패) 아래 절차적 말
  const realHorse = () => typeof RA !== 'undefined' && RA.hasHorse && RA.hasHorse();
  function horse(col, cloth) {
    if (realHorse()) { const m = RA.horse(col, cloth); if (m) return m; }
    col = col || '#8b5a2b';
    const leg = new THREE.Color(col).multiplyScalar(0.72).getStyle();
    const mat = R.mats.vc, group = new THREE.Group();
    const body = new THREE.Mesh(horseBody(col), mat);
    const legs = [[0.1, 0.32, 0], [-0.1, 0.32, 1], [0.1, -0.3, 1], [-0.1, -0.3, 0]].map(([x, z, ph]) => { const m = new THREE.Mesh(horseLeg(leg), mat); m.position.set(x, 0.45, z); m.userData.ph = ph; return m; });
    const saddle = new THREE.Mesh(saddleGeo(), mat); saddle.visible = false;
    for (const m of [body, ...legs, saddle]) { m.castShadow = true; group.add(m); }
    return {
      group, key: 'horse|' + col, flash() {},
      pose(p) {
        const a = p.moving ? Math.sin(p.walk || 0) * 0.7 : 0;
        for (const m of legs) m.rotation.x = m.userData.ph ? a : -a;
        body.position.y = p.moving ? Math.abs(Math.cos(p.walk || 0)) * 0.03 : 0;
        saddle.visible = !!p.ridden;
        if (p.yaw !== undefined) group.rotation.y = p.yaw;
      },
    };
  }
  R.horse = horse;
  // 풀링 키: 사실적 말이 준비되면 키가 바뀌어 풀에서 새 모델로 바꿔 끼운다
  R.horse.key = (col, cloth) => realHorse() ? RA.horseKey(col, cloth) : 'horse|' + (col || '#8b5a2b');
  // 안장 높이(그룹 배율 곱하기 전): 사실적 말은 매 프레임 등 높이, 절차적 말은 고정
  R.seat = m => m && m.seat ? m.seat() : R.SADDLE_Y;
  // 말 탄 사람이 올라가는 높이 (체력바·베기 효과 위치용) = 서 있는 안장 높이 × 말 배율
  R.mountUp = s => (realHorse() && RA.horseSeat ? RA.horseSeat() : R.SADDLE_Y) * s;
  // 기수 위치: 말(h) 위 안장 자리에 (사실적 말은 안장이 말 원점보다 앞에 있어 바라보는 쪽으로 밀어 준다). s = 말 그룹 배율
  R.ride = (h, g, x, y, z, s) => {
    const f = h && h.seatZ ? h.seatZ() * (h.group.scale.x || s) : 0, yw = h ? h.group.rotation.y : 0; // 앞뒤 거리는 말의 실제 배율(3인칭 축소 포함)
    g.position.set(x + Math.sin(yw) * f, y + R.seat(h) * s, z + Math.cos(yw) * f);
  };
  // 진영별 안장 담요 색
  R.CLOTH = { ally: '#2f5fb8', foe: '#a3322a', bandit: '#5b4a3a', king: '#7a1f3a', wild: '#8a7a5a' };
  return R;
})();
