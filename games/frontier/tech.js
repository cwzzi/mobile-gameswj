'use strict';
// ===== 기술 연구 · 병종 · 군대(병영) · 적 문명 =====
// TECHS: 기술 표. 시대마다 4~6개, key:true 인 기술을 연구하면 다음 시대가 열린다 (era.js ERAS[].need.tech)
//   cost: 연구 점수(🔬, 학당·인구·마을·시장이 만든다) · res: 연구 시작 때 드는 자원 · req: 먼저 필요한 기술
//   bld: 해금 건물 (world.js BUILD[].tech) · unit: 해금 병종 (UNITS) · eff: 보너스 (techBonus)
const TECHS = [
  // 부족 시대
  { id: 'tools', era: 0, name: '석기 도구', icon: '🪓', cost: 25, res: { wood: 5 }, bld: ['barracks'], unit: ['club'], eff: { harvest: 1 }, desc: '손 채집 +1 · 병영과 곤봉 전사' },
  { id: 'agri', era: 0, name: '농경', icon: '🌾', cost: 35, res: { wood: 8 }, bld: ['farm'], eff: { grow: 0.25 }, desc: '농장 · 인구 증가 +25%' },
  { id: 'sling', era: 0, name: '투석', icon: '🪨', cost: 35, req: ['tools'], bld: ['range'], unit: ['sling'], desc: '궁술장과 투석병 (원거리)' },
  { id: 'husbandry', era: 0, name: '목축', icon: '🐎', cost: 45, req: ['agri'], bld: ['stable'], unit: ['rider'], eff: { horse: 0.15 }, desc: '마구간과 기마 전사 · 말 속도 +15%' },
  { id: 'bronze', era: 0, name: '청동 제련', icon: '🔥', cost: 80, res: { stone: 10, gold: 10 }, req: ['tools', 'agri'], key: true, desc: '구리와 주석을 녹여 청동을 만든다' },
  // 고대 왕국
  { id: 'writing', era: 1, name: '문자', icon: '📜', cost: 70, eff: { research: 0.25 }, desc: '연구 속도 +25%' },
  { id: 'bronze_w', era: 1, name: '청동 무기', icon: '🗡️', cost: 70, unit: ['spear'], eff: { armyAtk: 0.15 }, desc: '창병 · 군대 공격력 +15%' },
  { id: 'archery', era: 1, name: '궁술', icon: '🏹', cost: 80, unit: ['archer'], desc: '궁수 (사거리가 긴 원거리)' },
  { id: 'masonry', era: 1, name: '석조 건축', icon: '🧱', cost: 80, bld: ['quarry', 'tower'], desc: '채석장 · 망루' },
  { id: 'currency', era: 1, name: '화폐', icon: '🪙', cost: 80, bld: ['market'], eff: { income: 0.1 }, desc: '시장 · 세금 +10%' },
  { id: 'iron', era: 1, name: '철기', icon: '⚒️', cost: 140, res: { stone: 20, gold: 30 }, req: ['writing', 'bronze_w'], key: true, desc: '단단한 철을 다루는 법' },
  // 중세
  { id: 'plate', era: 2, name: '철갑', icon: '🛡️', cost: 140, unit: ['sword'], desc: '철갑 검사 (튼튼한 방패병)' },
  { id: 'crossbow', era: 2, name: '석궁', icon: '🎯', cost: 140, unit: ['xbow'], desc: '석궁병 (강한 원거리)' },
  { id: 'chivalry', era: 2, name: '기마술', icon: '🏇', cost: 150, req: ['husbandry'], unit: ['knight'], desc: '기사 (돌격 기병)' },
  { id: 'castle', era: 2, name: '성곽 축성', icon: '🏰', cost: 150, eff: { arrow: 1 }, desc: '망루 화살 피해 +1' },
  { id: 'mining', era: 2, name: '채광', icon: '⛏️', cost: 130, bld: ['mine'], desc: '금광' },
  { id: 'gunpowder', era: 2, name: '화약', icon: '💥', cost: 240, res: { stone: 30, gold: 60 }, req: ['crossbow', 'castle'], key: true, desc: '불을 뿜는 가루' },
  // 근세
  { id: 'pike', era: 3, name: '장창 전술', icon: '🔱', cost: 220, unit: ['pike'], desc: '장창병 (기병에 강함)' },
  { id: 'musket', era: 3, name: '머스킷', icon: '🔫', cost: 260, unit: ['musket'], desc: '머스킷병 (가장 강한 원거리)' },
  { id: 'printing', era: 3, name: '인쇄술', icon: '📰', cost: 220, eff: { income: 0.2 }, desc: '세금 +20%' },
  { id: 'standing', era: 3, name: '상비군', icon: '🎖️', cost: 260, eff: { armyCap: 0.5 }, desc: '군대 정원 +50%' },
  { id: 'cannon', era: 3, name: '대포', icon: '💣', cost: 280, req: ['musket'], eff: { arrow: 2 }, desc: '망루 피해 +2' },
];
const TECH = {}; for (const t of TECHS) TECH[t.id] = t;

