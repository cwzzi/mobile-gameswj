'use strict';
// ===== 경쟁 왕국: 섬 곳곳에서 우리와 함께 시대를 거치며 자라는 이웃 문명 3곳 =====
// S.kingdoms[i] = { c: CIVS 번호, x, y: 수도 칸, lv: 문명 수준(소수, 시대), pow: 국력(0~100, 수도 크기),
//   rel: 우리와의 관계(-100~100), st: peace | trade | ally | war, warT, envT, score: 이 왕국 상대 전승, met, ruler }
const CIVS = [
  { id: 'horse', name: '질풍 기마국', icon: '🐎', color: '#b0432a', plume: '#f2d16b', titles: ['족장', '칸', '대칸', '대칸', '대칸'],
    people: '초원을 달리는 기마 민족', trait: '호전적', strong: '기병이 많고 진군이 빠름', weak: '기술 발전이 느림 (×0.8)',
    like: '용맹 (전쟁에서 이기면 존중)', dislike: '국경 가까이 세운 마을',
    grow: 0.8, base: -12, giftK: 0.7, warAt: -30, diff: 1.15, near: 15,
    mix: [[['club', 4], ['rider', 4]], [['rider', 5], ['spear', 3], ['archer', 2]], [['knight', 5], ['sword', 3], ['xbow', 1]], [['knight', 5], ['pike', 3], ['musket', 2]], [['hussar', 6], ['rifle', 3], ['gun', 1]]],
    bld: ['stable', 'barracks', 'house', 'stable'],
    boss: ['풍운 바투르', '질풍장 테무간', '철기장 알탄', '대장군 보르칸', '기병총감 쿠빌란'],
    names: ['바투르', '테무간', '알탄', '보르추', '쿠빌란', '차가타'],
    tradeTxt: '말 교역: 🪙 조금 + 가끔 좋은 말을 보내 줌', allyTxt: '대규모 전투에 기마 원군 6기 합류' },
  { id: 'sea', name: '청파 상인연합', icon: '⛵', color: '#1f7f8f', plume: '#ffffff', titles: ['선주', '총독', '대총독', '대총독', '의장'],
    people: '바닷가 항구 도시들의 상인 연합', trait: '실리적', strong: '교역 수입이 큼 · 원거리 병사 (투석·궁수·머스킷)', weak: '병력이 적고 약함',
    like: '선물과 교역', dislike: '전쟁 (누구와 싸우든 싫어함)',
    grow: 1.0, base: 10, giftK: 1.5, warAt: -70, diff: 0.85, near: 6,
    mix: [[['sling', 5], ['club', 4]], [['archer', 5], ['spear', 4], ['rider', 1]], [['xbow', 5], ['sword', 3], ['knight', 1]], [['musket', 6], ['pike', 3], ['knight', 1]], [['rifle', 6], ['gun', 3], ['hussar', 1]]],
    bld: ['market', 'house', 'market', 'farm'],
    boss: ['선단장 마렌', '제독 카시아', '대제독 오르벨', '총독 레반트', '포병대장 실바'],
    names: ['마렌', '카시아', '오르벨', '레반트', '실바', '네리온'],
    tradeTxt: '교역 수입 ×2.5', allyTxt: '모든 마을 세금 +15%' },
  { id: 'sage', name: '백탑 학자국', icon: '📜', color: '#6d5bb0', plume: '#f4ecd0', titles: ['현자', '왕', '국왕', '황제', '대군주'],
    people: '탑을 쌓고 별을 읽는 학자들의 나라', trait: '신중함', strong: '발전이 빨라 시대를 앞서감 (×1.35) · 단단한 중보병', weak: '기병이 거의 없음',
    like: '학당과 기술', dislike: '먼저 칼을 뽑는 것',
    grow: 1.35, base: 0, giftK: 1.0, warAt: -60, diff: 1.0, near: 8,
    mix: [[['club', 6], ['sling', 3]], [['spear', 6], ['archer', 3]], [['sword', 5], ['xbow', 3], ['spear', 2]], [['pike', 5], ['musket', 4], ['sword', 1]], [['rifle', 6], ['gun', 2], ['sword', 2]]],
    bld: ['school', 'house', 'school', 'farm'],
    boss: ['수호자 엘람', '탑지기 세오린', '성기사 아우렐', '원수 이시도르', '참모총장 테오단'],
    names: ['엘람', '세오린', '아우렐', '이시도르', '미라벨', '테오단'],
    tradeTxt: '연구 속도 +10%', allyTxt: '연구 속도 +25%' },
];
const K_ST = { peace: { n: '평화', c: '#cfd8c0' }, trade: { n: '교역 중', c: '#7dd3fc' }, ally: { n: '동맹', c: '#5be0b0' }, war: { n: '전쟁 중', c: '#ff7a6a' } };
let kOwner = new Int8Array(W * H).fill(-1);
const envoys = [];           // 오고 있는 사신 (저장 안 함)
let kBldCache = null, kTradeT = 0, kHorseT = 0;

