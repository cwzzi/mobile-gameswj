'use strict';
// ===== assets3d.js: CC0 3D 모델(glTF) 비동기 로딩 + 게임용 변환 =====
// 출처/라이선스: assets/CREDITS.md (KayKit by Kay Lousberg, CC0 1.0)
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
  const mb = new THREE.Matrix4(), mbi = new THREE.Matrix4(), mbone = new THREE.Matrix4();
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
      parts[m.name] = { geo: g, skin: false };
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
    if (o.kit === 'ranged') return { ch: 'rogue_lo', body: 'rogue', extra: ['Rogue_Cape'], tint: o.body, mode: 'green', atk: 'atk', prop: o.weapon };
    if (o.kit === 'spear') return { ch: lo ? 'knight_lo' : 'knight', body: 'knight', extra: ['Knight_Helmet', ...(o.weapon === 'pike' ? [] : ['Badge_Shield'])], tint: o.body, mode: 'armor', atk: 'atk', prop: o.weapon };
    if (o.kit === 'gunner') return { ch: lo ? 'knight_lo' : 'knight', body: 'knight', extra: o.hat === 'helm' ? ['Knight_Helmet'] : [], tint: o.body, mode: 'armor', atk: 'atk', prop: o.weapon };
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
        .replace('#include <output_fragment>', 'outgoingLight += vec3(1.0, 0.93, 0.8) * vRim * 0.28 * (0.4 + 0.6 * diffuseColor.rgb);\n#include <output_fragment>');
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
  A.humanKey = look => { const p = plan(look); return 'A|' + p.ch + '|' + p.extra.join(',') + '|' + (p.tint || '') + '|' + ((look && look.scale) || 1) + (p.prop ? '|' + p.prop : ''); };
  A.human = look => {
    if (!A.chars) return null;
    const pl = plan(look);
    const C = CH[pl.ch]; if (!C || !clips) return null;
    const bodyKey = pl.body || pl.ch;
    const geo = charGeo(pl.ch, [...BODY[bodyKey], ...pl.extra]); if (!geo) return null;
    const mat = charMat(tintTex(pl.ch, pl.tint, pl.mode));
    // 뼈대 복제 + 스킨 메시
    const rig = THREE.SkeletonUtils.clone(C.scene);
    const bones = [];
    const names = C.skeleton.bones.map(b => b.name);
    const byName = new Map(); rig.traverse(o => { if (o.isBone || o.type === 'Bone' || o.type === 'Object3D') byName.set(o.name, o); });
    for (const n of names) bones.push(byName.get(n));
    if (bones.some(b => !b)) return null;
    const skel = new THREE.Skeleton(bones, C.skeleton.boneInverses.map(m => m.clone()));
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.frustumCulled = false; mesh.castShadow = !look.lod; mesh.receiveShadow = false;
    // 원래 스킨 메시가 붙어 있던 자리(보통 리그 루트 바로 아래)에 붙인다
    rig.add(mesh); mesh.bind(skel, C.bindMatrix);
    if (pl.prop && R3D.weaponGeo) { // 손 뼈(handslot.r)에 절차적 무기 (활·석궁·머스킷·장창)
      const pg = R3D.weaponGeo(pl.prop), hand = [...byName.values()].find(b => /^handslot\.?r$/i.test(b.name));
      if (pg && hand) {
        rig.updateMatrixWorld(true); const pm = new THREE.Mesh(pg, R3D.mats.vc); pm.castShadow = !look.lod;
        pm.scale.setScalar(0.62 / C.norm / hand.getWorldScale(new THREE.Vector3()).x);
        if (pl.prop === "spear" || pl.prop === "pike") pm.rotation.x = Math.PI; // 창끝이 위로
        hand.add(pm);
      }
    }
    const inner = new THREE.Group(); inner.add(rig);
    const k = (pl.k || 1) * 1.2, y0 = C.baseY * C.norm * k; // 1.2: 둥근 절차 모델과 비슷한 화면 크기
    inner.scale.setScalar(C.norm * k); inner.position.y = y0;
    const group = new THREE.Group(); group.add(inner);
    const o = Object.assign({ scale: 1 }, look || {});
    group.scale.setScalar(o.scale || 1);
    const mixer = new THREE.AnimationMixer(rig);
    const act = {};
    for (const k in clips) { act[k] = mixer.clipAction(clips[k]); }
    if (act.die) { act.die.setLoop(THREE.LoopOnce, 1); act.die.clampWhenFinished = true; }
    const atk = act[pl.atk] || act.atk;
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
    return {
      group, key: A.humanKey(look), look: o, asset: true, mesh,
      pose(p) {
        const now = performance.now(); let dt = Math.min(0.1, (now - last) / 1000); last = now;
        let st;
        if (p.swing > 0) st = 'atk';
        else if (p.sit) st = 'sit';
        else if (p.moving) st = 'run';
        else st = 'idle';
        go(st, st === 'atk' ? 0.06 : 0.16);
        inner.position.y = p.sit ? y0 - 0.36 * k : y0; // 앉은 자세: 엉덩이를 안장 높이(그룹 원점)에 맞춤
        if (st === 'atk') {
          const k = 1 - Math.min(1, p.swing);
          atk.paused = false; atk.time = ATK_D * (0.22 + 0.5 * k); atk.paused = true;
        } else if (st === 'run') act.run.timeScale = 1.15;
        if (p.yaw !== undefined) group.rotation.y = p.yaw;
        mixer.update(dt);
      },
      flash(on) { if (on === fl) return; fl = on; mesh.material = on ? R3D.mats.flash : mat; },
      dispose() { mixer.stopAllAction(); mixer.uncacheRoot(rig); },
    };
  };

  // ---------- 불러오기 ----------
  const FILES = [
    ['props.glb', g => ingestProps(g)],
    ['knight.glb', g => ingestChar('knight', g)],
    ['knight_lo.glb', g => ingestChar('knight_lo', g)],
    ['barbarian.glb', g => ingestChar('barbarian', g)],
    ['barbarian_lo.glb', g => ingestChar('barbarian_lo', g)],
    ['rogue_lo.glb', g => ingestChar('rogue_lo', g)],
    ['villager_lo.glb', g => ingestChar('villager_lo', g)],
  ];
  A.start = () => {
    if (A.started) return; A.started = true;
    if (/[?&]noassets\b/.test(location.search)) { A.done = true; return; }
    const t0 = performance.now();
    const loader = new THREE.GLTFLoader();
    const prog = new Array(FILES.length).fill(0);
    let n = 0, failed = false;
    const upd = () => showUI(`🏰 3D 모델 불러오는 중… ${Math.round(prog.reduce((a, b) => a + b, 0) / FILES.length * 100)}%`);
    upd();
    const charsLeft = new Set(FILES.slice(1).map(f => f[0]));
    const finish = () => {
      A.done = true; A.ms = Math.round(performance.now() - t0);
      if (failed) hideUI(); else hideUI('✨ 3D 모델 적용 완료');
    };
    // 동시에 3개씩
    let next = 0;
    const one = () => {
      const i = next++; if (i >= FILES.length) return;
      const [f, use] = FILES[i];
      loader.load(BASE + f, gltf => {
        try { use(gltf); prog[i] = 1; } catch (e) { console.warn('asset ingest failed', f, e); failed = true; A.err = String(e); }
        if (i > 0) { charsLeft.delete(f); if (!charsLeft.size && !failed && clips) { A.chars = true; A.ver++; } }
        upd();
        if (++n === FILES.length) { A.ok = !failed; finish(); } else one();
      }, e => { if (e.total) { prog[i] = e.loaded / e.total * 0.95; A.bytes = Math.max(A.bytes, 0); } upd(); }, e => {
        console.warn('asset load failed', f, e && e.message); failed = true; A.err = String(e && e.message || e);
        if (++n === FILES.length) finish(); else one();
      });
    };
    one(); one(); one();
  };
  // R3D.init 성공 시 자동 시작 (main.js 수정 없이)
  if (typeof R3D !== 'undefined' && R3D.init) {
    const init0 = R3D.init;
    R3D.init = () => { const ok = init0(); if (ok) { try { A.start(); } catch (e) { console.warn(e); A.done = true; } } else A.done = true; return ok; };
  }
  return A;
})();