// UNITS: 병종 표 (아군 훈련 · 적 군단 · 산적이 함께 쓴다)
//   role: melee | ranged(투사체) | cav(빠른 돌격) · hp/atk/sp: 배율 · range: 사거리(px) · reload: 장전(초)
//   armor: 밀려나지 않고 튼튼함 · bld: 훈련 건물 · tech: 해금 기술 · cost/time: 훈련 비용/시간
const UNITS = {
  club:   { name: '곤봉 전사', icon: '🪵', role: 'melee', hp: 1, atk: 1, sp: 1, bld: 'barracks', tech: 'tools', cost: { wood: 6, gold: 5 }, time: 6 },
  sling:  { name: '투석병', icon: '🪨', role: 'ranged', proj: 'stone', range: 150, reload: 1.9, hp: 0.8, atk: 0.8, sp: 1, bld: 'range', tech: 'sling', cost: { wood: 4, stone: 4, gold: 6 }, time: 7 },
  rider:  { name: '기마 전사', icon: '🐎', role: 'cav', hp: 1.5, atk: 1.2, sp: 1.7, bld: 'stable', tech: 'husbandry', cost: { wood: 6, gold: 14 }, time: 10 },
  spear:  { name: '창병', icon: '🗡️', role: 'melee', hp: 1.4, atk: 1.2, sp: 1, bld: 'barracks', tech: 'bronze_w', cost: { wood: 6, stone: 2, gold: 10 }, time: 7 },
  archer: { name: '궁수', icon: '🏹', role: 'ranged', proj: 'arrow', range: 190, reload: 1.8, hp: 0.9, atk: 1.1, sp: 1, bld: 'range', tech: 'archery', cost: { wood: 8, gold: 10 }, time: 8 },
  sword:  { name: '철갑 검사', icon: '🛡️', role: 'melee', armor: true, hp: 2.2, atk: 1.5, sp: 0.9, bld: 'barracks', tech: 'plate', cost: { wood: 4, stone: 6, gold: 18 }, time: 9 },
  xbow:   { name: '석궁병', icon: '🎯', role: 'ranged', proj: 'bolt', range: 200, reload: 2.4, hp: 1.2, atk: 1.6, sp: 0.95, bld: 'range', tech: 'crossbow', cost: { wood: 8, gold: 16 }, time: 9 },
  knight: { name: '기사', icon: '🏇', role: 'cav', armor: true, hp: 2.8, atk: 1.8, sp: 1.6, bld: 'stable', tech: 'chivalry', cost: { wood: 4, gold: 28 }, time: 12 },
  pike:   { name: '장창병', icon: '🔱', role: 'melee', armor: true, hp: 2.6, atk: 1.6, sp: 0.9, bld: 'barracks', tech: 'pike', cost: { wood: 8, stone: 4, gold: 20 }, time: 9 },
  musket: { name: '머스킷병', icon: '🔫', role: 'ranged', proj: 'ball', range: 230, reload: 3.2, hp: 1.4, atk: 2.6, sp: 0.95, bld: 'range', tech: 'musket', cost: { wood: 6, stone: 4, gold: 24 }, time: 10 },
};
// 시대별 적 군단 구성 [병종, 비율] · 산적(약탈자) 구성 · 그 시대 민병의 기본 병종
const ENEMY_MIX = [
  [['club', 7], ['sling', 3]],
  [['spear', 5], ['archer', 3], ['rider', 2]],
  [['sword', 4], ['xbow', 3], ['knight', 2], ['spear', 1]],
  [['pike', 4], ['musket', 4], ['knight', 2]],
];
const BANDIT_MIX = [[['club', 3], ['sling', 1]], [['club', 2], ['archer', 1]], [['club', 2], ['xbow', 1]], [['sword', 2], ['musket', 1]]];
const ERA_BASIC = ['club', 'spear', 'sword', 'pike'];
const PROJ = { stone: { sp: 330, col: '#9a9a90' }, arrow: { sp: 430, col: '#5a3a20' }, bolt: { sp: 500, col: '#3a3a40' }, ball: { sp: 720, col: '#222' } };
const MIL_BLD = ['barracks', 'range', 'stable'];
const SOLDIER_VIS = 24; // 오픈월드에 실제로 보이는 병사 수 상한 (나머지는 예비대)

function pickMix(mix) { let s = 0; for (const m of mix) s += m[1]; let r = rand() * s; for (const m of mix) { r -= m[1]; if (r <= 0) return m[0]; } return mix[0][0]; }
function mixNames(era) { return ENEMY_MIX[clamp(era, 0, ENEMY_MIX.length - 1)].map(m => `${UNITS[m[0]].icon}${UNITS[m[0]].name}`).join(' · '); }

