'use strict';
// ===== 탐험(오픈월드) 모드 =====
const W = 128, H = 128;
const GOAL_TILES = 1200;
const SAVE_KEY = 'frontier-save-v1';
const WATER = 0, SAND = 1, FOREST = 2, GRASS = 3, MOUNTAIN = 4, GOLD = 5;
const DAY_LEN = 240;
const TOWN_NAMES = ['새벽골','솔내','한빛','바람재','달무리','푸른들','돌샘','별터','노을촌','은빛내','소나무골','들꽃마을','큰나루','해오름','가람','미르골'];
const TOWN_COLORS = ['#4fa3ff','#ffb347','#c77dff','#5be0b0','#ff6b9d','#f2e863','#7dd3fc','#fb923c','#a3e635','#f472b6'];
const BUILD = {
  house:  { name: '집',   icon: '🏠', cost: { wood: 12 },                  desc: '인구 한도 +5' },
  farm:   { name: '농장', icon: '🌾', cost: { wood: 10, stone: 4 },        desc: '인구 증가 속도 ↑' },
  tower:  { name: '망루', icon: '🗼', cost: { wood: 10, stone: 15 },       desc: '근처 산적에게 화살 발사' },
  market: { name: '시장', icon: '🏪', cost: { wood: 20, stone: 10, gold: 15 }, desc: '마을 금 수입 +3' },
  lumber: { name: '벌목소', icon: '🪓', cost: { wood: 15, stone: 5 },   desc: '근처(3칸) 영토 안 숲에서 나무를 자동 수확 · 숲이 점점 줄어요', place: '숲 가까이에 지어요' },
  quarry: { name: '채석장', icon: '⛏️', cost: { wood: 20 },              desc: '근처(2칸) 산에서 돌을 자동 채석 · 바닥나지 않음', place: '산 가까이에 지어요' },
  mine:   { name: '금광',   icon: '💰', cost: { wood: 20, stone: 15 },   desc: '근처(2칸) 금맥에서 금을 자동 채굴 · 금맥은 점점 줄어요', place: '금맥 가까이에 지어요' },
};
// 자원 생산 건물: 근처 타일 종류, 반경, 산출 자원, 1회 산출량, 분당 생산량 공식(n = 근처 자원 타일 수)
const RES_DEF = {
  lumber: { tile: FOREST,   r: 3, own: true, res: 'wood',  icon: '🪵', amt: 1, perMin: n => n ? 6 + 3 * Math.min(n, 6) : 0, thin: 3, none: '숲 없음' },
  quarry: { tile: MOUNTAIN, r: 2, own: false, res: 'stone', icon: '🪨', amt: 1, perMin: n => n ? 4 + 2 * Math.min(n, 4) : 0, thin: 0, none: '산 없음' },
  mine:   { tile: GOLD,     r: 2, own: false, res: 'gold',  icon: '🪙', amt: 2, perMin: n => 8 * Math.min(n, 3), thin: 1, none: '금맥 고갈' },
};
function resTiles(type, bx, by) {
  const d = RES_DEF[type], out = [], r = d.r;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + 1) continue;
    const x = bx + dx, y = by + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    if (S.tiles[i] !== d.tile || (d.own && owner[i] < 0)) continue;
    out.push(i);
  }
  return out;
}
function resRate(b) { const d = RES_DEF[b.type]; if (!d) return 0; return d.perMin(resTiles(b.type, b.x, b.y).length); }
function resStatus(townId) {
  const parts = [];
  for (const k in RES_DEF) {
    const bs = S.buildings.filter(b => b.town === townId && b.type === k); if (!bs.length) continue;
    const rate = bs.reduce((a, b) => a + resRate(b), 0);
    parts.push(`${BUILD[k].name} ${bs.length} · ${rate ? `분당 ${RES_DEF[k].icon}${rate}` : RES_DEF[k].none}`);
  }
  return parts.join('<br>');
}
const FACTIONS = [
  { name: '흑랑 군단', color: '#3a3a44', plume: '#111', boss: '흑랑장 도견' },
  { name: '붉은매 군단', color: '#9a2a22', plume: '#ffcc33', boss: '홍매장 사련' },
  { name: '철갑 도적단', color: '#5a5f6a', plume: '#c22', boss: '철벽 강오' },
  { name: '잿빛 늑대단', color: '#6b6355', plume: '#ddd', boss: '회랑 백린' },
];

let S;
let owner = new Int16Array(W * H).fill(-1);
let ownedCount = 0;
let waterDepth = new Uint8Array(W * H);
const bandits = [], arrows = [], villagers = [];
let minimapDirty = true;
const chopFx = new Map();

function makeNoise(r, cell) {
  const gw = Math.ceil(W / cell) + 2, g = new Float32Array(gw * gw);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, ix = fx | 0, iy = fy | 0, tx = s(fx - ix), ty = s(fy - iy);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}
function newWorld(seed) {
  const r = mulberry(seed);
  const n1 = makeNoise(r, 16), n2 = makeNoise(r, 7), n3 = makeNoise(r, 3), m1 = makeNoise(r, 12), m2 = makeNoise(r, 5);
  const tiles = new Uint8Array(W * H), hp = new Uint8Array(W * H);
  const hs = new Float32Array(W * H), ms = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
    const edge = Math.max(0, Math.sqrt(dx * dx + dy * dy) - 0.62) * 1.3;
    hs[y * W + x] = n1(x, y) * 0.6 + n2(x, y) * 0.3 + n3(x, y) * 0.1 - edge;
    ms[y * W + x] = m1(x, y) * 0.7 + m2(x, y) * 0.3;
  }
  const land = [], wet = [];
  for (let i = 0; i < W * H; i++) if (hs[i] >= 0.31) { land.push(hs[i]); wet.push(ms[i]); }
  land.sort((a, b) => a - b); wet.sort((a, b) => a - b);
  const mtnH = land[Math.floor(land.length * 0.91)] || 0.68, forM = wet[Math.floor(wet.length * 0.65)] || 0.54;
  for (let i = 0; i < W * H; i++) {
    const h = hs[i], m = ms[i];
    let t;
    if (h < 0.27) t = WATER; else if (h < 0.31) t = SAND;
    else if (h > mtnH) t = r() < 0.07 ? GOLD : MOUNTAIN;
    else if (m > forM) t = FOREST; else t = GRASS;
    tiles[i] = t;
    hp[i] = t === FOREST ? 4 : t === GOLD ? 12 : 0;
  }
  return { tiles, hp };
}
function computeDerived() {
  waterDepth.fill(0);
  let frontier = [];
  for (let i = 0; i < W * H; i++) if (S.tiles[i] === WATER) {
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = tileAt(x + dx, y + dy); if (t !== WATER) { waterDepth[i] = 1; frontier.push(i); break; } }
  }
  for (let d = 2; d <= 5; d++) {
    const next = [];
    for (const i of frontier) { const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (S.tiles[j] === WATER && !waterDepth[j]) { waterDepth[j] = d; next.push(j); } } }
    frontier = next;
  }
  for (let i = 0; i < W * H; i++) if (S.tiles[i] === WATER && !waterDepth[i]) waterDepth[i] = 6;
  chunkCache.clear();
}

function landTile(x, y) { const t = tileAt(x, y); return t === GRASS || t === SAND || t === FOREST; }
function neighborsLand(x, y) { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!landTile(x + i, y + j)) return false; return true; }
function tileAt(x, y) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= W || y >= H) return WATER; return S.tiles[y * W + x]; }
function setTile(i, t) {
  S.tiles[i] = t; minimapDirty = true;
  const x = i % W, y = (i / W) | 0;
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) chunkCache.delete(chunkKey(Math.floor((x + dx) / CH), Math.floor((y + dy) / CH)));
  if (typeof w3dNotify === 'function') w3dNotify('tile', i); // 3D 지형 갱신 알림
}
function passable(px, py) { const t = tileAt(px / T, py / T); return t !== WATER && t !== MOUNTAIN && t !== GOLD; }
function canStand(px, py, r) { return passable(px - r, py - r) && passable(px + r, py - r) && passable(px - r, py + r) && passable(px + r, py + r); }
function moveEnt(e, dx, dy, r) {
  let moved = false;
  if (canStand(e.x + dx, e.y, r)) { e.x += dx; moved = true; }
  if (canStand(e.x, e.y + dy, r)) { e.y += dy; moved = true; }
  return moved;
}

function newGame() {
  const seed = (Date.now() & 0xffffff) ^ 0x5eed;
  const { tiles, hp } = newWorld(seed);
  S = { seed, tiles, hp, wood: 0, stone: 0, gold: 0, towns: [], buildings: [], camps: [], horses: [], won: false, time: 0,
        player: { x: 0, y: 0, hp: 10, mounted: false, dir: 0 }, spawnT: 0,
        hero: { lv: 1, exp: 0 }, war: null, warT: 0, nextWar: 80, warsWon: 0 };
  let best = null;
  for (let k = 0; k < 4000; k++) {
    const x = W / 2 + ri(40) - 20, y = H / 2 + ri(40) - 20;
    if (tileAt(x, y) === GRASS && neighborsLand(x, y)) { best = { x, y }; break; }
  }
  if (!best) best = { x: W / 2, y: H / 2 };
  S.player.x = (best.x + .5) * T; S.player.y = (best.y + .5) * T;
  for (let k = 0; k < 400 && S.horses.length < 14; k++) {
    const x = ri(W), y = ri(H);
    if (tileAt(x, y) === GRASS && dist2(x, y, best.x, best.y) > 16) S.horses.push(newHorse(x, y));
  }
  for (let k = 0; k < 200; k++) {
    const x = best.x + ri(9) - 4, y = best.y + ri(9) - 4;
    if (tileAt(x, y) === GRASS && (x !== best.x || y !== best.y)) { S.horses.push(newHorse(x, y)); break; }
  }
  computeDerived();
  for (let k = 0; k < 6; k++) spawnCamp(best.x, best.y, 26);
  bandits.length = 0; arrows.length = 0; floats.length = 0; villagers.length = 0;
  recomputeOwner();
  toast('마을을 세울 곳을 찾아 <b>건설</b>을 누르세요. 첫 마을은 무료!', 5);
}
const HORSE_COLS = ['#8b5a2b', '#5a3a22', '#c9a27a', '#3a2a22', '#e8e0d0'];
function newHorse(x, y) { return { x: (x + .5) * T, y: (y + .5) * T, vx: 0, vy: 0, t: 0, ridden: false, col: HORSE_COLS[ri(HORSE_COLS.length)], walk: 0 }; }

