'use strict';
// ===== 전쟁(전장 액션) 모드 =====
const BW = 2048, BH = 1280, BGS = 1.25;
let B = null, bGround = null;
const COMBO = [
  { arc: 2.2, r: 58, m: 1.0, kb: 160, dur: 0.21, step: 26 },
  { arc: 2.2, r: 58, m: 1.0, kb: 160, dur: 0.21, step: 26 },
  { arc: 3.0, r: 64, m: 1.3, kb: 210, dur: 0.25, step: 44 },
  { arc: 7.0, r: 80, m: 2.2, kb: 300, dur: 0.42, step: 0, launch: 300 },
];

function heroBattleDmg() { return 2 * (1 + (S.hero.lv - 1) * 0.15); }

function startBattle(war) {
  const f = warFaction(war);
  const diff = war.diff;
  B = { war, f, era: war.era !== undefined ? war.era : S.era, diff, t: 0, limit: 360, kos: 0, officers: 0, captured: 0, units: [], bases: [], obs: [], boss: null,
        phase: 'bases', over: false, result: null, hitstop: 0, dashId: 0, overT: 0, allyMax: allyCount() + 6, spawnT: 0, allyT: 0 };
  const r = mulberry((Date.now() & 0xffff) + 7);
  B.allyBase = { x: 170, y: 640 };
  B.bases = [
    { x: 760, y: 330, owner: 1, cap: 0 }, { x: 860, y: 960, owner: 1, cap: 0 }, { x: 1380, y: 640, owner: 1, cap: 0 },
    { x: 1880, y: 640, owner: 1, cap: 0, hq: true },
  ];
  // 장애물
  const near = (x, y, d) => [B.allyBase, ...B.bases].some(b => dist2(x, y, b.x, b.y) < d * d);
  for (let k = 0; k < 70; k++) {
    const x = 60 + r() * (BW - 120), y = 60 + r() * (BH - 120);
    if (near(x, y, 150)) continue;
    B.obs.push({ x, y, kind: r() < 0.45 ? 'rock' : 'tree', v: (r() * 10) | 0, r: 14 });
  }
  for (let x = 20; x < BW; x += 46) { B.obs.push({ x, y: 18 + r() * 10, kind: 'tree', v: (r() * 10) | 0, r: 12 }); B.obs.push({ x: x + 20, y: BH - 8 - r() * 10, kind: 'tree', v: (r() * 10) | 0, r: 12 }); }
  // 영웅
  const maxHp = 40 + S.hero.lv * 6;
  B.hero = { x: 240, y: 640, hp: maxHp, maxHp, mg: 30, face: 1, dir: 0, combo: 0, comboQ: false, comboWin: 0, atkT: 0, atkDur: 0, atkHit: false,
             dashT: 0, dashCd: 0, musouT: 0, musouTick: 0, inv: 0, walk: 0, hurt: 0, moving: false };
  // 아군
  for (let i = 0; i < allyCount(); i++) addUnit('ally', 0, 200 + rr(-60, 60), 640 + rr(-120, 120));
  // 적
  B.bases.forEach((b, i) => {
    if (!b.hq) { b.officer = addUnit('officer', 1, b.x + 10, b.y, b); b.officer.name = `${f.name.split(' ')[0]} 부장`; }
    for (let k = 0; k < (b.hq ? 8 : 14); k++) addUnit('grunt', 1, b.x + rr(-90, 90), b.y + rr(-90, 90), b);
  });
  bGround = buildBattleGround(r);
  MODE = 'battle'; document.body.classList.add('battle');
  parts.length = 0; floats.length = 0;
  banner('출진!', '부장을 쓰러뜨리고 거점 안에 서 있으면 제압', 3);
}
function addUnit(kind, team, x, y, home) {
  const d = B.diff;
  const st = {
    grunt: { hp: Math.round(3 + d * 1.5), sp: 72, r: 10 },
    ally: { hp: 7, sp: 85, r: 10 },
    officer: { hp: Math.round(28 * d), sp: 82, r: 14 },
    boss: { hp: Math.round(110 * d), sp: 96, r: 18 },
  }[kind];
  const u = { kind, team, x, y, home: home || null, hp: st.hp, maxHp: st.hp, sp: st.sp * rr(0.9, 1.1), r: st.r,
    kx: 0, ky: 0, z: 0, vz: 0, stun: 0, atkT: rr(0.5, 1.5), windup: 0, wkind: null, face: team ? -1 : 1, walk: rand() * 6, hit: 0,
    dead: false, deadT: 0, tgt: null, tgtT: 0, swing: 0, wx: 0, wy: 0, wanderT: 0, dashHit: -1, chargeT: 0 };
  B.units.push(u);
  return u;
}
function buildBattleGround(r) {
  const c = document.createElement('canvas'); c.width = BW * BGS; c.height = BH * BGS;
  const g = c.getContext('2d'); g.scale(BGS, BGS);
  g.fillStyle = '#6a9a48'; g.fillRect(0, 0, BW, BH);
  for (let k = 0; k < 260; k++) { g.fillStyle = r() < 0.5 ? 'rgba(90,140,60,.35)' : 'rgba(130,160,70,.25)'; g.beginPath(); g.ellipse(r() * BW, r() * BH, 40 + r() * 90, 25 + r() * 60, r() * 3, 0, 7); g.fill(); }
  // 길
  const pts = [B.allyBase, B.bases[0], B.bases[2], B.bases[3]], pts2 = [B.allyBase, B.bases[1], B.bases[2]];
  for (const P of [pts, pts2]) for (const [w, col] of [[54, '#8f7a4c'], [40, '#ad9564'], [24, '#b9a272']]) {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i]; g.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + (i % 2 ? 70 : -70), b.x, b.y); }
    g.stroke();
  }
  for (const b of [B.allyBase, ...B.bases]) { const gr = g.createRadialGradient(b.x, b.y, 10, b.x, b.y, 95); gr.addColorStop(0, '#a48b5c'); gr.addColorStop(0.8, '#9a8456'); gr.addColorStop(1, 'rgba(154,132,86,0)'); g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, 95, 0, 7); g.fill(); }
  for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(40,30,20,.18)'; g.beginPath(); g.ellipse(r() * BW, r() * BH, 14 + r() * 24, 8 + r() * 12, r() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(40,80,30,.45)'; g.lineWidth = 1.2;
  for (let k = 0; k < 2600; k++) { const x = r() * BW, y = r() * BH; g.beginPath(); g.moveTo(x - 2, y - 3); g.lineTo(x, y); g.lineTo(x + 2, y - 4); g.stroke(); }
  const fc = ['#fff', '#ffd54a', '#ff8fb0', '#c9a0ff'];
  for (let k = 0; k < 260; k++) { g.fillStyle = fc[k % 4]; g.beginPath(); g.arc(r() * BW, r() * BH, 1.8, 0, 7); g.fill(); }
  return c;
}