// ---------- 병종 외형 (R3D.human / A3D / drawHuman 공용) ----------
// side: ally | foe | bandit · mount: 말 색 (있으면 말을 탄다)
const unitLookCache = new Map();
function unitLook(ut, side, era, f) {
  era = clamp(era | 0, 0, ERAS.length - 1);
  const key = ut + '|' + side + '|' + era + '|' + (f ? f.name : '');
  let L = unitLookCache.get(key);
  if (L) return L;
  const E = ERAS[era];
  let base;
  if (side === 'ally') { const a = E.looks.ally; base = { body: a.body, trim: a.trim, legs: a.legs, plume: '#4fa3ff', helm: '#9aa4b0', band: '#d9b36a' }; }
  else if (side === 'bandit') { const b = E.looks.bandit; base = { body: b.body, trim: b.trim, legs: b.legs, plume: '#2a1a12', helm: '#3a3a3a', band: b.helm }; }
  else { f = f || E.factions[0]; base = { body: f.color, trim: '#2a2218', legs: '#2a2420', plume: f.plume, helm: '#8a8e96', band: f.plume }; }
  L = { body: base.body, trim: base.trim, legs: base.legs, plume: base.plume, ut, side, era }; // ut/side/era: 3D 사실적 인물 선택용
  const hood = side === 'bandit' ? '#2a2220' : '#4a3a2a';
  switch (ut) {
    case 'club': Object.assign(L, side === 'bandit' ? { hat: 'hood', helm: base.band, weapon: 'club', tint: base.body } : { hat: 'band', helm: base.band, weapon: 'club', kit: 'tribe' }); break;
    case 'sling': Object.assign(L, { hat: 'hood', helm: hood, weapon: 'sling', kit: 'ranged' }); break;
    case 'archer': Object.assign(L, { hat: 'hood', helm: hood, weapon: 'bow', kit: 'ranged' }); break;
    case 'rider': Object.assign(L, { hat: 'band', helm: base.band, weapon: 'spear', kit: 'tribe', mount: side === 'ally' ? '#c9a27a' : '#5a3a22' }); break;
    case 'spear': Object.assign(L, { hat: 'helm', helm: '#9a7a4a', weapon: 'spear', kit: 'spear' }); break;
    case 'sword': Object.assign(L, { hat: 'helm', helm: '#9aa0a8', weapon: 'sword', armor: true, kit: 'knight' }); break;
    case 'xbow': Object.assign(L, { hat: 'helm', helm: '#8a8e96', weapon: 'xbow', kit: 'gunner' }); break;
    case 'knight': Object.assign(L, { hat: 'helm', helm: '#b0b4bc', weapon: 'spear', armor: true, kit: 'knight', cape: side === 'ally' ? '#c0392b' : '#3a1a1a', mount: side === 'ally' ? '#e8e0d0' : '#3a2a22' }); break;
    case 'pike': Object.assign(L, { hat: 'helm', helm: '#b0b4bc', weapon: 'pike', armor: true, kit: 'spear' }); break;
    case 'musket': Object.assign(L, { hat: 'band', helm: base.band, weapon: 'musket', kit: 'gunner' }); break;
    default: Object.assign(L, { hat: 'band', helm: base.band, weapon: 'club' });
  }
  unitLookCache.set(key, L);
  return L;
}

// ---------- 기술 ----------
function techHas(id) { return !!(S && S.techs && S.techs.includes(id)); }
function techBonus(k) { let s = 0; if (S && S.techs) for (const id of S.techs) { const e = TECH[id] && TECH[id].eff; if (e && e[k]) s += e[k]; } return s; }
function techsBelowEra(era) { return TECHS.filter(t => t.era < era).map(t => t.id); }
function researchRate() { return S.towns.length ? Math.max(0.5, devRate() * (1 + techBonus('research'))) : 0; }
const RP_BANK = 150;
function techAvail(t) { // null = 연구 가능, 아니면 이유
  if (techHas(t.id)) return '완료';
  if (t.era > S.era) return `${ERAS[t.era].name}에 연구 가능`;
  for (const r of t.req || []) if (!techHas(r)) return `먼저: ${TECH[r].icon}${TECH[r].name}`;
  if (t.key) { const N = ERAS[t.era + 1]; if (N && N.need && S.towns.length < (N.need.towns || 0)) return `🏘️ 마을 ${N.need.towns}곳 필요 (지금 ${S.towns.length})`; }
  return null;
}
function techUnlockText(t) {
  const out = [];
  for (const k of t.bld || []) out.push(`${BUILD[k].icon}${BUILD[k].name}`);
  for (const k of t.unit || []) out.push(`${UNITS[k].icon}${UNITS[k].name}`);
  return out;
}
function startResearch(id) {
  const t = TECH[id]; if (!t || techAvail(t)) return false;
  if (S.research && S.research.id === id) return true;
  const c = t.res || {};
  if (!canAfford(c)) return false;
  if (S.research) S.dev = Math.min(RP_BANK * 2, (S.dev || 0) + S.research.p); // 바꾸면 진행분은 비축으로 돌려준다
  pay(c);
  S.research = { id, p: 0, paid: true };
  toast(`🔬 <b>${t.name}</b> 연구를 시작합니다`, 2);
  save();
  return true;
}
let researchNagT = 20;
function techTick(dt) {
  const rate = researchRate();
  if (S.research && TECH[S.research.id]) {
    const t = TECH[S.research.id];
    const drain = Math.min(S.dev || 0, Math.max(1, rate) * 2 * dt);
    S.dev = (S.dev || 0) - drain;
    S.research.p += rate * dt + drain;
    if (S.research.p >= t.cost) completeTech(t.id);
  } else {
    S.research = null;
    S.dev = Math.min(RP_BANK, (S.dev || 0) + rate * dt);
    if (S.towns.length && TECHS.some(t => !techAvail(t))) {
      researchNagT -= dt;
      if (researchNagT <= 0) { researchNagT = 45; toast('🔬 연구할 기술을 고르세요 · 오른쪽 위 <b>🔬</b> 버튼', 3); }
    }
  }
}
function completeTech(id) {
  const t = TECH[id]; if (!t || techHas(id)) return;
  S.techs.push(id); if (S.research && S.research.id === id) S.research = null;
  researchNagT = 25;
  const un = techUnlockText(t);
  if (t.key && eraReady()) { advanceEra(false, t); return; }
  banner(`🔬 ${t.name} 완성`, un.length ? '해금: ' + un.join(' · ') : t.desc, 2.6);
  if (t.key) toast(`🏛️ ${josa(eraNext() ? eraNext().name : '다음 시대', '으로로')} 나아가려면 ${eraReqs().filter(r => r.f < 1).map(r => r.label).join(', ')} 필요`, 4);
  recomputeOwner(); save();
}
// 연구 진행 [0..1] 과 표시 문자열
function researchInfo() {
  if (!S.research) return null;
  const t = TECH[S.research.id]; return t ? { t, f: clamp(S.research.p / t.cost, 0, 1) } : null;
}