const kCiv = k => CIVS[k.c];
const kIx = (arr, e) => arr[clamp(e | 0, 0, arr.length - 1)]; // 시대 배열이 늘어나도 마지막 항목을 쓴다
function kEra(k) { return clamp(Math.floor(k.lv + 1e-6), 0, ERAS.length - 1); }
function kCapLv(k) { return clamp(1 + Math.floor(k.pow / 22), 1, 5); }
function kRadius(k) { return 2 + kCapLv(k) + (kEra(k) >= 3 ? 1 : 0); }
function kTitle(k) { return kIx(kCiv(k).titles, kEra(k)); }
function kRuler(k) { return `${kTitle(k)} ${k.ruler}`; }
const kFacCache = new Map();
function kFaction(k) { // 전투·외형용 진영 (warFaction 형식)
  const C = kCiv(k), e = kEra(k), key = C.id + e;
  let f = kFacCache.get(key);
  if (!f) kFacCache.set(key, f = { name: C.name.split(' ')[1] + ' 군', color: C.color, plume: C.plume, boss: kIx(C.boss, e), kingdom: true });
  return f;
}
function kByWar(w) { return w && w.kingdom !== undefined && S.kingdoms ? S.kingdoms[w.kingdom] : null; }
function warMix(w) { const k = kByWar(w), e = w && w.era !== undefined ? w.era : S.era; return k ? kIx(kCiv(k).mix, e) : ENEMY_MIX[clamp(e, 0, ENEMY_MIX.length - 1)]; }
function mixText(mix) { return mix.map(m => `${UNITS[m[0]].icon}${UNITS[m[0]].name}`).join(' · '); }
function kBonus(key) { // tech.js techBonus 에 더해진다
  if (!S || !S.kingdoms) return 0;
  let s = 0;
  for (const k of S.kingdoms) {
    const id = kCiv(k).id;
    if (key === 'research' && id === 'sage') s += k.st === 'ally' ? 0.25 : k.st === 'trade' ? 0.1 : 0;
    if (key === 'income' && id === 'sea' && k.st === 'ally') s += 0.15;
  }
  return s;
}

