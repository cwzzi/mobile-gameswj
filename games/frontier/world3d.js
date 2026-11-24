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

// ---------- 공용 재질: 지면 디테일 / 수면 ----------
// 타일 반복되는 잔잔한 노이즈(밝기 0.8~1.15)를 지면 색에 곱해 넓은 면이 밋밋하지 않게
let w3dDetail = null;
function w3dDetailTex() {
  if (w3dDetail) return w3dDetail;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), r = mulberry(91);
  const oct = (cell, amp, out) => {
    const n = N / cell, grid = []; for (let i = 0; i < n * n; i++) grid.push(r());
    const at = (x, y) => grid[((y + n) % n) * n + ((x + n) % n)];
    const sm = t => t * t * (3 - 2 * t);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
      const v = lerp(lerp(at(ix, iy), at(ix + 1, iy), tx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), tx), ty);
      out[y * N + x] += (v - 0.5) * amp;
    }
  };
  const v = new Float32Array(N * N); oct(32, 0.5, v); oct(16, 0.35, v); oct(8, 0.25, v); oct(4, 0.18, v);
  for (let i = 0; i < N * N; i++) { const k = Math.round(clamp(0.5 + v[i] * 0.9 + (r() - 0.5) * 0.08, 0, 1) * 255); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = k; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(4, R3D.maxAniso || 1);
  return (w3dDetail = t);
}
// 지면 재질: 칠한 텍스처 × 디테일 노이즈 × 지형별 질감(풀·모래·바위·숲바닥, 높이맵 → 법선으로 요철)
// rep = 텍스처 한 장이 덮는 타일 수, splat = 타일 종류 가중치 텍스처(W×H, RGBA = 풀/모래/바위/숲). 없으면 전부 풀
let w3dTerr = null;
function w3dTerrTex() { return w3dTerr || (w3dTerr = R3D.tex('assets/terrain_detail.jpg')); }
const W3_GROUND_MAP = `#include <map_fragment>
vec4 gW = vec4(1.0, 0.0, 0.0, 0.0); vec2 gP = vWP.xz; vec3 gT = vec3(0.5); float gF = 0.5;
#ifdef USE_MAP
{
  float dA = texture2D(uDetail, vUv * uRep * 0.5).r, dB = texture2D(uDetail, vUv * uRep * 0.093 + 0.37).r;
  diffuseColor.rgb *= (0.84 + 0.26 * dA) * (0.9 + 0.2 * dB);
#ifdef SPLAT
  gW = texture2D(uSplat, gP / uWorld);
  gW = clamp(gW * (1.0 + vec4(dB - 0.5, 0.5 - dB, dA - 0.5, dB - 0.5) * 1.6), 0.0, 1.0);
  gW /= max(dot(gW, vec4(1.0)), 0.001);
#endif
  gT = texture2D(uTerr, gP * 0.45).rgb; gF = texture2D(uTerr, gP * 0.29 + 0.31).r;
  float h = dot(gW, vec4(gT, gF));
  diffuseColor.rgb *= 1.0 + (h - 0.5) * dot(gW, vec4(0.55, 0.22, 0.8, 0.75)) * uTerrOn;
  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = max(mix(vec3(l), diffuseColor.rgb, 1.18), 0.0); } // ACES로 빠지는 채도 보정
}
#endif`;
const W3_GROUND_NRM = `#include <normal_fragment_maps>
#ifdef USE_MAP
if (uTerrOn > 0.5) {
  const float e = 0.006;
  vec3 tX = texture2D(uTerr, (gP + vec2(e, 0.0)) * 0.45).rgb, tZ = texture2D(uTerr, (gP + vec2(0.0, e)) * 0.45).rgb;
  vec3 amp = vec3(0.009 * (gW.r + gW.a), 0.004 * gW.g, 0.016 * gW.b);
  float h0 = dot(gT, amp), hx = dot(tX, amp), hz = dot(tZ, amp);
  vec3 gN = (vec4(normal, 0.0) * viewMatrix).xyz; // 시점 공간 → 월드
  gN = normalize(gN + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e));
  normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);
}
#endif`;
// 사실적 지면 (real3d.js RA.ground: Poly Haven 풀/흙/모래/바위 albedo + normal 512px)
// 칠한 지면 색(타일 색·영토·물가)은 그대로 두고, 사진 질감을 "평균으로 나눈 밝기·색 변화"로 곱한다 → 풀은 칠한 초록을 따라가서
// 갈색으로 마른 원본 풀 사진이 초록으로 보이고, 숲 바닥은 흙+풀, 모래·바위는 그 질감. 전장(SPLAT 없음)은 갈색 길에 흙 질감.
const W3_RG_MAP = `#include <map_fragment>
vec4 gW = vec4(1.0, 0.0, 0.0, 0.0); vec2 gP = vWP.xz, gQ = gP * uRGs;
#ifdef USE_MAP
{
  float dA = texture2D(uDetail, vUv * uRep * 0.5).r, dB = texture2D(uDetail, vUv * uRep * 0.093 + 0.37).r;
#ifdef SPLAT
  gW = texture2D(uSplat, gP / uWorld);
  gW = clamp(gW * (1.0 + vec4(dB - 0.5, 0.5 - dB, dA - 0.5, dB - 0.5) * 1.6), 0.0, 1.0);
#else
  { vec3 c = diffuseColor.rgb; float gr = c.g - max(c.r, c.b) * 0.97; float d = smoothstep(0.015, -0.03, gr); gW = vec4(1.0 - d, 0.0, 0.0, d); }
#endif
  gW /= max(dot(gW, vec4(1.0)), 0.001);
  diffuseColor.rgb *= (0.9 + 0.17 * dA) * (0.93 + 0.14 * dB);
  { // 큰 얼룩(약 50칸 주기): 풀밭이 마른 곳(누런 풀) · 짙은 곳으로 나뉘어 한 가지 초록으로 칠한 느낌이 덜하다
    float dC = texture2D(uDetail, gP * 0.021 + 0.71).r; // 텍스처 읽기 1번 추가 (낮음 품질 포함)
    vec3 tone = mix(vec3(0.84, 0.96, 0.86), vec3(1.1, 1.03, 0.76), smoothstep(0.32, 0.68, dC * 0.8 + dB * 0.2));
    diffuseColor.rgb *= mix(vec3(1.0), tone, gW.r * 0.85 + gW.a * 0.4);
  }
  if (uRG > 0.5) {
    vec3 aG = texture2D(uGa, gQ).rgb / max(texture2D(uGa, gQ, 12.0).rgb, vec3(0.02));
    vec3 aD = texture2D(uDa, gQ * 1.13 + 0.31).rgb / max(texture2D(uDa, gQ, 12.0).rgb, vec3(0.02));
    vec3 aS = texture2D(uSa, gQ * 0.83 + 0.17).rgb / max(texture2D(uSa, gQ, 12.0).rgb, vec3(0.02));
    vec3 aR = texture2D(uRa, gQ * 0.61 + 0.53).rgb / max(texture2D(uRa, gQ, 12.0).rgb, vec3(0.02));
    vec3 t = gW.r * aG + gW.g * aS + gW.b * aR + gW.a * mix(aD, aG, 0.3);
    t = mix(vec3(dot(t, vec3(0.3, 0.59, 0.11))), t, 0.5); // 사진 고유의 색 차이는 반만 (마른 풀색 빼기)
    diffuseColor.rgb *= mix(vec3(1.0), clamp(t, 0.25, 2.2), uRGk);
  }
  { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = max(mix(vec3(l), diffuseColor.rgb, 1.0), 0.0); }
}
#endif`;
const W3_RG_NRM = `#include <normal_fragment_maps>
#ifdef USE_MAP
if (uRGn > 0.5) {
  vec3 nG = texture2D(uGn, gQ).xyz, nD = texture2D(uDn, gQ * 1.13 + 0.31).xyz, nS = texture2D(uSn, gQ * 0.83 + 0.17).xyz, nR = texture2D(uRn, gQ * 0.61 + 0.53).xyz;
  vec3 nt = (gW.r * nG + gW.g * nS + gW.b * nR + gW.a * mix(nD, nG, 0.3)) * 2.0 - 1.0;
  vec3 gN = (vec4(normal, 0.0) * viewMatrix).xyz; // 시점 공간 → 월드
  gN = normalize(gN + vec3(nt.x, 0.0, nt.y) * vec3(uRGns, 0.0, uRGns));
  normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);
}
#endif`;
const W3_RGU = { k: { value: 0.8 }, ns: { value: 0.9 }, nOn: { value: 1 } }; // 질감 세기 · 노멀 세기 · 노멀 켜짐(낮음 품질이면 끔)
function w3dRealGround() {
  const G = typeof RA !== 'undefined' && RA.ground;
  if (!G || !R3D.renderer || R3D.renderer.capabilities.maxTextures < 14) return null;
  return G;
}
function w3dGroundMat(tex, rep, splat) {
  const m = new THREE.MeshLambertMaterial({ map: tex });
  const det = w3dDetailTex(), RG = w3dRealGround(), terr = RG ? null : w3dTerrTex();
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uDetail: { value: det }, uRep: { value: rep }, uSplat: { value: splat || null }, uWorld: { value: new THREE.Vector2(W, H) } });
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    if (RG) {
      const nOn = { get value() { return RG.non.value * W3_RGU.nOn.value; } };
      Object.assign(sh.uniforms, { uRG: RG.on, uRGn: nOn, uRGs: { value: 0.42 }, uRGk: W3_RGU.k, uRGns: W3_RGU.ns,
        uGa: { value: RG.grass.a.tex }, uDa: { value: RG.dirt.a.tex }, uSa: { value: RG.sand.a.tex }, uRa: { value: RG.rock.a.tex },
        uGn: { value: RG.grass.n.tex }, uDn: { value: RG.dirt.n.tex }, uSn: { value: RG.sand.n.tex }, uRn: { value: RG.rock.n.tex } });
      sh.fragmentShader = (splat ? '#define SPLAT\n' : '') + 'varying vec3 vWP;\nuniform sampler2D uDetail, uSplat, uGa, uDa, uSa, uRa, uGn, uDn, uSn, uRn;\nuniform float uRep, uRG, uRGn, uRGs, uRGk, uRGns;\nuniform vec2 uWorld;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', W3_RG_MAP).replace('#include <normal_fragment_maps>', W3_RG_NRM);
    } else {
      Object.assign(sh.uniforms, { uTerr: { value: terr.tex }, uTerrOn: terr.on });
      sh.fragmentShader = (splat ? '#define SPLAT\n' : '') + 'varying vec3 vWP;\nuniform sampler2D uDetail, uTerr, uSplat;\nuniform float uRep, uTerrOn;\nuniform vec2 uWorld;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', W3_GROUND_MAP).replace('#include <normal_fragment_maps>', W3_GROUND_NRM);
    }
  };
  m.customProgramCacheKey = () => 'w3ground4' + (splat ? 'S' : '') + (RG ? 'R' : '');
  return m;
}
// 물: 노멀맵 2겹(흐름) + 하늘 반사(프레넬) + 해/달 반짝임 + 가까운 불빛 8개의 반사(물 위로 길게 번지는 빛)
const W3_WL = 8;
function w3dWaterMat(mask) {
  const wn = R3D.tex('assets/water_normal.jpg');
  const lp = [], lc = [];
  for (let i = 0; i < W3_WL; i++) { lp.push(new THREE.Vector4(0, -99, 0, 0)); lc.push(new THREE.Color(0, 0, 0)); }
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uSize: { value: new THREE.Vector2(W, H) },
    uDeep: { value: new THREE.Color('#1b5d8c') }, uShal: { value: new THREE.Color('#46c2cf') }, uSkyZ: { value: new THREE.Color('#5d9be0') }, uSkyH: { value: new THREE.Color('#d7ecff') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uFoam: { value: new THREE.Color(0.95, 0.98, 1) },
  }]);
  u.uMask = { value: mask }; u.uNormal = { value: wn.tex }; u.uNOn = wn.on; u.uLP = { value: lp }; u.uLC = { value: lc };
  return new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `#include <common>
#include <fog_pars_vertex>
varying vec3 vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `#include <common>
#include <fog_pars_fragment>
uniform float uTime, uNOn; uniform sampler2D uMask, uNormal; uniform vec2 uSize;
uniform vec3 uDeep, uShal, uSkyZ, uSkyH, uSunDir, uSunCol, uFoam;
uniform vec4 uLP[${W3_WL}]; uniform vec3 uLC[${W3_WL}];
varying vec3 vW;
void main() {
  vec2 uv = vW.xz / uSize;
  float d = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 1.0 : texture2D(uMask, uv).r;
  vec2 p = vW.xz;
  float w1 = sin(p.x * 1.9 + uTime * 1.3 + sin(p.y * 0.8 + uTime * 0.6) * 1.6);
  float w2 = sin(p.y * 2.4 - uTime * 1.1 + sin(p.x * 1.1 - uTime * 0.45) * 1.3);
  vec2 nt = vec2(w1, w2) * 0.07;
  if (uNOn > 0.5) {
    vec3 a = texture2D(uNormal, p * 0.11 + vec2(uTime * 0.013, uTime * 0.008)).rgb * 2.0 - 1.0;
    vec3 b = texture2D(uNormal, p * 0.29 + vec2(-uTime * 0.021, uTime * 0.013)).rgb * 2.0 - 1.0;
    nt = nt * 0.4 + (a.xy + b.xy) * 0.3;
  }
  vec3 n = normalize(vec3(nt.x, 1.0, nt.y));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uSkyH, uSkyZ, smoothstep(0.05, 0.85, R.y));
  vec3 col = mix(uShal, uDeep, smoothstep(0.02, 0.75, d));
  col = mix(col, sky, clamp(fres * 1.4 + 0.16, 0.0, 0.9));
  float sd = max(dot(R, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 300.0) * 9.0 + pow(sd, 36.0) * 0.3);
  for (int i = 0; i < ${W3_WL}; i++) {
    vec3 L = uLP[i].xyz - vW; float dl = length(L); L /= max(dl, 0.001);
    float s = max(dot(R, L), 0.0);
    col += uLC[i] * uLP[i].w * (pow(s, 50.0) * 3.0 + pow(s, 6.0) * 0.08) / (1.0 + dl * dl * 0.3);
  }
  float band = smoothstep(0.2, 0.04, d);
  float foam = band * smoothstep(0.35, 0.9, 0.5 + 0.5 * sin(d * 70.0 - uTime * 2.2 + w1 * 1.2 + w2)) + smoothstep(0.075, 0.03, d) * 0.8;
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.7);
  float a = mix(0.55, 0.9, smoothstep(0.0, 0.6, d)) + foam * 0.25 + fres * 0.25;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <encodings_fragment>
  #include <fog_fragment>
}`,
    transparent: true, depthWrite: false, fog: true,
  });
}
// 물 깊이 마스크(256²): 타일 단위 깊이를 키워 부드럽게 흐린 것
function w3dBuildMask() {
  const N = 256, src = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) src[i] = S.tiles[i] === WATER ? Math.min(6, waterDepth[i] || 6) / 6 : 0;
  let a = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = clamp((x + 0.5) / N * W - 0.5, 0, W - 1), fy = clamp((y + 0.5) / N * H - 0.5, 0, H - 1);
    const ix = Math.min(W - 2, fx | 0), iy = Math.min(H - 2, fy | 0), tx = fx - ix, ty = fy - iy;
    a[y * N + x] = lerp(lerp(src[iy * W + ix], src[iy * W + ix + 1], tx), lerp(src[(iy + 1) * W + ix], src[(iy + 1) * W + ix + 1], tx), ty);
  }
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue; s += a[yy * N + xx]; c++; }
      b[y * N + x] = s / c;
    }
    a = b;
  }
  const d = W3.mask.image.data;
  for (let i = 0; i < N * N; i++) { const v = Math.round(a[i] * 255); d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  W3.mask.needsUpdate = true;
  W3.water.material.uniforms.uMask.value = W3.mask;
}
// 지형 가중치(splat): 타일 하나 = 텍셀 하나, 선형 보간으로 경계가 섞인다
function w3dSplatPx(i) {
  const t = S.tiles[i], d = W3.splat.image.data, o = i * 4;
  d[o] = t === GRASS ? 255 : 0; d[o + 1] = t === SAND || t === WATER ? 255 : 0; d[o + 2] = t === MOUNTAIN || t === GOLD ? 255 : 0; d[o + 3] = t === FOREST ? 255 : 0;
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
  const sc = sun.shadow.camera; sc.left = -21; sc.right = 21; sc.top = 21; sc.bottom = -21; sc.near = 1; sc.far = 110;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  R3D.regScene(scene); R3D.regLight(sun);
  const pts = [];
  for (let k = 0; k < 4; k++) { const L = new THREE.PointLight(0xffa050, 0, 7, 2); scene.add(L); pts.push(L); }
  // 지형 가중치 텍스처 (타일 종류 → 풀/모래/바위/숲 질감 섞기)
  const splat = new THREE.DataTexture(new Uint8Array(W * H * 4), W, H, THREE.RGBAFormat);
  splat.magFilter = splat.minFilter = THREE.LinearFilter; splat.wrapS = splat.wrapT = THREE.ClampToEdgeWrapping;

  // 바다: 깊은 바닥 + 반투명 수면 + 물결 반짝임
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1f4a6c }));
  ocean.position.set(W / 2, -0.72, H / 2); scene.add(ocean);
  // 수면: 깊이 마스크(물가=0 … 깊은 바다=1)로 얕은 물 색 · 물거품 · 물결 반짝임을 셰이더에서
  const maskData = new Uint8Array(256 * 256 * 4);
  const mask = new THREE.DataTexture(maskData, 256, 256, THREE.RGBAFormat);
  mask.magFilter = mask.minFilter = THREE.LinearFilter; mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), w3dWaterMat(mask));
  water.position.set(W / 2, -0.1, H / 2); water.renderOrder = 1; scene.add(water);
  const waves = null, wtex = null;
  const detail = w3dDetailTex();
  const blobs = R3D.blobs(scene, 240);

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

  const treeMatA = new THREE.MeshLambertMaterial({ map: null });
  treeMatA.onBeforeCompile = treeMat.onBeforeCompile; treeMatA.customProgramCacheKey = () => 'w3treeA';
  // 가짜 빛 (빛무리 · 빛웅덩이) + 등불/횃불 기둥 (시대별 모양)
  const glows = R3D.glows(scene, 220), pools = R3D.pools(scene, 140);
  const lamps = {};
  for (const k of ['torch', 'lantern', 'lamp', 'gas']) {
    const m = new THREE.InstancedMesh(w3dLampGeo(k), R3D.mats.vc, 160);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.castShadow = true; scene.add(m); lamps[k] = m;
  }
  W3 = { scene, cam, hemi, sun, pts, water, splat, glows, pools, lamps, waves, wtex, mask, detail, blobs, treeMat, treeMatA, goldMat, uTime, uChop, ring, slash, aver: -1,
    frustum: new THREE.Frustum(), pm: new THREE.Matrix4(), chunks: [], dyn: new Map(), pool: new Map(), frame: 0,
    arrows: [], S: null, tx: 0, tz: 0, lastT: performance.now(), dist: 30, look: new WeakMap() };
  R3D.onResize.push(w3dResize); w3dResize();
  // 품질이 바뀌면 숲을 다시 (낮음: 나무 수↓ · 나무 그림자 없음)
  if (R3D.fx && R3D.fx.onChange) R3D.fx.onChange.push(() => { if (W3) for (const c of W3.chunks) c.pDirty = true; });
}
function w3dResize() {
  const c = W3.cam; c.aspect = VW / VH;
  const t = Math.tan(c.fov / 2 * Math.PI / 180);
  W3.dist = clamp(c.aspect < 1 ? 5.4 / (t * c.aspect) : 6.2 / t, 12, 40);
  c.far = W3.dist * 3; c.updateProjectionMatrix();
  W3.scene.fog.near = W3.dist * 1.0; W3.scene.fog.far = W3.dist * 2.3;
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
    let nW = 0, md = 9;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const x = vx + dx, z = vz + dz;
      if (tileAt(x, z) !== WATER) continue;
      nW++; md = Math.min(md, (x < 0 || z < 0 || x >= W || z >= H) ? 6 : waterDepth[z * W + x]);
    }
    // 물가 꼭짓점도 물 칸 수만큼 조금 낮춘다 → 수면(-0.1)과 만나는 물가선이 계단 대신 모서리가 깎인 사선이 된다
    ch[vz * (W + 1) + vx] = nW === 4 ? -(0.2 + 0.075 * Math.min(md, 6)) : nW === 3 ? -0.17 : nW === 2 ? -0.065 : 0;
  }
  w3dBuildMask();
  for (let i = 0; i < W * H; i++) w3dSplatPx(i);
  W3.splat.needsUpdate = true;
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
  if (t === SAND) return shadeHex('#cbb784', 0.95 + h * 0.07);
  if (t === FOREST) return shadeHex('#4a7c36', 0.9 + h * 0.08 + patch * 0.06);
  if (t === MOUNTAIN || t === GOLD) return shadeHex('#7c8462', 0.92 + h * 0.1);
  return shadeHex('#6fa24e', 0.9 + h * 0.06 + patch * 0.1);
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
  const tex = R3D.ctex(can); tex.anisotropy = Math.min(4, R3D.maxAniso || 1);
  const mesh = new THREE.Mesh(geo, w3dGroundMat(tex, CK, W3.splat));
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
    w3dSmallG.fillStyle = t === WATER ? '#d8c48e' : w3dBaseCol(t, x, y); w3dSmallG.fillRect(i + 1, j + 1, 1, 1);
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
        if (t !== SAND) { gr.addColorStop(0, 'rgba(218,198,142,.82)'); gr.addColorStop(1, 'rgba(218,198,142,0)'); }
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
    } else if (kOwner[y * W + x] >= 0) { // 이웃 왕국 땅: 그 나라 색 + 점선 국경
      const ko = kOwner[y * W + x], kown = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= H) ? -1 : kOwner[yy * W + xx];
      g.fillStyle = kCiv(S.kingdoms[ko]).color; g.globalAlpha = 0.14; g.fillRect(px, py, P, P);
      g.globalAlpha = 0.9; const b = 2, hd = P / 2;
      if (kown(x - 1, y) !== ko) g.fillRect(px, py, b, hd);
      if (kown(x + 1, y) !== ko) g.fillRect(px + P - b, py + hd, b, hd);
      if (kown(x, y - 1) !== ko) g.fillRect(px + hd, py, hd, b);
      if (kown(x, y + 1) !== ko) g.fillRect(px, py + P - b, hd, b);
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
      { g: cone(1.0, 0.5, 7), c: '#7c7d72', p: [0, 0.25, 0] },
      { g: cone(0.8, 1.55, 6), c: '#8d8f99', p: [0, 0.775, 0] },
      { g: cone(0.8 * 0.33, 1.55 * 0.33, 6), c: '#f4f6fb', p: [0, 1.55 - 1.55 * 0.33 / 2 + 0.01, 0], s: 1.05 },
      { g: ico(0.2, 0), c: '#7a7c84', p: [0.45, 0.1, 0.35] },
    ]);
    if (k === 'mB') return R3D.merge([
      { g: cone(0.95, 0.45, 7), c: '#7a7b70', p: [0, 0.225, 0] },
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
    if (k === 'nug2') { // 사실적 산 앞자락에 흩어진 금 덩이 (타일 중심 기준, 앞쪽)
      const P = [];
      for (const [x, y, z, r] of [[-0.42, 0.09, 0.9, 0.12], [-0.08, 0.08, 1.02, 0.1], [0.3, 0.1, 0.92, 0.13], [0.6, 0.08, 0.78, 0.09], [-0.7, 0.08, 0.7, 0.09], [0.0, 0.4, 0.62, 0.09], [-0.3, 0.55, 0.45, 0.08]]) P.push({ g: ico(r, 0), c: '#ffd34d', p: [x, y, z], s: [1, 0.8, 1] });
      return R3D.merge(P);
    }
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
  const L = { round: [], fruit: [], pine: [], mA: [], mB: [], nug: [], nug2: [], tuft: [], rock: [] };
  const AP = typeof A3D !== 'undefined' && A3D.ready;
  const RL = w3dRealOK() ? { tree_broadleaf_a: [], tree_broadleaf_b: [], tree_conifer: [], bush: [], rock_a: [], rock_b: [], mountain_a: [], scatter_grass: [], scatter_flowers: [] } : null;
  const low = R3D.quality && R3D.quality() === 'low';
  const x0 = c.cx * CK, y0 = c.cz * CK;
  for (let y = y0; y < y0 + CK; y++) for (let x = x0; x < x0 + CK; x++) {
    const i = y * W + x, t = S.tiles[i], h = hash2(x, y);
    if (RL && w3dRealProps(RL, t, x, y, i, h, low, L)) continue; // 사실적 나무·바위·덤불 (산 봉우리·풀 포기는 아래에서 그대로)
    if (t === FOREST) {
      const n = Math.min(4, S.hp[i]), pine = hash2(x, y + 99) > 0.62;
      for (let k = 0; k < n; k++) {
        const sp = W3_SPOTS[(k + (h * 4 | 0)) % 4], r = hash2(x + k * 13, y + 5);
        if (AP) { // CC0 나무: 종류를 섞고 크기·위치를 더 흩뜨려 숲이 덜 균일하게
          const hk = hash2(x + k * 7, y + 3), kind = hk < (pine ? 0.75 : 0.3) ? 'pine' : hk > 0.93 ? 'fruit' : 'round';
          L[kind].push([x + sp[0] + (r - 0.5) * 0.3, y + sp[1] + (hash2(x, y + k * 11) - 0.5) * 0.28, r * 6.28, 0.78 + hash2(x * 3 + k, y) * 0.5, 0.9 + hash2(x, y * 3 + k) * 0.35, r]);
          continue;
        }
        const kind = pine ? 'pine' : (hash2(x + k * 7, y + 3) > 0.85 ? 'fruit' : 'round');
        L[kind].push([x + sp[0] + (r - 0.5) * 0.14, y + sp[1] + (hash2(x, y + k * 11) - 0.5) * 0.12, r * 6.28, 1.0 + hash2(x * 3 + k, y) * 0.35, 1.4, r]);
      }
    } else if (t === MOUNTAIN || t === GOLD) {
      const gold = t === GOLD;
      const kind = gold || h < 0.55 ? 'mA' : 'mB';
      const s = 1.0 + hash2(x + 3, y) * 0.2, sy = 1.25 + hash2(x, y + 3) * 0.5;
      L[kind].push([x + 0.5 + (h - 0.5) * 0.1, y + 0.5, gold ? 0 : h * 6.28, s, sy, h]);
      if (gold) L.nug.push([x + 0.5 + (h - 0.5) * 0.1, y + 0.5, 0, s, sy, h]);
    } else if ((t === GRASS || t === SAND) && owner[i] < 0 && kOwner[i] < 0) { // 영토 밖 풀숲·바위 (영토 안은 건물 자리라 비움)
      const h2 = hash2(x + 17, y + 31), h3 = hash2(x + 5, y + 71);
      if (t === GRASS && h2 < 0.3) L.tuft.push([x + 0.2 + h3 * 0.6, y + 0.2 + hash2(x, y + 9) * 0.6, h2 * 20, 1.3 + h3 * 0.7, 1, h3]);
      if (h2 > (t === SAND ? 0.95 : 0.975)) L.rock.push([x + 0.3 + h3 * 0.4, y + 0.3 + hash2(x + 9, y) * 0.4, h3 * 6, 0.8 + h2 * 0.6, 0.7, h3]);
    }
  }
  const grp = new THREE.Group();
  for (const k in L) {
    const list = L[k]; if (!list.length) continue;
    const tree = k === 'round' || k === 'fruit' || k === 'pine' || k === 'tuft';
    const ag = AP ? A3D.prop(k) : null; // 숲·바위만 CC0 모델 (산은 육각 기둥이 네모 타일과 안 어울려 절차적 봉우리 유지)
    if (ag && tree && !W3.treeMatA.map) { W3.treeMatA.map = A3D.atlas; W3.treeMatA.needsUpdate = true; }
    const geo = ag || w3dPropGeo(k);
    const m = new THREE.InstancedMesh(geo, ag ? (tree ? W3.treeMatA : A3D.mat) : tree ? W3.treeMat : (k === 'nug' || k === 'nug2') ? W3.goldMat : R3D.mats.vc, list.length);
    list.forEach((e, n) => {
      w3dV.set(e[0], 0, e[1]); w3dQ.setFromAxisAngle(w3dUp, e[2]); w3dSc.set(e[3], e[3] * e[4], e[3]);
      w3dM4.compose(w3dV, w3dQ, w3dSc); m.setMatrixAt(n, w3dM4);
      if (k !== 'nug' && k !== 'nug2') {
        const v = e[5]; w3dCol.setRGB(0.9 + v * 0.2, 0.9 + ((v * 7) % 1) * 0.2, 0.88 + ((v * 13) % 1) * 0.15);
        if (ag && tree) w3dCol.multiply(W3_TREE_TINT[k]).multiplyScalar(0.92 + ((v * 5) % 1) * 0.16); // 민트빛 나무를 들판 색에 맞춤
        m.setColorAt(n, w3dCol);
      }
    });
    m.castShadow = k !== 'tuft'; m.receiveShadow = !tree; m.frustumCulled = false;
    grp.add(m);
  }
  // 사실적 모델은 청크에 직접 넣지 않고 행렬만 모아 둔다 → w3dRealFill 이 화면 안 것만 공용 인스턴스 풀에 채운다
  c.real = null;
  if (RL) { c.real = {}; for (const k in RL) if (RL[k].length) c.real[k] = RL[k].map(o => RA.item(o)); }
  W3.realDirty = true;
  c.props = grp; c.pDirty = false; W3.scene.add(grp);
}
// 보이는 청크의 사실적 나무·바위·덤불 중 화면(+그림자 여유) 안의 것만 모델별 InstancedMesh 하나씩에 채운다
const W3_RKINDS = ['tree_broadleaf_a', 'tree_broadleaf_b', 'tree_conifer', 'bush', 'rock_a', 'rock_b', 'mountain_a', 'scatter_grass', 'scatter_flowers'];
const W3_RRAD = { mountain_a: 2.6, scatter_grass: 0.6, scatter_flowers: 0.6 };
const w3dRealBuf = {};
function w3dRealFill() {
  if (!w3dRealOK()) return;
  const lowQ = R3D.quality && R3D.quality() === 'low';
  if (!W3.rpool || W3.rpoolV !== RA.ver || W3.rpoolLow !== lowQ) { // 낮음 품질은 잎 카드 절반짜리 나무
    if (W3.rpool) for (const k in W3.rpool) W3.rpool[k] && W3.rpool[k].dispose();
    W3.rpool = {}; for (const k of W3_RKINDS) W3.rpool[k] = RA.pool(k, W3.scene, lowQ); W3.rpoolV = RA.ver; W3.rpoolLow = lowQ; W3.realDirty = true;
  }
  const tpS = !!W3.tpOn; if (W3.rfTP !== tpS) { W3.rfTP = tpS; W3.realDirty = true; } // 바닥 풀 카드는 3인칭에서만 (위에서 보면 가는 X 자 무늬로만 보였다)
  const moved = Math.abs(W3.tx - (W3.rfX || -99)) + Math.abs(W3.tz - (W3.rfZ || -99)) > 0.15;
  if (!moved && !W3.realDirty) return;
  W3.rfX = W3.tx; W3.rfZ = W3.tz; W3.realDirty = false;
  const low = R3D.quality && R3D.quality() === 'low', sph = w3dSphere, F = W3.frustum;
  const cnt = {}; for (const k of W3_RKINDS) { cnt[k] = 0; if (!w3dRealBuf[k]) w3dRealBuf[k] = []; }
  for (const c of W3.chunks) {
    if (!c.real || !c.props || !c.props.visible) continue;
    for (const k in c.real) {
      if (k === 'scatter_grass' && !tpS) continue;
      const L = c.real[k], buf = w3dRealBuf[k], rad = W3_RRAD[k] || (k.startsWith('tree') ? (low ? 1.2 : 2.0) : 0.8), sc = k.startsWith('scatter');
      for (const e of L) { if (sc && Math.abs(e.x - W3.tx) + Math.abs(e.z - W3.tz) > 20) continue; sph.center.set(e.x, 0.6, e.z); sph.radius = rad; if (F.intersectsSphere(sph)) buf[cnt[k]++] = e; }
    }
  }
  for (const k of W3_RKINDS) { const P = W3.rpool[k]; if (P) P.fill(w3dRealBuf[k], cnt[k], !low && k !== 'bush' && k !== 'mountain_a' && !k.startsWith('scatter'), k === 'mountain_a' || k.startsWith('scatter')); }
}
// ---------- 사실적 환경 모델 (real3d.js) ----------
function w3dRealOK() { return typeof RA !== 'undefined' && RA.ok; }
const W3_TREE_SPOTS = [[], [[0.5, 0.5]], [[0.3, 0.36], [0.7, 0.66]], [[0.28, 0.3], [0.74, 0.38], [0.46, 0.76]]];
const W3_RTINT = { tree_broadleaf_a: new THREE.Color(0.86, 1.06, 0.72), tree_broadleaf_b: new THREE.Color(0.8, 1.0, 0.74), tree_conifer: new THREE.Color(0.95, 1.12, 0.95), bush: new THREE.Color(1.2, 1.42, 1.0), scatter_grass: new THREE.Color(1.1, 1.65, 0.8), scatter_flowers: new THREE.Color(1.1, 1.3, 0.85) };
// 타일 하나의 숲/바위/덤불을 목록에 넣는다. 처리했으면 true (그 칸의 예전 나무·바위는 건너뜀)
function w3dRealProps(RL, t, x, y, i, h, low, L) {
  const col = (k, v, d) => { const c = new THREE.Color(); const b = 0.88 + v * 0.22; c.setRGB(b, b * (0.97 + ((v * 7) % 1) * 0.06), b * (0.95 + ((v * 13) % 1) * 0.08)); if (W3_RTINT[k]) c.multiply(W3_RTINT[k]); if (d) c.multiplyScalar(d); return c; };
  if (t === FOREST) {
    const hp = Math.max(0, Math.min(4, S.hp[i])); // 4 → 나무 3, 3 → 2 + 덤불, 2 → 2, 1 → 1 (벌목하면 눈에 띄게 줄어든다)
    const n = low ? [0, 1, 1, 2, 2][hp] : [0, 1, 2, 2, 3][hp];
    const con = hash2(x >> 2, (y >> 2) + 555) > 0.56, flip = hash2(x + 3, y + 11) > 0.5, spots = W3_TREE_SPOTS[n];
    for (let k = 0; k < n; k++) {
      const r = hash2(x + k * 13, y + 5), hk = hash2(x + k * 7, y + 3);
      const kind = hk < (con ? 0.78 : 0.14) ? 'tree_conifer' : hash2(x * 3 + k, y + 17) < 0.5 ? 'tree_broadleaf_a' : 'tree_broadleaf_b';
      const sp = spots[k], sx = flip ? 1 - sp[0] : sp[0];
      const s = (kind === 'tree_conifer' ? 0.092 : 0.1) * (0.84 + hash2(x * 3 + k, y) * 0.36) * (n === 1 ? 1.12 : 1);
      RL[kind].push({ x: x + sx + (r - 0.5) * 0.16, z: y + sp[1] + (hash2(x, y + k * 11) - 0.5) * 0.16, ry: r * 6.28, s, sy: 0.95 + hash2(x, y * 3 + k) * 0.25, c: col(kind, r, 0.98) });
    }
    if (!low && hp === 3) RL.bush.push({ x: x + 0.5 + (h - 0.5) * 0.3, z: y + 0.55, ry: h * 6.28, s: 0.16, sy: 1.1, c: col('bush', h) });
    return true;
  }
  if ((t === MOUNTAIN || t === GOLD) && !low && RA.has('mountain_a')) { // 2x2 칸마다 산 하나 (실제 절벽 스캔), 그 칸들의 가운데에
    const bx = x & ~1, by = y & ~1; let sx = 0, sz = 0, n = 0, gold = 0, first = -1;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const xx = bx + dx, yy = by + dy; if (xx >= W || yy >= H) continue;
      const tt = S.tiles[yy * W + xx];
      if (tt === MOUNTAIN || tt === GOLD) { if (first < 0) first = dy * 2 + dx; sx += xx + 0.5; sz += yy + 0.5; n++; if (tt === GOLD) gold = 1; }
    }
    if (first === (y - by) * 2 + (x - bx)) {
      const hh = hash2(bx + 5, by + 9), s = [0, 0.07, 0.08, 0.09, 0.1][n] * (0.9 + hash2(bx, by + 13) * 0.3);
      const v = 0.92 + hh * 0.16, c = gold ? new THREE.Color(v * 1.18, v * 1.04, v * 0.8) : new THREE.Color(v, v * 1.01, v * 1.03);
      RL.mountain_a.push({ x: sx / n + (hh - 0.5) * 0.2, z: sz / n + (hash2(bx + 2, by) - 0.5) * 0.2, y: -0.04, ry: hh * 6.28, s, sy: 1.0 + hash2(bx, by + 3) * 0.3, c });
    }
    if (t === GOLD) L.nug2.push([x + 0.5, y + 0.5, h * 6.28, 1, 1, h]);
    return true;
  }
  if ((t === MOUNTAIN) && h < 0.38) { // 산자락에 바위 하나
    const k = h < 0.2 ? 'rock_a' : 'rock_b', a = h * 40;
    RL[k].push({ x: x + 0.5 + Math.sin(a) * 0.42, z: y + 0.5 + Math.abs(Math.cos(a)) * 0.4, ry: a, s: k === 'rock_a' ? 0.34 + h : 0.5 + h, sy: 0.9, c: col(null, h) });
    return false; // 봉우리는 그대로 그린다
  }
  if ((t === GRASS || t === SAND) && owner[i] < 0 && kOwner[i] < 0) {
    const h2 = hash2(x + 17, y + 31), h3 = hash2(x + 5, y + 71);
    if (h2 > (t === SAND ? 0.95 : 0.975)) { // 들판 바위
      const k = h3 < 0.5 ? 'rock_a' : 'rock_b';
      RL[k].push({ x: x + 0.3 + h3 * 0.4, z: y + 0.3 + hash2(x + 9, y) * 0.4, ry: h3 * 6, s: (k === 'rock_a' ? 0.22 : 0.34) * (0.8 + h2 * 0.6), sy: 1, c: col(null, h3) });
      return true;
    }
    if (t === GRASS && h2 < 0.3 && !low && RA.has('scatter_grass')) { // 바닥 풀 · 꽃 카드 (낮음 품질은 예전 풀 포기)
      const fl = h2 > 0.255 && RA.has('scatter_flowers'), k = fl ? 'scatter_flowers' : 'scatter_grass';
      RL[k].push({ x: x + 0.15 + h3 * 0.7, z: y + 0.15 + hash2(x, y + 9) * 0.7, ry: h2 * 80, s: (fl ? 0.4 : 0.5) + h3 * 0.25, sy: 0.85 + h2, c: col(k, h3) });
      return true;
    }
    if (t === GRASS && h2 > 0.3 && h2 < (low ? 0.32 : 0.345)) { // 덤불
      RL.bush.push({ x: x + 0.25 + h3 * 0.5, z: y + 0.25 + hash2(x, y + 9) * 0.5, ry: h2 * 60, s: 0.12 + h3 * 0.08, sy: 0.9 + h2, c: col('bush', h3) });
      return false; // 풀 포기도 같이
    }
  }
  return false;
}
const W3_TREE_TINT = { pine: new THREE.Color(0.55, 0.78, 0.5), round: new THREE.Color(0.8, 0.95, 0.5), fruit: new THREE.Color(1.0, 0.85, 0.5) };
function w3dFreeProps(c) {
  if (!c.props) return;
  W3.scene.remove(c.props); for (const m of c.props.children) m.dispose(); c.props = null; c.real = null; W3.realDirty = true;
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
    else if (type === 'school') { // 학당: 넓은 강당 + 푸른 지붕 + 종
      P.push({ g: box(0.78, 0.36, 0.5), c: '#efe2c2', p: [0, 0.18, 0] });
      for (const x of [-0.39, -0.13, 0.13, 0.39]) P.push({ g: box(0.05, 0.36, 0.05), c: '#6b4a2e', p: [x, 0.18, 0.25] });
      P.push({ g: w3dPrism(0.6, 0.26, 0.9).rotateY(Math.PI / 2), c: '#3a6a9a', p: [0, 0.37, 0] });
      P.push({ g: box(0.16, 0.2, 0.16), c: '#6b4a2e', p: [0, 0.72, 0] });
      P.push({ g: cone(0.13, 0.14, 4), c: '#3a6a9a', p: [0, 0.89, 0], r: [0, Math.PI / 4, 0] });
      P.push({ g: cyl(0.035, 0.05, 0.07, 6), c: '#d9b44a', p: [0, 0.68, 0.06] });
      P.push({ g: box(0.15, 0.22, 0.02), c: '#5b3a20', p: [0, 0.11, 0.255] });
      P.push({ g: box(0.24, 0.1, 0.02), c: '#f6f0dc', p: [0.26, 0.42, 0.21], r: [0.5, 0, 0] });
      G.push({ g: box(0.1, 0.09, 0.02), c: '#fff', p: [-0.24, 0.22, 0.255] });
      G.push({ g: box(0.1, 0.09, 0.02), c: '#fff', p: [0.24, 0.22, 0.255] });
    }
    else if (type === 'factory') { // 공장 (근대): 붉은 벽돌 공장 + 톱니 지붕 + 높은 굴뚝 둘 (연기: W3_STACKS)
      const brick = '#9a4632', brick2 = '#7e3826', slate = '#4a4e56';
      P.push({ g: box(0.94, 0.04, 0.82), c: '#6a6458', p: [0, 0.02, 0] });
      P.push({ g: box(0.78, 0.32, 0.46), c: brick, p: [-0.04, 0.2, -0.08] });
      P.push({ g: box(0.8, 0.03, 0.48), c: '#d8c8a8', p: [-0.04, 0.36, -0.08] });
      for (let k = 0; k < 3; k++) { // 톱니 지붕 (북쪽으로 유리, 남쪽은 슬레이트)
        const x = -0.3 + k * 0.26;
        P.push({ g: box(0.25, 0.03, 0.46), c: slate, p: [x + 0.01, 0.44, -0.08], r: [0, 0, 0.55] });
        P.push({ g: box(0.02, 0.16, 0.46), c: '#7a8a96', p: [x + 0.12, 0.44, -0.08] });
      }
      for (const x of [-0.32, -0.14, 0.04, 0.22]) { P.push({ g: box(0.1, 0.14, 0.02), c: '#2a2a30', p: [x, 0.21, 0.155] }); G.push({ g: box(0.08, 0.12, 0.02), c: '#fff', p: [x, 0.21, 0.158] }); P.push({ g: box(0.12, 0.025, 0.03), c: '#d8c8a8', p: [x, 0.29, 0.16] }); }
      P.push({ g: box(0.16, 0.2, 0.02), c: '#3a2a1e', p: [0.36, 0.1, 0.155] }); // 문
      P.push({ g: box(0.24, 0.26, 0.3), c: brick2, p: [0.4, 0.13, -0.12] }); // 보일러실
      P.push({ g: w3dPrism(0.32, 0.1, 0.26), c: slate, p: [0.4, 0.26, -0.12] });
      for (const [x, z, r, h] of W3_STACKS.factory.map(a => [a[0], a[2], a[3], a[1]])) {
        P.push({ g: cyl(r * 0.8, r, h, 8), c: brick2, p: [x, h / 2, z] });
        P.push({ g: cyl(r * 0.95, r * 0.95, 0.04, 8), c: '#3a3230', p: [x, h - 0.02, z] });
        P.push({ g: cyl(r * 1.02, r * 1.02, 0.03, 8), c: '#d8c8a8', p: [x, h * 0.62, z] });
      }
      P.push({ g: ico(0.13, 0), c: '#1e1c1c', p: [-0.32, 0.05, 0.28], s: [1.4, 0.5, 1] }); // 석탄 더미
      P.push({ g: box(0.16, 0.1, 0.12), c: '#5a4a3a', p: [0.08, 0.05, 0.3] });
      P.push({ g: cyl(0.05, 0.05, 0.14, 8), c: '#3a3a40', p: [-0.1, 0.07, 0.3], r: [0, 0, Math.PI / 2] }); // 기계 부품
      P.push({ g: cyl(0.05, 0.05, 0.14, 8), c: '#3a3a40', p: [-0.1, 0.07, 0.36], r: [0, 0, Math.PI / 2] });
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

// 부족 시대 마을 울타리: 뾰족한 통나무 말뚝 고리 (앞쪽은 출입구)
function w3dPalisadeGeo() {
  return R3D.cached('palisade', () => {
    const { cyl, cone } = R3D.prim, P = [], n = 44, R = 1.75;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, sx = Math.sin(a), cz = Math.cos(a);
      if (cz > 0.93) continue; // 출입구
      const h = 0.42 + hash2(k, 7) * 0.12, c = k % 2 ? '#7a5634' : '#6b4a2a';
      P.push({ g: cyl(0.055, 0.06, h, 5), c, p: [sx * R, h / 2, cz * R] });
      P.push({ g: cone(0.055, 0.12, 5), c: '#9a7a50', p: [sx * R, h + 0.06, cz * R] });
    }
    for (const [x, z] of [[-0.3, R], [0.3, R]]) P.push({ g: cyl(0.07, 0.08, 0.75, 5), c: '#5a3a20', p: [x, 0.375, z * 0.99] });
    return R3D.merge(P);
  });
}
// ---------- 모습 ----------
const W3_HS = 1.4; // 말 크기 (사람과 같이 W3_PK 를 곱해 그린다)
// 오픈월드 축척: 사람·말은 읽히도록 실제보다 크게 그리지만, 예전엔 집보다 커서 마을이 장난감처럼 보였다
// → 사람·말 0.8배(위 시점), 건물·성은 조금 키운다. 3인칭에선 W3_TP.hk 로 더 작게(집·나무 크기에 맞춰)
const W3_PK = 0.8, W3_BK = [1.12, 1.22, 1.12];
const W3_WIN = new THREE.Color('#ff9a44'), W3_FIRE = new THREE.Color('#ff7a26');
const W3_WINB = { house: 1, school: 1, market: 1, barracks: 1, lumber: 1, mine: 1, stable: 1, factory: 1 }; // 밤에 창/문간 불이 켜지는 건물
const W3_BSCALE = { school: [1.25, 1.35, 1.25], house: [1.25, 1.4, 1.25], tower: [1.15, 1.45, 1.15], market: [1.2, 1.35, 1.2], farm: [1, 1.3, 1], factory: [1.4, 1.55, 1.4] };
// 굴뚝 [x, 높이, z, 반지름] (건물 자리 기준, W3_BSCALE 곱하기 전) → 연기 (w3dSmoke)
const W3_STACKS = { factory: [[0.3, 0.92, -0.26, 0.065], [0.13, 0.7, -0.3, 0.05]] };
const W3_LOOK = {
  player: { body: '#2b5fb8', trim: '#f2c14e', cape: '#c0392b', hat: 'crown', weapon: 'sword', armor: true, scale: 1.45 * 1.1 },
  bandit: { body: '#7a2a22', trim: '#2a1a12', legs: '#2a2420', hat: 'hood', helm: '#3a2a22', weapon: 'club', scale: 1.45, tint: '#8a2a20', lod: 1 },
};
// 시대별 외형 (era.js ERAS[].looks) — 시대·진영이 바뀔 때만 새로 만든다
const w3dLookCache = new Map();
function w3dEraLook(kind, extra) {
  const w = S.war, key = kind + '|' + S.era + '|' + (w ? w.faction + '|' + w.era + '|' + (w.kingdom === undefined ? '' : w.kingdom) : '');
  let lk = w3dLookCache.get(key);
  if (!lk) {
    lk = kind === 'grunt' || kind === 'officer' ? Object.assign(warUnitLook(kind === 'officer'), extra) : Object.assign(eraLook(kind), extra);
    w3dLookCache.set(key, lk);
  }
  return lk;
}
// 병종별 외형 (tech.js unitLook) + 오픈월드 크기
function w3dUnitLook(base) {
  let lk = w3dLookCache.get(base);
  if (!lk) { lk = Object.assign({}, base, { scale: 1.45, lod: 1 }); w3dLookCache.set(base, lk); }
  return lk;
}
// 사람 하나 그리기 (말 탄 병종이면 말까지) → 사람 레코드
function w3dRider(obj, look, x, z, dt, pose, BL) {
  const r = w3dHuman(obj, look);
  const moved = r.lx !== null && (Math.abs(x - r.lx) + Math.abs(z - r.lz)) > 1e-4;
  const yaw = w3dFaceMove(r, x, z, dt, pose.face);
  if (look.mount) {
    const h = obj._h || (obj._h = {});
    const cl = pose.cloth || R3D.CLOTH.ally;
    const hr = w3dUse(h, R3D.horse.key(look.mount, cl), () => { const m = R3D.horse(look.mount, cl); m.group.scale.setScalar(W3_HS); return m; });
    hr.m.pose({ walk: (obj.walk || 0) * 0.7, moving: moved, ridden: true, yaw }); hr.m.group.position.set(x, 0, z);
    r.m.pose({ sit: true, swing: pose.swing, yaw }); R3D.ride(hr.m, r.m.group, x, 0, z, W3_HS);
    BL.add(x, z, 0.6);
  } else {
    r.m.pose({ walk: obj.walk, moving: moved, swing: pose.swing, yaw }); r.m.group.position.set(x, 0, z);
    BL.add(x, z, 0.26 * (look.scale || 1));
  }
  r.m.flash(obj.hit > 0);
  return r;
}
function w3dWarLook(cmd) { return cmd ? w3dEraLook('officer', { scale: 1.45 * 1.3 }) : w3dEraLook('grunt', { scale: 1.45, lod: 1 }); }
function w3dHuman(obj, look) { const key = R3D.human.key(look); return w3dUse(obj, 'h|' + key, () => R3D.human(look)); }

// ---------- 등불 · 횃불 (시대별) ----------
function w3dLampGeo(k) {
  const { box, cyl, cone, ico } = R3D.prim;
  return R3D.cached('lamp|' + k, () => {
    if (k === 'torch') return R3D.merge([
      { g: cyl(0.03, 0.045, 0.9, 5), c: '#5a3a20', p: [0, 0.45, 0] },
      { g: cyl(0.065, 0.04, 0.1, 6), c: '#3a2a1a', p: [0, 0.92, 0] },
      { g: cone(0.065, 0.17, 6), c: '#ffb040', p: [0, 1.04, 0] },
    ]);
    if (k === 'lantern') return R3D.merge([
      { g: box(0.06, 1.0, 0.06), c: '#4a3420', p: [0, 0.5, 0] },
      { g: box(0.24, 0.04, 0.04), c: '#4a3420', p: [0.09, 0.98, 0] },
      { g: box(0.11, 0.15, 0.11), c: '#ffd890', p: [0.18, 0.86, 0] },
      { g: cone(0.095, 0.07, 4), c: '#2a2420', p: [0.18, 0.97, 0], r: [0, Math.PI / 4, 0] },
    ]);
    if (k === 'gas') return R3D.merge([ // 가스 가로등 (근대): 높은 무쇠 기둥 + 유리 등갓
      { g: cyl(0.075, 0.1, 0.16, 6), c: '#1c2024', p: [0, 0.08, 0] },
      { g: cyl(0.026, 0.038, 1.5, 6), c: '#22272c', p: [0, 0.82, 0] },
      { g: box(0.2, 0.025, 0.025), c: '#22272c', p: [0, 1.42, 0] },
      { g: cyl(0.1, 0.06, 0.2, 6), c: '#fff0c4', p: [0, 1.66, 0] },
      { g: cone(0.12, 0.1, 6), c: '#1c2024', p: [0, 1.81, 0] },
      { g: ico(0.025, 0), c: '#1c2024', p: [0, 1.88, 0] },
    ]);
    return R3D.merge([ // 가로등 (근세)
      { g: cyl(0.03, 0.045, 1.35, 6), c: '#2a2e34', p: [0, 0.675, 0] },
      { g: cyl(0.075, 0.095, 0.07, 6), c: '#2a2e34', p: [0, 0.035, 0] },
      { g: box(0.13, 0.17, 0.13), c: '#ffe2a8', p: [0, 1.43, 0] },
      { g: cone(0.12, 0.09, 4), c: '#1e2226', p: [0, 1.56, 0], r: [0, Math.PI / 4, 0] },
    ]);
  });
}
const W3_LAMP = [ // 시대별: 모양, 불빛 높이/옆 위치, 색, 세기
  { k: 'torch', y: 1.05, dx: 0, col: new THREE.Color('#ff6a1e'), i: 3.2, fire: true },
  { k: 'lantern', y: 0.86, dx: 0.18, col: new THREE.Color('#ff8a30'), i: 3.0 },
  { k: 'lantern', y: 0.86, dx: 0.18, col: new THREE.Color('#ff9438'), i: 3.3 },
  { k: 'lamp', y: 1.43, dx: 0, col: new THREE.Color('#ffa048'), i: 3.6 },
  { k: 'gas', y: 1.66, dx: 0, col: new THREE.Color('#ffd89a'), i: 4.0 },
];
// 마을 둘레 등불 자리 (마을 레벨·시대·건물이 바뀔 때만 다시 계산)
function w3dTownLamps(t, m) {
  const lv = townLevel(t), key = lv + '|' + S.era + '|' + S.buildings.length;
  if (m.lampKey === key) return m.lamps;
  const ek = S.era >= 3 ? 1.12 : 1, n = S.era === 0 ? 5 : 3 + lv + S.era;
  const R = (S.era === 0 ? 2.0 + (lv - 1) * 0.3 : 1.6 + lv * 0.14) * ek, out = [];
  const free = (x, z) => { const tx = Math.floor(x), tz = Math.floor(z); const tt = tileAt(tx, tz); return (tt === GRASS || tt === SAND) && !S.buildings.some(b => b.x === tx && b.y === tz); };
  for (let k = 0; k < n; k++) {
    const a = (k + 0.5) / n * Math.PI * 2 + 0.35, x = t.x + 0.5 + Math.sin(a) * R, z = t.y + 0.5 + Math.cos(a) * R;
    if (free(x, z)) out.push([x, z]);
  }
  if (lv >= 3) for (const s of [-1, 1]) { const x = t.x + 0.5 + s * 0.62 * ek, z = t.y + 0.5 + (lv >= 4 ? 1.62 : 1.3) * ek; if (free(x, z)) out.push([x, z]); } // 성문 양옆
  m.lampKey = key; m.lamps = out; return out;
}

// ---------- 하루 (해돋이 → 낮 → 노을 → 푸른 저녁 → 밤) ----------
// t: 하루 위상(0 해돋이 · 0.25 정오 · 0.5 해넘이 · 0.75 자정). sun/sI: 해(밤엔 달) 색·세기, sky/gnd/hI: 반구광,
// fog: 안개·배경, zen/hor: 물에 비치는 하늘(천정/지평), wd/ws: 깊은/얕은 물, ex: 노출, bl/th: 블룸 세기/문턱,
// sat/con: 채도/대비, lift/gain: 어두운 곳/밝은 곳 색조, vig: 비네트, on: 불빛 켜짐
const W3_KEYS = [
  [0.00, '#ff9060', 0.06, '#8496c4', '#2a2434', 0.40, '#b08c98', '#5a6aa8', '#f0a080', '#1c3050', '#3a6a80', 1.10, 0.7, 1.0, 1.05, 1.05, '#0a0412', '#fff0e0', 0.38, 0.6],
  [0.035, '#ffb070', 0.55, '#a8b8d8', '#4a4040', 0.48, '#d4b8a8', '#7a98d0', '#ffd0a0', '#1c4a70', '#4a9aaa', 1.05, 0.45, 1.3, 1.08, 1.04, '#060408', '#fff4e4', 0.32, 0.0],
  [0.09, '#ffe2bc', 0.92, '#c4daf4', '#5e6a48', 0.52, '#c8d8e4', '#6aa4e4', '#e4ecf4', '#18557e', '#3aa6b4', 1.0, 0.25, 1.7, 1.08, 1.04, '#000000', '#ffffff', 0.26, 0.0],
  [0.25, '#fff6e8', 1.0, '#d0e6ff', '#6a7a4c', 0.55, '#bcd4e8', '#5d9be0', '#dcecf8', '#18557e', '#3aa6b4', 1.08, 0.22, 1.8, 1.06, 1.07, '#000000', '#ffffff', 0.24, 0.0],
  [0.40, '#ffe0b4', 0.98, '#d4dcec', '#6a6844', 0.52, '#d4d4cc', '#6a9ad8', '#f2e2c8', '#1a5480', '#3c9eae', 1.08, 0.28, 1.6, 1.08, 1.07, '#020000', '#fff8f0', 0.28, 0.0],
  [0.465, '#ff9a58', 0.9, '#d4aca0', '#5a4a3a', 0.6, '#e0a080', '#7a7cb4', '#ffb070', '#1c3c64', '#2e7088', 1.1, 0.5, 1.2, 1.14, 1.06, '#0a0204', '#fff0dc', 0.34, 0.2],
  [0.50, '#ff6a38', 0.22, '#9a7ca2', '#3c3238', 0.54, '#8a5e78', '#3a4a8a', '#e87850', '#1a2a4c', '#3a4a60', 1.12, 0.8, 1.0, 1.08, 1.06, '#0a0418', '#ffe8dc', 0.42, 0.7],
  [0.56, '#7f98e6', 0.14, '#3c4c8c', '#141828', 0.38, '#28325e', '#1a2450', '#4a4a7a', '#0a1430', '#14283a', 1.18, 1.0, 0.75, 0.95, 1.08, '#020818', '#e8eeff', 0.48, 1.0],
  [0.64, '#9fb6ff', 0.24, '#28386e', '#0a0e1c', 0.26, '#0c1430', '#0a1230', '#1c2448', '#050c1c', '#0c1c2a', 1.22, 1.1, 0.65, 0.9, 1.1, '#000616', '#e0e8ff', 0.5, 1.0],
  [0.86, '#9fb6ff', 0.32, '#28386e', '#0a0e1c', 0.32, '#0c1430', '#0a1230', '#1c2448', '#050c1c', '#0c1c2a', 1.22, 1.1, 0.65, 0.9, 1.1, '#000616', '#e0e8ff', 0.5, 1.0],
  [0.95, '#9fb6ff', 0.16, '#3a4478', '#141626', 0.36, '#2a3058', '#1a2450', '#5a5078', '#0a1430', '#14283a', 1.16, 0.9, 0.8, 0.95, 1.08, '#040616', '#eef0ff', 0.45, 1.0],
  [1.00, '#ff9060', 0.06, '#8496c4', '#2a2434', 0.40, '#b08c98', '#5a6aa8', '#f0a080', '#1c3050', '#3a6a80', 1.10, 0.7, 1.0, 1.05, 1.05, '#0a0412', '#fff0e0', 0.38, 0.6],
].map(r => ({ t: r[0], sun: new THREE.Color(r[1]), sI: r[2], sky: new THREE.Color(r[3]), gnd: new THREE.Color(r[4]), hI: r[5], fog: new THREE.Color(r[6]), zen: new THREE.Color(r[7]), hor: new THREE.Color(r[8]),
  wd: new THREE.Color(r[9]), ws: new THREE.Color(r[10]), ex: r[11], bl: r[12], th: r[13], sat: r[14], con: r[15], lift: new THREE.Color(r[16]), gain: new THREE.Color(r[17]), vig: r[18], on: r[19] }));
const W3_K = { sun: new THREE.Color(), sky: new THREE.Color(), gnd: new THREE.Color(), fog: new THREE.Color(), zen: new THREE.Color(), hor: new THREE.Color(), wd: new THREE.Color(), ws: new THREE.Color(), lift: new THREE.Color(), gain: new THREE.Color() };
function w3dKey(ph) {
  let i = 0; while (i < W3_KEYS.length - 2 && ph >= W3_KEYS[i + 1].t) i++;
  const a = W3_KEYS[i], b = W3_KEYS[i + 1], f0 = clamp((ph - a.t) / (b.t - a.t), 0, 1), f = f0 * f0 * (3 - 2 * f0), K = W3_K;
  for (const c of ['sun', 'sky', 'gnd', 'fog', 'zen', 'hor', 'wd', 'ws', 'lift', 'gain']) K[c].copy(a[c]).lerp(b[c], f);
  for (const n of ['sI', 'hI', 'ex', 'bl', 'th', 'sat', 'con', 'vig', 'on']) K[n] = lerp(a[n], b[n], f);
  return K;
}
const w3dC1 = new THREE.Color(), w3dSunDir = new THREE.Vector3();
// 하늘·빛·안개·물·색보정을 시간에 맞추고, 불빛 목록(src)으로 실제 점광원 몇 개 + 빛무리 + 빛웅덩이 + 물 반사를 채운다
// src 원소: { x, y, z, col: THREE.Color, k: 세기, glow: 빛무리 크기, pool: 빛웅덩이 반지름, fire, real: 실제 광원 후보 }
function w3dLighting(src) {
  const ph = ((S.time / DAY_LEN) + 0.08) % 1, K = w3dKey(ph), d = dayInfo();
  const night = clamp(d.dark / 0.6, 0, 1), dusk = d.dusk * (1 - night), on = K.on;
  W3.scene.background.copy(K.fog); W3.scene.fog.color.copy(K.fog);
  const FD = W3.fogD || W3.dist; // 3인칭이면 짧게 (먼 곳은 안개 속으로 → 그릴 청크도 줄어듦)
  W3.scene.fog.near = FD * lerp(1.0, 0.8, on); W3.scene.fog.far = FD * lerp(2.3, 1.95, on);
  // 해(낮) / 달(밤): 동→남→서로 돌고, 낮게 뜰수록 그림자가 길다
  const day = ph < 0.5, a = (day ? ph : ph - 0.5) * 2 * Math.PI;
  w3dSunDir.set(Math.cos(a) * 0.8, 0.24 + Math.max(0, Math.sin(a)) * 1.0, 0.55).normalize();
  W3.sun.color.copy(K.sun); W3.sun.intensity = K.sI;
  W3.hemi.color.copy(K.sky); W3.hemi.groundColor.copy(K.gnd); W3.hemi.intensity = K.hI;
  // 색보정·노출 (후처리가 꺼진 낮음 품질에선 렌더러 노출만)
  const G = R3D.grade;
  G.exposure = K.ex; G.bloom = K.bl; G.threshold = K.th; G.knee = 0.6; G.sat = K.sat; G.contrast = K.con; G.lift.copy(K.lift); G.gain.copy(K.gain); G.vignette = K.vig;
  R3D.renderer.toneMappingExposure = R3D.fx && R3D.fx.on ? 1 : K.ex;
  // 창문: 밤이면 켜짐. 시대·인구가 클수록 켜진 창이 많다
  const pop = S.towns.reduce((s, t) => s + t.pop, 0);
  if (R3D.uWin) { R3D.uWin.value = on * 1.15; R3D.uWinLit.value = clamp(0.3 + S.era * 0.14 + pop / 300, 0.2, 0.95); }
  R3D.mats.glow.emissiveIntensity = on * 1.8;
  if (R3D.uRim) R3D.uRim.value.setRGB(1.0, 0.93, 0.8).multiplyScalar(0.28).lerp(w3dC1.setRGB(0.45, 0.55, 1.0).multiplyScalar(0.14), on);
  // 물
  const wu = W3.water.material.uniforms;
  wu.uDeep.value.copy(K.wd); wu.uShal.value.copy(K.ws); wu.uSkyZ.value.copy(K.zen); wu.uSkyH.value.copy(K.hor);
  wu.uSunDir.value.copy(w3dSunDir); wu.uSunCol.value.copy(K.sun).multiplyScalar(K.sI * (day ? 1 : 0.3)); // 달빛 반짝임은 약하게
  wu.uFoam.value.setRGB(0.95, 0.98, 1).multiplyScalar(lerp(1, 0.16, on));
  // 불빛
  const p = S.player, px = p.x / T, pz = p.y / T, cx = W3.tx, cz = W3.tz;
  const G1 = W3.glows, P1 = W3.pools; G1.begin(); P1.begin();
  if (on > 0.01) for (const s of src) {
    const fl = s.fire ? 0.82 + Math.sin(S.time * 17 + s.x * 3) * 0.1 + Math.sin(S.time * 29 + s.z) * 0.08 : 1;
    s.kk = s.k * on * fl;
    if (s.glow) G1.add(s.x, s.y, s.z, s.glow * (s.fire ? 0.9 + fl * 0.15 : 1), s.col, s.kk * 0.26);
    if (s.pool) P1.add(s.x, 0.02, s.z, s.pool * 2, s.col, s.kk * 0.6); // 바닥은 원래 색에 곱해지므로 밤의 어두운 땅을 확 밝힌다
  }
  G1.end(); P1.end();
  // 실제 점광원: 화면 가운데에서 가까운 것부터 (개수는 품질 단계에 따라)
  src.sort((a, b) => ((a.x - cx) ** 2 + (a.z - cz) ** 2) - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
  const nReal = (R3D.fx ? R3D.fx.lights() : 4) - 1;
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const L = W3.pts[i]; L.visible = i < nReal;
    while (n < src.length && !src[n].real) n++;
    const s = src[n++];
    if (!s || on <= 0.01 || !L.visible) { L.intensity = 0; continue; }
    L.position.set(s.x, s.y + 0.2, s.z); L.color.copy(s.col); L.distance = s.r || 6;
    L.intensity = s.kk * 0.32;
  }
  const L = W3.pts[3]; L.position.set(px, 1.6, pz + 0.3); L.color.set('#ffd9a0'); L.distance = 4.5; L.intensity = on * 0.75;
  // 물에 비치는 불빛 8개
  for (let i = 0; i < W3_WL; i++) {
    const s = src[i];
    if (s && on > 0.01) { wu.uLP.value[i].set(s.x, s.y, s.z, s.kk * 0.5); wu.uLC.value[i].copy(s.col); } else wu.uLP.value[i].w = 0;
  }
  return { night, dusk, on };
}

function drawWorld3D() {
  if (!W3) w3dInit();
  if (W3.S !== S) w3dReset();
  const now = performance.now(), dt = Math.min(0.1, (now - W3.lastT) / 1000); W3.lastT = now;
  R3D.tick(dt);
  W3.frame++;
  if (typeof EVCAM !== 'undefined' && EVCAM.k > 0.3 && w3dRealOK()) w3dCollide(S.player);
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
  // 3인칭 (사람 찾기 등 '장면 속으로'): 위에서 내려다보는 시점 → 영주 어깨 뒤 낮은 시점으로 부드럽게
  const ek = typeof EVCAM !== 'undefined' ? EVCAM.k : 0;
  const hk = w3dTPCam(cam, px, pz, ek), pk = W3_PK + (1 - hk) / (1 - W3_TP.hk) * (W3_TP.hk - W3_PK); // pk: 사람·말 배율 (위 W3_PK → 3인칭 W3_TP.hk)
  W3.pk = pk;
  // 나무 걷어내기: 카메라와 영주 사이(+ 3인칭이면 카메라 바로 앞)의 잎을 점무늬로 (real3d.js fadeHook)
  if (typeof RA !== 'undefined' && RA.U && RA.U.fade) RA.U.fade.value.set(px, (p.mounted ? 1.25 : 0.8) * pk * 1.45, pz, ek > 0.5 ? 1 + ek : 0.85);
  cam.updateMatrixWorld();
  W3.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); W3.frustum.setFromProjectionMatrix(W3.pm);

  // 그림자 카메라: 화면 중심보다 조금 북쪽(위), 1단위 격자에 맞춰 흔들림 방지
  let scx = Math.round(W3.tx), scz = Math.round(W3.tz - 2);
  if (ek > 0.5) { scx = Math.round(px + Math.sin(EVCAM.yaw) * 7); scz = Math.round(pz - Math.cos(EVCAM.yaw) * 7); } // 3인칭: 앞쪽 위주
  W3.sun.target.position.set(scx, 0, scz); W3.sun.position.copy(w3dSunDir).multiplyScalar(45).add(W3.sun.target.position);
  W3.sun.target.updateMatrixWorld();
  { // 그림자 범위를 화면에 맞게 좁혀 해상도를 높인다
    const sh = ek > 0.5 ? 12 : clamp(Math.round(W3.dist * 0.55), 10, 21), sc = W3.sun.shadow.camera;
    if (sc.right !== sh) { sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh; sc.updateProjectionMatrix(); }
  }

  // 바뀐 타일/영토 반영
  const markG = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; W3.chunks[((y / CK) | 0) * NCK + ((x / CK) | 0)].gDirty = true; };
  for (const i of w3dDirtyTiles) {
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) markG(x + dx, y + dy);
    W3.chunks[((y / CK) | 0) * NCK + ((x / CK) | 0)].pDirty = true; W3.prevHp[i] = S.hp[i];
    w3dSplatPx(i); W3.splat.needsUpdate = true;
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
    const ksnap = W3.kSnap || (W3.kSnap = new Int8Array(W * H).fill(-1));
    for (let i = 0; i < W * H; i++) if (owner[i] !== snap[i] || kOwner[i] !== ksnap[i]) { const x = i % W, y = (i / W) | 0; markG(x, y); markG(x + 1, y); markG(x - 1, y); markG(x, y + 1); markG(x, y - 1); W3.chunks[((y / CK) | 0) * NCK + ((x / CK) | 0)].pDirty = true; }
    snap.set(owner); ksnap.set(kOwner);
  }
  // CC0 모델이 막 준비됐으면: 숲/산 다시 만들고, 건물·사람은 새 모델로 바꿔 끼운다
  const AV = (typeof A3D !== 'undefined' ? A3D.ver : 0) * 100 + (typeof RA !== 'undefined' ? RA.ver : 0);
  if (W3.aver !== AV) {
    W3.aver = AV;
    for (const c of W3.chunks) c.pDirty = true;
    for (const [o, r] of W3.dyn) w3dDrop(o, r);
    W3.pool.clear();
  }
  // 사실적 지면 텍스처를 쓸지 바뀌면(모델 로딩 실패 → 예전 지면) 지면 메시를 다시 만든다
  { const rg = !!w3dRealGround(); if (W3.rgOn !== rg) { W3.rgOn = rg; for (const c of W3.chunks) { w3dFreeGround(c); c.gDirty = true; c.painted = false; } } }
  // 청크: 보이는 것만 만들고 그린다
  let budget = 3;
  for (const c of W3.chunks) {
    const vis = W3.frustum.intersectsBox(c.box);
    if (vis) {
      if (!c.ground) w3dMakeGround(c);
      if (c.gDirty && (!c.painted || budget-- > 0)) { w3dPaint(c); c.gDirty = false; c.painted = true; }
      if (!c.props || (c.pDirty && (!c.propsAV || c.propsAV === AV || budget-- > 0))) { w3dBuildProps(c); c.propsAV = AV; }
    }
    if (c.ground) c.ground.visible = vis;
    if (c.props) { if (c.props.visible !== vis) W3.realDirty = true; c.props.visible = vis; }
  }
  // 채워 둔 사실적 숲·바위 (화면 안 것만)
  w3dRealFill();
  // 벌목 흔들림
  let chopI = -1, chopV = 0;
  for (const [i, v] of chopFx) if (S.tiles[i] === FOREST && v > chopV) { chopV = v; chopI = i; }
  if (chopI >= 0) W3.uChop.value.set(chopI % W + 0.5, ((chopI / W) | 0) + 0.5, chopV * 4); else W3.uChop.value.z = 0;
  W3.water.material.uniforms.uTime.value = tm;
  if (typeof RA !== 'undefined' && RA.U) { RA.U.time.value = tm; RA.U.chop.value.copy(W3.uChop.value); }
  W3_RGU.nOn.value = R3D.quality && R3D.quality() === 'low' ? 0 : 1;

  // 동적 오브젝트
  const bars = [], labels = [], lights = [], coins = [];
  const BL = W3.blobs; BL.begin();
  const smoke = w3dSmokeBegin(); // 굴뚝·기차 연기 (근대)
  w3dRail(dt, tm, smoke, lights); // 철도 · 기차 (근대 + 🚂 철도)
  const LE = W3_LAMP[clamp(S.era | 0, 0, ERAS.length - 1)], lampN = { torch: 0, lantern: 0, lamp: 0, gas: 0 };
  const litFrac = clamp(0.3 + S.era * 0.14 + S.towns.reduce((s, t) => s + t.pop, 0) / 300, 0.2, 0.95);
  for (const t of S.towns) {
    const x = t.x + 0.5, z = t.y + 0.5;
    if (!w3dInView(x, z, 3)) continue;
    const col = TOWN_COLORS[t.id % TOWN_COLORS.length];
    if (w3dRealOK() && w3dRealTownDraw(t, x, z, col, AV, labels, lights, LE, lampN, tm)) continue;
    const r = w3dUse(t, 'town|' + col + '|' + AV, () => {
      const group = new THREE.Group(), main = new THREE.Mesh(undefined, R3D.mats.vc), glow = new THREE.Mesh(undefined, R3D.mats.glow), flag = w3dFlag(col);
      main.castShadow = main.receiveShadow = true; group.add(main, glow, flag.mesh);
      return { group, main, glow, flag, lv: 0 };
    });
    const m = r.m, lv = townLevel(t);
    if (m.lv !== lv) {
      const ac = typeof A3D !== 'undefined' ? A3D.castle(lv) : null;
      if (ac) { m.main.geometry = ac.geo; m.main.material = A3D.mat; m.glow.visible = false; m.flag.mesh.position.set(...ac.flag); m.top = ac.top; m.sy = 1; m.sxz = 1; }
      else { const cg = w3dCastle(lv); m.main.geometry = cg.main; m.main.material = R3D.mats.vc; m.glow.geometry = cg.glow; m.glow.visible = true; m.flag.mesh.position.set(...cg.flag); m.top = cg.top; m.sy = 1.4; m.sxz = 1.08; }
      m.lv = lv;
    }
    if (m.era !== S.era) { // 시대 모습: 부족 시대엔 나무 말뚝 울타리, 근세엔 조금 더 크게
      m.era = S.era;
      if (S.era === 0 && !m.pal) { m.pal = new THREE.Mesh(w3dPalisadeGeo(), R3D.mats.vc); m.pal.castShadow = m.pal.receiveShadow = true; m.group.add(m.pal); }
      if (m.pal) m.pal.visible = S.era === 0;
    }
    const ek = S.era >= 3 ? 1.12 : 1;
    m.group.position.set(x, 0, z); m.group.scale.set(m.sxz * ek, m.sy * ek, m.sxz * ek); w3dWave(m.flag, tm);
    if (m.pal) { const ps = 1 + (lv - 1) * 0.18, gx = m.sxz * ek, gy = m.sy * ek; m.pal.scale.set(ps / gx, 1 / gy, ps / gx); } // 성 크기 배율과 무관하게
    labels.push({ x, y: m.top * m.sy + 0.35, z, s: townLabel(t), war: S.war && S.war.town === t.id });
    // 등불·횃불 기둥 + 성 안 불빛(마당을 밝힘)
    const LM = W3.lamps[LE.k];
    for (const [lx, lz] of w3dTownLamps(t, m)) {
      if (lampN[LE.k] < 160) { w3dM4.makeTranslation(lx, 0, lz); LM.setMatrixAt(lampN[LE.k]++, w3dM4); }
      lights.push({ x: lx + LE.dx, y: LE.y, z: lz, col: LE.col, k: LE.i, glow: 0.6, pool: 1.6, fire: LE.fire, real: true, r: 5 });
    }
    lights.push({ x, y: Math.min(1.6, m.top * m.sy * 0.4), z: z + 0.7, col: W3_WIN, k: 0.8, glow: 0, pool: 2.0 + lv * 0.2, real: true, r: 4 + lv * 0.5 });
  }
  w3dKingdoms(AV, labels, lights, tm);
  for (const b of w3dBldList()) {
    const x = b.x + 0.5, z = b.y + 0.5;
    if (!w3dInView(x, z, 1.5)) continue;
    const col = b.kcol || TOWN_COLORS[b.town % TOWN_COLORS.length];
    // CC0 모델이 있으면 그걸(집은 두 가지 모양), 없거나 모르는 종류면 절차적 모델
    const btype = b.type === 'house' && hash2(b.x, b.y) > 0.5 ? 'house2' : b.type;
    const rb = w3dRealBld(b);
    const ab = !rb && typeof A3D !== 'undefined' ? A3D.building(btype) : null;
    const r = w3dUse(b, rb ? 'rb|' + rb + (b.type === 'tower' ? col : '') + '|' + AV : 'b|' + btype + (ab ? '|a' : b.type === 'tower' ? col : ''), () => {
      if (rb) return w3dRealBldMake(b, rb);
      const group = new THREE.Group();
      if (ab) {
        const main = new THREE.Mesh(ab.geo, A3D.mat); main.castShadow = main.receiveShadow = true; group.add(main);
        let flag = null; if (b.type === 'tower') { flag = w3dFlag(col, 0.3, 0.19); flag.mesh.position.set(0.02, ab.top + 0.25, 0); group.add(flag.mesh); const pole = new THREE.Mesh(R3D.cached('w3pole', () => R3D.merge([{ g: R3D.prim.cyl(0.015, 0.015, 0.36, 4), c: '#3a2a1a', p: [0, 0.18, 0] }])), R3D.mats.vc); pole.position.y = ab.top - 0.08; group.add(pole); }
        return { group, flag, sc: [1, 1, 1] };
      }
      const bg = w3dBuildingGeo(b.type), main = new THREE.Mesh(bg.main, R3D.mats.vc);
      main.castShadow = main.receiveShadow = true; group.add(main);
      if (bg.glow) group.add(new THREE.Mesh(bg.glow, R3D.mats.glow));
      let flag = null; if (bg.flag) { flag = w3dFlag(col, 0.3, 0.19); flag.mesh.position.set(...bg.flag); group.add(flag.mesh); }
      return { group, flag, sc: W3_BSCALE[b.type] || [1, 1, 1] };
    });
    r.m.group.position.set(x, 0, z); if (b.type === 'farm') r.m.group.scale.set(...r.m.sc); else r.m.group.scale.set(r.m.sc[0] * W3_BK[0], r.m.sc[1] * W3_BK[1], r.m.sc[2] * W3_BK[2]); if (r.m.ry !== undefined) r.m.group.rotation.y = r.m.ry;
    if (r.m.flag) w3dWave(r.m.flag, tm);
    if (b.type !== 'farm') BL.add(x, z, b.type === 'tower' ? 0.4 : 0.68); // 건물 밑 접지 그늘 (낮음 품질은 그림자맵이 없어 떠 보였다)
    if (W3_STACKS[b.type] && !rb && !ab) { const sc = r.m.sc; for (const st of W3_STACKS[b.type]) smoke.push(x + st[0] * sc[0], st[1] * sc[1], z + st[2] * sc[2], 1, 0.32, b.x * 7 + b.y + st[0]); }
    if (b.type === 'tower') lights.push({ x, y: 1.75, z: z + 0.3, col: LE.col, k: 2.6, glow: 0.7, pool: 1.7, fire: S.era === 0, real: true, r: 5 });
    else if (W3_WINB[b.type] && hash2(b.x * 3 + 1, b.y * 5 + 2) < litFrac) lights.push({ x: x + 0.05, y: 0.45, z: z + 0.5, col: W3_WIN, k: 1.5, glow: 0.42, pool: 0.95 });
  }
  for (const c of S.camps) {
    const x = c.x + 0.5, z = c.y + 0.5;
    if (!w3dInView(x, z, 2)) continue;
    const r = w3dUse(c, 'camp|' + AV, () => {
      const group = new THREE.Group(); group.scale.set(1.3, 1.45, 1.3); const main = new THREE.Mesh(w3dCampGeo(), R3D.mats.vc), flame = new THREE.Mesh(w3dFlameGeo(), R3D.mats.fire), flag = w3dFlag('#2a1a1a', 0.3, 0.2);
      main.castShadow = main.receiveShadow = true; flame.position.set(0.45, 0.04, 0.38); flag.mesh.position.set(-0.13, 1.22, -0.15);
      group.add(main, flame, flag.mesh);
      const ap = typeof A3D !== 'undefined' ? A3D.campProps() : null;
      if (ap) { const pm = new THREE.Mesh(ap, A3D.mat); pm.castShadow = pm.receiveShadow = true; pm.scale.set(1 / 1.3 * 0.62, 1 / 1.45 * 0.62, 1 / 1.3 * 0.62); pm.position.set(0.05, 0, 0.05); group.add(pm); }
      return { group, flame, flag };
    });
    const m = r.m;
    m.group.position.set(x + (c.hit ? rr(-0.06, 0.06) : 0), 0, z);
    const f = 1 + Math.sin(tm * 14 + c.x) * 0.12 + Math.sin(tm * 23) * 0.08;
    m.flame.scale.set(1 + Math.sin(tm * 19) * 0.08, f, 1 + Math.cos(tm * 17) * 0.08);
    w3dWave(m.flag, tm);
    bars.push({ x, y: 2.1, z, f: c.hp / c.maxHp, col: '#e44' });
    lights.push({ x: x + 0.58, y: 0.6, z: z + 0.5, col: W3_FIRE, k: 3.6, glow: 1.2, pool: 2.6, fire: true, real: true, r: 6 });
    if (rand() < 0.08) emit((c.x + 0.5) * T + 0.58 * T, (c.y + 0.5) * T + 0.5 * T - 8, 1, { color: '#ffb02e', kind: 'spark', smin: 10, smax: 30, up: 40, lmin: 0.4, lmax: 0.8, zmin: 1, zmax: 1.5 });
  }
  for (const h of S.horses) {
    if (h.ridden) continue;
    const x = h.x / T, z = h.y / T; if (!w3dInView(x, z, 1)) continue;
    const r = w3dUse(h, R3D.horse.key(h.col, R3D.CLOTH.wild), () => { const m = R3D.horse(h.col, R3D.CLOTH.wild); m.group.scale.setScalar(W3_HS); return m; });
    const mv = !!(h.vx || h.vy);
    r.m.pose({ walk: h.walk, moving: mv, ridden: false, yaw: w3dFaceMove(r, x, z, dt, mv ? Math.atan2(h.vx, h.vy) : undefined) });
    r.m.group.position.set(x, 0, z); BL.add(x, z, 0.62);
  }
  for (const v of villagers) {
    const x = v.x / T, z = v.y / T; if (!w3dInView(x, z, 1)) continue;
    let lk = W3.look.get(v);
    if (!lk) { lk = { body: v.body, legs: v.legs || '#4a3a2a', hat: v.hat === undefined ? (rand() > 0.5 ? 'band' : null) : (v.hat && rand() > 0.4 ? v.hat : null), helm: '#e8d8b0', hair: ['#3a2414', '#6a4a2a', '#222'][ri(3)], scale: 1.1, lod: 1, role: 'villager' }; W3.look.set(v, lk); }
    const r = w3dHuman(v, lk);
    const moved = r.lx !== null && (Math.abs(x - r.lx) + Math.abs(z - r.lz)) > 1e-4;
    // 일하는 몸짓: 농사·집안일·대장일·물 긷기(v.act) / 벌목·채석·채굴 일꾼(v.ph 1) → 공격 동작을 천천히 반복 (괭이질·망치질처럼)
    const work = !moved && ((v.job && v.ph === 1) || (v.act && VWORK_ANIM[v.act]));
    let face;
    if (v.talkT > 0) face = Math.atan2(p.x - v.x, p.y - v.y);
    else if (!moved && v.act && v.fx !== undefined) face = Math.atan2(v.fx - v.x, v.fy - v.y);
    else if (work && v.job && v.ti) face = Math.atan2((v.ti % W + .5) * T - v.x, (((v.ti / W) | 0) + .5) * T - v.y);
    const wph = v.wph === undefined ? (v.wph = rand()) : v.wph;
    r.m.pose({ walk: v.walk, moving: moved, slow: true, swing: work ? 1 - ((tm * (v.act === 'water' ? 0.45 : 0.75) + wph) % 1) : 0, yaw: w3dFaceMove(r, x, z, dt, face) });
    r.m.group.position.set(x, 0, z); BL.add(x, z, 0.3);
  }
  for (const b of bandits) {
    const x = b.x / T, z = b.y / T; if (!w3dInView(x, z, 1.5)) continue;
    const look = b.war && (b.cmd || !b.ut) ? w3dWarLook(b.cmd) : !b.ut && !b.war ? w3dEraLook('bandit', { scale: 1.45, lod: 1 }) : w3dUnitLook(banditLook(b));
    const dpx = p.x - b.x, dpy = p.y - b.y, near = dpx * dpx + dpy * dpy < 44 * 44;
    w3dRider(b, look, x, z, dt, { cloth: b.war ? R3D.CLOTH.foe : R3D.CLOTH.bandit, swing: (b.swing || 0) / 0.25, face: near ? Math.atan2(dpx, dpy) : b.swing > 0 ? Math.atan2(b.face || 1, 0) : undefined }, BL);
    const sc = look.scale || 1;
    bars.push({ x, y: 1.12 * sc + 0.1 + (look.mount ? R3D.mountUp(W3_HS) : 0), z, f: b.hp / (b.maxHp || 3), col: '#e44' });
    if (b.loot) coins.push({ x, y: 0.5, z });
  }
  for (const e of envoys) { // 이웃 왕국 사신 (말 탄 전령)
    const x = e.x / T, z = e.y / T; if (!w3dInView(x, z, 1.5)) continue;
    const k = S.kingdoms[e.k]; if (!k) continue;
    const look = w3dUnitLook(unitLook('rider', 'foe', kEra(k), kFaction(k)));
    w3dRider(e, look, x, z, dt, { cloth: R3D.CLOTH.foe, swing: 0 }, BL);
    labels.push({ x, y: 2.3, z, s: `${kCiv(k).icon} 사신`, war: e.kind === 'declare' });
  }
  for (const s of soldiers) { // 훈련된 아군 병사
    const x = s.x / T, z = s.y / T; if (!w3dInView(x, z, 1.5)) continue;
    const look = w3dUnitLook(unitLook(s.ut, 'ally', S.era));
    w3dRider(s, look, x, z, dt, { swing: (s.swing || 0) / 0.25, face: s.tgt && bandits.includes(s.tgt) && s.swing > 0 ? Math.atan2(s.tgt.x - s.x, s.tgt.y - s.y) : undefined }, BL);
    if (s.hp < s.maxHp) bars.push({ x, y: 1.12 * 1.45 + 0.1 + (look.mount ? R3D.mountUp(W3_HS) : 0), z, f: s.hp / s.maxHp, col: '#4fa3ff' });
  }
  // 영주
  {
    const r = w3dHuman(p, w3dEraLook('player', { scale: 1.45 * 1.1 })), yaw = R3D.yaw(p.dir || 0);
    const sw = swing > 0 ? swing / 0.2 : 0;
    if (p.mounted) {
      const h = S.horses.find(h => h.ridden);
      const hc = h ? h.col : '#8b5a2b';
      const hr = w3dUse(h || 'riderHorse', R3D.horse.key(hc, R3D.CLOTH.king), () => { const m = R3D.horse(hc, R3D.CLOTH.king); m.group.scale.setScalar(W3_HS); return m; });
      hr.m.pose({ walk: (p.walk || 0) * 0.6, moving: p.moving, ridden: true, yaw }); hr.m.group.position.set(px, 0, pz); BL.add(px, pz, 0.62);
      r.m.pose({ sit: true, swing: sw, yaw }); R3D.ride(hr.m, r.m.group, px, 0, pz, W3_HS);
    } else {
      r.m.pose({ walk: p.walk, moving: p.moving, swing: sw, yaw }); r.m.group.position.set(px, 0, pz); BL.add(px, pz, 0.42);
    }
    r.m.flash(p.hurt > 0.15);
    if (ek < 0.5) bars.push({ x: px, y: 2.05 + (p.mounted ? R3D.mountUp(W3_HS) - 0.05 : 0), z: pz, f: p.hp / heroMaxHp(), col: '#4c4' });
    W3.slash.visible = swing > 0;
    if (swing > 0) {
      W3.slash.position.set(px, (p.mounted ? 0.75 + R3D.mountUp(W3_HS) * 0.93 : 0.75) * pk, pz); W3.slash.scale.setScalar(1.4 * pk); W3.slash.rotation.y = -(p.dir || 0);
      W3.slash.material.opacity = Math.min(1, swing * 5);
    }
  }
  w3dEvent(dt, tm, BL); // 사람 찾기: 잃어버린 사람 + 희미한 빛기둥
  { // 3인칭: 사람·말을 작게 (집·나무 크기에 맞춰). 풀에서 다시 꺼낸 것도 있으니 매 프레임 맞춘다
    for (const [, r] of W3.dyn) {
      if (r.seen !== W3.frame) continue;
      const m = r.m, gp = m.group;
      if (m.look && m.pose) { gp.scale.setScalar((m.look.scale || 1) * pk); gp.position.y *= pk; }
      else if (r.pk.startsWith('horse|')) gp.scale.setScalar(W3_HS * pk);
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

  BL.end();
  w3dSmokeEnd(smoke, tm);
  w3dFieldGuns(W3.fguns, [bandits, soldiers], dt);
  for (const k in W3.lamps) { const m = W3.lamps[k]; m.count = lampN[k]; m.visible = lampN[k] > 0; m.instanceMatrix.needsUpdate = true; }
  const L = w3dLighting(lights);
  R3D.render(W3.scene, W3.cam);

  // ---------- 2D 오버레이 ----------
  R3D.overlay();
  const g = ctx, pr = {};
  const ppu = R3D.ppu(W3.tx, 0, W3.tz), ks = clamp(ppu / 32, 0.85, 1.6);
  { // 마을 이름표: 화면 축척과 거의 무관한 작은 크기 (3인칭에서 화면을 가리던 큰 이름표 → 작게, 가까우면 흐리게)
    const kl = clamp(ppu / 32, 0.8, 1.05);
    for (const l of labels) {
      R3D.project(l.x, l.y, l.z, pr); if (!pr.vis) continue;
      let a = 1;
      if (ek > 0.3) { const d = Math.hypot(l.x - W3.cam.position.x, l.z - W3.cam.position.z); a = clamp((d - 3) / 4, 0, 1) * clamp((24 - d) / 6, 0, 1); if (a <= 0.02) continue; }
      g.globalAlpha = a; g.textAlign = 'center'; g.font = `800 ${Math.round(11 * kl)}px system-ui, sans-serif`;
      const tw = g.measureText(l.s).width + 11 * kl, hh = 16 * kl;
      g.fillStyle = 'rgba(0,0,0,.5)'; rrect(g, pr.x - tw / 2, pr.y - hh, tw, hh, hh / 2); g.fill();
      g.fillStyle = '#fff'; g.fillText(l.s, pr.x, pr.y - 4.3 * kl);
      if (l.war) { g.font = `${Math.round(18 * kl)}px system-ui`; g.fillText('⚔️', pr.x + tw / 2 + 11 * kl, pr.y - 2 + Math.sin(tm * 6) * 2); }
    }
    g.globalAlpha = 1;
  }
  drawShots3D(g, shots, pr, ks, 0.85, 14);
  for (const c of coins) { R3D.project(c.x + 0.25, c.y, c.z, pr); g.fillStyle = '#ffd34d'; g.strokeStyle = '#7a5200'; g.lineWidth = 1; g.beginPath(); g.arc(pr.x, pr.y, 3.5 * ks, 0, 7); g.fill(); g.stroke(); }
  for (const b of bars) {
    R3D.project(b.x, b.y * pk, b.z, pr); if (!pr.vis) continue;
    const w = 28 * ks, hgt = 5 * ks;
    g.fillStyle = 'rgba(0,0,0,.6)'; rrect(g, pr.x - w / 2, pr.y, w, hgt, hgt / 2); g.fill();
    g.fillStyle = b.col; rrect(g, pr.x - w / 2 + 1, pr.y + 1, (w - 2) * clamp(b.f, 0, 1), hgt - 2, (hgt - 2) / 2); g.fill();
  }
  // 파티클 (게임 픽셀 좌표 → 지면 근처 높이로 투영)
  const ppk = ppu / T;
  for (const q of parts) {
    R3D.project(q.x / T, 0.35, q.y / T, pr); if (!pr.vis) continue;
    const a = clamp(q.life / q.max, 0, 1);
    g.globalAlpha = q.kind === 'smoke' ? a * 0.45 : a;
    if (ek > 0.3 && q.kind === 'smoke') continue; // 3인칭: 땅 높이에 붙여 그리는 연기·흙먼지는 눈앞에서 커다란 얼룩이 되므로 생략
    const qk = ek > 0.001 ? Math.min(ppk, R3D.ppu(q.x / T, 0.35, q.y / T) / T) : ppk; // 3인칭: 가까운 것만 크게 (원근)
    g.fillStyle = q.color; const sz = q.size * qk;
    if (q.kind === 'spark') { g.strokeStyle = q.color; g.lineWidth = sz * 0.6; g.beginPath(); g.moveTo(pr.x, pr.y); g.lineTo(pr.x - q.vx * 0.04 * ppk, pr.y - q.vy * 0.04 * ppk); g.stroke(); }
    else if (q.kind === 'ring') { if (ek > 0.5) continue; g.strokeStyle = q.color; g.lineWidth = 3 * a; g.beginPath(); g.arc(pr.x, pr.y, sz, 0, 7); g.stroke(); }
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
  if (!(R3D.fx && R3D.fx.on)) drawVignette(0.22 + L.night * 0.15); // 후처리가 켜져 있으면 셰이더에서
  drawJoystick();
  if (p.hurt > 0) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = `rgba(200,0,0,${p.hurt * 0.8})`; ctx.fillRect(0, 0, VW, VH); }
  $('hint').textContent = act ? `행동: ${act.label}` : '';
  $('hint').style.display = act ? 'block' : 'none';
}


// ---------- 3인칭 시점 (event.js 의 EVCAM: k 0 = 위에서 · 1 = 어깨 뒤, yaw = 바라보는 방향, 0 = 북쪽(-z)) ----------
const W3_TP = { hk: 0.6, back: 1.65, up: 1.5, side: 0.32, ahead: 4, lookY: 0.8, fov: 56, fovP: 70, far: 28, fogD: 14 }; // far: 안개 끝(fogD × 1.95)까지만 그린다 (마을 건너편까지 그리면 100만 삼각형)
// 3인칭: 영주가 건물·성채·성벽·말뚝 울타리를 뚫고 지나가지 않게, 그리기 직전에 밖으로 밀어낸다 (world.js 이동 규칙은 그대로 · 장면 속 사건에서만)
function w3dPushBox(p, cx, cz, hx, hz, r) {
  const x = p.x / T, z = p.y / T, dx = x - cx, dz = z - cz, ox = hx + r - Math.abs(dx), oz = hz + r - Math.abs(dz);
  if (ox <= 0 || oz <= 0) return;
  const nx = ox < oz ? x + (dx < 0 ? -ox : ox) : x, nz = ox < oz ? z : z + (dz < 0 ? -oz : oz);
  if (passable(nx * T, nz * T)) { p.x = nx * T; p.y = nz * T; }
}
function w3dCollide(p) {
  const r = 0.16;
  for (let it = 0; it < 2; it++) {
    const x = p.x / T, z = p.y / T;
    for (const b of w3dBldList()) {
      if (b.type === 'farm' || Math.abs(b.x + 0.5 - x) > 1.4 || Math.abs(b.y + 0.5 - z) > 1.4) continue;
      const tw = b.type === 'tower';
      w3dPushBox(p, b.x + 0.5, b.y + 0.5, tw ? 0.22 : 0.44, tw ? 0.22 : 0.36, r);
    }
    for (const t of S.kingdoms ? S.towns.concat(S.kingdoms) : S.towns) {
      const cx = t.x + 0.5, cz = t.y + 0.5; if (Math.abs(cx - x) > 2.4 || Math.abs(cz - z) > 2.4) continue;
      const rec = W3.dyn.get(t), C = rec && rec.m.body && rec.m.body.col; if (!C) continue;
      if (C.box) w3dPushBox(p, cx + C.box[0], cz + C.box[1], C.box[2], C.box[3], r);
      if (C.wall) { // 네모 성벽 4면 (앞면 가운데는 성문)
        const [hs, hw, gw] = C.wall, th = 0.07;
        w3dPushBox(p, cx, cz - hs, hw, th, r); w3dPushBox(p, cx - hs, cz, th, hw, r); w3dPushBox(p, cx + hs, cz, th, hw, r);
        const sw = (hw - gw) / 2; w3dPushBox(p, cx - gw - sw, cz + hs, sw, th, r); w3dPushBox(p, cx + gw + sw, cz + hs, sw, th, r);
      }
      if (C.ring) { // 둥근 말뚝 울타리 (앞쪽 출입구)
        const dx = p.x / T - cx, dz = p.y / T - cz, d = Math.hypot(dx, dz), R = C.ring;
        if (d > 0.01 && Math.abs(d - R) < 0.07 + r && dz / d < 0.93) {
          const nd = d < R ? R - 0.07 - r : R + 0.07 + r, nx = cx + dx / d * nd, nz = cz + dz / d * nd;
          if (passable(nx * T, nz * T)) { p.x = nx * T; p.y = nz * T; }
        }
      }
    }
  }
}
// 카메라를 막는 것: 산 칸 + 건물·성채 상자(조금 넉넉히). 숲은 막지 않는다 — 카메라 앞 잎은 점무늬로 걷어내므로(real3d fadeHook) 숲에서도 시야가 넓다
function w3dTPBoxes(px, pz) {
  const L = W3.tpBox || (W3.tpBox = []); L.length = 0;
  if (!w3dRealOK()) return L;
  for (const b of w3dBldList()) {
    if (b.type === 'farm' || Math.abs(b.x + 0.5 - px) > 3.5 || Math.abs(b.y + 0.5 - pz) > 3.5) continue;
    const tw = b.type === 'tower';
    L.push(b.x + 0.5, b.y + 0.5, tw ? 0.32 : 0.56, tw ? 0.32 : 0.48);
  }
  for (const t of S.kingdoms ? S.towns.concat(S.kingdoms) : S.towns) {
    const cx = t.x + 0.5, cz = t.y + 0.5; if (Math.abs(cx - px) > 5 || Math.abs(cz - pz) > 5) continue;
    const rec = W3.dyn.get(t), C = rec && rec.m.body && rec.m.body.col;
    if (C && C.box) L.push(cx + C.box[0], cz + C.box[1], C.box[2] + 0.15, C.box[3] + 0.15);
    else if (!C) L.push(cx, cz, 1.1, 1.1); // 예전 모델: 마을 중심 전체
  }
  return L;
}
function w3dTPBlock(ptx, ptz, x, z) {
  const tx = Math.floor(x), tz = Math.floor(z), t = tileAt(tx, tz);
  if ((t === MOUNTAIN || t === GOLD) && !(tx === ptx && tz === ptz)) return true;
  if (!w3dRealOK() && t === FOREST && !(tx === ptx && tz === ptz)) return true; // 귀여운 스타일 나무는 걷어내기가 없다
  const L = W3.tpBox;
  if (L) for (let i = 0; i < L.length; i += 4) if (Math.abs(x - L[i]) < L[i + 2] && Math.abs(z - L[i + 1]) < L[i + 3]) return true;
  return false;
}
const w3dTA = new THREE.Vector3(), w3dTB = new THREE.Vector3(), w3dLA = new THREE.Vector3(), w3dLB = new THREE.Vector3();
function w3dTPCam(cam, px, pz, k) {
  if (k <= 0.001) {
    if (W3.tpOn) { W3.tpOn = false; W3.fogD = 0; cam.fov = 42; cam.near = 1; cam.far = W3.dist * 3; cam.updateProjectionMatrix(); }
    return 1;
  }
  W3.tpOn = true;
  const e = k * k * (3 - 2 * k), P = W3_TP, yaw = EVCAM.yaw;
  const fx = Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = Math.sin(yaw);
  // 카메라와 영주 사이에 숲·건물이 있으면 카메라를 영주 쪽으로 당긴다 (나무 속에 카메라가 박히지 않게)
  let bk = P.back;
  const ptx = Math.floor(px), ptz = Math.floor(pz);
  w3dTPBoxes(px, pz);
  for (let d = 0.3; d <= P.back + 0.3; d += 0.15) if (w3dTPBlock(ptx, ptz, px - fx * d + rx * P.side * d / P.back, pz - fz * d + rz * P.side * d / P.back)) { bk = Math.max(0.45, d - 0.25); break; }
  W3.tpBack = W3.tpBack === undefined || k < 0.05 ? bk : W3.tpBack + (bk - W3.tpBack) * (bk < W3.tpBack ? 0.35 : 0.06);
  const B = W3.tpBack, sd = P.side * B / P.back, pf = (P.back - B) / P.back; // pf: 당겨진 정도 → 조금 높이고 더 내려다봐서 영주가 화면에 남게
  w3dTA.copy(cam.position); w3dLA.set(W3.tx, 0, W3.tz);
  w3dTB.set(px - fx * B + rx * sd, P.up + pf * 0.9, pz - fz * B + rz * sd); // 벽에 붙으면 더 높이 올라가 어깨 너머로 내려다본다
  const ah = P.ahead * (1 - 0.7 * pf);
  w3dLB.set(px + fx * ah + rx * P.side * 0.5, P.lookY - pf * 1.4, pz + fz * ah + rz * P.side * 0.5);
  // 높이는 늦게 내려오고(위에서 다가가는 느낌) 가로 위치는 먼저 따라간다
  const eh = e * e * (3 - 2 * e);
  cam.position.set(lerp(w3dTA.x, w3dTB.x, e), lerp(w3dTA.y, w3dTB.y, eh), lerp(w3dTA.z, w3dTB.z, e));
  w3dLA.lerp(w3dLB, e); cam.lookAt(w3dLA);
  cam.fov = lerp(42, cam.aspect < 1 ? P.fovP : P.fov, e); cam.near = lerp(1, 0.08, e); cam.far = lerp(W3.dist * 3, P.far, e); cam.updateProjectionMatrix();
  W3.fogD = lerp(W3.dist, P.fogD, e);
  return lerp(1, P.hk, e);
}
// 장면 속 사건 (event.js): 사건 인물(잃어버린 사람 · 은둔자 · 도둑) + 땅 표시(보물 X · 판 구덩이 · 궤짝) + 희미한 빛기둥
function w3dEvBeam(i) {
  const L = W3.evBeams || (W3.evBeams = []);
  if (!L[i]) {
    const g = R3D.cached('evbeam', () => { const g = new THREE.CylinderGeometry(0.1, 0.16, 4, 8, 1, true); g.translate(0, 2, 0); return g; });
    if (!W3.evBeamMat) W3.evBeamMat = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0.15 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
      blending: THREE.AdditiveBlending, vertexShader: 'varying float vY; void main() { vY = position.y / 4.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uA; varying float vY; void main() { gl_FragColor = vec4(vec3(1.0, 0.92, 0.7) * uA * (1.0 - vY) * (1.0 - vY), 1.0); }' });
    const m = new THREE.Mesh(g, W3.evBeamMat); m.renderOrder = 6; m.frustumCulled = false; W3.scene.add(m); L[i] = m;
  }
  return L[i];
}
const W3_EVMARK = {
  x: () => R3D.merge([ // 돌무더기 + 붉은 천을 맨 막대
    { g: R3D.prim.ico(0.13, 0), c: '#8a8680', p: [0.1, 0.08, 0.05] }, { g: R3D.prim.ico(0.11, 0), c: '#7a766e', p: [-0.1, 0.07, 0.06] }, { g: R3D.prim.ico(0.09, 0), c: '#96928a', p: [0, 0.17, 0.02] },
    { g: R3D.prim.cyl(0.015, 0.018, 0.7, 4), c: '#5a3a20', p: [0, 0.35, -0.08] }, { g: R3D.prim.box(0.2, 0.12, 0.01), c: '#c0392b', p: [0.1, 0.62, -0.08] },
    { g: R3D.prim.box(0.5, 0.012, 0.06), c: '#c0392b', p: [0, 0.01, 0.25], r: [0, 0.78, 0] }, { g: R3D.prim.box(0.5, 0.012, 0.06), c: '#c0392b', p: [0, 0.01, 0.25], r: [0, -0.78, 0] },
  ]),
  dug: () => R3D.merge([ { g: R3D.prim.cyl(0.26, 0.3, 0.03, 9), c: '#2e2218', p: [0, 0.015, 0] }, { g: R3D.prim.ico(0.16, 0), c: '#6a4e32', p: [0.34, 0.06, 0.05], s: [1.3, 0.5, 1] }, { g: R3D.prim.ico(0.12, 0), c: '#5e4430', p: [0.3, 0.05, -0.2], s: [1.2, 0.5, 1] } ]),
  chest: () => R3D.merge([
    { g: R3D.prim.cyl(0.3, 0.34, 0.03, 9), c: '#2e2218', p: [0, 0.015, 0] }, { g: R3D.prim.box(0.42, 0.24, 0.28), c: '#6a4222', p: [0, 0.14, 0] },
    { g: R3D.prim.box(0.44, 0.05, 0.3), c: '#d8a838', p: [0, 0.27, 0] }, { g: R3D.prim.box(0.42, 0.12, 0.28), c: '#7a4c28', p: [0, 0.36, -0.1], r: [-0.9, 0, 0] },
    { g: R3D.prim.ico(0.1, 0), c: '#ffd860', p: [0, 0.3, 0.02], s: [1.6, 0.5, 1.1] }, { g: R3D.prim.box(0.06, 0.08, 0.02), c: '#d8a838', p: [0, 0.18, 0.15] },
  ]),
};
function w3dEvent(dt, tm, BL) {
  let nb = 0;
  const A = typeof evActors === 'function' ? evActors() : null, M = typeof evMarks === 'function' ? evMarks() : null, ua = 0.09 + 0.05 * Math.sin(tm * 2.2);
  if (W3.evBeamMat) W3.evBeamMat.uniforms.uA.value = ua;
  if (A) for (const a of A) {
    const x = a.x / T, z = a.y / T;
    if (a.beam) { const b = w3dEvBeam(nb++); b.visible = true; b.position.set(x, 0, z); }
    if (!w3dInView(x, z, 1)) continue;
    const r = w3dHuman(a.o, a.look);
    r.m.pose({ walk: a.walk || 0, moving: !!a.moving, yaw: w3dFaceMove(r, x, z, dt, a.yaw) });
    r.m.group.position.set(x, 0, z); BL.add(x, z, 0.24);
  }
  const ML = W3.evMarkM || (W3.evMarkM = []);
  let nm = 0;
  if (M) for (const m of M) {
    const x = m.x / T, z = m.y / T;
    if (m.st === 'x') { const b = w3dEvBeam(nb++); b.visible = true; b.position.set(x, 0, z); }
    let o = ML[nm]; if (!o) { o = ML[nm] = new THREE.Mesh(R3D.cached('evmark|x', W3_EVMARK.x), R3D.mats.vc); o.castShadow = true; o.receiveShadow = true; W3.scene.add(o); }
    nm++;
    o.geometry = R3D.cached('evmark|' + m.st, W3_EVMARK[m.st]); o.visible = true; o.position.set(x, 0, z); o.scale.setScalar(1.25);
    if (m.st === 'chest' && rand() < dt * 8) emit(m.x + rr(-6, 6), m.y - 4, 1, { color: ['#ffe58a', '#fff'], kind: 'spark', smin: 20, smax: 60, up: 50, lmin: .3, lmax: .6 }); // 궤짝 반짝임
  }
  for (let i = nm; i < ML.length; i++) ML[i].visible = false;
  if (W3.evBeams) for (let i = nb; i < W3.evBeams.length; i++) W3.evBeams[i].visible = false;
}

// ---------- 사실적 건물 · 마을 (real3d.js) ----------
const W3_RHOUSE = ['hut_tribal', 'house_ancient', 'house_medieval', 'house_earlymodern', 'house_earlymodern']; // 근대: 근세 집 그대로 (공장·철도·가로등이 시대를 보여 준다)
// 시대별 집 크기: 폭(타일) · 높이 배율 (사람이 크게 그려지는 게임이라 낮은 집은 조금 높여 읽히게)
const W3_RHFIT = { hut_tribal: [0.98, 1.12], house_ancient: [1.06, 1.3], house_medieval: [1.0, 1.1], house_earlymodern: [1.04, 1.06] };
function w3dRealBld(b) {
  if (!w3dRealOK()) return null;
  if (b.type === 'house') { const k = W3_RHOUSE[clamp(S.era | 0, 0, ERAS.length - 1)]; return RA.has(k) ? k : null; }
  if (b.type === 'farm') return RA.has('farm_field') ? 'farm_field' : null;
  if (b.type === 'tower') { const k = S.era >= 2 ? 'tower_stone' : 'tower_wood'; return RA.has(k) ? k : null; } // 부족·고대 = 통나무 망루, 중세+ = 돌 망루
  if (W3_RBFIT[b.type]) return RA.has(b.type) ? b.type : null;
  return null;
}
// 2차 건물: [폭(타일), 높이 배율] — 집(폭 ≈ 1타일)과 같은 축척
const W3_RBFIT = { school: [1.02, 1.1], market: [1.1, 1.15], lumber: [1.08, 1.2], quarry: [1.1, 1.15], mine: [0.98, 1.0], barracks: [1.14, 1.1], range: [0.96, 1.0], stable: [1.1, 1.15] };
const W3_RTFIT = { tower_wood: [0.6, 1], tower_stone: [0.62, 1] };
function w3dRealBldMake(b, k) {
  const group = new THREE.Group(), body = RA.group(k, true);
  const h = hash2(b.x * 3 + 7, b.y * 5 + 1);
  if (k === 'farm_field') {
    const s = RA.fit(k, 0.98); body.scale.set(s, s * 3.2, s); // 작물 카드(0.3m)가 위에서도 보이게 키를 키움
    group.add(body);
    return { group, flag: null, sc: [1, 1, 1], ry: h > 0.5 ? 0 : Math.PI };
  }
  if (b.type === 'tower') { // 깃발 달린 망루
    const f = W3_RTFIT[k], s = RA.fit(k, f[0]); body.scale.set(s, s * f[1], s); group.add(body);
    const top = RA.height(k) * s * f[1], col = TOWN_COLORS[b.town % TOWN_COLORS.length];
    const flag = w3dFlag(col, 0.3, 0.19); flag.mesh.position.set(0.02, top + 0.27, 0); group.add(flag.mesh);
    const pole = new THREE.Mesh(w3dPoleGeo(), R3D.mats.vc); pole.position.y = top - 0.06; group.add(pole);
    return { group, flag, sc: [1, 1, 1], ry: (h - 0.5) * 0.5 };
  }
  const f = W3_RBFIT[b.type] || W3_RHFIT[k] || [1, 1], s = RA.fit(k, f[0]);
  body.scale.set(s, s * f[1], s); group.add(body);
  // 집은 대체로 남쪽(카메라 쪽)을 보고, 조금씩 틀어 줄이 덜 반듯하게. 부족 오두막은 아무 방향
  const ry = k === 'hut_tribal' ? h * 6.28 : (h - 0.5) * 0.3 + (h > 0.85 && b.type === 'house' ? Math.PI / 2 : 0);
  return { group, flag: null, sc: [1, 1, 1], ry };
}
// 마을 중심: 시대 집(크게) 또는 성채(Lv3+ · 고대 이후) + 울타리(부족·고대 = 나무 말뚝, 중세+ = 돌 성벽) + 우물 · 모닥불
const w3dPoleGeo = () => R3D.cached('w3pole6', () => R3D.merge([{ g: R3D.prim.cyl(0.018, 0.018, 0.62, 4), c: '#3a2a1a', p: [0, 0.31, 0] }]));
function w3dRealTown(lv, era) {
  const g = new THREE.Group(), disp = [], col = { box: null, wall: null, ring: null }; // col: 3인칭 충돌용 (마을 중심 기준)
  let top, fx = 0, fz = 0, camp = null;
  const keep = era >= 1 && lv >= 3 && RA.has('castle_keep');
  if (keep) {
    const s = [0, 0, 0, 0.082, 0.092, 0.102][lv] * (era >= 3 ? 1.06 : 1) * 1.15, k = RA.group('castle_keep', true);
    k.scale.setScalar(s); k.position.z = -0.22; g.add(k);
    top = RA.height('castle_keep') * s; fz = -0.22;
    const b = RA.box('castle_keep'); // 깃대: 가장 높은 탑 위 (상자 가운데)
    col.box = [(b.min.x + b.max.x) / 2 * s, -0.22 + (b.min.z + b.max.z) / 2 * s, (b.max.x - b.min.x) / 2 * s * 0.92, (b.max.z - b.min.z) / 2 * s * 0.92];
    fx = (b.min.x + b.max.x) / 2 * s; fz += (b.min.z + b.max.z) / 2 * s;
  } else {
    const hk = W3_RHOUSE[clamp(era, 0, ERAS.length - 1)], f = W3_RHFIT[hk] || [1, 1], s = RA.fit(hk, (1.3 + lv * 0.1) * 1.1);
    const hm = RA.group(hk, true); hm.scale.set(s, s * f[1], s); hm.position.z = -0.12; g.add(hm);
    top = RA.height(hk) * s * f[1]; fz = -0.12;
    { const b = RA.box(hk); col.box = [0, -0.12, (b.max.x - b.min.x) / 2 * s * 0.85, (b.max.z - b.min.z) / 2 * s * 0.85]; }
  }
  if (era <= 1 && RA.has('palisade')) { // 나무 말뚝 고리 (앞쪽 출입구)
    const R = 1.3 + lv * 0.035, sp = 0.13, n = Math.round(Math.PI * 2 * R / (4.01 * sp)), list = [];
    for (let k = 0; k < n; k++) {
      const a = (k + 0.5) / n * Math.PI * 2; if (Math.cos(a) > 0.95) continue;
      list.push({ x: Math.sin(a) * R, z: Math.cos(a) * R, ry: a, s: sp, sx: Math.PI * 2 * R / n / (4.01 * sp) * 1.05, sy: (0.95 + hash2(k, lv) * 0.12) * 1.25 });
    }
    const pi = RA.inst('palisade', list, { shadow: true }); if (pi) { g.add(pi); disp.push(pi); col.ring = R; }
  } else if (era >= 2 && era <= 3 && RA.has('wall_stone')) { // 돌 성벽 (네모, 앞쪽 가운데 성문 자리 비움) — 근대 도시는 성벽을 헐었다
    const hs = 1.36, sw = 0.088 + lv * 0.004, side = hs * 2 + 0.2, n = Math.max(3, Math.round(side / (8 * sw)) | 1), seg = side / n, list = [];
    for (let k = 0; k < n; k++) {
      const u = -side / 2 + (k + 0.5) * seg, sx = seg / (8 * sw) * 1.02;
      const sy = 1.35; // 성벽을 사람 키보다 높게
      if (k !== (n - 1) / 2) list.push({ x: u, z: hs, ry: 0, s: sw, sx, sy });
      list.push({ x: u, z: -hs, ry: Math.PI, s: sw, sx, sy });
      list.push({ x: -hs, z: u, ry: -Math.PI / 2, s: sw, sx, sy });
      list.push({ x: hs, z: u, ry: Math.PI / 2, s: sw, sx, sy });
    }
    const wi = RA.inst('wall_stone', list, { shadow: true }); if (wi) { g.add(wi); disp.push(wi); col.wall = [hs, side / 2, seg / 2]; }
  }
  if (RA.has('well')) { const w = RA.group('well', true); w.scale.setScalar(0.17); w.position.set(0.92, 0, 0.8); w.rotation.y = -0.5; g.add(w); }
  if (era <= 2 && RA.has('campfire')) { const c = RA.group('campfire', false); c.scale.setScalar(0.24); c.position.set(-0.88, 0, 0.82); g.add(c); camp = [-0.88, 0.82]; }
  let stacks = null;
  if (era >= 4) { // 근대: 성 뒤 벽돌 공장 (굴뚝 연기)
    const fg = w3dBuildingGeo('factory'), fx0 = -1.1, fz0 = -0.95, fs = 0.8, sc = W3_BSCALE.factory;
    const fm = new THREE.Mesh(fg.main, R3D.mats.vc); fm.castShadow = fm.receiveShadow = true; fm.position.set(fx0, 0, fz0); fm.scale.set(sc[0] * fs, sc[1] * fs, sc[2] * fs); g.add(fm);
    if (fg.glow) { const gm = new THREE.Mesh(fg.glow, R3D.mats.glow); gm.position.copy(fm.position); gm.scale.copy(fm.scale); g.add(gm); }
    stacks = W3_STACKS.factory.map(st => [fx0 + st[0] * sc[0] * fs, st[1] * sc[1] * fs, fz0 + st[2] * sc[2] * fs]);
  }
  const pole = new THREE.Mesh(w3dPoleGeo(), R3D.mats.vc); pole.position.set(fx, top - 0.06, fz); pole.castShadow = true; g.add(pole);
  return { group: g, top: top + 0.6, flag: [fx + 0.02, top + 0.53, fz], camp, stacks, col, dispose() { for (const d of disp) d.userData.dispose(); } };
}
function w3dRealTownDraw(t, x, z, col, AV, labels, lights, LE, lampN, tm) {
  if (!RA.has(W3_RHOUSE[clamp(S.era | 0, 0, ERAS.length - 1)])) return false;
  const r = w3dUse(t, 'rtown|' + col + '|' + AV, () => { const group = new THREE.Group(), flag = w3dFlag(col); group.add(flag.mesh); return { group, flag, body: null, key: '' }; });
  const m = r.m, lv = townLevel(t), key = lv + '|' + S.era;
  if (m.key !== key) {
    if (m.body) { m.group.remove(m.body.group); m.body.dispose(); }
    m.body = w3dRealTown(lv, clamp(S.era | 0, 0, ERAS.length - 1)); m.group.add(m.body.group);
    m.flag.mesh.position.set(...m.body.flag); m.top = m.body.top; m.key = key;
  }
  m.group.position.set(x, 0, z); w3dWave(m.flag, tm);
  labels.push({ x, y: m.top + 0.3, z, s: townLabel(t), war: S.war && S.war.town === t.id });
  const LM = W3.lamps[LE.k];
  for (const [lx, lz] of w3dTownLamps(t, m)) {
    if (lampN[LE.k] < 160) { w3dM4.makeTranslation(lx, 0, lz); LM.setMatrixAt(lampN[LE.k]++, w3dM4); }
    lights.push({ x: lx + LE.dx, y: LE.y, z: lz, col: LE.col, k: LE.i, glow: 0.6, pool: 1.6, fire: LE.fire, real: true, r: 5 });
  }
  if (m.body.stacks && W3.smokeSrc) for (const st of m.body.stacks) W3.smokeSrc.push(x + st[0], st[1], z + st[2], 1, 0.36, t.id * 5 + st[0]);
  if (m.body.camp) lights.push({ x: x + m.body.camp[0], y: 0.28, z: z + m.body.camp[1], col: W3_FIRE, k: 3.4, glow: 0.75, pool: 1.9, fire: true, real: true, r: 5 });
  lights.push({ x, y: Math.min(1.6, m.top * 0.4), z: z + 0.7, col: W3_WIN, k: 0.8, glow: 0, pool: 2.0 + lv * 0.2, real: true, r: 4 + lv * 0.5 });
  return true;
}

// --- tap-to-act / resource buildings ---
// 벌목소·채석장·금광용 간단한 절차적 모델 (다른 모델이 없을 때 w3dBuildingGeo가 사용)
Object.assign(W3_BSCALE, { lumber: [1.2, 1.35, 1.2], quarry: [1.2, 1.3, 1.2], mine: [1.2, 1.3, 1.2], barracks: [1.2, 1.35, 1.2], range: [1.2, 1.3, 1.2], stable: [1.2, 1.3, 1.2] });
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
  } else if (type === 'barracks') { // 병영: 긴 막사 + 무기 걸이 + 깃발
    P.push({ g: box(0.86, 0.04, 0.66), c: '#8a7a5a', p: [0, 0.02, 0] });
    P.push({ g: box(0.66, 0.3, 0.36), c: '#b08a5a', p: [0, 0.17, -0.1] });
    P.push({ g: w3dPrism(0.42, 0.2, 0.72).rotateY(Math.PI / 2), c: '#8a3a2a', p: [0, 0.32, -0.1] });
    P.push({ g: box(0.14, 0.2, 0.02), c: '#4a2a18', p: [0, 0.1, 0.085] });
    for (let k = 0; k < 4; k++) P.push({ g: cyl(0.012, 0.012, 0.42, 4), c: '#6b4a2e', p: [-0.3 + k * 0.06, 0.21, 0.24], r: [0, 0, 0.12] });
    for (let k = 0; k < 4; k++) P.push({ g: cone(0.025, 0.07, 4), c: '#cfd4d8', p: [-0.3 + k * 0.06 + 0.025, 0.45, 0.24] });
    P.push({ g: box(0.3, 0.03, 0.03), c: '#5b3a20', p: [-0.21, 0.3, 0.24] });
    P.push({ g: cyl(0.1, 0.1, 0.03, 8), c: '#c9a040', p: [0.28, 0.16, 0.24], r: [Math.PI / 2, 0, 0] });
    G.push({ g: box(0.1, 0.08, 0.02), c: '#fff', p: [0.22, 0.2, 0.085] });
  } else if (type === 'range') { // 궁술장: 과녁 셋 + 울타리
    P.push({ g: box(0.86, 0.03, 0.66), c: '#a89a6a', p: [0, 0.015, 0] });
    for (const [x, z] of [[-0.25, -0.18], [0.05, -0.24], [0.33, -0.16]]) {
      P.push({ g: cyl(0.12, 0.12, 0.035, 10), c: '#f0ead8', p: [x, 0.22, z], r: [Math.PI / 2 - 0.2, 0, 0] });
      P.push({ g: cyl(0.075, 0.075, 0.04, 10), c: '#d9483b', p: [x, 0.22, z + 0.004], r: [Math.PI / 2 - 0.2, 0, 0] });
      P.push({ g: cyl(0.03, 0.03, 0.045, 8), c: '#f2c14e', p: [x, 0.22, z + 0.008], r: [Math.PI / 2 - 0.2, 0, 0] });
      P.push({ g: box(0.03, 0.22, 0.03), c: '#6b4a2e', p: [x, 0.1, z - 0.04] });
    }
    for (const x of [-0.42, 0.42]) P.push({ g: box(0.03, 0.12, 0.6), c: '#8a6a40', p: [x, 0.07, 0] });
    P.push({ g: box(0.26, 0.16, 0.14), c: '#7a5a34', p: [-0.22, 0.08, 0.22] });
    for (let k = 0; k < 3; k++) P.push({ g: cyl(0.008, 0.008, 0.2, 4), c: '#d8c8a0', p: [-0.26 + k * 0.04, 0.22, 0.22], r: [0.2, 0, 0] });
  } else if (type === 'stable') { // 마구간: 지붕 덮인 칸 + 울타리 + 건초
    P.push({ g: box(0.86, 0.03, 0.66), c: '#9a8a5a', p: [0, 0.015, 0] });
    for (const [x, z] of [[-0.36, -0.28], [0.36, -0.28], [-0.36, 0.02], [0.36, 0.02]]) P.push({ g: box(0.05, 0.36, 0.05), c: '#6b4a2e', p: [x, 0.18, z] });
    P.push({ g: box(0.76, 0.22, 0.04), c: '#a0703e', p: [0, 0.11, -0.3] });
    P.push({ g: w3dPrism(0.42, 0.18, 0.84).rotateY(Math.PI / 2), c: '#6a4a2a', p: [0, 0.36, -0.13] });
    for (const z of [0.12, 0.3]) P.push({ g: box(0.8, 0.03, 0.025), c: '#a07a4a', p: [0, 0.1 + (z > 0.2 ? 0.06 : 0), 0.31] });
    for (const x of [-0.4, 0, 0.4]) P.push({ g: box(0.04, 0.2, 0.04), c: '#7a5a30', p: [x, 0.1, 0.31] });
    P.push({ g: box(0.18, 0.14, 0.14), c: '#e0c060', p: [0.24, 0.07, 0.12] });
    P.push({ g: box(0.14, 0.12, 0.12), c: '#d8b450', p: [0.06, 0.06, 0.16] });
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

// ---------- 이웃 왕국 (kingdoms.js): 수도 + 둘레 건물 ----------
let w3dBldN = -1, w3dBldK = null, w3dBldArr = [];
function w3dBldList() { // 우리 건물 + 왕국 건물 (바뀔 때만 다시 합친다)
  const kb = kBuildings();
  if (w3dBldN !== S.buildings.length || w3dBldK !== kb || w3dBldArr.length !== S.buildings.length + kb.length || w3dBldArr[0] !== S.buildings[0]) {
    w3dBldN = S.buildings.length; w3dBldK = kb; w3dBldArr = S.buildings.concat(kb);
  }
  return w3dBldArr;
}
function w3dKingdoms(AV, labels, lights, tm) {
  if (!S.kingdoms) return;
  for (const k of S.kingdoms) {
    const x = k.x + 0.5, z = k.y + 0.5;
    if (!w3dInView(x, z, 3)) continue;
    const C = kCiv(k), lv = kCapLv(k), era = kEra(k);
    const r = w3dUse(k, 'kcap|' + C.color + '|' + AV, () => { const group = new THREE.Group(), flag = w3dFlag(C.color); group.add(flag.mesh); return { group, flag, body: null, key: '' }; });
    const m = r.m, rh = W3_RHOUSE[clamp(era, 0, W3_RHOUSE.length - 1)], real = w3dRealOK() && RA.has(rh), key = lv + '|' + era + '|' + real;
    if (m.key !== key) {
      if (m.body) { m.group.remove(m.body.group); if (m.body.dispose) m.body.dispose(); m.body = null; }
      if (real) { m.body = w3dRealTown(lv, clamp(era, 0, W3_RHOUSE.length - 1)); m.top = m.body.top; m.flag.mesh.position.set(...m.body.flag); }
      else {
        const g = new THREE.Group(), ac = typeof A3D !== 'undefined' ? A3D.castle(lv) : null;
        if (ac) { const mm = new THREE.Mesh(ac.geo, A3D.mat); mm.castShadow = mm.receiveShadow = true; g.add(mm); m.flag.mesh.position.set(...ac.flag); m.top = ac.top; }
        else { const cg = w3dCastle(lv), mm = new THREE.Mesh(cg.main, R3D.mats.vc); mm.castShadow = mm.receiveShadow = true; g.add(mm, new THREE.Mesh(cg.glow, R3D.mats.glow)); g.scale.set(1.08, 1.4, 1.08); m.flag.mesh.position.set(cg.flag[0] * 1.08, cg.flag[1] * 1.4, cg.flag[2] * 1.08); m.top = cg.top * 1.4; }
        m.body = { group: g };
      }
      m.group.add(m.body.group); m.key = key;
    }
    m.group.position.set(x, 0, z); w3dWave(m.flag, tm);
    labels.push({ x, y: m.top + 0.3, z, s: `${C.icon} ${C.name} · ${ERAS[era].name}`, war: k.st === 'war' });
    lights.push({ x, y: Math.min(1.6, m.top * 0.4), z: z + 0.7, col: W3_WIN, k: 0.8, glow: 0, pool: 2.0 + lv * 0.2, real: true, r: 4 + lv * 0.5 });
  }
}

// ---------- 근대: 굴뚝 연기 · 야포 · 철도와 기차 ----------
// 모두 공용 인스턴스 몇 개(연기 1 · 야포 1 · 침목 1 · 레일 1 · 교각 1 · 역 1) + 기차 메시 몇 개라 가볍다.
// 연기: 상태를 따로 두지 않고 시간(tm)으로 각 굴뚝의 연기 덩이 6개 위치를 계산 (올라가며 커지고 바람에 밀리다 사라짐)
const W3_PUFF_N = 160, W3_PUFF_K = 6;
function w3dSmokeInit() {
  if (W3.puffs) return;
  const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), W3_PUFF_N);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.renderOrder = 2;
  m.setColorAt(0, new THREE.Color(1, 1, 1)); W3.scene.add(m); W3.puffs = m;
  const fg = new THREE.InstancedMesh(w3dFieldGunGeo(), R3D.mats.vc, 24);
  fg.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fg.frustumCulled = false; fg.count = 0; fg.castShadow = true; W3.scene.add(fg); W3.fguns = fg;
}
// 굴뚝 목록: [x, y, z, 종류(1 공장 검은 연기 · 2 기차 흰 김), 크기, 씨앗] 여섯 개씩
function w3dSmokeBegin() { w3dSmokeInit(); const a = W3.smokeSrc || (W3.smokeSrc = []); a.length = 0; return a; }
const w3dPC = new THREE.Color();
function w3dSmokeEnd(src, tm) {
  const m = W3.puffs; let n = 0;
  for (let i = 0; i < src.length && n < W3_PUFF_N - W3_PUFF_K; i += 6) {
    const x = src[i], y = src[i + 1], z = src[i + 2], kind = src[i + 3], sz = src[i + 4], seed = src[i + 5];
    if (!w3dInView(x + 0.6, z, 2.2)) continue;
    const rise = kind === 2 ? 0.9 : 1.7, spd = kind === 2 ? 0.55 : 0.24;
    for (let j = 0; j < W3_PUFF_K; j++) {
      const ph = ((tm * spd + j / W3_PUFF_K + seed * 0.1371) % 1 + 1) % 1;
      const fade = ph < 0.12 ? ph / 0.12 : ph > 0.7 ? Math.max(0, (1 - ph) / 0.3) : 1;
      const s = sz * (0.32 + ph * 1.5) * fade, wob = Math.sin(seed * 3 + j * 1.7 + tm * 0.8) * 0.08;
      w3dM4.makeScale(s, s * 0.82, s); w3dM4.setPosition(x + ph * ph * 1.1 + wob, y + ph * rise, z - ph * 0.35 + wob * 0.5);
      m.setMatrixAt(n, w3dM4);
      const c = kind === 2 ? 0.92 - ph * 0.08 : 0.2 + ph * 0.36; w3dPC.setRGB(c, c * 0.98, c * 0.95); m.setColorAt(n, w3dPC);
      n++;
    }
  }
  m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
}
// 야포 (+x 가 포구). 바퀴 둘 · 방패판 · 가는 포신 · 포가 — battleEra.js 도 같은 모양을 쓴다
function w3dFieldGunGeo() {
  const { box, cyl, ico } = R3D.prim;
  return R3D.cached('fieldgun', () => {
    const P = [
      { g: cyl(0.045, 0.07, 1.15, 8), c: '#2e3236', p: [0.38, 0.44, 0], r: [0, 0, -Math.PI / 2 + 0.06] },
      { g: cyl(0.085, 0.085, 0.24, 8), c: '#26292c', p: [-0.16, 0.42, 0], r: [0, 0, Math.PI / 2] },
      { g: box(0.04, 0.42, 0.62), c: '#4a5048', p: [0.08, 0.52, 0] },
      { g: box(0.9, 0.08, 0.12), c: '#4a3a28', p: [-0.55, 0.2, 0], r: [0, 0, 0.32] },
      { g: box(0.2, 0.06, 0.16), c: '#3a2e22', p: [-0.98, 0.05, 0] },
      { g: cyl(0.03, 0.03, 0.66, 6), c: '#26292c', p: [-0.02, 0.36, 0], r: [Math.PI / 2, 0, 0] },
    ];
    for (const zz of [-0.3, 0.3]) {
      P.push({ g: new THREE.TorusGeometry(0.34, 0.03, 4, 14), c: '#5a3e24', p: [-0.02, 0.36, zz] });
      P.push({ g: cyl(0.06, 0.06, 0.08, 8), c: '#2e2a26', p: [-0.02, 0.36, zz], r: [Math.PI / 2, 0, 0] });
      for (let k = 0; k < 3; k++) P.push({ g: box(0.66, 0.025, 0.02), c: '#6a4a2c', p: [-0.02, 0.36, zz], r: [0, 0, k * Math.PI / 3] });
    }
    P.push({ g: box(0.3, 0.2, 0.22), c: '#4a5a3a', p: [-0.6, 0.1, 0.42] }); // 탄약 상자
    P.push({ g: ico(0.06, 0), c: '#2a2a2a', p: [-0.42, 0.06, 0.5] });
    return R3D.merge(P);
  });
}
// 오픈월드 야포병 옆에 대포 (적 군단·산적·내 병사 중 ut === 'gun')
function w3dFieldGuns(m, lists) {
  if (!m) return;
  let n = 0;
  for (const L of lists) for (const u of L) {
    if (u.ut !== 'gun' || n >= 24) continue;
    const f = u.face || 1, x = u.x / T + f * 0.62, z = u.y / T + 0.12;
    if (!w3dInView(x, z, 1.2)) continue;
    const k = Math.max(0, u.swing || 0) / 0.25 * 0.12;
    w3dQ.setFromAxisAngle(w3dUp, f > 0 ? 0 : Math.PI); w3dV.set(x - f * k, 0, z); w3dSc.setScalar(0.85);
    w3dM4.compose(w3dV, w3dQ, w3dSc); m.setMatrixAt(n++, w3dM4);
  }
  m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true;
}

// 철도: 마을들을 최소 신장 트리로 잇고, 칸 격자 위 최단 경로(물 = 다리, 산은 크게 돌아감)를 부드럽게 다듬어 침목·레일을 깐다.
// 🚂 철도 연구 + 근대 + 마을 2곳 이상일 때. 마을이 바뀔 때만 다시 만든다. 가장 긴 철길 3개에 기차가 오간다
function w3dRailPath(a, b) {
  const N = W * H, dist = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const occ = new Uint8Array(N); for (const bb of S.buildings) occ[bb.y * W + bb.x] = 1; for (const t of S.towns) occ[t.y * W + t.x] = 2;
  const cost = i => { const t = S.tiles[i]; let c = t === WATER ? 5 : t === FOREST ? 2.2 : t === MOUNTAIN || t === GOLD ? 40 : 1; if (occ[i] === 1) c += 6; else if (occ[i] === 2) c += 30; return c; };
  const s0 = a.y * W + a.x, g0 = b.y * W + b.x;
  const heap = [[0, s0]]; dist[s0] = 0;
  const push = e => { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length) {
    const [d, i] = pop(); if (done[i]) continue; done[i] = 1; if (i === g0) break;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy, k] of D8) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (done[j]) continue;
      const nd = d + k * (j === g0 ? 1 : cost(j)); if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push([nd, j]); }
    }
  }
  if (prev[g0] < 0) return null;
  const pts = []; for (let i = g0; i >= 0; i = prev[i]) { pts.push([i % W + 0.5, ((i / W) | 0) + 0.5]); if (i === s0) break; }
  return pts.reverse();
}
function w3dRailSmooth(pts) {
  for (let it = 0; it < 3; it++) { // 차이킨 다듬기
    const o = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    o.push(pts[pts.length - 1]); pts = o;
  }
  return pts;
}
// 폴리라인 → 일정 간격 표본 [{x, z, a(진행 방향 각), s(누적 길이)}]
function w3dRailSample(pts, step) {
  const out = []; let acc = 0, need = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    while (need <= acc + L) { const f = (need - acc) / L; out.push({ x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, a: ang, s: need }); need += step; }
    acc += L;
  }
  return out;
}
function w3dRailBuild() {
  const R = W3.rail;
  if (R.group) { W3.scene.remove(R.group); R.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); }
  R.group = new THREE.Group(); W3.scene.add(R.group); R.routes = [];
  const T0 = S.towns; if (T0.length < 2) return;
  // 최소 신장 트리 (프림)
  const inT = [0], edges = [];
  while (inT.length < T0.length) {
    let best = null, bd = 1e9;
    for (const i of inT) for (let j = 0; j < T0.length; j++) { if (inT.includes(j)) continue; const d = Math.hypot(T0[i].x - T0[j].x, T0[i].y - T0[j].y); if (d < bd) { bd = d; best = [i, j]; } }
    inT.push(best[1]); edges.push(best);
  }
  const ties = [], rails = [], posts = [], stations = [];
  for (const [i, j] of edges) {
    let pts = w3dRailPath(T0[i], T0[j]); if (!pts || pts.length < 4) continue;
    pts = w3dRailSmooth(pts);
    // 마을 한가운데(성)까지 들어가지 않게 양 끝을 잘라 역을 둔다
    const all = w3dRailSample(pts, 0.25), cut = 1.7;
    const L = all.length ? all[all.length - 1].s : 0; if (L < cut * 2 + 1) continue;
    const smp = all.filter(p => p.s >= cut && p.s <= L - cut);
    if (smp.length < 4) continue;
    for (const p of smp) p.s -= cut;
    smp.forEach((p, k) => {
      ties.push(p);
      if (k % 2 === 0 && k + 2 < smp.length) rails.push([p, smp[k + 2]]);
      if (k % 3 === 0 && tileAt(Math.floor(p.x), Math.floor(p.z)) === WATER) posts.push(p);
    });
    for (const e of [smp[0], smp[smp.length - 1]]) stations.push(e);
    R.routes.push({ pts: smp, L: smp[smp.length - 1].s });
  }
  const D = new THREE.Object3D(), mk = (geo, n) => { const m = new THREE.InstancedMesh(geo, R3D.mats.vc, Math.max(1, n)); m.count = n; m.receiveShadow = true; R.group.add(m); return m; };
  const { box, cyl } = R3D.prim;
  const tieG = R3D.cached('rtie', () => R3D.merge([{ g: box(0.08, 0.035, 0.36), c: '#5a4632', p: [0, 0.018, 0] }]));
  const railG = R3D.cached('rrail', () => R3D.merge([{ g: box(1, 0.035, 0.026), c: '#8a8e94', p: [0.5, 0.055, 0.11] }, { g: box(1, 0.035, 0.026), c: '#8a8e94', p: [0.5, 0.055, -0.11] }, { g: box(1, 0.012, 0.5), c: '#6e6a5e', p: [0.5, 0.004, 0] }]));
  const postG = R3D.cached('rpost', () => R3D.merge([{ g: cyl(0.04, 0.05, 0.8, 5), c: '#4a3a2a', p: [0, -0.38, 0.14] }, { g: cyl(0.04, 0.05, 0.8, 5), c: '#4a3a2a', p: [0, -0.38, -0.14] }, { g: box(0.08, 0.06, 0.42), c: '#5a4632', p: [0, -0.02, 0] }]));
  const stG = R3D.cached('rstation', () => R3D.merge([ // 작은 간이역: 승강장 + 지붕 + 벽돌 대합실
    { g: box(1.1, 0.08, 0.34), c: '#b8ae98', p: [0, 0.04, 0.36] },
    { g: box(0.5, 0.3, 0.26), c: '#9a4632', p: [0.15, 0.23, 0.42] }, { g: w3dPrism(0.36, 0.12, 0.56).rotateY(Math.PI / 2), c: '#3e4248', p: [0.15, 0.38, 0.42] },
    { g: box(0.9, 0.025, 0.3), c: '#3e4248', p: [-0.1, 0.42, 0.34] },
    { g: cyl(0.015, 0.015, 0.36, 4), c: '#22272c', p: [-0.5, 0.24, 0.24] }, { g: cyl(0.015, 0.015, 0.36, 4), c: '#22272c', p: [-0.2, 0.24, 0.24] },
    { g: box(0.16, 0.08, 0.02), c: '#f2ead6', p: [0.15, 0.48, 0.28] },
  ]));
  const tm = mk(tieG, ties.length), rm = mk(railG, rails.length), pm = mk(postG, posts.length), sm = mk(stG, stations.length);
  sm.castShadow = true;
  ties.forEach((p, k) => { D.position.set(p.x, 0, p.z); D.rotation.set(0, -p.a, 0); D.scale.set(1, 1, 1); D.updateMatrix(); tm.setMatrixAt(k, D.matrix); });
  rails.forEach(([a, b], k) => { const L = Math.hypot(b.x - a.x, b.z - a.z); D.position.set(a.x, 0, a.z); D.rotation.set(0, -Math.atan2(b.z - a.z, b.x - a.x), 0); D.scale.set(L + 0.01, 1, 1); D.updateMatrix(); rm.setMatrixAt(k, D.matrix); });
  posts.forEach((p, k) => { D.position.set(p.x, 0, p.z); D.rotation.set(0, -p.a, 0); D.scale.set(1, 1, 1); D.updateMatrix(); pm.setMatrixAt(k, D.matrix); });
  stations.forEach((p, k) => { D.position.set(p.x, 0, p.z); D.rotation.set(0, -p.a, 0); D.scale.set(1, 1, 1); D.updateMatrix(); sm.setMatrixAt(k, D.matrix); });
  for (const m of [tm, rm, pm, sm]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere && m.computeBoundingSphere(); m.frustumCulled = false; }
  // 기차: 가장 긴 철길 3개
  const locoG = R3D.cached('rloco', () => R3D.merge([
    { g: box(0.62, 0.06, 0.26), c: '#1e1e22', p: [0, 0.12, 0] },
    { g: cyl(0.11, 0.11, 0.38, 10), c: '#22262a', p: [0.1, 0.27, 0], r: [0, 0, Math.PI / 2] },
    { g: cyl(0.115, 0.115, 0.03, 10), c: '#c8a040', p: [0.02, 0.27, 0], r: [0, 0, Math.PI / 2] },
    { g: cyl(0.04, 0.055, 0.14, 8), c: '#18181a', p: [0.22, 0.43, 0] },
    { g: cyl(0.03, 0.03, 0.06, 6), c: '#c8a040', p: [0.08, 0.4, 0] },
    { g: box(0.2, 0.26, 0.26), c: '#7a1e1a', p: [-0.18, 0.3, 0] }, { g: box(0.24, 0.03, 0.3), c: '#1e1e22', p: [-0.18, 0.44, 0] },
    { g: box(0.1, 0.07, 0.02), c: '#ffe8b0', p: [-0.16, 0.34, 0.131] }, { g: box(0.1, 0.07, 0.02), c: '#ffe8b0', p: [-0.16, 0.34, -0.131] },
    { g: box(0.06, 0.08, 0.28), c: '#7a1e1a', p: [0.31, 0.15, 0], r: [0, 0, 0.5] }, // 배장기
    { g: cyl(0.03, 0.03, 0.02, 6), c: '#fff2c0', p: [0.3, 0.3, 0], r: [0, 0, Math.PI / 2] },
    ...[-0.2, 0.0, 0.18].flatMap(x => [{ g: cyl(0.075, 0.075, 0.03, 10), c: '#8a1e1a', p: [x, 0.08, 0.12], r: [Math.PI / 2, 0, 0] }, { g: cyl(0.075, 0.075, 0.03, 10), c: '#8a1e1a', p: [x, 0.08, -0.12], r: [Math.PI / 2, 0, 0] }]),
  ]));
  const carG = R3D.cached('rcar', () => R3D.merge([
    { g: box(0.52, 0.05, 0.26), c: '#1e1e22', p: [0, 0.12, 0] },
    { g: box(0.5, 0.22, 0.26), c: '#3a5a3a', p: [0, 0.26, 0] }, { g: box(0.54, 0.03, 0.3), c: '#2a2a2e', p: [0, 0.385, 0], s: [1, 1, 1] },
    ...[-0.16, 0, 0.16].flatMap(x => [{ g: box(0.09, 0.07, 0.02), c: '#f2e2b0', p: [x, 0.29, 0.131] }, { g: box(0.09, 0.07, 0.02), c: '#f2e2b0', p: [x, 0.29, -0.131] }]),
    ...[-0.17, 0.17].flatMap(x => [{ g: cyl(0.06, 0.06, 0.03, 8), c: '#2a2a2e', p: [x, 0.07, 0.12], r: [Math.PI / 2, 0, 0] }, { g: cyl(0.06, 0.06, 0.03, 8), c: '#2a2a2e', p: [x, 0.07, -0.12], r: [Math.PI / 2, 0, 0] }]),
  ]));
  R.trains = [...R.routes].sort((a, b) => b.L - a.L).slice(0, 3).filter(r => r.L > 3).map((r, k) => {
    const meshes = [new THREE.Mesh(locoG, R3D.mats.vc), new THREE.Mesh(carG, R3D.mats.vc), new THREE.Mesh(carG, R3D.mats.vc)];
    for (const m of meshes) { m.castShadow = true; R.group.add(m); }
    return { r, meshes, seed: k * 3.7 + 1.3 };
  });
}
// 철길 위 누적 길이 s 의 점 (표본 사이 보간)
function w3dRailAt(r, s, o) {
  const P = r.pts, st = P.length > 1 ? P[1].s - P[0].s : 0.25;
  const i = clamp(Math.floor(s / st), 0, P.length - 2), a = P[i], b = P[i + 1], f = clamp((s - a.s) / (b.s - a.s || 1), 0, 1);
  o.x = a.x + (b.x - a.x) * f; o.z = a.z + (b.z - a.z) * f; o.a = Math.atan2(b.z - a.z, b.x - a.x); return o;
}
const w3dRP = { x: 0, z: 0, a: 0 }, W3_TRAIN_LIGHT = new THREE.Color('#ffe6a8');
function w3dRail(dt, tm, smoke, lights) {
  const R = W3.rail || (W3.rail = { key: null, group: null, routes: [], trains: [] });
  const on = S.era >= 4 && techHas('railway') && S.towns.length >= 2;
  const key = on ? S.towns.map(t => t.x + ',' + t.y).join(';') : ''; // 마을이 바뀔 때만 (건물 하나 지을 때마다 경로를 다시 찾지 않게)
  if (key !== R.key) {
    R.key = key;
    if (on) w3dRailBuild(); else if (R.group) { W3.scene.remove(R.group); R.group = null; R.routes = []; R.trains = []; }
  }
  if (!R.group) return;
  const SP = 2.2, GAP = 0.75;
  for (const tr of R.trains) {
    const L = tr.r.L, u = (tm * SP + tr.seed * 7) % (2 * (L + 2)), fwd = u < L + 2, head = clamp(fwd ? u - 1 : 2 * (L + 2) - u - 1, 0, L);
    const dir = fwd ? 1 : -1; // 기관차가 늘 앞장선다
    tr.meshes.forEach((m, k) => {
      const s = clamp(head - dir * k * GAP, 0, L); w3dRailAt(tr.r, s, w3dRP);
      const vis = w3dInView(w3dRP.x, w3dRP.z, 1); m.visible = vis; if (!vis) return;
      m.position.set(w3dRP.x, 0.04, w3dRP.z); m.rotation.set(0, -w3dRP.a + (dir < 0 ? Math.PI : 0), 0); m.scale.setScalar(1.25);
      if (k === 0) {
        const ca = Math.cos(w3dRP.a) * dir, sa = Math.sin(w3dRP.a) * dir;
        smoke.push(w3dRP.x + ca * 0.28, 0.64, w3dRP.z + sa * 0.28, 2, 0.16, tr.seed);
        lights.push({ x: w3dRP.x + ca * 0.36, y: 0.32, z: w3dRP.z + sa * 0.36, col: W3_TRAIN_LIGHT, k: 2.2, glow: 0.4, pool: 0.9 });
      }
    });
  }
}