// ---------- 기술 패널 ----------
function openTechPanel() {
  if (!S || MODE !== 'world') return;
  paused = true; actHeld = false; auto = null;
  $('menuPanel').classList.remove('show'); $('eraPanel').classList.remove('show');
  renderTechPanel();
  $('techPanel').classList.add('show');
}
function renderTechPanel() {
  const E = eraCur(), N = eraNext(), ri_ = researchInfo(), rate = researchRate();
  let h = `<h2>🔬 기술 연구 <span style="font-size:13px;color:#b8c2b0">${E.icon} ${E.name}</span></h2>
    <div class="sub">${S.towns.length ? `연구 점수 초당 <b>+${rate.toFixed(1)}</b> (학당 📜으로 더 빠르게) · 비축 ${Math.floor(S.dev || 0)}` : '첫 마을을 세우면 연구가 시작돼요'}<br>${N ? `<b>${TECHS.find(t => t.key && t.era === S.era).icon} ${TECHS.find(t => t.key && t.era === S.era).name}</b>${josaP(TECHS.find(t => t.key && t.era === S.era).name, '을를')} 연구하면 <b>${N.icon} ${N.name}</b> 시대가 열립니다` : '마지막 시대입니다. 남은 기술로 제국을 강하게!'}</div>`;
  if (ri_) h += `<div class="req"><span>⏳ ${ri_.t.icon} ${ri_.t.name} 연구 중</span><b>${Math.floor(S.research.p)}/${ri_.t.cost}</b><div class="barw"><i style="width:${ri_.f * 100}%"></i></div></div>`;
  for (const t of TECHS.filter(t => t.era === S.era)) {
    const why = techAvail(t), done = techHas(t.id), cur = S.research && S.research.id === t.id;
    const afford = canAfford(t.res || {}), un = techUnlockText(t);
    const sm = done ? '✅ 완료' : cur ? `연구 중 ${Math.floor(ri_.f * 100)}%` : why ? '🔒 ' + why : `🔬${t.cost}${t.res ? ' · ' + costText(t.res) : ''}${afford ? '' : ' · 자원 부족'}${S.research ? ' · 바꾸기' : ''}`;
    h += `<button class="opt tech${t.key ? ' key' : ''}${done ? ' done' : ''}" data-t="${t.id}" ${done || cur || why || !afford ? 'disabled' : ''}><span class="ic">${t.icon}</span><span>${t.name}${t.key ? ' <b class="keytag">시대 전환</b>' : ''} — ${t.desc}${un.length ? ` <i>(${un.join(' · ')})</i>` : ''}<small>${sm}</small></span></button>`;
  }
  const done = TECHS.filter(t => t.era < S.era).length;
  if (done) h += `<div class="lockbox">✅ 이전 시대 기술 ${done}개 완료</div>`;
  if (N) h += `<div class="lockbox">🔒 <b>${N.icon} ${N.name}</b>: ${TECHS.filter(t => t.era === S.era + 1).map(t => t.icon + t.name).join(' · ')}</div>`;
  h += `<button class="close" data-a="close">닫기</button>`;
  $('techPanel').innerHTML = h;
}
$('techPanel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.t) { startResearch(b.dataset.t); renderTechPanel(); return; }
  $('techPanel').classList.remove('show'); paused = false;
});