// ---------- 만들기 / 영토 ----------
function kInit(home) {
  if (S.kingdoms && S.kingdoms.length) { kRecompute(); return; }
  const hx = home ? home.x : (S.towns[0] ? S.towns[0].x : W / 2), hy = home ? home.y : (S.towns[0] ? S.towns[0].y : H / 2);
  const cand = [];
  for (let k = 0; k < 2500; k++) {
    const x = 7 + ri(W - 14), y = 7 + ri(H - 14);
    if (tileAt(x, y) !== GRASS || !neighborsLand(x, y) || owner[y * W + x] >= 0) continue;
    let ok = true; for (const t of S.towns) if (dist2(x, y, t.x, t.y) < 26 * 26) ok = false;
    if (ok) cand.push({ x, y });
  }
  const near = (x, y, r, fn) => { let n = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (fn(tileAt(x + i, y + j))) n++; return n; };
  S.kingdoms = [];
  const order = [0, 1, 2].sort(() => rand() - 0.5);
  for (const c of order) {
    let best = null, bs = -1e9;
    for (const minD of [34, 28, 22]) {
      for (const q of cand) {
        const dh = Math.hypot(q.x - hx, q.y - hy); if (dh < minD) continue;
        if (S.kingdoms.some(k => dist2(k.x, k.y, q.x, q.y) < (minD - 4) ** 2)) continue;
        const land = near(q.x, q.y, 4, t => t !== WATER);
        if (land < 60) continue; // 영토가 될 땅이 넉넉한 곳
        let s = dh * 0.4 + land * 0.3 + rand() * 6;
        if (CIVS[c].id === 'sea') s += near(q.x, q.y, 6, t => t === WATER) * 0.5;      // 바닷가
        if (CIVS[c].id === 'horse') s += near(q.x, q.y, 5, t => t === GRASS) * 0.25;   // 넓은 풀밭
        if (CIVS[c].id === 'sage') s += near(q.x, q.y, 6, t => t === MOUNTAIN || t === GOLD) * 0.8; // 산기슭
        if (s > bs) { bs = s; best = q; }
      }
      if (best) break;
    }
    if (!best) continue;
    const era0 = S.era | 0;
    S.kingdoms.push({ c, x: best.x, y: best.y, lv: clamp(era0 + (CIVS[c].id === 'sage' ? 0.35 : CIVS[c].id === 'horse' ? -0.2 : 0.1), 0, ERAS.length - 1),
      pow: 10 + era0 * 20 + ri(8), rel: CIVS[c].base, st: 'peace', warT: 0, envT: 70 + S.kingdoms.length * 50 + ri(30), score: 0, met: false,
      ruler: CIVS[c].names[ri(CIVS[c].names.length)] });
  }
  for (const k of S.kingdoms) {
    for (let y = k.y - 1; y <= k.y + 1; y++) for (let x = k.x - 1; x <= k.x + 1; x++) if (tileAt(x, y) === FOREST) setTile(y * W + x, GRASS);
    if (kCiv(k).id === 'horse') for (let n = 0, t = 0; n < 3 && t < 80; t++) { // 기마국 둘레의 말 떼
      const x = k.x + ri(11) - 5, y = k.y + ri(11) - 5;
      if (tileAt(x, y) === GRASS && dist2(x, y, k.x, k.y) > 6) { S.horses.push(newHorse(x, y)); n++; }
    }
  }
  kRecompute();
  // 왕국 땅 안의 산적 소굴은 치운다
  S.camps = S.camps.filter(c => kOwner[c.y * W + c.x] < 0);
}
function kRecompute() {
  kOwner.fill(-1);
  if (!S.kingdoms) return;
  S.kingdoms.forEach((k, id) => {
    const r = kRadius(k);
    for (let y = k.y - r; y <= k.y + r; y++) for (let x = k.x - r; x <= k.x + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || dist2(x, y, k.x, k.y) > r * r + r) continue;
      const i = y * W + x; if (S.tiles[i] === WATER || owner[i] >= 0 || kOwner[i] >= 0) continue;
      kOwner[i] = id;
    }
  });
  kBldCache = null; minimapDirty = true;
  if (typeof w3dOwnerDirty !== 'undefined') w3dOwnerDirty = true;
}
// 수도 둘레의 건물 (국력이 클수록 많아짐) — 3D 건물 그리기에 섞어 넣는다
function kBuildings() {
  if (kBldCache) return kBldCache;
  const out = [];
  if (S.kingdoms) S.kingdoms.forEach((k, id) => {
    const C = kCiv(k), n = Math.min(C.bld.length, kCapLv(k) - 1 + (kEra(k) >= 2 ? 1 : 0));
    const spots = [[2, 0], [-2, 1], [1, 2], [-1, -2], [2, -2], [-2, -1]];
    let j = 0;
    for (let s = 0; s < spots.length && j < n; s++) {
      const x = k.x + spots[s][0], y = k.y + spots[s][1];
      if (tileAt(x, y) !== GRASS && tileAt(x, y) !== SAND) continue;
      out.push({ type: C.bld[j++], x, y, town: 0, kcol: C.color, k: id });
    }
  });
  return kBldCache = out;
}
function kAt(x, y) { const i = Math.floor(y) * W + Math.floor(x); return i >= 0 && i < W * H ? kOwner[i] : -1; }
function kNearCapital(tx, ty, r) { if (!S.kingdoms) return null; for (const k of S.kingdoms) if (Math.abs(tx - (k.x + .5)) <= r && Math.abs(ty - (k.y + .5)) <= r) return k; return null; }