// ---------- 조작 ----------
let bAtkHeld = false;
function battleAttack() {
  if (!B || B.over) return;
  const H = B.hero;
  if (H.musouT > 0 || H.dashT > 0) return;
  if (H.atkT > 0) { H.comboQ = true; return; }
  startCombo();
}
function startCombo() {
  const H = B.hero;
  if (H.comboWin <= 0) H.combo = 0;
  H.combo = H.combo % 4 + 1;
  const c = COMBO[H.combo - 1];
  H.atkDur = c.dur; H.atkT = c.dur; H.atkHit = false; H.comboQ = false;
  autoAim();
}
function autoAim() {
  const H = B.hero, mv = moveInput();
  if (mv.l > 0.2) { H.dir = Math.atan2(mv.y, mv.x); return; }
  let best = null, bd = 170 * 170;
  for (const u of B.units) { if (u.team !== 1 || u.dead) continue; const d = dist2(u.x, u.y, H.x, H.y); if (d < bd) { bd = d; best = u; } }
  if (best) H.dir = Math.atan2(best.y - H.y, best.x - H.x);
}
function battleDash() {
  if (!B || B.over) return;
  const H = B.hero; if (H.dashCd > 0 || H.musouT > 0) return;
  autoAim(); H.atkT = 0; H.combo = 0;
  H.dashT = 0.26; H.dashCd = 3; H.inv = 0.35; B.dashId++;
  emit(H.x, H.y, 10, { color: '#ddd', kind: 'smoke', smin: 20, smax: 60, lmin: .3, lmax: .5, zmin: 3, zmax: 5, grow: 10 });
}
function battleMusou() {
  if (!B || B.over) return;
  const H = B.hero; if (H.mg < 100 || H.musouT > 0) return;
  H.mg = 0; H.musouT = 2.2; H.musouTick = 0; H.inv = 2.6; H.atkT = 0; H.dashT = 0;
  banner('필살 · 회천난무', '', 1.2); shake(6);
  emit(H.x, H.y - 14, 40, { color: ['#ffe58a', '#fff', '#ffb02e'], kind: 'spark', smin: 100, smax: 300, lmin: .3, lmax: .7 });
}
holdBtn($('bAtk'), () => { bAtkHeld = true; battleAttack(); }, () => { bAtkHeld = false; });
holdBtn($('bDash'), () => battleDash());
holdBtn($('bMusou'), () => battleMusou());
keyHooks.push((k, down) => {
  if (MODE !== 'battle') return;
  if (k === ' ' || k === 'j') { bAtkHeld = down; if (down) battleAttack(); }
  if (down && k === 'k') battleDash();
  if (down && k === 'l') battleMusou();
});

