'use strict';
// ===== assets3d.js: CC0 3D 모델(glTF) 비동기 로딩 + 게임용 변환 =====
// 출처/라이선스: assets/CREDITS.md (KayKit by Kay Lousberg, CC0 1.0) · assets/real 은 real3d.js
//
// 게임은 처음부터 절차적(로우폴리) 모델로 바로 돌아가고, 여기서 .glb 를 뒤에서 불러와 다 되면 바꿔 끼운다.
// 실패하면 조용히 절차적 모델을 계속 쓴다.  ?noassets 를 붙이면 모델을 아예 안 불러온다(비교/디버그용).
//
// API (전역 A3D)
//   A3D.ready             정적 모델(props.glb) 준비됨
//   A3D.chars             캐릭터 준비됨
//   A3D.ver               준비 상태가 바뀔 때마다 +1 (캐시 무효화용)
//   A3D.mat               공용 아틀라스 재질 (Lambert + map)
//   A3D.geo(key)          정적 모델 하나를 합친 지오메트리 (발밑 원점, +z 정면) 또는 null
//   A3D.building(type)    건물 type('house'|'farm'|'tower'|'market'|'lumber'|'quarry'|'mine'|'house2') → {geo, top} 또는 null
//   A3D.castle(lv)        마을 중심(1~5) → {geo, top, flag:[x,y,z]} 또는 null
//   A3D.campProps()       산적 소굴 소품 지오메트리
//   A3D.prop(k)           숲/바위 인스턴스용 지오메트리 (world3d의 prop 키) 또는 null
//   A3D.human(look)       R3D.human 과 같은 인터페이스의 스키닝 캐릭터 (준비 안 됐으면 null)
//   A3D.humanKey(look)    풀링 키
const A3D = (() => {
  const A = { ready: false, chars: false, ver: 0, done: false, ok: false, ms: 0, bytes: 0, err: null };
  window.__assets = A;
  if (typeof THREE === 'undefined' || !THREE.GLTFLoader) { A.done = true; return A; }
  const BASE = 'assets/';
  const geos = new Map(), cache = new Map();
  const cached = (k, f) => { if (cache.has(k)) return cache.get(k); const v = f(); cache.set(k, v); return v; };

  // ---------- 로딩 표시 ----------
  let ui = null;
  function showUI(t) {
    if (!ui) {
      ui = document.createElement('div');
      ui.style.cssText = 'position:fixed;z-index:12;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);' +
        'background:rgba(10,14,20,.72);color:#f6f2e6;font:600 12px system-ui,sans-serif;padding:5px 12px;border-radius:10px;pointer-events:none;transition:opacity .5s;white-space:nowrap';
      document.body.appendChild(ui);
    }
    ui.textContent = t;
  }
  function hideUI(msg) {
    if (!ui) return;
    if (msg) ui.textContent = msg;
    ui.style.opacity = '0'; const u = ui; ui = null; setTimeout(() => u.remove(), 700);
  }

  // ---------- 유틸: 양자화(정수) 속성 → Float32 ----------
  function floatAttr(a, n) {
    const out = new Float32Array(a.count * n), g = ['getX', 'getY', 'getZ', 'getW'];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = a[g[k]](i);
    return new THREE.BufferAttribute(out, n);
  }
  function plainGeo(src, withSkin) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', floatAttr(src.attributes.position, 3));
    g.setAttribute('normal', src.attributes.normal ? floatAttr(src.attributes.normal, 3) : floatAttr(src.attributes.position, 3));
    g.setAttribute('uv', src.attributes.uv ? floatAttr(src.attributes.uv, 2) : new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
    if (withSkin) {
      const si = src.attributes.skinIndex, sw = src.attributes.skinWeight, n = src.attributes.position.count;
      const I = new Uint16Array(n * 4), Wt = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { I[i * 4] = si.getX(i); I[i * 4 + 1] = si.getY(i); I[i * 4 + 2] = si.getZ(i); I[i * 4 + 3] = si.getW(i); Wt[i * 4] = sw.getX(i); Wt[i * 4 + 1] = sw.getY(i); Wt[i * 4 + 2] = sw.getZ(i); Wt[i * 4 + 3] = sw.getW(i); }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(I, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(Wt, 4));
    }
    if (src.index) g.setIndex(Array.from(src.index.array));
    else { const n = src.attributes.position.count, idx = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); }
    return g;
  }
  const merge = list => {
    const ok = list.filter(Boolean);
    if (!ok.length) return null;
    const g = ok.length === 1 ? ok[0] : THREE.BufferGeometryUtils.mergeBufferGeometries(ok, false);
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  };

  // ---------- 정적 모델 ----------
  const tm = new THREE.Matrix4(), tinv = new THREE.Matrix4();
  function ingestProps(gltf) {
    const root = gltf.scene; root.updateMatrixWorld(true);
    let map = null;
    for (const node of root.children) {
      tinv.copy(node.matrixWorld).invert();
      const parts = [];
      node.traverse(o => {
        if (!o.isMesh) return;
        if (!map && o.material && o.material.map) map = o.material.map;
        const g = plainGeo(o.geometry, false);
        tm.multiplyMatrices(tinv, o.matrixWorld); g.applyMatrix4(tm);
        parts.push(g);
      });
      const g = merge(parts);
      if (g) geos.set(node.name, g);
    }
    if (map) { map.anisotropy = Math.min(4, R3D.maxAniso || 1); map.encoding = THREE.sRGBEncoding; map.needsUpdate = true; }
    A.atlas = map;
    A.mat = new THREE.MeshLambertMaterial({ map });
    // 밤 창문: 아틀라스에서 창문 칸(어두운 회색 칸)만 골라 따뜻하게 빛나게. 켜진 창 비율 = R3D.uWinLit (시대·인구)
    if (R3D.uWin) {
      let cell = [3, 0]; // [열, 행] (8×4 칸)
      const mq = /[?&]wincell=(\d),(\d)/.exec(location.search); if (mq) cell = [+mq[1], +mq[2]];
      const wc = new THREE.Vector4(cell[0] / 8 + 0.004, cell[1] / 4 + 0.004, (cell[0] + 1) / 8 - 0.004, (cell[1] + 1) / 4 - 0.004);
      A.mat.onBeforeCompile = sh => {
        sh.uniforms.uWin = R3D.uWin; sh.uniforms.uWinLit = R3D.uWinLit; sh.uniforms.uWinCell = { value: wc };
        sh.vertexShader = 'varying vec3 vWP2;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWP2 = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = 'uniform float uWin, uWinLit;\nuniform vec4 uWinCell;\nvarying vec3 vWP2;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uWin > 0.0 && vUv.x > uWinCell.x && vUv.x < uWinCell.z && vUv.y > uWinCell.y && vUv.y < uWinCell.w) {
    float h = fract(sin(dot(floor(vWP2 * 2.5), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    if (h < uWinLit) totalEmissiveRadiance += vec3(1.0, 0.5, 0.17) * uWin * (0.7 + 0.6 * fract(h * 7.0));
  }`);
      };
      A.mat.customProgramCacheKey = () => 'a3dprops';
    }
    A.ready = true; A.ver++;
  }
  A.geo = k => geos.get(k) || null;
  // 여러 모델을 배치해 한 지오메트리로: parts = [[key, x, y, z, rotY, scale(수 또는 [sx,sy,sz])], ...]
  const e3 = new THREE.Euler(), q3 = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  function compose(parts) {
    const list = [];
    for (const [k, x, y, z, ry, s] of parts) {
      const src = geos.get(k); if (!src) continue;
      const g = src.clone();
      e3.set(0, ry || 0, 0); q3.setFromEuler(e3); p3.set(x || 0, y || 0, z || 0);
      if (Array.isArray(s)) s3.set(s[0], s[1], s[2]); else s3.setScalar(s || 1);
      tm.compose(p3, q3, s3); g.applyMatrix4(tm); list.push(g);
    }
    return merge(list);
  }
  // 모델을 폭(가로·세로 중 큰 쪽) w 에 맞게 + 바닥 y=0
  function fit(k, w, extra) {
    const g = geos.get(k); if (!g) return 1;
    const b = g.boundingBox, sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
    return w / Math.max(sx, sz) * (extra || 1);
  }
  const topOf = g => g ? g.boundingBox.max.y : 1;
  A.building = type => {
    if (!A.ready) return null;
    return cached('b|' + type, () => {
      let g = null;
      switch (type) {
        case 'house': g = compose([['building_home_A_blue', 0, 0, 0, 0, fit('building_home_A_blue', 0.95)]]); break;
        case 'house2': g = compose([['building_home_B_blue', 0, 0, 0, 0, fit('building_home_B_blue', 0.98)]]); break;
        case 'farm': g = compose([
          ['building_grain', 0, 0, 0, 0, fit('building_grain', 1.12)],
          ['building_windmill_blue', 0.26, 0, -0.24, -0.4, fit('building_windmill_blue', 0.5)],
          ['sack', -0.3, 0.05, 0.33, 0.6, 1.1], ['wheelbarrow', 0.33, 0.05, 0.3, -0.9, 0.9],
        ]); break;
        case 'school': g = compose([ // 학당: 작은 강당 + 과녁(활쏘기 수업) + 짐
          ['building_tavern_blue', 0, 0, -0.05, 0, fit('building_tavern_blue', 0.92)],
          ['sack', 0.36, 0.02, 0.36, 0.4, 0.9], ['crate_open', -0.36, 0.02, 0.36, -0.3, 0.8],
        ]); break;
        case 'tower': g = compose([['building_tower_A_blue', 0, 0, 0, 0, fit('building_tower_A_blue', 0.95)]]); break;
        case 'market': g = compose([['building_market_blue', 0, 0, 0, 0, fit('building_market_blue', 1.08)]]); break;
        case 'lumber': g = compose([
          ['building_lumbermill_blue', 0, 0, 0, 0, fit('building_lumbermill_blue', 1.0)],
          ['resource_lumber', 0.32, 0.02, 0.36, 0.3, 0.9],
        ]); break;
        case 'quarry': g = compose([
          ['rock_single_E', -0.08, 0, -0.12, 0.4, fit('rock_single_E', 0.85)],
          ['rock_single_C', 0.33, 0, -0.3, 1.2, fit('rock_single_C', 0.4)],
          ['resource_stone', -0.22, 0.02, 0.3, 0.2, 1.0],
          ['wheelbarrow', 0.3, 0.02, 0.24, -0.7, 0.9],
          ['crate_A_big', 0.38, 0.02, -0.02, 0.3, 0.9],
        ]); break;
        case 'mine': g = compose([['building_mine_blue', 0, 0, 0, 0, fit('building_mine_blue', 1.02)]]); break;
      }
      return g ? { geo: g, top: topOf(g) } : null;
    });
  };
  A.castle = lv => {
    if (!A.ready) return null;
    return cached('castle|' + lv, () => {
      const P = [];
      let main, flag;
      const wall = (x, z, ry, s) => P.push(['wall_straight', x, 0, z, ry, s]);
      if (lv <= 1) {
        main = 'building_home_B_blue';
        P.push([main, 0, 0, -0.1, 0, fit(main, 1.4)], ['building_well_blue', 0.85, 0, 0.55, 0, fit('building_well_blue', 0.42)],
          ['barrel', -0.75, 0, 0.6, 0, 1.3], ['crate_A_big', -0.95, 0, 0.35, 0.4, 1.3]);
        for (const [x, z, r] of [[-1.05, -0.3, Math.PI / 2], [-1.05, -0.85, Math.PI / 2], [1.05, -0.3, Math.PI / 2], [1.05, -0.85, Math.PI / 2]]) P.push(['fence_wood_straight', x, 0, z, r, 1.5]);
        flag = [0.55, 1.65, -0.3];
      } else if (lv === 2) {
        main = 'building_tavern_blue';
        P.push([main, 0, 0, -0.15, 0, fit(main, 1.55)], ['building_well_blue', 0.95, 0, 0.6, 0, fit('building_well_blue', 0.42)],
          ['barrel', -0.85, 0, 0.7, 0, 1.3], ['sack', -1.0, 0, 0.45, 0.4, 1.4]);
        for (const [x, z, r] of [[-1.15, -0.2, Math.PI / 2], [-1.15, -0.8, Math.PI / 2], [1.15, -0.2, Math.PI / 2], [1.15, -0.8, Math.PI / 2], [-0.6, -1.15, 0], [0.6, -1.15, 0]]) P.push(['fence_wood_straight', x, 0, z, r, 1.5]);
        flag = [0.6, 2.0, -0.3];
      } else if (lv === 3) {
        main = 'building_barracks_blue';
        P.push([main, 0, 0, -0.1, 0, fit(main, 1.85)], ['building_well_blue', 1.05, 0, 0.75, 0, fit('building_well_blue', 0.4)], ['weaponrack', -1.0, 0, 0.75, 0.3, 1.5], ['target', -1.2, 0, 0.35, 0.6, 1.5]);
        flag = [0, 2.05, -0.2];
      } else {
        main = 'building_castle_blue';
        const ks = lv === 4 ? 1.75 : 2.0, h = lv === 4 ? 1.12 : 1.15;
        P.push([main, 0, 0, -0.15, 0, fit(main, ks)]);
        const ws = fit('wall_straight', 1.0) * 1.0, R = lv === 4 ? 1.25 : 1.35;
        // 성벽: 앞쪽은 성문, 나머지 세 면은 벽
        P.push(['wall_straight_gate', 0, 0, R, 0, fit('wall_straight_gate', 0.95)]);
        for (const s of [-1, 1]) { wall(s * 0.85, R, 0, ws * 0.75); wall(s * R, 0.42, Math.PI / 2, ws * 0.95); wall(s * R, -0.55, Math.PI / 2, ws * 0.95); wall(s * 0.5, -R, 0, ws * 0.95); }
        if (lv >= 5) for (const [x, z] of [[-R, R], [R, R], [-R, -R], [R, -R]]) P.push(['building_tower_B_blue', x, 0, z, 0, fit('building_tower_B_blue', 0.62)]);
        else for (const [x, z] of [[-R, R], [R, R], [-R, -R], [R, -R]]) P.push(['wall_corner_A_outside', x, 0, z, 0, fit('wall_corner_A_outside', 0.4)]);
        flag = [0, 1, 0]; void h;
      }
      const g = compose(P);
      if (!g) return null;
      const top = topOf(g);
      if (lv >= 4) flag = [0.03, top + 0.05, -0.15];
      return { geo: g, top, flag };
    });
  };
  A.campProps = () => A.ready ? cached('camp', () => compose([
    ['weaponrack', -0.55, 0, 0.35, 0.5, 1.6], ['crate_A_big', 0.45, 0, -0.45, 0.3, 1.5], ['crate_open', 0.62, 0, -0.18, -0.4, 1.4],
    ['barrel', 0.2, 0, -0.62, 0, 1.5], ['sack', -0.62, 0, -0.05, 0.9, 1.6], ['flag_red', -0.5, 0, -0.55, 0.2, 2.2],
  ])) : null;
  // 숲·바위 (InstancedMesh). 절차적 모델과 비슷한 크기로 맞춘다
  A.prop = k => {
    if (!A.ready) return null;
    return cached('prop|' + k, () => {
      const one = (key, w, ry) => compose([[key, 0, 0, 0, ry || 0, fit(key, w)]]);
      switch (k) {
        case 'pine': return one('tree_single_A', 0.5);
        case 'round': return one('tree_single_B', 0.6);
        case 'fruit': return one('tree_single_B', 0.6);
        case 'rock': return compose([['rock_single_E', 0, 0, 0, 0, fit('rock_single_E', 0.42)]]);
      }
      return null;
    });
  };

  // ---------- 캐릭터 ----------
  // 같은 리그(KayKit Adventurers): 애니메이션은 knight.glb 에만 있고 모두 공유
  const CH = {}; // name → { geoAll: {meshName: geo}, skin parts, template info }
  const CLIP = { idle: 'Idle', run: 'Running_A', walk: 'Walking_A', atk: '1H_Melee_Attack_Slice_Diagonal', atk2: '2H_Melee_Attack_Slice', spin: '2H_Melee_Attack_Spin', sit: 'Sit_Chair_Idle', die: 'Death_A' };
  let clips = null;
  // 원거리 자세 (anims_ranged.glb: KayKit 원본 Knight 의 조준/사격/던지기 클립만 뽑은 것, 같은 리그)
  const RCLIP = { aim1: '1H_Ranged_Aiming', shoot1: '1H_Ranged_Shoot', aim2: '2H_Ranged_Aiming', shoot2: '2H_Ranged_Shoot', throw: 'Throw' };
  const rclips = {};
  function ingestAnims(gltf) { for (const k in RCLIP) { const c = THREE.AnimationClip.findByName(gltf.animations, RCLIP[k]); if (c) rclips[k] = c; } }
  const mb = new THREE.Matrix4(), mbi = new THREE.Matrix4(), mbone = new THREE.Matrix4();
  const wq = new THREE.Quaternion(), W_FWD = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));
  const qE = (x, y) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, 0));
  const W_UP = { spear: qE(0.12, 0), pike: qE(0.08, 0), musket: qE(-0.25, 0), bow: qE(0, 0) }; // 몸 기준 세운 각도 (+x = 앞으로 기울임)
  // gltf → 템플릿: 뼈대 + 부위별 지오메트리(모두 같은 스켈레톤에 스키닝)
  function ingestChar(name, gltf) {
    const scene = gltf.scene; scene.updateMatrixWorld(true);
    const skinned = [], rigid = [];
    scene.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); else if (o.isMesh) rigid.push(o); });
    if (!skinned.length) throw new Error('no skin ' + name);
    const base = skinned[0], sk = base.skeleton, bones = sk.bones;
    mbi.copy(base.bindMatrix).invert();
    const parts = {};
    let map = null;
    for (const m of skinned) {
      const g = plainGeo(m.geometry, true);
      // 부위마다 양자화 범위가 달라 스킨(boneInverses)도 따로다: IBM_m = IBM_base · X 이므로
      // v' = bind_base⁻¹ · X · bind_m · v 로 기준 부위의 바인드 공간에 옮긴다
      if (m !== base) {
        mbone.copy(sk.boneInverses[0]).invert().multiply(m.skeleton.boneInverses[0]);
        mb.multiplyMatrices(mbi, mbone).multiply(m.bindMatrix); g.applyMatrix4(mb);
      }
      parts[m.name] = { geo: g, skin: true };
      if (!map && m.material.map) map = m.material.map;
    }
    sk.update(); // boneMatrices (rest pose)
    for (const m of rigid) {
      let b = m.parent, j = -1;
      while (b && (j = bones.indexOf(b)) < 0) b = b.parent;
      if (j < 0) continue;
      // p = bindMatrix⁻¹ · (bone.world · boneInverse)⁻¹ · mesh.world · v
      mbone.multiplyMatrices(bones[j].matrixWorld, sk.boneInverses[j]).invert();
      mb.multiplyMatrices(mbi, mbone).multiply(m.matrixWorld);
      const g = plainGeo(m.geometry, false); g.applyMatrix4(mb);
      const n = g.attributes.position.count, I = new Uint16Array(n * 4), Wt = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { I[i * 4] = j; Wt[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(I, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(Wt, 4));
      // 사실적 인물(real/chars)에 옮겨 달 무기·방패용: 손 슬롯 뼈 기준 지오메트리
      const gl = plainGeo(m.geometry, false); gl.applyMatrix4(mbone.copy(bones[j].matrixWorld).invert().multiply(m.matrixWorld));
      parts[m.name] = { geo: g, skin: false, local: gl, bone: bones[j].name };
    }
    // 템플릿 루트: 원래 메시는 떼어내고 뼈대만 남긴다
    for (const m of [...skinned, ...rigid]) m.parent.remove(m);
    const holder = base; // 바인드 정보만 쓴다
    CH[name] = { scene, parts, skeleton: sk, bindMatrix: base.bindMatrix.clone(), holderParent: null, map, geoCache: new Map(), texCache: new Map(), holder };
    if (gltf.animations && gltf.animations.length && !clips) {
      clips = {};
      for (const k in CLIP) { const c = THREE.AnimationClip.findByName(gltf.animations, CLIP[k]); if (c) clips[k] = c; }
    }
    // 몸 높이(무기 제외) → 1 단위로 맞출 배율
    const body = Object.values(parts).filter(p => p.skin).map(p => p.geo);
    const bb = new THREE.Box3(); for (const g of body) { g.computeBoundingBox(); bb.union(g.boundingBox); }
    CH[name].norm = 1 / Math.max(0.1, bb.max.y - bb.min.y);
    CH[name].baseY = -bb.min.y;
    if (name === 'knight') addCrown(CH[name]);
  }
  // 영주의 금관: 머리 뼈에 붙인 작은 왕관 (아틀라스의 금색 칸 UV를 쓴다)
  function addCrown(C) {
    const head = C.parts.Knight_Head; if (!head || !C.map || !C.map.image) return;
    const bones = C.skeleton.bones;
    const hj = bones.findIndex(b => /^head$/i.test(b.name)); if (hj < 0) return;
    // 금색 픽셀 찾기
    const img = C.map.image, cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let best = -1, bu = 0.5, bv = 0.5;
    for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) {
      const i = (y * cv.width + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
      const sc = (r > 200 && gg > 140 && gg < 225 && b < 110) ? r + gg - b * 2 : -1;
      if (sc > best) { best = sc; bu = (x + 0.5) / cv.width; bv = (y + 0.5) / cv.height; }
    }
    if (best < 0) return;
    head.geo.computeBoundingBox();
    const hb = head.geo.boundingBox, cx = (hb.min.x + hb.max.x) / 2, cz = (hb.min.z + hb.max.z) / 2, H = hb.max.y - hb.min.y;
    const r = (hb.max.x - hb.min.x) * 0.3, top = hb.max.y - H * 0.06;
    const P = [{ g: new THREE.CylinderGeometry(r, r * 1.04, H * 0.16, 10, 1, true), p: [cx, top, cz] }];
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; P.push({ g: new THREE.ConeGeometry(r * 0.22, H * 0.2, 4), p: [cx + Math.sin(a) * r * 0.95, top + H * 0.16, cz + Math.cos(a) * r * 0.95] }); }
    const geo = R3D.merge(P.map(q => ({ g: q.g, c: '#ffffff', p: q.p })));
    const n = geo.attributes.position.count;
    const uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { uv[i * 2] = bu; uv[i * 2 + 1] = bv; }
    const I = new Uint16Array(n * 4), Wt = new Float32Array(n * 4); for (let i = 0; i < n; i++) { I[i * 4] = hj; Wt[i * 4] = 1; }
    // 머리 스킨은 머리뼈 하나에 묶여 있으니 같은 공간(바인드 공간)에 두면 된다
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', geo.attributes.position); out.setAttribute('normal', geo.attributes.normal);
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('skinIndex', new THREE.BufferAttribute(I, 4)); out.setAttribute('skinWeight', new THREE.BufferAttribute(Wt, 4));
    const idx = []; for (let i = 0; i < n; i++) idx.push(i); out.setIndex(idx);
    C.parts.Crown = { geo: out, skin: false };
  }
  // 캐릭터별 표시 부위
  const BODY = {
    knight: ['Knight_ArmLeft', 'Knight_ArmRight', 'Knight_Body', 'Knight_Head', 'Knight_LegLeft', 'Knight_LegRight'],
    barbarian: ['Barbarian_ArmLeft', 'Barbarian_ArmRight', 'Barbarian_Body', 'Barbarian_Head', 'Barbarian_LegLeft', 'Barbarian_LegRight'],
    rogue: ['Rogue_ArmLeft', 'Rogue_ArmRight', 'Rogue_Body', 'Rogue_Head_Hooded', 'Rogue_LegLeft', 'Rogue_LegRight'],
    villager: ['Rogue_ArmLeft', 'Rogue_ArmRight', 'Rogue_Body', 'Rogue_Head', 'Rogue_LegLeft', 'Rogue_LegRight'],
  };
  // look → 어떤 캐릭터/부위/색
  function plan(look) {
    const o = look || {};
    const lo = !!o.lod;
    // 시대별 차림(kit): chief = 부족 족장, tribe = 부족 전사, knight = 중세 이후 기사 (era.js)
    const two = o.weapon === 'glaive';
    // 병종 차림 (tech.js unitLook): ranged = 두건 궁수/투석병, spear = 창·장창병, gunner = 석궁/머스킷병. prop = 손에 붙일 절차적 무기
    if (o.kit === 'ranged') return { ch: 'rogue_lo', body: 'rogue', extra: ['Rogue_Cape'], tint: o.body, mode: 'green', atk: 'atk', prop: o.weapon, rng: o.weapon === 'sling' ? 't' : '1' };
    if (o.kit === 'spear') return { ch: lo ? 'knight_lo' : 'knight', body: 'knight', extra: ['Knight_Helmet', ...(o.weapon === 'pike' ? [] : ['Badge_Shield'])], tint: o.body, mode: 'armor', atk: 'atk', prop: o.weapon };
    if (o.kit === 'gunner') return { ch: lo ? 'knight_lo' : 'knight', body: 'knight', extra: o.hat === 'helm' ? ['Knight_Helmet'] : [], tint: o.body, mode: 'armor', atk: 'atk', prop: o.weapon, rng: '2' };
    if (o.kit === 'chief') return { ch: 'barbarian', body: 'barbarian', extra: ['Barbarian_Hat', 'Barbarian_Cape', '2H_Axe'], tint: o.tint || null, mode: 'armor', atk: 'atk2', k: 1.18 };
    if (o.kit === 'tribe') return { ch: lo ? 'barbarian_lo' : 'barbarian', body: 'barbarian', extra: two ? ['Barbarian_Hat', 'Barbarian_Cape', '2H_Axe'] : o.armor ? ['Barbarian_Hat', 'Barbarian_Cape', '1H_Axe', 'Barbarian_Round_Shield'] : ['1H_Axe'], tint: o.body, mode: 'armor', atk: two ? 'atk2' : 'atk' };
    if (o.kit === 'knight') return { ch: lo ? 'knight_lo' : 'knight', body: 'knight', extra: ['Knight_Helmet', ...(o.cape ? ['Knight_Cape'] : []), two ? '2H_Sword' : '1H_Sword', ...(two ? [] : ['Badge_Shield'])], tint: o.body, mode: 'armor', atk: two ? 'atk2' : 'atk' };
    if (o.hat === 'crown') return { ch: 'knight', extra: ['Crown', 'Knight_Cape', two ? '2H_Sword' : '1H_Sword', ...(two ? [] : ['Badge_Shield'])], tint: o.tint || null, mode: o.tint ? 'armor' : 'hero', atk: two ? 'atk2' : 'atk', k: 1.18 };
    if (o.hat === 'hood') return { ch: 'rogue_lo', body: 'rogue', extra: ['Rogue_Cape', 'Knife', 'Knife_Offhand'], tint: o.tint || o.body, mode: 'green', atk: 'atk' };
    if (o.hat === 'horned' || (o.hat === 'helm' && o.armor)) {
      const two = o.weapon === 'glaive';
      return { ch: lo ? 'barbarian_lo' : 'barbarian', body: 'barbarian', extra: two ? ['Barbarian_Hat', 'Barbarian_Cape', '2H_Axe'] : ['Barbarian_Hat', 'Barbarian_Cape', '1H_Axe', 'Barbarian_Round_Shield'], tint: o.body, mode: 'armor', atk: two ? 'atk2' : 'atk' };
    }
    if (o.hat === 'helm') return { ch: lo ? 'knight_lo' : 'knight', body: 'knight', extra: ['Knight_Helmet', '1H_Sword', 'Badge_Shield'], tint: o.body, mode: 'armor', atk: 'atk' };
    if (!o.weapon) return { ch: 'villager_lo', body: 'villager', extra: [], tint: o.body, mode: 'green', atk: 'atk' };
    return { ch: lo ? 'knight_lo' : 'knight', body: 'knight', extra: ['Knight_Helmet', '1H_Sword', 'Badge_Shield'], tint: o.body, mode: 'armor', atk: 'atk' };
  }
  // 텍스처 색 바꾸기: armor = 무채색(갑옷/천) 부분을 진영색으로, green = 초록 옷/두건을 지정색으로
  const cA = new THREE.Color();
  function tintTex(chName, tint, mode) {
    const C = CH[chName];
    const key = (tint || '-') + mode;
    let t = C.texCache.get(key);
    if (t) return t;
    if (!tint || !C.map || !C.map.image) { C.texCache.set(key, C.map); return C.map; }
    const img = C.map.image, w = img.width, h = img.height;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h), p = d.data;
    cA.set(tint);
    // sRGB 0..255 목표색 (ColorManagement 켜져 있으면 cA 는 선형 → getStyle 로 sRGB 얻기 대신 직접 변환)
    const tr = Math.round(Math.pow(cA.r, 1 / 2.2) * 255), tg = Math.round(Math.pow(cA.g, 1 / 2.2) * 255), tb = Math.round(Math.pow(cA.b, 1 / 2.2) * 255);
    const legacy = THREE.ColorManagement && THREE.ColorManagement.legacyMode;
    const R0 = legacy ? Math.round(cA.r * 255) : tr, G0 = legacy ? Math.round(cA.g * 255) : tg, B0 = legacy ? Math.round(cA.b * 255) : tb;
    const tl = (0.3 * R0 + 0.59 * G0 + 0.11 * B0) / 255 || 0.01;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], gg = p[i + 1], b = p[i + 2];
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0, lum = (0.3 * r + 0.59 * gg + 0.11 * b) / 255;
      let hit = false;
      if (mode === 'armor') hit = sat < 0.16 && lum > 0.42 || (b > r * 1.12 && b > gg * 0.98 && sat > 0.2);
      else if (mode === 'green') hit = gg > r * 1.15 && gg >= b * 0.95 && sat > 0.25;
      else if (mode === 'blue') hit = b > r * 1.12 && b > gg * 0.98 && sat > 0.2; // 방패 색칠만 (칼날은 그대로)
      if (!hit) continue;
      const k = Math.min(1.6, lum / Math.max(0.25, tl)) * (mode === 'armor' ? 0.85 : 0.95), mix = mode === 'armor' ? 0.62 : 0.9;
      p[i] = r + (Math.min(255, R0 * k) - r) * mix; p[i + 1] = gg + (Math.min(255, G0 * k) - gg) * mix; p[i + 2] = b + (Math.min(255, B0 * k) - b) * mix;
    }
    g.putImageData(d, 0, 0);
    t = new THREE.CanvasTexture(cv); t.flipY = false; t.encoding = THREE.sRGBEncoding; t.anisotropy = 2;
    C.texCache.set(key, t);
    return t;
  }
  // 캐릭터 재질: Lambert + 테두리 빛(rim) 살짝
  const matCache = new Map();
  function charMat(tex) {
    let m = matCache.get(tex);
    if (m) return m;
    m = new THREE.MeshLambertMaterial({ map: tex });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vRim;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  { vec3 nv = normalize(normalMatrix * objectNormal); vec3 vd = normalize(-mvPosition.xyz); vRim = pow(1.0 - clamp(dot(nv, vd), 0.0, 1.0), 2.5); }');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRim;')
        .replace('#include <output_fragment>', 'outgoingLight += uRim * vRim * (0.4 + 0.6 * diffuseColor.rgb);\n#include <output_fragment>');
      sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader;
      sh.uniforms.uRim = R3D.uRim || { value: new THREE.Color(0.28, 0.26, 0.22) }; // 테두리 빛 (밤엔 푸르고 약하게)
    };
    m.customProgramCacheKey = () => 'a3dchar';
    matCache.set(tex, m);
    return m;
  }
  function charGeo(ch, list) {
    const C = CH[ch];
    const key = list.join(',');
    let g = C.geoCache.get(key);
    if (g === undefined) { g = merge(list.map(n => C.parts[n] && C.parts[n].geo).filter(Boolean)); C.geoCache.set(key, g); }
    return g;
  }
  // ---------- 사실적 인물 (assets/real/chars) ----------
  // 메시+뼈대만 있고, 애니메이션은 KayKit 클립을 옮겨 쓴다 (뼈 이름·쉬는 자세 회전이 같음 → 회전 트랙 그대로, 엉덩이 위치만 키에 맞춰 늘림)
  // 준비 안 됐거나 실패하면 KayKit 그대로. ?noreal 이면 안 불러온다
  const RNAMES = ['ruler_tribal', 'ruler_king', 'ruler_emperor', 'soldier_spear', 'soldier_archer', 'soldier_sword', 'villager'];
  const R_H = 1.72;                 // 사실적 몸 기준 키(m) → KayKit 과 같은 화면 키(1.2 단위 × scale)로 맞춤
  const R_K = 0.64;                 // KayKit(큰 머리) 화면 키의 약 1.15배 — 사실적 비율은 가늘어서 조금 크게 둔다
  const R_WS = 0.48;                // KayKit 무기(손 슬롯 기준, 한손검 1.78) → 사실적 크기(약 0.85m)
  const HIPS_SCALE = 2.2186, HIPS_OFFSET_Z = -0.0247;
  const R_ARM = 0.32;               // 팔 내림 각(rad)
  const RCK = n => 'r_' + n;
  const hasReal = n => A.realChars && !!CH[RCK(n)];
  // 진영색: 아군(파랑)과 헷갈리지 않게 적은 파랑·청록 계열을 보라 쪽으로 돌리고, 채도·밝기를 읽히는 범위로
  const teamCache = new Map();
  const hex2 = v => ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2);
  function foeTint(c) {
    if (!c) return '#a8352a';
    let t = teamCache.get(c); if (t) return t;
    let x = c.replace('#', ''); if (x.length === 3) x = x.split('').map(ch => ch + ch).join('');
    if (!/^[0-9a-f]{6}$/i.test(x)) x = new THREE.Color(c).getHexString();
    const r = parseInt(x.slice(0, 2), 16) / 255, g = parseInt(x.slice(2, 4), 16) / 255, b = parseInt(x.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l0 = (mx + mn) / 2, d = mx - mn;
    const s0 = d ? d / (1 - Math.abs(2 * l0 - 1)) : 0;
    let h = !d ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    if (s0 < 0.2) h = 4;                      // 회색·검정 진영 → 붉은 계열
    else if (h > 170 && h < 260) h = 278;     // 파랑·청록 진영 → 보라 (아군 파랑과 구분)
    const S_ = Math.max(0.58, Math.min(0.8, s0)), L_ = Math.max(0.36, Math.min(0.46, l0));
    // HSL → RGB (sRGB)
    const C = (1 - Math.abs(2 * L_ - 1)) * S_, X = C * (1 - Math.abs((h / 60) % 2 - 1)), m = L_ - C / 2;
    const [r1, g1, b1] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
    t = '#' + hex2((r1 + m) * 255) + hex2((g1 + m) * 255) + hex2((b1 + m) * 255);
    teamCache.set(c, t);
    return t;
  }
  // 무기: KayKit 무기 메시(손 슬롯에 붙음) 이름과 그걸 가진 캐릭터
  const KW = { '1H_Sword': 'knight', '2H_Sword': 'knight', 'Badge_Shield': 'knight', '1H_Axe': 'barbarian', '2H_Axe': 'barbarian', 'Barbarian_Round_Shield': 'barbarian' };
  // look → 사실적 몸/색/무기. 해당 없으면 null (→ KayKit)
  function realPlan(o) {
    if (!A.realChars || o.noreal) return null;
    const role = o.role, era = o.era | 0, ut = o.ut, foe = o.side === 'foe' || role === 'grunt' || role === 'officer' || role === 'boss';
    let rc = null, tint = null, mode = null, w = [], prop = null, rng = null, atk = 'atk', k = 1;
    const melee = wp => {
      if (wp === 'spear' || wp === 'pike') { rc = 'soldier_spear'; prop = wp; }
      else if (wp === 'glaive') { rc = 'soldier_sword'; w = ['2H_Sword']; atk = 'atk2'; }
      else if (wp === 'axe' || wp === 'club') { rc = 'soldier_sword'; w = ['1H_Axe']; }
      else { rc = 'soldier_sword'; w = ['1H_Sword', 'Badge_Shield']; }
    };
    if (role === 'player') {
      if (era <= 0) { rc = 'ruler_tribal'; w = ['2H_Axe']; atk = 'atk2'; }
      else if (era === 1) { rc = 'ruler_king'; tint = '#b07a2a'; mode = 'red'; prop = 'spear'; }
      else if (era === 2) { rc = 'ruler_king'; w = ['1H_Sword', 'Badge_Shield']; }
      else { rc = 'ruler_emperor'; w = ['2H_Sword']; atk = 'atk2'; }
      k = 1.08;
    } else if (role === 'villager') { rc = 'villager'; tint = o.body || null; mode = 'beige'; }
    else if (role === 'officer' || role === 'boss') {
      const boss = role === 'boss';
      rc = era <= 0 ? 'ruler_tribal' : boss && era >= 2 ? 'ruler_emperor' : 'ruler_king';
      tint = foeTint(o.body); mode = rc === 'ruler_tribal' ? 'fur' : rc === 'ruler_king' ? 'red' : 'purple';
      if (o.weapon === 'glaive') { w = [era <= 0 ? '2H_Axe' : '2H_Sword']; atk = 'atk2'; }
      else if (o.weapon === 'axe') w = ['1H_Axe', 'Barbarian_Round_Shield'];
      else w = ['1H_Sword', 'Badge_Shield'];
      k = 1.08;
    } else if (ut) {
      switch (ut) {
        case 'sling': rc = 'soldier_archer'; prop = 'sling'; rng = 't'; break;
        case 'archer': rc = 'soldier_archer'; prop = 'bow'; rng = '1'; break;
        case 'xbow': rc = 'soldier_archer'; prop = 'xbow'; rng = '2'; break;
        case 'musket': rc = 'soldier_archer'; prop = 'musket'; rng = '2'; break;
        case 'spear': case 'pike': case 'rider': rc = 'soldier_spear'; prop = ut === 'pike' ? 'pike' : 'spear'; break;
        case 'knight': rc = 'soldier_sword'; prop = 'spear'; break;
        case 'club': if (o.side === 'bandit') { rc = 'soldier_archer'; w = ['1H_Axe']; } else melee('club'); break;
        default: melee(o.weapon);
      }
    } else if (role === 'ally' || role === 'grunt') melee(o.weapon);
    else if (role === 'bandit') { rc = 'soldier_archer'; w = o.weapon === 'sword' ? ['1H_Sword'] : ['1H_Axe']; }
    else return null;
    if (!rc || !hasReal(rc)) return null;
    if (role !== 'player' && role !== 'villager' && role !== 'officer' && role !== 'boss') {
      tint = foe ? foeTint(o.body) : o.body || null;
      mode = rc === 'soldier_archer' ? 'green' : rc === 'soldier_sword' ? 'white' : 'beige';
    }
    w = w.filter(n => CH[KW[n]] && CH[KW[n]].parts[n]);
    return { rc, tint, mode, w, prop, rng, atk, k, lod: !!o.lod };
  }
  // 사실적 텍스처 색 바꾸기. 해당 부분의 평균 밝기를 목표색에 맞추고 명암은 살린다
  function realTex(rc, tint, mode) {
    const C = CH[RCK(rc)], key = (tint || '-') + mode;
    let t = C.texCache.get(key); if (t) return t;
    if (!tint || !mode || !C.map || !C.map.image) { C.texCache.set(key, C.map); return C.map; }
    const img = C.map.image, wd = img.width, ht = img.height;
    const cv = document.createElement('canvas'); cv.width = wd; cv.height = ht;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, wd, ht), p = d.data, n = p.length / 4, hit = new Uint8Array(n);
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      const r = p[i * 4], gg = p[i * 4 + 1], b = p[i * 4 + 2];
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0, lum = (0.3 * r + 0.59 * gg + 0.11 * b) / 255;
      let h = false;
      if (mode === 'beige') h = sat > 0.06 && sat < 0.42 && r - gg < 26 && gg > b && lum > 0.3;            // 베이지·올리브 천 (피부는 r-g 가 커서 빠짐)
      else if (mode === 'green') h = gg > r * 1.12 && gg >= b * 0.95 && sat > 0.22;
      else if (mode === 'white') h = sat < 0.1 && lum > 0.62;                                              // 흰 겉옷
      else if (mode === 'red') h = r > gg * 1.7 && r > b * 1.5 && sat > 0.45;                               // 붉은 망토·옷 (금색은 빠짐)
      else if (mode === 'purple') h = r > gg * 1.25 && b > gg * 1.35 && sat > 0.35;
      else if (mode === 'fur') h = sat > 0.25 && sat < 0.75 && r > b * 1.4 && r - gg > 8 && lum > 0.12 && lum < 0.5; // 갈색 가죽·털
      if (h) { hit[i] = 1; sum += lum; cnt++; }
    }
    if (cnt) {
      cA.set(tint);
      const legacy = THREE.ColorManagement && THREE.ColorManagement.legacyMode;
      const cv8 = v => legacy ? v * 255 : Math.pow(v, 1 / 2.2) * 255;
      const R0 = cv8(cA.r), G0 = cv8(cA.g), B0 = cv8(cA.b), tl = (0.3 * R0 + 0.59 * G0 + 0.11 * B0) / 255 || 0.01;
      const avg = sum / cnt, mix = mode === 'fur' ? 0.55 : 0.92;
      for (let i = 0; i < n; i++) {
        if (!hit[i]) continue;
        const r = p[i * 4], gg = p[i * 4 + 1], b = p[i * 4 + 2], lum = (0.3 * r + 0.59 * gg + 0.11 * b) / 255;
        const s = Math.min(1.8, Math.pow(lum / avg, 0.85)) * Math.min(1.35, Math.max(1, 0.16 / tl)); // 아주 어두운 목표색만 살짝 밝게
        p[i * 4] = r + (Math.min(255, R0 * s) - r) * mix; p[i * 4 + 1] = gg + (Math.min(255, G0 * s) - gg) * mix; p[i * 4 + 2] = b + (Math.min(255, B0 * s) - b) * mix;
      }
      g.putImageData(d, 0, 0);
    }
    t = new THREE.CanvasTexture(cv); t.flipY = false; t.encoding = THREE.sRGBEncoding; t.anisotropy = 2;
    C.texCache.set(key, t);
    return t;
  }
  // KayKit 클립 → 사실적 리그: 회전 그대로, 엉덩이 위치 ×HIPS_SCALE, 그 밖의 위치·크기·없는 뼈 트랙은 버림
  // 서 있기·뛰기는 팔 흔들림(윗팔)과 엉덩이 들썩임을 조금 줄인다 (사실적 비율에선 KayKit 동작이 과장돼 보임)
  let rclipSet = null; const rrclips = {};
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const qm = new THREE.Quaternion(), qd = new THREE.Quaternion(), ZAX = new THREE.Vector3(0, 0, 1);
  function retarget(clip, calm, drop, seat) {
    const C = CH[RCK(RNAMES.find(n => CH[RCK(n)]))];
    const names = new Set(C.skeleton.bones.map(b => b.name));
    const tracks = [];
    for (const t of clip.tracks) {
      const i = t.name.lastIndexOf('.'), node = t.name.slice(0, i), prop = t.name.slice(i + 1);
      if (!names.has(node)) continue;
      if (prop === 'quaternion') {
        const arm = /^upperarm\.?([lr])$/.exec(node);
        if (arm && (calm || drop)) {
          // calm: 클립 평균 자세 쪽으로 흔들림을 75%로 / drop: 가슴 기준 앞축(z)으로 팔을 몸 쪽으로 내림 (사실적 어깨는 좁아 KayKit 팔이 벌어져 보임)
          const v = t.values.slice();
          if (calm) {
            qm.set(0, 0, 0, 0);
            for (let j = 0; j < v.length; j += 4) { qa.fromArray(v, j); if (j && qa.dot(qm) < 0) { qa.x *= -1; qa.y *= -1; qa.z *= -1; qa.w *= -1; } qm.x += qa.x; qm.y += qa.y; qm.z += qa.z; qm.w += qa.w; }
            qm.normalize();
            for (let j = 0; j < v.length; j += 4) { qa.fromArray(v, j); qb.copy(qm).slerp(qa, 0.75); qb.toArray(v, j); }
          }
          if (drop) { qd.setFromAxisAngle(ZAX, arm[1] === 'l' ? -drop : drop); for (let j = 0; j < v.length; j += 4) { qa.fromArray(v, j); qa.premultiply(qd); qa.toArray(v, j); } }
          tracks.push(new THREE.QuaternionKeyframeTrack(t.name, t.times, v));
        } else tracks.push(t);
      } else if (prop === 'position' && node === 'hips') {
        const v = t.values.slice();
        let my = 0; for (let j = 1; j < v.length; j += 3) my += v[j]; my /= v.length / 3;
        for (let j = 0; j < v.length; j += 3) {
          const y = calm ? my + (v[j + 1] - my) * 0.6 : v[j + 1];
          v[j] *= HIPS_SCALE; v[j + 1] = y * HIPS_SCALE; v[j + 2] = v[j + 2] * HIPS_SCALE + HIPS_OFFSET_Z;
          if (seat) { v[j] = 0; v[j + 2] = HIPS_OFFSET_Z; } // 말 위: 의자용 엉덩이 뒤로 빼기를 없애 안장 한가운데에
        }
        tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times, v));
      }
    }
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }
  function realClips() {
    if (rclipSet) return rclipSet;
    rclipSet = {};
    for (const k in clips) { const loco = k === 'idle' || k === 'run' || k === 'walk'; rclipSet[k] = retarget(clips[k], loco, loco || k === 'sit' ? R_ARM : k === 'die' ? 0 : R_ARM * 0.4, k === 'sit'); }
    return rclipSet;
  }
  const realR = k => rrclips[k] || (rclips[k] ? (rrclips[k] = retarget(rclips[k], false)) : null);
  // 손 무기·방패: KayKit 무기 메시를 사실적 손 슬롯 뼈에 스키닝 (같은 스켈레톤 → 메시 1개, KayKit 아틀라스 재질)
  const mW = new THREE.Matrix4(), mWs = new THREE.Matrix4().makeScale(R_WS, R_WS, R_WS);
  function realWeaponGeo(rc, list, lod) {
    const C = CH[RCK(rc)], key = 'w|' + list.join(',') + (lod ? '|lo' : '');
    if (C.geoCache.has(key)) return C.geoCache.get(key);
    const bones = C.skeleton.bones, bmi = new THREE.Matrix4().copy(C.bindMatrix).invert(), out = [];
    for (const n of list) {
      const src = CH[KW[n] + (lod && CH[KW[n] + '_lo'] ? '_lo' : '')] || CH[KW[n]], P = src && src.parts[n];
      if (!P || !P.local) continue;
      const j = bones.findIndex(b => b.name === P.bone); if (j < 0) continue;
      const g = P.local.clone();
      mW.copy(C.skeleton.boneInverses[j]).invert().multiply(mWs); mW.premultiply(bmi); g.applyMatrix4(mW);
      const cnt = g.attributes.position.count, I = new Uint16Array(cnt * 4), Wt = new Float32Array(cnt * 4);
      for (let i = 0; i < cnt; i++) { I[i * 4] = j; Wt[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(I, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(Wt, 4));
      out.push(g);
    }
    const g = out.length ? merge(out) : null;
    C.geoCache.set(key, g);
    return g;
  }

  // 풀링 키 (같은 look 객체면 다시 계산하지 않는다)
  const keyMemo = new WeakMap();
  A._ch = CH; // 디버그용
  A.foeTint = foeTint; // 적 진영색 (battle3d 의 먼 KayKit 졸병도 같은 색으로)
  A.humanKey = look => {
    look = look || {};
    const m = keyMemo.get(look); if (m && m.v === A.ver) return m.k;
    const sc = look.scale || 1, rp = realPlan(look);
    let k;
    if (rp) k = 'R|' + rp.rc + '|' + rp.w.join(',') + '|' + (rp.tint || '') + '|' + sc + '|' + (rp.prop || '') + (rp.lod ? '|lo' : '');
    else { const p = plan(look); k = 'A|' + p.ch + '|' + p.extra.join(',') + '|' + (p.tint || '') + '|' + sc + (p.prop ? '|' + p.prop : ''); }
    keyMemo.set(look, { v: A.ver, k });
    return k;
  };
  A.human = look => {
    if (!A.chars || !clips) return null;
    look = look || {};
    const rp = realPlan(look);
    if (rp) {
      const C = CH[RCK(rp.rc)], geo = charGeo(RCK(rp.rc), Object.keys(C.parts).filter(n => C.parts[n].skin));
      if (geo) {
        const wg = rp.w.length ? realWeaponGeo(rp.rc, rp.w, rp.lod) : null;
        const wsrc = rp.w.length ? KW[rp.w[0]] : null;
        return rigHuman(look, {
          C, geo, mat: charMat(realTex(rp.rc, rp.tint, rp.mode)), clipSet: realClips(), getR: realR,
          wgeo: wg, wmat: wg ? charMat(tintTex(wsrc, rp.tint, 'blue')) : null,
          prop: rp.prop, rng: rp.rng, atk: rp.atk, k: rp.k * R_K, norm: 1 / R_H, sitDrop: 0.9 / R_H, real: true,
        });
      }
    }
    const pl = plan(look);
    const C = CH[pl.ch]; if (!C) return null;
    const bodyKey = pl.body || pl.ch;
    const geo = charGeo(pl.ch, [...BODY[bodyKey], ...pl.extra]); if (!geo) return null;
    return rigHuman(look, { C, geo, mat: charMat(tintTex(pl.ch, pl.tint, pl.mode)), clipSet: clips, getR: k => rclips[k], prop: pl.prop, rng: pl.rng, atk: pl.atk, k: pl.k || 1, norm: C.norm, sitDrop: 0.36 });
  };
  // 공용: 뼈대 복제 + 스킨 메시 + 손 무기 + 애니메이션 상태
  function rigHuman(look, Q) {
    const C = Q.C;
    const rig = THREE.SkeletonUtils.clone(C.scene);
    const bones = [];
    const names = C.skeleton.bones.map(b => b.name);
    const byName = new Map(); rig.traverse(o => { if (o.isBone || o.type === 'Bone' || o.type === 'Object3D') byName.set(o.name, o); });
    for (const n of names) bones.push(byName.get(n));
    if (bones.some(b => !b)) return null;
    const skel = new THREE.Skeleton(bones, C.skeleton.boneInverses.map(m => m.clone()));
    const mesh = new THREE.SkinnedMesh(Q.geo, Q.mat);
    mesh.frustumCulled = false; mesh.castShadow = !look.lod; mesh.receiveShadow = false;
    // 원래 스킨 메시가 붙어 있던 자리(보통 리그 루트 바로 아래)에 붙인다
    rig.add(mesh); mesh.bind(skel, C.bindMatrix);
    let wmesh = null;
    if (Q.wgeo) { wmesh = new THREE.SkinnedMesh(Q.wgeo, Q.wmat); wmesh.frustumCulled = false; wmesh.castShadow = !look.lod; rig.add(wmesh); wmesh.bind(skel, C.bindMatrix); }
    let wpn = null;
    if (Q.prop && R3D.weaponGeo) { // 손 뼈(handslot.r)에 절차적 무기 (활·석궁·머스킷·창·장창·투석끈)
      const pg = R3D.weaponGeo(Q.prop), hand = [...byName.values()].find(b => /^handslot\.?r$/i.test(b.name));
      if (pg && hand) {
        rig.updateMatrixWorld(true); const pm = new THREE.Mesh(pg, R3D.mats.vc); pm.castShadow = !look.lod;
        pm.scale.setScalar(0.62 / Q.norm / hand.getWorldScale(new THREE.Vector3()).x * (Q.prop === 'bow' ? 1.7 : 1) * (Q.real ? 0.8 : 1));
        // 겨누기·공격: KayKit 석궁과 같은 규약(손 슬롯 +X = 앞) → 무기 +Y(개머리→총구/창끝)를 앞으로, 석궁 활대는 가로
        const fwd = new THREE.Quaternion();
        if (Q.prop === 'bow') fwd.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); // 활대 세로, 앞면이 앞
        else if (Q.prop !== 'sling') fwd.setFromRotationMatrix(W_FWD);
        pm.quaternion.copy(fwd); hand.add(pm);
        // 서 있기·걷기·말 타기: 창·장창·머스킷·활은 손 방향과 상관없이 몸 기준으로 세워 든다 (손 뼈에 붙은 채 매 프레임 보정)
        const up = W_UP[Q.prop] || null;
        wpn = { pm, hand, fwd, up };
      }
    }
    const inner = new THREE.Group(); inner.add(rig);
    const k = Q.k * 1.2, y0 = C.baseY * Q.norm * k; // 1.2: 둥근 절차 모델과 비슷한 화면 크기
    inner.scale.setScalar(Q.norm * k); inner.position.y = y0;
    const group = new THREE.Group(); group.add(inner);
    const o = Object.assign({ scale: 1 }, look);
    group.scale.setScalar(o.scale || 1);
    const mixer = new THREE.AnimationMixer(rig);
    const act = {};
    for (const kk in Q.clipSet) { act[kk] = mixer.clipAction(Q.clipSet[kk]); }
    // 원거리 병종: 조준(반복) / 쏘기(한 번) — 클립이 없으면 근접 공격 자세로
    const rk = Q.rng && (Q.rng === 't' ? (Q.getR('throw') && 'throw') : (Q.getR('aim' + Q.rng) && Q.rng));
    if (rk === 'throw') act.shoot = mixer.clipAction(Q.getR('throw'));
    else if (rk) { act.aim = mixer.clipAction(Q.getR('aim' + rk)); act.shoot = mixer.clipAction(Q.getR('shoot' + rk)); }
    if (act.die) { act.die.setLoop(THREE.LoopOnce, 1); act.die.clampWhenFinished = true; }
    const atk = act[Q.atk] || act.atk;
    atk.setLoop(THREE.LoopRepeat, Infinity);
    let cur = null, last = performance.now(), fl = false;
    const go = (name, fade) => {
      if (cur === name) return;
      const next = name === 'atk' ? atk : act[name];
      const prev = cur ? (cur === 'atk' ? atk : act[cur]) : null;
      next.reset(); next.enabled = true; next.setEffectiveWeight(1); next.play();
      if (prev && fade > 0) prev.crossFadeTo(next, fade, false); else if (prev) prev.stop();
      cur = name;
    };
    const ATK_D = atk.getClip().duration;
    go('idle', 0);
    act.idle.time = Math.random() * act.idle.getClip().duration;
    const sitY = y0 - (Q.sitDrop * k);
    return {
      group, key: A.humanKey(look), look: o, asset: true, real: !!Q.real, mesh,
      pose(p) {
        const now = performance.now(); let dt = Math.min(0.1, (now - last) / 1000); last = now;
        let st;
        if (p.swing > 0 && act.shoot) st = p.aim && act.aim ? 'aim' : 'shoot';
        else if (p.swing > 0) st = 'atk';
        else if (p.sit) st = 'sit';
        else if (p.moving) st = p.slow && act.walk ? 'walk' : 'run'; // slow: 걷기 (마을 사람 · 3인칭 천천히)
        else st = 'idle';
        go(st, st === 'atk' || st === 'shoot' ? 0.06 : 0.16);
        inner.position.y = p.sit ? sitY : y0; // 앉은 자세: 엉덩이를 안장 높이(그룹 원점)에 맞춤
        if (st === 'atk') {
          const kk = 1 - Math.min(1, p.swing);
          atk.paused = false; atk.time = ATK_D * (0.22 + 0.5 * kk); atk.paused = true;
        } else if (st === 'shoot') { // 쏘는 순간(swing 1) → 끝(0)
          const D = act.shoot.getClip().duration, kk = 1 - Math.min(1, p.swing);
          act.shoot.paused = false; act.shoot.time = D * (0.15 + 0.8 * kk); act.shoot.paused = true;
        } else if (st === 'run') act.run.timeScale = 1.15;
        if (p.yaw !== undefined) group.rotation.y = p.yaw;
        mixer.update(dt);
        if (wpn) {
          if (wpn.up && (st === 'idle' || st === 'run' || st === 'sit')) {
            wpn.hand.updateWorldMatrix(true, false); wpn.hand.getWorldQuaternion(wq).invert();
            wpn.pm.quaternion.copy(wq).multiply(group.quaternion).multiply(wpn.up);
          } else wpn.pm.quaternion.copy(wpn.fwd);
        }
      },
      flash(on) { if (on === fl) return; fl = on; mesh.material = on ? R3D.mats.flash : Q.mat; if (wmesh) wmesh.material = on ? R3D.mats.flash : Q.wmat; },
      dispose() { mixer.stopAllAction(); mixer.uncacheRoot(rig); },
    };
  }
  // ---------- 불러오기 ----------
  const FILES = [
    ['props.glb', g => ingestProps(g)],
    ['knight.glb', g => ingestChar('knight', g)],
    ['knight_lo.glb', g => ingestChar('knight_lo', g)],
    ['barbarian.glb', g => ingestChar('barbarian', g)],
    ['barbarian_lo.glb', g => ingestChar('barbarian_lo', g)],
    ['rogue_lo.glb', g => ingestChar('rogue_lo', g)],
    ['villager_lo.glb', g => ingestChar('villager_lo', g)],
    ['anims_ranged.glb', g => ingestAnims(g), true], // 선택: 실패해도 캐릭터는 그대로
  ];
  A.start = () => {
    if (A.started) return; A.started = true;
    if (/[?&]noassets\b/.test(location.search)) { A.done = true; if (typeof RA !== 'undefined') RA.done = true; return; }
    const t0 = performance.now();
    const loader = new THREE.GLTFLoader();
    // 사실적 환경 모델(real3d.js, assets/real)도 같은 줄에서 불러온다 (캐릭터 다음). 실패해도 KayKit/절차적 모델로 계속
    const RL = typeof RA !== 'undefined' && RA.files ? (RA.begin(), RA.files) : [];
    // 사실적 인물(real/chars): KayKit 다음, 환경 모델 앞. 하나라도 되면 다 끝난 뒤 한 번에 바꿔 끼운다(실패한 몸은 KayKit 그대로)
    const RC = (typeof REAL_ON !== 'undefined' && !REAL_ON) || /[?&]noreal(chars)?\b/.test(location.search) ? [] : RNAMES.map(nm => ['real/chars/' + nm + '.glb', g => ingestChar(RCK(nm), g), true, 'rchar']);
    let rcLeft = RC.length;
    const rcDone = () => { if (--rcLeft === 0 && RNAMES.some(nm => CH[RCK(nm)])) { A.realChars = true; A.ver++; } };
    const ALL = FILES.concat(RC, RL.map(([f, use]) => [f, use, true, 'real']));
    const prog = new Array(ALL.length).fill(0);
    let n = 0, failed = false, realLeft = RL.length;
    const upd = () => showUI(`🏰 3D 모델 불러오는 중… ${Math.round(prog.reduce((a, b) => a + b, 0) / ALL.length * 100)}%`);
    upd();
    const charsLeft = new Set(FILES.slice(1).map(f => f[0]));
    const optional = new Set(ALL.filter(f => f[2]).map(f => f[0]));
    const realDone = () => { if (--realLeft === 0 && typeof RA !== 'undefined') RA.finish(); };
    if (!RL.length && typeof RA !== 'undefined') RA.finish();
    const finish = () => {
      A.done = true; A.ms = Math.round(performance.now() - t0);
      if (failed) hideUI(); else hideUI('✨ 3D 모델 적용 완료');
    };
    // 동시에 3개씩
    let next = 0;
    const one = () => {
      const i = next++; if (i >= ALL.length) return;
      const [f, use, , kind] = ALL[i];
      loader.load(BASE + f, gltf => {
        try { use(gltf); prog[i] = 1; } catch (e) { console.warn('asset ingest failed', f, e); if (kind === 'real') RA.fail(f, e); else if (kind !== 'rchar') { failed = true; A.err = String(e); } }
        if (kind === 'real') realDone();
        else if (kind === 'rchar') rcDone();
        else if (i > 0) { charsLeft.delete(f); if (!charsLeft.size && !failed && clips) { A.chars = true; A.ver++; } }
        upd();
        if (++n === ALL.length) { A.ok = !failed; finish(); } else one();
      }, e => { if (e.total) { prog[i] = e.loaded / e.total * 0.95; A.bytes = Math.max(A.bytes, 0); } upd(); }, e => {
        console.warn('asset load failed', f, e && e.message);
        if (kind === 'real') { RA.fail(f, e); realDone(); }
        else if (kind === 'rchar') rcDone();
        else if (optional.has(f)) { charsLeft.delete(f); if (!charsLeft.size && !failed && clips) { A.chars = true; A.ver++; } }
        else { failed = true; A.err = String(e && e.message || e); }
        if (++n === ALL.length) { A.ok = !failed; finish(); } else one();
      });
    };
    one(); one(); one();
  };
  // R3D.init 성공 시 자동 시작 (main.js 수정 없이)
  if (typeof R3D !== 'undefined' && R3D.init) {
    const init0 = R3D.init;
    R3D.init = () => { const ok = init0(); if (ok) { try { A.start(); } catch (e) { console.warn(e); A.done = true; if (typeof RA !== 'undefined') RA.done = true; } } else { A.done = true; if (typeof RA !== 'undefined') RA.done = true; } return ok; };
  }
  return A;
})();