function spawnCamp(avoidX, avoidY, minD) {
  for (let k = 0; k < 3000; k++) {
    const x = 4 + ri(W - 8), y = 4 + ri(H - 8);
    if (!neighborsLand(x, y)) continue;
    if (dist2(x, y, avoidX, avoidY) < minD * minD) continue;
    if (owner[y * W + x] >= 0) continue;
    let ok = true;
    for (const t of S.towns) if (dist2(x, y, t.x, t.y) < 18 * 18) ok = false;
    for (const c of S.camps) if (dist2(x, y, c.x, c.y) < 14 * 14) ok = false;
    if (!ok) continue;
    S.camps.push({ x, y, hp: 15, maxHp: 15, t: ri(10) });
    return true;
  }
  return false;
}

// ---------- 마을/영토 ----------
function townLevel(t) { return Math.min(5, 1 + Math.floor(t.pop / 10)); }
function townRadius(t) { return 3 + townLevel(t); }
function townCap(t) { return 6 + 5 * S.buildings.filter(b => b.town === t.id && b.type === 'house').length; }
function townIncome(t) { return Math.ceil(t.pop / 3) + 3 * S.buildings.filter(b => b.town === t.id && b.type === 'market').length; }
function recomputeOwner() {
  owner.fill(-1); ownedCount = 0;
  for (const t of S.towns) {
    const r = townRadius(t);
    for (let y = t.y - r; y <= t.y + r; y++) for (let x = t.x - r; x <= t.x + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (dist2(x, y, t.x, t.y) > r * r + r) continue;
      const i = y * W + x;
      if (owner[i] >= 0 || S.tiles[i] === WATER) continue;
      owner[i] = t.id; ownedCount++;
    }
  }
  minimapDirty = true;
  if (typeof w3dNotify === 'function') w3dNotify('owner'); // 3D 영토 갱신 알림
}
function townById(id) { return S.towns.find(t => t.id === id); }
function playerTile() { return { x: Math.floor(S.player.x / T), y: Math.floor(S.player.y / T) }; }
function newTownCost() { const n = S.towns.length; if (n === 0) return {}; return { wood: 15 + n * 10, stone: 8 + n * 6, gold: 10 + n * 15 }; }
function canAfford(c) { return (S.wood >= (c.wood || 0)) && (S.stone >= (c.stone || 0)) && (S.gold >= (c.gold || 0)); }
function pay(c) { S.wood -= c.wood || 0; S.stone -= c.stone || 0; S.gold -= c.gold || 0; }
function costText(c) { const p = []; if (c.wood) p.push('🪵' + c.wood); if (c.stone) p.push('🪨' + c.stone); if (c.gold) p.push('🪙' + c.gold); return p.length ? p.join(' ') : '무료'; }

function foundTownCheck() {
  const { x, y } = playerTile();
  if (owner[y * W + x] >= 0) return '이미 영토 안입니다';
  if (!landTile(x, y)) return '땅 위에 세워야 해요';
  for (const t of S.towns) if (dist2(x, y, t.x, t.y) < 10 * 10) return '다른 마을과 너무 가까워요';
  for (const c of S.camps) if (dist2(x, y, c.x, c.y) < 7 * 7) return '산적 소굴이 너무 가까워요';
  return null;
}
function foundTown() {
  toastT = 0; $('toast').classList.remove('show'); // 튜토리얼 토스트 즉시 숨김
  const { x, y } = playerTile();
  const id = S.towns.length ? Math.max(...S.towns.map(t => t.id)) + 1 : 0;
  const t = { id, x, y, pop: 2, name: TOWN_NAMES[id % TOWN_NAMES.length], growT: 0, taxT: 0 };
  S.towns.push(t);
  setTile(y * W + x, GRASS);
  recomputeOwner();
  emit((x + .5) * T, (y + .5) * T, 30, { color: ['#fff', '#ffd54a', TOWN_COLORS[id % TOWN_COLORS.length]], smin: 40, smax: 140, up: 40, lmin: .5, lmax: 1.1, grav: 120 });
  banner(`${t.name} 건설`, '마을이 스스로 자라며 영토를 넓힙니다', 2.2);
  save();
}
function buildCheck(type) {
  const { x, y } = playerTile(), i = y * W + x;
  const tid = owner[i];
  if (tid < 0) return '영토 안에서만 지을 수 있어요';
  const t = townById(tid);
  if (Math.abs(t.x - x) <= 1 && Math.abs(t.y - y) <= 1) return '마을 중심 바로 옆에는 지을 수 없어요';
  if (S.buildings.some(b => b.x === x && b.y === y)) return '이미 건물이 있어요';
  const tt = S.tiles[i];
  if (tt !== GRASS && tt !== SAND) return '풀밭이나 모래 위에 지어요 (숲은 먼저 베기)';
  if (RES_DEF[type] && !resTiles(type, x, y).length) return type === 'lumber' ? '근처 3칸 안에 영토 안의 숲이 필요해요' : type === 'quarry' ? '근처 2칸 안에 산이 필요해요' : '근처 2칸 안에 금맥이 필요해요';
  return null;
}
function build(type) {
  const { x, y } = playerTile();
  S.buildings.push({ type, x, y, town: owner[y * W + x], t: 0, pt: 0, cnt: 0 });
  pay(BUILD[type].cost);
  emit((x + .5) * T, (y + .8) * T, 18, { color: ['#d8c8a0', '#b8a880'], smin: 20, smax: 70, lmin: .4, lmax: .8, zmin: 3, zmax: 6, kind: 'smoke', grow: 6 });
  toast(`${BUILD[type].icon} ${BUILD[type].name} 완성`, 2);
  save();
}

// ---------- 영웅 ----------
function heroMaxHp() { return 10 + (S.hero.lv - 1) * 2; }
function heroDmg() { return 1 + Math.floor((S.hero.lv - 1) / 2); }
function expNeed(lv) { return 60 + lv * 40; }
function gainExp(n) {
  S.hero.exp += n; let up = false;
  while (S.hero.exp >= expNeed(S.hero.lv)) { S.hero.exp -= expNeed(S.hero.lv); S.hero.lv++; up = true; }
  if (up) { S.player.hp = heroMaxHp(); toast(`⭐ 영주 레벨 ${S.hero.lv}! 체력과 공격력이 올랐습니다`, 3); }
}

