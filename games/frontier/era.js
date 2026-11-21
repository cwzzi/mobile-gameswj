'use strict';
// ===== 시대 · 군주 · 왕조 =====
// ERAS: 시대 표(데이터). 새 시대는 배열 끝에 항목만 추가하면 된다.
//   title: 그 시대 군주의 칭호 · accent: UI 강조색 · maxLv: 마을 최대 레벨(성 모습 상한) · radius: 영토 반경 보너스
//   prod/income: 생산·세금 배율 · townCost: 새 마을 비용 배율 · diff: 적 강도 배율 · banditHp: 산적 체력
//   atk/hp: 군주 공격력·체력 보너스 · arrow: 망루 화살 피해 · need: 이 시대로 "들어오기" 위한 조건
//     need.tech = 앞 시대의 핵심 기술(tech.js TECHS key:true) · need.towns = 가벼운 선행 조건(마을 수)
//   looks: 군주/아군/적/주민 외형 (R3D.human · drawHuman 옵션. kit/tint 는 CC0 모델 선택용)
//   factions: 이 시대 전쟁 상대 (모두 지어낸 이름)
const ERA_SELECT = true;       // false 면 새 게임 화면에서 시대 선택을 숨기고 항상 부족 시대부터
const YEAR_SEC = 20;           // 게임 속 1년 = 플레이 20초
const ERAS = [
  { id: 'tribal', name: '부족 시대', icon: '🔥', title: '족장', accent: '#d9915a', town: '부락', bandit: '약탈자',
    maxLv: 2, radius: 0, prod: 1, income: 1, townCost: 0.8, diff: 0.8, banditHp: 3, atk: 0, hp: 0, arrow: 1,
    flavor: '돌도끼와 통나무로 첫 터전을 일구는 시대. 부족을 이끌고 사냥터와 숲을 넓히세요.',
    perks: ['마을 최대 Lv2 (나무 울타리 부락)', '집 · 벌목소 · 학당 (나머지는 🔬 연구로)'],
    start: { age: 20, desc: '맨땅 · 첫 마을 무료' },
    looks: {
      player: { body: '#7a4a2a', trim: '#d9b36a', legs: '#4a3020', cape: '#5a3a22', hat: 'horned', helm: '#6a5a40', weapon: 'axe', kit: 'chief' },
      ally: { body: '#3a6fc0', trim: '#8a6a40', legs: '#4a3020', hat: 'band', helm: '#d9b36a', weapon: 'club', kit: 'tribe' },
      bandit: { body: '#6a4a2a', trim: '#2a1a12', legs: '#2a2420', hat: 'hood', helm: '#4a3020', weapon: 'club', tint: '#6a4a2a' },
      grunt: f => ({ body: f.color, trim: '#3a2a18', legs: '#3a2a20', hat: 'band', helm: f.plume, weapon: 'club', kit: 'tribe' }),
      officer: f => ({ body: f.color, trim: '#c9a040', legs: '#2a2018', hat: 'horned', helm: '#6a5a40', weapon: 'axe', armor: true, cape: '#5a3a22', kit: 'tribe', scale: 1.25 }),
      boss: f => ({ body: shadeHex(f.color, 0.8), trim: '#e0b040', legs: '#1a1a1a', hat: 'horned', helm: '#4a3a2a', weapon: 'glaive', armor: true, cape: '#4a2a12', kit: 'tribe', scale: 1.55 }),
      villager: { cols: ['#8a6a4a', '#6a5030', '#a07850', '#7a5a3a', '#9a7a52'], hat: null, legs: '#4a3020' },
    },
    factions: [
      { name: '들개 부족', color: '#5a4a3a', plume: '#c22', boss: '들개 추장 우르가' },
      { name: '붉은뿔 부족', color: '#8a3a22', plume: '#ffcc33', boss: '붉은뿔 카르노' },
      { name: '바위곰 부족', color: '#5a5a52', plume: '#ddd', boss: '바위곰 투가' },
      { name: '잿빛 늑대 무리', color: '#6b6355', plume: '#888', boss: '회색이빨 바르크' },
    ] },
  { id: 'ancient', name: '고대 왕국', icon: '🏺', title: '왕', accent: '#e8b84a', town: '성읍', bandit: '산적',
    maxLv: 3, radius: 0, prod: 1.15, income: 1.1, townCost: 1, diff: 1, banditHp: 4, atk: 0, hp: 2, arrow: 1,
    need: { tech: 'bronze', towns: 1 },
    flavor: '청동과 돌의 시대. 부족들이 하나의 왕국으로 모이고, 시장과 망루가 들어섭니다.',
    perks: ['마을 최대 Lv3 (목책 병영)', '생산 ×1.15 · 세금 ×1.1'],
    start: { age: 24, desc: '수도 1곳 · 인구 22' },
    looks: {
      player: { body: '#9a3a2a', trim: '#f2c14e', legs: '#4a2a20', cape: '#7a1a4a', hat: 'crown', weapon: 'spear', tint: '#b0503a' },
      ally: { body: '#3a6fc0', trim: '#d9c080', legs: '#2a3040', hat: 'helm', helm: '#b08a4a', plume: '#4fa3ff', weapon: 'spear' },
      bandit: { body: '#7a2a22', trim: '#2a1a12', legs: '#2a2420', hat: 'hood', helm: '#3a2a22', weapon: 'club', tint: '#8a2a20' },
      grunt: f => ({ body: f.color, trim: '#2a2218', legs: '#2a2420', hat: 'helm', helm: '#9a7a4a', plume: f.plume, weapon: 'spear' }),
      officer: f => ({ body: f.color, trim: '#c9a040', legs: '#222', hat: 'helm', helm: '#8a7a50', plume: f.plume, weapon: 'axe', armor: true, cape: '#5a1a1a', scale: 1.25 }),
      boss: f => ({ body: shadeHex(f.color, 0.8), trim: '#e0b040', legs: '#1a1a1a', hat: 'horned', helm: '#2a2a30', weapon: 'glaive', armor: true, cape: '#7a0e0e', scale: 1.55 }),
      villager: { cols: ['#b08a4a', '#a0603a', '#7a9a4a', '#c8b080', '#8a5a3a'], hat: 'band', legs: '#4a3a2a' },
    },
    factions: [
      { name: '흑랑 군단', color: '#3a3a44', plume: '#111', boss: '흑랑장 도견' },
      { name: '붉은매 군단', color: '#9a2a22', plume: '#ffcc33', boss: '홍매장 사련' },
      { name: '청동방패단', color: '#7a5a2a', plume: '#c22', boss: '청동장 무열' },
      { name: '모래바람 왕국군', color: '#a08050', plume: '#fff', boss: '사막왕 아르칸' },
    ] },
  { id: 'medieval', name: '중세', icon: '🏰', title: '국왕', accent: '#6aa5e0', town: '성', bandit: '도적떼',
    maxLv: 5, radius: 0, prod: 1.3, income: 1.25, townCost: 1.2, diff: 1.25, banditHp: 5, atk: 1, hp: 4, arrow: 1,
    need: { tech: 'iron', towns: 2 },
    flavor: '돌성과 기사의 시대. 성벽이 높아지고 금광이 왕국의 금고를 채웁니다.',
    perks: ['마을 최대 Lv5 (돌성 · 성벽)', '생산 ×1.3 · 세금 ×1.25 · 공격력 +1'],
    start: { age: 26, desc: '마을 2곳 · 인구 46' },
    looks: {
      player: { body: '#2b5fb8', trim: '#f2c14e', cape: '#c0392b', hat: 'crown', weapon: 'sword', armor: true },
      ally: { body: '#3a6fc0', trim: '#d9c080', legs: '#2a3040', hat: 'helm', helm: '#9aa4b0', plume: '#4fa3ff', weapon: 'sword', armor: true, kit: 'knight' },
      bandit: { body: '#4a4a52', trim: '#2a1a12', legs: '#2a2420', hat: 'hood', helm: '#2a2a30', weapon: 'club', tint: '#4a4a5a' },
      grunt: f => ({ body: f.color, trim: '#2a2218', legs: '#2a2420', hat: 'helm', helm: '#8a8e96', plume: f.plume, weapon: 'sword', armor: true, kit: 'knight' }),
      officer: f => ({ body: f.color, trim: '#c9a040', legs: '#222', hat: 'helm', helm: '#a0a4ac', plume: f.plume, weapon: 'sword', armor: true, cape: '#5a1a1a', kit: 'knight', scale: 1.25 }),
      boss: f => ({ body: shadeHex(f.color, 0.8), trim: '#e0b040', legs: '#1a1a1a', hat: 'helm', helm: '#2a2a30', plume: f.plume, weapon: 'glaive', armor: true, cape: '#7a0e0e', kit: 'knight', scale: 1.55 }),
      villager: { cols: ['#7a9a4a', '#a0603a', '#4a7aa0', '#b08a4a', '#8a5a9a'], hat: 'band', legs: '#4a3a2a' },
    },
    factions: [
      { name: '철갑 기사단', color: '#5a5f6a', plume: '#c22', boss: '철벽 강오' },
      { name: '검은장미 기사단', color: '#2a2228', plume: '#a01a3a', boss: '흑장미 경 세린' },
      { name: '북방 영주군', color: '#3a5a6a', plume: '#fff', boss: '북방공 바르텐' },
      { name: '잿빛 늑대단', color: '#6b6355', plume: '#ddd', boss: '회랑 백린' },
    ] },
  { id: 'early_modern', name: '근세', icon: '👑', title: '황제', accent: '#c07ae0', town: '도시', bandit: '무장 도적',
    maxLv: 5, radius: 1, prod: 1.5, income: 1.5, townCost: 1.4, diff: 1.5, banditHp: 6, atk: 2, hp: 6, arrow: 2,
    need: { tech: 'gunpowder', towns: 3 },
    flavor: '여러 왕국을 아우르는 제국의 시대. 도시는 커지고 망루는 화약으로 무장합니다.',
    perks: ['영토 반경 +1', '망루 화살 피해 ×2 (화약)', '생산 ×1.5 · 세금 ×1.5 · 공격력 +2'],
    start: { age: 28, desc: '마을 3곳 · 인구 85' },
    looks: {
      player: { body: '#5a2a7a', trim: '#f2c14e', legs: '#2a1a3a', cape: '#f0e8f8', hat: 'crown', weapon: 'glaive', armor: true, tint: '#7a4aa8' },
      ally: { body: '#2a4a9a', trim: '#f0e0b0', legs: '#1a2030', hat: 'helm', helm: '#c0c4cc', plume: '#fff', weapon: 'spear', armor: true, kit: 'knight' },
      bandit: { body: '#3a3a30', trim: '#2a1a12', legs: '#2a2420', hat: 'hood', helm: '#1a1a1a', weapon: 'sword', tint: '#3a3a2a' },
      grunt: f => ({ body: f.color, trim: '#e0d0a0', legs: '#1a1a1a', hat: 'helm', helm: '#b0b4bc', plume: f.plume, weapon: 'spear', armor: true, kit: 'knight' }),
      officer: f => ({ body: f.color, trim: '#e0b040', legs: '#111', hat: 'helm', helm: '#d0c080', plume: f.plume, weapon: 'sword', armor: true, cape: '#2a1a4a', kit: 'knight', scale: 1.25 }),
      boss: f => ({ body: shadeHex(f.color, 0.8), trim: '#f0c040', legs: '#111', hat: 'helm', helm: '#d0a040', plume: f.plume, weapon: 'glaive', armor: true, cape: '#1a0e3a', kit: 'knight', scale: 1.55 }),
      villager: { cols: ['#2a4a8a', '#8a2a3a', '#4a4a4a', '#e0d8c0', '#4a6a3a'], hat: 'band', legs: '#2a2a30' },
    },
    factions: [
      { name: '서해 제국군', color: '#2a3a6a', plume: '#fff', boss: '원수 에드릭' },
      { name: '금사자 연합', color: '#8a6a20', plume: '#c22', boss: '금사자공 레오란' },
      { name: '흑철 총독군', color: '#2a2a2a', plume: '#ffcc33', boss: '총독 카스펠' },
      { name: '붉은 깃발 반란군', color: '#8a1a1a', plume: '#111', boss: '반란수괴 도르함' },
    ] },
];
const RULER_NAMES = ['한결', '다온', '이안', '윤슬', '도하', '서진', '하람', '지온', '태율', '라온', '새솔', '가온', '시우', '누리', '해솔', '온유', '다솜', '로운', '휘연', '예솔', '무진', '아람', '세온', '라희', '바다', '진솔', '하율', '은결'];
const DYNASTY_NAMES = ['청람', '백운', '금빛', '은하', '단목', '소야', '미르', '가람', '새벽', '해든', '초록', '별바라기', '너울', '마루'];
const pickName = (list, not) => { let n; for (let k = 0; k < 20; k++) { n = list[ri(list.length)]; if (n !== not) break; } return n; };

