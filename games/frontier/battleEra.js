'use strict';
// ===== battleEra.js: 시대마다 달라지는 전장 =====
// 전투(battle.js) 규칙은 그대로 두고, 시대에 따라
//   · 땅 색 · 하늘/빛 (부족 = 맑은 아침 숲, 고대 = 뙤약볕 먼지, 중세 = 노을, 근세 = 잿빛 화약 연기)
//   · 거점 꾸밈 (부족: 가죽 천막·토템·말리는 틀 / 고대: 전차·청동 깃대·계단 신전 / 중세: 줄무늬 천막·깃발·투석기·공성 사다리 / 근세: 대포·흙 보루·보루 바구니·화약통)
//   · 일제 사격 (부족 투석 · 고대 화살 · 중세 석궁 화살비 / 근세 머스킷 일제 사격 + 대포 포격 / 근대 소총 일제 사격 + 야포 포격)
//   · 근대: 참호(땅에 파인 지그재그 도랑) + 모래주머니 둑 · 야포 · 전신주와 전선 · 흙 보루 · 들판 곳곳에 피어오르는 포연, 야포병 곁엔 야포 모형
// 을 더한다. 아군 거점은 내 시대(S.era), 적 거점은 적 시대(B.era).
// battle.js · battle3d.js 에서 typeof 로 확인하고 부른다 (이 파일이 없어도 전투는 그대로 돈다).
// 그리기는 모두 인스턴스(종류마다 그리기 호출 1개) + 2D 덧그림 + 기존 빛무리 풀이라 가볍다.

const BE_FOE = 1, BE_ALLY = 0;
function beEra(team) { return clamp((team === BE_ALLY ? S.era : B.era) | 0, 0, ERAS.length - 1); }

// ---------- 준비 (startBattle: 장애물 다음, 유닛 앞) ----------
function bEraSetup(r) {
  if (!B) return;
  const ae = beEra(BE_ALLY), fe = beEra(BE_FOE);
  // 장애물: 고대는 나무 대신 바위가 많은 마른 땅, 근세는 포격으로 나무가 줄어든 들판
  const base = ae;
  for (let i = B.obs.length - 1; i >= 0; i--) {
    const o = B.obs[i]; if (o.kind !== 'tree' || o.r !== 14) continue;
    if (base === 1 && r() < 0.55) o.kind = 'rock';
    else if (base === 3 && r() < 0.45) B.obs.splice(i, 1);
    else if (base === 4 && r() < 0.6) B.obs.splice(i, 1);
  }
  const deco = [], cannons = [];
  const add = (kind, x, y, ry, era, team, rad) => {
    const d = { kind, x, y, ry: ry || 0, era, team, v: (r() * 10) | 0 };
    deco.push(d); if (rad) B.obs.push({ x, y, kind: 'deco', r: rad, v: 0 });
    return d;
  };
  const all = [B.allyBase, ...B.bases];
  all.forEach((b, bi) => {
    const team = bi === 0 ? BE_ALLY : BE_FOE, e = team === BE_ALLY ? ae : fe, fwd = team === BE_ALLY ? 0 : Math.PI;
    // 길(거점 좌우 = 0 · π 방향)을 피한 둘레 자리
    const around = (n, r0, r1, kind, rad, face) => {
      for (let k = 0; k < n; k++) {
        let a = 0; for (let t = 0; t < 8; t++) { a = r() * Math.PI * 2; if (Math.abs(Math.sin(a)) > 0.5) break; }
        const d = r0 + r() * (r1 - r0);
        add(kind, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, face === 'out' ? a : r() * 6.28, e, team, rad);
      }
    };
    const gate = (kind, dist, rad) => { for (const s of [-1, 1]) add(kind, b.x + Math.cos(fwd) * dist, b.y + s * 46, fwd, e, team, rad); };
    if (e === 0) { around(3, 118, 160, 'tent', 18); gate('totem', 92, 9); around(1, 120, 150, 'rack', 10); }
    else if (e === 1) { around(2, 120, 160, 'chariot', 16, 'out'); gate('standard', 92, 7); around(2, 124, 160, 'tentA', 18); }
    else if (e === 2) {
      around(2, 120, 160, 'pavilion', 20); gate('banner', 92, 7);
      if (bi === 0 || b.hq) add('trebuchet', b.x - Math.cos(fwd) * 150, b.y + (bi === 0 ? -110 : 120), fwd, e, team, 26);
      if (b.hq) for (const a of [-0.9, -0.5, 0.5, 0.9]) add('ladder', b.x + Math.cos(Math.PI + a) * 92, b.y + Math.sin(Math.PI + a) * 92, Math.PI + a, e, team, 0);
    } else if (e === 4) { // 근대: 모래주머니 둑 + 야포 + 참호 앞 모래주머니 + 흙 보루
      around(2, 128, 165, 'tentM', 18); around(1, 120, 150, 'barrels', 10);
      for (const s of [-1, 1]) cannons.push(add('fieldgun', b.x + Math.cos(fwd + s * 0.55) * 112, b.y + Math.sin(fwd + s * 0.55) * 112, fwd + s * 0.15, e, team, 14));
      for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; if (Math.abs(Math.sin(a)) < 0.38) continue; add('sandbag', b.x + Math.cos(a) * 86, b.y + Math.sin(a) * 86, a + Math.PI / 2, e, team, 0); }
      for (let a = -1.05; a <= 1.05; a += 0.2) { if (Math.abs(a) < 0.3) continue; const aa = fwd + a; add('sandbag', b.x + Math.cos(aa) * 166, b.y + Math.sin(aa) * 166, aa + Math.PI / 2, e, team, 0); } // 참호 앞둑
      add('berm', b.x, b.y, 0, e, team, 0);
    } else {
      around(2, 128, 165, 'tentM', 18); around(1, 120, 150, 'barrels', 10);
      for (const s of [-1, 1]) cannons.push(add('cannon', b.x + Math.cos(fwd + s * 0.55) * 112, b.y + Math.sin(fwd + s * 0.55) * 112, fwd + s * 0.15, e, team, 14));
      for (let k = 0; k < 18; k++) { const a = k / 18 * Math.PI * 2; if (Math.abs(Math.sin(a)) < 0.38) continue; if (k % 2) add('gabion', b.x + Math.cos(a) * 86, b.y + Math.sin(a) * 86, a, e, team, 0); }
      add('berm', b.x, b.y, 0, e, team, 0);
    }
    if (b.hq && e === 1) add('zigg', b.x - 83, b.y - 115, 0, e, team, 44); // 고대 적 본진: 계단 신전
  });
  // 근대: 전신주 줄 (아군 쪽 / 적 쪽) — 근처 나무는 치운다
  const poles = (x0, x1, y, e, team) => {
    let prev = null;
    for (let x = x0; x <= x1; x += 150) {
      for (let i = B.obs.length - 1; i >= 0; i--) { const o = B.obs[i]; if (o.kind === 'tree' && o.r === 14 && dist2(o.x, o.y, x, y) < 40 * 40) B.obs.splice(i, 1); }
      const d = add('tpole', x, y, 0, e, team, 6);
      if (prev) { const w = add('wire', prev.x, prev.y, Math.atan2(y - prev.y, x - prev.x), e, team, 0); w.len = Math.hypot(x - prev.x, y - prev.y) / T; }
      prev = d;
    }
  };
  if (ae === 4) poles(300, 1050, 520, ae, BE_ALLY);
  if (fe === 4) poles(1150, 1800, 800, fe, BE_FOE);
  for (const c of cannons) { c.cd = 1.5 + r() * 4; c.kick = 0; }
  // 근대: 들판 곳곳에서 포연이 피어오른다 (불탄 자리)
  const smk = [];
  if (ae === 4 || fe === 4) for (let k = 0; k < 5; k++) smk.push({ x: 450 + r() * 1200, y: 220 + r() * 840 });
  B.eraFx = { deco, cannons, vol: [], balls: [], fl: [], smk, volT: 5 + r() * 3, ver: 0 };
}