// ---------- 적 문명 ----------
// S.foeLv: 적 세력의 문명 수준(소수). 시간이 지나면 오르고, 플레이어 시대 근처(조금 뒤~조금 앞)에 머문다
function foeTick(dt) {
  if (S.foeLv === undefined) S.foeLv = S.era;
  const lo = S.era - 0.6, hi = Math.min(ERAS.length - 1, S.era + 0.75);
  S.foeLv = clamp(S.foeLv + dt / 300, lo, hi);
  const fe = foeEra();
  if (S.foeShown === undefined) S.foeShown = fe;
  if (fe > S.foeShown) { S.foeShown = fe; toast(`📯 적 세력이 <b>${ERAS[fe].icon} ${ERAS[fe].name}</b>에 들어섰습니다<br><small>${mixNames(fe)}</small>`, 4); }
  else if (fe < S.foeShown) S.foeShown = fe;
}
function foeEra() { return clamp(Math.floor((S.foeLv === undefined ? S.era : S.foeLv) + 1e-6), 0, ERAS.length - 1); }
function foeEraRoll() { return clamp(Math.floor((S.foeLv === undefined ? S.era : S.foeLv) + rr(-0.3, 0.3)), 0, ERAS.length - 1); }

// ---------- 군대 ----------
function armyTotal() { let n = 0; for (const k in (S.army || {})) n += S.army[k] | 0; return n; }
function armyCap() {
  const pop = S.towns.reduce((a, t) => a + t.pop, 0), mb = S.buildings.filter(b => MIL_BLD.includes(b.type)).length;
  return Math.min(120, Math.floor((4 + pop / 3 + mb * 3) * (1 + techBonus('armyCap'))));
}
function armyUpkeep() { return Math.ceil(armyTotal() / 4); } // 10초마다 금
function armyQueued() { let n = 0; for (const b of S.buildings) if (b.q) n += b.q.length; return n; }
function unitUnlocked(ut) { return techHas(UNITS[ut].tech); }
function trainUnit(ut) {
  const U = UNITS[ut]; if (!U || !unitUnlocked(ut)) return '아직 연구되지 않은 병종';
  const bs = S.buildings.filter(b => b.type === U.bld);
  if (!bs.length) return `${BUILD[U.bld].icon}${BUILD[U.bld].name} 필요`;
  if (armyTotal() + armyQueued() >= armyCap()) return '군대 정원이 가득 찼어요';
  if (!canAfford(U.cost)) return '자원 부족';
  const b = bs.reduce((a, x) => ((x.q || []).length < (a.q || []).length ? x : a));
  if ((b.q || []).length >= 5) return '대기열이 가득 찼어요';
  pay(U.cost); (b.q = b.q || []).push(ut); b.qt = b.qt || 0;
  return null;
}
let armyFullShown = false, upkeepT = 0;
function updateTraining(dt) {
  for (const b of S.buildings) {
    if (!b.q || !b.q.length) continue;
    const U = UNITS[b.q[0]]; if (!U) { b.q.shift(); continue; }
    b.qt = (b.qt || 0) + dt;
    if (b.qt < U.time) continue;
    if (armyTotal() >= armyCap()) { b.qt = U.time; if (!armyFullShown) { armyFullShown = true; toast('🪖 군대 정원이 가득 차서 훈련이 멈췄습니다 (인구를 늘리세요)', 3); } continue; }
    armyFullShown = false;
    const ut = b.q.shift(); b.qt = 0;
    S.army[ut] = (S.army[ut] | 0) + 1;
    const cx = (b.x + .5) * T, cy = (b.y + 1) * T;
    floatText(cx, cy - 36, `+1${UNITS[ut].icon}`, '#9ad0ff', 13);
    if (soldiers.length < SOLDIER_VIS) spawnSoldier(ut, cx, cy);
  }
  // 유지비
  upkeepT += dt;
  if (upkeepT >= 10) {
    upkeepT = 0;
    const c = armyUpkeep(); if (!c) return;
    if (S.gold >= c) S.gold -= c;
    else {
      S.gold = 0;
      const ks = Object.keys(S.army).filter(k => S.army[k] > 0);
      if (ks.length) { const k = ks[ri(ks.length)]; S.army[k]--; toast(`🪙 급료가 모자라 ${UNITS[k].name} 1명이 떠났습니다`, 2.5); }
    }
  }
}