function eraCur() { return ERAS[clamp((S && S.era) | 0, 0, ERAS.length - 1)]; }
function eraNext() { return S && S.era + 1 < ERAS.length ? ERAS[S.era + 1] : null; }
function eraTitle() { return eraCur().title; }
function rulerName() { return S && S.ruler ? `${eraTitle()} ${S.ruler.name}` : eraTitle(); }
function rulerAge() { return S && S.ruler ? S.year - S.ruler.born : 0; }
function townLabel(t) { return `${t.name} ${eraCur().town} Lv${townLevel(t)}`; }
// 외형: kind = player | ally | bandit | grunt | officer | boss  (f: 진영)
function eraLook(kind, f, era) {
  const L = ERAS[era === undefined ? S.era : era].looks[kind];
  return Object.assign({}, typeof L === 'function' ? L(f || eraCur().factions[0]) : L);
}
function eraVillager() { const v = eraCur().looks.villager; return { body: v.cols[ri(v.cols.length)], hat: v.hat, legs: v.legs }; }
function warFaction(w) { const E = ERAS[w && w.era !== undefined ? w.era : S.era] || eraCur(); return E.factions[((w && w.faction) | 0) % E.factions.length]; }
function buildUnlocked(k) { return !BUILD[k].tech || techHas(BUILD[k].tech); }

