'use strict';
// ===== 공용: 상수, 유틸, 화면, 입력, 파티클 =====
const T = 32;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
function mulberry(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = Math.random;
const ri = n => Math.floor(rand() * n);
const rr = (a, b) => a + rand() * (b - a);
const $ = id => document.getElementById(id);
function hash2(x, y) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

let MODE = 'world'; // 'world' | 'battle'
let paused = false;

// ---------- 화면 ----------
const cv = $('game'), ctx = cv.getContext('2d');
let VW = 0, VH = 0, DPR = 1, ZOOM = 1;
const resizeHooks = [];
function resize() {
  DPR = Math.min(2.5, window.devicePixelRatio || 1);
  VW = innerWidth; VH = innerHeight;
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  ZOOM = clamp(Math.min(VW, VH) / (11 * T), 0.9, 2.2);
  for (const f of resizeHooks) f();
}
addEventListener('resize', resize);

// ---------- 입력 ----------
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false, sx: 0, sy: 0, t0: 0, moved: false };
const keys = {};
const JR = 55;
// 터치는 처음엔 "대기" 상태: 10px 넘게 움직이거나 180ms 이상 누르고 있으면 조이스틱, 짧게 톡 치면 탭(tapHooks)
const tapHooks = [];
const pendTouch = new Map();
const TAP_MOVE = 10, TAP_HOLD = 180;
function promoteTouch(id) {
  const e = pendTouch.get(id); if (!e) return;
  clearTimeout(e.timer); pendTouch.delete(id);
  if (joy.id !== null || e.x >= VW * 0.62) return;
  joy.id = id; joy.ox = e.x; joy.oy = e.y; joy.x = 0; joy.y = 0; joy.active = true; joy.sx = e.x; joy.sy = e.y; joy.t0 = e.t; joy.moved = false;
}
function inputDown(id, x, y, ts) {
  const e = { x, y, t: ts || performance.now(), timer: 0 };
  if (x < VW * 0.62 && joy.id === null) e.timer = setTimeout(() => promoteTouch(id), TAP_HOLD);
  pendTouch.set(id, e);
}
function inputMove(id, x, y) {
  const e = pendTouch.get(id);
  if (e) {
    if (Math.hypot(x - e.x, y - e.y) <= TAP_MOVE) return;
    promoteTouch(id); pendTouch.delete(id); clearTimeout(e.timer);
  }
  if (id === joy.id) {
    if (Math.hypot(x - joy.sx, y - joy.sy) > TAP_MOVE) joy.moved = true;
    let dx = x - joy.ox, dy = y - joy.oy; const d = Math.hypot(dx, dy);
    if (d > JR) { joy.ox += dx * (1 - JR / d); joy.oy += dy * (1 - JR / d); dx = x - joy.ox; dy = y - joy.oy; }
    joy.x = dx / JR; joy.y = dy / JR;
  }
}
// 시간은 이벤트 타임스탬프로 잰다 (프레임이 느려 타이머가 먼저 돌아도 짧게 톡 친 건 탭으로 인정)
function inputUp(id, x, y, cancel, ts) {
  ts = ts || performance.now();
  const e = pendTouch.get(id);
  let tapped = false;
  if (e) {
    clearTimeout(e.timer); pendTouch.delete(id);
    if (!cancel && ts - e.t < 300 && Math.hypot(x - e.x, y - e.y) <= 14) tapped = true;
  }
  if (id === joy.id) {
    if (!cancel && !joy.moved && ts - joy.t0 < 300) tapped = true;
    joy.id = null; joy.active = false; joy.x = joy.y = 0;
  }
  if (tapped) for (const f of tapHooks) f(x, y);
}
cv.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) inputDown(t.identifier, t.clientX, t.clientY, e.timeStamp); }, { passive: false });
cv.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) inputMove(t.identifier, t.clientX, t.clientY); }, { passive: false });
cv.addEventListener('touchend', e => { for (const t of e.changedTouches) inputUp(t.identifier, t.clientX, t.clientY, false, e.timeStamp); });
cv.addEventListener('touchcancel', e => { for (const t of e.changedTouches) inputUp(t.identifier, t.clientX, t.clientY, true, e.timeStamp); });
let mouseDown = false;
cv.addEventListener('mousedown', e => { mouseDown = true; inputDown('m', e.clientX, e.clientY, e.timeStamp); });
addEventListener('mousemove', e => { if (mouseDown) inputMove('m', e.clientX, e.clientY); });
addEventListener('mouseup', e => { if (!mouseDown) return; mouseDown = false; inputUp('m', e.clientX, e.clientY, false, e.timeStamp); });
const keyHooks = [];
addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (keys[k]) return; keys[k] = true; for (const f of keyHooks) f(k, true); });
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys[k] = false; for (const f of keyHooks) f(k, false); });
function moveInput() {
  let mx = joy.x, my = joy.y;
  if (keys['a'] || keys['arrowleft']) mx -= 1; if (keys['d'] || keys['arrowright']) mx += 1;
  if (keys['w'] || keys['arrowup']) my -= 1; if (keys['s'] || keys['arrowdown']) my += 1;
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  return { x: mx, y: my, l: Math.min(1, l) };
}
function holdBtn(el, down, up) {
  el.addEventListener('touchstart', e => { e.preventDefault(); el.classList.add('on'); down(); }, { passive: false });
  el.addEventListener('touchend', e => { e.preventDefault(); el.classList.remove('on'); up && up(); });
  el.addEventListener('touchcancel', () => { el.classList.remove('on'); up && up(); });
  el.addEventListener('mousedown', e => { e.preventDefault(); down(); });
  el.addEventListener('mouseup', () => up && up());
  el.addEventListener('mouseleave', () => up && up());
}
function drawJoystick() {
  if (!joy.active) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JR, 0, 7); ctx.fill(); ctx.stroke();
  const g = ctx.createRadialGradient(joy.ox + joy.x * JR - 6, joy.oy + joy.y * JR - 6, 2, joy.ox + joy.x * JR, joy.oy + joy.y * JR, 24);
  g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,.3)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(joy.ox + joy.x * JR, joy.oy + joy.y * JR, 24, 0, 7); ctx.fill();
}