// ---------- 행동 ----------
let swing = 0, actHeld = false, actCd = 0;
function nearestHarvest() {
  const p = S.player, px = p.x / T, py = p.y / T;
  let best = null, bd = 1.7 * 1.7;
  for (let y = Math.floor(py) - 2; y <= Math.floor(py) + 2; y++) for (let x = Math.floor(px) - 2; x <= Math.floor(px) + 2; x++) {
    const t = tileAt(x, y);
    if (t !== FOREST && t !== MOUNTAIN && t !== GOLD) continue;
    const d = dist2(px, py, x + .5, y + .5);
    if (d < bd) { bd = d; best = { x, y, t }; }
  }
  return best;
}
function nearest(list, x, y, maxD, fn) {
  let best = null, bd = maxD * maxD;
  for (const e of list) { if (fn && !fn(e)) continue; const d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  return best;
}
function campPos(c) { return { x: (c.x + .5) * T, y: (c.y + .5) * T }; }
function nearestCamp(maxPx) {
  const p = S.player; let best = null, bd = maxPx * maxPx;
  for (const c of S.camps) { const q = campPos(c), d = dist2(p.x, p.y, q.x, q.y); if (d < bd) { bd = d; best = c; } }
  return best;
}
function contextAction() {
  const p = S.player;
  const b = nearest(bandits, p.x, p.y, 52);
  if (b) return { kind: 'attack', target: b, label: '공격' };
  const c = nearestCamp(64);
  if (c) return { kind: 'camp', target: c, label: '소굴 공격' };
  if (!p.mounted) { const h = nearest(S.horses, p.x, p.y, 40, h => !h.ridden); if (h) return { kind: 'mount', target: h, label: '말 타기' }; }
  const hv = nearestHarvest();
  if (hv) return { kind: 'harvest', target: hv, label: hv.t === FOREST ? '나무 베기' : hv.t === GOLD ? '금 캐기' : '돌 캐기' };
  return null;
}
function doAction() { performAction(contextAction()); }
function performAction(a) {
  swing = 0.2;
  if (!a) return;
  const p = S.player;
  if (a.kind === 'attack') {
    const b = a.target; b.hp -= heroDmg(); b.hit = 0.15;
    const ang = Math.atan2(b.y - p.y, b.x - p.x); b.kx = Math.cos(ang) * 160; b.ky = Math.sin(ang) * 160; p.dir = ang;
    emit(b.x, b.y - 14, 8, { color: ['#fff', '#ffd54a'], kind: 'spark', smin: 80, smax: 200, lmin: .15, lmax: .3, zmin: 2, zmax: 3, ang, spread: 0.9 });
    shake(3);
    if (b.hp <= 0) killBandit(b);
  } else if (a.kind === 'camp') {
    const c = a.target; c.hp -= heroDmg(); c.hit = 0.15;
    const q = campPos(c); p.dir = Math.atan2(q.y - p.y, q.x - p.x);
    emit(q.x, q.y - 10, 6, { color: ['#8e2b23', '#d9b36a'], smin: 40, smax: 120, lmin: .3, lmax: .6, grav: 300, up: 60 });
    shake(2);
    if (c.hp <= 0) {
      S.camps.splice(S.camps.indexOf(c), 1);
      S.gold += 40; S.wood += 10; S.stone += 5; gainExp(30);
      floatText(q.x, q.y - 20, '+40🪙 +10🪵 +5🪨', '#ffe27a', 15);
      emit(q.x, q.y, 40, { color: ['#ff8a2a', '#ffd54a', '#555'], smin: 60, smax: 220, lmin: .4, lmax: 1, grav: 200, up: 80 });
      shake(8);
      banner('소굴 격파!', '+40🪙 · 경험치 +30', 1.8); minimapDirty = true; save();
    }
  } else if (a.kind === 'mount') {
    const h = a.target; h.ridden = true; p.mounted = true; p.x = h.x; p.y = h.y;
    $('rideBtn').style.display = 'flex';
  } else if (a.kind === 'harvest') {
    const { x, y, t } = a.target, i = y * W + x, cx = (x + .5) * T, cy = (y + .5) * T;
    p.dir = Math.atan2(cy - p.y, cx - p.x);
    chopFx.set(i, 0.25);
    if (t === FOREST) {
      S.wood++; floatText(cx, y * T, '+1🪵', '#c9f29b');
      emit(cx, cy - 8, 6, { color: ['#c8a060', '#8a6030', '#5aa040'], smin: 40, smax: 120, lmin: .3, lmax: .6, grav: 300, up: 50, zmin: 1.5, zmax: 2.5 });
      if (--S.hp[i] <= 0) { setTile(i, GRASS); emit(cx, cy, 14, { color: ['#3b8a35', '#5aa040'], smin: 30, smax: 100, lmin: .4, lmax: .9, grav: 150, up: 40 }); }
    } else if (t === GOLD) {
      S.gold += 2; floatText(cx, y * T, '+2🪙', '#ffe27a');
      emit(cx, cy - 6, 7, { color: ['#ffd34d', '#fff6c0'], kind: 'spark', smin: 60, smax: 160, lmin: .2, lmax: .4 });
      if (--S.hp[i] <= 0) setTile(i, MOUNTAIN);
    } else {
      S.stone++; floatText(cx, y * T, '+1🪨', '#ddd');
      emit(cx, cy - 6, 6, { color: ['#aaa', '#777', '#ddd'], smin: 40, smax: 130, lmin: .3, lmax: .6, grav: 350, up: 60, zmin: 1.5, zmax: 2.5 });
    }
  }
}
function dismount() {
  const p = S.player; if (!p.mounted) return;
  const h = S.horses.find(h => h.ridden); if (h) { h.ridden = false; h.x = p.x + 10; h.y = p.y; h.t = 2; }
  p.mounted = false; $('rideBtn').style.display = 'none';
}
function killBandit(b) {
  const i = bandits.indexOf(b); if (i >= 0) bandits.splice(i, 1);
  const loot = 4 + (b.loot || 0);
  S.gold += loot; floatText(b.x, b.y - 20, `+${loot}🪙`, '#ffe27a'); gainExp(5);
  if (b.war && S.war && !bandits.some(x => x.war)) fieldWarWin();
  emit(b.x, b.y - 10, 14, { color: ['#a52a2a', '#fff', '#ffd54a'], smin: 50, smax: 160, lmin: .3, lmax: .6, grav: 200 });
}

// ---------- 전쟁 미션 ----------
function startWarEvent() {
  if (!S.towns.length) return;
  const town = S.towns.reduce((a, t) => t.pop > a.pop ? t : a);
  const f = ri(FACTIONS.length);
  const diff = 1 + S.warsWon * 0.35 + S.towns.length * 0.1;
  S.war = { town: town.id, diff, faction: f, field: false };
  askWar();
}
// 전쟁이 나면 "대규모 전투로 전환?"을 묻는다. 네 → 전장 액션, 아니오 → 지금 화면에서 적 군단 방어
function askWar() {
  if (!S.war) return;
  paused = true; actHeld = false; auto = null;
  const w = S.war, f = FACTIONS[w.faction], t = townById(w.town);
  $('warPanel').innerHTML = `<h2>⚔️ ${f.name} 침공!</h2>
    <div class="sub">${f.name}이(가) <b>${t ? t.name : '마을'}</b>(으)로 진군하고 있습니다. 적 위협도 ${'★'.repeat(Math.min(5, Math.max(1, Math.round(w.diff))))}</div>
    <div style="font-size:17px;font-weight:800;margin:4px 0 12px;text-align:center">대규모 전투로 전환하시겠습니까?</div>
    <button class="opt primary" data-a="go"><span class="ic">⚔️</span><span>네<small>전장으로 이동해 아군 ${allyCount()}명과 함께 수많은 적을 직접 쓸어버립니다. 적장을 쓰러뜨리면 승리</small></span></button>
    <button class="opt" data-a="field"><span class="ic">🛡️</span><span>아니오<small>지금 화면에서 마을로 다가오는 적 군단(${warbandSize(w)}명)을 직접·망루로 막아냅니다</small></span></button>`;
  $('warPanel').classList.add('show');
}
$('warPanel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !S.war) return;
  $('warPanel').classList.remove('show'); paused = false;
  if (b.dataset.a === 'go') { dismount(); startBattle(S.war); }
  else if (b.dataset.a === 'field') { S.war.field = true; spawnWarband(); banner('적 군단 접근!', '마을로 향하는 적을 막아내세요', 2.5); save(); }
});
$('warBtn').addEventListener('click', () => {
  if (!S.war || !S.war.field) return;
  const p = S.player, e = nearest(bandits, p.x, p.y, 1e6, b => b.war);
  if (!e) return;
  const a = Math.atan2(e.y - p.y, e.x - p.x), dirs = ['동', '남동', '남', '남서', '서', '북서', '북', '북동'];
  toast(`가장 가까운 적은 <b>${dirs[(Math.round(a / (Math.PI / 4)) + 8) % 8]}쪽</b> ${Math.round(Math.hypot(e.x - p.x, e.y - p.y) / T)}칸 거리`, 2.5);
});
function warbandSize(w) { return Math.round(6 + w.diff * 3) + 1; }
function spawnWarband() {
  const w = S.war, t = townById(w.town); if (!t) { S.war = null; return; }
  let sx = null, sy = null;
  for (let k = 0; k < 3000 && sx === null; k++) {
    const a = rand() * Math.PI * 2, d = rr(16, 26), x = Math.round(t.x + Math.cos(a) * d), y = Math.round(t.y + Math.sin(a) * d);
    if (neighborsLand(x, y) && owner[y * W + x] < 0) { sx = x; sy = y; }
  }
  if (sx === null) { sx = t.x + townRadius(t) + 2; sy = t.y; }
  const n = warbandSize(w) - 1, hp = 3 + Math.round(w.diff);
  const mk = cmd => ({ war: true, cmd, x: (sx + .5) * T + rr(-40, 40), y: (sy + .5) * T + rr(-40, 40), hp: cmd ? Math.round(14 * w.diff) : hp, maxHp: cmd ? Math.round(14 * w.diff) : hp,
    t: 0, vx: 0, vy: 0, atk: rr(0, 1), walk: rand() * 6, loot: 0, raidT: 0, prog: 0, bestD: 1e9 });
  for (let i = 0; i < n; i++) bandits.push(mk(false));
  bandits.push(mk(true));
}
function warUnitAI(b, dt) {
  const p = S.player, t = S.war && townById(S.war.town);
  const dp = Math.hypot(p.x - b.x, p.y - b.y);
  let tx, ty;
  const chase = dp < T * 7;
  if (chase) { tx = p.x; ty = p.y; } else if (t) { tx = (t.x + .5) * T; ty = (t.y + 1.3) * T; } else return;
  const d = Math.hypot(tx - b.x, ty - b.y), ox = b.x;
  if (d > 20) {
    const sp = (b.cmd ? 78 : 90) * dt;
    if (!moveEnt(b, (tx - b.x) / d * sp, (ty - b.y) / d * sp, 8)) { const a = rand() * Math.PI * 2; moveEnt(b, Math.cos(a) * sp * 2, Math.sin(a) * sp * 2, 8); }
    if (d < b.bestD - 4) { b.bestD = d; b.prog = 0; } else b.prog += dt;
    if (b.prog > 3) { // 물·산에 막히면 목표 쪽 땅으로 건너뛴다
      for (let k = 1; k <= 6; k++) { const nx = b.x + (tx - b.x) / d * T * k, ny = b.y + (ty - b.y) / d * T * k; if (canStand(nx, ny, 8)) { b.x = nx; b.y = ny; break; } }
      b.prog = 0; b.bestD = 1e9;
    }
  } else if (!chase && t) {
    b.raidT -= dt;
    if (b.raidT <= 0) {
      b.raidT = 3; b.swing = 0.25;
      const steal = Math.min(S.gold, 5), lv = townLevel(t);
      S.gold -= steal; if (t.pop > 1) t.pop--;
      floatText(tx, ty - 40, `👥-1${steal ? ' 🪙-' + steal : ''}`, '#ff7a7a');
      if (townLevel(t) !== lv) recomputeOwner();
      if (!b.warned) { b.warned = true; toast(`🏴 적 군단이 ${t.name}에 침입했습니다!`, 2.5); }
    }
  }
  b.walk += dt * 9; if (Math.abs(b.x - ox) > 0.1) b.face = b.x > ox ? 1 : -1;
  if (dp < 26 && b.atk <= 0) {
    b.atk = 1; b.swing = 0.25;
    if (!(p.mounted && rand() < 0.3)) { p.hp -= b.cmd ? 2 : 1; p.hurt = 0.25; shake(4); if (p.hp <= 0) playerDie(); }
  }
  b.swing = Math.max(0, (b.swing || 0) - dt);
}
function fieldWarWin() {
  const w = S.war, t = w && townById(w.town);
  const gold = 30 + Math.round(w.diff * 20);
  S.gold += gold; S.warsWon++; gainExp(40);
  S.war = null; S.warT = 0; S.nextWar = 150 + ri(80);
  banner('방어 성공!', `${FACTIONS[w.faction].name} 격퇴 · 🪙+${gold} · 경험치 +40`, 3);
  save();
}
function allyCount() { return Math.min(24, 4 + Math.floor(S.towns.reduce((a, t) => a + t.pop, 0) / 4)); }
function onBattleEnd(win, st) {
  const w = S.war; const t = w && townById(w.town);
  S.war = null; S.warT = 0; S.nextWar = 150 + ri(80);
  if (win) {
    const gold = 40 + st.kos + Math.round(w.diff * 30);
    S.gold += gold; S.warsWon++;
    if (t) t.pop = Math.min(townCap(t) + 5, t.pop + 4);
    gainExp(st.exp);
    toast(`🏆 승리! 🪙+${gold}${t ? ` · ${t.name} 인구 +4` : ''}`, 3.5);
  } else {
    if (t) { t.pop = Math.max(1, Math.floor(t.pop / 2)); }
    const lost = Math.floor(S.gold * 0.25); S.gold -= lost;
    gainExp(Math.floor(st.exp / 2));
    toast(`패배… ${t ? t.name + ' 인구 절반 손실, ' : ''}🪙-${lost}`, 3.5);
  }
  S.player.hp = heroMaxHp();
  recomputeOwner(); save();
}

