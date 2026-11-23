'use strict';
// ===== real3d.js: 사실적 환경 모델 (assets/real, Blender + Poly Haven CC0) =====
// 출처/라이선스: assets/real/CREDITS.md (모두 CC0 1.0)
//
// 모델은 1단위 = 1m, +Y 위, 발밑 가운데가 원점. 게임(1타일 = 1단위)에 놓을 때 배율(약 0.1~0.15)을 곱한다.
// assets3d.js(A3D)의 로딩 줄에 같이 끼어 불러오고(같은 로딩 표시), 실패하거나 ?noassets 면 아무것도 안 해서
// world3d / battle3d 가 KayKit(A3D) 또는 절차적 모델로 그대로 그린다.
//
// API (전역 RA)
//   RA.ok / RA.done / RA.ver    하나라도 쓸 수 있음 / 로딩 끝(성공·실패 무관) / 바뀔 때마다 +1
//   RA.has(name)                그 모델이 준비됐나
//   RA.box(name)                모델 크기 (THREE.Box3, m)
//   RA.fit(name, w)             가로·세로 중 큰 쪽이 w 단위가 되는 배율
//   RA.group(name, shadow)      Mesh 묶음 (지오메트리·재질 공유) → THREE.Group
//   RA.inst(name, list, opt)    InstancedMesh 묶음 (재질별 1개). list = [{x, y, z, ry, s, sy, c: THREE.Color|null}]
//                               opt = {shadow, recv} → THREE.Group (userData.dispose())
//   RA.U                        흔들림 uniform {time, chop} (world3d 가 매 프레임 갱신)
//   RA.ground                   지면 PBR 텍스처 {grass|dirt|sand|rock: {a, n}} (R3D.tex 항목) 또는 null
//   RA.setTier(tier)            건물 노멀맵은 'high' 에서만 (텍스처 메모리·셰이더 비용↓). 지면 노멀은 low 에서만 끈다
const RA = (() => {
  const A = { ok: false, done: false, ver: 0, files: [], ground: null, failed: [] };
  window.__real = A;
  if (typeof THREE === 'undefined' || !THREE.GLTFLoader) { A.done = true; A.has = () => false; return A; }
  const NAMES = ['tree_broadleaf_a', 'tree_broadleaf_b', 'tree_conifer', 'bush', 'rock_a', 'rock_b', 'hut_tribal', 'house_ancient', 'house_medieval',
    'house_earlymodern', 'castle_keep', 'wall_stone', 'palisade', 'farm_field', 'well', 'campfire',
    // 2차: 나머지 건물 · 산 · 바닥 풀/꽃 카드
    'school', 'market', 'tower_wood', 'tower_stone', 'lumber', 'quarry', 'mine', 'barracks', 'range', 'stable', 'mountain_a', 'scatter_grass', 'scatter_flowers'];
  const M = new Map(); // name → { parts: [{geo, mat, role}], box }
  A.U = { time: { value: 0 }, chop: { value: new THREE.Vector3(-99, -99, 0) } };
  let tier = 'medium';
  const SMALL = new Set(['well', 'campfire', 'farm_field', 'palisade', 'rock_a', 'rock_b', 'scatter_grass', 'scatter_flowers']);
  const allMats = new Set(), nrm = new Map(); // 노멀맵 켜고 끄기용: 재질 → 원래 노멀맵

  // ---------- 공용 재질 ----------
  let winMat = null;
  function windowMat() {
    if (winMat) return winMat;
    // 낮엔 어두운 유리, 밤엔 따뜻한 불빛 (R3D.uWin = 밤 정도, R3D.uWinLit = 켜진 창 비율 — 시대·인구에 따라 world3d 가 정함)
    const m = new THREE.MeshLambertMaterial({ color: 0x0b0c0f, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.uniforms.uWin = R3D.uWin || { value: 0 }; sh.uniforms.uWinLit = R3D.uWinLit || { value: 0.5 };
      sh.vertexShader = 'varying vec3 vWP2;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 wq = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    wq = instanceMatrix * wq;
#endif
    vWP2 = (modelMatrix * wq).xyz; }`);
      sh.fragmentShader = 'uniform float uWin, uWinLit;\nvarying vec3 vWP2;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uWin > 0.0) {
    float h = fract(sin(dot(floor(vWP2 * 2.2), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    if (h < uWinLit) totalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * uWin * (0.75 + 0.5 * fract(h * 7.0));
  }`);
    };
    m.customProgramCacheKey = () => 'rawin';
    return (winMat = m);
  }
  // 나무·덤불: 바람에 흔들림 + 벌목 중인 칸(RA.U.chop = 타일 중심 x, z, 세기)은 크게 흔들림. 높이는 모델 m 단위
  function swayHook(m, key) {
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = A.U.time; sh.uniforms.uChop = A.U.chop;
      sh.vertexShader = 'uniform float uTime;\nuniform vec3 uChop;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  {
    vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
    float hgt = max(0.0, position.y - 1.2) * 0.1;
    float sw = sin(uTime * 1.7 + ip.x * 0.8 + ip.y * 0.6) * 0.32 * hgt;
    float inT = step(abs(ip.x - uChop.x), 0.5) * step(abs(ip.y - uChop.y), 0.5);
    sw += sin(uTime * 55.0) * uChop.z * inT * 4.0 * hgt;
    transformed.x += sw; transformed.z += sw * 0.5;
  }
#endif`);
    };
    m.customProgramCacheKey = () => 'rasway' + key;
  }
  // 바위: rock_a 의 붉은 기를 빼고 회색 쪽으로 (채도↓)
  function desatHook(m, k) {
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, ${k.toFixed(2)}) * vec3(0.98, 1.0, 1.03); }`);
    };
    m.customProgramCacheKey = () => 'radesat' + k;
  }
  function convertMat(name, src, rough) {
    const nm = (src && src.name) || '';
    if (nm === 'window') return { mat: windowMat(), role: 'window' };
    if (nm === 'fire') {
      // 이미 빛나는 불 (HDR 색 → 블룸). 톤매핑 낮음 품질에서도 밝게
      const e = src.emissive ? src.emissive.clone() : new THREE.Color(1, 0.42, 0.08);
      return { mat: new THREE.MeshBasicMaterial({ color: e.multiplyScalar(2.6), side: THREE.DoubleSide }), role: 'fire' };
    }
    const leaf = /^(tree_|bush)/.test(name), crop = nm === 'crop';
    const m = new THREE.MeshLambertMaterial({ map: src.map || null, side: src.side, vertexColors: false });
    if (src.alphaTest > 0 || src.transparent || crop || leaf) { m.alphaTest = leaf ? 0.42 : 0.5; m.transparent = false; m.side = /^(scatter_|tree_|bush)/.test(name) ? THREE.FrontSide : THREE.DoubleSide; } // scatter·나무·덤불 카드는 뒷면이 실제 면으로 모델링돼 있다. DoubleSide 면 같은 자리의 앞·뒷면이 겹쳐 그려져 깜빡이고(z-fighting) 법선이 뒤집혀 시커멓게 나온다
    if (src.map) { src.map.anisotropy = Math.min(4, R3D.maxAniso || 1); }
    // 노멀맵: 큰 건물만, '높음' 품질에서만 (이 카메라 거리에선 차이가 작고 텍스처 메모리를 크게 먹는다)
    if (src.normalMap && !leaf && !SMALL.has(name)) { nrm.set(m, src.normalMap); m.normalMap = tier === 'high' ? src.normalMap : null; m.normalScale.set(0.9, 0.9); }
    if (leaf) swayHook(m, name);
    if (/^rock_/.test(name)) desatHook(m, name === 'rock_a' ? 0.12 : 0.45);
    if (!leaf && !/^rock_/.test(name) && !crop) m.color.setScalar(1.16); // 구운 AO 때문에 어두운 건물을 게임 조명에 맞게 조금 밝게
    allMats.add(m);
    void rough;
    return { mat: m, role: leaf ? 'leaf' : crop ? 'crop' : 'body' };
  }
  const tmw = new THREE.Matrix4();
  function ingest(name, gltf) {
    const root = gltf.scene; root.updateMatrixWorld(true);
    const parts = [], box = new THREE.Box3();
    root.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone(); tmw.copy(o.matrixWorld); g.applyMatrix4(tmw);
      if (g.attributes.color) g.deleteAttribute('color');
      g.computeBoundingBox(); g.computeBoundingSphere(); box.union(g.boundingBox);
      const { mat, role } = convertMat(name, o.material);
      parts.push({ geo: g, mat, role });
    });
    if (!parts.length) throw new Error('no mesh ' + name);
    M.set(name, { parts, box });
  }
  A.files = NAMES.map(n => ['real/' + n + '.glb', g => ingest(n, g), n]);
  A.has = n => M.has(n);
  A.box = n => { const e = M.get(n); return e ? e.box : null; };
  A.fit = (n, w) => { const b = A.box(n); return b ? w / Math.max(b.max.x - b.min.x, b.max.z - b.min.z) : 1; };
  A.height = n => { const b = A.box(n); return b ? b.max.y : 1; };
  A.parts = n => { const e = M.get(n); return e ? e.parts : null; };
  A.group = (n, shadow) => {
    const e = M.get(n); if (!e) return null;
    const g = new THREE.Group();
    for (const p of e.parts) {
      const m = new THREE.Mesh(p.geo, p.mat);
      m.castShadow = shadow !== false && p.role !== 'fire'; m.receiveShadow = p.role !== 'fire' && p.role !== 'window';
      g.add(m);
    }
    return g;
  };
  const im4 = new THREE.Matrix4(), iq = new THREE.Quaternion(), ie = new THREE.Euler(), ip = new THREE.Vector3(), is = new THREE.Vector3(), white = new THREE.Color(1, 1, 1);
  A.inst = (n, list, opt) => {
    const e = M.get(n); if (!e || !list.length) return null;
    opt = opt || {};
    const g = new THREE.Group();
    for (const p of e.parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, list.length);
      list.forEach((o, k) => {
        ie.set(o.rx || 0, o.ry || 0, o.rz || 0); iq.setFromEuler(ie); ip.set(o.x, o.y || 0, o.z);
        const s = o.s || 1; is.set(s * (o.sx || 1), s * (o.sy || 1), s * (o.sz || 1));
        im4.compose(ip, iq, is); im.setMatrixAt(k, im4);
        if (p.role !== 'fire' && p.role !== 'window') im.setColorAt(k, o.c || white);
      });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = !!opt.shadow && p.role !== 'fire'; im.receiveShadow = opt.recv !== false && p.role !== 'fire';
      im.frustumCulled = false;
      g.add(im);
    }
    g.userData.dispose = () => { for (const m of g.children) m.dispose(); };
    return g;
  };
  // 매 프레임 다시 채우는 인스턴스 풀 (화면에 보이는 것만 넣어 그리기·그림자 비용을 줄인다)
  // A.pool(name, scene) → { fill(list, n, shadow) }  list[k] = { m: Float32Array(16), c: [r, g, b] }
  A.pool = (n, scene, lite) => {
    const e = M.get(n); if (!e) return null;
    const P = { cap: 0, meshes: [] };
    const make = cap => {
      for (const m of P.meshes) { scene.remove(m); m.dispose(); }
      P.meshes = e.parts.map(p => {
        const im = new THREE.InstancedMesh(lite && p.role === 'leaf' ? liteGeo(n, p.geo) : p.geo, p.mat, cap);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.count = 0;
        if (p.role !== 'fire' && p.role !== 'window') { im.setColorAt(0, white); im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
        im.userData.role = p.role; scene.add(im); return im;
      });
      P.cap = cap;
    };
    P.fill = (list, cnt, shadow, recv) => {
      if (cnt > P.cap) make(Math.max(32, Math.ceil(cnt * 1.4)));
      for (const im of P.meshes) {
        const ma = im.instanceMatrix.array, ca = im.instanceColor ? im.instanceColor.array : null;
        for (let k = 0; k < cnt; k++) { ma.set(list[k].m, k * 16); if (ca) { const c = list[k].c; ca[k * 3] = c[0]; ca[k * 3 + 1] = c[1]; ca[k * 3 + 2] = c[2]; } }
        im.count = cnt; im.visible = cnt > 0; im.instanceMatrix.needsUpdate = true; if (ca) im.instanceColor.needsUpdate = true;
        im.castShadow = !!shadow && im.userData.role !== 'fire'; im.receiveShadow = !!recv;
      }
    };
    P.hide = () => { for (const im of P.meshes) { im.count = 0; im.visible = false; } };
    P.dispose = () => { for (const m of P.meshes) { scene.remove(m); m.dispose(); } P.meshes = []; P.cap = 0; };
    return P;
  };
  // 낮음 품질용 가벼운 나무: 잎 카드(사각형 = 연속한 삼각형 2개)를 하나 걸러 하나만 남기고 1.3배로 키워 빈틈을 메운다
  const liteC = new Map();
  function liteGeo(n, g) {
    if (liteC.has(n)) return liteC.get(n);
    const idx = g.index ? g.index.array : null, uv = g.attributes.uv;
    if (!idx || !uv) { liteC.set(n, g); return g; }
    const pos = g.attributes.position, out = [], scaled = new Set(), P = pos.array.slice ? new Float32Array(pos.array) : null;
    if (!P || pos.itemSize !== 3 || pos.isInterleavedBufferAttribute) { liteC.set(n, g); return g; }
    let card = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const leafy = uv.getY(a) < 0.5 && t + 5 < idx.length;
      if (!leafy) { out.push(a, b, c); continue; }
      const q = [idx[t + 3], idx[t + 4], idx[t + 5]], sh = [a, b, c].filter(v => q.includes(v)).length;
      if (sh < 2) { out.push(a, b, c); continue; } // 사각형이 아니면 그대로
      const keep = card++ % 2 === 0, vs = [...new Set([a, b, c, ...q])];
      if (keep) {
        let cx = 0, cy = 0, cz = 0; for (const v of vs) { cx += P[v * 3]; cy += P[v * 3 + 1]; cz += P[v * 3 + 2]; }
        cx /= vs.length; cy /= vs.length; cz /= vs.length;
        for (const v of vs) if (!scaled.has(v)) { scaled.add(v); P[v * 3] = cx + (P[v * 3] - cx) * 1.3; P[v * 3 + 1] = cy + (P[v * 3 + 1] - cy) * 1.3; P[v * 3 + 2] = cz + (P[v * 3 + 2] - cz) * 1.3; }
        out.push(a, b, c, q[0], q[1], q[2]);
      }
      t += 3;
    }
    const lg = g.clone(); lg.setAttribute('position', new THREE.BufferAttribute(P, 3)); lg.setIndex(out); lg.computeBoundingSphere();
    liteC.set(n, lg); return lg;
  }
  // 인스턴스 하나의 행렬·색 (pool.fill 용)
  A.item = o => {
    ie.set(0, o.ry || 0, 0); iq.setFromEuler(ie); ip.set(o.x, o.y || 0, o.z);
    const s = o.s || 1; is.set(s * (o.sx || 1), s * (o.sy || 1), s * (o.sz || 1));
    im4.compose(ip, iq, is);
    const c = o.c || white;
    return { m: new Float32Array(im4.elements), c: [c.r, c.g, c.b], x: o.x, z: o.z, r: o.r || 1 };
  };
  A.setTier = t => {
    if (t === tier) return; const was = tier; tier = t;
    if ((was === 'high') === (t === 'high')) return;
    for (const [m, nm] of nrm) { m.normalMap = t === 'high' ? nm : null; m.needsUpdate = true; }
  };
  A.tier = () => tier;

  // ---------- 지면 PBR 텍스처 (albedo + normal, 512px) ----------
  A.loadGround = () => {
    if (A.ground || !R3D.tex) return A.ground;
    const G = {};
    for (const k of ['grass', 'dirt', 'sand', 'rock']) {
      const a = R3D.tex('assets/real/ground/' + k + '_albedo.jpg', true), nn = R3D.tex('assets/real/ground/' + k + '_normal.jpg');
      G[k] = { a, n: nn };
    }
    // 4종 모두 불러와야 켠다 (하나라도 실패하면 예전 지면)
    G.on = { get value() { return ['grass', 'dirt', 'sand', 'rock'].every(k => G[k].a.on.value > 0.5) ? 1 : 0; } };
    G.non = { get value() { return ['grass', 'dirt', 'sand', 'rock'].every(k => G[k].n.on.value > 0.5) ? 1 : 0; } };
    return (A.ground = G);
  };
  A.started = false;
  // A3D.start 가 이 목록(A.files)을 같이 불러오고 끝나면 A.finish() 를 부른다
  A.begin = () => {
    A.started = true;
    if (typeof REAL_ON !== 'undefined' ? !REAL_ON : /[?&]noreal\b/.test(location.search)) { A.files = []; return; } // 귀여운 스타일: 사실적 모델 안 받음
    A.loadGround();
    if (R3D.fx && R3D.fx.onChange) { tier = R3D.quality ? R3D.quality() : tier; R3D.fx.onChange.push(t => A.setTier(t)); }
  };
  A.fail = (f, e) => { A.failed.push(f); console.warn('real asset failed', f, e && (e.message || e)); };
  A.finish = () => {
    A.done = true;
    if (M.size) { A.ok = true; A.ver++; }
    if (A.ground && !M.size) A.ground = null; // 모델이 하나도 없으면 지면도 예전대로 (네트워크가 막혔을 때)
    for (const m of allMats) if (R3D.regMat) R3D.regMat(m);
    if (winMat && R3D.regMat) R3D.regMat(winMat);
  };
  return A;
})();