// ---------- 전투 판정 ----------
function hitArea(x, y, r, dir, arc, dmg, kb, launch) {
  let n = 0;
  for (const u of B.units) {
    if (u.team !== 1 || u.dead) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d > r + u.r) continue;
    if (arc < 6.2 && Math.abs(angDiff(Math.atan2(u.y - y, u.x - x), dir)) > arc / 2) continue;
    damageUnit(u, dmg, x, y, kb, launch); n++;
  }
  return n;
}
function damageUnit(u, dmg, fx, fy, kb, launch, fromAlly) {
  const H = B.hero;
  dmg = Math.round(dmg * rr(0.9, 1.1) * 10) / 10;
  u.hp -= dmg; u.hit = 0.12;
  const a = Math.atan2(u.y - fy, u.x - fx);
  const armor = u.kind === 'boss' ? 0.15 : u.kind === 'officer' ? 0.35 : 1;
  u.kx = Math.cos(a) * kb * armor; u.ky = Math.sin(a) * kb * armor;
  if (u.kind === 'grunt' || u.kind === 'ally') { u.stun = 0.35; if (u.windup > 0) { u.windup = 0; } }
  else if (launch) { u.stun = 0.4; u.windup = 0; u.chargeT = 0; }
  if (launch && u.kind !== 'boss') u.vz = launch * armor;
  if (!fromAlly) {
    H.mg = Math.min(100, H.mg + (u.kind === 'grunt' ? 1.6 : 2.5));
    floatText(u.x + rr(-6, 6), u.y - 40 - u.z, String(Math.max(1, Math.round(dmg * 10))), u.kind === 'grunt' ? '#fff' : '#ffd54a', u.kind === 'grunt' ? 12 : 15);
    emit(u.x, u.y - 16 - u.z, 5, { color: ['#fff', '#ffe58a', '#ffb02e'], kind: 'spark', smin: 120, smax: 260, lmin: .1, lmax: .25, zmin: 2, zmax: 3, ang: a, spread: 1 });
  }
  if (u.hp <= 0) killUnit(u, a);
}
function killUnit(u, a) {
  u.dead = true; u.deadT = 1; u.vz = Math.max(u.vz, 220); u.kx = Math.cos(a) * 220; u.ky = Math.sin(a) * 220;
  if (u.team === 1) {
    B.kos++;
    if (B.kos % 100 === 0) banner(`${B.kos} KO!`, '', 1.2);
    if (u.kind === 'officer') {
      B.officers++; banner('부장 격파!', '거점 안에 들어가 제압하세요', 2); shake(10); B.hitstop = 0.12;
      emit(u.x, u.y - 10, 30, { color: ['#ffd54a', '#fff'], kind: 'spark', smin: 100, smax: 320, lmin: .3, lmax: .7 });
    }
    if (u.kind === 'boss') { B.hitstop = 0.3; shake(16); endBattle(true); }
  }
}
function hurtHero(dmg, fx, fy) {
  const H = B.hero;
  if (H.inv > 0 || B.over) return;
  H.hp -= dmg; H.hurt = 0.3; H.inv = 0.4; H.mg = Math.min(100, H.mg + 4);
  const a = Math.atan2(H.y - fy, H.x - fx); bMove(H, Math.cos(a) * 14, Math.sin(a) * 14, 10);
  shake(6); floatText(H.x, H.y - 48, `-${Math.round(dmg * 10)}`, '#ff6a5a', 14);
  if (H.hp <= 0) { H.hp = 0; endBattle(false); }
}
function bMove(e, dx, dy, r) {
  e.x = clamp(e.x + dx, 30, BW - 30); e.y = clamp(e.y + dy, 40, BH - 30);
  for (const o of B.obs) {
    const ddx = e.x - o.x, ddy = e.y - o.y, d = Math.hypot(ddx, ddy), m = o.r + r;
    if (d < m && d > 0.01) { e.x = o.x + ddx / d * m; e.y = o.y + ddy / d * m; }
  }
}