// ---------- 패널 ----------
const bp = $('buildPanel');
function openBuild() {
  if (!S || MODE !== 'world') return;
  paused = true; actHeld = false; auto = null;
  const { x, y } = playerTile();
  const tid = owner[y * W + x];
  let html = '';
  if (tid < 0) {
    const err = foundTownCheck(), cost = newTownCost(), ok = !err && canAfford(cost);
    html += `<h2>마을 세우기</h2><div class="sub">지금 서 있는 자리에 새 마을을 세웁니다. 마을은 스스로 자라며 금을 벌고 영토를 넓힙니다.</div>`;
    html += `<button class="opt" data-a="town" ${ok ? '' : 'disabled'}><span class="ic">🏘️</span><span>새 마을 (${S.towns.length + 1}번째)<small>${costText(cost)}${err ? ' · ' + err : !canAfford(cost) ? ' · 자원 부족' : ''}</small></span></button>`;
  } else {
    const t = townById(tid), cap = townCap(t);
    const cnt = k => S.buildings.filter(b => b.town === t.id && b.type === k).length;
    html += `<h2>${t.name} <span style="font-size:13px;color:#b8c2b0">Lv${townLevel(t)}</span></h2>`;
    html += `<div class="sub">인구 ${t.pop}/${cap} · 영토 반경 ${townRadius(t)} · 수입 ${townIncome(t)}🪙/5초<br>집 ${cnt('house')} · 농장 ${cnt('farm')} · 망루 ${cnt('tower')} · 시장 ${cnt('market')}${resStatus(t.id) ? '<br>' + resStatus(t.id) : ''}<br>인구가 10 늘 때마다 레벨업 → 영토 확장</div>`;
    for (const k in BUILD) {
      const B = BUILD[k], err = buildCheck(k), ok = !err && canAfford(B.cost);
      html += `<button class="opt" data-a="${k}" ${ok ? '' : 'disabled'}><span class="ic">${B.icon}</span><span>${B.name} — ${B.desc}<small>${costText(B.cost)}${err ? ' · ' + err : !canAfford(B.cost) ? ' · 자원 부족' : B.place ? ' · ' + B.place : ''}</small></span></button>`;
    }
  }
  html += `<button class="close" data-a="close">닫기</button>`;
  bp.innerHTML = html; bp.classList.add('show');
}
function closePanels() { bp.classList.remove('show'); $('menuPanel').classList.remove('show'); paused = false; }
bp.addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn || btn.disabled) return;
  const a = btn.dataset.a;
  if (a === 'town') { pay(newTownCost()); foundTown(); }
  else if (BUILD[a]) build(a);
  closePanels();
});
$('menuBtn').addEventListener('click', () => { paused = true; auto = null; $('goalHelp').innerHTML = `<b>목표</b> 영토 ${GOAL_TILES}칸 차지하기 (지금 ${ownedCount}칸) · 전쟁 승리 ${S.warsWon}회`; $('menuPanel').classList.add('show'); });
$('menuClose').addEventListener('click', closePanels);
$('newGameBtn').addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} newGame(); closePanels(); });
$('minimap').addEventListener('click', () => $('minimap').classList.toggle('big'));
holdBtn($('actBtn'), () => { actHeld = true; if (!paused && actCd <= 0) { doAction(); actCd = 0.32; } }, () => { actHeld = false; });
holdBtn($('buildBtn'), () => openBuild());
holdBtn($('rideBtn'), () => dismount());
keyHooks.push((k, down) => {
  if (MODE !== 'world') return;
  if (k === ' ' || k === 'j') { actHeld = down; if (down && !paused && actCd <= 0) { doAction(); actCd = 0.32; } }
  if (down && k === 'b') openBuild();
});

