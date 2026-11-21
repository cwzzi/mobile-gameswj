'use strict';
// ===== 그래픽: 미리 그린 스프라이트, 캐릭터, 조명 =====
const SPR_SCALE = 2.5;
function sprite(w, h, ax, ay, fn) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * SPR_SCALE); c.height = Math.ceil(h * SPR_SCALE);
  const g = c.getContext('2d'); g.scale(SPR_SCALE, SPR_SCALE); fn(g);
  c.w = w; c.h = h; c.ax = ax; c.ay = ay; return c;
}
function blit(g, s, x, y, alpha) {
  if (alpha !== undefined) g.globalAlpha = alpha;
  g.drawImage(s, x - s.ax, y - s.ay, s.w, s.h);
  if (alpha !== undefined) g.globalAlpha = 1;
}
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = n >> 8 & 255, b = n & 255;
  if (k >= 1) { r += (255 - r) * (k - 1); gg += (255 - gg) * (k - 1); b += (255 - b) * (k - 1); } else { r *= k; gg *= k; b *= k; }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}
function blob(g, x, y, r, base) {
  const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
  gr.addColorStop(0, shadeHex(base, 1.28)); gr.addColorStop(0.55, base); gr.addColorStop(1, shadeHex(base, 0.7));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function vgrad(g, y0, y1, c0, c1) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; }
function hgrad(g, x0, x1, c0, c1) { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; }