// ---------- 업데이트 ----------
function updateBattle(dt) {
  if (!B) return;
  updateParts(dt); updateFloats(dt); tickBanner(dt);
  if (B.over) { B.overT += dt; if (B.overT > 1.4 && !$('resultPanel').classList.contains('show')) showResult(); return; }
  if (B.hitstop > 0) { B.hitstop -= dt; return; }
  B.t += dt;
  const H = B.hero, mv = moveInput(), base = heroBattleDmg();
  H.inv -= dt; H.hurt -= dt; H.dashCd -= dt; H.comboWin -= dt;
  H.moving = false;
  if (H.musouT > 0) {
    H.musouT -= dt; H.musouTick -= dt;
    if (mv.l > 0.1) { bMove(H, mv.x * 140 * dt, mv.y * 140 * dt, 10); H.moving = true; }
    H.dir += dt * 18;
    if (H.musouTick <= 0) {
      H.musouTick = 0.12;
      const n = hitArea(H.x, H.y, 100, 0, 7, base * 1.1, 160, 120);
      if (n) shake(3);
      for (let i = 0; i < 4; i++) { const a = rand() * 7; emit(H.x + Math.cos(a) * 60, H.y - 10 + Math.sin(a) * 40, 1, { color: ['#ffe58a', '#ffb02e', '#fff'], kind: 'spark', smin: 150, smax: 250, ang: a + 1.6, spread: 0.2, lmin: .2, lmax: .35 }); }
    }
    if (H.musouT <= 0) {
      hitArea(H.x, H.y, 180, 0, 7, base * 4, 420, 340);
      shake(16); B.hitstop = 0.1;
      emit(H.x, H.y - 10, 1, { color: '#ffe58a', kind: 'ring', smin: 0, smax: 0, zmin: 20, zmax: 20, grow: 420, lmin: .45, lmax: .45 });
      emit(H.x, H.y - 10, 50, { color: ['#ffe58a', '#fff', '#ff8a2a'], kind: 'spark', smin: 200, smax: 500, lmin: .3, lmax: .7, zmin: 2, zmax: 4 });
    }
  } else if (H.dashT > 0) {
    H.dashT -= dt; H.moving = true;
    bMove(H, Math.cos(H.dir) * 640 * dt, Math.sin(H.dir) * 640 * dt, 10);
    for (const u of B.units) {
      if (u.team !== 1 || u.dead || u.dashHit === B.dashId) continue;
      if (dist2(u.x, u.y, H.x, H.y) < (46 + u.r) ** 2) { u.dashHit = B.dashId; damageUnit(u, base * 1.8, H.x - Math.cos(H.dir) * 30, H.y - Math.sin(H.dir) * 30, 260, 160); }
    }
    if (rand() < 0.7) emit(H.x, H.y, 1, { color: '#e8e0c8', kind: 'smoke', smin: 10, smax: 30, lmin: .3, lmax: .5, zmin: 3, zmax: 5, grow: 12 });
    if (H.dashT <= 0) B.hitstop = 0.03;
  } else {
    if (H.atkT > 0) {
      const c = COMBO[H.combo - 1];
      H.atkT -= dt;
      if (c.step) bMove(H, Math.cos(H.dir) * c.step * dt / c.dur, Math.sin(H.dir) * c.step * dt / c.dur, 10);
      if (!H.atkHit && H.atkT <= c.dur * 0.6) {
        H.atkHit = true;
        const n = hitArea(H.x, H.y - 4, c.r, H.dir, c.arc, base * c.m, c.kb, c.launch || 0);
        if (n) { B.hitstop = H.combo === 4 ? 0.07 : 0.035; shake(H.combo === 4 ? 7 : 3); }
        if (H.combo === 4) emit(H.x, H.y - 6, 1, { color: 'rgba(255,255,255,.8)', kind: 'ring', smin: 0, smax: 0, zmin: 10, zmax: 10, grow: 200, lmin: .3, lmax: .3 });
      }
      if (H.atkT <= 0) { H.comboWin = 0.35; if ((H.comboQ || bAtkHeld)) startCombo(); }
    } else if (mv.l > 0.08) {
      const sp = 175 * Math.max(0.4, mv.l);
      bMove(H, mv.x * sp * dt, mv.y * sp * dt, 10); H.dir = Math.atan2(mv.y, mv.x); H.moving = true;
    } else if (bAtkHeld) startCombo();
  }
  if (H.moving) H.walk += dt * 14;
  H.face = Math.cos(H.dir) < 0 ? -1 : 1;
  H.mg = Math.min(100, H.mg + dt * 1.2);
  if (B.t % 1 < dt && H.hp < H.maxHp) H.hp = Math.min(H.maxHp, H.hp + 0.3);

  // 유닛
  B.tokens = 0;
  for (const u of B.units) if (!u.dead && u.team === 1 && u.windup > 0 && u.tgt === H) B.tokens++;
  const enemies = B.units.filter(u => u.team === 1 && !u.dead), allies = B.units.filter(u => u.team === 0 && !u.dead);
  for (const u of B.units) {
    u.hit = Math.max(0, u.hit - dt); u.swing = Math.max(0, u.swing - dt);
    if (u.kx || u.ky) { bMove(u, u.kx * dt, u.ky * dt, u.r); const dec = Math.exp(-7 * dt); u.kx *= dec; u.ky *= dec; if (Math.abs(u.kx) + Math.abs(u.ky) < 4) u.kx = u.ky = 0; }
    if (u.z > 0 || u.vz) { u.vz -= 1000 * dt; u.z += u.vz * dt; if (u.z <= 0) { if (u.vz < -150) emit(u.x, u.y, 4, { color: '#d8c8a0', kind: 'smoke', smin: 20, smax: 50, lmin: .3, lmax: .5, zmin: 2, zmax: 4, grow: 8 }); u.z = 0; u.vz = 0; } }
    if (u.dead) { u.deadT -= dt; continue; }
    if (u.stun > 0) { u.stun -= dt; continue; }
    if (u.z > 0) continue;
    u.atkT -= dt; u.tgtT -= dt;
    if (u.team === 1) enemyAI(u, dt, H, allies); else allyAI(u, dt, enemies);
  }
  // 겹침 밀어내기
  const live = B.units.filter(u => !u.dead && u.z <= 0);
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j], dx = b.x - a.x, dy = b.y - a.y, m = a.r + b.r;
      if (Math.abs(dx) > m || Math.abs(dy) > m) continue;
      const d = Math.hypot(dx, dy);
      if (d < m && d > 0.01) { const push = (m - d) / 2, nx = dx / d, ny = dy / d; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; }
    }
    const dx = a.x - H.x, dy = a.y - H.y, m = a.r + 11, d = Math.hypot(dx, dy);
    if (d < m && d > 0.01) { a.x = H.x + dx / d * m; a.y = H.y + dy / d * m; }
  }
  B.units = B.units.filter(u => !u.dead || u.deadT > 0);

  // 증원
  B.spawnT -= dt;
  if (B.spawnT <= 0) {
    B.spawnT = 2.6;
    const cnt = enemies.length;
    for (const b of B.bases) if (b.owner === 1 && cnt < 75) { for (let k = 0; k < 3; k++) addUnit('grunt', 1, b.x + rr(-40, 40), b.y + rr(-40, 40), b); }
  }
  B.allyT -= dt;
  if (B.allyT <= 0) {
    B.allyT = 5;
    if (allies.length < B.allyMax) for (const b of [B.allyBase, ...B.bases.filter(b => b.owner === 0)]) addUnit('ally', 0, b.x + rr(-30, 30), b.y + rr(-30, 30), b);
  }
  // 거점 제압
  for (const b of B.bases) {
    if (b.owner !== 1 || b.hq) continue;
    const offDead = !b.officer || b.officer.dead;
    const inside = dist2(H.x, H.y, b.x, b.y) < 80 * 80;
    const foes = enemies.filter(u => dist2(u.x, u.y, b.x, b.y) < 90 * 90).length;
    if (offDead && inside && foes < 4) b.cap += dt / 2; else b.cap = Math.max(0, b.cap - dt / 4);
    if (b.cap >= 1) {
      b.owner = 0; B.captured++;
      banner('거점 제압!', B.captured >= 2 ? '' : '다음 거점으로', 1.8);
      emit(b.x, b.y - 20, 30, { color: ['#4fa3ff', '#fff'], kind: 'spark', smin: 100, smax: 260, lmin: .3, lmax: .6 });
      for (const u of enemies) if (u.home === b) u.home = B.bases[3];
      if (B.captured >= 2 && !B.boss) {
        const hq = B.bases[3];
        B.boss = addUnit('boss', 1, hq.x - 40, hq.y, hq); B.boss.name = B.f.boss;
        for (let k = 0; k < 6; k++) addUnit('grunt', 1, hq.x + rr(-80, 80), hq.y + rr(-80, 80), hq);
        B.phase = 'boss';
        setTimeout(() => banner('적장 등장!', `${B.f.boss}을(를) 쓰러뜨려라`, 2.4), 1900);
      }
    }
  }
  if (B.t > B.limit) endBattle(false);
}