// ---------- 연구 점수 (옛 '발전도' S.dev = 쓰지 않은 연구 점수 비축) ----------
function eraStats() {
  const pop = S.towns.reduce((a, t) => a + t.pop, 0);
  const cnt = k => S.buildings.filter(b => b.type === k).length;
  return { pop, towns: S.towns.length, wars: S.warsWon, schools: cnt('school'), markets: cnt('market') };
}
function devRate() {
  const s = eraStats();
  return S.towns.length ? 0.4 + s.pop * 0.015 + s.towns * 0.2 + s.schools * 0.6 + s.markets * 0.3 : 0;
}
// 다음 시대 조건별 진행 [{k, label, cur, need, f, txt}] — 핵심 기술 + 마을 수
function eraReqs() {
  const N = eraNext(); if (!N) return [];
  const s = eraStats(), n = N.need, kt = TECH[n.tech];
  const R = [];
  if (kt) {
    const done = techHas(kt.id), ri_ = S.research && S.research.id === kt.id ? clamp(S.research.p / kt.cost, 0, 0.99) : 0;
    R.push({ k: 'tech', label: `🔬 ${kt.name}`, cur: done ? 1 : ri_, need: 1, txt: done ? '완료' : ri_ ? `연구 중 ${Math.floor(ri_ * 100)}%` : '미연구' });
  }
  if (n.towns) R.push({ k: 'towns', label: '🏘️ 마을 수', cur: s.towns, need: n.towns });
  for (const r of R) r.f = clamp(r.cur / r.need, 0, 1);
  return R;
}
// 시대 진행도: 이 시대 기술을 얼마나 연구했나 (핵심 기술 비중 크게)
function eraProgress() {
  const N = eraNext(); if (!N) return 1;
  const ts = TECHS.filter(t => t.era === S.era); if (!ts.length) return eraReady() ? 1 : 0;
  let a = 0, w = 0;
  for (const t of ts) { const k = t.key ? 3 : 1; w += k; a += k * (techHas(t.id) ? 1 : S.research && S.research.id === t.id ? clamp(S.research.p / t.cost, 0, 1) : 0); }
  return clamp(a / w, 0, 1);
}
function eraReady() { const R = eraReqs(); return R.length > 0 && R.every(r => r.f >= 1); }