const SPR = {};
function buildSprites() {
  // 활엽수
  const leaf = ['#3b8a35', '#2f7a3a', '#4a9430', '#357f2c', '#5a9a2c'];
  SPR.trees = leaf.map((c, k) => sprite(44, 54, 22, 50, g => {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(23, 50, 15, 5, 0, 0, 7); g.fill();
    g.fillStyle = hgrad(g, 18, 27, '#7a5232', '#4a2f1a'); rrect(g, 19, 30, 7, 21, 2); g.fill();
    blob(g, 22, 25, 15, shadeHex(c, 0.8));
    blob(g, 12 + k % 2, 29, 10, shadeHex(c, 0.88)); blob(g, 32 - k % 3, 29, 10, shadeHex(c, 0.85));
    blob(g, 22, 18, 13, c); blob(g, 15, 21, 8, c); blob(g, 29, 20, 8, shadeHex(c, 0.95));
    g.fillStyle = 'rgba(255,255,230,.18)'; g.beginPath(); g.arc(16, 12, 5, 0, 7); g.fill();
    if (k === 4) { g.fillStyle = '#e04a3a'; for (const [x, y] of [[14, 20], [27, 15], [31, 26], [20, 28]]) { g.beginPath(); g.arc(x, y, 1.8, 0, 7); g.fill(); } }
  }));
  // 침엽수
  SPR.pines = ['#2a6b3e', '#24603a', '#336f35'].map(c => sprite(36, 58, 18, 54, g => {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(19, 54, 12, 4, 0, 0, 7); g.fill();
    g.fillStyle = '#5a3a22'; g.fillRect(16, 44, 5, 11);
    for (let i = 0; i < 4; i++) {
      const y = 46 - i * 10, w = 16 - i * 3;
      g.fillStyle = hgrad(g, 18 - w, 18 + w, shadeHex(c, 1.15), shadeHex(c, 0.72));
      g.beginPath(); g.moveTo(18 - w, y); g.lineTo(18, y - 18); g.lineTo(18 + w, y); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(18, 6); g.lineTo(12, 20); g.lineTo(17, 18); g.fill();
  }));
  // 산
  const mtn = (gold, k) => sprite(44, 50, 22, 44, g => {
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(22, 44, 21, 5, 0, 0, 7); g.fill();
    const px = 20 + k * 3, py = 4 + k * 2;
    g.fillStyle = '#8a8c96'; g.beginPath(); g.moveTo(1, 44); g.lineTo(px, py); g.lineTo(43, 44); g.closePath(); g.fill();
    g.fillStyle = '#62646e'; g.beginPath(); g.moveTo(px, py); g.lineTo(43, 44); g.lineTo(px + 4, 44); g.closePath(); g.fill();
    g.fillStyle = '#a2a4ae'; g.beginPath(); g.moveTo(1, 44); g.lineTo(px, py); g.lineTo(px - 6, 44); g.closePath(); g.fill();
    g.fillStyle = '#f4f6fb'; g.beginPath(); g.moveTo(px - 7, py + 11); g.lineTo(px, py); g.lineTo(px + 6, py + 10); g.lineTo(px + 2, py + 13); g.lineTo(px - 2, py + 10); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,40,50,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px - 2, py + 18); g.lineTo(px - 8, py + 28); g.moveTo(px + 6, py + 22); g.lineTo(px + 10, py + 32); g.stroke();
    g.fillStyle = '#6a7a4a'; g.beginPath(); g.ellipse(8, 43, 6, 2.5, 0, 0, 7); g.ellipse(36, 43, 7, 2.5, 0, 0, 7); g.fill();
    if (gold) {
      for (const [x, y, r] of [[14, 32, 3], [22, 37, 2.5], [27, 29, 2.5], [18, 39, 2]]) {
        const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.4); gr.addColorStop(0, 'rgba(255,230,120,.7)'); gr.addColorStop(1, 'rgba(255,230,120,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.4, 0, 7); g.fill();
        g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = '#fff6c0'; g.fillRect(x - r * 0.5, y - r * 0.6, r * 0.6, r * 0.5);
      }
    }
  });
  SPR.mtn = [0, 1, 2].map(k => mtn(false, k));
  SPR.gold = [0, 1].map(k => mtn(true, k));
  // 건물
  SPR.house = sprite(36, 40, 18, 34, g => {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(19, 34, 16, 4, 0, 0, 7); g.fill();
    g.fillStyle = vgrad(g, 16, 34, '#f1e4c6', '#cdb98f'); g.fillRect(6, 16, 24, 18);
    g.fillStyle = '#6b4a2e'; g.fillRect(6, 16, 24, 2); g.fillRect(6, 16, 2, 18); g.fillRect(28, 16, 2, 18); g.fillRect(17, 16, 2, 18);
    g.fillStyle = '#5b3a20'; rrect(g, 20, 24, 6, 10, 2); g.fill();
    g.fillStyle = '#ffe9a0'; g.fillRect(10, 21, 5, 5); g.fillStyle = '#6b4a2e'; g.fillRect(12, 21, 1, 5); g.fillRect(10, 23, 5, 1);
    g.fillStyle = '#7a7a80'; g.fillRect(25, 2, 4, 9);
    g.fillStyle = vgrad(g, 3, 17, '#d0583a', '#8e2f1f'); g.beginPath(); g.moveTo(2, 18); g.lineTo(18, 3); g.lineTo(34, 18); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 0.8; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(6 + i * 2, 15 - i * 3); g.lineTo(30 - i * 2, 15 - i * 3); g.stroke(); }
  });
  SPR.farm = sprite(36, 32, 18, 30, g => {
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(2, 28, 33, 3);
    g.fillStyle = '#8a6438'; rrect(g, 2, 4, 32, 25, 3); g.fill();
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#6f4e2a'; g.fillRect(4, 7 + i * 6, 28, 3);
      for (let j = 0; j < 7; j++) { g.fillStyle = (i + j) % 3 ? '#e8c547' : '#9cc94a'; g.beginPath(); g.arc(6 + j * 4, 7 + i * 6, 1.8, 0, 7); g.fill(); }
    }
    g.strokeStyle = '#5a3a20'; g.lineWidth = 1.2; rrect(g, 2, 4, 32, 25, 3); g.stroke();
  });
  SPR.tower = sprite(28, 60, 14, 56, g => {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(15, 56, 12, 4, 0, 0, 7); g.fill();
    g.fillStyle = hgrad(g, 6, 22, '#b5b5bc', '#76767e'); g.fillRect(6, 18, 16, 38);
    g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 0.8; for (let y = 22; y < 56; y += 5) { g.beginPath(); g.moveTo(6, y); g.lineTo(22, y); g.stroke(); }
    g.fillStyle = hgrad(g, 3, 25, '#c2c2c8', '#7f7f88'); g.fillRect(3, 12, 22, 8);
    for (let i = 0; i < 4; i++) g.fillRect(3 + i * 6, 7, 4, 6);
    g.fillStyle = '#222'; rrect(g, 12, 26, 4, 7, 2); g.fill();
    g.fillStyle = '#4a3a2a'; g.fillRect(13, 0, 1.5, 9);
  });
  SPR.market = sprite(38, 36, 19, 32, g => {
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(19, 32, 17, 4, 0, 0, 7); g.fill();
    g.fillStyle = '#7a5230'; g.fillRect(6, 13, 2, 19); g.fillRect(30, 13, 2, 19);
    g.fillStyle = vgrad(g, 20, 32, '#a0703e', '#6b4624'); g.fillRect(5, 21, 28, 11);
    g.fillStyle = '#e8c547'; g.beginPath(); g.arc(13, 20, 3, 0, 7); g.arc(19, 19, 3, 0, 7); g.fill(); g.fillStyle = '#d9483b'; g.beginPath(); g.arc(25, 20, 3, 0, 7); g.fill();
    for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#fdf6e8' : '#d9483b'; g.beginPath(); g.moveTo(3 + k * 5.4, 15); g.lineTo(5 + k * 5.4, 6); g.lineTo(10.4 + k * 5.4, 6); g.lineTo(8.4 + k * 5.4, 15); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(3, 14, 33, 2);
  });
  SPR.castle = [1, 2, 3, 4, 5].map(lv => {
    const w = 44 + lv * 8, h = 40 + lv * 8;
    return sprite(w + 8, h + 10, (w + 8) / 2, h + 4, g => {
      const cx = (w + 8) / 2, base = h + 4;
      g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(cx + 2, base, w / 2 + 2, 6, 0, 0, 7); g.fill();
      const stone = (x, y, ww, hh) => {
        g.fillStyle = vgrad(g, y, y + hh, '#efe6d2', '#b9ab8c'); g.fillRect(x, y, ww, hh);
        g.strokeStyle = 'rgba(80,60,40,.18)'; g.lineWidth = 0.7;
        for (let yy = y + 5; yy < y + hh; yy += 5) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + ww, yy); g.stroke(); }
        g.fillStyle = '#d8ccb0'; for (let xx = x; xx < x + ww - 2; xx += 5) g.fillRect(xx, y - 4, 3.2, 4);
      };
      const wallH = 14 + lv * 2;
      // 성채(가운데)
      if (lv >= 3) {
        const kw = 16 + lv * 2, kh = h - 10;
        stone(cx - kw / 2, base - kh, kw, kh - wallH + 4);
        g.fillStyle = '#3a2a1a'; rrect(g, cx - 2.5, base - kh + 8, 5, 7, 2); g.fill();
        if (lv >= 4) { g.fillStyle = vgrad(g, base - kh - 16, base - kh, '#5a86d8', '#2a4c8e'); g.beginPath(); g.moveTo(cx - kw / 2 - 2, base - kh - 2); g.lineTo(cx, base - kh - 18 - lv); g.lineTo(cx + kw / 2 + 2, base - kh - 2); g.fill(); }
      }
      // 성벽
      stone(cx - w / 2 + 6, base - wallH, w - 12, wallH);
      g.fillStyle = '#3f2c1a'; g.beginPath(); g.moveTo(cx - 6, base); g.lineTo(cx - 6, base - 8); g.arc(cx, base - 8, 6, Math.PI, 0); g.lineTo(cx + 6, base); g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = -4; i <= 4; i += 2.5) g.fillRect(cx + i - 0.4, base - 13, 0.8, 13);
      // 망루
      if (lv >= 2) {
        const th = wallH + 10 + lv * 2;
        for (const sx of [-1, 1]) {
          const x = cx + sx * (w / 2 - 4) - 7;
          stone(x, base - th, 14, th);
          g.fillStyle = '#222'; rrect(g, x + 5.5, base - th + 6, 3, 5, 1.5); g.fill();
          if (lv >= 4) { g.fillStyle = vgrad(g, base - th - 14, base - th, '#5a86d8', '#2a4c8e'); g.beginPath(); g.moveTo(x - 2, base - th - 3); g.lineTo(x + 7, base - th - 16); g.lineTo(x + 16, base - th - 3); g.fill(); }
        }
      }
      if (lv === 5) { g.fillStyle = '#ffd34d'; g.fillRect(cx - w / 2 + 6, base - wallH - 1, w - 12, 1.5); }
    });
  });
  SPR.tent = sprite(56, 46, 26, 40, g => {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(27, 40, 25, 6, 0, 0, 7); g.fill();
    g.fillStyle = vgrad(g, 6, 40, '#8e2b23', '#4a1410'); g.beginPath(); g.moveTo(3, 40); g.lineTo(26, 6); g.lineTo(50, 40); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(26, 6); g.lineTo(50, 40); g.lineTo(36, 40); g.closePath(); g.fill();
    g.fillStyle = '#d9b36a'; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(26, 6); g.lineTo(12 + i * 13, 40); g.lineTo(14 + i * 13, 40); g.closePath(); g.fill(); }
    g.fillStyle = '#1a0806'; g.beginPath(); g.moveTo(19, 40); g.lineTo(26, 20); g.lineTo(33, 40); g.closePath(); g.fill();
    g.fillStyle = '#4a3020'; g.fillRect(25.3, 0, 1.6, 8);
    g.fillStyle = '#6b4a2a'; rrect(g, 44, 31, 9, 9, 1); g.fill(); g.strokeStyle = '#3a2412'; g.lineWidth = 0.8; g.strokeRect(44, 31, 9, 9);
  });
  SPR.palisade = sprite(14, 26, 7, 24, g => {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(1, 22, 13, 3);
    for (let i = 0; i < 3; i++) { g.fillStyle = hgrad(g, i * 4.5, i * 4.5 + 4.5, '#9a6b3c', '#5e3c1e'); g.beginPath(); g.moveTo(i * 4.5, 24); g.lineTo(i * 4.5, 4 + i % 2 * 2); g.lineTo(i * 4.5 + 2.25, 0 + i % 2 * 2); g.lineTo(i * 4.5 + 4.5, 4 + i % 2 * 2); g.lineTo(i * 4.5 + 4.5, 24); g.fill(); }
  });
  SPR.rock = [0, 1].map(k => sprite(34, 26, 17, 22, g => {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(17, 22, 16, 4, 0, 0, 7); g.fill();
    blob(g, 13, 15, 10, '#8d8f96'); blob(g, 22, 16, 8 + k * 2, '#7a7c84'); blob(g, 16, 11, 6, '#a0a2a9');
  }));
}