function enemyAI(u, dt, H, allies) {
  const dH = Math.hypot(H.x - u.x, H.y - u.y);
  if (u.tgtT <= 0) {
    u.tgtT = rr(0.4, 0.8);
    const aggro = u.kind === 'boss' ? 9999 : u.kind === 'officer' ? 280 : 340;
    const leashOk = !u.home || u.kind === 'grunt' || dist2(H.x, H.y, u.home.x, u.home.y) < 360 * 360;
    if (dH < aggro && leashOk) u.tgt = H;
    else {
      let best = null, bd = 230 * 230;
      for (const a of allies) { const d = dist2(a.x, a.y, u.x, u.y); if (d < bd) { bd = d; best = a; } }
      u.tgt = best;
    }
  }
  if (u.tgt && u.tgt !== H && u.tgt.dead) u.tgt = null;
  // 공격 준비 중
  if (u.windup > 0) {
    u.windup -= dt;
    if (u.wkind === 'charge' && u.windup <= 0) { u.chargeT = 0.55; }
    else if (u.windup <= 0) resolveEnemyAttack(u, H);
    return;
  }
  if (u.chargeT > 0) {
    u.chargeT -= dt;
    bMove(u, Math.cos(u.wdir) * 430 * dt, Math.sin(u.wdir) * 430 * dt, u.r);
    if (dist2(u.x, u.y, H.x, H.y) < (u.r + 16) ** 2) { hurtHero(7 * Math.sqrt(B.diff), u.x, u.y); u.chargeT = 0; }
    emit(u.x, u.y, 1, { color: '#d8c8a0', kind: 'smoke', smin: 10, smax: 30, lmin: .3, lmax: .5, zmin: 3, zmax: 5, grow: 10 });
    return;
  }
  const t = u.tgt;
  let tx, ty, stopD;
  if (t) { tx = t.x; ty = t.y; stopD = u.r + 22 + (u.kind === 'grunt' && t === H ? rr(0, 18) : 0); }
  else {
    u.wanderT -= dt;
    const hb = u.home || B.bases[3];
    if (u.wanderT <= 0) { u.wanderT = rr(1.5, 3.5); u.wx = hb.x + rr(-110, 110); u.wy = hb.y + rr(-110, 110); }
    tx = u.wx; ty = u.wy; stopD = 8;
  }
  const d = Math.hypot(tx - u.x, ty - u.y);
  if (d > stopD) {
    const sp = u.sp * (t ? 1 : 0.5);
    bMove(u, (tx - u.x) / d * sp * dt, (ty - u.y) / d * sp * dt, u.r);
    u.walk += dt * 10; u.face = tx > u.x ? 1 : -1;
  } else if (t) u.face = tx > u.x ? 1 : -1;
  if (!t || u.atkT > 0) return;
  if (t === H) {
    if (u.kind === 'grunt') {
      if (d < 44 && B.tokens < 4) { B.tokens++; u.windup = 0.5; u.wkind = 'poke'; u.wdir = Math.atan2(H.y - u.y, H.x - u.x); }
    } else if (u.kind === 'officer') {
      if (d < 70) { u.windup = 0.7; u.wkind = 'sweep'; u.wdir = Math.atan2(H.y - u.y, H.x - u.x); }
    } else if (u.kind === 'boss') {
      if (d < 85) { u.windup = 0.65; u.wkind = 'sweep'; u.wdir = Math.atan2(H.y - u.y, H.x - u.x); }
      else if (d < 380 && rand() < 0.02) { u.windup = 0.8; u.wkind = 'charge'; u.wdir = Math.atan2(H.y - u.y, H.x - u.x); }
    }
  } else if (d < u.r + 26) {
    u.atkT = rr(1, 1.6); u.swing = 0.25;
    t.hp -= u.kind === 'grunt' ? 1 : 3; t.hit = 0.1;
    if (t.hp <= 0) { t.dead = true; t.deadT = 1; t.vz = 160; }
  }
}
function resolveEnemyAttack(u, H) {
  u.swing = 0.25;
  const d = Math.hypot(H.x - u.x, H.y - u.y), a = Math.atan2(H.y - u.y, H.x - u.x);
  if (u.wkind === 'poke') { if (d < 50 && Math.abs(angDiff(a, u.wdir)) < 1) hurtHero(1 * Math.sqrt(B.diff), u.x, u.y); u.atkT = rr(1.3, 2.4); }
  else if (u.wkind === 'sweep') {
    const R = u.kind === 'boss' ? 92 : 74, dmg = (u.kind === 'boss' ? 6 : 3.5) * Math.sqrt(B.diff);
    if (d < R && Math.abs(angDiff(a, u.wdir)) < (u.kind === 'boss' ? 1.9 : 1.5)) hurtHero(dmg, u.x, u.y);
    shake(u.kind === 'boss' ? 5 : 3);
    u.atkT = u.kind === 'boss' ? rr(1, 1.6) : rr(1.4, 2.2);
  }
  u.windup = 0;
}
function allyAI(u, dt, enemies) {
  const H = B.hero;
  if (u.tgtT <= 0 || (u.tgt && u.tgt.dead)) {
    u.tgtT = rr(0.5, 0.9);
    let best = null, bd = 280 * 280;
    for (const e of enemies) { const d = dist2(e.x, e.y, u.x, u.y); if (d < bd) { bd = d; best = e; } }
    u.tgt = best;
  }
  let tx, ty, stop;
  if (u.tgt) { tx = u.tgt.x; ty = u.tgt.y; stop = u.r + u.tgt.r + 6; }
  else { if (!u.fx || rand() < dt * 0.5) { u.fx = rr(-70, 70); u.fy = rr(-70, 70); } tx = H.x + u.fx; ty = H.y + u.fy; stop = 20; }
  const d = Math.hypot(tx - u.x, ty - u.y);
  if (d > stop) { const sp = u.sp * (u.tgt ? 1 : (d > 200 ? 1.6 : 0.9)); bMove(u, (tx - u.x) / d * sp * dt, (ty - u.y) / d * sp * dt, u.r); u.walk += dt * 10; u.face = tx > u.x ? 1 : -1; }
  else if (u.tgt && u.atkT <= 0) {
    u.atkT = rr(0.9, 1.5); u.swing = 0.25; u.face = tx > u.x ? 1 : -1;
    damageUnit(u.tgt, 1, u.x, u.y, 70, 0, true);
  }
}