// ---------- 매 프레임 ----------
let kSec = 0;
function kTick(dt) {
  if (!S.kingdoms || !S.kingdoms.length || !S.towns.length) return;
  let changed = false;
  for (const k of S.kingdoms) {
    const C = kCiv(k), e0 = kEra(k), c0 = kCapLv(k);
    const lo = S.era - 0.8, hi = Math.min(ERAS.length - 1 + 0.99, S.era + (C.id === 'sage' ? 1.25 : 0.85));
    k.lv = clamp(k.lv + dt / 300 * C.grow * (k.st === 'war' ? 0.85 : 1), lo, hi);
    k.pow = clamp(k.pow + dt / 14 * C.grow * (k.st === 'war' ? 0.6 : 1), 0, 100);
    const e1 = kEra(k);
    if (e1 > e0) toast(`📯 ${C.icon} <b>${k.name || C.name}</b>${josaP(C.name, '이가')} <b>${ERAS[e1].icon} ${ERAS[e1].name}</b>에 들어섰습니다${e1 > S.era ? ' <b style="color:#ff8a7a">(우리보다 앞섬)</b>' : ''}<br><small>주력: ${mixText(kIx(C.mix, e1))}</small>`, 4);
    if (kCapLv(k) !== c0 || e1 !== e0) changed = true;
  }
  if (changed) kRecompute();
  kSec += dt; if (kSec < 1) return; const sdt = kSec; kSec = 0;
  for (let i = 0; i < S.kingdoms.length; i++) {
    const k = S.kingdoms[i], C = kCiv(k);
    // 관계: 성향(기본값) + 지금 관계 상태 + 국경 마찰 쪽으로 천천히 움직인다
    let target = C.base + (k.st === 'trade' ? 15 : k.st === 'ally' ? 30 : k.st === 'war' ? -60 : 0);
    const nearT = S.towns.some(t => dist2(t.x, t.y, k.x, k.y) < 24 * 24); if (nearT) target -= C.near;
    if (C.id === 'horse') target += Math.min(15, S.warsWon * 2);
    if (C.id === 'sage') target += Math.min(12, S.buildings.filter(b => b.type === 'school').length * 3);
    if (C.id === 'sea' && S.kingdoms.some(o => o !== k && o.st === 'war')) target -= 8;
    k.rel = clamp(k.rel + (target - k.rel) * sdt / 150, -100, 100);
    // 선전포고
    const coming = envoys.some(e => e.k === i);
    if (k.st !== 'war' && k.rel <= C.warAt && !kBusy() && !coming) { kEnvoy(i, 'declare'); return; }
    if (k.st === 'war') {
      k.warT -= sdt;
      if (k.warT <= 0 && !kBusy()) { kInvade(i); return; }
    }
    k.envT -= sdt;
    if (k.envT <= 0 && !kBusy() && !envoys.length) { k.envT = 160 + ri(120); kEnvoy(i); return; }
  }
  // 교역 수입 (10초마다)
  kTradeT += sdt;
  if (kTradeT >= 10) {
    kTradeT = 0; let g = 0;
    for (const k of S.kingdoms) if (k.st === 'trade' || k.st === 'ally') g += Math.round((2 + kEra(k)) * (kCiv(k).id === 'sea' ? 2.5 : 1));
    if (g) { S.gold += g; const t = S.towns[0]; floatText((t.x + .5) * T, t.y * T - 30, `교역 🪙+${g}`, '#7dd3fc'); }
  }
  kHorseT += sdt;
  if (kHorseT > 90) {
    kHorseT = 0;
    const h = S.kingdoms.find(k => kCiv(k).id === 'horse' && (k.st === 'trade' || k.st === 'ally'));
    if (h && S.horses.length < 30) {
      const t = S.towns.reduce((a, b) => b.pop > a.pop ? b : a);
      for (let n = 0; n < 40; n++) { const x = t.x + ri(7) - 3, y = t.y + ri(7) - 3; if (tileAt(x, y) === GRASS) { S.horses.push(newHorse(x, y)); break; } }
      toast(`🐎 ${kCiv(h).name}에서 교역 말이 도착했습니다 (${t.name} 근처)`, 3);
    }
  }
}
function kBusy() {
  return paused || MODE !== 'world' || !!S.war || (typeof evBusy === 'function' && evBusy()) || !!document.querySelector('.panel.show');
}
function kMainTown(k) { // 왕국 수도에서 가장 가까운 우리 마을
  return S.towns.reduce((a, t) => !a || dist2(t.x, t.y, k.x, k.y) < dist2(a.x, a.y, k.x, k.y) ? t : a, null);
}
function kInvade(i) {
  const k = S.kingdoms[i], C = kCiv(k), t = kMainTown(k); if (!t) return;
  k.warT = 150 + ri(70);
  const e = kEra(k), diff = (1 + S.warsWon * 0.3 + S.towns.length * 0.1) * ERAS[e].diff * C.diff * (0.8 + k.pow / 250);
  S.war = { town: t.id, diff, faction: 0, field: false, era: e, kingdom: i };
  askWar();
}
// 우리가 수도로 쳐들어간다 (대규모 전투)
function kAttack(i) {
  const k = S.kingdoms[i], C = kCiv(k), t = kMainTown(k); if (!t || S.war) return;
  const e = kEra(k), diff = (1.2 + S.warsWon * 0.3 + S.towns.length * 0.1) * ERAS[e].diff * C.diff * (0.9 + k.pow / 200);
  S.war = { town: t.id, diff, faction: 0, field: false, era: e, kingdom: i, attack: true };
  dismount(); startBattle(S.war);
  banner(`${C.name} 수도 공격!`, `${kIx(C.boss, e)}${josaP(kIx(C.boss, e), '을를')} 쓰러뜨려라`, 3);
}
function kDeclare(i, byUs) {
  const k = S.kingdoms[i];
  k.st = 'war'; k.rel = Math.min(k.rel, -70); k.warT = byUs ? 40 : 25; k.score = 0;
  if (byUs) for (const o of S.kingdoms) if (o !== k) o.rel = clamp(o.rel - (kCiv(o).id === 'sea' ? 15 : kCiv(o).id === 'sage' ? 10 : 0) + (kCiv(o).id === 'horse' ? 5 : 0), -100, 100);
  save();
}
function kPeace(i) { const k = S.kingdoms[i]; k.st = 'peace'; k.rel = Math.max(k.rel, kCiv(k).warAt + 25); k.score = 0; k.warT = 0; save(); }
// 전쟁 결과 (world.js fieldWarWin / onBattleEnd 에서 부른다)
function kWarResult(w, win) {
  const k = kByWar(w); if (!k) return 0;
  const C = kCiv(k);
  if (win) {
    k.score += w.attack ? 2 : 1; k.pow = Math.max(0, k.pow - (w.attack ? 35 : 12));
    if (C.id === 'horse') k.rel += 10; // 용맹을 존중
    kRecompute();
    if (k.st === 'war' && k.score >= 2) k.envT = Math.min(k.envT, 8); // 곧 강화 사신
    return w.attack ? 60 + kEra(k) * 20 : 0;
  }
  k.pow = Math.min(100, k.pow + 6);
  return 0;
}

