'use strict';
// ===== post3d.js: 그래픽 품질 단계 + 후처리 (블룸 · 톤매핑 · 색보정 · 비네트 · FXAA) =====
// r3d.js 의 R3D.render / R3D.tick 이 R3D.fx 가 있으면 이쪽을 쓴다.
//
// 품질 (localStorage 'frontier-gfx' = 'auto' | 'high' | 'medium' | 'low', 기본 auto)
//   high   : HDR 장면 + MSAA 4x(WebGL2) + 블룸 + 그림자 2048 PCF-soft + 해상도 최대 2x
//   medium : HDR 장면 + FXAA + 블룸 + 그림자 1024 PCF + 해상도 최대 1.5x
//   low    : 후처리 없음(렌더러 ACES 직접) + 그림자 없음(발밑 그림자만) + 해상도 최대 1.25x, 실제 점광원 2개
//   auto   : medium 으로 시작 → 느리면 low (그래도 느리면 해상도↓), 아주 빠르면 high 한 번 시도
//
// 후처리 파이프라인 (모바일용으로 패스 수를 줄인 구성)
//   1) 장면 → HDR(반정밀 float) 렌더 타깃 (톤매핑 없이 선형값)
//   2) 밝은 부분 추출 + 1/2 축소 → 듀얼 필터(Kawase) 블러 4단 (1/2…1/16 해상도, 아주 작다)
//   3) 마지막 한 패스: (FXAA) + 블룸 합성 + 노출 + ACES 톤매핑 + 색보정 + 비네트 + 디더 → 화면
// 장면별 색감은 R3D.grade 로 매 프레임 넘긴다 (world3d / battle3d).
const FX3D = (() => {
  if (typeof THREE === 'undefined' || typeof R3D === 'undefined') return null;
  const LS = 'frontier-gfx';
  const TIERS = {
    high: { post: true, msaa: 4, fxaa: false, shadow: 2048, soft: true, pr: 2, lights: 4 },
    medium: { post: true, msaa: 0, fxaa: true, shadow: 1024, soft: false, pr: 1.5, lights: 4 },
    low: { post: false, msaa: 0, fxaa: false, shadow: 0, soft: false, pr: 1.25, lights: 2 },
  };
  const NAMES = { auto: '자동', high: '높음', medium: '중간', low: '낮음' };
  const F = { on: false, tier: 'medium', setting: 'auto', hdr: false, names: NAMES, tiers: TIERS };
  let renderer = null, gl2 = false;
  const scenes = new Set(), lights = new Set();

  R3D.grade = { exposure: 1.0, bloom: 0.5, threshold: 1.1, knee: 0.6, sat: 1.0, contrast: 1.0, lift: new THREE.Color(0, 0, 0), gain: new THREE.Color(1, 1, 1), vignette: 0.3 };
  R3D.uWin = { value: 0 }; R3D.uWinLit = { value: 0.5 }; R3D.uRim = { value: new THREE.Color(0.28, 0.26, 0.22) }; // 창문 불빛 / 캐릭터 테두리 빛 (장면이 시간에 맞춰 바꿈)
  R3D.regScene = s => { scenes.add(s); };
  R3D.regLight = L => { lights.add(L); if (renderer) applyShadow(L); };
  R3D.quality = () => F.tier;

  // ---------- 셰이더 ----------
  const VS = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const PREFILTER = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold, uKnee;
varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 c = (s(vec2(-1.0, -1.0)) + s(vec2(1.0, -1.0)) + s(vec2(-1.0, 1.0)) + s(vec2(1.0, 1.0))) * 0.25;
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee); rq = rq * rq / (4.0 * uKnee + 1e-4);
  c *= max(rq, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c, vec3(32.0)), 1.0);
}`;
  const DOWN = `uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv - uTexel).rgb + texture2D(tSrc, vUv + uTexel).rgb;
  c += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb + texture2D(tSrc, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
  gl_FragColor = vec4(c * 0.125, 1.0);
}`;
  const UP = `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uWeight;