// ---------- 군주 ----------
function makeRuler(name, age, gen) {
  const r = { name, gen: gen || 1, born: S.year - age, life: 55 + ri(21), heirAt: 25 + ri(11), heir: null, start: S.year, warned: false,
    st: { towns: 0, wars: 0, era0: S.era } };
  if (age >= r.heirAt) r.heirAt = age + 1 + ri(3);
  return r;
}
function rulerStat(k) { if (S.ruler) S.ruler.st[k] = (S.ruler.st[k] || 0) + 1; }

let eraReadyShown = false;
// updateWorld 맨 앞에서 호출. 군주가 세상을 떠나 계승 화면을 띄우면 true
function eraTick(dt) {
  if (!S.ruler) return false;
  // 기술 연구 · 적 문명
  techTick(dt); foeTick(dt);
  if (MODE !== 'world' || paused) return true; // 연구 완료로 시대 전환 화면이 떴다
  const N = eraNext();
  if (N) {
    const ready = eraReady();
    if (ready && !eraReadyShown) { eraReadyShown = true; toast(`🏛️ <b>${N.name}</b>${josaP(N.name, '으로로')} 나아갈 준비가 되었습니다!<br>왼쪽 위 <b>시대 전환</b> 버튼을 누르세요`, 4.5); }
    if (!ready) eraReadyShown = false;
  }
  // 달력
  S.yearT = (S.yearT || 0) + dt;
  if (S.yearT < YEAR_SEC) return false;
  S.yearT -= YEAR_SEC; S.year++;
  const R = S.ruler, age = rulerAge();
  if (!R.heir && age >= R.heirAt) {
    R.heir = { name: pickName(RULER_NAMES, R.name), born: S.year };
    toast(`👶 ${rulerName()}에게 후계자 <b>${R.heir.name}</b>${josaP(R.heir.name, '이가')} 태어났습니다`, 3.5);
  }
  if (!R.warned && age >= R.life - 4) {
    R.warned = true;
    toast(`🕯️ ${rulerName()}(${age}세)의 기력이 쇠하고 있습니다.<br>${R.heir ? `후계자 ${R.heir.name}(${S.year - R.heir.born}세)이 뒤를 이을 준비를 합니다` : '아직 후계자가 없습니다'}`, 4.5);
  }
  if (age >= R.life) { succession(); return true; }
  return false;
}
function reignSummary(R, endYear) {
  const e0 = ERAS[R.st.era0] || ERAS[0];
  return { gen: R.gen, name: R.name, title: e0 === eraCur() ? eraTitle() : `${e0.title}→${eraTitle()}`, from: R.start, to: endYear, age: endYear - R.born,
    eraFrom: e0.name, eraTo: eraCur().name, towns: R.st.towns || 0, wars: R.st.wars || 0 };
}
function succession() {
  paused = true; actHeld = false; auto = null; dismount();
  const R = S.ruler, sum = reignSummary(R, S.year);
  S.chron = S.chron || []; S.chron.push(sum);
  let heir = R.heir, rel = '후계자';
  if (!heir) { heir = { name: pickName(RULER_NAMES, R.name), born: S.year - (18 + ri(8)) }; rel = '조카'; }
  const hAge = S.year - heir.born, newLv = Math.max(1, Math.floor(S.hero.lv * 0.6));
  const p = $('succPanel');
  p.innerHTML = `<div class="era-kicker">🕯️ 붕어</div>
    <h2 class="era-big">${eraTitle()} ${R.name} 서거</h2>
    <div class="sub" style="text-align:center">${S.dynasty} 왕조 ${R.gen}대 · 향년 ${sum.age}세</div>
    <div class="stats"><span>치세</span><b>${sum.to - sum.from}년 (건국 ${sum.from}~${sum.to}년)</b>
      <span>세운 마을</span><b>${sum.towns}곳</b><span>전쟁 승리</span><b>${sum.wars}회</b>
      <span>시대</span><b>${sum.eraFrom === sum.eraTo ? sum.eraTo : sum.eraFrom + ' → ' + sum.eraTo}</b></div>
    <div class="sub" style="text-align:center">${rel} <b>${heir.name}</b>(${hAge}세)${josaP(heir.name, '이가')} 뒤를 잇습니다.${hAge < 16 ? '<br>어린 군주를 원로들이 섭정으로 돕습니다.' : ''}<br>왕국의 자원과 영토는 그대로 이어지고,<br>군주 레벨은 ${S.hero.lv} → <b>${newLv}</b>${josaP(String(newLv), '으로로')} 새로 시작합니다.</div>
    <button class="opt primary" id="succGo"><span class="ic">👑</span><span>${S.dynasty} 왕조 ${R.gen + 1}대 ${eraTitle()} ${heir.name} 즉위<small>계속 플레이</small></span></button>`;
  p.classList.add('show');
  $('succGo').onclick = () => {
    p.classList.remove('show');
    S.ruler = makeRuler(heir.name, hAge, R.gen + 1);
    S.hero.lv = newLv; S.hero.exp = 0; S.player.hp = heroMaxHp();
    paused = false;
    banner(`${S.dynasty} 왕조 ${S.ruler.gen}대`, `${rulerName()} 즉위`, 3);
    applyEraTheme(); save();
  };
}