// ---------- 사신 (말 탄 사신이 우리 마을로 와서 접견) ----------
function kEnvoy(i, kind) {
  const k = S.kingdoms[i], t = kMainTown(k); if (!t) return;
  if (!kind) kind = kPickEvent(k);
  if (!kind) return;
  const tx = (t.x + .5) * T, ty = (t.y + 1.6) * T;
  const a = Math.atan2(k.y - t.y, k.x - t.x);
  let sx = tx + Math.cos(a) * T * 12, sy = ty + Math.sin(a) * T * 12;
  for (let d = 12; d > 3 && !canStand(sx, sy, 8); d--) { sx = tx + Math.cos(a) * T * d; sy = ty + Math.sin(a) * T * d; }
  envoys.push({ k: i, kind, x: sx, y: sy, tx, ty, t: 0, walk: 0, face: 1, hit: 0, ut: 'rider' });
  const C = kCiv(k);
  toast(kind === 'declare' ? `🏴 ${C.icon} <b>${C.name}</b>의 사신이 굳은 얼굴로 ${t.name}${josaP(t.name, '으로로')} 달려옵니다` : `🏇 ${C.icon} <b>${C.name}</b>의 사신이 ${t.name}${josaP(t.name, '으로로')} 오고 있습니다`, 3.5);
}
function kPickEvent(k) {
  const C = kCiv(k), L = [];
  if (!k.met) return 'meet';
  if (k.st === 'war') return k.score >= 2 || k.rel > C.warAt + 20 ? 'peace' : null;
  if (k.st === 'peace' && k.rel >= 15) L.push('tradeOffer');
  if (k.st === 'trade' && k.rel >= 55) L.push('allyOffer');
  if (k.st === 'ally') L.push('aid');
  if (C.id === 'horse') L.push(k.rel < 10 ? 'tribute' : 'horses');
  if (C.id === 'sea') L.push('buyWood', 'buyWood');
  if (C.id === 'sage') L.push('scholars', 'stars');
  return L[ri(L.length)];
}
function kUpdateEnvoys(dt) {
  for (const e of envoys.slice()) {
    e.t += dt;
    const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
    if (d > 20 && e.t < 16) {
      const sp = 150 * dt; if (!moveEnt(e, dx / d * sp, dy / d * sp, 8)) { e.x += dx / d * sp; e.y += dy / d * sp; }
      e.walk += dt * 9; e.face = dx > 0 ? 1 : -1;
    } else if (!kBusy()) { envoys.splice(envoys.indexOf(e), 1); kAudience(e.k, e.kind); }
    else if (e.t > 60) envoys.splice(envoys.indexOf(e), 1);
  }
}