// 펄럭이는 깃발
function drawFlag(g, x, y, col, t, size) {
  const s = size || 1;
  g.fillStyle = '#3a2a1a'; g.fillRect(x - 0.8 * s, y - 22 * s, 1.6 * s, 22 * s);
  g.fillStyle = col; g.beginPath(); g.moveTo(x + 0.8 * s, y - 22 * s);
  for (let i = 0; i <= 6; i++) g.lineTo(x + 0.8 * s + i * 2.2 * s, y - 22 * s + Math.sin(t * 6 + i * 0.9) * 1.4 * s * (i / 6));
  for (let i = 6; i >= 0; i--) g.lineTo(x + 0.8 * s + i * 2.2 * s, y - 13 * s + Math.sin(t * 6 + i * 0.9) * 1.4 * s * (i / 6));
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x + 0.8 * s, y - 22 * s, 13 * s, 2 * s);
}
function drawFire(g, x, y, t, s) {
  s = s || 1;
  g.fillStyle = '#4a3020'; g.save(); g.translate(x, y); g.rotate(0.4); g.fillRect(-7 * s, -1.5 * s, 14 * s, 3 * s); g.rotate(-0.8); g.fillRect(-7 * s, -1.5 * s, 14 * s, 3 * s); g.restore();
  const f = 1 + Math.sin(t * 14) * 0.12 + Math.sin(t * 23) * 0.08;
  const gr = g.createRadialGradient(x, y - 3 * s, 0, x, y - 3 * s, 9 * s * f);
  gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.35, '#ffb02e'); gr.addColorStop(0.7, 'rgba(240,80,20,.8)'); gr.addColorStop(1, 'rgba(240,80,20,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(x - 6 * s, y); g.quadraticCurveTo(x - 5 * s, y - 8 * s * f, x, y - 14 * s * f); g.quadraticCurveTo(x + 5 * s, y - 8 * s * f, x + 6 * s, y); g.closePath(); g.fill();
}