// ---------- 시대 전환 ----------
function eraUnlockList(i) { return TECHS.filter(t => t.era === i).map(t => `${t.icon}${t.name}`); }
// tech: 시대를 연 기술 (연구 완료로 넘어갈 때)
function advanceEra(force, tech) {
  const N = eraNext(); if (!N || (!force && !eraReady())) return false;
  const oldTitle = rulerName(), prev = eraCur();
  tech = tech || TECH[N.need && N.need.tech];
  if (force && tech && !techHas(tech.id)) S.techs.push(tech.id);
  S.era++; eraReadyShown = false;
  if (S.research && TECH[S.research.id] && TECH[S.research.id].era < S.era - 1) S.research = null;
  S.foeLv = Math.max(S.foeLv === undefined ? 0 : S.foeLv, S.era - 0.6);
  toastT = 0; $('toast').classList.remove('show'); // '준비 완료' 안내 지우기
  S.eraLog = S.eraLog || []; S.eraLog.push({ era: S.era, year: S.year, ruler: S.ruler ? S.ruler.name : '' });
  villagers.length = 0; // 새 옷차림으로 다시 나온다
  recomputeOwner(); applyEraTheme();
  paused = true; actHeld = false; auto = null;
  const unl = eraUnlockList(S.era);
  const p = $('eraUpPanel');
  p.innerHTML = `<div class="era-kicker">${prev.icon} ${prev.name} → ${N.icon}</div>
    ${tech ? `<div class="era-break">${tech.icon} ${tech.name} 성공!</div>` : ''}
    <h2 class="era-big">${N.name} 시대가<br>열렸습니다</h2>
    <div class="era-flavor">${N.flavor}</div>
    <div class="era-title"><s>${oldTitle}</s> <span>→</span> <b>${rulerName()}</b></div>
    <ul class="era-list">${N.perks.map(s => `<li>${s}</li>`).join('')}${unl.length ? `<li>🔬 새 기술: ${unl.join(' · ')}</li>` : ''}<li>⚠️ 적들도 곧 새 무기를 들고 옵니다</li></ul>
    <button class="opt primary" id="eraGo"><span class="ic">${N.icon}</span><span>새 시대를 연다</span></button>`;
  p.classList.add('show');
  $('eraGo').onclick = () => { p.classList.remove('show'); paused = false; banner(`${N.icon} ${N.name}`, `${rulerName()}의 시대`, 3); };
  if (tech) banner(`${tech.icon} ${tech.name} 성공!`, `${N.name} 시대가 열렸습니다`, 3);
  emit(S.player.x, S.player.y - 20, 60, { color: ['#fff', '#ffd54a', N.accent], smin: 60, smax: 220, up: 80, lmin: .6, lmax: 1.4, grav: 120 });
  save();
  return true;
}
function applyEraTheme() {
  if (!S) return;
  const E = eraCur(), st = document.documentElement.style;
  st.setProperty('--accent', E.accent);
  st.setProperty('--era', E.accent);
}