// ---------- 군대 패널 ----------
function openArmyPanel() {
  if (!S || MODE !== 'world') return;
  paused = true; actHeld = false; auto = null;
  $('menuPanel').classList.remove('show');
  renderArmyPanel();
  $('armyPanel').classList.add('show');
}
function renderArmyPanel() {
  const tot = armyTotal(), cap = armyCap(), q = armyQueued();
  const have = Object.keys(UNITS).filter(k => S.army[k] > 0).map(k => `${UNITS[k].icon}${UNITS[k].name} ${S.army[k]}`);
  let h = `<h2>🪖 군대 <span style="font-size:13px;color:#b8c2b0">${tot}/${cap}명${q ? ` · 훈련 중 ${q}` : ''}</span></h2>
    <div class="sub">${have.length ? have.join(' · ') : '아직 병사가 없습니다.'}<br>유지비 🪙${armyUpkeep()}/10초 · 정원은 인구·군사 건물로 늘어요<br>병사는 들판에서 산적·적 군단과 싸우고, 대규모 전투에도 함께 출전합니다.</div>
    <div class="seg"><button class="opt${S.armyMode !== 'guard' ? ' sel' : ''}" data-m="follow"><span class="ic">🚩</span><span>따라오기</span></button><button class="opt${S.armyMode === 'guard' ? ' sel' : ''}" data-m="guard"><span class="ic">🏘️</span><span>마을 수비</span></button></div>`;
  const locked = [];
  for (const k in UNITS) {
    const U = UNITS[k];
    if (!unitUnlocked(k)) { locked.push(`${U.icon}${U.name} (🔬${TECH[U.tech].name})`); continue; }
    const nb = S.buildings.filter(b => b.type === U.bld).length;
    const inq = S.buildings.reduce((a, b) => a + (b.q ? b.q.filter(x => x === k).length : 0), 0);
    const err = !nb ? `${BUILD[U.bld].icon}${BUILD[U.bld].name} 필요` : tot + q >= cap ? '정원 가득' : !canAfford(U.cost) ? '자원 부족' : '';
    const role = U.role === 'ranged' ? '원거리' : U.role === 'cav' ? '기병' : U.armor ? '중보병' : '보병';
    h += `<button class="opt" data-u="${k}" ${err ? 'disabled' : ''}><span class="ic">${U.icon}</span><span>${U.name} 훈련 <span style="font-size:12px;opacity:.8">${role} · ${U.time}초</span><small>${costText(U.cost)} · 보유 ${S.army[k] | 0}${inq ? ` · 대기 ${inq}` : ''}${err ? ' · ' + err : ''}</small></span></button>`;
  }
  if (locked.length) h += `<div class="lockbox">🔒 ${locked.join(' · ')}</div>`;
  if (!S.buildings.some(b => MIL_BLD.includes(b.type))) h += `<div class="lockbox">영토 안에서 <b>건설</b> → ⚔️ 병영 · 🎯 궁술장 · 🐴 마구간을 지으면 병사를 훈련할 수 있어요</div>`;
  h += `<button class="close" data-a="close">닫기</button>`;
  $('armyPanel').innerHTML = h;
}
$('armyPanel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.u) { const err = trainUnit(b.dataset.u); if (err) toast(err, 1.6); else save(); renderArmyPanel(); return; }
  if (b.dataset.m) { S.armyMode = b.dataset.m; for (const s of soldiers) s.post = null; renderArmyPanel(); save(); return; }
  $('armyPanel').classList.remove('show'); paused = false;
});

