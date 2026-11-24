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
//   RA.horse(col, cloth)        스키닝 말 (horse.glb, Idle/Walk/Gallop) → R3D.horse 가 대신 씀. 준비 안 됐으면 null (RA.hasHorse())
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
    const ob = m.onBeforeCompile; m.onBeforeCompile = sh => { ob(sh); fadeHook(sh); };
    m.customProgramCacheKey = () => 'rasway3' + key;
  }
  // 바위: rock_a 의 붉은 기를 빼고 회색 쪽으로 (채도↓)
  function desatHook(m, k) {
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, ${k.toFixed(2)}) * vec3(0.98, 1.0, 1.03); }`);
    };
    m.customProgramCacheKey = () => 'radesat' + k;
  }
  // 3인칭에서 카메라 앞 · 카메라와 영주 사이를 가리는 나무를 점무늬(디더)로 걷어낸다. A.U.fade = (영주 가슴 x, y, z, 세기) — 0 이면 아무것도 안 함
  // 잎 재질은 이미 alphaTest(discard)를 쓰므로 추가 비용은 몇 줄의 계산뿐. 그림자(깊이) 패스엔 영향 없음
  A.U.fade = { value: new THREE.Vector4(0, 0, 0, 0) }; // w: 0~1 위 시점(좁게) · 1~2 3인칭(넓게 + 카메라 바로 앞)
  const FADE_VS = `{ vec4 fq = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    fq = instanceMatrix * fq;
#endif
    vFW = (modelMatrix * fq).xyz; }`;
  // 카메라 위치는 viewMatrix 에서 구한다 (Lambert 재질엔 three 가 cameraPosition 유니폼을 채워 주지 않는다)
  const FADE_FS = `if (uFade.w > 0.0) {
    vec3 vt = viewMatrix[3].xyz, cp = -vec3(dot(viewMatrix[0].xyz, vt), dot(viewMatrix[1].xyz, vt), dot(viewMatrix[2].xyz, vt));
    vec3 ab = uFade.xyz - cp; float t = dot(vFW - cp, ab) / max(dot(ab, ab), 1e-4);
    float dl = length(vFW - (cp + ab * clamp(t, 0.0, 1.0))), tp = step(1.0, uFade.w);
    float f = max((1.0 - smoothstep(mix(0.18, 0.35, tp), mix(0.55, 0.95, tp), dl)) * (1.0 - smoothstep(0.99, 1.04, t)) * 0.92, tp * (1.0 - smoothstep(0.3, 0.9, length(vFW - cp)))) * (uFade.w - tp);
    if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) < f) discard;
  }`;
  function fadeHook(sh) {
    sh.uniforms.uFade = A.U.fade;
    sh.vertexShader = 'varying vec3 vFW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + FADE_VS);
    sh.fragmentShader = 'uniform vec4 uFade;\nvarying vec3 vFW;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FADE_FS);
  }
  // 산(절벽 스캔): 위를 향한 턱은 이끼·풀색, 높은 곳 윗면은 눈, 나머지는 붉은 기를 뺀 회갈색 바위 → 지형에 녹아들고 산으로 읽힌다
  function mountainHook(m) {
    m.onBeforeCompile = sh => {
      sh.vertexShader = 'varying float vMY;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 mq = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    mq = instanceMatrix * mq;
#endif
    vMY = (modelMatrix * mq).y; }`);
      sh.fragmentShader = 'varying float vMY;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, 0.28) * vec3(1.0, 0.99, 0.97); diffuseColor.rgb = mix(vec3(0.42), diffuseColor.rgb, 0.85) * 1.12; }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 wn = inverseTransformDirection(normal, viewMatrix); float up = wn.y;
    float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float moss = smoothstep(0.55, 0.85, up) * (1.0 - smoothstep(1.6, 2.4, vMY));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.42, 0.19) * (0.75 + 0.7 * l), moss * 0.85);
    float snow = smoothstep(0.55, 0.9, up) * smoothstep(3.0, 3.5, vMY);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.9, 0.94), snow * 0.7);
    float foot = 1.0 - smoothstep(0.04, 0.4, vMY); // 산자락: 들판 색으로 녹아들게
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.45, 0.22) * (0.8 + 0.4 * l), foot * 0.7); }`);
    };
    m.customProgramCacheKey = () => 'ramtn4';
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
    if (/^rock_/.test(name)) { desatHook(m, name === 'rock_a' ? 0.12 : 0.45); m.color.setScalar(name === 'rock_a' ? 2.5 : 3.1); m.side = THREE.FrontSide; } // 바위 텍스처가 어두워 위에서 보면 시커멓게 보였다
    if (name === 'mountain_a') mountainHook(m);
    if (/^scatter_/.test(name)) m.color.setScalar(0.92);
    if (!leaf && !/^rock_/.test(name) && !crop && !/^scatter_/.test(name)) m.color.setScalar(1.16); // 구운 AO 때문에 어두운 건물을 게임 조명에 맞게 조금 밝게
    allMats.add(m);
    void rough;
    return { mat: m, role: leaf ? 'leaf' : crop ? 'crop' : 'body' };
  }
  // 법선 손질 (불러올 때 한 번)
  //  · 바닥 풀/꽃 카드: 법선을 위로 → 지면과 같은 밝기 (세운 카드가 옆을 향한 법선으로 어둡게 나와 위에서 보면 검은 X 자로 보였다)
  //  · 나무·덤불: 잎 카드 법선을 수관 가운데에서 바깥쪽으로 섞는다 → 카드마다 들쭉날쭉한 명암 대신 둥근 덩어리 명암 (해 반대쪽도 덜 시커멓다)
  //  · 산: 같은 자리 꼭짓점의 법선을 평균(UV 이음매 무시) → 각진 판 대신 부드러운 비탈
  function fixNormals(name, g) {
    const n = g.attributes.normal, p = g.attributes.position;
    if (!n || !p || n.isInterleavedBufferAttribute || p.isInterleavedBufferAttribute) return;
    if (/^scatter_/.test(name)) { for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); n.needsUpdate = true; return; }
    if (/^(tree_|bush)/.test(name)) {
      const bb = g.boundingBox, cy = bb.min.y + (bb.max.y - bb.min.y) * (name === 'tree_conifer' ? 0.45 : 0.62), ry = Math.max(0.5, (bb.max.y - bb.min.y) * 0.3);
      const v = new THREE.Vector3(), o = new THREE.Vector3();
      for (let i = 0; i < n.count; i++) {
        v.set(p.getX(i), (p.getY(i) - cy) * 0.6, p.getZ(i));
        const r = Math.hypot(v.x, v.z); if (v.length() < 1e-3) continue;
        v.normalize(); o.set(n.getX(i), n.getY(i), n.getZ(i));
        const k = p.getY(i) - bb.min.y < ry && r < (bb.max.x - bb.min.x) * 0.06 ? 0.15 : 0.7; // 줄기는 조금만
        o.lerp(v, k).normalize(); n.setXYZ(i, o.x, o.y, o.z);
      }
      n.needsUpdate = true; return;
    }
    if (name === 'mountain_a') {
      const idx = g.index, key = i => Math.round(p.getX(i) * 50) + ',' + Math.round(p.getY(i) * 50) + ',' + Math.round(p.getZ(i) * 50);
      const acc = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
      const tri = idx ? idx.count / 3 : p.count / 3, vi = k => idx ? idx.getX(k) : k;
      for (let t = 0; t < tri; t++) {
        const i0 = vi(t * 3), i1 = vi(t * 3 + 1), i2 = vi(t * 3 + 2);
        a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
        fn.subVectors(c, b).cross(a.clone().sub(b)); // 면적 가중
        for (const i of [i0, i1, i2]) { const k = key(i); let s = acc.get(k); if (!s) acc.set(k, s = [0, 0, 0]); s[0] += fn.x; s[1] += fn.y; s[2] += fn.z; }
      }
      for (let i = 0; i < n.count; i++) {
        const s = acc.get(key(i)); if (!s) continue;
        fn.set(s[0], s[1], s[2]).normalize(); o3.set(n.getX(i), n.getY(i), n.getZ(i));
        if (fn.dot(o3) < 0) continue; // 뒤집힌 면은 그대로
        n.setXYZ(i, fn.x, fn.y, fn.z);
      }
      n.needsUpdate = true;
    }
  }
  const o3 = new THREE.Vector3();
  const tmw = new THREE.Matrix4();
  function ingest(name, gltf) {
    const root = gltf.scene; root.updateMatrixWorld(true);
    const parts = [], box = new THREE.Box3();
    root.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone(); tmw.copy(o.matrixWorld); g.applyMatrix4(tmw);
      if (g.attributes.color) g.deleteAttribute('color');
      g.computeBoundingBox(); g.computeBoundingSphere(); box.union(g.boundingBox);
      fixNormals(name, g);
      const { mat, role } = convertMat(name, o.material);
      parts.push({ geo: g, mat, role });
    });
    if (!parts.length) throw new Error('no mesh ' + name);
    M.set(name, { parts, box });
  }
  A.files = NAMES.map(n => ['real/' + n + '.glb', g => ingest(n, g), n]);
  A.files.push(['real/horse.glb', g => ingestHorse(g), 'horse']);

  // ---------- 말 (horse.glb: Quaternius White Horse, CC0 · 스키닝 + Idle/Walk/Gallop) ----------
  // 모델은 m 단위(귀 끝 2.3 m, 안장 1.74 m), 머리가 +Z (게임 규약과 같음). 게임 단위로는 HORSE_K 배 (옛 절차적 말과 같은 바깥 배율 W3_HS 를 그대로 쓴다)
  // A.horse(col, cloth) → { group, key, pose({moving, yaw}), seat(), flash() }  · seat() = 지금 프레임의 안장 높이(그룹 배율 곱하기 전)
  const HORSE_K = 0.6, SEAT_M = 1.74;
  let HZ = null;
  function ingestHorse(gltf) {
    const root = gltf.scene, clip = nm => gltf.animations.find(a => a.name === nm);
    const C = { idle: clip('Idle'), walk: clip('Walk'), gallop: clip('Gallop') };
    if (!C.idle || !C.walk || !C.gallop) throw new Error('horse: clips missing');
    const src = {}; let skinned = 0;
    root.traverse(o => { if (o.isSkinnedMesh) { skinned++; src[o.material.name] = o.material; } });
    if (!skinned || !src.coat) throw new Error('horse: no skinned coat');
    // 장면 밖(부모 없는) 뼈가 있으면 리그 밑으로 (예전 내보내기: 발굽 IK 뼈 FF/FFB 가 고아 노드라 복제하면 발굽이 원점으로 늘어났다)
    let arm = null; root.traverse(o => { if (!arm && o.isBone && o.parent && !o.parent.isBone) arm = o.parent; });
    root.traverse(o => { if (o.isSkinnedMesh) for (const b of o.skeleton.bones) if (b && !b.parent && arm) arm.add(b); });
    if (src.coat.map) src.coat.map.anisotropy = Math.min(4, R3D.maxAniso || 1);
    // 안장 자리 = 안장 담요(cloth) 가운데, 높이 SEAT_M. 그 점을 Torso 뼈에 붙여 두면 달릴 때 기수가 말 등과 같이 출렁이고 앞뒤로 기운다
    root.updateMatrixWorld(true);
    let torso = null, cz = 0.2;
    root.traverse(o => { if (o.isBone && o.name === 'Torso') torso = o; if (o.isSkinnedMesh && o.material.name === 'cloth') { o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; cz = (bb.min.z + bb.max.z) / 2; } });
    const seatL = new THREE.Vector3(0, SEAT_M, cz);
    if (torso) seatL.applyMatrix4(new THREE.Matrix4().copy(torso.matrixWorld).invert());
    HZ = { root, clips: C, src, seatL, seatZ: cz, mats: new Map() };
  }
  // 재질: coat = 털(텍스처 × 말 색), cloth = 안장 담요(진영 색), tack = 가죽 (색별로 공유)
  function horseMat(kind, col) {
    const key = kind + '|' + col;
    let m = HZ.mats.get(key); if (m) return m;
    const s = HZ.src[kind];
    if (kind === 'coat') { // 흰·회색 말은 텍스처가 이미 밝아 1 을 넘기면 하얗게 날아간다 → 밝은 털은 조금 눌러 결이 보이게
      m = new THREE.MeshLambertMaterial({ map: s.map || null }); m.color.set(col);
      const l = m.color.r * 0.3 + m.color.g * 0.59 + m.color.b * 0.11; m.color.multiplyScalar(l > 0.55 ? 0.8 : 1.12);
    }
    else if (kind === 'cloth') { m = new THREE.MeshLambertMaterial(); m.color.set(col); }
    else { m = new THREE.MeshLambertMaterial(); if (s && s.color) m.color.copy(s.color); }
    HZ.mats.set(key, m); allMats.add(m); if (A.done && R3D.regMat) R3D.regMat(m);
    return m;
  }
  A.hasHorse = () => !!HZ;
  A.horse = (col, cloth) => {
    if (!HZ || !THREE.SkeletonUtils) return null;
    col = col || '#8b5a2b'; cloth = cloth || '#8a2a2a';
    const rig = THREE.SkeletonUtils.clone(HZ.root), meshes = [], bones = [];
    rig.traverse(o => {
      if (o.isSkinnedMesh) {
        const nm = o.material.name, mat = nm === 'cloth' ? horseMat('cloth', cloth) : nm === 'tack' ? horseMat('tack', '') : horseMat('coat', col);
        o.material = mat; o.userData.mat = mat; o.frustumCulled = false; o.castShadow = true; o.receiveShadow = false; meshes.push(o);
      }
      if (o.isBone && o.name === 'Torso') bones.push(o);
    });
    const inner = new THREE.Group(); inner.add(rig); inner.scale.setScalar(HORSE_K);
    const group = new THREE.Group(); group.add(inner);
    const mixer = new THREE.AnimationMixer(rig), act = {};
    for (const k in HZ.clips) act[k] = mixer.clipAction(HZ.clips[k]);
    let cur = null, last = performance.now(), px = null, pz = 0, spd = 0, fl = false;
    const go = (k, fade) => {
      if (cur === k) return;
      const n = act[k]; n.reset(); n.enabled = true; n.setEffectiveWeight(1); n.play();
      if (cur) act[cur].crossFadeTo(n, fade, false);
      cur = k;
    };
    go('idle', 0); act.idle.time = Math.random() * HZ.clips.idle.duration;
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    let seatY = SEAT_M * HORSE_K, seatZ = HZ.seatZ * HORSE_K;
    return {
      group, key: A.horseKey(col, cloth), asset: true,
      pose(p) {
        const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
        // 속도(그룹 배율로 나눈 값, 초당): 지난 프레임 위치 → 걷기/질주 고르기 (게임의 walk 값은 속도와 상관없이 늘어서 못 쓴다)
        const gp = group.position, sc = group.scale.x || 1;
        if (px === null || dt <= 0) { px = gp.x; pz = gp.z; }
        const d = Math.hypot(gp.x - px, gp.z - pz) / sc; px = gp.x; pz = gp.z;
        if (dt > 0) { const s = d > 3 ? spd : d / dt; spd += (s - spd) * Math.min(1, dt * 6); } // 순간이동(풀 재사용)은 무시
        let st;
        if (!p.moving || spd < 0.12) st = 'idle';
        else if (cur === 'gallop' ? spd > 1.35 : spd > 1.85) st = 'gallop';
        else st = 'walk';
        go(st, 0.25);
        if (st === 'gallop') act.gallop.timeScale = Math.max(0.75, Math.min(1.5, spd / 4));
        else if (st === 'walk') act.walk.timeScale = Math.max(0.6, Math.min(1.6, spd / 0.75));
        if (p.yaw !== undefined) group.rotation.y = p.yaw;
        mixer.update(dt);
        // 안장 자리: Torso 뼈의 리그 안 행렬 × 붙여 둔 점 (rig 까지의 부모 행렬만 곱한다)
        if (bones.length) {
          const b = bones[0]; b.updateMatrix(); m4.copy(b.matrix);
          for (let o = b.parent; o && o !== rig; o = o.parent) { o.updateMatrix(); m4.premultiply(o.matrix); }
          rig.updateMatrix(); m4.premultiply(rig.matrix);
          v.copy(HZ.seatL).applyMatrix4(m4); seatY = v.y * HORSE_K; seatZ = v.z * HORSE_K;
        }
      },
      seat() { return seatY; },
      seatZ() { return seatZ; },
      flash(on) { if (on === fl) return; fl = on; for (const m of meshes) m.material = on ? R3D.mats.flash : m.userData.mat; },
      shadow(on) { for (const m of meshes) m.castShadow = on; },
      dispose() { mixer.stopAllAction(); mixer.uncacheRoot(rig); },
    };
  };
  A.horseSeat = () => SEAT_M * HORSE_K;
  A.horseKey = (col, cloth) => 'horse|' + (col || '#8b5a2b') + '|' + (cloth || '#8a2a2a') + '|g';
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