// ---------- 패널: 시대 정보 / 연대기 ----------
function openEraPanel() {
  if (!S || MODE !== 'world') return;
  paused = true; actHeld = false; auto = null;
  const E = eraCur(), N = eraNext(), R = eraReqs();
  let h = `<div class="era-kicker">${E.icon} 지금 시대</div><h2>${E.name} <span style="font-size:13px;color:#b8c2b0">· ${rulerName()}</span></h2>
    <div class="sub">${E.flavor}<br>${E.perks.join(' · ')}</div>`;
  if (N) {
    h += `<div class="era-next">다음 시대: <b>${N.icon} ${N.name}</b> <small>(칭호 ${N.title})</small></div>`;
    for (const r of R) h += `<div class="req"><span>${r.f >= 1 ? '✅' : '⬜'} ${r.label}</span><b>${r.txt || r.cur + '/' + r.need}</b><div class="barw"><i style="width:${r.f * 100}%"></i></div></div>`;
    h += `<div class="sub" style="margin-top:8px">연구 점수는 인구·마을·시장, 특히 <b>📜 학당</b>에서 쌓입니다 (지금 초당 +${researchRate().toFixed(1)})<br>다음 시대: ${[...N.perks.slice(0, 1), ...eraUnlockList(S.era + 1)].join(' · ')}<br>적 문명: ${ERAS[foeEra()].icon} ${ERAS[foeEra()].name}</div>`;
    h += `<button class="opt" data-a="tech"><span class="ic">🔬</span><span>기술 연구 열기<small>시대 진행 ${Math.floor(eraProgress() * 100)}%</small></span></button>`;
    if (eraReady()) h += `<button class="opt primary" data-a="adv"><span class="ic">${N.icon}</span><span>${josa(N.name, '으로로')} 나아가기<small>준비 완료!</small></span></button>`;
  } else h += `<div class="era-next">마지막 시대에 도달했습니다. 제국을 넓혀 영토 ${GOAL_TILES}칸을 채우세요!</div>`;
  h += `<button class="close" data-a="close">닫기</button>`;
  const p = $('eraPanel'); p.innerHTML = h; p.classList.add('show');
}
$('eraPanel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  $('eraPanel').classList.remove('show'); paused = false;
  if (b.dataset.a === 'adv') advanceEra();
  if (b.dataset.a === 'tech') openTechPanel();
});
function openChronicle() {
  paused = true; $('menuPanel').classList.remove('show');
  const list = [...(S.chron || [])];
  const R = S.ruler, cur = R ? reignSummary(R, S.year) : null;
  let h = `<h2>📜 ${S.dynasty} 왕조 연대기</h2><div class="sub">건국 ${S.year}년 · ${eraCur().name}</div>`;
  if (cur) h += `<div class="chron now"><b>${cur.gen}대 ${eraTitle()} ${cur.name}</b> <small>재위 중 · ${cur.age}세</small><br><small>건국 ${cur.from}년~ · 치세 ${cur.to - cur.from}년 · 마을 ${cur.towns} · 승전 ${cur.wars}${R.heir ? ` · 후계자 ${R.heir.name}(${S.year - R.heir.born}세)` : ''}</small></div>`;
  for (const c of list.reverse()) h += `<div class="chron"><b>${c.gen}대 ${c.title} ${c.name}</b> <small>향년 ${c.age}세</small><br><small>건국 ${c.from}~${c.to}년 · 치세 ${c.to - c.from}년 · ${c.eraFrom === c.eraTo ? c.eraTo : c.eraFrom + '→' + c.eraTo} · 마을 ${c.towns} · 승전 ${c.wars}</small></div>`;
  for (const l of [...(S.eraLog || [])].reverse()) h += `<div class="chron era"><small>건국 ${l.year}년 · ${ERAS[l.era].icon} <b>${ERAS[l.era].name}</b> 시작 (${l.ruler})</small></div>`;
  h += `<button class="close" id="chronClose">닫기</button>`;
  const p = $('chronPanel'); p.innerHTML = h; p.classList.add('show');
  $('chronClose').onclick = () => { p.classList.remove('show'); paused = false; };
}