// ---------- 접견 장면 ----------
let kEv = null;
function kCrest(k) {
  const C = kCiv(k);
  return `<div class="kcrest" style="--kc:${C.color}"><span>${C.icon}</span></div>`;
}
function kRelBar(k) {
  const r = Math.round(k.rel), w = Math.abs(r) / 2, col = r >= 0 ? '#5be0b0' : '#ff7a6a';
  return `<div class="krel"><i style="left:${r >= 0 ? 50 : 50 - w}%;width:${w}%;background:${col}"></i><b></b></div><div class="krelT">관계 ${r > 0 ? '+' : ''}${r} · <span style="color:${K_ST[k.st].c}">${K_ST[k.st].n}</span></div>`;
}
function kEraTxt(k) { const e = kEra(k); return `${ERAS[e].icon} ${ERAS[e].name}${e > S.era ? ' <b style="color:#ff8a7a">(앞섬)</b>' : e < S.era ? ' (뒤처짐)' : ''}`; }
function kTraitBox(k) {
  const C = kCiv(k);
  return `<div class="ktrait"><div>💪 <b>강점</b> ${C.strong}</div><div>⚠️ <b>약점</b> ${C.weak}</div><div>💛 좋아함: ${C.like} · 💢 싫어함: ${C.dislike}</div><div>🪖 주력: ${mixText(kIx(C.mix, kEra(k)))}</div></div>`;
}
function kAudience(i, kind) {
  const k = S.kingdoms[i], C = kCiv(k); if (!k) return;
  const R = kRuler(k), g = n => Math.round(n * (1 + S.era * 0.5));
  let say = '', opts = [];
  const o = (ic, label, sub, fn, dis) => opts.push({ ic, label, sub, fn, dis });
  switch (kind) {
    case 'meet':
      k.met = true;
      say = `“${C.people}, <b>${C.name}</b>의 ${R}께서 처음으로 인사를 전하십니다. 우리는 ${C.trait === '호전적' ? '강한 자와만 손을 잡습니다' : C.trait === '실리적' ? '이문이 남는 곳이라면 어디든 배를 댑니다' : '별과 책 사이에서 지혜를 찾습니다'}.”`;
      o('🍖', '환영 연회를 연다', `🪙${g(10)} · 관계 +15`, () => { S.gold -= g(10); k.rel += 15; }, S.gold < g(10));
      o('🙇', '예의만 갖춰 돌려보낸다', '관계 변화 없음', () => {});
      o('🚪', '쫓아낸다', '관계 -25', () => { k.rel -= 25; });
      break;
    case 'declare':
      say = `“${rulerName()}! 우리 ${R}께서 더는 참지 않으시겠답니다. 오늘부터 <b>${C.name}</b>과 너희는 전쟁이다!”`;
      o('⚔️', '맞서 싸운다', '전쟁 시작 · 곧 적 군단이 쳐들어옵니다', () => kDeclare(i, false));
      o('🪙', '예물을 바쳐 달랜다', `🪙${g(40)} · 관계 +35 · 전쟁을 피함`, () => { S.gold -= g(40); k.rel = C.warAt + 35; }, S.gold < g(40));
      break;
    case 'peace': {
      const pay = g(30 + k.score * 15);
      say = `“전장에서 너희의 힘을 보았다. ${R}께서 칼을 거두자 하신다. 배상으로 금 ${pay}을 내겠다.”`;
      o('🕊️', '화친한다', `🪙+${pay} · 평화`, () => { S.gold += pay; kPeace(i); });
      o('⚔️', '거절하고 계속 싸운다', '전쟁 계속', () => { k.score = 0; });
      break;
    }
    case 'tradeOffer':
      say = `“우리 ${R}께서 교역로를 열자 하십니다. ${C.tradeTxt}.”`;
      o('🤝', '교역 협정을 맺는다', C.tradeTxt, () => { k.st = 'trade'; k.rel += 5; });
      o('✋', '아직은 이르다', '관계 -3', () => { k.rel -= 3; });
      break;
    case 'allyOffer':
      say = `“오랜 교역으로 믿음이 쌓였습니다. ${R}께서 형제의 맹약을 청하십니다. (${C.allyTxt})”`;
      o('🛡️', '동맹을 맺는다', C.allyTxt, () => { k.st = 'ally'; k.rel += 10; });
      o('✋', '정중히 거절한다', '관계 -5', () => { k.rel -= 5; });
      break;
    case 'aid':
      say = `“동맹이여, 우리 국경에 도적이 들끓습니다. 금 ${g(25)}만 보태 주시면 은혜를 잊지 않겠습니다.”`;
      o('🪙', '돕는다', `🪙${g(25)} · 관계 +18`, () => { S.gold -= g(25); k.rel += 18; k.pow += 5; }, S.gold < g(25));
      o('✋', '형편이 어렵다', '관계 -15', () => { k.rel -= 15; });
      break;
    case 'tribute':
      say = `“초원의 ${R}께 금 ${g(30)}을 바쳐라. 그러면 우리 기병이 너희 마을을 그냥 지나칠 것이다.”`;
      o('🪙', '바친다', `🪙${g(30)} · 관계 +22`, () => { S.gold -= g(30); k.rel += 22; }, S.gold < g(30));
      o('🗡️', '거절한다', S.warsWon >= 3 ? '관계 -5 (그들은 당신의 용맹을 안다)' : '관계 -18', () => { k.rel -= S.warsWon >= 3 ? 5 : 18; });
      break;
    case 'horses':
      say = `“칸의 목장에서 기른 준마 두 필이오. 금 ${g(25)}이면 넘기겠소.”`;
      o('🐎', '산다', `🪙${g(25)} · 마을 옆에 말 2필 · 관계 +6`, () => { S.gold -= g(25); k.rel += 6; kGiveHorses(2); }, S.gold < g(25));
      o('✋', '필요 없다', '변화 없음', () => {});
      break;
    case 'buyWood': {
      const w = 20 + S.era * 10, p = g(30);
      say = `“우리 배를 고칠 목재가 모자랍니다. 목재 ${w}을 금 ${p}에 사겠습니다.”`;
      o('🪵', '판다', `🪵-${w} → 🪙+${p} · 관계 +8`, () => { S.wood -= w; S.gold += p; k.rel += 8; }, S.wood < w);
      o('✋', '거절한다', '관계 -3', () => { k.rel -= 3; });
      break;
    }
    case 'scholars':
      say = `“우리 학자들이 당신의 학당에서 함께 연구하길 원합니다. 숙식비로 금 ${g(20)}만 대 주십시오.”`;
      o('📚', '받아들인다', `🪙${g(20)} · 연구 점수 +${60 + S.era * 30} · 관계 +10`, () => { S.gold -= g(20); S.dev = (S.dev || 0) + 60 + S.era * 30; k.rel += 10; }, S.gold < g(20));
      o('✋', '거절한다', '관계 -4', () => { k.rel -= 4; });
      break;
    case 'stars':
      say = `“백탑의 천문관이 올해 큰 풍년을 예언했습니다. ${R}께서 이 소식을 이웃과 나누라 하셨습니다.”`;
      o('🙏', '감사를 전한다', '관계 +6 · 모든 마을 인구 +1', () => { k.rel += 6; for (const t of S.towns) if (t.pop < townCap(t)) t.pop++; });
      break;
    default: return;
  }
  kEv = { i, opts };
  paused = true; actHeld = false; auto = null;
  $('kPanel').innerHTML = `<div class="era-kicker">사신 접견</div>
    <div class="khead">${kCrest(k)}<div><h2 style="margin:0">${C.name}</h2><div class="sub" style="margin:0">${kRuler(k)}의 사신 · ${kEraTxt(k)}</div></div></div>
    <div class="ksay">${say}</div>${kind === 'meet' ? kTraitBox(k) : ''}${kRelBar(k)}
    ${opts.map((x, n) => `<button class="opt${n === 0 ? ' primary' : ''}" data-o="${n}" ${x.dis ? 'disabled' : ''}><span class="ic">${x.ic}</span><span>${x.label}<small>${x.sub}${x.dis ? ' · 모자람' : ''}</small></span></button>`).join('')}`;
  $('kPanel').classList.add('show');
}
function kGiveHorses(n) {
  const t = S.towns.reduce((a, b) => b.pop > a.pop ? b : a);
  for (let m = 0, tries = 0; m < n && tries < 80; tries++) { const x = t.x + ri(7) - 3, y = t.y + ri(7) - 3; if (tileAt(x, y) === GRASS) { S.horses.push(newHorse(x, y)); m++; } }
}

