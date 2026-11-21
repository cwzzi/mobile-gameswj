'use strict';
// ===== 시작 / 메인 루프 =====
resize();
buildSprites();
if (!load()) newGame();
let last = performance.now(), saveT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  shakeAmt *= Math.exp(-12 * dt);
  try {
    if (MODE === 'battle' && B) {
      updateBattle(dt);
      drawBattle();
    } else {
      if (!paused) {
        updateWorld(dt); updateParts(dt); updateFloats(dt);
        saveT += dt; if (saveT > 10) { saveT = 0; save(); }
      }
      tickBanner(dt);
      drawWorld(); hudWorld(); drawMinimap(dt);
    }
    tickToast(dt);
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('visibilitychange', () => { if (document.hidden && MODE === 'world') save(); });
// 테스트·디버그용
window.__game = { get S() { return S; }, get B() { return B; }, get owned() { return ownedCount; }, bandits, startWarEvent, startBattle, askWar };