// ---------- 땅 (buildBattleGround 끝) ----------
function bEraGround(g, r) {
  const e = clamp(S.era | 0, 0, ERAS.length - 1);
  if (e === 0) { // 짙은 풀 · 고사리 덤불
    g.fillStyle = 'rgba(40,90,40,.16)'; g.fillRect(0, 0, BW, BH);
    for (let k = 0; k < 120; k++) { g.fillStyle = r() < 0.5 ? 'rgba(40,80,30,.32)' : 'rgba(90,130,50,.3)'; g.beginPath(); g.ellipse(r() * BW, r() * BH, 12 + r() * 30, 8 + r() * 16, r() * 3, 0, 7); g.fill(); }
  } else if (e === 1) { // 누렇게 마른 풀 · 모래땅 · 갈라진 흙
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#f2cf8a'; g.fillRect(0, 0, BW, BH); g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(196,164,98,.5)'; g.fillRect(0, 0, BW, BH);
    for (let k = 0; k < 140; k++) { g.fillStyle = r() < 0.6 ? 'rgba(206,176,118,.4)' : 'rgba(170,140,80,.3)'; g.beginPath(); g.ellipse(r() * BW, r() * BH, 30 + r() * 90, 20 + r() * 50, r() * 3, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(90,64,30,.35)'; g.lineWidth = 1.2;
    for (let k = 0; k < 90; k++) { let x = r() * BW, y = r() * BH; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += rr(-14, 14); y += rr(-10, 10); g.lineTo(x, y); } g.stroke(); }
  } else if (e === 2) { // 진흙 수레바퀴 자국
    g.strokeStyle = 'rgba(80,60,36,.28)'; g.lineWidth = 3;
    for (let k = 0; k < 14; k++) { const x = r() * BW, y = r() * BH, a = r() * 3; for (const o of [-6, 6]) { g.beginPath(); g.moveTo(x + Math.sin(a) * o, y - Math.cos(a) * o); g.lineTo(x + Math.cos(a) * 160 + Math.sin(a) * o, y + Math.sin(a) * 160 - Math.cos(a) * o); g.stroke(); } }
  } else if (e === 4) { // 근대: 잿빛 진흙 · 포탄 구덩이 투성이 · 거점 앞 지그재그 참호
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#b4ae9e'; g.fillRect(0, 0, BW, BH); g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(96,90,72,.4)'; g.fillRect(0, 0, BW, BH);
    for (let k = 0; k < 130; k++) { g.fillStyle = r() < 0.5 ? 'rgba(80,64,44,.34)' : 'rgba(60,56,46,.3)'; g.beginPath(); g.ellipse(r() * BW, r() * BH, 30 + r() * 80, 18 + r() * 40, r() * 3, 0, 7); g.fill(); }
    for (let k = 0; k < 56; k++) beCrater(g, r() * BW, r() * BH, 9 + r() * 18);
    [B.allyBase, ...B.bases].forEach((b, bi) => {
      if (beEra(bi === 0 ? BE_ALLY : BE_FOE) !== 4) return;
      const fwd = bi === 0 ? 0 : Math.PI, pts = [];
      for (let a = -1.1, k = 0; a <= 1.1; a += 0.1, k++) { if (Math.abs(a) < 0.26) { pts.push(null); continue; } const R = 150 + (k % 2 ? 10 : -4); pts.push([b.x + Math.cos(fwd + a) * R, b.y + Math.sin(fwd + a) * R]); }
      for (const [w, col] of [[26, 'rgba(120,100,70,.55)'], [17, '#2e261c'], [7, '#1c1812']]) {
        g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'miter'; g.lineCap = 'butt'; g.beginPath(); let on = false;
        for (const p of pts) { if (!p) { on = false; continue; } if (on) g.lineTo(p[0], p[1]); else { g.moveTo(p[0], p[1]); on = true; } }
        g.stroke();
      }
    });
  } else { // 짓밟힌 진흙 들판 · 포탄 구덩이
    g.globalCompositeOperation = 'multiply'; g.fillStyle = '#c8c8bc'; g.fillRect(0, 0, BW, BH); g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(112,114,96,.34)'; g.fillRect(0, 0, BW, BH);
    for (let k = 0; k < 110; k++) { g.fillStyle = r() < 0.5 ? 'rgba(92,74,48,.32)' : 'rgba(70,60,40,.26)'; g.beginPath(); g.ellipse(r() * BW, r() * BH, 30 + r() * 80, 18 + r() * 40, r() * 3, 0, 7); g.fill(); }
    for (let k = 0; k < 34; k++) beCrater(g, r() * BW, r() * BH, 10 + r() * 16);
  }
}
function beCrater(g, x, y, s) {
  const gr = g.createRadialGradient(x, y, s * 0.2, x, y, s * 1.5);
  gr.addColorStop(0, 'rgba(30,24,18,.75)'); gr.addColorStop(0.55, 'rgba(60,48,32,.55)'); gr.addColorStop(0.75, 'rgba(150,130,100,.35)'); gr.addColorStop(1, 'rgba(150,130,100,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, s * 1.5, s * 1.2, 0, 0, 7); g.fill();
}

// ---------- 매 프레임 규칙 (updateBattle) ----------
const BE_VOL = [ // 적 원거리 일제 사격 (부족·고대·중세)
  { kind: 'stone', n: 9, R: 50, dmg: 1.2, name: '돌팔매 세례!' },
  { kind: 'arrow', n: 13, R: 54, dmg: 1.4, name: '화살비!' },
  { kind: 'bolt', n: 15, R: 56, dmg: 1.6, name: '화살비!' },
];
function bEraUpdate(dt, H) {
  const E = B && B.eraFx; if (!E || B.over || typeof USE3D === 'undefined' || !USE3D) return;
  for (let i = E.fl.length - 1; i >= 0; i--) { E.fl[i].t -= dt; if (E.fl[i].t <= 0) E.fl.splice(i, 1); }
  // 일제 사격
  E.volT -= dt;
  if (E.volT <= 0) { E.volT = rr(7, 11); beVolley(H); }
  for (let i = E.vol.length - 1; i >= 0; i--) {
    const v = E.vol[i]; v.t += dt;
    if (!v.hit && v.t >= v.dur) {
      v.hit = true;
      const V = BE_VOL[v.e];
      if (dist2(H.x, H.y, v.tx, v.ty) < v.R * v.R && H.inv <= 0) hurtHero(V.dmg * Math.sqrt(B.diff), v.x0, v.y0);
      for (const a of B.units) if (a.team === 0 && !a.dead && dist2(a.x, a.y, v.tx, v.ty) < v.R * v.R && rand() < 0.5) hurtAlly(a, 1);
      emit(v.tx, v.ty, 8, { color: ['#c8b890', '#a89870'], kind: 'smoke', smin: 10, smax: 40, lmin: .3, lmax: .6, zmin: 3, zmax: 6, grow: 8, jit: v.R * 0.6 });
    }
    if (v.t > v.dur + 0.5) E.vol.splice(i, 1);
  }
  // 근대 포연 (들판 곳곳)
  if (E.smk) for (const p of E.smk) if (rand() < dt * 2.2) emit(p.x + rr(-14, 14), p.y + rr(-10, 10), 1, { color: ['#5a5650', '#6e6a62', '#48443e'], kind: 'smoke', smin: 4, smax: 16, up: 10, lmin: 2.2, lmax: 3.6, zmin: 10, zmax: 16, grow: 10, drag: 0.6 });
  // 대포 (근세) · 야포 (근대)
  for (const c of E.cannons) {
    c.kick = Math.max(0, c.kick - dt * 3);
    c.cd -= dt; if (c.cd > 0) continue;
    if (dist2(c.x, c.y, H.x, H.y) > (c.team === BE_FOE ? 750 : 1000) ** 2) { c.cd = 1; continue; }
    let tx, ty;
    if (c.team === BE_FOE && E.balls.some(b => b.team === BE_FOE && !b.hit)) { c.cd = rr(1, 2.5); continue; } // 영주 쪽 포탄은 한 번에 하나만
    if (c.team === BE_FOE) { const a = rand() * 6.28, d = rr(20, 120); tx = H.x + Math.cos(a) * d; ty = H.y + Math.sin(a) * d * 0.8; }
    else {
      let best = null, bd = 900 * 900;
      for (const u of B.units) if (u.team === 1 && !u.dead && u.kind === 'grunt') { const d = dist2(u.x, u.y, c.x, c.y); if (d < bd && d > 200 * 200) { bd = d; best = u; } }
      if (!best) { c.cd = 2; continue; }
      tx = best.x + rr(-30, 30); ty = best.y + rr(-30, 30);
    }
    c.cd = c.team === BE_FOE ? rr(8, 13) : rr(5.5, 9); c.kick = 1;
    c.ry = Math.atan2(ty - c.y, tx - c.x); E.ver++;
    const mx = c.x + Math.cos(c.ry) * 34, my = c.y + Math.sin(c.ry) * 34, d = Math.hypot(tx - mx, ty - my);
    E.fl.push({ x: mx, y: my, t: 0.2, t0: 0.2, s: 2.6 });
    E.balls.push({ x0: mx, y0: my, tx, ty, t: 0, dur: 0.45 + d / 650, team: c.team, R: 58, hit: false });
    emit(mx, my - 8, 12, { color: ['#f2f0ea', '#d8d6d0', '#bdbab2'], kind: 'smoke', smin: 20, smax: 90, ang: c.ry, spread: 0.9, lmin: 1.0, lmax: 2.0, zmin: 6, zmax: 11, grow: 16, drag: 2.4 });
    if (dist2(c.x, c.y, H.x, H.y) < 600 * 600) shake(3);
  }
  for (let i = E.balls.length - 1; i >= 0; i--) {
    const b = E.balls[i]; b.t += dt;
    if (!b.hit && b.t >= b.dur) {
      b.hit = true;
      if (b.team === BE_FOE) {
        if (dist2(H.x, H.y, b.tx, b.ty) < b.R * b.R && H.inv <= 0) hurtHero(b.dmg || 3 * Math.sqrt(B.diff), b.tx, b.ty);
        for (const a of B.units) if (a.team === 0 && !a.dead && dist2(a.x, a.y, b.tx, b.ty) < b.R * b.R) { hurtAlly(a, b.dmg ? 1.5 : 2); const an = Math.atan2(a.y - b.ty, a.x - b.tx); a.kx = Math.cos(an) * 220; a.ky = Math.sin(an) * 220; }
      } else for (const u of B.units) if (u.team === 1 && !u.dead && (u.kind === 'grunt' || b.dmg) && dist2(u.x, u.y, b.tx, b.ty) < b.R * b.R) damageUnit(u, b.dmg || 3, b.tx, b.ty, 260, 220, true); // 야포병 포탄은 부장에게도
      emit(b.tx, b.ty, 16, { color: ['#5a4630', '#6a5438', '#3a3024'], kind: 'dot', smin: 80, smax: 260, up: 120, grav: 500, lmin: .4, lmax: .8, zmin: 2, zmax: 4 });
      emit(b.tx, b.ty - 6, 9, { color: ['#a89a88', '#8a8070', '#c8c0b0'], kind: 'smoke', smin: 20, smax: 70, lmin: .8, lmax: 1.5, zmin: 7, zmax: 12, grow: 18 });
      emit(b.tx, b.ty, 1, { color: 'rgba(255,190,90,.9)', kind: 'ring', smin: 0, smax: 0, zmin: 10, zmax: 10, grow: 160, lmin: .3, lmax: .3 });
      E.fl.push({ x: b.tx, y: b.ty, t: 0.16, t0: 0.16, s: 3.2 });
      if (dist2(H.x, H.y, b.tx, b.ty) < 500 * 500) shake(dist2(H.x, H.y, b.tx, b.ty) < 160 * 160 ? 9 : 5);
      if (bGround && B3 && B3.tex) { const g = bGround.getContext('2d'); g.save(); g.scale(BGS, BGS); beCrater(g, b.tx, b.ty, 9 + rand() * 5); g.restore(); B3.tex.needsUpdate = true; } // 땅에 구덩이가 남는다
    }
    if (b.t > b.dur + 0.1) E.balls.splice(i, 1);
  }
}
// 적 일제 사격: 부족·고대·중세는 가까운 적 원거리병(없으면 적 거점) 쪽에서 화살/돌이 비처럼 쏟아진다 (바닥에 붉은 원 → 피하기)
// 근세는 영주 근처 적 머스킷병들이 한꺼번에 조준·발사 (연기 자욱)
function beVolley(H) {
  const E = B.eraFx, fe = beEra(BE_FOE);
  if (fe >= 3) {
    const ms = B.units.filter(u => u.team === 1 && !u.dead && (u.ut === 'musket' || u.ut === 'rifle') && u.windup <= 0 && dist2(u.x, u.y, H.x, H.y) < 330 * 330).slice(0, 8);
    if (ms.length < 3) { E.volT = 3; return; }
    ms.forEach((u, i) => { u.windup = 0.7 + i * 0.05; u.wkind = 'aim'; u.aimT = H; u.wdir = Math.atan2(H.y - u.y, H.x - u.x); u.atkT = 0; });
    floatText(ms[0].x, ms[0].y - 50, '일제 사격!', '#ffd0a0', 15);
    return;
  }
  let src = null, bd = 520 * 520;
  for (const u of B.units) if (u.team === 1 && !u.dead && u.role === 'ranged') { const d = dist2(u.x, u.y, H.x, H.y); if (d < bd && d > 120 * 120) { bd = d; src = u; } }
  if (!src) for (const b of B.bases) if (b.owner === 1) { const d = dist2(b.x, b.y, H.x, H.y); if (d < 650 * 650 && (!src || d < bd)) { bd = d; src = b; } }
  if (!src) { E.volT = 3; return; }
  const V = BE_VOL[fe], tx = H.x + rr(-30, 30), ty = H.y + rr(-24, 24);
  E.vol.push({ e: fe, x0: src.x, y0: src.y, tx, ty, R: V.R, n: V.n, t: 0, dur: 1.35, hit: false, seed: rand() * 1000 });
  floatText(src.x, src.y - 54, V.name, '#ffd0a0', 14);
}

// ---------- 3D: 하늘 · 빛 (b3Reset / b3Grade) ----------
const BE_ENV = [
  { bg: 0x98b49a, fog: 0xa4bc9c, sky: 0xd2ecc8, gnd: 0x3a4a28, hi: 0.62, sun: 0xffe2b4, si: 1.2, skirt: 0x3d5a2e, lift: [0.004, 0.012, 0.0], gain: [1.0, 1.04, 0.95], sat: 1.12, con: 1.05, rim: [0.8, 1.0, 0.7] },
  { bg: 0xd6b88c, fog: 0xd8be94, sky: 0xfff0d2, gnd: 0x6a5030, hi: 0.6, sun: 0xfff0d0, si: 1.42, skirt: 0x8a7a48, lift: [0.02, 0.012, 0.0], gain: [1.08, 1.01, 0.86], sat: 1.04, con: 1.06, rim: [1.0, 0.85, 0.6] },
  { bg: 0x8a5a58, fog: 0x9a6a60, sky: 0xb8a0c8, gnd: 0x3a2c22, hi: 0.55, sun: 0xffa868, si: 1.25, skirt: 0x35502f, lift: [0.014, 0.004, 0.024], gain: [1.05, 0.98, 0.9], sat: 1.14, con: 1.07, rim: [1.0, 0.72, 0.45] },
  { bg: 0x868a8e, fog: 0x93958f, sky: 0xd0d4d8, gnd: 0x3a3a32, hi: 0.72, sun: 0xfff0e2, si: 0.88, skirt: 0x4a5038, lift: [0.012, 0.012, 0.016], gain: [0.99, 0.98, 1.0], sat: 0.84, con: 1.1, rim: [0.8, 0.8, 0.85] },
  // 근대: 석탄 연기 낀 흐린 하늘 · 누런 잿빛 · 낮은 채도
  { bg: 0x7e7870, fog: 0x8a847a, sky: 0xccc4b6, gnd: 0x3a342a, hi: 0.74, sun: 0xffe6c8, si: 0.82, skirt: 0x4a4636, lift: [0.016, 0.012, 0.008], gain: [1.0, 0.97, 0.92], sat: 0.76, con: 1.12, rim: [0.85, 0.78, 0.7] },
];
function b3EraEnv() {
  const E = BE_ENV[clamp(S.era | 0, 0, ERAS.length - 1)], s = B3.scene;
  s.background.setHex(E.bg); s.fog.color.setHex(E.fog);
  B3.hemi.color.setHex(E.sky); B3.hemi.groundColor.setHex(E.gnd); B3.hemi.intensity = E.hi;
  B3.sun.color.setHex(E.sun); B3.sun.intensity = E.si;
  B3.skirt.material.color.setHex(E.skirt);
}
function b3EraGrade(G) {
  const E = BE_ENV[clamp(S.era | 0, 0, ERAS.length - 1)];
  G.lift.setRGB(E.lift[0], E.lift[1], E.lift[2]); G.gain.setRGB(E.gain[0], E.gain[1], E.gain[2]); G.sat = E.sat; G.contrast = E.con;
  if (R3D.uRim) R3D.uRim.value.setRGB(E.rim[0], E.rim[1], E.rim[2]).multiplyScalar(0.3);
}

// ---------- 3D: 꾸밈 모델 (절차적 · 버텍스 색) ----------
// 종류마다 [지오메트리, 진영색 물들임?, 그림자?]. 진영색 조각(천·지붕)은 흰색으로 만들고 인스턴스 색으로 물들인다
const BE_C = { wood: '#6a4a2a', dark: '#4a3420', hide: '#b48a5a', bronze: '#c08a38', iron: '#3c3c42', cloth: '#f4f0e6', stone: '#b8a078' };
function beGeo(kind) {
  const P = R3D.prim, M = R3D.merge;
  return R3D.cached('be|' + kind, () => {
    switch (kind) {
      case 'tent': return M([ // 가죽 원뿔 천막 + 장대
        { g: P.cone(0.85, 1.9, 8), c: BE_C.hide, p: [0, 0.95, 0] },
        { g: P.cone(0.3, 0.55, 3), c: '#3a2818', p: [0, 0.27, 0.68], s: [1, 1, 0.3] },
        { g: P.cyl(0.03, 0.03, 0.9, 4), c: BE_C.dark, p: [0.1, 2.0, 0], r: [0, 0, 0.3] }, { g: P.cyl(0.03, 0.03, 0.9, 4), c: BE_C.dark, p: [-0.1, 2.0, 0], r: [0, 0, -0.3] },
        { g: P.cyl(0.03, 0.03, 0.9, 4), c: BE_C.dark, p: [0, 2.0, 0.1], r: [0.3, 0, 0] },
        { g: P.box(0.5, 0.06, 0.04), c: '#a83a24', p: [0, 1.0, 0.5], r: [0.42, 0, 0] },
      ]);
      case 'totem': return M([
        { g: P.cyl(0.17, 0.2, 0.7, 6), c: '#7a4a28', p: [0, 0.35, 0] }, { g: P.box(0.38, 0.42, 0.38), c: '#a8402a', p: [0, 0.9, 0] },
        { g: P.box(0.08, 0.08, 0.04), c: '#f0e0b0', p: [0.09, 0.95, 0.2] }, { g: P.box(0.08, 0.08, 0.04), c: '#f0e0b0', p: [-0.09, 0.95, 0.2] },
        { g: P.cyl(0.16, 0.18, 0.5, 6), c: '#5a3a20', p: [0, 1.35, 0] }, { g: P.box(1.1, 0.12, 0.2), c: '#d8a838', p: [0, 1.55, 0] },
        { g: P.box(0.34, 0.36, 0.34), c: '#2a5a7a', p: [0, 1.82, 0] }, { g: P.ico(0.16, 0), c: '#ece2cc', p: [0, 2.12, 0] },
        { g: P.cone(0.05, 0.4, 4), c: '#f4ecd8', p: [0.12, 2.4, 0], r: [0, 0, -0.4] }, { g: P.cone(0.05, 0.4, 4), c: '#c03a24', p: [-0.12, 2.4, 0], r: [0, 0, 0.4] },
      ]);
      case 'rack': return M([
        { g: P.cyl(0.04, 0.05, 1.5, 4), c: BE_C.dark, p: [-0.6, 0.75, 0] }, { g: P.cyl(0.04, 0.05, 1.5, 4), c: BE_C.dark, p: [0.6, 0.75, 0] },
        { g: P.cyl(0.035, 0.035, 1.4, 4), c: BE_C.wood, p: [0, 1.4, 0], r: [0, 0, Math.PI / 2] },
        { g: P.box(0.55, 0.75, 0.03), c: '#c8a070', p: [-0.28, 0.98, 0] }, { g: P.box(0.45, 0.6, 0.03), c: '#9a7048', p: [0.3, 1.05, 0] },
      ]);
      case 'chariot': { const wh = (z) => ({ g: P.cyl(0.36, 0.36, 0.06, 10), c: '#5a3a1e', p: [-0.05, 0.36, z], r: [Math.PI / 2, 0, 0] });
        return M([
          { g: P.box(0.62, 0.42, 0.62), c: '#8a5a2a', p: [0, 0.62, 0] }, { g: P.box(0.66, 0.08, 0.66), c: BE_C.bronze, p: [0, 0.86, 0] },
          wh(0.36), wh(-0.36), { g: P.cyl(0.03, 0.03, 0.82, 4), c: BE_C.dark, p: [-0.05, 0.36, 0], r: [Math.PI / 2, 0, 0] },
          { g: P.cyl(0.03, 0.03, 1.3, 4), c: BE_C.wood, p: [0.9, 0.5, 0], r: [0, 0, Math.PI / 2 - 0.15] },
          { g: P.box(0.08, 0.06, 0.9), c: BE_C.wood, p: [1.5, 0.6, 0] },
        ]); }
      case 'standard': return M([
        { g: P.cyl(0.035, 0.04, 2.9, 5), c: BE_C.wood, p: [0, 1.45, 0] }, { g: P.cyl(0.24, 0.24, 0.04, 12), c: BE_C.bronze, p: [0, 2.85, 0], r: [Math.PI / 2, 0, 0] },
        { g: P.cone(0.09, 0.25, 4), c: BE_C.bronze, p: [0, 3.12, 0] }, { g: P.box(0.7, 0.05, 0.05), c: BE_C.bronze, p: [0, 2.45, 0] },
      ]);
      case 'standardC': return M([{ g: P.box(0.6, 0.7, 0.03), c: BE_C.cloth, p: [0, 2.07, 0.03] }]);
      case 'tentA': return M([ // 삼각 천막 (가로로 누운 삼각기둥)
        { g: P.cyl(0.85, 0.85, 1.9, 3), c: '#d8c8a2', p: [0, 0.43, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 1] },
        { g: P.box(0.05, 1.5, 0.05), c: BE_C.dark, p: [0.98, 0.75, 0] }, { g: P.box(0.05, 1.5, 0.05), c: BE_C.dark, p: [-0.98, 0.75, 0] },
      ]);
      case 'zigg': return M([ // 계단 신전
        { g: P.box(3.0, 0.55, 3.0), c: '#c8a46a', p: [0, 0.27, 0] }, { g: P.box(2.3, 0.55, 2.3), c: '#bc9860', p: [0, 0.82, 0] },
        { g: P.box(1.6, 0.55, 1.6), c: '#c8a46a', p: [0, 1.37, 0] }, { g: P.box(0.9, 0.6, 0.9), c: '#a8402a', p: [0, 1.95, 0] },
        { g: P.box(0.5, 1.7, 0.7), c: '#d4b47a', p: [0, 0.85, 1.4], r: [0.55, 0, 0] },
      ]);
      case 'pavilion': return M([ { g: P.cyl(0.85, 0.85, 1.0, 10), c: '#f2ece0', p: [0, 0.5, 0] }, { g: P.cyl(0.03, 0.03, 0.5, 4), c: BE_C.dark, p: [0, 2.0, 0] } ]);
      case 'pavilionR': return M([ { g: P.cone(1.02, 0.95, 10), c: BE_C.cloth, p: [0, 1.47, 0] }, { g: P.box(0.03, 0.18, 0.3), c: BE_C.cloth, p: [0, 2.2, 0.15] } ]);
      case 'banner': return M([ { g: P.cyl(0.035, 0.04, 3.2, 5), c: BE_C.wood, p: [0, 1.6, 0] }, { g: P.box(0.7, 0.05, 0.05), c: BE_C.dark, p: [0, 3.05, 0.05] }, { g: P.ico(0.07, 0), c: '#d8b040', p: [0, 3.25, 0] } ]);
      case 'bannerC': return M([ { g: P.box(0.6, 1.3, 0.03), c: BE_C.cloth, p: [0, 2.38, 0.07] }, { g: P.cone(0.3, 0.3, 3), c: BE_C.cloth, p: [0, 1.6, 0.07], r: [Math.PI, 0, 0], s: [1, 1, 0.1] } ]);
      case 'trebuchet': return M([
        { g: P.box(2.2, 0.16, 0.16), c: BE_C.wood, p: [0, 0.1, 0.55] }, { g: P.box(2.2, 0.16, 0.16), c: BE_C.wood, p: [0, 0.1, -0.55] },
        { g: P.box(0.14, 2.2, 0.14), c: BE_C.wood, p: [-0.35, 1.05, 0.5], r: [0, 0, -0.32] }, { g: P.box(0.14, 2.2, 0.14), c: BE_C.wood, p: [0.35, 1.05, 0.5], r: [0, 0, 0.32] },
        { g: P.box(0.14, 2.2, 0.14), c: BE_C.wood, p: [-0.35, 1.05, -0.5], r: [0, 0, -0.32] }, { g: P.box(0.14, 2.2, 0.14), c: BE_C.wood, p: [0.35, 1.05, -0.5], r: [0, 0, 0.32] },
        { g: P.cyl(0.06, 0.06, 1.2, 5), c: BE_C.dark, p: [0, 2.05, 0], r: [Math.PI / 2, 0, 0] },
        { g: P.box(3.6, 0.13, 0.13), c: '#7a5634', p: [0.5, 2.6, 0], r: [0, 0, 0.62] },
        { g: P.box(0.6, 0.6, 0.6), c: '#5a5652', p: [-0.95, 1.45, 0] },
        { g: P.cyl(0.01, 0.01, 0.9, 3), c: '#c8b890', p: [1.95, 3.25, 0] },
      ]);
      case 'ladder': return M([ // 성벽에 기댄 사다리 (+x 쪽으로 눕힘)
        { g: P.box(0.06, 2.6, 0.06), c: BE_C.wood, p: [0, 1.25, 0.22] }, { g: P.box(0.06, 2.6, 0.06), c: BE_C.wood, p: [0, 1.25, -0.22] },
        ...[0.3, 0.75, 1.2, 1.65, 2.1].map(y => ({ g: P.box(0.05, 0.05, 0.46), c: '#8a6a40', p: [0, y, 0] })),
      ]);
      case 'cannon': return M([ // +x 방향
        { g: P.cyl(0.12, 0.16, 1.25, 8), c: '#3e3c3a', p: [0.25, 0.48, 0], r: [0, 0, -Math.PI / 2 + 0.08] },
        { g: P.cyl(0.18, 0.18, 0.08, 8), c: '#2e2c2a', p: [-0.36, 0.43, 0], r: [0, 0, Math.PI / 2] },
        { g: P.box(0.9, 0.18, 0.34), c: '#6a4a2a', p: [-0.15, 0.32, 0] }, { g: P.box(1.0, 0.1, 0.12), c: '#5a3a20', p: [-0.8, 0.12, 0], r: [0, 0, 0.18] },
        { g: P.cyl(0.32, 0.32, 0.06, 12), c: '#5a3a1e', p: [0.0, 0.32, 0.25], r: [Math.PI / 2, 0, 0] }, { g: P.cyl(0.32, 0.32, 0.06, 12), c: '#5a3a1e', p: [0.0, 0.32, -0.25], r: [Math.PI / 2, 0, 0] },
        { g: P.ico(0.09, 0), c: '#222', p: [-0.4, 0.06, 0.45] }, { g: P.ico(0.09, 0), c: '#222', p: [-0.55, 0.06, 0.5] }, { g: P.ico(0.09, 0), c: '#222', p: [-0.47, 0.18, 0.47] },
      ]);
      case 'fieldgun': return w3dFieldGunGeo();
      case 'sandbag': { // 모래주머니 둑 (+x 방향으로 길게 · 3단)
        const L = [];
        for (let row = 0; row < 3; row++) for (let k = 0; k < 3 - (row === 2 ? 1 : 0); k++) L.push({ g: P.box(0.34, 0.15, 0.28), c: (row + k) % 2 ? '#a8966a' : '#9a8860', p: [-0.32 + k * 0.32 + (row % 2) * 0.16, 0.08 + row * 0.14, row * -0.02], r: [0, (k - 1) * 0.06, 0], s: [1, 1, 1] });
        return M(L);
      }
      case 'tpole': return M([ // 전신주 (가로대는 진행 방향에 수직)
        { g: P.cyl(0.045, 0.06, 3.0, 6), c: '#4a3a2a', p: [0, 1.5, 0] }, { g: P.box(0.06, 0.06, 0.9), c: '#4a3a2a', p: [0, 2.8, 0] },
        { g: P.cyl(0.03, 0.03, 0.08, 5), c: '#e8ecf0', p: [0, 2.87, 0.4] }, { g: P.cyl(0.03, 0.03, 0.08, 5), c: '#e8ecf0', p: [0, 2.87, -0.4] }, { g: P.cyl(0.03, 0.03, 0.08, 5), c: '#e8ecf0', p: [0, 2.87, 0.12] },
      ]);
      case 'wire': return M([ // 전선 두 가닥 (길이 1 → 인스턴스 배율로 늘임, 가운데가 살짝 처짐)
        { g: P.box(0.5, 0.012, 0.012), c: '#1a1a1a', p: [0.25, 2.88, 0.4], r: [0, 0, -0.05] }, { g: P.box(0.5, 0.012, 0.012), c: '#1a1a1a', p: [0.75, 2.88, 0.4], r: [0, 0, 0.05] },
        { g: P.box(0.5, 0.012, 0.012), c: '#1a1a1a', p: [0.25, 2.88, -0.4], r: [0, 0, -0.05] }, { g: P.box(0.5, 0.012, 0.012), c: '#1a1a1a', p: [0.75, 2.88, -0.4], r: [0, 0, 0.05] },
      ]);
      case 'gabion': return M([ { g: P.cyl(0.36, 0.34, 0.75, 8), c: '#8a7448', p: [0, 0.37, 0] }, { g: P.cyl(0.33, 0.33, 0.04, 8), c: '#4a3e2a', p: [0, 0.75, 0] } ]);
      case 'barrels': return M([
        { g: P.cyl(0.24, 0.24, 0.55, 8), c: '#6a4a2a', p: [0, 0.27, 0] }, { g: P.cyl(0.25, 0.25, 0.05, 8), c: '#2a2a2a', p: [0, 0.4, 0] },
        { g: P.cyl(0.24, 0.24, 0.55, 8), c: '#7a5432', p: [0.5, 0.27, 0.1] }, { g: P.cyl(0.25, 0.25, 0.05, 8), c: '#2a2a2a', p: [0.5, 0.15, 0.1] },
        { g: P.cyl(0.24, 0.24, 0.55, 8), c: '#6a4a2a', p: [0.25, 0.28, -0.35], r: [Math.PI / 2, 0, 0.3] },
      ]);
      case 'tentM': return M([ { g: P.cyl(0.8, 0.8, 0.55, 9), c: BE_C.cloth, p: [0, 0.27, 0] }, { g: P.cone(0.84, 1.15, 9), c: BE_C.cloth, p: [0, 1.12, 0] }, { g: P.box(0.32, 0.5, 0.04), c: '#3a3226', p: [0, 0.28, 0.79] } ]);
      case 'berm': { // 흙 보루 (길 쪽은 끊긴 둥근 둑)
        const arc = Math.PI - 0.9, t1 = new THREE.TorusGeometry(2.95, 0.5, 4, 14, arc), t2 = new THREE.TorusGeometry(2.95, 0.5, 4, 14, arc);
        return M([ { g: t1, c: '#6e6a44', p: [0, 0, 0], r: [-Math.PI / 2, 0, 0.45], s: [1, 1, 0.55] }, { g: t2, c: '#6e6a44', p: [0, 0, 0], r: [-Math.PI / 2, 0, Math.PI + 0.45], s: [1, 1, 0.55] } ]);
      }
    }
    return null;
  });
}
// 종류 → 그릴 조각들 [geo 이름, 진영색?, 크기]
const BE_PARTS = {
  tent: [['tent', 0, 1]], totem: [['totem', 0, 1]], rack: [['rack', 0, 1]],
  chariot: [['chariot', 0, 1]], standard: [['standard', 0, 1], ['standardC', 1, 1]], tentA: [['tentA', 0, 1]], zigg: [['zigg', 0, 1]],
  pavilion: [['pavilion', 0, 1], ['pavilionR', 1, 1]], banner: [['banner', 0, 1], ['bannerC', 1, 1]], trebuchet: [['trebuchet', 0, 1]], ladder: [['ladder', 0, 1]],
  cannon: [['cannon', 0, 1]], fieldgun: [['fieldgun', 0, 1]], sandbag: [['sandbag', 0, 1]], tpole: [['tpole', 0, 1]], wire: [['wire', 0, 1]], gabion: [['gabion', 0, 1]], barrels: [['barrels', 0, 1]], tentM: [['tentM', 2, 1]], berm: [['berm', 0, 1]],
};
const BE_TEAM = [new THREE.Color('#3a7ad8'), new THREE.Color('#c0392b')], beCol = new THREE.Color(), beW = new THREE.Color(1, 1, 1);
// 시대 꾸밈을 종류별 인스턴스로 (b3Scenery 끝에서). 대포는 쏠 때 방향이 바뀌므로 행렬을 다시 쓴다
function b3EraScenery(scen, sown) {
  const E = B && B.eraFx; if (!E) return;
  const D = B3.dummy, groups = {};
  const fcol = new THREE.Color(B.f.color === '#3a3a44' ? '#2a2a30' : B.f.color);
  E.deco.forEach((d, i) => { for (const [gk, tint, sc] of BE_PARTS[d.kind] || []) (groups[gk] || (groups[gk] = [])).push([d, tint, sc]); });
  B3.beCannon = [];
  // 야포병 곁 야포 (매 프레임 위치를 다시 쓴다)
  if (beEra(BE_ALLY) >= 4 || beEra(BE_FOE) >= 4 || B.units.some(u => u.ut === 'gun')) { const ug = new THREE.InstancedMesh(w3dFieldGunGeo(), R3D.mats.vc, 16); ug.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ug.frustumCulled = false; ug.castShadow = true; ug.count = 0; scen.add(ug); sown.push(ug); B3.beUGun = ug; } else B3.beUGun = null;
  for (const gk in groups) {
    const geo = beGeo(gk), L = groups[gk]; if (!geo) continue;
    const im = new THREE.InstancedMesh(geo, R3D.mats.vc, L.length);
    im.frustumCulled = false; im.castShadow = gk !== 'berm' && gk !== 'ladder' && gk !== 'wire' && gk !== 'sandbag'; im.receiveShadow = true;
    L.forEach(([d, tint, sc], k) => {
      beMat(D, d, gk, sc); im.setMatrixAt(k, D.matrix);
      if (tint) { beCol.copy(d.team === BE_ALLY ? BE_TEAM[0] : fcol); if (tint === 2) beCol.lerp(beW, 0.55); else beCol.multiplyScalar(1.15); im.setColorAt(k, beCol); }
      else { const v = 0.9 + (d.v % 4) * 0.05; beCol.setRGB(v, v, v); im.setColorAt(k, beCol); }
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scen.add(im); sown.push(im);
    if (gk === 'cannon' || gk === 'fieldgun') B3.beCannon.push({ im, gk, list: L.map(x => x[0]), ver: E.ver });
  }
}
function beMat(D, d, gk, sc) {
  const x = d.x / T, z = d.y / T;
  let ry = -(d.ry || 0), s = sc;
  if (gk === 'ladder') { D.position.set(x, 0, z); D.rotation.set(0, ry, 0.42, 'YXZ'); }
  else if (gk === 'wire') { D.position.set(x, 0, z); D.rotation.set(0, ry, 0, 'YXZ'); D.scale.set(d.len || 1, 1, 1); D.updateMatrix(); return; }
  else if (gk === 'cannon' || gk === 'fieldgun') { const k = d.kick || 0; D.position.set(x - Math.cos(d.ry) * k * 0.25, 0, z - Math.sin(d.ry) * k * 0.25); D.rotation.set(0, ry, 0, 'YXZ'); }
  else if (gk === 'tent' || gk === 'tentM' || gk === 'pavilion' || gk === 'pavilionR' || gk === 'totem') { D.position.set(x, 0, z); D.rotation.set(0, d.v * 0.7, 0, 'YXZ'); s *= 0.92 + (d.v % 3) * 0.06; }
  else if (gk === 'berm' || gk === 'zigg') { D.position.set(x, 0, z); D.rotation.set(0, 0, 0, 'YXZ'); }
  else { D.position.set(x, 0, z); D.rotation.set(0, ry, 0, 'YXZ'); }
  D.scale.setScalar(s); D.updateMatrix();
}

// ---------- 3D: 매 프레임 효과 (drawBattle3D 안) ----------
const BE_FLASH = new THREE.Color('#ffc870'), BE_FLASH2 = new THREE.Color('#ff9a40');
function b3EraFx(GL, PL) {
  const E = B && B.eraFx; if (!E) return;
  for (const C of B3.beCannon || []) { // 대포 반동 · 방향
    let moving = C.ver !== E.ver; C.ver = E.ver;
    for (const c of C.list) if (c.kick > 0 || c._k) { moving = true; c._k = c.kick > 0; }
    if (moving) { C.list.forEach((c, k) => { beMat(B3.dummy, c, C.gk, 1); C.im.setMatrixAt(k, B3.dummy.matrix); }); C.im.instanceMatrix.needsUpdate = true; }
  }
  const UG = B3.beUGun;
  if (UG) { // 야포병 앞 야포: 쏜 방향으로, 쏘면 뒤로 튐
    let n = 0; const D = B3.dummy;
    for (const u of B.units) {
      if (u.ut !== 'gun' || u.dead || n >= 16) continue;
      const a = u.gdir !== undefined ? u.gdir : u.team ? Math.PI : 0, k = Math.max(0, u.gkick || 0); u.gkick = k - 0.06;
      D.position.set((u.x + Math.cos(a) * (24 - k * 8)) / T, 0, (u.y + Math.sin(a) * (24 - k * 8)) / T); D.rotation.set(0, -a, 0, 'YXZ'); D.scale.setScalar(0.95); D.updateMatrix();
      UG.setMatrixAt(n++, D.matrix);
    }
    UG.count = n; UG.instanceMatrix.needsUpdate = true;
  }
  for (const f of E.fl) {
    const k = f.t / f.t0;
    GL.add(f.x / T, 0.55, f.y / T, f.s * (0.6 + 0.6 * k), BE_FLASH, 2.2 * k);
    PL.add(f.x / T, 0.02, f.y / T, f.s * 2.4, BE_FLASH2, 0.9 * k);
  }
}
// 2D 덧그림: 바닥 경고 원 · 날아가는 화살/돌/포탄
function b3EraOverlay(g, pr, ks, pk) {
  const E = B && B.eraFx; if (!E) return;
  const ring = (x, y, R, p, col) => {
    R3D.project(x / T, 0.03, y / T, pr); if (!pr.vis) return;
    const rx = R * pk, ry = rx * 0.6;
    g.globalAlpha = 0.18 + 0.3 * p; g.fillStyle = col; g.beginPath(); g.ellipse(pr.x, pr.y, rx, ry, 0, 0, 7); g.fill();
    g.globalAlpha = 0.85; g.strokeStyle = col; g.lineWidth = 2 * ks; g.beginPath(); g.ellipse(pr.x, pr.y, rx * (0.3 + 0.7 * p), ry * (0.3 + 0.7 * p), 0, 0, 7); g.stroke();
    g.beginPath(); g.ellipse(pr.x, pr.y, rx, ry, 0, 0, 7); g.stroke();
  };
  const P0 = {};
  for (const v of E.vol) {
    if (!v.hit) ring(v.tx, v.ty, v.R, clamp(v.t / v.dur, 0, 1), '#ff3a24');
    const V = BE_VOL[v.e];
    for (let i = 0; i < v.n; i++) {
      const h1 = Math.sin(v.seed + i * 12.9898) * 43758.5453, j1 = h1 - Math.floor(h1), h2 = Math.sin(v.seed + i * 78.233) * 12543.123, j2 = h2 - Math.floor(h2);
      const st = 0.25 + j1 * 0.15, p = clamp((v.t - st) / (v.dur - st), 0, 1); if (p <= 0 || p >= 1) continue;
      const a = j2 * 6.28, rr_ = Math.sqrt(j1) * v.R * 0.9;
      const sx = v.x0 + (j1 - 0.5) * 40, sy = v.y0 + (j2 - 0.5) * 30, ex = v.tx + Math.cos(a) * rr_, ey = v.ty + Math.sin(a) * rr_ * 0.8;
      const pos = q => [sx + (ex - sx) * q, sy + (ey - sy) * q, 0.6 + Math.sin(q * Math.PI) * 3.4];
      const [x1, y1, z1] = pos(p), [x0, y0, z0] = pos(Math.max(0, p - 0.05));
      R3D.project(x1 / T, z1, y1 / T, pr); if (!pr.vis) continue;
      const hx = pr.x, hy = pr.y;
      if (V.kind === 'stone') { g.globalAlpha = 1; g.fillStyle = '#6a665e'; g.beginPath(); g.arc(hx, hy, 3.2 * ks, 0, 7); g.fill(); continue; }
      R3D.project(x0 / T, z0, y0 / T, P0);
      const dx = hx - P0.x, dy = hy - P0.y, dl = Math.hypot(dx, dy) || 1, L = 13 * ks;
      g.globalAlpha = 1; g.strokeStyle = V.kind === 'bolt' ? '#2a2a30' : '#3a2412'; g.lineWidth = 1.8 * ks; g.lineCap = 'round';
      g.beginPath(); g.moveTo(hx - dx / dl * L, hy - dy / dl * L); g.lineTo(hx, hy); g.stroke();
      g.strokeStyle = '#eee'; g.lineWidth = 1.2 * ks; g.beginPath(); g.moveTo(hx - dx / dl * L, hy - dy / dl * L); g.lineTo(hx - dx / dl * L * 0.7, hy - dy / dl * L * 0.7); g.stroke();
    }
  }
  for (const b of E.balls) {
    const p = clamp(b.t / b.dur, 0, 1);
    if (b.team === BE_FOE && !b.hit) ring(b.tx, b.ty, b.R, p, '#ff5a1e');
    if (b.hit) continue;
    const x = b.x0 + (b.tx - b.x0) * p, y = b.y0 + (b.ty - b.y0) * p, z = 0.5 + Math.sin(p * Math.PI) * 4.2;
    R3D.project(x / T, 0.02, y / T, pr); if (pr.vis) { g.globalAlpha = 0.35; g.fillStyle = '#000'; g.beginPath(); g.ellipse(pr.x, pr.y, 5 * ks, 3 * ks, 0, 0, 7); g.fill(); }
    R3D.project(x / T, z, y / T, pr); if (!pr.vis) continue;
    g.globalAlpha = 1; g.fillStyle = '#18181a'; g.beginPath(); g.arc(pr.x, pr.y, 4.6 * ks, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(pr.x - 1.4 * ks, pr.y - 1.4 * ks, 1.6 * ks, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}