function endBattle(win) {
  if (B.over) return;
  B.over = true; B.result = win; B.overT = 0;
  banner(win ? '승리!' : '패배…', win ? `${B.f.boss} 격파` : (B.hero.hp <= 0 ? `${rulerName()}이(가) 쓰러졌습니다` : '시간 초과'), 2.5);
}
function showResult() {
  const win = B.result, t = Math.floor(B.t);
  const score = B.kos + (win ? 200 : 0) + B.officers * 20 - Math.floor(t / 3);
  const rank = !win ? 'C' : score >= 330 ? 'S' : score >= 260 ? 'A' : score >= 190 ? 'B' : 'C';
  const exp = Math.round(B.kos * 0.8 + B.officers * 20 + (win ? 60 : 0));
  const gold = win ? 40 + B.kos + Math.round(B.diff * 30) : 0;
  $('resultPanel').innerHTML = `<h2 style="text-align:center">${win ? '🏆 승리' : '패배'}</h2>
    <div class="rank">${rank}</div>
    <div class="stats"><span>격파 수</span><b>${B.kos} KO</b><span>부장 격파</span><b>${B.officers}</b><span>소요 시간</span><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b>
    <span>경험치</span><b>+${win ? exp : Math.floor(exp / 2)}</b>${win ? `<span>금</span><b>+${gold}🪙</b>` : ''}</div>
    <button class="opt primary" id="backBtn"><span class="ic">🏰</span><span>영지로 돌아가기</span></button>`;
  $('resultPanel').classList.add('show');
  $('backBtn').onclick = () => {
    $('resultPanel').classList.remove('show');
    const st = { kos: B.kos, exp };
    MODE = 'world'; document.body.classList.remove('battle');
    B = null; bGround = null; parts.length = 0; floats.length = 0; bAtkHeld = false;
    onBattleEnd(win, st);
  };
}