// ---------- 업데이트 ----------
function updateWorld(dt) {
  S.time += dt;
  const p = S.player;
  let mv = moveInput();
  if (auto) { if (mv.l > 0.08 || joy.active) auto = null; else mv = autoStep(dt) || mv; }
  p.moving = mv.l > 0.08;
  if (p.moving) {
    const onForest = tileAt(p.x / T, p.y / T) === FOREST;
    const sp = (p.mounted ? 250 : 130) * (onForest ? 0.7 : 1) * Math.max(0.4, mv.l);
    moveEnt(p, mv.x * sp * dt, mv.y * sp * dt, 9);
    p.dir = Math.atan2(mv.y, mv.x); p.walk = (p.walk || 0) + dt * sp / 9;
    p.dustT = (p.dustT || 0) - dt;
    if (p.dustT <= 0) { p.dustT = p.mounted ? 0.06 : 0.14; emit(p.x - mv.x * 6, p.y + 2, 1, { color: tileAt(p.x / T, p.y / T) === SAND ? '#e8d8a8' : '#c8c0a0', kind: 'smoke', smin: 5, smax: 20, lmin: .3, lmax: .6, zmin: 2, zmax: 4, grow: 8 }); }
  }
  if (p.mounted) { const h = S.horses.find(h => h.ridden); if (h) { h.x = p.x; h.y = p.y; } }
  actCd -= dt; swing = Math.max(0, swing - dt);
  updateProducers(dt);
  if (actHeld && actCd <= 0) { doAction(); actCd = 0.32; }
  const pt = playerTile(), inOwn = owner[pt.y * W + pt.x] >= 0;
  p.regen = (p.regen || 0) + dt;
  if (p.regen > 1.5) { p.regen = 0; if (inOwn && p.hp < heroMaxHp()) p.hp++; }
  p.hurt = Math.max(0, (p.hurt || 0) - dt);
  for (const [k, v] of chopFx) { if (v - dt <= 0) chopFx.delete(k); else chopFx.set(k, v - dt); }

  // 마을
  let changed = false;
  for (const t of S.towns) {
    const cap = townCap(t), farms = S.buildings.filter(b => b.town === t.id && b.type === 'farm').length;
    t.growT += dt;
    if (t.growT > 4 / (1 + 0.6 * farms)) { t.growT = 0; if (t.pop < cap) { const lv = townLevel(t); t.pop++; if (townLevel(t) !== lv) { changed = true; banner(`${t.name} Lv${townLevel(t)}`, '영토가 넓어졌습니다', 2); } } }
    t.taxT += dt;
    if (t.taxT > 5) { t.taxT = 0; const g = townIncome(t); S.gold += g; floatText((t.x + .5) * T, t.y * T - 30, `+${g}🪙`, '#ffe27a'); }
    // 마을 사람
    const want = Math.min(5, Math.ceil(t.pop / 6));
    const have = villagers.filter(v => v.town === t.id).length;
    if (have < want) villagers.push({ town: t.id, x: (t.x + .5) * T + rr(-20, 20), y: (t.y + 1.5) * T, tx: 0, ty: 0, t: 0, walk: 0, body: ['#7a9a4a', '#a0603a', '#4a7aa0', '#b08a4a', '#8a5a9a'][ri(5)] });
  }
  if (changed) recomputeOwner();
  for (let i = villagers.length - 1; i >= 0; i--) {
    const v = villagers[i];
    if (v.job) { if (!workerStep(v, dt)) villagers.splice(i, 1); continue; }
    const t = townById(v.town);
    if (!t) { villagers.splice(i, 1); continue; }
    v.t -= dt;
    if (v.t <= 0) { v.t = rr(2, 5); const r = townRadius(t) - 1; v.tx = (t.x + .5 + rr(-r, r)) * T; v.ty = (t.y + .5 + rr(-r, r)) * T; }
    const d = Math.hypot(v.tx - v.x, v.ty - v.y);
    if (d > 4) { const sp = 30 * dt; if (moveEnt(v, (v.tx - v.x) / d * sp, (v.ty - v.y) / d * sp, 5)) { v.walk += dt * 8; v.face = v.tx > v.x ? 1 : -1; } else v.t = 0; }
  }

  for (const h of S.horses) {
    if (h.ridden) continue;
    h.t -= dt;
    if (h.t <= 0) { h.t = 2 + rand() * 3; const a = rand() * Math.PI * 2, s = rand() < 0.4 ? 0 : 25; h.vx = Math.cos(a) * s; h.vy = Math.sin(a) * s; }
    if (!moveEnt(h, h.vx * dt, h.vy * dt, 8)) h.t = 0;
    if (h.vx || h.vy) h.walk += dt * 6;
  }

  // 산적
  for (const c of S.camps) {
    c.t += dt; c.hit = Math.max(0, (c.hit || 0) - dt);
    const alive = bandits.filter(b => b.camp === c).length;
    const interval = Math.max(9, 22 - S.towns.length * 2);
    if (c.t > interval && alive < 3) { c.t = 0; const q = campPos(c); bandits.push({ x: q.x, y: q.y + 20, hp: 3, camp: c, t: 0, vx: 0, vy: 0, atk: 0, loot: 0, walk: 0 }); }
  }
  S.spawnT += dt;
  if (S.spawnT > 70 && S.camps.length < 4 + S.towns.length) { S.spawnT = 0; const pt2 = playerTile(); if (spawnCamp(pt2.x, pt2.y, 22)) toast('⚠️ 어딘가에 새 산적 소굴이 생겼습니다', 2.5); }
  for (const b of bandits.slice()) {
    b.hit = Math.max(0, (b.hit || 0) - dt); b.atk -= dt;
    if (b.kx) { moveEnt(b, b.kx * dt, b.ky * dt, 8); b.kx *= 0.85; b.ky *= 0.85; if (Math.abs(b.kx) < 5) b.kx = b.ky = 0; }
    if (b.war) { warUnitAI(b, dt); continue; }
    const dp = Math.sqrt(dist2(b.x, b.y, p.x, p.y));
    let tx = null, ty = null, sp = 85;
    if (dp < T * 6) { tx = p.x; ty = p.y; sp = 100; }
    else if (b.raided) { if (b.camp && S.camps.includes(b.camp)) { const q = campPos(b.camp); tx = q.x; ty = q.y; if (dist2(b.x, b.y, q.x, q.y) < 30 * 30) { b.raided = false; b.loot = 0; } } }
    else {
      const town = S.towns.length ? S.towns.reduce((a, t) => dist2(b.x, b.y, (t.x + .5) * T, (t.y + .5) * T) < dist2(b.x, b.y, (a.x + .5) * T, (a.y + .5) * T) ? t : a) : null;
      if (town && dist2(b.x, b.y, (town.x + .5) * T, (town.y + .5) * T) < (T * 40) ** 2) {
        tx = (town.x + .5) * T; ty = (town.y + .5) * T;
        if (dist2(b.x, b.y, tx, ty) < 26 * 26) {
          const steal = Math.min(S.gold, 8 + ri(8)); S.gold -= steal; b.loot += steal; b.raided = true;
          const lost = Math.min(2, town.pop - 1); town.pop -= lost;
          toast(`🏴 산적이 ${town.name}을 습격! 🪙-${steal} 👥-${lost}`, 2.5);
          floatText(tx, ty - 30, `-${steal}🪙`, '#ff7a7a');
          recomputeOwner();
        }
      }
    }
    const ox = b.x;
    if (tx === null) { b.t -= dt; if (b.t <= 0) { b.t = 2 + rand() * 2; const a = rand() * Math.PI * 2; b.vx = Math.cos(a) * 40; b.vy = Math.sin(a) * 40; } if (!moveEnt(b, b.vx * dt, b.vy * dt, 8)) b.t = 0; }
    else {
      const d = Math.hypot(tx - b.x, ty - b.y);
      if (d > 18) { const vx = (tx - b.x) / d * sp * dt, vy = (ty - b.y) / d * sp * dt; if (!moveEnt(b, vx, vy, 8)) { const a = rand() * Math.PI * 2; moveEnt(b, Math.cos(a) * sp * dt * 2, Math.sin(a) * sp * dt * 2, 8); } }
    }
    b.walk += dt * 9; if (Math.abs(b.x - ox) > 0.1) b.face = b.x > ox ? 1 : -1;
    if (dp < 24 && b.atk <= 0) {
      b.atk = 1; b.swing = 0.25;
      if (!(p.mounted && rand() < 0.3)) { p.hp--; p.hurt = 0.25; shake(4); if (p.hp <= 0) playerDie(); }
    }
    b.swing = Math.max(0, (b.swing || 0) - dt);
  }
  // 망루
  for (const bd of S.buildings) {
    if (bd.type !== 'tower') continue;
    bd.t -= dt; if (bd.t > 0) continue;
    const cx = (bd.x + .5) * T, cy = (bd.y + .5) * T;
    const b = nearest(bandits, cx, cy, T * 5.5);
    if (b) { bd.t = 1.1; arrows.push({ x: cx, y: cy - 40, tgt: b, sp: 420 }); }
  }
  for (const a of arrows.slice()) {
    if (!bandits.includes(a.tgt)) { arrows.splice(arrows.indexOf(a), 1); continue; }
    const d = Math.hypot(a.tgt.x - a.x, a.tgt.y - 12 - a.y);
    if (d < 10) { a.tgt.hp--; a.tgt.hit = 0.15; if (a.tgt.hp <= 0) killBandit(a.tgt); arrows.splice(arrows.indexOf(a), 1); continue; }
    a.ang = Math.atan2(a.tgt.y - 12 - a.y, a.tgt.x - a.x);
    a.x += Math.cos(a.ang) * a.sp * dt; a.y += Math.sin(a.ang) * a.sp * dt;
  }
  // 굴뚝 연기 / 모닥불
  if (rand() < dt * 3) { const h = S.buildings.filter(b => b.type === 'house'); if (h.length) { const b = h[ri(h.length)]; emit((b.x + .5) * T + 9, b.y * T + 2, 1, { color: '#ccc', kind: 'smoke', smin: 5, smax: 15, up: 20, lmin: 1, lmax: 2, zmin: 2, zmax: 3, grow: 4, drag: 0.5 }); } }

  // 전쟁
  if (S.towns.length) {
    if (S.war) { if (S.war.field && !bandits.some(b => b.war)) spawnWarband(); }
    else { S.warT += dt; if (S.warT > S.nextWar) startWarEvent(); }
  }

  if (!S.won && ownedCount >= GOAL_TILES) { S.won = true; banner('👑 개척왕', `영토 ${GOAL_TILES}칸 달성! 계속 플레이할 수 있어요`, 5); save(); }
}
function playerDie() {
  const p = S.player;
  dismount();
  S.wood = Math.floor(S.wood / 2); S.stone = Math.floor(S.stone / 2); S.gold = Math.floor(S.gold / 2);
  p.hp = heroMaxHp(); auto = null;
  const home = S.towns[0];
  if (home) { p.x = (home.x + .5) * T; p.y = (home.y + 1.5) * T; }
  for (const b of bandits.slice()) if (dist2(b.x, b.y, p.x, p.y) < (T * 8) ** 2) bandits.splice(bandits.indexOf(b), 1);
  toast('💀 쓰러졌습니다. 자원 절반을 잃고 첫 마을에서 깨어났어요.', 3.5);
}

// ---------- 지형 그리기 (청크 캐시) ----------
const CH = 8;
const chunkCache = new Map();
let chunkScale = 2;
resizeHooks.push(() => { const s = clamp(Math.ceil(DPR * ZOOM * 2) / 2, 1, 2.5); if (s !== chunkScale) { chunkScale = s; chunkCache.clear(); } });
function chunkKey(cx, cy) { return cy * 1000 + cx; }
const WATER_COLS = ['#2a6aa0', '#4fa6cc', '#3f92c2', '#3482b6', '#2e74aa', '#2a6aa0', '#27639a'];
function groundColor(t, x, y) {
  const h = hash2(x, y), patch = hash2(x >> 2, (y >> 2) + 777);
  if (t === WATER) return WATER_COLS[waterDepth[y * W + x] || 6];
  if (t === SAND) return shadeHex('#e2cf96', 0.96 + h * 0.07);
  if (t === FOREST) return shadeHex('#4f8e3e', 0.92 + h * 0.08 + patch * 0.06);
  if (t === MOUNTAIN || t === GOLD) return shadeHex('#7f8c62', 0.94 + h * 0.08);
  return shadeHex('#6cae50', 0.93 + h * 0.06 + patch * 0.08);
}
function renderChunk(cx, cy) {
  const size = CH * T, c = document.createElement('canvas');
  c.width = Math.ceil(size * chunkScale); c.height = c.width;
  const g = c.getContext('2d'); g.scale(chunkScale, chunkScale); g.translate(-cx * size, -cy * size);
  const x0 = cx * CH, y0 = cy * CH;
  for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
    if (x >= W || y >= H) continue;
    g.fillStyle = groundColor(S.tiles[y * W + x], x, y); g.fillRect(x * T, y * T, T + 0.5, T + 0.5);
  }
  for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
    if (x >= W || y >= H) continue;
    const t = S.tiles[y * W + x], px = x * T, py = y * T, h = hash2(x, y);
    if (t === GRASS || t === FOREST) {
      g.strokeStyle = t === GRASS ? 'rgba(40,90,30,.45)' : 'rgba(30,60,20,.4)'; g.lineWidth = 1.1;
      for (let k = 0; k < 4; k++) { const hx = px + hash2(x * 7 + k, y) * 28 + 2, hy = py + hash2(x, y * 7 + k) * 26 + 4; g.beginPath(); g.moveTo(hx - 2, hy - 3); g.lineTo(hx, hy); g.lineTo(hx + 2, hy - 4); g.stroke(); }
      g.fillStyle = 'rgba(255,255,220,.10)'; for (let k = 0; k < 3; k++) g.fillRect(px + hash2(x + k, y * 3) * 30, py + hash2(x * 3, y + k) * 30, 2, 2);
      if (t === GRASS && h > 0.9) { const cols = ['#fff', '#ffd54a', '#ff8fb0', '#b8a0ff']; for (let k = 0; k < 3; k++) { g.fillStyle = cols[(k + (h * 40 | 0)) % 4]; g.beginPath(); g.arc(px + 6 + hash2(x + k * 3, y) * 20, py + 6 + hash2(x, y + k * 3) * 20, 1.8, 0, 7); g.fill(); } }
    } else if (t === SAND) {
      g.fillStyle = 'rgba(150,120,70,.25)'; for (let k = 0; k < 5; k++) g.fillRect(px + hash2(x * 5 + k, y) * 30, py + hash2(x, y * 5 + k) * 30, 1.5, 1.5);
    }
    // 물가: 해변 띠와 물거품
    if (t !== WATER) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (tileAt(x + dx, y + dy) !== WATER) continue;
        if (t !== SAND) {
          const gr = dx ? g.createLinearGradient(px + (dx > 0 ? T : 0), 0, px + (dx > 0 ? T - 9 : 9), 0) : g.createLinearGradient(0, py + (dy > 0 ? T : 0), 0, py + (dy > 0 ? T - 9 : 9));
          gr.addColorStop(0, 'rgba(226,207,150,.95)'); gr.addColorStop(1, 'rgba(226,207,150,0)');
          g.fillStyle = gr; g.fillRect(px, py, T, T);
        }
      }
    } else {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nt = tileAt(x + dx, y + dy); if (nt === WATER) continue;
        const gr = dx ? g.createLinearGradient(px + (dx > 0 ? T : 0), 0, px + (dx > 0 ? T - 8 : 8), 0) : g.createLinearGradient(0, py + (dy > 0 ? T : 0), 0, py + (dy > 0 ? T - 8 : 8));
        gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.35, 'rgba(160,220,240,.35)'); gr.addColorStop(1, 'rgba(160,220,240,0)');
        g.fillStyle = gr; g.fillRect(px, py, T, T);
      }
    }
  }
  return c;
}
function getChunk(cx, cy) {
  const k = chunkKey(cx, cy);
  let c = chunkCache.get(k);
  if (c) { chunkCache.delete(k); chunkCache.set(k, c); return c; }
  c = renderChunk(cx, cy); chunkCache.set(k, c);
  if (chunkCache.size > 60) chunkCache.delete(chunkCache.keys().next().value);
  return c;
}