varying vec2 vUv;
vec3 s(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
void main() {
  vec3 c = s(-2.0, 0.0) + s(2.0, 0.0) + s(0.0, -2.0) + s(0.0, 2.0);
  c += (s(-1.0, 1.0) + s(1.0, 1.0) + s(1.0, -1.0) + s(-1.0, -1.0)) * 2.0;
  gl_FragColor = vec4(c / 12.0 * uWeight, 1.0);
}`;
  // FXAA: Timothy Lottes 의 FXAA(콘솔판) 알고리즘을 짧게 다시 쓴 것
  const FINAL = `uniform sampler2D tScene, tBloom; uniform vec2 uTexel;
uniform float uExposure, uBloom, uSat, uContrast, uVig, uTime;
uniform vec3 uLift, uGain;
varying vec2 vUv;
float lum(vec3 c) { c = c / (1.0 + c); return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 sceneColor() {
#ifdef FXAA
  vec3 nw = texture2D(tScene, vUv + vec2(-1.0, -1.0) * uTexel).rgb, ne = texture2D(tScene, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 sw = texture2D(tScene, vUv + vec2(-1.0, 1.0) * uTexel).rgb, se = texture2D(tScene, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  vec3 m = texture2D(tScene, vUv).rgb;
  float lNW = lum(nw), lNE = lum(ne), lSW = lum(sw), lSE = lum(se), lM = lum(m);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax * 0.1)) return m;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (texture2D(tScene, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tScene, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, vUv - dir * 0.5).rgb + texture2D(tScene, vUv + dir * 0.5).rgb);
  float lB = lum(b);
  return (lB < lMin || lB > lMax) ? a : b;
#else
  return texture2D(tScene, vUv).rgb;
#endif
}
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 color) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = ACESInputMat * (color / 0.6);
  color = RRTAndODTFit(color);
  return clamp(ACESOutputMat * color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
void main() {
  vec3 c = sceneColor();
#ifdef BLOOM
  c += texture2D(tBloom, vUv).rgb * uBloom;
#endif
  c = aces(c * uExposure);
  // 색보정 (선형 공간): 어두운 곳 lift, 밝은 곳 gain, 채도
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = c * uGain + uLift * (1.0 - c);
  vec3 s = toSRGB(max(c, 0.0));
  s = clamp((s - 0.5) * uContrast + 0.5, 0.0, 1.0);
  // 비네트
  vec2 d = vUv - 0.5; d.x *= 0.8;
  s *= 1.0 - uVig * smoothstep(0.18, 0.62, dot(d, d) * 1.6);
  // 디더 (어두운 밤 하늘·안개의 띠무늬 방지)
  float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  s += (n - 0.5) / 255.0;
  gl_FragColor = vec4(s, 1.0);
}`;

  // ---------- 렌더 타깃 ----------
  let rtScene = null, mips = [], quad = null, qcam = null, M = null, w0 = 0, h0 = 0, built = '';
  function mkRT(w, h, opts) {
    const rt = new THREE.WebGLRenderTarget(w, h, Object.assign({ type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false }, opts || {}));
    rt.texture.generateMipmaps = false;
    return rt;
  }
  function freeTargets() {
    if (rtScene) rtScene.dispose(); rtScene = null;
    for (const m of mips) m.dispose(); mips = [];
    built = '';
  }
  function ensureTargets() {
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    const T = TIERS[F.tier], key = sz.x + 'x' + sz.y + '|' + T.msaa;
    if (key === built) return;
    freeTargets(); built = key; w0 = sz.x; h0 = sz.y;
    rtScene = mkRT(w0, h0, { depthBuffer: true });
    if (T.msaa && gl2) rtScene.samples = T.msaa;
    let w = w0, h = h0;
    for (let i = 0; i < 4; i++) { w = Math.max(1, Math.round(w / 2)); h = Math.max(1, Math.round(h / 2)); mips.push(mkRT(w, h)); }
  }
  function mat(fs, uniforms, defines, blend) {
    const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, defines: defines || {}, depthTest: false, depthWrite: false, toneMapped: false });
    if (blend) { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendEquation = THREE.AddEquation; }
    return m;
  }
  function buildMats() {
    const u = () => ({ tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    M = {
      pre: mat(PREFILTER, Object.assign(u(), { uThreshold: { value: 1 }, uKnee: { value: 0.5 } })),
      down: mat(DOWN, u()),
      up: mat(UP, Object.assign(u(), { uWeight: { value: 1 } }), null, true),
      fin: mat(FINAL, { tScene: { value: null }, tBloom: { value: null }, uTexel: { value: new THREE.Vector2() }, uExposure: { value: 1 }, uBloom: { value: 0.5 },
        uSat: { value: 1 }, uContrast: { value: 1 }, uVig: { value: 0.3 }, uTime: { value: 0 }, uLift: { value: new THREE.Color() }, uGain: { value: new THREE.Color(1, 1, 1) } }, { BLOOM: 1 }),
    };
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), M.fin); quad.frustumCulled = false;
    qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(quad, qcam); }

  F.render = (scene, cam) => {
    const G = R3D.grade, T = TIERS[F.tier];
    ensureTargets();
    renderer.autoClear = false;
    renderer.setRenderTarget(rtScene); renderer.clear(true, true, false);
    renderer.render(scene, cam);
    // 블룸
    const bloom = G.bloom > 0.01;
    if (bloom) {
      M.pre.uniforms.tSrc.value = rtScene.texture; M.pre.uniforms.uTexel.value.set(1 / w0, 1 / h0);
      M.pre.uniforms.uThreshold.value = G.threshold; M.pre.uniforms.uKnee.value = G.knee;
      pass(M.pre, mips[0]);
      for (let i = 1; i < mips.length; i++) { M.down.uniforms.tSrc.value = mips[i - 1].texture; M.down.uniforms.uTexel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height); pass(M.down, mips[i]); }
      for (let i = mips.length - 1; i > 0; i--) { M.up.uniforms.tSrc.value = mips[i].texture; M.up.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height); M.up.uniforms.uWeight.value = 0.9; pass(M.up, mips[i - 1]); }
    }
    const fu = M.fin.uniforms;
    fu.tScene.value = rtScene.texture; fu.tBloom.value = mips[0].texture; fu.uTexel.value.set(1 / w0, 1 / h0);
    fu.uExposure.value = G.exposure; fu.uBloom.value = bloom ? G.bloom * 0.45 : 0; fu.uSat.value = G.sat; fu.uContrast.value = G.contrast; fu.uVig.value = G.vignette;
    fu.uLift.value.copy(G.lift); fu.uGain.value.copy(G.gain); fu.uTime.value = (performance.now() % 10000) * 0.01;
    const want = (T.fxaa ? 'F' : '') + (bloom ? 'B' : '');
    if (M.fin.userData.k !== want) { M.fin.userData.k = want; M.fin.defines = {}; if (T.fxaa) M.fin.defines.FXAA = 1; if (bloom) M.fin.defines.BLOOM = 1; M.fin.needsUpdate = true; }
    pass(M.fin, null);
    renderer.autoClear = true;
  };

  // ---------- 품질 적용 ----------
  function applyShadow(L) {
    const T = TIERS[F.tier];
    L.castShadow = T.shadow > 0;
    if (T.shadow && L.shadow.mapSize.x !== T.shadow) { L.shadow.mapSize.set(T.shadow, T.shadow); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } }
  }
  function apply(tier) {
    if (F.quiet) tier = 'low'; // 조용히(절전): 항상 낮음
    F.tier = tier;
    const T = TIERS[tier];
    F.on = T.post && F.hdr;
    renderer.toneMapping = F.on ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = T.shadow > 0;
    renderer.shadowMap.type = T.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.needsUpdate = true;
    for (const L of lights) applyShadow(L);
    // 톤매핑·그림자 방식이 바뀌면 재질 다시 컴파일
    for (const s of scenes) s.traverse(o => { const ms = o.material; if (!ms) return; for (const m of Array.isArray(ms) ? ms : [ms]) m.needsUpdate = true; });
    for (const m of extraMats) m.needsUpdate = true;
    R3D.pr = F.quiet ? 1 : Math.min(T.pr, window.devicePixelRatio || 1);
    renderer.setPixelRatio(R3D.pr); renderer.setSize(VW, VH, false);
    if (!F.on) freeTargets();
    for (const f of F.onChange) try { f(tier, T); } catch (e) { console.warn(e); }
    fAcc = 0; fN = 0; warm = 2;
  }
  const extraMats = new Set();
  R3D.regMat = m => extraMats.add(m); // 장면 밖에서 풀에 들어가 있는 재질도 갱신되도록
  F.onChange = [];
  F.set = setting => {
    F.setting = setting;
    try { localStorage.setItem(LS, setting); } catch (e) {}
    downFromHigh = false; slowLow = 0;
    apply(setting === 'auto' ? (F.hdr ? 'medium' : 'low') : (setting === 'high' || setting === 'medium') && !F.hdr ? 'low' : setting);
  };
  F.lights = () => TIERS[F.tier].lights;

  // ---------- 조용히(절전) ----------
  // localStorage 'frontier-quiet' = '1' 켬 | '0' 끔 | 없음(자동: 약한 GPU면 켬). 켜면 30fps(main.js) · 해상도 1x · 낮음 품질
  const LSQ = 'frontier-quiet';
  F.quiet = false; F.quietPref = null; F.weak = '';
  function setQuiet(on, store) {
    F.quiet = !!on; QUIET = F.quiet;
    if (store) { F.quietPref = F.quiet; try { localStorage.setItem(LSQ, F.quiet ? '1' : '0'); } catch (e) {} }
    if (typeof resize === 'function') resize(); // 2D 덧그림 캔버스 해상도도 낮춤
    apply(F.setting === 'auto' ? (F.hdr ? 'medium' : 'low') : (F.setting !== 'low' && !F.hdr) ? 'low' : F.setting);
  }
  F.setQuiet = on => setQuiet(on, true);
  F.quietAuto = () => { F.quietPref = null; try { localStorage.removeItem(LSQ); } catch (e) {} setQuiet(!!F.weak, false); };
  // 약한 GPU 이름 (소프트웨어 렌더러 · 오래된 내장/모바일 GPU)
  const WEAK_GPU = /swiftshader|llvmpipe|softpipe|software|microsoft basic|intel\(r\) (hd|gma)|intel hd graphics [2-5]\d{2,3}\b|mali-(4|t[6-8])|adreno \(tm\) [1-5]\d\d\b|powervr sgx|videocore/i;
  function gpuName() {
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
    } catch (e) { return ''; }
  }

  // ---------- 자동 품질 ----------
  let fAcc = 0, fN = 0, warm = 2, fastT = 0, downFromHigh = false, slowLow = 0;
  F.tick = dt => {
    if (warm > 0) { warm -= dt; return; } // 단계 바뀐 직후(셰이더 컴파일 끊김)는 재지 않음
    fAcc += dt; fN++;
    if (fAcc < 2.5) return;
    const avg = fAcc / fN; fAcc = 0; fN = 0;
    F.avgMs = Math.round(avg * 1000 * 10) / 10;
    const slow = avg > 1 / 38;
    if (F.setting === 'auto' && !F.quiet) {
      if (slow && F.tier === 'low' && F.quietPref === null) { // 낮음으로도 느리다 = 약한 GPU → 조용히 켬 (저장은 안 함: 자동 판단)
        if (++slowLow >= 2) { F.weak = 'slow'; setQuiet(true, false); return; }
      }
      if (slow) {
        if (F.tier === 'high') { downFromHigh = true; apply('medium'); return; }
        if (F.tier === 'medium') { apply('low'); return; }
      } else if (F.tier === 'medium' && !downFromHigh && avg < 1 / 56) {
        fastT += 2.5; if (fastT >= 7.5) { fastT = 0; apply('high'); return; }
      } else fastT = 0;
    }
    if (slow && R3D.pr > 1 && R3D.autoRes) { R3D.pr = Math.max(1, R3D.pr - 0.25); renderer.setPixelRatio(R3D.pr); renderer.setSize(VW, VH, false); }
  };

  F.init = () => {
    renderer = R3D.renderer;
    gl2 = renderer.capabilities.isWebGL2;
    const ext = renderer.extensions;
    F.hdr = gl2 && (ext.has('EXT_color_buffer_float') || !!ext.get('EXT_color_buffer_half_float'));
    renderer.info.autoReset = false;
    buildMats();
    let s = 'auto';
    try { s = localStorage.getItem(LS) || 'auto'; } catch (e) {}
    { const mq = /[?&]gfx=(high|medium|low|auto)\b/.exec(location.search); if (mq) s = mq[1]; }
    if (!NAMES[s]) s = 'auto';
    F.setting = s;
    F.gpu = gpuName();
    let q = null;
    try { const v = localStorage.getItem(LSQ); if (v === '1' || v === '0') q = v === '1'; } catch (e) {}
    { const mq = /[?&]quiet=(0|1)\b/.exec(location.search); if (mq) q = mq[1] === '1'; }
    F.quietPref = q;
    if (WEAK_GPU.test(F.gpu) || !F.hdr) F.weak = 'gpu';
    F.quiet = q !== null ? q : (s === 'auto' && !!F.weak); QUIET = F.quiet;
    if (F.quiet && typeof resize === 'function') resize();
    apply(s === 'auto' ? (F.hdr ? 'medium' : 'low') : (s !== 'low' && !F.hdr) ? 'low' : s);
    R3D.onResize.push(() => { built = ''; });
  };

  // ---------- 가짜 빛: 빛무리(빌보드) / 바닥 빛웅덩이 ----------
  // 실제 점광원은 비싸서 몇 개만 쓰고, 나머지 횃불·등불·창문 빛은 이걸로 흉내 낸다 (각각 그리기 1번)
  // glows: 화면을 향한 동그란 빛 (HDR 값 → 블룸으로 번짐). add(x, y, z, size, color(THREE.Color, HDR 가능))
  // pools: 바닥에 깔리는 빛. 밑의 색을 곱해서 밝힌다(dst × (1 + src)) → 어두운 땅이 불빛 색으로 물든다
  const gGeo = () => R3D.cached('fxquad', () => new THREE.PlaneGeometry(1, 1));
  const pGeo = () => R3D.cached('fxpool', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  function fxList(scene, max, geo, material) {
    const m = new THREE.InstancedMesh(geo, material, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0;
    const c0 = new THREE.Color(0, 0, 0); for (let i = 0; i < max; i++) m.setColorAt(i, c0);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
    const mm = new THREE.Matrix4(); let n = 0;
    return {
      mesh: m, get n() { return n; },
      begin() { n = 0; },
      add(x, y, z, s, col, k) {
        if (n >= max || !(k > 0.002)) return;
        mm.makeScale(s, s, s); mm.setPosition(x, y, z); m.setMatrixAt(n, mm);
        m.instanceColor.setXYZ(n, col.r * k, col.g * k, col.b * k); n++;
      },
      end() { m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; m.visible = n > 0; },
    };
  }
  R3D.glows = (scene, max) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vQ; varying vec3 vC;
void main() {
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz);
  c.xy += position.xy * s; c.z += s * 0.45; // 벽에 파묻히지 않게 카메라 쪽으로
  gl_Position = projectionMatrix * c; vQ = position.xy * 2.0; vC = instanceColor;
}`,
      fragmentShader: `varying vec2 vQ; varying vec3 vC;
void main() {
  float r2 = dot(vQ, vQ); if (r2 > 1.0) discard;
  float a = exp(-r2 * 9.0) * 1.6 + exp(-r2 * 3.0) * 0.35 * (1.0 - r2);
  gl_FragColor = vec4(vC * a, 1.0);
}`,
      depthWrite: false, toneMapped: false, fog: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    const L = fxList(scene, max, gGeo(), mat); L.mesh.renderOrder = 8; return L;
  };
  R3D.pools = (scene, max) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vQ; varying vec3 vC;
void main() { vQ = position.xz * 2.0; vC = instanceColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vQ; varying vec3 vC;
void main() {
  float r2 = dot(vQ, vQ); if (r2 > 1.0) discard;
  float a = (1.0 - r2); a = a * a * (0.35 + 0.65 * exp(-r2 * 3.0));
  gl_FragColor = vec4(vC * a, 1.0);
}`,
      depthWrite: false, toneMapped: false, fog: false, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
    });
    const L = fxList(scene, max, pGeo(), mat); L.mesh.renderOrder = 2; return L;
  };
  // 텍스처 불러오기 (실패해도 조용히): on = {value:0→1} 셰이더에서 로딩 전엔 효과를 끈다
  const tl = new THREE.TextureLoader(), texC = new Map();
  R3D.tex = (url, srgb) => {
    let e = texC.get(url);
    if (e) return e;
    const on = { value: 0 };
    const t = tl.load(url, () => { on.value = 1; }, undefined, () => console.warn('texture load failed', url));
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(4, R3D.maxAniso || 1);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    e = { tex: t, on }; texC.set(url, e);
    return e;
  };

  R3D.fx = F;
  return F;
})();