// ---------- 그리기 ----------
function enemyLook(u) {
  // 시대별 무장 (era.js ERAS[].looks)
  const f = B.f;
  if (u.kind === 'grunt' || u.kind === 'officer' || u.kind === 'boss') return eraLook(u.kind, f, B.era);
  return eraLook('ally', f, B.era);
}
function drawBattle() {
  const H = B.hero, Z = ZOOM * 0.84, tm = B.t;
  let sx = 0, sy = 0; if (shakeAmt > 0.1) { sx = rr(-shakeAmt, shakeAmt); sy = rr(-shakeAmt, shakeAmt); }
  const camX = clamp(H.x - VW / 2 / Z, -40, BW - VW / Z + 40) + sx, camY = clamp(H.y - VH / 2 / Z, -60, BH - VH / Z + 40) + sy;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#2f4a2a'; ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(DPR * Z, 0, 0, DPR * Z, -camX * DPR * Z, -camY * DPR * Z);
  ctx.drawImage(bGround, 0, 0, BW, BH);
  // 거점 바닥 표시
  for (const b of [B.allyBase, ...B.bases]) {
    const own = b === B.allyBase ? 0 : b.owner, col = own === 0 ? '#4fa3ff' : B.f.plume === '#111' ? '#e04a3a' : '#e04a3a';
    ctx.strokeStyle = own === 0 ? 'rgba(79,163,255,.7)' : 'rgba(224,74,58,.7)'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = tm * 10;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, 80, 56, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    if (b.cap > 0 && b.owner === 1) { ctx.strokeStyle = '#4fa3ff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(b.x, b.y, 80, 56, 0, -Math.PI / 2, -Math.PI / 2 + b.cap * Math.PI * 2); ctx.stroke(); }
  }
  // 공격 예고
  for (const u of B.units) {
    if (u.dead || u.windup <= 0) continue;
    if (u.wkind === 'sweep') {
      const R = u.kind === 'boss' ? 92 : 74, A = u.kind === 'boss' ? 1.9 : 1.5;
      ctx.fillStyle = `rgba(255,40,30,${0.18 + (1 - u.windup / 0.7) * 0.25})`;
      ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.arc(u.x, u.y, R, u.wdir - A, u.wdir + A); ctx.closePath(); ctx.fill();
    } else if (u.wkind === 'charge') {
      ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(u.wdir); ctx.fillStyle = 'rgba(255,40,30,.25)'; ctx.fillRect(0, -16, 240, 32); ctx.restore();
    }
  }
  // 깊이 정렬
  const L = [];
  const vis = (x, y, m) => x > camX - m && x < camX + VW / Z + m && y > camY - m && y < camY + VH / Z + m;
  for (const o of B.obs) if (vis(o.x, o.y, 60)) L.push({ y: o.y, k: 'obs', o });
  for (const b of [B.allyBase, ...B.bases]) {
    if (!vis(b.x, b.y, 140)) continue;
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; if (Math.abs(angDiff(a, Math.PI)) < 0.35 || Math.abs(a) < 0.35) continue; L.push({ y: b.y + Math.sin(a) * 60, k: 'pal', x: b.x + Math.cos(a) * 86 }); }
    L.push({ y: b.y, k: 'flag', o: b });
  }
  for (const u of B.units) if (vis(u.x, u.y, 60)) L.push({ y: u.y, k: 'unit', o: u });
  L.push({ y: H.y, k: 'hero' });
  L.sort((a, b) => a.y - b.y);
  for (const e of L) {
    if (e.k === 'obs') { const o = e.o; if (o.kind === 'rock') blit(ctx, SPR.rock[o.v % 2], o.x, o.y + 6); else blit(ctx, o.v % 3 === 0 ? SPR.pines[o.v % 3] : SPR.trees[o.v % 5], o.x, o.y + 8); }
    else if (e.k === 'pal') blit(ctx, SPR.palisade, e.x, e.y);
    else if (e.k === 'flag') {
      const b = e.o, own = b === B.allyBase ? 0 : b.owner;
      drawFlag(ctx, b.x, b.y, own === 0 ? '#3a7ad8' : B.f.color === '#3a3a44' ? '#2a2a30' : B.f.color, tm, 1.6);
      drawFire(ctx, b.x + 40, b.y + 20, tm + b.x, 0.8); drawFire(ctx, b.x - 40, b.y + 20, tm + b.y, 0.8);
      if (b.hq) { ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('적 본진', b.x, b.y - 46); }
    }
    else if (e.k === 'unit') drawUnit(e.o, tm);
    else drawHero(H, tm);
  }
  drawParts(ctx); drawFloats(ctx);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = 'rgba(255,140,60,.07)'; ctx.fillRect(0, 0, VW, VH);
  if (H.musouT > 0) { ctx.fillStyle = 'rgba(255,210,90,.10)'; ctx.fillRect(0, 0, VW, VH); }
  drawVignette(0.4);
  if (H.hurt > 0) { ctx.fillStyle = `rgba(200,0,0,${H.hurt * 0.7})`; ctx.fillRect(0, 0, VW, VH); }
  drawJoystick();
  hudBattle();
}
function drawUnit(u, tm) {
  const lk = enemyLook(u);
  const face = u.face || 1;
  let aim;
  if (u.windup > 0) aim = u.wdir + (u.wkind === 'poke' ? Math.PI : -1.4 * face) * 0.6 - (u.wkind === 'poke' ? Math.PI * 0.6 : 0);
  else if (u.swing > 0) aim = (face > 0 ? 0 : Math.PI) + (u.swing / 0.25 - 0.5) * 2 * face;
  else aim = face > 0 ? 0.35 : Math.PI - 0.35;
  if (u.chargeT > 0) aim = u.wdir;
  const alpha = u.dead ? clamp(u.deadT * 1.6, 0, 1) : 1;
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (u.kind === 'boss' || u.kind === 'officer') {
    const gr = ctx.createRadialGradient(u.x, u.y, 2, u.x, u.y, 30 * (lk.scale || 1));
    gr.addColorStop(0, u.kind === 'boss' ? 'rgba(255,40,30,.45)' : 'rgba(255,200,60,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(u.x, u.y, 30 * (lk.scale || 1), 12 * (lk.scale || 1), 0, 0, 7); ctx.fill();
  }
  drawHuman(ctx, u.x, u.y, { ...lk, face, walk: u.walk, aim, flash: u.hit > 0, z: u.z, rot: u.dead ? -face * Math.min(1.4, (1 - u.deadT) * 4) : 0 });
  ctx.globalAlpha = 1;
  if (u.dead) return;
  const s = lk.scale || 1;
  if (u.windup > 0 && u.kind === 'grunt') { ctx.fillStyle = '#ff3a2a'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', u.x, u.y - 46 - u.z); }
  if (u.kind !== 'grunt' && u.kind !== 'ally') {
    bar(u.x, u.y - 50 * s - u.z, u.hp / u.maxHp, '#e44');
    ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.fillStyle = u.kind === 'boss' ? '#ff9a8a' : '#ffd54a';
    ctx.strokeText(u.name || '', u.x, u.y - 55 * s - u.z); ctx.fillText(u.name || '', u.x, u.y - 55 * s - u.z);
  } else if (u.hp < u.maxHp && u.team === 1) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(u.x - 9, u.y - 44 - u.z, 18, 3); ctx.fillStyle = '#e44'; ctx.fillRect(u.x - 9, u.y - 44 - u.z, 18 * u.hp / u.maxHp, 3); }
}
function drawHero(H, tm) {
  // 필살 오라
  if (H.musouT > 0) {
    const gr = ctx.createRadialGradient(H.x, H.y - 10, 5, H.x, H.y - 10, 110);
    gr.addColorStop(0, 'rgba(255,230,120,.55)'); gr.addColorStop(1, 'rgba(255,180,40,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(H.x, H.y - 10, 110, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,180,.8)'; ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(H.x, H.y - 4, 90, 44, 0, H.dir + i * 2.1, H.dir + i * 2.1 + 1.2); ctx.stroke(); }
  } else if (H.mg >= 100) {
    ctx.strokeStyle = `rgba(255,220,100,${0.4 + Math.sin(tm * 8) * 0.2})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(H.x, H.y, 22, 9, 0, 0, 7); ctx.stroke();
  }
  // 휘두르기 궤적
  let aim = H.face > 0 ? 0.4 : Math.PI - 0.4;
  if (H.atkT > 0) {
    const c = COMBO[H.combo - 1], p = 1 - H.atkT / c.dur;
    const span = Math.min(c.arc, 6.6), start = H.dir - span / 2 * (H.combo % 2 ? 1 : -1), cur = start + span * Math.min(1, p * 1.5) * (H.combo % 2 ? 1 : -1);
    aim = cur;
    const a0 = Math.min(start, cur), a1 = Math.max(start, cur);
    const gr = ctx.createRadialGradient(H.x, H.y - 10, c.r * 0.3, H.x, H.y - 10, c.r);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.8, `rgba(255,250,220,${0.55 * (1 - p * 0.6)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(H.x, H.y - 10); ctx.arc(H.x, H.y - 10, c.r, a0, a1); ctx.closePath(); ctx.fill();
  } else if (H.musouT > 0) aim = H.dir;
  else if (H.dashT > 0) aim = H.dir;
  drawHuman(ctx, H.x, H.y, Object.assign(eraLook('player'), { face: H.face, up: Math.sin(H.dir) < -0.6 && H.atkT <= 0 && H.musouT <= 0, walk: H.moving ? H.walk : 0,
    aim, scale: 1.15, flash: H.hurt > 0.15 }));
}
function hudBattle() {
  const H = B.hero;
  $('bHp').firstElementChild.style.width = (H.hp / H.maxHp * 100) + '%';
  $('bMg').firstElementChild.style.width = H.mg + '%';
  $('bLv').textContent = `Lv${S.hero.lv}`; if ($('bName').textContent !== rulerName()) $('bName').textContent = rulerName();
  $('bKo').innerHTML = `${B.kos}<small>KO</small>`;
  const left = Math.max(0, Math.ceil(B.limit - B.t)), tt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  $('bObj').textContent = B.phase === 'boss' ? `⚔️ 적장 격파 · ⏱ ${tt}` : `🚩 적 거점 제압 ${B.captured}/2 · ⏱ ${tt}`;
  const bb = $('bBoss');
  if (B.boss && !B.boss.dead) { bb.style.display = 'block'; $('bBossName').textContent = B.boss.name; bb.querySelector('i').style.width = (B.boss.hp / B.boss.maxHp * 100) + '%'; } else bb.style.display = 'none';
  $('bMusou').classList.toggle('ready', H.mg >= 100);
  $('bMusou').querySelector('.cd').style.setProperty('--p', (100 - H.mg) + '%');
  $('bDash').querySelector('.cd').style.setProperty('--p', (Math.max(0, H.dashCd) / 3 * 100) + '%');
  // 전장 지도
  const m = $('bMap').getContext('2d'), sx = 90 / BW, sy = 60 / BH;
  m.clearRect(0, 0, 90, 60);
  m.fillStyle = 'rgba(224,74,58,.9)'; for (const u of B.units) if (u.team === 1 && !u.dead) m.fillRect(u.x * sx, u.y * sy, 1.5, 1.5);
  m.fillStyle = 'rgba(79,163,255,.9)'; for (const u of B.units) if (u.team === 0 && !u.dead) m.fillRect(u.x * sx, u.y * sy, 1.5, 1.5);
  for (const b of B.bases) { m.fillStyle = b.owner === 0 ? '#4fa3ff' : b.hq ? '#ff3a2a' : '#e0a040'; m.fillRect(b.x * sx - 3, b.y * sy - 3, 6, 6); }
  m.fillStyle = '#fff'; m.beginPath(); m.arc(H.x * sx, H.y * sy, 2.5, 0, 7); m.fill();
}