// ---------- 그리기 ----------
const TREE_SPOTS = [[9, 30], [23, 24], [16, 36], [26, 34]];
function dayInfo() {
  const ph = ((S.time / DAY_LEN) + 0.08) % 1, sun = Math.sin(ph * Math.PI * 2);
  return { dark: clamp((-sun - 0.05) * 0.85, 0, 0.6), dusk: Math.abs(sun) < 0.3 ? 1 - Math.abs(sun) / 0.3 : 0, sun };
}
function drawWorld() {
  const p = S.player, tm = S.time;
  let sx = 0, sy = 0; if (shakeAmt > 0.1) { sx = rr(-shakeAmt, shakeAmt); sy = rr(-shakeAmt, shakeAmt); }
  const camX = p.x - VW / 2 / ZOOM + sx, camY = p.y - VH / 2 / ZOOM + sy;
  cam2d.x = camX; cam2d.y = camY; // 탭 좌표 역변환용
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = WATER_COLS[6]; ctx.fillRect(0, 0, VW, VH);
  const tf = () => ctx.setTransform(DPR * ZOOM, 0, 0, DPR * ZOOM, -camX * DPR * ZOOM, -camY * DPR * ZOOM);
  tf();
  const x0 = Math.max(0, Math.floor(camX / T) - 1), y0 = Math.max(0, Math.floor(camY / T) - 1);
  const x1 = Math.min(W - 1, Math.floor((camX + VW / ZOOM) / T) + 1), y1 = Math.min(H - 1, Math.floor((camY + VH / ZOOM) / T) + 2);
  // 지형 청크
  const cs = CH * T;
  for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++)
    ctx.drawImage(getChunk(cx, cy), cx * cs, cy * cs, cs, cs);
  // 물 반짝임
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x; if (S.tiles[i] !== WATER) continue;
    const h = hash2(x, y); if (h > 0.3) continue;
    const a = (Math.sin(tm * 1.8 + h * 40) + 1) / 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * a})`; ctx.lineWidth = 1.5;
    const wx = x * T + h * 60 % 20 + 4, wy = y * T + (h * 97 % 22) + 5 + Math.sin(tm + h * 9) * 1.5;
    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 4, wy - 2.5, wx + 8, wy); ctx.stroke();
  }
  // 영토
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const o = owner[y * W + x]; if (o < 0) continue;
    const col = TOWN_COLORS[o % TOWN_COLORS.length], px = x * T, py = y * T;
    ctx.fillStyle = col; ctx.globalAlpha = 0.1; ctx.fillRect(px, py, T, T);
    const ow = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= H) ? -1 : owner[yy * W + xx];
    ctx.globalAlpha = 0.85;
    if (ow(x - 1, y) !== o) ctx.fillRect(px, py, 2.5, T);
    if (ow(x + 1, y) !== o) ctx.fillRect(px + T - 2.5, py, 2.5, T);
    if (ow(x, y - 1) !== o) ctx.fillRect(px, py, T, 2.5);
    if (ow(x, y + 1) !== o) ctx.fillRect(px, py + T - 2.5, T, 2.5);
    ctx.globalAlpha = 1;
  }
  // 행동 대상 표시 (바닥)
  const act = contextAction(), am = autoMarker();
  if (am) {
    const tx = am.x * T, ty = am.z * T + 8;
    ctx.strokeStyle = 'rgba(255,230,120,.95)'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -tm * 30;
    ctx.beginPath(); ctx.ellipse(tx, ty, 14 * am.rs + 8 * Math.sin(tm * 6) ** 2, 7 * am.rs + 3, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  } else if (act) {
    let tx, ty;
    if (act.kind === 'harvest') { tx = (act.target.x + .5) * T; ty = (act.target.y + .8) * T; }
    else if (act.kind === 'camp') { const q = campPos(act.target); tx = q.x; ty = q.y + 8; }
    else { tx = act.target.x; ty = act.target.y; }
    ctx.strokeStyle = 'rgba(255,240,180,.85)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -tm * 20;
    ctx.beginPath(); ctx.ellipse(tx, ty, 18, 8, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  // 깊이 정렬 오브젝트
  const L = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x, t = S.tiles[i];
    if (t === FOREST) {
      const n = Math.min(4, S.hp[i]), h = hash2(x, y), pine = hash2(x, y + 99) > 0.62;
      for (let k = 0; k < n; k++) { const sp = TREE_SPOTS[(k + (h * 4 | 0)) % 4]; L.push({ y: y * T + sp[1], k: 'tree', x: x * T + sp[0] + (hash2(x + k, y) - .5) * 4, i, v: (h * 50 + k) | 0, pine }); }
    } else if (t === MOUNTAIN || t === GOLD) L.push({ y: y * T + 30, k: 'mtn', x: x * T + 16, i, gold: t === GOLD, v: (hash2(x, y) * 30) | 0 });
  }
  const vis = (x, y, m) => x > camX - m && x < camX + VW / ZOOM + m && y > camY - m && y < camY + VH / ZOOM + m;
  for (const b of S.buildings) { const x = (b.x + .5) * T, y = (b.y + 1) * T - 2; if (vis(x, y, 60)) L.push({ y, k: 'bld', x, o: b }); }
  for (const t of S.towns) { const x = (t.x + .5) * T, y = (t.y + 1) * T; if (vis(x, y, 120)) L.push({ y, k: 'town', x, o: t }); }
  for (const c of S.camps) { const q = campPos(c); if (vis(q.x, q.y, 80)) L.push({ y: q.y + 8, k: 'camp', x: q.x, o: c }); }
  for (const h of S.horses) if (!h.ridden && vis(h.x, h.y, 40)) L.push({ y: h.y, k: 'horse', o: h });
  for (const v of villagers) if (vis(v.x, v.y, 30)) L.push({ y: v.y, k: 'vil', o: v });
  for (const b of bandits) if (vis(b.x, b.y, 40)) L.push({ y: b.y, k: 'bandit', o: b });
  L.push({ y: p.y, k: 'player' });
  L.sort((a, b) => a.y - b.y);
  const lights = [];
  const dinfo = dayInfo();
  for (const e of L) {
    switch (e.k) {
      case 'tree': {
        const wob = chopFx.has(e.i) ? Math.sin(tm * 60) * chopFx.get(e.i) * 6 : 0;
        const s = e.pine ? SPR.pines[e.v % SPR.pines.length] : SPR.trees[e.v % SPR.trees.length];
        if (wob) { ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(wob * 0.03); blit(ctx, s, 0, 0); ctx.restore(); } else blit(ctx, s, e.x, e.y);
        break;
      }
      case 'mtn': blit(ctx, e.gold ? SPR.gold[e.v % 2] : SPR.mtn[e.v % 3], e.x + (chopFx.has(e.i) ? rr(-1.5, 1.5) : 0), e.y); break;
      case 'bld': {
        const b = e.o; blit(ctx, SPR[b.type], e.x, e.y);
        if (b.type === 'tower') { drawFlag(ctx, e.x + 0.5, e.y - 47, TOWN_COLORS[b.town % TOWN_COLORS.length], tm, 0.6); lights.push({ wx: e.x, wy: e.y - 30, r: 90, warm: 1 }); }
        if (b.type === 'house') lights.push({ wx: e.x - 5, wy: e.y - 10, r: 60, warm: 1, k: 0.8 });
        break;
      }
      case 'town': {
        const t = e.o, lv = townLevel(t), s = SPR.castle[lv - 1];
        blit(ctx, s, e.x, e.y);
        const top = e.y - s.ay;
        drawFlag(ctx, e.x, top + 8 - (lv >= 3 ? 4 : 0), TOWN_COLORS[t.id % TOWN_COLORS.length], tm, 0.9);
        ctx.textAlign = 'center'; ctx.font = '800 12px system-ui, sans-serif';
        const label = `${t.name} Lv${lv}`, tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; rrect(ctx, e.x - tw / 2, top - 26, tw, 17, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(label, e.x, top - 13);
        if (S.war && S.war.town === t.id) { ctx.font = '20px system-ui'; ctx.fillText('⚔️', e.x + tw / 2 + 10, top - 10 + Math.sin(tm * 6) * 2); }
        lights.push({ wx: e.x, wy: e.y - 20, r: 200 + lv * 30, warm: 1 });
        break;
      }
      case 'camp': {
        const c = e.o, sh = c.hit ? rr(-2, 2) : 0;
        blit(ctx, SPR.tent, e.x + sh, e.y);
        drawFire(ctx, e.x + 30, e.y + 2, tm, 0.9);
        drawFlag(ctx, e.x - 1, e.y - 37, '#2a1a1a', tm, 0.6);
        bar(e.x, e.y - 52, c.hp / c.maxHp, '#e44');
        lights.push({ wx: e.x + 30, wy: e.y - 4, r: 120, warm: 1 });
        if (rand() < 0.08) emit(e.x + 30, e.y - 8, 1, { color: '#ffb02e', kind: 'spark', smin: 10, smax: 30, up: 40, lmin: .4, lmax: .8, zmin: 1, zmax: 1.5 });
        break;
      }
      case 'horse': { const h = e.o; drawHorse(ctx, h.x, h.y, h.vx < 0 ? -1 : 1, h.walk, false, h.col); break; }
      case 'vil': { const v = e.o; drawHuman(ctx, v.x, v.y, { scale: 0.75, face: v.face || 1, walk: v.walk, body: v.body, legs: '#4a3a2a', hat: hash2(v.x | 0, 1) > 0.5 ? 'band' : null, helm: '#e8d8b0' }); break; }
      case 'bandit': {
        const b = e.o, swingAim = sw => (b.face || 1) > 0 ? (sw ? -0.6 + (0.25 - sw) * 8 : 0.4) : (sw ? Math.PI + 0.6 - (0.25 - sw) * 8 : Math.PI - 0.4);
        if (b.war) {
          const f = FACTIONS[S.war ? S.war.faction : 0];
          drawHuman(ctx, b.x, b.y, { face: b.face || 1, walk: b.walk, body: f.color, trim: b.cmd ? '#c9a040' : '#2a2218', legs: '#2a2420', hat: 'helm', helm: b.cmd ? '#8a7a50' : '#6a6a70', plume: f.plume,
            weapon: b.cmd ? 'axe' : 'spear', armor: b.cmd, cape: b.cmd ? '#5a1a1a' : null, scale: b.cmd ? 1.25 : 1, aim: swingAim(b.swing), flash: b.hit > 0 });
          bar(b.x, b.y - (b.cmd ? 54 : 44), b.hp / b.maxHp, '#e44');
        } else {
          drawHuman(ctx, b.x, b.y, { face: b.face || 1, walk: b.walk, body: '#7a2a22', trim: '#2a1a12', legs: '#2a2420', hat: 'hood', helm: '#3a2a22', weapon: 'club', aim: swingAim(b.swing), flash: b.hit > 0 });
          bar(b.x, b.y - 44, b.hp / 3, '#e44');
        }
        if (b.loot) { ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(b.x + 9, b.y - 8, 3.5, 0, 7); ctx.fill(); }
        break;
      }
      case 'player': drawPlayerW(p); lights.push({ wx: p.x, wy: p.y - 16, r: 150 }); break;
    }
  }
  // 화살
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.6;
  for (const a of arrows) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - Math.cos(a.ang || 0) * 11, a.y - Math.sin(a.ang || 0) * 11); ctx.stroke(); }
  drawParts(ctx);
  drawFloats(ctx);
  // 낮밤
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (dinfo.dusk > 0) { ctx.fillStyle = `rgba(255,120,50,${0.13 * dinfo.dusk})`; ctx.fillRect(0, 0, VW, VH); }
  for (const l of lights) { l.x = (l.wx - camX) * ZOOM; l.y = (l.wy - camY) * ZOOM; l.r *= ZOOM; }
  drawLighting(dinfo.dark, '#0a1030', lights);
  drawVignette(0.28);
  drawJoystick();
  if (p.hurt > 0) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = `rgba(200,0,0,${p.hurt * 0.8})`; ctx.fillRect(0, 0, VW, VH); }
  $('hint').textContent = act ? `행동: ${act.label}` : '';
  $('hint').style.display = act ? 'block' : 'none';
}
function bar(x, y, f, col) { ctx.fillStyle = 'rgba(0,0,0,.6)'; rrect(ctx, x - 14, y, 28, 5, 2.5); ctx.fill(); ctx.fillStyle = col; rrect(ctx, x - 13, y + 1, 26 * clamp(f, 0, 1), 3, 1.5); ctx.fill(); }
function drawPlayerW(p) {
  const face = Math.cos(p.dir) < 0 ? -1 : 1, up = Math.sin(p.dir) < -0.6;
  const swingAng = swing > 0 ? (1 - swing / 0.2) * 2.4 - 1.2 : 0;
  const aim = swing > 0 ? p.dir + swingAng * face : (face > 0 ? 0.4 : Math.PI - 0.4);
  if (p.mounted) {
    const h = S.horses.find(h => h.ridden);
    drawHorse(ctx, p.x, p.y + 4, face, p.walk || 0, true, h && h.col);
    drawHuman(ctx, p.x - face * 2, p.y - 10, { face, up, walk: 0, body: '#2b5fb8', trim: '#f2c14e', cape: '#c0392b', hat: 'crown', weapon: 'sword', aim, noShadow: true, armor: true });
  } else drawHuman(ctx, p.x, p.y, { face, up, walk: p.moving ? p.walk : 0, body: '#2b5fb8', trim: '#f2c14e', cape: '#c0392b', hat: 'crown', weapon: 'sword', aim, armor: true, flash: p.hurt > 0.15 });
  if (swing > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${swing * 3})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y - 14, 22, p.dir - 1.1, p.dir + 1.1); ctx.stroke();
  }
  bar(p.x, p.y - (p.mounted ? 58 : 48), p.hp / heroMaxHp(), '#4c4');
}

// ---------- 미니맵 ----------
let mmT = 0;
const mm = $('minimap'), mmCtx = mm.getContext('2d');
const mmImg = mmCtx.createImageData(W, H);
const MM_COL = [[44, 110, 166], [226, 207, 150], [60, 120, 52], [108, 174, 80], [130, 132, 140], [230, 200, 70]];
function drawMinimap(dt) {
  mmT -= dt;
  if (minimapDirty || mmT <= 0) {
    minimapDirty = false; mmT = 0.5;
    const d = mmImg.data;
    for (let i = 0; i < W * H; i++) {
      const c = MM_COL[S.tiles[i]], o = owner[i];
      let r = c[0], g = c[1], b = c[2];
      if (S.tiles[i] === WATER) { const k = 1 - (waterDepth[i] - 1) * 0.06; r *= k; g *= k; b *= k; }
      if (o >= 0) { const tc = parseInt(TOWN_COLORS[o % TOWN_COLORS.length].slice(1), 16); r = (r + (tc >> 16)) / 2; g = (g + (tc >> 8 & 255)) / 2; b = (b + (tc & 255)) / 2; }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
  }
  mmCtx.putImageData(mmImg, 0, 0);
  const p = playerTile();
  mmCtx.fillStyle = '#e22'; for (const c of S.camps) mmCtx.fillRect(c.x - 1, c.y - 1, 3, 3);
  mmCtx.fillStyle = '#fff'; for (const t of S.towns) mmCtx.fillRect(t.x - 1, t.y - 1, 3, 3);
  if (S.war) { const t = townById(S.war.town); if (t && (S.time * 4 | 0) % 2) { mmCtx.strokeStyle = '#f33'; mmCtx.strokeRect(t.x - 3, t.y - 3, 7, 7); } }
  mmCtx.fillStyle = (S.time * 3 | 0) % 2 ? '#fff' : '#ff0'; mmCtx.fillRect(p.x - 1, p.y - 1, 3, 3);
}

// ---------- 저장 ----------
function b64(arr) { let s = ''; for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]); return btoa(s); }
function unb64(str) { const s = atob(str), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
function save() {
  try {
    const o = { ...S, tiles: b64(S.tiles), hp: b64(S.hp), horses: S.horses.map(h => ({ x: h.x, y: h.y, col: h.col })),
      buildings: S.buildings.map(({ tiles, scan, rate, idleT, ...r }) => r),
      player: { ...S.player, mounted: false }, camps: S.camps.map(c => ({ x: c.x, y: c.y, hp: c.hp, maxHp: c.maxHp, t: 0 })) };
    localStorage.setItem(SAVE_KEY, JSON.stringify(o));
  } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
    const o = JSON.parse(raw);
    o.tiles = unb64(o.tiles); o.hp = unb64(o.hp);
    if (o.tiles.length !== W * H) return false;
    o.horses = o.horses.map(h => ({ ...h, vx: 0, vy: 0, t: 0, ridden: false, walk: 0, col: h.col || HORSE_COLS[ri(HORSE_COLS.length)] }));
    o.hero = o.hero || { lv: 1, exp: 0 }; o.warT = o.warT || 0; o.nextWar = o.nextWar || 80; o.warsWon = o.warsWon || 0; o.war = o.war || null;
    S = o; bandits.length = 0; villagers.length = 0;
    computeDerived(); recomputeOwner();
    toast('이어서 플레이합니다', 1.5);
    if (S.war && !S.war.field) setTimeout(askWar, 600);
    return true;
  } catch (e) { return false; }
}

function hudWorld() {
  $('rWood').textContent = S.wood; $('rStone').textContent = S.stone; $('rGold').textContent = S.gold;
  $('rHp').textContent = S.player.hp; $('rTowns').textContent = S.towns.length;
  $('rPop').textContent = S.towns.reduce((a, t) => a + t.pop, 0); $('rLv').textContent = S.hero.lv;
  $('goal').textContent = S.towns.length === 0 ? '목표: 마을 세우기 (건설 버튼)' : `영토 ${ownedCount}/${GOAL_TILES}칸 · 소굴 ${S.camps.length}`;
  const wb = $('warBtn');
  if (S.war && S.war.field) { wb.style.display = 'block'; wb.textContent = `⚔️ 적 군단 ${bandits.filter(b => b.war).length}명 · 위치`; }
  else wb.style.display = 'none';
}


// ---------- 자원 생산 건물 (벌목소·채석장·금광) ----------
function updateProducers(dt) {
  for (const b of S.buildings) {
    const d = RES_DEF[b.type]; if (!d) continue;
    b.scan = (b.scan || 0) - dt;
    if (b.scan <= 0 || !b.tiles) { b.scan = 2; b.tiles = resTiles(b.type, b.x, b.y); b.rate = d.perMin(b.tiles.length); }
    const cx = (b.x + .5) * T, cy = (b.y + .5) * T;
    if (!b.rate) { b.idleT = (b.idleT || 0) + dt; if (b.idleT > 25) { b.idleT = 0; floatText(cx, cy - 34, d.none, '#c8c8c8', 12); } continue; }
    b.pt = (b.pt || 0) + dt * b.rate / 60;
    if (b.pt < 1) continue;
    b.pt -= 1; S[d.res] += d.amt; b.cnt = (b.cnt || 0) + 1;
    floatText(cx, cy - 34, `+${d.amt}${d.icon}`, d.res === 'wood' ? '#c9f29b' : d.res === 'gold' ? '#ffe27a' : '#ddd', 12);
    emit(cx, cy - 8, 3, { color: d.res === 'wood' ? ['#c8a060', '#8a6030'] : d.res === 'gold' ? ['#ffd34d', '#fff6c0'] : ['#aaa', '#ddd'], smin: 20, smax: 60, lmin: .3, lmax: .5, grav: 200, up: 40, zmin: 1.2, zmax: 2 });
    if (d.thin && b.cnt % d.thin === 0 && b.tiles.length) { // 자원 타일 소모
      let pick = b.tiles[0];
      for (const i of b.tiles) if (S.hp[i] < S.hp[pick]) pick = i;
      if (S.hp[pick] > 0) S.hp[pick]--;
      if (S.hp[pick] <= 0) { setTile(pick, d.tile === GOLD ? MOUNTAIN : GRASS); b.scan = 0; if (d.tile === FOREST) minimapDirty = true; }
      else if (typeof w3dNotify === 'function') w3dNotify('tile', pick);
    }
  }
  // 일꾼: 건물마다 1명
  for (const b of S.buildings) {
    if (!RES_DEF[b.type] || !b.rate) continue;
    if (!villagers.some(v => v.job === b)) villagers.push({ job: b, town: -1, x: (b.x + .5) * T, y: (b.y + 1.1) * T, tx: 0, ty: 0, t: 0, ph: 0, walk: 0, body: b.type === 'lumber' ? '#7a9a4a' : b.type === 'quarry' ? '#9a9a9a' : '#d8b040' });
  }
}
function workerStep(v, dt) {
  const b = v.job; if (!S.buildings.includes(b) || !b.rate || !b.tiles || !b.tiles.length) return false;
  const hx = (b.x + .5) * T, hy = (b.y + 1.1) * T;
  if (!v.ti || v.ph === 0 && v.t <= 0) { // 목적지 고르기
    const i = b.tiles[ri(b.tiles.length)], rx = (i % W + .5) * T, ry = ((i / W) | 0) * T + T * .5, dx = hx - rx, dy = hy - ry, dl = Math.hypot(dx, dy) || 1;
    v.ti = i; v.tx = rx + dx / dl * T * (RES_DEF[b.type].tile === FOREST ? 0.2 : 0.85); v.ty = ry + dy / dl * T * (RES_DEF[b.type].tile === FOREST ? 0.2 : 0.85); v.t = 1; v.stuck = 0;
  }
  let gx = v.tx, gy = v.ty;
  if (v.ph === 2) { gx = hx; gy = hy; }
  if (v.ph === 1) { v.work = (v.work || 0) - dt; v.walk += dt * 3; if (v.work <= 0) v.ph = 2; return true; }
  const d = Math.hypot(gx - v.x, gy - v.y);
  if (d > 5) {
    const sp = 38 * dt;
    if (moveEnt(v, (gx - v.x) / d * sp, (gy - v.y) / d * sp, 4)) { v.walk += dt * 8; v.face = gx > v.x ? 1 : -1; v.stuck = 0; }
    else { v.stuck += dt; if (v.stuck > 1.5) { v.x = gx; v.y = gy; } }
  } else if (v.ph === 0) { v.ph = 1; v.work = 1.6; chopFx.set(v.ti, 0.3); }
  else { v.ph = 0; v.t = 0; v.ti = 0; v.rest = 0; }
  return true;
}

// ---------- 탭해서 행동 (대상을 터치하면 자동으로 걸어가 반복 행동) ----------
const cam2d = { x: 0, y: 0 };
let auto = null; // { kind:'attack'|'camp'|'mount'|'harvest'|'town', target, stop, reach, best, stuck }
function screenToWorldPx(sx, sy) { // 화면(CSS px) → 게임 픽셀
  if (typeof USE3D !== 'undefined' && USE3D && R3D.unproject) { const q = R3D.unproject(sx, sy); return q ? { x: q.x * T, y: q.z * T } : null; }
  return { x: sx / ZOOM + cam2d.x, y: sy / ZOOM + cam2d.y };
}
function pickTarget(wx, wy) {
  const p = S.player;
  // 3D에서는 키 큰 모델(나무·사람)을 누르면 땅 위 지점이 뒤쪽에 찍히므로 살짝 남쪽으로 보정한 점도 함께 본다
  const bandit = nearest(bandits, wx, wy + 10, 32);
  if (bandit) return { kind: 'attack', target: bandit };
  if (!p.mounted) { const h = nearest(S.horses, wx, wy + 8, 32, h => !h.ridden); if (h) return { kind: 'mount', target: h }; }
  let bc = null, bcd = 40 * 40;
  for (const c of S.camps) { const q = campPos(c), d = dist2(wx, wy, q.x, q.y); if (d < bcd) { bcd = d; bc = c; } }
  if (bc) return { kind: 'camp', target: bc };
  for (const t of S.towns) if (Math.abs(wx / T - (t.x + .5)) <= 1.6 && Math.abs(wy / T - (t.y + .5)) <= 1.6) return { kind: 'town', target: t };
  let best = null, bd = 1.25 * 1.25;
  const cx = Math.floor(wx / T), cy = Math.floor(wy / T);
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    const t = tileAt(x, y); if (t !== FOREST && t !== MOUNTAIN && t !== GOLD) continue;
    const d = dist2(wx / T, wy / T + 0.25, x + .5, y + .5);
    if (d < bd) { bd = d; best = { x, y, t }; }
  }
  if (best) return { kind: 'harvest', target: best };
  return null;
}
function autoPos(a) {
  const t = a.target;
  if (a.kind === 'harvest') return { x: (t.x + .5) * T, y: (t.y + .5) * T };
  if (a.kind === 'camp') return campPos(t);
  if (a.kind === 'town') return { x: (t.x + .5) * T, y: (t.y + 1.5) * T };
  return { x: t.x, y: t.y };
}
function autoValid(a) {
  const t = a.target;
  if (a.kind === 'attack') return bandits.includes(t);
  if (a.kind === 'camp') return S.camps.includes(t);
  if (a.kind === 'mount') return !t.ridden && !S.player.mounted;
  if (a.kind === 'harvest') return tileAt(t.x, t.y) === t.t;
  if (a.kind === 'town') return S.towns.includes(t);
  return false;
}
const AUTO_RANGE = { attack: [30, 46], camp: [44, 60], mount: [26, 38], harvest: [T * 1.1, T * 1.6], town: [T * 2.2, T * 3] };
function startAuto(a) {
  const r = AUTO_RANGE[a.kind]; a.stop = r[0]; a.reach = r[1]; a.best = 1e9; a.stuck = 0; a.age = 0;
  auto = a; actHeld = false;
  const q = autoPos(a);
  emit(q.x, q.y, 10, { color: ['#fff', '#ffe27a'], kind: 'ring', smin: 0, smax: 1, lmin: .3, lmax: .5, zmin: 6, zmax: 10, grow: 40 });
}
function worldTap(sx, sy) {
  if (MODE !== 'world' || paused || !S || !S.towns) return;
  const q = screenToWorldPx(sx, sy); if (!q) return;
  const a = pickTarget(q.x, q.y);
  if (a) startAuto(a);
}
tapHooks.push(worldTap);
function autoStep(dt) { // 매 프레임: 조이스틱처럼 이동 벡터를 돌려주고, 사거리 안이면 행동을 반복
  const a = auto, p = S.player;
  if (!autoValid(a)) { auto = null; return null; }
  a.age += dt;
  const q = autoPos(a), dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
  if (d > a.stop) {
    if (d < a.best - 3) { a.best = d; a.stuck = 0; } else a.stuck += dt;
    if (a.stuck > 2.5) { if (d > a.reach) { auto = null; toast('갈 수 없는 곳이에요', 1.5); return null; } }
    else return { x: dx / d, y: dy / d, l: 1 };
  }
  if (d > a.reach) return { x: dx / d, y: dy / d, l: 1 };
  p.dir = Math.atan2(dy, dx);
  if (a.kind === 'town') { auto = null; openBuild(); return null; }
  if (actCd <= 0) {
    actCd = 0.32; performAction(a.kind === 'harvest' ? { kind: 'harvest', target: a.target } : { kind: a.kind, target: a.target });
    if (a.kind === 'mount') auto = null;
  }
  return { x: 0, y: 0, l: 0 };
}
function autoMarker() { // 탭 대상 표시 {x, z(타일 단위), rs}
  if (!auto) return null;
  const q = autoPos(auto), k = auto.kind;
  if (k === 'harvest' || k === 'camp') return { x: q.x / T, z: q.y / T, rs: k === 'camp' ? 1.5 : auto.target.t === FOREST ? 1.05 : 1.4 };
  if (k === 'town') return { x: auto.target.x + .5, z: auto.target.y + .5, rs: 1.8 };
  return { x: q.x / T, z: q.y / T, rs: k === 'mount' ? 1.4 : 0.9 };
}