// ---------- 새 게임: 시대 · 이름 고르기 ----------
let startSel = 0;
function showStart(fromMenu) {
  paused = true; auto = null;
  startSel = 0;
  const p = $('startPanel');
  const nm = pickName(RULER_NAMES), dy = pickName(DYNASTY_NAMES);
  let h = `<div class="era-kicker">개척왕</div><h2 class="era-big" style="margin-bottom:6px">새 왕조를 세우다</h2>
    <div class="sub" style="text-align:center">문명은 시대를 따라 자라고, 군주는 늙어 후계자에게 왕관을 넘깁니다.</div>`;
  if (ERA_SELECT) {
    h += `<div class="lbl">시작 시대</div><div id="eraPick">`;
    ERAS.forEach((E, i) => { h += `<button class="opt era-opt${i === 0 ? ' sel' : ''}" data-i="${i}" style="--c:${E.accent}"><span class="ic">${E.icon}</span><span><b>${E.name}</b> · ${E.title}<small>${E.start.desc}</small></span></button>`; });
    h += `</div>`;
  }
  h += `<div class="lbl">왕조 이름</div><div class="inrow"><input id="dynIn" maxlength="8" value="${dy}"><span>왕조</span><button class="dice" data-r="dyn">🎲</button></div>
    <div class="lbl">군주 이름</div><div class="inrow"><span id="startTitle">${ERAS[0].title}</span><input id="nameIn" maxlength="6" value="${nm}"><button class="dice" data-r="name">🎲</button></div>
    <div class="startActs"><button class="opt primary" id="startGo"><span class="ic">👑</span><span>이 왕조로 시작</span></button>${fromMenu ? '<button class="close" id="startCancel">취소</button>' : ''}</div>`;
  p.innerHTML = h; p.classList.add('show');
  p.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.i !== undefined) {
      startSel = +b.dataset.i;
      for (const x of p.querySelectorAll('.era-opt')) x.classList.toggle('sel', x === b);
      $('startTitle').textContent = ERAS[startSel].title;
    } else if (b.dataset.r === 'dyn') $('dynIn').value = pickName(DYNASTY_NAMES, $('dynIn').value);
    else if (b.dataset.r === 'name') $('nameIn').value = pickName(RULER_NAMES, $('nameIn').value);
    else if (b.id === 'startCancel') { p.classList.remove('show'); paused = false; }
    else if (b.id === 'startGo') {
      const name = ($('nameIn').value || '').trim().slice(0, 6) || pickName(RULER_NAMES);
      const dynasty = ($('dynIn').value || '').trim().replace(/\s*왕조$/, '').slice(0, 8) || pickName(DYNASTY_NAMES);
      try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
      toastT = 0; $('toast').classList.remove('show');
      p.classList.remove('show'); $('menuPanel').classList.remove('show');
      newGame({ era: ERA_SELECT ? startSel : 0, name, dynasty });
      paused = false;
      const E = eraCur();
      banner(`${E.icon} ${E.name}`, `${S.dynasty} 왕조 1대 ${rulerName()}`, 3);
      save();
    }
  };
}

