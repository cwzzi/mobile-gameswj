'use strict';
// ===== 시작 / 메인 루프 =====
resize();
buildSprites();
if (!load()) { newGame(); showStart(false); } // 처음이면 시대·왕조 고르기
// 3D(WebGL) 가능하면 오픈월드는 3D로, 아니면 기존 2D. 강제 2D: 주소 끝에 ?2d 또는 localStorage 'frontier-render'='2d'
const USE3D = R3D.available() && R3D.init();
// 그래픽 품질 (☰ 메뉴): 자동/높음/중간/낮음 → localStorage 'frontier-gfx' (post3d.js)
if (USE3D && R3D.fx) {
  const seg = $('gfxSeg'), fx = R3D.fx;
  const upd = () => {
    for (const b of seg.querySelectorAll('button')) b.classList.toggle('sel', b.dataset.q === fx.setting);
    $('gfxNow').textContent = fx.setting === 'auto' ? `(지금: ${fx.names[fx.tier]})` : (!fx.hdr && fx.setting !== 'low' ? '(이 기기는 후처리 미지원 → 낮음)' : '');
  };
  seg.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { fx.set(b.dataset.q); upd(); } });
  fx.onChange.push(upd); upd();
  $('gfxRow').style.display = 'block';
}
// 조용히(절전): 켬/끔/자동(약한 GPU면 켬) → localStorage 'frontier-quiet' (post3d.js)
if (USE3D && R3D.fx && R3D.fx.setQuiet) {
  const seg = $('quietSeg'), fx = R3D.fx;
  const upd = () => {
    const cur = fx.quietPref === null ? 'auto' : fx.quietPref ? '1' : '0';
    for (const b of seg.querySelectorAll('button')) b.classList.toggle('sel', b.dataset.q === cur);
    $('quietNow').textContent = fx.quiet ? '(켜짐: 30fps · 해상도 1x · 낮음)' : '(꺼짐)';
  };
  seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.q === 'auto') fx.quietAuto(); else fx.setQuiet(b.dataset.q === '1'); upd(); });
  fx.onChange.push(upd); upd();
  $('quietRow').style.display = 'block';
}
// 모델 스타일: 실사(기본) / 귀여운 → localStorage 'frontier-style' (core.js). 바꾸면 다시 불러온다
if (USE3D) {
  const seg = $('styleSeg');
  for (const b of seg.querySelectorAll('button')) b.classList.toggle('sel', b.dataset.q === STYLE);
  $('styleNow').textContent = STYLE === 'cute' ? '(가벼움 · 사실적 모델 안 받음)' : '(사실적 건물·나무·인물)';
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.q === STYLE) return;
    setStyle(b.dataset.q); save();
    location.replace(location.pathname + location.search.replace(/([?&])(no)?real\b&?/g, '$1').replace(/[?&]$/, '') + location.hash);
  });
  $('styleRow').style.display = 'block';
}
let last = performance.now(), saveT = 0, lastDraw = 0;
function frame(now) {
  // 숨겨진 탭: 그리지 않음 · 조용히(절전): 30fps 로 프레임 건너뛰기
  if (document.hidden || (QUIET && now - lastDraw < 1000 / 30 - 3)) { if (document.hidden) last = now; requestAnimationFrame(frame); return; }
  lastDraw = now;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  shakeAmt *= Math.exp(-12 * dt);
  try {
    if (USE3D) R3D.show(true);
    if (MODE === 'battle' && B) {
      updateBattle(dt);
      if (USE3D) drawBattle3D(); else drawBattle();
    } else {
      if (USE3D) b3Cleanup(); // 전투 장면 정리(dispose)
      if (!paused) {
        updateWorld(dt); if (MODE === 'world') { evUpdate(dt); kTick(dt); kUpdateEnvoys(dt); } updateParts(dt); updateFloats(dt);
        saveT += dt; if (saveT > 10) { saveT = 0; save(); }
      }
      tickBanner(dt);
      if (USE3D) drawWorld3D(); else drawWorld();
      hudWorld(); evHud(dt); drawMinimap(dt);
    }
    tickToast(dt);
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('visibilitychange', () => { if (document.hidden && MODE === 'world') save(); });
// 테스트·디버그용
window.__game = { get S() { return S; }, get B() { return B; }, get owned() { return ownedCount; }, bandits, startWarEvent, startBattle, askWar, get use3D() { return USE3D; }, get W3() { return W3; }, get auto() { return auto; }, villagers, get joy() { return joy; }, pickTarget, screenToWorldPx, resTiles, resRate, build, buildCheck, save, load, playerTile, owner, RES_DEF, setTile, foundTown, newTownCost,
  // 시대·왕조
  ERAS, advanceEra, openEraPanel, openChronicle, showStart, eraReqs, eraProgress, devRate, succession, newGame,
  setAge(a) { S.ruler.born = S.year - a; S.ruler.warned = false; }, addYears(n) { for (let i = 0; i < n; i++) { S.yearT = YEAR_SEC; if (eraTick(0)) break; } },
  addDev(n) { S.dev += n; }, get paused() { return paused; },
  // 그래픽 확인용: 하루 중 시각(0 해돋이 · 6 정오 · 12 해넘이 · 18 자정, 24시간 기준) / 품질
  startEvent, get ev() { return EV; }, get evq() { return EVQ; }, evBoard, evDig, EVCAM, evSay, evNearVillager,
  get quiet() { return QUIET; }, setQuiet(on) { if (R3D.fx) R3D.fx.setQuiet(on); }, get style() { return STYLE; },
  setTime(h) { S.time = (((h / 24) - 0.08 + 1) % 1) * DAY_LEN; }, setGfx(q) { if (R3D.fx) R3D.fx.set(q); },
  get gfx() { return R3D.fx ? { setting: R3D.fx.setting, tier: R3D.fx.tier, post: R3D.fx.on, hdr: R3D.fx.hdr, pr: R3D.pr, avgMs: R3D.fx.avgMs, stats: R3D.stats } : null; },
  // 기술 · 군대 · 적 문명
  TECHS, UNITS, ENEMY_MIX, soldiers, shots, openTechPanel, openArmyPanel, startResearch, trainUnit, armyTotal, armyCap, foeEra, unitLook,
  finishResearch() { if (S.research) { S.research.p = TECH[S.research.id].cost; techTick(0); return true; } return false; },
  research(id) { if (!techHas(id)) { completeTech(id); return true; } return false; }, // 즉시 완성 (핵심 기술이면 시대 전환)
  researchEra() { for (const t of TECHS) if (t.era === S.era && !t.key && !techHas(t.id)) S.techs.push(t.id); save(); },
  researchAll() { for (const t of TECHS) if (!techHas(t.id)) S.techs.push(t.id); S.research = null; while (eraNext()) { advanceEra(true); $('eraUpPanel').classList.remove('show'); paused = false; } save(); },
  addArmy(ut, n) { S.army[ut] = (S.army[ut] | 0) + (n || 1); }, setFoeLv(v) { S.foeLv = v; },
  finishTraining() { for (const b of S.buildings) if (b.q && b.q.length) b.qt = 999; } };