// ---------- 파티클 / 글자 / 흔들림 ----------
const parts = [];
function emit(x, y, n, o) {
  for (let i = 0; i < n; i++) {
    const a = o.ang !== undefined ? o.ang + rr(-(o.spread || 0.6), o.spread || 0.6) : rand() * Math.PI * 2;
    const s = rr(o.smin || 20, o.smax || 80);
    parts.push({ x: x + rr(-(o.jit || 0), o.jit || 0), y: y + rr(-(o.jit || 0), o.jit || 0), vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 0),
      life: rr(o.lmin || 0.3, o.lmax || 0.7), max: 0, size: rr(o.zmin || 2, o.zmax || 4), color: Array.isArray(o.color) ? o.color[ri(o.color.length)] : o.color,
      grav: o.grav || 0, drag: o.drag || 2, kind: o.kind || 'dot', grow: o.grow || 0 });
    parts[parts.length - 1].max = parts[parts.length - 1].life;
  }
  if (parts.length > 700) parts.splice(0, parts.length - 700);
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt); p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.size += p.grow * dt;
  }
}
function drawParts(g) {
  for (const p of parts) {
    const a = clamp(p.life / p.max, 0, 1);
    g.globalAlpha = p.kind === 'smoke' ? a * 0.45 : a;
    g.fillStyle = p.color;
    if (p.kind === 'spark') {
      g.strokeStyle = p.color; g.lineWidth = p.size * 0.6; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); g.stroke();
    } else if (p.kind === 'ring') {
      g.strokeStyle = p.color; g.lineWidth = 3 * a; g.beginPath(); g.arc(p.x, p.y, p.size, 0, 7); g.stroke();
    } else { g.beginPath(); g.arc(p.x, p.y, p.size, 0, 7); g.fill(); }
  }
  g.globalAlpha = 1;
}
const floats = [];
function floatText(x, y, s, c, size) { floats.push({ x, y, s, c, t: 1, size: size || 13, vy: -30 }); if (floats.length > 60) floats.shift(); }
function updateFloats(dt) { for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t -= dt; f.y += f.vy * dt; f.vy *= 0.96; if (f.t <= 0) floats.splice(i, 1); } }
function drawFloats(g) {
  g.textAlign = 'center';
  for (const f of floats) {
    g.globalAlpha = clamp(f.t * 1.6, 0, 1);
    const pop = f.t > 0.85 ? 1 + (f.t - 0.85) * 3 : 1;
    g.font = `900 ${Math.round(f.size * pop)}px system-ui, sans-serif`;
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(f.s, f.x, f.y); g.fillStyle = f.c; g.fillText(f.s, f.x, f.y);
  }
  g.globalAlpha = 1;
}
let shakeAmt = 0;
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

let toastT = 0;
function toast(html, sec) { const el = $('toast'); el.innerHTML = html; el.classList.add('show'); toastT = sec || 2.5; }
function tickToast(dt) { if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); } }
let bannerT = 0;
function banner(t, s, sec) { $('bannerT').textContent = t; $('bannerS').textContent = s || ''; $('banner').classList.add('show'); bannerT = sec || 2; }
function tickBanner(dt) { if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('show'); } }