// ---------- 오픈월드 병사 ----------
const soldiers = [], shots = [];
function soldierStats(ut) {
  const U = UNITS[ut];
  return { hp: Math.round((4 + S.era * 1.5) * U.hp), atk: U.atk * (1 + 0.3 * S.era) * (1 + techBonus('armyAtk')) };
}
function spawnSoldier(ut, x, y) {
  const st = soldierStats(ut);
  const s = { ut, x: x + rr(-10, 10), y: y + rr(-6, 6), hp: st.hp, maxHp: st.hp, atk: rr(0, 0.6), walk: rand() * 6, face: 1, hit: 0, swing: 0, tgt: null, tgtT: 0, idx: soldiers.length, stuck: 0 };
  soldiers.push(s); return s;
}
function nearestSoldier(x, y, maxD) { return nearest(soldiers, x, y, maxD); }
function soldierHurt(s, dmg) {
  s.hp -= dmg; s.hit = 0.15;
  if (s.hp > 0) return;
  const i = soldiers.indexOf(s); if (i >= 0) soldiers.splice(i, 1);
  S.army[s.ut] = Math.max(0, (S.army[s.ut] | 0) - 1);
  floatText(s.x, s.y - 30, `💀${UNITS[s.ut].name}`, '#ff9a8a', 12);
  emit(s.x, s.y - 10, 10, { color: ['#4fa3ff', '#fff'], smin: 40, smax: 120, lmin: .3, lmax: .6, grav: 200 });
}
// frac: 적 한 방이 줄 수 있는 최대 체력 비율 (근접 10% · 원거리 7%), 맞은 직후엔 잠깐 무적
function playerHurt(n, frac) {
  const p = S.player;
  if (p.mounted && rand() < 0.3) return;
  if (frac) { if ((p.inv || 0) > 0) return; n = Math.min(n, Math.max(0.5, heroMaxHp() * frac)); p.inv = 1.1; }
  p.hp -= n; p.hurt = 0.25; shake(4); if (p.hp <= 0) playerDie();
}
function fireShot(x, y, tx, ty, team, kind, dmg) {
  const P = PROJ[kind] || PROJ.arrow, d = Math.hypot(tx - x, ty - y) || 1;
  shots.push({ x, y, vx: (tx - x) / d * P.sp, vy: (ty - y) / d * P.sp, team, kind, dmg, life: d / P.sp + 0.25 });
  if (kind === 'ball') emit(x + (tx - x) / d * 14, y - 14 + (ty - y) / d * 14, 5, { color: ['#eee', '#bbb'], kind: 'smoke', smin: 10, smax: 40, lmin: .4, lmax: .8, zmin: 3, zmax: 5, grow: 10 });
}
let soldierSpawnT = 0;
function soldierAnchor(s, i) {
  const p = S.player;
  if (S.armyMode === 'guard' && S.towns.length) {
    const t = S.towns[i % S.towns.length];
    if (!s.post || s.post.town !== t.id) { const a = rand() * Math.PI * 2, r = rr(1.5, 2.8) * T; s.post = { town: t.id, x: (t.x + .5) * T + Math.cos(a) * r, y: (t.y + 1) * T + Math.sin(a) * r * 0.7 }; }
    return s.post;
  }
  const a = i * 2.4 + Math.PI, r = 34 + (i % 3) * 16;
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.75 };
}
function updateArmyWorld(dt) {
  const p = S.player;
  updateTraining(dt);
  // 군대 수와 보이는 병사 맞추기
  const cnt = {};
  for (let i = soldiers.length - 1; i >= 0; i--) {
    const s = soldiers[i]; cnt[s.ut] = (cnt[s.ut] || 0) + 1;
    if (cnt[s.ut] > (S.army[s.ut] | 0)) { soldiers.splice(i, 1); cnt[s.ut]--; }
  }
  soldierSpawnT -= dt;
  if (soldierSpawnT <= 0 && soldiers.length < SOLDIER_VIS) {
    soldierSpawnT = 0.7;
    let best = null, bv = 0;
    for (const k in S.army) { const miss = (S.army[k] | 0) - (cnt[k] || 0); if (miss > bv) { bv = miss; best = k; } }
    if (best) {
      const home = S.towns.length ? S.towns.reduce((a, t) => dist2(p.x, p.y, (t.x + .5) * T, (t.y + .5) * T) < dist2(p.x, p.y, (a.x + .5) * T, (a.y + .5) * T) ? t : a) : null;
      if (home) spawnSoldier(best, (home.x + .5) * T, (home.y + 1.4) * T); else spawnSoldier(best, p.x - 30, p.y);
    }
  }
  soldiers.forEach((s, i) => {
    const U = UNITS[s.ut], st = soldierStats(s.ut), anc = soldierAnchor(s, i);
    s.hit = Math.max(0, s.hit - dt); s.swing = Math.max(0, s.swing - dt); s.atk -= dt; s.tgtT -= dt;
    const own = owner[Math.floor(s.y / T) * W + Math.floor(s.x / T)] >= 0;
    if (own && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + dt * 0.25);
    const da = Math.hypot(anc.x - s.x, anc.y - s.y);
    if (S.armyMode !== 'guard' && da > T * 16) { s.x = anc.x + rr(-20, 20); s.y = anc.y + rr(-20, 20); s.tgt = null; } // 너무 멀어지면 따라잡기
    if (s.tgtT <= 0 || (s.tgt && !bandits.includes(s.tgt))) {
      s.tgtT = rr(0.3, 0.6);
      const e = nearest(bandits, s.x, s.y, T * 6);
      s.tgt = e && dist2(e.x, e.y, anc.x, anc.y) < (T * 9) ** 2 ? e : null;
    }
    let tx = anc.x, ty = anc.y, stop = 10, sp = 95 * U.sp;
    const e = s.tgt;
    if (e) {
      const d = Math.hypot(e.x - s.x, e.y - s.y);
      if (U.role === 'ranged') {
        const R = U.range * 0.8;
        if (d < R * 0.45) { tx = s.x - (e.x - s.x); ty = s.y - (e.y - s.y); stop = 0; }
        else if (d > R * 0.9) { tx = e.x; ty = e.y; stop = R * 0.8; }
        else { tx = s.x; ty = s.y; }
        if (d <= R && s.atk <= 0) { s.atk = U.reload * rr(0.9, 1.2); s.swing = 0.25; s.face = e.x > s.x ? 1 : -1; fireShot(s.x, s.y - 14, e.x, e.y - 12, 0, U.proj, st.atk); }
      } else {
        tx = e.x; ty = e.y; stop = 20;
        if (d < 26 && s.atk <= 0) {
          s.atk = U.role === 'cav' ? 0.8 : 1; s.swing = 0.25; s.face = e.x > s.x ? 1 : -1;
          e.hp -= st.atk; e.hit = 0.15;
          const a = Math.atan2(e.y - s.y, e.x - s.x); e.kx = Math.cos(a) * (U.role === 'cav' ? 200 : 110); e.ky = Math.sin(a) * (U.role === 'cav' ? 200 : 110);
          emit(e.x, e.y - 14, 5, { color: ['#fff', '#9ad0ff'], kind: 'spark', smin: 60, smax: 160, lmin: .12, lmax: .25, ang: a, spread: 0.9 });
          if (e.hp <= 0) killBandit(e);
        }
      }
    } else if (da > 120) sp *= 1.8; // 뒤처졌으면 달려온다
    const d = Math.hypot(tx - s.x, ty - s.y), ox = s.x;
    if (d > stop + 2) {
      const v = Math.min(d - stop, sp * dt);
      if (!moveEnt(s, (tx - s.x) / d * v, (ty - s.y) / d * v, 6)) { s.stuck += dt; if (s.stuck > 1.2) { s.x += (tx - s.x) / d * T; s.y += (ty - s.y) / d * T; if (!canStand(s.x, s.y, 4)) { s.x = anc.x; s.y = anc.y; } s.stuck = 0; } }
      else s.stuck = 0;
      s.walk += dt * 10;
    }
    if (Math.abs(s.x - ox) > 0.1) s.face = s.x > ox ? 1 : -1;
  });
  // 투사체
  for (let i = shots.length - 1; i >= 0; i--) {
    const q = shots[i]; q.life -= dt;
    q.x += q.vx * dt; q.y += q.vy * dt;
    let hit = false;
    if (q.team === 1) {
      if (dist2(q.x, q.y + 12, p.x, p.y) < 14 * 14) { playerHurt(q.dmg, 0.07); hit = true; }
      else { const s = nearest(soldiers, q.x, q.y + 12, 12); if (s) { soldierHurt(s, q.dmg); hit = true; } }
    } else {
      const b = nearest(bandits, q.x, q.y + 12, 14);
      if (b) { b.hp -= q.dmg; b.hit = 0.15; if (b.hp <= 0) killBandit(b); hit = true; }
    }
    if (hit || q.life <= 0 || !passable(q.x, q.y + 10) && tileAt(q.x / T, (q.y + 10) / T) !== WATER) {
      if (hit) emit(q.x, q.y, 4, { color: ['#fff', '#ddd'], kind: 'spark', smin: 40, smax: 100, lmin: .1, lmax: .2 });
      shots.splice(i, 1);
    }
  }
}
// 적(산적·적 군단) 한 명의 공격: 대상이 사거리 안이면 때리거나 쏜다. 반환: 대상 쪽으로 더 다가갈지
function foeStrike(b, tgt, d) {
  const U = UNITS[b.ut] || UNITS.club, p = S.player;
  if (U.role === 'ranged') {
    const R = U.range * 0.75;
    if (d <= R && b.atk <= 0) {
      b.atk = U.reload * rr(1.5, 2.0); b.swing = 0.25;
      fireShot(b.x, b.y - 14, tgt.x, tgt.y - 12, 1, U.proj, U.proj === 'ball' ? 2 : 1);
    }
    return d > R * 0.7;
  }
  if (d < 24 && b.atk <= 0) {
    b.atk = U.role === 'cav' ? 1.2 : 1.1; b.swing = 0.25;
    const dmg = (b.cmd ? 2 : 1) * (U.armor || U.role === 'cav' ? 1.5 : 1);
    if (tgt === p) playerHurt(Math.round(dmg), 0.10); else soldierHurt(tgt, dmg);
  }
  return true;
}
function foeSpeed(b) { const U = UNITS[b.ut]; return U ? U.sp : 1; }

