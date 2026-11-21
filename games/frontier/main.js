'use strict';
// ===== 시작 / 메인 루프 =====
resize();
buildSprites();
if (!load()) { newGame(); showStart(false); } // 처음이면 시대·왕조 고르기
// 3D(WebGL) 가능하면 오픈월드는 3D로, 아니면 기존 2D. 강제 2D: 주소 끝에 ?2d 또는 localStorage 'frontier-render'='2d'
const USE3D = R3D.available() && R3D.init();
let last = performance.now(), saveT = 0;
function frame(now) {
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
        updateWorld(dt); updateParts(dt); updateFloats(dt);
        saveT += dt; if (saveT > 10) { saveT = 0; save(); }
      }
      tickBanner(dt);
      if (USE3D) drawWorld3D(); else drawWorld();
      hudWorld(); drawMinimap(dt);
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
  // 기술 · 군대 · 적 문명
  TECHS, UNITS, ENEMY_MIX, soldiers, shots, openTechPanel, openArmyPanel, startResearch, trainUnit, armyTotal, armyCap, foeEra, unitLook,
  finishResearch() { if (S.research) { S.research.p = TECH[S.research.id].cost; techTick(0); return true; } return false; },
  research(id) { if (!techHas(id)) { completeTech(id); return true; } return false; }, // 즉시 완성 (핵심 기술이면 시대 전환)
  researchEra() { for (const t of TECHS) if (t.era === S.era && !t.key && !techHas(t.id)) S.techs.push(t.id); save(); },
  researchAll() { for (const t of TECHS) if (!techHas(t.id)) S.techs.push(t.id); S.research = null; while (eraNext()) { advanceEra(true); $('eraUpPanel').classList.remove('show'); paused = false; } save(); },
  addArmy(ut, n) { S.army[ut] = (S.army[ut] | 0) + (n || 1); }, setFoeLv(v) { S.foeLv = v; },
  finishTraining() { for (const b of S.buildings) if (b.q && b.q.length) b.qt = 999; } };