// ---------- 사람 ----------
// o: face(1|-1), up, walk, aim, body, trim, legs, skin, hair, hat, helm, plume, weapon, scale, flash, cape, z, armor
function drawHuman(g, x, y, o) {
  const s = o.scale || 1, face = o.face || 1, walk = o.walk || 0, up = !!o.up, fl = o.flash;
  const C = c => fl ? '#ffffff' : c;
  g.save(); g.translate(x, y); g.scale(s, s);
  if (!o.noShadow) { g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(0, 0, 9, 3.5, 0, 0, 7); g.fill(); }
  if (o.z) g.translate(0, -o.z);
  if (o.rot) g.rotate(o.rot);
  const aim = o.aim !== undefined ? o.aim : (face > 0 ? 0.3 : Math.PI - 0.3);
  const hx = Math.cos(aim) * 9, hy = -14 + Math.sin(aim) * 6;
  const behind = Math.sin(aim) < -0.25 || up;
  const weapon = () => {
    if (!o.weapon) return;
    const ca = Math.cos(aim), sa = Math.sin(aim);
    g.save(); g.translate(hx, hy); g.rotate(aim);
    if (o.weapon === 'sword') {
      g.fillStyle = C('#5a3a20'); g.fillRect(-4, -1.2, 5, 2.4);
      g.fillStyle = C('#d9b44a'); g.fillRect(0, -3.5, 2, 7);
      g.fillStyle = C('#e6ecf2'); g.beginPath(); g.moveTo(2, -1.8); g.lineTo(19, -1.2); g.lineTo(22, 0); g.lineTo(19, 1.2); g.lineTo(2, 1.8); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(3, -0.6, 15, 0.8);
    } else if (o.weapon === 'spear') {
      g.fillStyle = C('#7a5230'); g.fillRect(-12, -1, 36, 2);
      g.fillStyle = C('#dfe5ea'); g.beginPath(); g.moveTo(24, -2.6); g.lineTo(31, 0); g.lineTo(24, 2.6); g.closePath(); g.fill();
      g.fillStyle = C(o.plume || '#c22'); g.fillRect(21, -2, 2, 4);
    } else if (o.weapon === 'glaive') {
      g.fillStyle = C('#3a2a1a'); g.fillRect(-14, -1.2, 40, 2.4);
      g.fillStyle = C('#e8eef4'); g.beginPath(); g.moveTo(22, -1); g.quadraticCurveTo(34, -10, 38, 0); g.quadraticCurveTo(32, 3, 22, 2); g.closePath(); g.fill();
      g.fillStyle = C('#d9b44a'); g.fillRect(20, -2.5, 2.5, 5);
    } else if (o.weapon === 'axe') {
      g.fillStyle = C('#6b4a2a'); g.fillRect(-4, -1, 20, 2);
      g.fillStyle = C('#c9ced4'); g.beginPath(); g.moveTo(12, -1); g.quadraticCurveTo(15, -8, 19, -7); g.lineTo(18, 5); g.quadraticCurveTo(15, 5, 12, 1); g.closePath(); g.fill();
    } else if (o.weapon === 'club') {
      g.fillStyle = C('#7a5230'); g.beginPath(); g.moveTo(-2, -1.2); g.lineTo(14, -3); g.lineTo(15, 3); g.lineTo(-2, 1.2); g.fill();
    }
    g.restore();
    // 팔
    g.strokeStyle = C(o.body); g.lineWidth = 3.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(ca > 0 ? 4 : -4, -18); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = C(o.skin || '#f0c597'); g.beginPath(); g.arc(hx, hy, 2.2, 0, 7); g.fill();
  };
  // 다리
  const l1 = Math.sin(walk) * 2.2;
  g.fillStyle = C(o.legs || '#3b3127');
  rrect(g, -5, -9 - Math.max(0, l1), 4, 9, 1.5); g.fill();
  rrect(g, 1, -9 - Math.max(0, -l1), 4, 9, 1.5); g.fill();
  // 망토(뒤)
  if (o.cape && !up) { g.fillStyle = C(shadeHex(o.cape, 0.8)); g.beginPath(); g.moveTo(-7, -20); g.lineTo(-9 - face * 1, -4); g.lineTo(9 - face * 1, -4); g.lineTo(7, -20); g.fill(); }
  if (behind) weapon();
  // 몸통
  g.fillStyle = fl ? '#fff' : vgrad(g, -22, -7, shadeHex(o.body, 1.18), shadeHex(o.body, 0.78));
  rrect(g, -7, -22, 14, 14, 4.5); g.fill();
  g.fillStyle = C(o.trim || '#3a2a1a'); g.fillRect(-7, -11, 14, 2.2);
  if (o.armor) { g.fillStyle = C(o.trim || '#888'); g.beginPath(); g.arc(-6.5, -19, 3.6, 0, 7); g.arc(6.5, -19, 3.6, 0, 7); g.fill(); }
  if (o.cape && up) { g.fillStyle = C(o.cape); g.beginPath(); g.moveTo(-7.5, -21); g.quadraticCurveTo(0, -23, 7.5, -21); g.lineTo(9, -3 + Math.sin(walk) * 1); g.lineTo(-9, -3 - Math.sin(walk) * 1); g.closePath(); g.fill(); }
  // 머리
  g.fillStyle = C(o.skin || '#f0c597'); g.beginPath(); g.arc(0, -28, 6.5, 0, 7); g.fill();
  g.fillStyle = C(o.hair || '#3a2414');
  if (up) { g.beginPath(); g.arc(0, -28, 6.6, 0, 7); g.fill(); }
  else { g.beginPath(); g.arc(0, -29.5, 6.6, Math.PI * 1.02, Math.PI * 1.98); g.fill(); g.fillStyle = '#1a1a1a'; g.fillRect(face * 1.5 - 3.2, -28.5, 1.6, 2.2); g.fillRect(face * 1.5 + 1.6, -28.5, 1.6, 2.2); }
  const hat = o.hat;
  if (hat === 'crown') {
    g.fillStyle = C('#f2c14e'); g.beginPath(); g.moveTo(-5.5, -33); g.lineTo(-5.5, -38); g.lineTo(-3, -35.5); g.lineTo(0, -39.5); g.lineTo(3, -35.5); g.lineTo(5.5, -38); g.lineTo(5.5, -33); g.closePath(); g.fill();
    g.fillStyle = '#d9483b'; g.fillRect(-1, -35.5, 2, 2);
  } else if (hat === 'helm' || hat === 'horned') {
    g.fillStyle = fl ? '#fff' : vgrad(g, -36, -27, shadeHex(o.helm || '#777', 1.3), shadeHex(o.helm || '#777', 0.75));
    g.beginPath(); g.arc(0, -29.5, 7.2, Math.PI, 0); g.lineTo(7.2, -27); g.lineTo(-7.2, -27); g.closePath(); g.fill();
    if (hat === 'horned') { g.fillStyle = C('#e8e0c8'); g.beginPath(); g.moveTo(-6, -32); g.quadraticCurveTo(-12, -36, -10, -44); g.quadraticCurveTo(-8, -37, -3, -35); g.fill(); g.beginPath(); g.moveTo(6, -32); g.quadraticCurveTo(12, -36, 10, -44); g.quadraticCurveTo(8, -37, 3, -35); g.fill(); }
    else if (o.plume) { g.fillStyle = C(o.plume); g.beginPath(); g.moveTo(-1, -36); g.quadraticCurveTo(-face * 8, -42, -face * 10, -33); g.quadraticCurveTo(-face * 4, -37, 1, -35); g.fill(); }
  } else if (hat === 'band') {
    g.fillStyle = C(o.helm || '#c22'); g.fillRect(-6.6, -32, 13.2, 2.4); g.fillRect(-face * 6 - 1, -32, 2, 6);
  } else if (hat === 'hood') {
    g.fillStyle = C(o.helm || '#4a3a2a'); g.beginPath(); g.arc(0, -29, 7.4, Math.PI * 0.95, Math.PI * 2.05); g.fill();
  }
  if (!behind) weapon();
  g.restore();
}