// ---------- 그리기 (2D) ----------
function drawUnit2D(g, x, y, lk, o) {
  const face = o.face || 1;
  if (lk.mount) {
    drawHorse(g, x, y + 4, face, o.walk || 0, true, lk.mount);
    drawHuman(g, x - face * 2, y - 10, Object.assign({}, lk, o, { walk: 0, noShadow: true }));
  } else drawHuman(g, x, y, Object.assign({}, lk, o));
}
function drawShots2D(g, list) {
  for (const q of list || shots) {
    const P = PROJ[q.kind] || PROJ.arrow, a = Math.atan2(q.vy, q.vx);
    if (q.kind === 'stone' || q.kind === 'ball') { g.fillStyle = P.col; g.beginPath(); g.arc(q.x, q.y, q.kind === 'ball' ? 2.4 : 2.8, 0, 7); g.fill(); }
    else { g.strokeStyle = P.col; g.lineWidth = 1.8; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - Math.cos(a) * 11, q.y - Math.sin(a) * 11); g.stroke(); }
  }
}
// 3D 화면 위 2D 오버레이로 투사체 그리기 (world3d/battle3d 공용)
function drawShots3D(g, list, pr, ks, h, dy) {
  for (const q of list) {
    const P = PROJ[q.kind] || PROJ.arrow, a = Math.atan2(q.vy, q.vx);
    R3D.project(q.x / T, h, (q.y + dy) / T, pr); if (!pr.vis) continue;
    if (q.kind === 'stone' || q.kind === 'ball') { g.fillStyle = q.kind === 'ball' ? '#111' : '#8a8a80'; g.beginPath(); g.arc(pr.x, pr.y, (q.kind === 'ball' ? 3 : 3.6) * ks, 0, 7); g.fill(); }
    else {
      const x2 = pr.x, y2 = pr.y;
      R3D.project((q.x - Math.cos(a) * 14) / T, h, (q.y + dy - Math.sin(a) * 14) / T, pr);
      g.strokeStyle = q.kind === 'bolt' ? '#2a2a30' : '#4a3018'; g.lineWidth = 2.2 * ks; g.lineCap = 'round';
      g.beginPath(); g.moveTo(pr.x, pr.y); g.lineTo(x2, y2); g.stroke();
      g.fillStyle = '#ddd'; g.beginPath(); g.arc(x2, y2, 1.6 * ks, 0, 7); g.fill();
    }
  }
}

$('techBtn').addEventListener('click', openTechPanel);
$('armyBtn').addEventListener('click', openArmyPanel);
$('techMenuBtn').addEventListener('click', openTechPanel);
$('armyMenuBtn').addEventListener('click', openArmyPanel);