// 새 게임에서 시대 상태 만들기 (+ 늦은 시대는 앞선 발전을 미리 깔아 준다)
function eraNewGame(opts, home) {
  const era = clamp(opts.era | 0, 0, ERAS.length - 1);
  S.era = era; S.dev = 0; S.year = 1;
  S.techs = techsBelowEra(era); S.research = null; S.army = {}; S.armyMode = 'follow'; S.foeLv = era; S.foeShown = era; S.yearT = 0; S.chron = []; S.eraLog = [{ era, year: 1, ruler: '' }];
  S.dynasty = opts.dynasty || pickName(DYNASTY_NAMES);
  const name = opts.name || pickName(RULER_NAMES);
  S.ruler = makeRuler(name, ERAS[era].start.age, 1);
  S.eraLog[0].ruler = name;
  if (era === 0) return;
  // 수도와 주변 마을
  const plan = [null,
    { towns: [[22, { house: 3, farm: 1, school: 1, lumber: 1, barracks: 1 }]], res: [60, 30, 60], lv: 3, wars: 0, army: { club: 3, sling: 2 } },
    { towns: [[32, { house: 6, farm: 2, school: 2, market: 1, tower: 1, lumber: 1, quarry: 1, barracks: 1, range: 1 }], [14, { house: 2, farm: 1, school: 1 }]], res: [120, 80, 150], lv: 5, wars: 1, army: { spear: 4, archer: 3, rider: 1 } },
    { towns: [[45, { house: 8, farm: 2, school: 2, market: 2, tower: 2, lumber: 1, quarry: 1, mine: 1, barracks: 1, range: 1, stable: 1 }], [25, { house: 4, farm: 1, school: 1, market: 1 }], [15, { house: 2, farm: 1, school: 1 }]], res: [220, 150, 260], lv: 7, wars: 3, army: { sword: 5, xbow: 3, knight: 2 } },
  ][era];
  const spots = [home];
  for (let k = 0; k < 6000 && spots.length < plan.towns.length; k++) {
    const a = rand() * Math.PI * 2, d = rr(12, 17), x = Math.round(home.x + Math.cos(a) * d), y = Math.round(home.y + Math.sin(a) * d);
    if (x < 6 || y < 6 || x >= W - 6 || y >= H - 6 || tileAt(x, y) !== GRASS || !neighborsLand(x, y)) continue;
    if (spots.some(s => dist2(s.x, s.y, x, y) < 11 * 11)) continue;
    spots.push({ x, y });
  }
  plan.towns.forEach(([pop, blds], i) => {
    const s = spots[i]; if (!s) return;
    const id = S.towns.length;
    const t = { id, x: s.x, y: s.y, pop, name: TOWN_NAMES[id % TOWN_NAMES.length], growT: 0, taxT: 0 };
    S.towns.push(t); S.tiles[s.y * W + s.x] = GRASS;
    recomputeOwner();
    for (const k in blds) for (let n = 0; n < blds[k]; n++) eraPlaceBuilding(t, k);
  });
  S.wood = plan.res[0]; S.stone = plan.res[1]; S.gold = plan.res[2];
  S.hero.lv = plan.lv; S.warsWon = plan.wars; S.player.hp = heroMaxHp();
  S.army = Object.assign({}, plan.army || {});
  S.ruler.st.towns = 0;
}
function eraPlaceBuilding(t, type) {
  const r = townRadius(t), cand = [];
  for (let y = t.y - r; y <= t.y + r; y++) for (let x = t.x - r; x <= t.x + r; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    if (owner[i] !== t.id || (S.tiles[i] !== GRASS && S.tiles[i] !== SAND)) continue;
    if (Math.abs(t.x - x) <= 1 && Math.abs(t.y - y) <= 1) continue;
    if (S.buildings.some(b => b.x === x && b.y === y)) continue;
    if (RES_DEF[type] && !resTiles(type, x, y).length) continue;
    cand.push({ x, y, d: dist2(x, y, t.x, t.y) });
  }
  if (!cand.length) return false;
  cand.sort((a, b) => a.d - b.d);
  const c = cand[Math.min(cand.length - 1, ri(Math.min(6, cand.length)))];
  S.buildings.push({ type, x: c.x, y: c.y, town: t.id, t: 0, pt: 0, cnt: 0 });
  return true;
}
// 옛 저장 → 시대/군주 채워 넣기 (건물·마을 레벨로 시대를 추정해 영토가 줄지 않게)
function eraMigrate(o) {
  if (o.era === undefined) {
    let era = 0;
    const has = k => o.buildings.some(b => b.type === k);
    if (has('quarry') || has('tower') || has('market')) era = 1;
    if (has('mine')) era = 2;
    const maxLv = o.towns.reduce((a, t) => Math.max(a, Math.min(5, 1 + Math.floor(t.pop / 10))), 1);
    if (maxLv >= 3) era = Math.max(era, 1);
    if (maxLv >= 4) era = Math.max(era, 2);
    o.era = era;
  }
  if (o.dev === undefined) o.dev = 0;
  o.dev = Math.min(RP_BANK, o.dev || 0); // 옛 발전도 → 연구 점수 비축
  if (!Array.isArray(o.techs)) o.techs = techsBelowEra(o.era); // 옛 저장: 지금 시대보다 앞선 시대 기술은 모두 연구된 것으로
  if (o.research === undefined || (o.research && !TECH[o.research.id])) o.research = null;
  if (!o.army || typeof o.army !== 'object') o.army = {};
  if (!o.armyMode) o.armyMode = 'follow';
  if (o.foeLv === undefined) o.foeLv = o.era;
  if (o.year === undefined) o.year = 1 + Math.floor((o.time || 0) / YEAR_SEC);
  if (o.yearT === undefined) o.yearT = 0;
  if (!o.chron) o.chron = [];
  if (!o.eraLog) o.eraLog = [];
  if (!o.dynasty) o.dynasty = pickName(DYNASTY_NAMES);
  if (!o.ruler) {
    const S0 = S; S = o; // makeRuler 가 S 를 본다
    o.ruler = makeRuler(pickName(RULER_NAMES), 24, 1);
    o.ruler.st.towns = o.towns.length; o.ruler.st.wars = o.warsWon || 0;
    S = S0;
  }
}

$('chronBtn').addEventListener('click', openChronicle);
$('eraMenuBtn').addEventListener('click', () => { $('menuPanel').classList.remove('show'); openEraPanel(); });
$('goal').addEventListener('click', () => openTechPanel());
$('eraBtn').addEventListener('click', openEraPanel);