function drawHorse(g, x, y, face, walk, ridden, col) {
  col = col || '#8b5a2b';
  g.save(); g.translate(x, y); g.scale(face, 1);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(0, 1, 16, 4.5, 0, 0, 7); g.fill();
  const l = Math.sin(walk) * 3;
  g.fillStyle = shadeHex(col, 0.7);
  for (const [lx, ph] of [[-10, l], [-6, -l], [7, -l], [11, l]]) { rrect(g, lx - 1.5, -10, 3, 10 - Math.max(0, ph) * 0.5, 1); g.fill(); }
  g.fillStyle = vgrad(g, -20, -6, shadeHex(col, 1.2), shadeHex(col, 0.8));
  g.beginPath(); g.ellipse(0, -13, 14, 7, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(9, -16); g.lineTo(15, -27); g.lineTo(21, -24); g.lineTo(14, -12); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(19, -25, 6, 3.6, 0.5, 0, 7); g.fill();
  g.fillStyle = '#2a1a0e'; g.beginPath(); g.moveTo(9, -18); g.lineTo(14, -29); g.lineTo(16, -27); g.lineTo(12, -16); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-13, -15); g.quadraticCurveTo(-21, -12 + Math.sin(walk * 0.5) * 2, -18, -3); g.lineTo(-15, -12); g.fill();
  g.fillStyle = '#111'; g.fillRect(19, -27, 1.4, 1.4);
  if (ridden) { g.fillStyle = '#6b2a1f'; rrect(g, -6, -21, 12, 6, 2); g.fill(); g.fillStyle = '#d9b44a'; g.fillRect(-1, -16, 2, 5); }
  g.restore();
}