// ---------- 외교 화면 (🏰 버튼 · 왕국 수도를 톡) ----------
function openDiplo(only) {
  if (!S || MODE !== 'world' || !S.kingdoms) return;
  paused = true; actHeld = false; auto = null;
  $('menuPanel').classList.remove('show');
  kEv = { diplo: true, only };
  renderDiplo();
  $('kPanel').classList.add('show');
}
function renderDiplo() {
  const only = kEv && kEv.only;
  const gift = Math.round(20 * (1 + S.era * 0.5));
  let h = `<h2>🏰 이웃 왕국</h2><div class="sub">섬에는 우리 말고도 세 문명이 함께 자랍니다. 선물·교역·동맹으로 사귀거나, 전쟁으로 꺾을 수 있어요. 수도를 톡 하면 바로 이 화면이 열립니다.</div>`;
  S.kingdoms.forEach((k, i) => {
    if (only !== undefined && only !== i) return;
    const C = kCiv(k), dist = kMainTown(k) ? Math.round(Math.hypot(k.x - kMainTown(k).x, k.y - kMainTown(k).y)) : 0;
    h += `<div class="kcard" style="--kc:${C.color}"><div class="khead">${kCrest(k)}<div><b style="font-size:16px">${C.name}</b><div class="sub" style="margin:0">${kRuler(k)} · ${kEraTxt(k)} · 수도 Lv${kCapLv(k)}${dist ? ` · ${dist}칸` : ''}</div></div></div>
      <div class="sub" style="margin:4px 0 2px">${C.people} · 성향 <b>${C.trait}</b></div>${kTraitBox(k)}${kRelBar(k)}<div class="kbtns">`;
    const b = (a, ic, label, sub, dis) => { h += `<button class="opt" data-k="${i}" data-a="${a}" ${dis ? 'disabled' : ''}><span class="ic">${ic}</span><span>${label}<small>${sub}</small></span></button>`; };
    if (k.st !== 'war') {
      b('gift', '🎁', '선물 보내기', `🪙${gift} · 관계 +${Math.round(12 * C.giftK)}`, S.gold < gift);
      if (k.st === 'peace') b('trade', '🤝', '교역 협정', k.rel >= 15 ? C.tradeTxt : `관계 +15 이상 필요`, k.rel < 15);
      if (k.st === 'trade') b('ally', '🛡️', '동맹 맺기', k.rel >= 55 ? C.allyTxt : `관계 +55 이상 필요 · ${C.allyTxt}`, k.rel < 55);
      if (k.st === 'trade' || k.st === 'ally') b('cut', '✂️', k.st === 'ally' ? '동맹 깨기' : '교역 끊기', '관계 -25', false);
      b('war', '⚔️', '선전포고', `주력: ${mixText(kIx(C.mix, kEra(k)))}${C.id === 'sea' ? '' : ''} · 다른 왕국 관계도 변함`, !!S.war);
    } else {
      b('attack', '🏹', '수도로 진격 (대규모 전투)', `이기면 약탈 · 국력 크게 감소 · 전승 ${k.score}`, !!S.war);
      const pc = Math.round(40 * (1 + S.era * 0.5));
      b('sue', '🕊️', '강화 제의', k.score >= 2 ? '그들도 지쳤습니다 · 무료로 평화' : `🪙${pc} 배상 · 전승 2회면 무료`, k.score < 2 && S.gold < pc);
    }
    h += `</div></div>`;
  });
  h += `<button class="close" data-a="close">닫기</button>`;
  $('kPanel').innerHTML = h;
}
$('kPanel') && $('kPanel').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn || btn.disabled || !kEv) return;
  if (btn.dataset.o !== undefined) { // 접견 선택
    const x = kEv.opts[+btn.dataset.o]; if (x && !x.dis) x.fn();
    const k = S.kingdoms[kEv.i]; if (k) k.rel = clamp(k.rel, -100, 100);
    kEv = null; $('kPanel').classList.remove('show'); paused = false; save();
    if (S.war && !S.war.field && !paused) setTimeout(() => { if (S.war && !S.war.field && MODE === 'world') askWar(); }, 400);
    return;
  }
  const a = btn.dataset.a;
  if (a === 'close') { kEv = null; $('kPanel').classList.remove('show'); paused = false; return; }
  const i = +btn.dataset.k, k = S.kingdoms[i], C = kCiv(k), gift = Math.round(20 * (1 + S.era * 0.5));
  if (a === 'gift') { S.gold -= gift; k.rel = clamp(k.rel + 12 * C.giftK, -100, 100); toast(`🎁 ${C.name}${josaP(C.name, '이가')} 선물을 반겼습니다`, 2); }
  else if (a === 'trade') { k.st = 'trade'; toast(`🤝 ${C.name}과 교역로가 열렸습니다 · ${C.tradeTxt}`, 3); }
  else if (a === 'ally') { k.st = 'ally'; k.rel = clamp(k.rel + 10, -100, 100); toast(`🛡️ ${C.name}과 동맹! ${C.allyTxt}`, 3); }
  else if (a === 'cut') { k.st = 'peace'; k.rel -= 25; }
  else if (a === 'war') { kDeclare(i, true); toast(`⚔️ ${C.name}에 선전포고! 수도로 진격하거나 쳐들어오는 군단을 막으세요`, 3.5); }
  else if (a === 'sue') { const pc = Math.round(40 * (1 + S.era * 0.5)); if (k.score < 2) S.gold -= pc; kPeace(i); toast(`🕊️ ${C.name}과 화친했습니다`, 2.5); }
  else if (a === 'attack') { kEv = null; $('kPanel').classList.remove('show'); paused = false; kAttack(i); return; }
  save(); renderDiplo();
});
$('diploBtn') && $('diploBtn').addEventListener('click', () => openDiplo());

// ---------- 미니맵 · 2D 표시 ----------
function kMinimap(d) { // drawMinimap 에서 픽셀마다
  if (!S.kingdoms) return;
  for (let i = 0; i < W * H; i++) {
    const o = kOwner[i]; if (o < 0) continue;
    const tc = parseInt(kCiv(S.kingdoms[o]).color.slice(1), 16);
    d[i * 4] = (d[i * 4] + (tc >> 16)) / 2; d[i * 4 + 1] = (d[i * 4 + 1] + (tc >> 8 & 255)) / 2; d[i * 4 + 2] = (d[i * 4 + 2] + (tc & 255)) / 2;
  }
}
function kMinimapMarks(g) {
  if (!S.kingdoms) return;
  for (const k of S.kingdoms) {
    g.fillStyle = '#111'; g.fillRect(k.x - 2, k.y - 2, 5, 5);
    g.fillStyle = k.st === 'war' && (S.time * 4 | 0) % 2 ? '#f33' : kCiv(k).color; g.fillRect(k.x - 1, k.y - 1, 3, 3);
  }
}