// ---------- 조명/화면 효과 ----------
const lc = document.createElement('canvas'), lctx = lc.getContext('2d');
resizeHooks.push(() => { lc.width = Math.ceil(VW / 2); lc.height = Math.ceil(VH / 2); });
// lights: [{x,y,r,k}] 화면 좌표
function drawLighting(dark, tint, lights) {
  if (dark <= 0.01) return;
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, lc.width, lc.height);
  lctx.fillStyle = tint; lctx.globalAlpha = dark; lctx.fillRect(0, 0, lc.width, lc.height); lctx.globalAlpha = 1;
  lctx.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    const x = L.x / 2, y = L.y / 2, r = L.r / 2;
    if (x < -r || y < -r || x > lc.width + r || y > lc.height + r) continue;
    const gr = lctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${L.k || 1})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = gr; lctx.beginPath(); lctx.arc(x, y, r, 0, 7); lctx.fill();
  }
  lctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(lc, 0, 0, cv.width, cv.height);
  // 불빛 주변 따뜻한 빛
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    if (!L.warm) continue;
    const gr = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 0.55);
    gr.addColorStop(0, `rgba(255,170,70,${0.22 * dark})`); gr.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(L.x, L.y, L.r * 0.55, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawVignette(strength, color) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const r = Math.hypot(VW, VH) / 2;
  const gr = ctx.createRadialGradient(VW / 2, VH / 2, r * 0.55, VW / 2, VH / 2, r);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, color || `rgba(0,0,0,${strength})`);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, VH);
}
