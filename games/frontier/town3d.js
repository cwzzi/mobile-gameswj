'use strict';
// ===== town3d.js: 마을 내부 전용 실사 3D 거리 씬 (1단위 = 1m) =====
// 오버월드에서 내 마을에 들어가면 MODE = 'town' 으로 전환되어,
// 해당 마을의 시대(0~4) · 레벨(1~5) · 지은 건물 목록 · 인구 · 현재 시각(낮/노을/밤)에 맞춰
// 실제 1m 스케일의 대로 · 보도 · 광장 · 상가 · 간판 · 노점 · 움직이는 탈것 · 행인을 생성한다.
//
// 마을 내 게임성 루프:
//   · 포장마차/주막: 체력 회복 + 3분 공격력(+25%) 또는 이동속도(+22%) 버프 (전장·들판 연동)
//   · 대장간: 나무·돌·금으로 영주 무기·갑옷·군마 영구 강화 (전장·들판 연동)
//   · 주민 ❗ 민원: 투자·세금·장인 영입(영구 생산력↑)·축제 선택지
//   · 숨겨진 황금 보물: 골목·광장 구석에 숨겨진 보물 찾기 (금화 + 경험치)
//   · 마을 순시 민심: 주민 2명 이상 대화 또는 민원 해결 → 4분간 마을 세금 +25%
//   · 말 타고 산책: 기마 상태로 진입하거나 마구간 보유 시 대로에서 승마/하마 가능
let T3 = null;

const T3_ERA_CFG = [
  { // 0: 부족 시대
    roadBg: '#8c6f4b', sideBg: '#7a6343', curb: '#6a5236', wall: '#5e442a',
    shops: ['물물교환', '가죽 작업장', '토기 가마', '사냥꾼 숙소', '곡물 창고', '주술사 천막'],
    stallKind: 'tribal', lampH: 2.6, lampCol: '#ff7024', lampFire: true,
    storyMin: 1, storyMax: 1, tavernName: '모닥불 화덕',
    foodA: ['약초 구이', '체력 완전 회복 · 3분간 이동속도 +22%'],
    foodB: ['멧돼지 통구이', '체력 완전 회복 · 3분간 공격력 +25%'],
  },
  { // 1: 고대 왕국
    roadBg: '#b89f74', sideBg: '#cab690', curb: '#9c8660', wall: '#b8a07a',
    shops: ['청동 공방', '토기 상점', '향신료 상회', '곡물 창고', '서생 학사', '여관 주막', '직물 공방', '포도주 가게'],
    stallKind: 'ancient', lampH: 3.0, lampCol: '#ff8a34', lampFire: true,
    storyMin: 1, storyMax: 2, tavernName: '고대 주막',
    foodA: ['보리빵과 포도주', '체력 완전 회복 · 3분간 이동속도 +22%'],
    foodB: ['향신료 양고기', '체력 완전 회복 · 3분간 공격력 +25%'],
  },
  { // 2: 중세
    roadBg: '#6c6a66', sideBg: '#9a958b', curb: '#7d7870', wall: '#8f8b82',
    shops: ['황금사자 여관', '왕실 빵집', '갑옷 공방', '포목 상회', '약초방', '길드 회관', '마구 상점', '주막', '제화점', '양초 공방'],
    stallKind: 'medieval', lampH: 3.3, lampCol: '#ff963c', lampFire: false,
    storyMin: 2, storyMax: 3, tavernName: '황금사자 주막',
    foodA: ['따끈한 벌꿀주', '체력 완전 회복 · 3분간 이동속도 +22%'],
    foodB: ['기사의 쇠고기 스튜', '체력 완전 회복 · 3분간 공격력 +25%'],
  },
  { // 3: 근세
    roadBg: '#575a60', sideBg: '#a6a198', curb: '#78746c', wall: '#a29a8e',
    shops: ['황제 상회', '인쇄소', '시계방', '서점', '포목점', '제과점', '약국', '항해 기구상', '여관', '총포방'],
    stallKind: 'early', lampH: 3.7, lampCol: '#ffa64e', lampFire: false,
    storyMin: 2, storyMax: 4, tavernName: '국밥 · 주막',
    foodA: ['진한 커피와 빵', '체력 완전 회복 · 3분간 이동속도 +22%'],
    foodB: ['장군 특선 스테이크', '체력 완전 회복 · 3분간 공격력 +25%'],
  },
  { // 4: 근대 (서울 러시 감성)
    roadBg: '#3b3e44', sideBg: '#9a9da2', curb: '#7c8088', wall: '#8a5240',
    shops: ['종로 상회', '국밥집', '양복점', '제과점', '다방', '서적상', '시계포', '사진관', '약방', '전당포', '포목상', '이발소'],
    stallKind: 'pojang', lampH: 4.1, lampCol: '#ffd898', lampFire: false,
    storyMin: 3, storyMax: 5, tavernName: '종로 포장마차',
    foodA: ['뜨끈한 어묵 · 국수', '체력 완전 회복 · 3분간 이동속도 +22%'],
    foodB: ['특선 설렁탕 · 한잔', '체력 완전 회복 · 3분간 공격력 +25%'],
  },
];

const T3_FAC_INFO = {
  keep: { name: '영주관 · 성채', icon: '🏰', badge: '성', col: '#f2c14e', act: 'build', label: '마을 관리 · 건설' },
  smith: { name: '대장간', icon: '🔨', badge: '장', col: '#ff944d', act: 'smith', label: '영주 장비 강화' },
  tavern: { name: '포장마차 · 주막', icon: '🍲', badge: '식', col: '#ffaa44', act: 'tavern', label: '식사 · 버프 받기' },
  school: { name: '학당', icon: '🔬', badge: '학', col: '#7cc0ff', act: 'tech', label: '기술 연구' },
  barracks: { name: '병영', icon: '⚔️', badge: '병', col: '#ff8a7a', act: 'army', label: '군대 훈련 · 주둔' },
  range: { name: '궁술장', icon: '🎯', badge: '궁', col: '#ff9a6a', act: 'army', label: '원거리병 훈련' },
  stable: { name: '마구간', icon: '🐴', badge: '마', col: '#d8a66a', act: 'army', label: '기병 훈련' },
  market: { name: '장터 · 상회', icon: '🏪', badge: '시', col: '#ffd54a', act: 'build', label: '마을 현황 보기' },
  factory: { name: '증기 공장', icon: '🏭', badge: '공', col: '#90c8c0', act: 'army', label: '야포 · 군대 관리' },
  board: { name: '마을 소식판', icon: '📜', badge: '소', col: '#ffe27a', act: 'board', label: '소식 · 의뢰 보기' },
  gate: { name: '남문 (출구)', icon: '🚪', badge: '문', col: '#8fd18a', act: 'exit', label: '월드로 나가기' },
};

// ---------- 절차적 고해상도 거리/건물 텍스처 캐시 ----------
const t3TexCache = new Map();
function t3CachedTex(key, size, draw, opts) {
  let t = t3TexCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  t = new THREE.CanvasTexture(c);
  t.encoding = opts && opts.linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
  t.wrapS = t.wrapT = opts && opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, R3D.maxAniso || 4);
  t.needsUpdate = true;
  t3TexCache.set(key, t);
  return t;
}

function t3RoadTex(era) {
  return t3CachedTex('road|' + era, 512, (g, N) => {
    const r = mulberry(1001 + era * 77);
    const C = T3_ERA_CFG[era];
    g.fillStyle = C.roadBg; g.fillRect(0, 0, N, N);
    if (era === 0) {
      for (let i = 0; i < 1600; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(65,45,25,.14)' : 'rgba(185,155,110,.12)';
        g.fillRect(r() * N, r() * N, 3 + r() * 14, 3 + r() * 14);
      }
      g.fillStyle = 'rgba(58,40,22,.22)'; g.fillRect(N * 0.28, 0, N * 0.08, N); g.fillRect(N * 0.64, 0, N * 0.08, N);
      for (const s of [0, N - 34]) { g.fillStyle = 'rgba(72,102,48,.38)'; g.fillRect(s, 0, 34, N); }
    } else if (era === 1) {
      const rows = 8, cols = 6, cw = N / cols, ch = N / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const ox = (y % 2) * cw * 0.5, v = 0.9 + r() * 0.18;
        g.fillStyle = `rgb(${182 * v | 0},${156 * v | 0},${114 * v | 0})`;
        g.fillRect((x * cw + ox) % N + 2, y * ch + 2, cw - 4, ch - 4);
      }
      g.fillStyle = 'rgba(80,62,38,.25)'; for (let i = 0; i < 600; i++) g.fillRect(r() * N, r() * N, 4, 4);
    } else if (era === 2 || era === 3) {
      const rows = era === 2 ? 16 : 20, cols = era === 2 ? 12 : 16, cw = N / cols, ch = N / rows;
      g.fillStyle = '#3a3836'; g.fillRect(0, 0, N, N);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const ox = (y % 2) * cw * 0.5, v = (era === 2 ? 0.82 : 0.72) + r() * 0.25, w = era === 2 ? 10 : 0;
        g.fillStyle = `rgb(${(116 + w) * v | 0},${(113 + w * 0.7) * v | 0},${110 * v | 0})`;
        const px = (x * cw + ox) % N;
        g.fillRect(px + 2, y * ch + 2, cw - 3.5, ch - 3.5);
        if (px + cw > N) g.fillRect(px - N + 2, y * ch + 2, cw - 3.5, ch - 3.5);
      }
      g.fillStyle = 'rgba(20,22,26,.35)'; g.fillRect(0, 0, 18, N); g.fillRect(N - 18, 0, 18, N);
    } else {
      for (let i = 0; i < 5500; i++) {
        const c = 48 + (r() * 26 | 0);
        g.fillStyle = `rgba(${c},${c + 2},${c + 5},0.35)`;
        g.fillRect(r() * N, r() * N, 2 + r() * 3, 2 + r() * 3);
      }
      g.fillStyle = 'rgba(136,52,48,.52)'; g.fillRect(N * 0.06, 0, N * 0.36, N);
      g.fillStyle = 'rgba(18,20,24,.45)'; g.fillRect(0, 0, 16, N); g.fillRect(N - 16, 0, 16, N);
      g.fillStyle = 'rgba(235,235,230,.85)'; g.fillRect(20, 0, 7, N); g.fillRect(N - 27, 0, 7, N);
      g.fillStyle = '#e5b83b'; g.fillRect(N * 0.5 - 9, 0, 6, N); g.fillRect(N * 0.5 + 3, 0, 6, N);
      g.fillStyle = 'rgba(240,240,235,.8)';
      for (let y = 20; y < N; y += 128) { g.fillRect(N * 0.25 - 3, y, 6, 62); g.fillRect(N * 0.75 - 3, y, 6, 62); }
    }
  });
}

function t3SidewalkTex(era) {
  return t3CachedTex('side|' + era, 512, (g, N) => {
    const r = mulberry(2002 + era * 53);
    const C = T3_ERA_CFG[era];
    g.fillStyle = C.sideBg; g.fillRect(0, 0, N, N);
    if (era === 0) {
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(55,45,25,.16)' : 'rgba(155,135,95,.14)';
        g.fillRect(r() * N, r() * N, 4 + r() * 14, 4 + r() * 14);
      }
      g.fillStyle = 'rgba(72,110,45,.28)'; g.fillRect(N - 70, 0, 70, N);
    } else if (era === 4) {
      const step = 32;
      for (let y = 0; y < N; y += step) for (let x = 0; x < N; x += step) {
        const brickBand = x >= N * 0.44 && x < N * 0.62;
        const v = 0.92 + r() * 0.14;
        if (brickBand) g.fillStyle = `rgb(${156 * v | 0},${98 * v | 0},${90 * v | 0})`;
        else g.fillStyle = `rgb(${164 * v | 0},${166 * v | 0},${172 * v | 0})`;
        g.fillRect(x + 1.5, y + 1.5, step - 3, step - 3);
        if (brickBand) {
          g.fillStyle = 'rgba(60,35,30,.28)';
          g.fillRect(x + step / 2, y + 1, 1.5, step - 2);
          g.fillRect(x + 1, y + step / 2, step - 2, 1.5);
        }
      }
      g.fillStyle = '#7e8288'; g.fillRect(0, 0, 22, N);
      g.fillStyle = '#52565c'; g.fillRect(22, 0, 3, N);
      g.fillStyle = '#e6c22e'; g.fillRect(42, 0, 26, N);
      g.fillStyle = 'rgba(155,120,10,.45)';
      for (let y = 0; y < N; y += 16) { g.fillRect(42, y, 26, 2); for (let dx = 46; dx < 66; dx += 6) g.fillRect(dx, y + 3, 2, 11); }
    } else {
      const step = era === 1 ? 64 : 42.666;
      g.fillStyle = 'rgba(40,36,30,.35)'; g.fillRect(0, 0, N, N);
      for (let y = 0; y < N; y += step) for (let x = 0; x < N; x += step) {
        const accent = era >= 2 && x >= N * 0.42 && x < N * 0.58;
        const v = 0.88 + r() * 0.18;
        if (accent) g.fillStyle = era === 3 ? `rgb(${155 * v | 0},${104 * v | 0},${84 * v | 0})` : `rgb(${135 * v | 0},${122 * v | 0},${106 * v | 0})`;
        else if (era === 1) g.fillStyle = `rgb(${205 * v | 0},${185 * v | 0},${146 * v | 0})`;
        else g.fillStyle = `rgb(${164 * v | 0},${158 * v | 0},${146 * v | 0})`;
        g.fillRect(x + 2, y + 2, step - 3.5, step - 3.5);
      }
      g.fillStyle = C.curb; g.fillRect(0, 0, 24, N);
    }
  });
}

function t3PlazaTex(era) {
  return t3CachedTex('plaza|' + era, 512, (g, N) => {
    const r = mulberry(3003 + era * 41);
    g.fillStyle = era === 0 ? '#846b48' : era === 1 ? '#cbb68e' : era === 4 ? '#9ea2a8' : '#a29b8e';
    g.fillRect(0, 0, N, N);
    if (era === 0) {
      for (let i = 0; i < 1200; i++) { g.fillStyle = r() > 0.5 ? 'rgba(60,40,20,.14)' : 'rgba(190,160,115,.12)'; g.fillRect(r() * N, r() * N, 6 + r() * 14, 6 + r() * 14); }
      return;
    }
    const step = 32;
    for (let y = 0; y < N; y += step) for (let x = 0; x < N; x += step) {
      const chk = ((x / step | 0) + (y / step | 0)) % 2 === 0;
      const v = (chk ? 0.96 : 0.88) + r() * 0.08;
      if (era === 1) g.fillStyle = `rgb(${208 * v | 0},${186 * v | 0},${144 * v | 0})`;
      else if (era === 4) g.fillStyle = `rgb(${168 * v | 0},${170 * v | 0},${176 * v | 0})`;
      else g.fillStyle = `rgb(${166 * v | 0},${160 * v | 0},${148 * v | 0})`;
      g.fillRect(x + 1.5, y + 1.5, step - 3, step - 3);
    }
    g.strokeStyle = era === 4 ? 'rgba(150,86,78,.55)' : 'rgba(110,95,75,.4)';
    g.lineWidth = 10; g.strokeRect(20, 20, N - 40, N - 40);
  });
}

function t3FacadeTex(era, variant) {
  const key = `fac|${era}|${variant}`;
  if (t3TexCache.has(key)) return t3TexCache.get(key);
  const N = 512, r = mulberry(4011 + era * 131 + variant * 29);
  const cA = document.createElement('canvas'); cA.width = cA.height = N;
  const cE = document.createElement('canvas'); cE.width = cE.height = N;
  const g = cA.getContext('2d'), ge = cE.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, N, N);

  const pal = [
    ['#9e8462', '#8e7454', '#a8906e'],
    ['#d4c09a', '#cbb286', '#bfa476'],
    ['#d8ceb8', '#c6baa2', '#b8ab96'],
    ['#c9bba6', '#b8947e', '#b4b0a8'],
    ['#c6beb2', '#9e5844', '#d2cec4', '#8e969e', '#b89e82'],
  ][era];
  const base = pal[variant % pal.length];
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  if (era === 4 && variant % 3 === 1) {
    for (let y = 0; y < N; y += 14) for (let x = 0; x < N; x += 28) {
      const ox = ((y / 14 | 0) % 2) * 14, v = 0.86 + r() * 0.24;
      g.fillStyle = `rgb(${158 * v | 0},${84 * v | 0},${64 * v | 0})`;
      g.fillRect((x + ox) % N + 1, y + 1, 26, 12);
    }
  } else {
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(0,0,0,.045)' : 'rgba(255,255,255,.04)';
      g.fillRect(r() * N, r() * N, 8 + r() * 28, 4 + r() * 14);
    }
  }
  const gH = Math.round(N * 0.26);
  g.fillStyle = era === 4 ? '#5c6068' : era >= 2 ? '#6e685e' : '#8a7658';
  g.fillRect(0, N - gH, N, gH);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, N - gH - 6, N, 6);
  const shops = 3, sw = N / shops;
  for (let i = 0; i < shops; i++) {
    const sx = i * sw + 16, sy = N - gH + 18, w = sw - 32, h = gH - 22;
    const warmOpen = era === 4 && (i === 1 || r() < 0.55);
    g.fillStyle = warmOpen ? '#3a424d' : (era === 4 ? '#222830' : '#3a2c20');
    g.fillRect(sx, sy, w, h);
    g.strokeStyle = era === 4 ? '#9298a2' : '#58422c'; g.lineWidth = 4; g.strokeRect(sx, sy, w, h);
    if (r() < 0.82) {
      ge.fillStyle = era === 4 ? '#ffd690' : '#ffab52';
      ge.fillRect(sx + 6, sy + 6, w - 12, h - 12);
    }
    if (era === 4 && !warmOpen) {
      g.fillStyle = 'rgba(255,255,255,.08)';
      for (let yy = sy + 8; yy < sy + h; yy += 8) g.fillRect(sx + 2, yy, w - 4, 2);
    }
  }
  const floors = era <= 1 ? 2 : era === 2 ? 3 : 4;
  const cols = era <= 1 ? 3 : 4;
  const topY = 24, availH = N - gH - topY - 10, fh = availH / floors, cw = N / cols;
  for (let f = 0; f < floors; f++) {
    const fy = topY + f * fh;
    g.fillStyle = era === 2 ? '#5a3e24' : 'rgba(255,255,255,.22)';
    g.fillRect(0, fy - 4, N, era === 2 ? 9 : 6);
    g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, fy + 5, N, 4);
    for (let c = 0; c < cols; c++) {
      const wx = c * cw + cw * 0.16, wy = fy + fh * 0.18, ww = cw * 0.68, wh = fh * 0.58;
      if (era === 2) { g.fillStyle = '#5a3e24'; g.fillRect(c * cw - 4, fy, 8, fh); }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      const gr = g.createLinearGradient(wx, wy, wx, wy + wh);
      gr.addColorStop(0, era === 4 ? '#2b3d4f' : '#232c38');
      gr.addColorStop(1, era === 4 ? '#4a5f72' : '#181e26');
      g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
      g.fillStyle = era === 4 ? '#c8ccd2' : '#4a3622';
      g.fillRect(wx + ww * 0.48, wy, 4, wh);
      if (era <= 3) g.fillRect(wx, wy + wh * 0.48, ww, 4);
      g.fillStyle = era === 4 ? '#d8dce2' : '#8a7c6a';
      g.fillRect(wx - 5, wy + wh, ww + 10, 7);
      if (era === 4 && c < cols - 1) {
        const ax = wx + ww + 6, ay = wy + wh - 24;
        if (ax + 18 < (c + 1) * cw) {
          g.fillStyle = '#dad8d0'; g.fillRect(ax, ay, 18, 22);
          g.fillStyle = '#7c8086'; g.beginPath(); g.arc(ax + 9, ay + 11, 6, 0, 7); g.fill();
        }
      }
      if (r() < 0.65) {
        ge.fillStyle = r() < 0.35 ? '#ffe6b4' : '#ffad52';
        ge.fillRect(wx + 3, wy + 3, ww - 6, wh - 6);
      }
    }
  }
  const map = new THREE.CanvasTexture(cA); map.encoding = THREE.sRGBEncoding; map.anisotropy = Math.min(4, R3D.maxAniso || 4);
  const emap = new THREE.CanvasTexture(cE); emap.encoding = THREE.sRGBEncoding;
  const pair = { map, emap };
  t3TexCache.set(key, pair);
  return pair;
}

function t3SignTex(text, sub, bg, fg, accent) {
  const key = `sign|${text}|${sub || ''}|${bg}|${fg}`;
  if (t3TexCache.has(key)) return t3TexCache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = accent || '#f2c14e'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 144);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${text.length > 7 ? 52 : 66}px "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif`;
  g.fillText(text, 256, sub ? 66 : 82);
  if (sub) {
    g.font = '700 28px "Malgun Gothic", system-ui, sans-serif';
    g.fillStyle = accent || '#ffd880';
    g.fillText(sub, 256, 122);
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(4, R3D.maxAniso || 4);
  t3TexCache.set(key, t);
  return t;
}

function t3VertSignTex(text, bg, fg) {
  const key = `vsign|${text}|${bg}|${fg}`;
  if (t3TexCache.has(key)) return t3TexCache.get(key);
  const c = document.createElement('canvas'); c.width = 128; c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 384);
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 6; g.strokeRect(6, 6, 116, 372);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...text].filter(ch => ch !== ' ' && ch !== '·').slice(0, 5);
  const fs = chars.length <= 3 ? 64 : 52;
  g.font = `900 ${fs}px "Malgun Gothic", system-ui, sans-serif`;
  const step = 330 / Math.max(1, chars.length);
  chars.forEach((ch, i) => g.fillText(ch, 64, 30 + step * (i + 0.5)));
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(4, R3D.maxAniso || 4);
  t3TexCache.set(key, t);
  return t;
}

function t3PojangTex(title) {
  const key = 'pojang|' + title;
  if (t3TexCache.has(key)) return t3TexCache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e5862c'; g.fillRect(0, 0, 512, 256);
  const gr = g.createLinearGradient(0, 64, 0, 232);
  gr.addColorStop(0, '#fff2cf'); gr.addColorStop(1, '#f4c882');
  g.fillStyle = gr; g.fillRect(18, 72, 476, 166);
  g.fillStyle = '#a86a32'; g.fillRect(18, 174, 476, 64);
  g.fillStyle = 'rgba(110,65,25,.65)';
  for (let x = 42; x < 470; x += 48) { g.fillRect(x, 134, 14, 40); g.fillRect(x + 3, 122, 8, 12); }
  g.fillStyle = '#fff8e4'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 38px "Malgun Gothic", system-ui, sans-serif';
  g.fillText(title, 256, 38);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  t3TexCache.set(key, t);
  return t;
}

// ---------- 도로 위 움직이는 탈것 모델 (시대별) ----------
function t3MakeVehicle(era, col, track) {
  const g = new THREE.Group();
  const bodyM = track(new THREE.MeshLambertMaterial({ color: col }));
  const darkM = track(new THREE.MeshLambertMaterial({ color: '#24262a' }));
  const woodM = track(new THREE.MeshLambertMaterial({ color: '#6b4828' }));
  const glassM = track(new THREE.MeshLambertMaterial({ color: '#2b3e52', emissive: '#162434' }));
  const headM = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.2, 1.5) }));
  const tailM = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.35, 0.25) }));
  let headL = null, tailL = null;

  if (era === 4) {
    // 근대 클래식 자동차 / 노면 스타일 (+Z 전진)
    const lower = new THREE.Mesh(track(new THREE.BoxGeometry(1.75, 0.72, 3.9)), bodyM);
    lower.position.y = 0.62; lower.castShadow = true; lower.receiveShadow = true; g.add(lower);
    const cabin = new THREE.Mesh(track(new THREE.BoxGeometry(1.52, 0.68, 2.0)), bodyM);
    cabin.position.set(0, 1.28, -0.15); cabin.castShadow = true; g.add(cabin);
    const win = new THREE.Mesh(track(new THREE.BoxGeometry(1.56, 0.44, 1.78)), glassM);
    win.position.set(0, 1.28, -0.15); g.add(win);
    const wGeo = track(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10).rotateZ(Math.PI / 2));
    for (const [wx, wz] of [[-0.86, 1.2], [0.86, 1.2], [-0.86, -1.2], [0.86, -1.2]]) {
      const wh = new THREE.Mesh(wGeo, darkM); wh.position.set(wx, 0.34, wz); wh.castShadow = true; g.add(wh);
    }
    const hlG = track(new THREE.BoxGeometry(0.28, 0.18, 0.08));
    headL = new THREE.Group();
    for (const sx of [-0.58, 0.58]) { const m = new THREE.Mesh(hlG, headM); m.position.set(sx, 0.68, 1.96); headL.add(m); }
    tailL = new THREE.Group();
    for (const sx of [-0.58, 0.58]) { const m = new THREE.Mesh(hlG, tailM); m.position.set(sx, 0.68, -1.96); tailL.add(m); }
    g.add(headL, tailL);
  } else {
    // 고대·중세·근세: 목재 덮개 마차 (+Z 전진)
    const bed = new THREE.Mesh(track(new THREE.BoxGeometry(1.55, 0.62, 2.8)), woodM);
    bed.position.y = 0.85; bed.castShadow = true; bed.receiveShadow = true; g.add(bed);
    const cover = new THREE.Mesh(track(new THREE.CylinderGeometry(0.8, 0.8, 2.65, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2)), bodyM);
    cover.position.y = 1.15; cover.castShadow = true; g.add(cover);
    const wGeo = track(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 10).rotateZ(Math.PI / 2));
    for (const [wx, wz] of [[-0.84, 0.85], [0.84, 0.85], [-0.84, -0.85], [0.84, -0.85]]) {
      const wh = new THREE.Mesh(wGeo, woodM); wh.position.set(wx, 0.45, wz); wh.castShadow = true; g.add(wh);
    }
    // 앞쪽 말 연결 (간단한 말 모델 또는 R3D.horse)
    const h = R3D.horse('#7a502c', col);
    h.group.scale.setScalar(1.38); h.group.position.set(0, 0, 2.35);
    g.add(h.group);
    g.userData.horse = h;
    headL = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 0.22, 0.18)), headM);
    headL.position.set(0.65, 1.35, 1.45); g.add(headL);
  }
  return { g, headL, tailL, horse: g.userData.horse || null };
}

// ---------- 마을 3D 씬 생성 ----------
function t3BuildScene(town) {
  const era = clamp(S.era | 0, 0, ERAS.length - 1);
  const lv = townLevel(town);
  const cfg = T3_ERA_CFG[era];
  const r = mulberry(9001 + town.id * 97 + era * 31 + lv * 13);
  const col = TOWN_COLORS[town.id % TOWN_COLORS.length];

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(56, VW / VH, 0.15, 220);
  scene.background = new THREE.Color(0x9ccbe6);
  scene.fog = new THREE.Fog(0xbcd4e8, 44, 140);

  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x5a5848, 0.65); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e2, 1.15);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  R3D.regScene(scene); R3D.regLight(sun);

  const pts = [];
  for (let k = 0; k < 4; k++) { const L = new THREE.PointLight(0xffa858, 0, 14, 1.6); scene.add(L); pts.push(L); }

  const sky = R3D.sky ? R3D.sky(scene) : null;
  const glows = R3D.glows(scene, 160);
  const pools = R3D.pools(scene, 120);
  const blobs = R3D.blobs(scene, 100);

  const own = [];
  const track = o => { own.push(o); return o; };
  const colliders = [];
  const addCol = (x, z, hx, hz) => colliders.push({ x, z, hx, hz });
  const pois = [];
  const mapBoxes = [];
  const lights = [];
  const flags = [];
  const emMats = [];
  const ledStrips = []; // 근대 바닥 신호등

  const L = 44 + lv * 5;
  const W_CROSS = 38;
  const ROAD_HW = 4.2;
  const SIDE_W = 5.4;
  const SIDE_H = 0.16;

  // 1) 바깥 대지
  const outer = new THREE.Mesh(track(new THREE.PlaneGeometry(360, 360).rotateX(-Math.PI / 2)),
    track(new THREE.MeshLambertMaterial({ color: era === 4 ? 0x5c6458 : era === 1 ? 0xa89468 : 0x567a3e })));
  outer.position.set(0, -0.06, 0); outer.receiveShadow = true; scene.add(outer);

  // 2) 중앙 대로 + 동서 교차로
  const roadTex = t3RoadTex(era).clone(); roadTex.needsUpdate = true; roadTex.repeat.set(1, (L * 2) / 8.4); track(roadTex);
  const road = new THREE.Mesh(track(new THREE.PlaneGeometry(ROAD_HW * 2, L * 2).rotateX(-Math.PI / 2)), track(new THREE.MeshLambertMaterial({ map: roadTex })));
  road.receiveShadow = true; scene.add(road);

  const crossTex = t3RoadTex(era).clone(); crossTex.needsUpdate = true; crossTex.repeat.set(1, (W_CROSS * 2) / 8.4); track(crossTex);
  const cross = new THREE.Mesh(track(new THREE.PlaneGeometry(ROAD_HW * 2, W_CROSS * 2).rotateX(-Math.PI / 2).rotateY(Math.PI / 2)), track(new THREE.MeshLambertMaterial({ map: crossTex })));
  cross.position.y = 0.008; cross.receiveShadow = true; scene.add(cross);

  // 3) 중앙 광장
  const plazaTex = t3PlazaTex(era).clone(); plazaTex.needsUpdate = true; plazaTex.repeat.set(5, 5); track(plazaTex);
  const plaza = new THREE.Mesh(track(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2)), track(new THREE.MeshLambertMaterial({ map: plazaTex })));
  plaza.position.y = 0.015; plaza.receiveShadow = true; scene.add(plaza);

  // 4) 횡단보도 + 근대 바닥 신호등 LED
  if (era >= 1) {
    const cwMat = track(new THREE.MeshLambertMaterial({ color: era === 4 ? 0xebeae4 : era === 1 ? 0xc8b288 : 0x8f8a80 }));
    const cwGeo = track(new THREE.PlaneGeometry(era === 4 ? 0.55 : 0.72, era === 4 ? 2.8 : 1.6).rotateX(-Math.PI / 2));
    for (const cz of [24, 12.5, -12.5]) {
      for (let x = -3.2; x <= 3.21; x += 1.06) {
        const m = new THREE.Mesh(cwGeo, cwMat); m.position.set(x, 0.022, cz); m.receiveShadow = true; scene.add(m);
      }
      if (era === 4) {
        for (const sx of [-1, 1]) {
          const lm = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.2, 0.7) }));
          const strip = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 0.04, 3.0)), lm);
          strip.position.set(sx * (ROAD_HW + 0.14), SIDE_H + 0.02, cz);
          scene.add(strip); ledStrips.push(lm);
        }
      }
    }
  }

  // 5) 3D 양쪽 보도 + 연석
  const curbMat = track(new THREE.MeshLambertMaterial({ color: cfg.curb }));
  function addSidewalk(cx, cz, w, d, flipU) {
    const st = t3SidewalkTex(era).clone(); st.needsUpdate = true; st.repeat.set(flipU ? -1 : 1, d / 5.4); track(st);
    const topMat = track(new THREE.MeshLambertMaterial({ map: st }));
    const box = new THREE.Mesh(track(new THREE.BoxGeometry(w, SIDE_H, d)), [curbMat, curbMat, topMat, curbMat, curbMat, curbMat]);
    box.position.set(cx, SIDE_H / 2, cz); box.receiveShadow = true; scene.add(box);
  }
  const segS = L - 12, segN = L - 12;
  addSidewalk(-(ROAD_HW + SIDE_W / 2), 12 + segS / 2, SIDE_W, segS, true);
  addSidewalk(+(ROAD_HW + SIDE_W / 2), 12 + segS / 2, SIDE_W, segS, false);
  addSidewalk(-(ROAD_HW + SIDE_W / 2), -(12 + segN / 2), SIDE_W, segN, true);
  addSidewalk(+(ROAD_HW + SIDE_W / 2), -(12 + segN / 2), SIDE_W, segN, false);
  const cSideLen = W_CROSS - 12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const st = t3SidewalkTex(era).clone(); st.needsUpdate = true; st.repeat.set(cSideLen / 5.4, 1); track(st);
    const tm = track(new THREE.MeshLambertMaterial({ map: st }));
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(cSideLen, SIDE_H, 4.6)), [curbMat, curbMat, tm, curbMat, curbMat, curbMat]);
    m.position.set(sx * (12 + cSideLen / 2), SIDE_H / 2, sz * (ROAD_HW + 2.3)); m.receiveShadow = true; scene.add(m);
  }
  const lotMat = track(new THREE.MeshLambertMaterial({ color: era === 4 ? 0x767a80 : era === 0 ? 0x685c40 : 0x867e70 }));
  for (const sx of [-1, 1]) {
    const lm = new THREE.Mesh(track(new THREE.PlaneGeometry(36, L * 2 + 20).rotateX(-Math.PI / 2)), lotMat);
    lm.position.set(sx * (ROAD_HW + SIDE_W + 18), SIDE_H - 0.01, 0); lm.receiveShadow = true; scene.add(lm);
  }

  // 6) 중앙 광장 랜드마크 (분수 물줄기 애니메이션 포함!)
  let fountainSpray = null;
  {
    const px = 0, pz = 0, baseR = era === 0 ? 2.4 : 3.2;
    const ped = new THREE.Mesh(track(new THREE.CylinderGeometry(baseR, baseR + 0.35, 0.36, era === 0 ? 10 : 12)), track(new THREE.MeshLambertMaterial({ color: era === 0 ? '#746652' : '#9c968c' })));
    ped.position.set(px, 0.18, pz); ped.receiveShadow = true; ped.castShadow = true; scene.add(ped);
    addCol(px, pz, baseR + 0.3, baseR + 0.3);
    if (era === 0) {
      if (typeof RA !== 'undefined' && RA.has('campfire')) { const cf = RA.group('campfire', true); cf.scale.setScalar(1.55); cf.position.set(px, 0.36, pz); scene.add(cf); }
      const fl = new THREE.Mesh(w3dFlameGeo(), R3D.mats.fire); fl.scale.set(2.8, 3.2, 2.8); fl.position.set(px, 0.52, pz); scene.add(fl);
      lights.push({ x: px, y: 1.8, z: pz, col: new THREE.Color('#ff7a26'), k: 4.5, glow: 2.6, pool: 8.5, fire: true });
    } else if (era <= 2) {
      if (typeof RA !== 'undefined' && RA.has('well')) { const wl = RA.group('well', true); wl.scale.setScalar(1.35); wl.position.set(px, 0.36, pz); scene.add(wl); }
      else { const wl = new THREE.Mesh(track(new THREE.CylinderGeometry(1.1, 1.2, 1.1, 10)), track(new THREE.MeshLambertMaterial({ color: '#9c968c' }))); wl.position.set(px, 0.9, pz); wl.castShadow = true; scene.add(wl); }
      lights.push({ x: px, y: 2.8, z: pz, col: new THREE.Color('#ffa850'), k: 2.5, glow: 1.6, pool: 7.0 });
    } else {
      const basin = new THREE.Mesh(track(new THREE.CylinderGeometry(2.5, 2.7, 0.72, 16)), track(new THREE.MeshLambertMaterial({ color: '#aba79e' })));
      basin.position.set(px, 0.72, pz); basin.castShadow = true; basin.receiveShadow = true; scene.add(basin);
      const wat = new THREE.Mesh(track(new THREE.CylinderGeometry(2.25, 2.25, 0.12, 16)), track(new THREE.MeshLambertMaterial({ color: '#42a4b8', emissive: '#103040' })));
      wat.position.set(px, 1.06, pz); scene.add(wat);
      const colM = new THREE.Mesh(track(new THREE.CylinderGeometry(0.45, 0.65, 4.4, 10)), track(new THREE.MeshLambertMaterial({ color: '#c4beb2' })));
      colM.position.set(px, 2.9, pz); colM.castShadow = true; scene.add(colM);
      const topOrb = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.55, 1)), track(new THREE.MeshLambertMaterial({ color: '#e6c258', emissive: '#8a5a10', emissiveIntensity: 0.4 })));
      topOrb.position.set(px, 5.4, pz); scene.add(topOrb);
      // 분수 물줄기 입자
      const fGeo = track(new THREE.BufferGeometry());
      fGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
      const fMat = track(new THREE.PointsMaterial({ color: 0xd8f4ff, size: 0.16, transparent: true, opacity: 0.78, depthWrite: false }));
      fountainSpray = new THREE.Points(fGeo, fMat); scene.add(fountainSpray);
      lights.push({ x: px, y: 5.4, z: pz, col: new THREE.Color('#ffd88a'), k: 3.2, glow: 2.4, pool: 9.0 });
    }
  }

  // 광장 소식판 (우측 광장 남동쪽) + 대장간 화덕 (좌측 광장 남서쪽 — 영주 장비 강화!)
  {
    const bx = 7.4, bz = 9.2;
    const bg = new THREE.Group(); bg.position.set(bx, SIDE_H, bz); bg.rotation.y = -0.35;
    const woodM = track(new THREE.MeshLambertMaterial({ color: '#5a3a20' }));
    for (const dx of [-0.9, 0.9]) { const p = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 2.3, 0.14)), woodM); p.position.set(dx, 1.15, 0); p.castShadow = true; bg.add(p); }
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(2.3, 0.14, 0.65)), track(new THREE.MeshLambertMaterial({ color: '#3a3028' })));
    roof.position.set(0, 2.32, 0); roof.castShadow = true; bg.add(roof);
    const boardMat = track(new THREE.MeshLambertMaterial({ map: t3SignTex('마을 소식판', '의뢰 · 사건 확인', '#efe2c2', '#3a2410', '#9a6a2a') }));
    const bd = new THREE.Mesh(track(new THREE.BoxGeometry(1.75, 1.05, 0.08)), boardMat); bd.position.set(0, 1.55, 0); bd.castShadow = true; bg.add(bd);
    scene.add(bg); addCol(bx, bz, 1.1, 0.5);
    pois.push({ x: bx, z: bz + 1.5, r: 2.6, kind: 'board', ...T3_FAC_INFO.board });
  }
  {
    // 대장간 공방 (광장 남서쪽) — 모루 · 불타는 화덕 · 무기 거치대 · 간판
    const sx = -8.2, sz = 9.0;
    const sg = new THREE.Group(); sg.position.set(sx, SIDE_H, sz); sg.rotation.y = 0.38;
    const stM = track(new THREE.MeshLambertMaterial({ color: '#56524e' }));
    const wdM = track(new THREE.MeshLambertMaterial({ color: '#5c3c22' }));
    const irM = track(new THREE.MeshLambertMaterial({ color: '#2e3238' }));
    // 화덕 + 불꽃
    const forge = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 1.05, 1.2)), stM); forge.position.set(-0.9, 0.52, -0.3); forge.castShadow = true; sg.add(forge);
    const ember = new THREE.Mesh(w3dFlameGeo(), R3D.mats.fire); ember.scale.set(1.2, 1.1, 1.2); ember.position.set(-0.9, 1.02, -0.3); sg.add(ember);
    // 모루 + 받침 통나무
    const log = new THREE.Mesh(track(new THREE.CylinderGeometry(0.32, 0.36, 0.65, 8)), wdM); log.position.set(0.6, 0.32, 0.2); log.castShadow = true; sg.add(log);
    const anvil = new THREE.Mesh(track(new THREE.BoxGeometry(0.75, 0.28, 0.34)), irM); anvil.position.set(0.6, 0.78, 0.2); anvil.castShadow = true; sg.add(anvil);
    // 차양 지붕 + 간판
    for (const dx of [-1.8, 1.5]) { const p = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 2.8, 0.14)), wdM); p.position.set(dx, 1.4, -0.8); p.castShadow = true; sg.add(p); }
    const rf = new THREE.Mesh(track(new THREE.BoxGeometry(3.8, 0.14, 1.8)), track(new THREE.MeshLambertMaterial({ color: '#42362e' }))); rf.position.set(-0.15, 2.8, -0.2); rf.rotation.x = 0.18; rf.castShadow = true; sg.add(rf);
    const smTex = t3SignTex('대장간', '무기 · 갑옷 · 군마 강화', '#2e1b14', '#ffe8c2', '#ff8c3a');
    const smMat = track(new THREE.MeshLambertMaterial({ map: smTex, emissive: '#ffffff', emissiveMap: smTex, emissiveIntensity: 0 }));
    emMats.push({ mat: smMat, max: 0.85 });
    const smB = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, 0.8, 0.12)), smMat); smB.position.set(-0.15, 2.55, 0.65); sg.add(smB);
    scene.add(sg); addCol(sx, sz, 1.8, 1.0);
    mapBoxes.push({ x: sx, z: sz, w: 3.6, d: 2.2, col: '#ff944d', icon: '장' });
    pois.push({ x: sx + 0.8, z: sz + 1.8, r: 2.8, kind: 'smith', ...T3_FAC_INFO.smith });
    lights.push({ x: sx - 0.6, y: 1.5, z: sz, col: new THREE.Color('#ff6a1e'), k: 3.6, glow: 1.7, pool: 6.5, fire: true });
  }

  // 7) 북쪽 랜드마크: 영주관 / 성채
  const keepZ = -(L - 4);
  {
    const terrace = new THREE.Mesh(track(new THREE.BoxGeometry(24, 0.6, 20)), track(new THREE.MeshLambertMaterial({ color: era === 0 ? '#745e40' : '#9a9488' })));
    terrace.position.set(0, 0.3, keepZ - 4); terrace.receiveShadow = true; scene.add(terrace);
    const hasReal = typeof RA !== 'undefined' && RA.ok;
    let keepH = 11;
    if (hasReal && era >= 2 && RA.has('castle_keep')) {
      const k = RA.group('castle_keep', true); k.scale.setScalar(0.96); k.position.set(0, 0.6, keepZ - 4); scene.add(k);
      keepH = RA.height('castle_keep') * 0.96 + 0.6;
    } else if (hasReal && RA.has(W3_RHOUSE[era])) {
      const hk = W3_RHOUSE[era], hm = RA.group(hk, true);
      const sc = era === 0 ? 1.55 : 1.38; hm.scale.setScalar(sc); hm.position.set(0, 0.6, keepZ - 4); scene.add(hm);
      keepH = RA.height(hk) * sc + 0.6;
    } else {
      const cg = w3dCastle(lv), cm = new THREE.Mesh(cg.main, R3D.mats.vc);
      cm.scale.set(6.5, 8.2, 6.5); cm.position.set(0, 0.6, keepZ - 4); cm.castShadow = cm.receiveShadow = true; scene.add(cm);
      keepH = cg.top * 8.2 + 0.6;
    }
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6)), track(new THREE.MeshLambertMaterial({ color: '#3a2a1a' })));
    pole.position.set(0, keepH + 1.8, keepZ - 4); scene.add(pole);
    const fl = w3dFlag(col, 3.2, 1.9); fl.mesh.position.set(0.08, keepH + 3.9, keepZ - 4); scene.add(fl.mesh); own.push(fl.mesh.geometry); flags.push(fl);
    const signM = track(new THREE.MeshLambertMaterial({ map: t3SignTex(`${town.name} ${eraCur().town}`, `${rulerName()} 관청`, '#26201a', '#fff4d4', '#f2c14e') }));
    const signMesh = new THREE.Mesh(track(new THREE.BoxGeometry(5.2, 1.45, 0.16)), signM);
    signMesh.position.set(0, 4.4, keepZ + 5.6); scene.add(signMesh);
    addCol(0, keepZ - 4, 9.5, 8.5);
    mapBoxes.push({ x: 0, z: keepZ - 4, w: 18, d: 15, col: '#d8a840', icon: '성' });
    pois.push({ x: 0, z: keepZ + 7.2, r: 3.4, kind: 'keep', ...T3_FAC_INFO.keep });
    lights.push({ x: -3.2, y: 3.5, z: keepZ + 6.2, col: new THREE.Color(cfg.lampCol), k: 3.5, glow: 1.8, pool: 8.5, fire: cfg.lampFire });
    lights.push({ x: +3.2, y: 3.5, z: keepZ + 6.2, col: new THREE.Color(cfg.lampCol), k: 3.5, glow: 1.8, pool: 8.5, fire: cfg.lampFire });
  }

  // 8) 남문 (출구)
  const gateZ = L - 6;
  {
    const gCol = era === 0 ? '#6a4c2e' : era === 4 ? '#7c4838' : '#8e8a80';
    const gMat = track(new THREE.MeshLambertMaterial({ color: gCol }));
    for (const sx of [-1, 1]) {
      if (typeof RA !== 'undefined' && RA.ok && RA.has(era >= 2 ? 'tower_stone' : 'tower_wood')) {
        const tk = era >= 2 ? 'tower_stone' : 'tower_wood';
        const tw = RA.group(tk, true); tw.scale.setScalar(0.75); tw.position.set(sx * 7.8, 0, gateZ); scene.add(tw);
      } else {
        const p = new THREE.Mesh(track(new THREE.BoxGeometry(2.6, era === 0 ? 5.5 : 9.0, 2.6)), gMat);
        p.position.set(sx * 6.8, (era === 0 ? 5.5 : 9.0) / 2, gateZ); p.castShadow = true; p.receiveShadow = true; scene.add(p);
      }
      addCol(sx * 7.8, gateZ, 2.4, 2.4);
    }
    const archY = era === 0 ? 4.8 : 6.4;
    const beam = new THREE.Mesh(track(new THREE.BoxGeometry(14.4, 1.1, 1.4)), gMat);
    beam.position.set(0, archY, gateZ); beam.castShadow = true; scene.add(beam);
    const gSignTex = t3SignTex(era === 4 ? `${town.name} 1번가` : `${town.name} 남문`, '월드로 나가는 길', era === 4 ? '#1e3554' : '#2e2218', '#ffffff', era === 4 ? '#66c2ff' : '#f2c14e');
    const gSignMat = track(new THREE.MeshLambertMaterial({ map: gSignTex, emissive: '#ffffff', emissiveMap: gSignTex, emissiveIntensity: 0 }));
    emMats.push({ mat: gSignMat, max: 0.75 });
    const gSign = new THREE.Mesh(track(new THREE.BoxGeometry(5.6, 1.5, 0.18)), gSignMat);
    gSign.position.set(0, archY, gateZ - 0.75); scene.add(gSign);
    const wallH = era === 0 ? 3.2 : 5.4;
    for (const sx of [-1, 1]) {
      const wm = new THREE.Mesh(track(new THREE.BoxGeometry(28, wallH, 1.6)), gMat);
      wm.position.set(sx * 23, wallH / 2, gateZ); wm.castShadow = true; wm.receiveShadow = true; scene.add(wm);
    }
    pois.push({ x: 0, z: gateZ - 1.5, r: 3.4, kind: 'gate', ...T3_FAC_INFO.gate });
    lights.push({ x: -4.8, y: 3.6, z: gateZ - 1.2, col: new THREE.Color(cfg.lampCol), k: 3.2, glow: 1.6, pool: 7.5, fire: cfg.lampFire });
    lights.push({ x: +4.8, y: 3.6, z: gateZ - 1.2, col: new THREE.Color(cfg.lampCol), k: 3.2, glow: 1.6, pool: 7.5, fire: cfg.lampFire });
  }

  // 9) 거리 양옆 건물 배치
  const townBlds = S.buildings.filter(b => b.town === town.id && b.type !== 'farm' && b.type !== 'tower');
  const facPriority = ['market', 'school', 'barracks', 'range', 'stable', 'factory', 'lumber', 'quarry', 'mine', 'house'];
  townBlds.sort((a, b) => facPriority.indexOf(a.type) - facPriority.indexOf(b.type));

  const slots = [];
  for (let z = gateZ - 11; z >= 16; z -= 12.2) { slots.push({ side: -1, z }); slots.push({ side: 1, z }); }
  for (let z = -16; z >= keepZ + 14; z -= 12.2) { slots.push({ side: -1, z }); slots.push({ side: 1, z }); }
  for (const sx of [-1, 1]) for (let d = 17; d <= 31; d += 12.5) {
    slots.push({ cross: true, x: sx * d, z: -13.5, faceZ: 1 });
    slots.push({ cross: true, x: sx * d, z: +13.5, faceZ: -1 });
  }

  const usedFac = new Set();
  const realOk = typeof RA !== 'undefined' && RA.ok;
  let bIdx = 0, shopIdx = 0;

  function placeFacadeBuilding(cx, cz, faceDir, w, d, stories, variant, shopName, isCross) {
    const h = 3.6 + (stories - 1) * 3.1;
    const fp = t3FacadeTex(era, variant);
    const wallMat = track(new THREE.MeshLambertMaterial({ map: fp.map, emissive: '#ffcf88', emissiveMap: fp.emap, emissiveIntensity: 0 }));
    emMats.push({ mat: wallMat, max: 1.25 });
    const roofCol = era === 4 ? '#4a4e54' : era === 3 ? '#5a504c' : era === 2 ? '#784232' : '#9c643c';
    const roofMat = track(new THREE.MeshLambertMaterial({ color: roofCol }));
    const g = new THREE.Group(); g.position.set(cx, SIDE_H, cz);
    if (isCross) g.rotation.y = faceDir > 0 ? 0 : Math.PI;
    else g.rotation.y = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2;

    const body = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), wallMat);
    body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);

    if (era === 4) {
      const parapet = new THREE.Mesh(track(new THREE.BoxGeometry(w + 0.35, 0.45, d + 0.35)), roofMat);
      parapet.position.y = h + 0.22; parapet.castShadow = true; g.add(parapet);
    } else {
      const roof = new THREE.Mesh(track(w3dPrism(d + 0.6, era === 1 ? 1.5 : 2.6, w + 0.5).rotateY(Math.PI / 2)), roofMat);
      roof.position.y = h; roof.castShadow = true; g.add(roof);
    }

    const awnCol = ['#b84434', '#386898', '#3c7a4e', '#c68a32', '#4a4e58'][variant % 5];
    const awn = new THREE.Mesh(track(new THREE.BoxGeometry(w * 0.88, 0.16, 1.15)), track(new THREE.MeshLambertMaterial({ color: awnCol })));
    awn.position.set(0, 3.15, d / 2 + 0.52); awn.rotation.x = 0.25; awn.castShadow = true; g.add(awn);

    if (shopName) {
      const sBg = era === 4 ? ['#1d3557', '#7f1d1d', '#14532d', '#4a2c14', '#2a2a36', '#5c2246'][variant % 6] : '#3a2818';
      const st = t3SignTex(shopName, null, sBg, '#fff8e8', '#f2c14e');
      const sm = track(new THREE.MeshLambertMaterial({ map: st, emissive: '#ffffff', emissiveMap: st, emissiveIntensity: 0 }));
      emMats.push({ mat: sm, max: era === 4 ? 0.95 : 0.45 });
      const sign = new THREE.Mesh(track(new THREE.BoxGeometry(Math.min(4.6, w * 0.5), 1.0, 0.16)), sm);
      sign.position.set(0, 3.7, d / 2 + 0.14); g.add(sign);

      if (era >= 3 && stories >= 3) {
        const vt = t3VertSignTex(shopName, ['#b83228', '#224b8a', '#266a44', '#c27e1c', '#6a2a6e'][variant % 5], '#fff');
        const vm = track(new THREE.MeshLambertMaterial({ map: vt, emissive: '#ffffff', emissiveMap: vt, emissiveIntensity: 0 }));
        emMats.push({ mat: vm, max: 1.05 });
        const vs = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 3.2, 0.92)), vm);
        vs.position.set(w * 0.38, 5.8, d / 2 + 0.62); vs.castShadow = true; g.add(vs);
      }
    }
    scene.add(g);
    const hx = isCross ? w / 2 : d / 2, hz = isCross ? d / 2 : w / 2;
    addCol(cx, cz, hx + 0.12, hz + 0.12);
    mapBoxes.push({ x: cx, z: cz, w: hx * 2, d: hz * 2, col: era === 4 ? '#6e6a62' : '#7a7262' });
  }

  for (const sl of slots) {
    const b = bIdx < townBlds.length ? townBlds[bIdx] : null;
    const isCross = !!sl.cross;
    const cx = isCross ? sl.x : sl.side * (ROAD_HW + SIDE_W + 5.2);
    const cz = sl.z;
    const faceDir = isCross ? sl.faceZ : -sl.side;
    const shopName = cfg.shops[shopIdx++ % cfg.shops.length];

    let placedReal = false;
    if (b && !isCross) {
      bIdx++;
      const fi = T3_FAC_INFO[b.type];
      const rk = b.type === 'house' ? W3_RHOUSE[era] : b.type;
      if (era < 4 && realOk && RA.has(rk)) {
        const gm = RA.group(rk, true);
        const bb = RA.box(rk), bw = Math.max(1, bb.max.x - bb.min.x), bd = Math.max(1, bb.max.z - bb.min.z);
        const s = clamp(9.8 / Math.max(bw, bd), 0.72, 1.15);
        gm.scale.setScalar(s);
        gm.position.set(cx + sl.side * 0.5, SIDE_H, cz);
        gm.rotation.y = faceDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(gm);
        const hx = (bd * s) / 2, hz = (bw * s) / 2;
        addCol(cx + sl.side * 0.5, cz, hx + 0.15, hz + 0.15);
        mapBoxes.push({ x: cx + sl.side * 0.5, z: cz, w: hx * 2, d: hz * 2, col: fi ? fi.col : '#8a7a62', icon: fi ? fi.badge : null });
        if (fi) {
          const sg = new THREE.Group();
          sg.position.set(sl.side * (ROAD_HW + SIDE_W - 0.65), SIDE_H, cz);
          sg.rotation.y = sl.side > 0 ? -0.35 : 0.35;
          const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.08, 3.0, 6)), track(new THREE.MeshLambertMaterial({ color: '#3a2c1e' })));
          post.position.y = 1.5; post.castShadow = true; sg.add(post);
          const st = t3SignTex(fi.name, fi.label, '#242a32', '#fff8e4', fi.col);
          const sm = track(new THREE.MeshLambertMaterial({ map: st, emissive: '#ffffff', emissiveMap: st, emissiveIntensity: 0 }));
          emMats.push({ mat: sm, max: 0.75 });
          const board = new THREE.Mesh(track(new THREE.BoxGeometry(2.4, 0.85, 0.12)), sm); board.position.set(0, 2.75, 0); sg.add(board);
          scene.add(sg);
          if (!usedFac.has(b.type)) { usedFac.add(b.type); pois.push({ x: sl.side * (ROAD_HW + SIDE_W - 1.8), z: cz, r: 2.8, kind: b.type, ...fi }); }
        }
        placedReal = true;
      } else if (era === 4 && fi && !usedFac.has(b.type)) {
        const stories = 3 + Math.floor(r() * 3);
        const bw = 10.8 + r() * 0.8, bd = 9.6 + r() * 1.0;
        placeFacadeBuilding(cx, cz, faceDir, bw, bd, stories, Math.floor(r() * 12), fi.name, false);
        mapBoxes[mapBoxes.length - 1].col = fi.col;
        mapBoxes[mapBoxes.length - 1].icon = fi.badge;
        usedFac.add(b.type);
        pois.push({ x: sl.side * (ROAD_HW + SIDE_W - 1.8), z: cz, r: 2.9, kind: b.type, ...fi });
        placedReal = true;
      }
    }
    if (!placedReal) {
      if (era === 0 && realOk && RA.has('hut_tribal')) {
        const gm = RA.group('hut_tribal', true); gm.scale.setScalar(1.05);
        gm.position.set(cx, SIDE_H, cz); gm.rotation.y = r() * 6.28; scene.add(gm);
        addCol(cx, cz, 3.3, 3.3);
        mapBoxes.push({ x: cx, z: cz, w: 6.4, d: 6.4, col: '#9a7a54' });
      } else {
        const stories = cfg.storyMin + Math.floor(r() * (cfg.storyMax - cfg.storyMin + 1));
        const bw = 10.6 + r() * 1.1, bd = 9.2 + r() * 1.4;
        placeFacadeBuilding(cx, cz, faceDir, bw, bd, stories, Math.floor(r() * 12), shopName, isCross);
      }
    }
  }

  // 원경 스카이라인 실루엣
  if (era >= 3) {
    const skyBldMat = track(new THREE.MeshLambertMaterial({ color: era === 4 ? '#7c8694' : '#8a8278' }));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.15, dist = L + 22 + r() * 34;
      const w = 10 + r() * 14, d = 10 + r() * 14, h = (era === 4 ? 18 : 12) + r() * (era === 4 ? 26 : 12);
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), skyBldMat);
      m.position.set(Math.sin(a) * dist, h / 2, Math.cos(a) * dist); scene.add(m);
    }
  }

  // 10) 보도 위 노점 / 포장마차 (실제 식사 · 버프 POI 연결!)
  const stallSpots = [
    { side: 1, z: 20, title: era === 4 ? '종로 포장마차' : cfg.tavernName, poi: true },
    { side: -1, z: 28, title: era === 4 ? '떡볶이 · 어묵' : '과일 좌판', poi: false },
    { side: 1, z: -20, title: era === 4 ? '호떡 · 국수' : '비단 · 잡화', poi: false },
    { side: -1, z: -24, title: era === 4 ? '포장마차' : cfg.tavernName, poi: true },
  ];
  for (const st of stallSpots) {
    if (Math.abs(st.z) > L - 14) continue;
    const sx = st.side * (ROAD_HW + SIDE_W - 1.55), sz = st.z;
    const g = new THREE.Group(); g.position.set(sx, SIDE_H, sz);
    g.rotation.y = st.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    if (era === 4) {
      const pt = t3PojangTex(st.title);
      const frontM = track(new THREE.MeshLambertMaterial({ map: pt, emissive: '#ffbe66', emissiveMap: pt, emissiveIntensity: 0.25 }));
      emMats.push({ mat: frontM, max: 1.15, min: 0.25 });
      const tarpM = track(new THREE.MeshLambertMaterial({ color: '#e68428' }));
      const tent = new THREE.Mesh(track(new THREE.BoxGeometry(4.2, 2.35, 2.2)), [frontM, frontM, tarpM, tarpM, frontM, tarpM]);
      tent.position.y = 1.18; tent.castShadow = true; tent.receiveShadow = true; g.add(tent);
      const roof = new THREE.Mesh(track(w3dPrism(2.5, 0.72, 4.4).rotateY(Math.PI / 2)), tarpM);
      roof.position.y = 2.35; roof.castShadow = true; g.add(roof);
      for (let k = 0; k < 4; k++) {
        const stool = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.48, 0.42)), track(new THREE.MeshLambertMaterial({ color: k % 2 ? '#c9382e' : '#2a5ca8' })));
        stool.position.set(-1.35 + k * 0.9, 0.24, 1.38); stool.castShadow = true; g.add(stool);
      }
      lights.push({ x: sx - st.side * 1.2, y: 1.7, z: sz, col: new THREE.Color('#ffaa44'), k: 2.8, glow: 1.5, pool: 6.5 });
    } else {
      const wood = track(new THREE.MeshLambertMaterial({ color: '#6b4828' }));
      for (const [px, pz] of [[-1.6, -0.8], [1.6, -0.8], [-1.6, 0.8], [1.6, 0.8]]) {
        const p = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.07, 2.5, 5)), wood); p.position.set(px, 1.25, pz); p.castShadow = true; g.add(p);
      }
      const counter = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 0.92, 1.1)), track(new THREE.MeshLambertMaterial({ color: '#8a6038' })));
      counter.position.set(0, 0.46, 0.25); counter.castShadow = true; g.add(counter);
      const stripeCol = era === 0 ? '#a88454' : era === 1 ? '#c89852' : '#c44634';
      for (let k = 0; k < 5; k++) {
        const aw = new THREE.Mesh(track(new THREE.BoxGeometry(0.72, 0.1, 2.2)), track(new THREE.MeshLambertMaterial({ color: k % 2 ? '#f4ebd8' : stripeCol })));
        aw.position.set(-1.44 + k * 0.72, 2.52, 0); aw.rotation.x = 0.22; aw.castShadow = true; g.add(aw);
      }
      lights.push({ x: sx - st.side * 0.9, y: 2.1, z: sz, col: new THREE.Color('#ff9a38'), k: 2.2, glow: 1.1, pool: 5.5, fire: era <= 1 });
    }
    scene.add(g); addCol(sx, sz, 1.25, 2.2);
    if (st.poi) {
      pois.push({ x: sx - st.side * 2.0, z: sz, r: 2.8, kind: 'tavern', ...T3_FAC_INFO.tavern, name: st.title });
      mapBoxes.push({ x: sx, z: sz, w: 2.4, d: 4.2, col: '#ffaa44', icon: '식' });
    }
  }

  // 11) 가로수 + 수목보호대 + 가로등 + 벤치 + 교차로 신호등
  const planterMat = track(new THREE.MeshLambertMaterial({ color: era === 4 ? '#5c6068' : '#7a7468' }));
  const soilMat = track(new THREE.MeshLambertMaterial({ color: '#4c3e2c' }));
  const lampPostMat = track(new THREE.MeshLambertMaterial({ color: era >= 3 ? '#22262c' : '#5a3a20' }));
  const lampGlowMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(cfg.lampCol).multiplyScalar(1.6) }));
  const benchWood = track(new THREE.MeshLambertMaterial({ color: '#7a5230' }));
  const hasRealTree = realOk && RA.has('tree_broadleaf_a');
  const treeScale = 0.56;

  for (let z = gateZ - 14; z >= keepZ + 12; z -= 15) {
    if (Math.abs(z) < 12.5) continue;
    for (const sx of [-1, 1]) {
      const tx = sx * (ROAD_HW + 0.95);
      const pFrame = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 0.22, 1.5)), planterMat);
      pFrame.position.set(tx, SIDE_H + 0.11, z); pFrame.receiveShadow = true; pFrame.castShadow = true; scene.add(pFrame);
      const pSoil = new THREE.Mesh(track(new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2)), soilMat);
      pSoil.position.set(tx, SIDE_H + 0.23, z); scene.add(pSoil);
      if (hasRealTree) {
        const tk = (Math.abs(z) + sx) % 3 === 0 && RA.has('tree_broadleaf_b') ? 'tree_broadleaf_b' : 'tree_broadleaf_a';
        const tr = RA.group(tk, true); tr.scale.setScalar(treeScale); tr.position.set(tx, SIDE_H + 0.15, z); tr.rotation.y = r() * 6.28; scene.add(tr);
      } else {
        const tr = new THREE.Mesh(w3dPropGeo('round'), R3D.mats.vc); tr.scale.setScalar(5.2); tr.position.set(tx, SIDE_H + 0.15, z); tr.castShadow = true; scene.add(tr);
      }
      addCol(tx, z, 0.72, 0.72);

      // 나무 옆 벤치 (보도 안쪽)
      if (era >= 1 && Math.abs(z - 20) > 4 && Math.abs(z + 20) > 4) {
        const bg = new THREE.Group(); bg.position.set(sx * (ROAD_HW + 1.0), SIDE_H, z + 3.2); bg.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        const seat = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 0.1, 0.52)), benchWood); seat.position.y = 0.45; seat.castShadow = true; bg.add(seat);
        const back = new THREE.Mesh(track(new THREE.BoxGeometry(1.6, 0.44, 0.08)), benchWood); back.position.set(0, 0.72, -0.22); back.castShadow = true; bg.add(back);
        scene.add(bg);
      }

      // 가로등
      const lz = z - 7;
      if (Math.abs(lz) > 11.5 && lz > keepZ + 10) {
        const lx = sx * (ROAD_HW + 0.55), lh = cfg.lampH;
        const post = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.1, lh, 6)), lampPostMat);
        post.position.set(lx, SIDE_H + lh / 2, lz); post.castShadow = true; scene.add(post);
        const arm = new THREE.Mesh(track(new THREE.BoxGeometry(0.85, 0.07, 0.07)), lampPostMat);
        arm.position.set(lx - sx * 0.35, SIDE_H + lh - 0.1, lz); scene.add(arm);
        const bulb = new THREE.Mesh(track(new THREE.BoxGeometry(0.26, 0.34, 0.26)), lampGlowMat);
        bulb.position.set(lx - sx * 0.72, SIDE_H + lh - 0.26, lz); scene.add(bulb);
        lights.push({ x: lx - sx * 0.72, y: SIDE_H + lh - 0.26, z: lz, col: new THREE.Color(cfg.lampCol), k: 3.4, glow: 1.3, pool: 7.5, fire: cfg.lampFire });
      }
    }
  }

  // 12) 도로 위 움직이는 탈것 (시대별 마차/자동차)
  const vehicles = [];
  const lowQ = R3D.quality && R3D.quality() === 'low';
  if (era >= 1) {
    const vCols = era === 4 ? ['#2c4a7c', '#9a2e2a', '#d8d4c8', '#2a5a44', '#c88c2c'] : ['#d8ccb0', '#a85a3a', '#4a6a8a', '#b89a64'];
    const nVeh = lowQ ? 2 : 4;
    for (let i = 0; i < nVeh; i++) {
      const dir = i % 2 === 0 ? -1 : 1; // -1: 북행(오른쪽 차선 +2.1), +1: 남행(왼쪽 차선 -2.1)
      const laneX = dir < 0 ? 2.15 : -2.15;
      const v = t3MakeVehicle(era, vCols[i % vCols.length], track);
      const startZ = lerp(keepZ + 16, gateZ - 10, (i + 0.3) / nVeh);
      v.g.position.set(laneX, 0, startZ);
      v.g.rotation.y = dir > 0 ? 0 : Math.PI;
      scene.add(v.g);
      vehicles.push({ ...v, x: laneX, z: startZ, dir, spd: (era === 4 ? 6.2 : 3.4) + (i % 2) * 1.1, walk: i * 4 });
    }
  }

  // 13) 숨겨진 황금 보물 (매년 1회, 골목/광장 구석에 출현!)
  let relic = null;
  if (town.chestYear !== S.year) {
    const spots = [[-22, -6.2], [22, 6.2], [-26, 6.2], [24, -6.2], [-7.5, -18], [7.5, keepZ + 12]];
    const sp = spots[(town.id + S.year) % spots.length];
    const rg = new THREE.Group(); rg.position.set(sp[0], SIDE_H + 0.5, sp[1]);
    const chest = new THREE.Mesh(track(new THREE.BoxGeometry(0.75, 0.55, 0.52)), track(new THREE.MeshLambertMaterial({ color: '#c89228', emissive: '#9a6210', emissiveIntensity: 0.45 })));
    chest.castShadow = true; rg.add(chest);
    const gem = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.28, 0)), track(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 0.7) })));
    gem.position.y = 0.65; rg.add(gem);
    const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(0.32, 0.55, 5.5, 10, 1, true)),
      track(new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
    beam.position.y = 2.4; rg.add(beam);
    scene.add(rg);
    relic = { g: rg, gem, x: sp[0], z: sp[1], found: false };
    lights.push({ x: sp[0], y: 1.3, z: sp[1], col: new THREE.Color('#ffd452'), k: 3.0, glow: 1.6, pool: 4.5 });
  }

  // 14) 보행 주민 + 민원 주민(❗) + 경비병
  const citizens = [];
  const wantCit = clamp(8 + Math.floor(town.pop / 3), 10, lowQ ? 14 : 24);
  const roles = ['idle', 'trade', 'farm', 'chores', 'smith', 'study', 'water'];
  const hasPetition = town.petYear !== S.year;
  for (let i = 0; i < wantCit; i++) {
    const vl = eraVillager();
    const look = { body: vl.body, legs: vl.legs || '#3a3028', hat: vl.hat, helm: '#e8d8b0', role: 'villager', era, scale: 1 };
    const m = R3D.human(look);
    const cs = m.real ? 2.15 : 1.42;
    m.group.scale.setScalar(cs);
    const isPet = hasPetition && i === 0;
    const side = isPet ? 1 : (i % 2 === 0 ? -1 : 1);
    const laneX = isPet ? (ROAD_HW + 2.5) : side * (ROAD_HW + 2.3 + (r() - 0.5) * 1.3);
    const startZ = isPet ? 14.5 : lerp(keepZ + 12, gateZ - 6, r());
    const dir = r() < 0.5 ? 1 : -1;
    m.group.position.set(laneX, SIDE_H, startZ);
    scene.add(m.group);
    citizens.push({
      m, cs, x: laneX, z: startZ, y: SIDE_H, side, dir,
      spd: isPet ? 0 : 1.55 + r() * 0.85, walk: r() * 20, yaw: isPet ? 0 : (dir > 0 ? 0 : Math.PI),
      wait: isPet ? 9999 : (r() < 0.2 ? 1 + r() * 3 : 0), talkT: 0, talked: false, petition: isPet,
      name: EV_NAMES[(i * 3 + town.id) % EV_NAMES.length],
      role: roles[i % roles.length],
    });
  }
  const garrison = typeof locTotal === 'function' ? locTotal(town.id) : 0;
  const guards = [];
  const gSpots = [[-(ROAD_HW + 1.6), gateZ - 2.6, 0], [+(ROAD_HW + 1.6), gateZ - 2.6, 0], [-3.8, keepZ + 7.2, 0], [+3.8, keepZ + 7.2, 0]];
  const nGuard = Math.min(gSpots.length, garrison > 0 ? Math.max(2, Math.min(4, Math.ceil(garrison / 3))) : 2);
  for (let i = 0; i < nGuard; i++) {
    const lk = Object.assign(eraLook('ally'), { scale: 1 });
    const m = R3D.human(lk);
    const cs = m.real ? 2.22 : 1.48;
    m.group.scale.setScalar(cs);
    const [gx, gz, gy] = gSpots[i];
    m.group.position.set(gx, SIDE_H, gz);
    m.pose({ walk: 0, moving: false, swing: 0, yaw: gy });
    scene.add(m.group);
    guards.push({ m, x: gx, z: gz, y: SIDE_H, yaw: gy, talkT: 0, talked: false, name: ['수문장', '경비대장', '근위병', '파수병'][i], role: 'guard' });
  }

  // 15) 영주 (플레이어) + 말 타고 산책 지원!
  const pLook = Object.assign(eraLook('player'), { scale: 1 });
  const playerM = R3D.human(pLook);
  const pScale = playerM.real ? 2.25 : 1.5;
  playerM.group.scale.setScalar(pScale);
  scene.add(playerM.group);

  const canRide = !!(S.player.mounted || S.horses.length || S.buildings.some(b => b.type === 'stable'));
  let horseM = null;
  if (canRide) {
    const rh = S.horses.find(h => h.ridden) || S.horses[0];
    horseM = R3D.horse(rh ? rh.col : '#8b5a2b', R3D.CLOTH.king);
    horseM.group.scale.setScalar(1.55);
    horseM.group.visible = !!S.player.mounted;
    scene.add(horseM.group);
  }

  // 상호작용 바닥 고리
  const poiRings = pois.map(p => {
    const ring = new THREE.Mesh(
      track(new THREE.RingGeometry(0.95, 1.25, 28).rotateX(-Math.PI / 2)),
      track(new THREE.MeshBasicMaterial({ color: new THREE.Color(p.col).multiplyScalar(1.6), transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }))
    );
    ring.position.set(p.x, (Math.abs(p.x) > ROAD_HW ? SIDE_H : 0) + 0.05, p.z);
    ring.renderOrder = 4; scene.add(ring);
    return ring;
  });

  // 낮 꽃가루 / 밤 반딧불이 입자
  const PN = lowQ ? 40 : 90;
  const pPos = new Float32Array(PN * 3), pSeed = new Float32Array(PN * 3);
  for (let i = 0; i < PN; i++) {
    pSeed[i * 3] = (r() - 0.5) * 44; pSeed[i * 3 + 1] = 0.6 + r() * 4.5; pSeed[i * 3 + 2] = (r() - 0.5) * (L * 1.6);
  }
  const pGeo = track(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = track(new THREE.PointsMaterial({ color: 0xffe890, size: 0.14, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending }));
  const ambPts = new THREE.Points(pGeo, pMat); ambPts.frustumCulled = false; scene.add(ambPts);

  return {
    active: true, town, era, lv, L, W_CROSS, ROAD_HW, SIDE_W, SIDE_H, gateZ, keepZ,
    scene, cam, hemi, sun, pts, sky, glows, pools, blobs, own,
    colliders, pois, poiRings, mapBoxes, lights, flags, emMats, ledStrips, fountainSpray,
    vehicles, relic, citizens, guards, playerM, pScale, horseM, canRide, mounted: !!S.player.mounted,
    ambPts, pSeed,
    // 스폰: 넓은 보도 가운데(px=6.2), 전신 구도 & 긴 소실점이 막힘없이 열림!
    px: 6.2, pz: gateZ - 4.0, py: SIDE_H, pYaw: Math.PI, walk: 0, moving: false, sprint: false,
    camYaw: 0, camPitch: 0.12, camBack: 4.9,
    greeted: 0, nearPoi: null, nearCit: null, nearRelic: false, talk: null,
    exitCool: 0.8, lastT: performance.now(),
  };
}

// ---------- 진입 / 퇴장 ----------
let t3ExitGrace = 0;

function enterTown(town) {
  if (!USE3D || !town || !S) return;
  if (MODE === 'battle') return;
  if (typeof FREE !== 'undefined' && FREE && typeof freeSet === 'function') freeSet(false);
  auto = null; actHeld = false; paused = false;
  if (T3) exitTown(true);
  T3 = t3BuildScene(town);
  MODE = 'town';
  document.body.classList.add('town');
  document.body.classList.remove('tp', 'free');
  lookHook = t3Look;
  banner(`🏘️ ${town.name} ${eraCur().town}`, 'WASD/조이스틱 이동 · 끌기 시선 · E/탭 대화 및 시설 이용', 2.6);
  t3Resize();
}

function exitTown(silent) {
  if (!T3) return;
  const town = T3.town;
  for (const c of T3.citizens) if (c.m.dispose) c.m.dispose();
  for (const g of T3.guards) if (g.m.dispose) g.m.dispose();
  for (const v of T3.vehicles) if (v.horse && v.horse.dispose) v.horse.dispose();
  if (T3.playerM && T3.playerM.dispose) T3.playerM.dispose();
  if (T3.horseM && T3.horseM.dispose) T3.horseM.dispose();
  for (const o of T3.own) { try { o.dispose(); } catch (e) {} }
  T3.active = false; T3 = null;
  MODE = 'world';
  document.body.classList.remove('town');
  lookHook = null;
  $('talkBox').classList.remove('show');
  if ($('townPanel')) $('townPanel').classList.remove('show');
  if ($('townPrompt')) $('townPrompt').style.display = 'none';
  if ($('townActBtn')) $('townActBtn').style.display = 'none';
  if ($('townRideBtn')) $('townRideBtn').style.display = 'none';
  if ($('townRunBtn')) $('townRunBtn').classList.remove('on');
  if (!silent && town && S && S.player) {
    const r = 3.1 + townLevel(town) * 0.65;
    const nx = (town.x + 0.5) * T, ny = (town.y + 0.5 + r) * T;
    if (passable(nx, ny)) { S.player.x = nx; S.player.y = ny; }
    t3ExitGrace = 3.5;
    if (typeof freeInTown !== 'undefined') freeInTown = false;
    banner('🗺️ 오픈월드', `${town.name} 밖으로 나왔습니다`, 1.6);
  }
}

function t3Look(dx, dy) {
  if (!T3 || MODE !== 'town') return;
  T3.camYaw += dx * 0.0065;
  T3.camPitch = clamp(T3.camPitch + (dy || 0) * 0.0045, -0.18, 0.52);
}

function t3Resize() {
  if (!T3) return;
  const c = T3.cam; c.aspect = VW / VH;
  c.fov = c.aspect < 1 ? 66 : 56;
  c.updateProjectionMatrix();
}
if (typeof R3D !== 'undefined' && R3D.onResize) R3D.onResize.push(t3Resize);

function t3ResolveCol(x, z, rad) {
  const S3 = T3;
  x = clamp(x, -S3.W_CROSS + 2, S3.W_CROSS - 2);
  z = clamp(z, S3.keepZ + 5.2, S3.gateZ + 2.2);
  for (let it = 0; it < 2; it++) {
    for (const c of S3.colliders) {
      const dx = x - c.x, dz = z - c.z, ox = c.hx + rad - Math.abs(dx), oz = c.hz + rad - Math.abs(dz);
      if (ox > 0 && oz > 0) { if (ox < oz) x += dx < 0 ? -ox : ox; else z += dz < 0 ? -oz : oz; }
    }
  }
  return { x, z };
}

function t3GroundY(x, z) {
  const S3 = T3;
  if (Math.abs(x) < S3.ROAD_HW && Math.abs(z) > 12) return 0;
  if (Math.abs(z) < S3.ROAD_HW && Math.abs(x) > 12) return 0;
  if (Math.abs(x) <= 12 && Math.abs(z) <= 12) return 0.02;
  return S3.SIDE_H;
}

// ---------- 마을 내 패널 (포장마차 · 대장간 · 주민 민원) ----------
function t3ClosePanel() {
  if ($('townPanel')) $('townPanel').classList.remove('show');
  paused = false;
}

function t3OpenTavern(title) {
  if (!T3) return;
  paused = true;
  const cfg = T3_ERA_CFG[T3.era];
  const cA = 12 + T3.era * 6, cB = 20 + T3.era * 10;
  const hpNow = `${Math.ceil(S.player.hp)}/${heroMaxHp()}`;
  const bTxt = [
    S.buffs && S.buffs.atkT > 0 ? `⚔️ 공격 +25% (${Math.ceil(S.buffs.atkT)}초)` : '',
    S.buffs && S.buffs.spdT > 0 ? `⚡ 이동 +22% (${Math.ceil(S.buffs.spdT)}초)` : '',
  ].filter(Boolean).join(' · ');
  $('townPanel').innerHTML = `
    <h2>🍲 ${title || cfg.tavernName}</h2>
    <div class="sub">따끈한 식사로 체력을 회복하고 개척·전투 버프를 받으세요.<br>현재 체력 ❤️ ${hpNow} · 보유 🪙 ${S.gold}${bTxt ? `<br><b style="color:var(--accent)">적용 중: ${bTxt}</b>` : ''}</div>
    <button class="opt" data-ta="foodA" ${S.gold < cA ? 'disabled' : ''}><span class="ic">🍜</span><span>${cfg.foodA[0]}<small>${cfg.foodA[1]} · 🪙${cA}</small></span></button>
    <button class="opt primary" data-ta="foodB" ${S.gold < cB ? 'disabled' : ''}><span class="ic">🍖</span><span>${cfg.foodB[0]}<small>${cfg.foodB[1]} · 🪙${cB}</small></span></button>
    <button class="close" data-ta="close">닫기</button>`;
  $('townPanel').classList.add('show');
}

function t3GearCost(kind, lv) {
  const n = lv + 1;
  if (kind === 'wpn') return { wood: 10 * n, stone: 8 * n, gold: 15 * n };
  if (kind === 'arm') return { wood: 8 * n, stone: 12 * n, gold: 15 * n };
  return { wood: 14 * n, gold: 18 * n };
}

function t3OpenSmith() {
  if (!T3) return;
  paused = true;
  if (!S.gear) S.gear = { wpn: 0, arm: 0, mnt: 0 };
  const items = [
    { k: 'wpn', ic: '⚔️', nm: '군주의 무기', lv: S.gear.wpn, desc: '들판 공격력 +1 · 전장 공격력 +14%' },
    { k: 'arm', ic: '🛡️', nm: '군주의 갑옷', lv: S.gear.arm, desc: '들판 체력 +3 · 전장 체력 +8' },
    { k: 'mnt', ic: '🐴', nm: '군마 안장·편자', lv: S.gear.mnt, desc: '들판·마을 이동속도 +8%' },
  ];
  let h = `<h2>🔨 ${T3.town.name} 대장간</h2><div class="sub">영주 장비를 영구 강화합니다. (들판·전투 모두 적용)<br>보유: 🪵${S.wood} · 🪨${S.stone} · 🪙${S.gold}</div>`;
  for (const it of items) {
    const max = it.lv >= 5, cost = t3GearCost(it.k, it.lv), ok = !max && canAfford(cost);
    h += `<button class="opt${ok ? '' : ' locked'}" data-ta="gear" data-gk="${it.k}" ${ok ? '' : 'disabled'}><span class="ic">${it.ic}</span><span>${it.nm} <b>+${it.lv}</b>${max ? ' (최고)' : ''}<small>${it.desc}${max ? '' : ' · ' + costText(cost)}</small></span></button>`;
  }
  h += `<button class="close" data-ta="close">닫기</button>`;
  $('townPanel').innerHTML = h;
  $('townPanel').classList.add('show');
}

function t3BoostMorale(sec, reason) {
  if (!T3 || !T3.town) return;
  T3.town.moraleT = Math.max(T3.town.moraleT || 0, sec || 240);
  toast(`✨ ${T3.town.name} 민심 고조! ${reason || '4분간 세금 수입 +25%'}`, 3);
  save();
}

function t3OpenPetition(cit) {
  if (!T3) return;
  paused = true;
  const e = T3.era, idx = (T3.town.id + S.year) % 3;
  T3._petCit = cit; T3._petIdx = idx;
  let h = '';
  if (idx === 0) {
    const inv = 25 + e * 15;
    h = `<h2>❗ 상단의 교역 투자 청원</h2>
      <div class="evquote">"${EV_HAIL[e]}! 이웃 고을로 특산품을 실어 나르려 합니다. 밑천 🪙${inv}만 대어 주시면 큰 이문을 남겨 돌아오겠습니다!"</div>
      <button class="opt primary" data-ta="petA" ${S.gold < inv ? 'disabled' : ''}><span class="ic">💰</span><span>교역 투자 승인 (🪙${inv})<small>성공 시 금화 2배(🪙${inv * 2}) · 최소 원금+경험치 보장</small></span></button>
      <button class="opt" data-ta="petB"><span class="ic">🤝</span><span>통행세만 면제해 주겠다<small>비용 없음 · 민심 고조(세금+25%) + 경험치 +15</small></span></button>`;
  } else if (idx === 1) {
    const costW = 15 + e * 8, costG = 20 + e * 12;
    h = `<h2>❗ 떠돌이 명장의 정착 청원</h2>
      <div class="evquote">"${EV_HAIL[e]}, 저의 솜씨를 이 고을에 바치고 싶습니다. 작업장만 마련해 주시면 왕국 전체의 자원 생산을 끌어올리겠습니다!"</div>
      <button class="opt primary" data-ta="petA" ${S.wood < costW || S.gold < costG ? 'disabled' : ''}><span class="ic">⚒️</span><span>작업장 지원 (🪵${costW} 🪙${costG})<small>왕국 전체 자원 생산량 영구 +8% (현재 +${(S.artisan || 0) * 8}%)</small></span></button>
      <button class="opt" data-ta="petB"><span class="ic">👥</span><span>정착만 환영한다<small>비용 없음 · 마을 인구 +2 · 민심 고조</small></span></button>`;
  } else {
    const fest = 20 + e * 12;
    h = `<h2>❗ 마을 장날 축제 건의</h2>
      <div class="evquote">"${EV_HAIL[e]}! 백성들이 고된 개척에 지쳐 있습니다. 조촐한 장터 축제를 열어 주시면 사기가 하늘을 찌를 것입니다!"</div>
      <button class="opt primary" data-ta="petA" ${S.gold < fest ? 'disabled' : ''}><span class="ic">🎉</span><span>축제 후원 (🪙${fest})<small>인구 +3 · 5분간 세금 +25% · 경험치 +30</small></span></button>
      <button class="opt" data-ta="petB"><span class="ic">🪙</span><span>지금은 국고를 아끼자 (특별 징수)<small>즉시 금화 +${15 + e * 10} 획득</small></span></button>`;
  }
  h += `<button class="close" data-ta="close">나중에 결정</button>`;
  $('townPanel').innerHTML = h;
  $('townPanel').classList.add('show');
}

if ($('townPanel')) $('townPanel').addEventListener('click', ev => {
  const btn = ev.target.closest('button'); if (!btn || btn.disabled) return;
  const a = btn.dataset.ta;
  if (a === 'close') { t3ClosePanel(); return; }
  if (!T3) { t3ClosePanel(); return; }
  const e = T3.era;
  if (a === 'foodA' || a === 'foodB') {
    const cost = a === 'foodA' ? 12 + e * 6 : 20 + e * 10;
    if (S.gold < cost) return;
    S.gold -= cost; S.player.hp = heroMaxHp();
    if (!S.buffs) S.buffs = { atkT: 0, spdT: 0 };
    if (a === 'foodA') { S.buffs.spdT = 180; toast('🍜 든든한 한 끼! 체력 회복 + 3분간 이동속도 +22%', 3); }
    else { S.buffs.atkT = 180; toast('🍖 특선 만찬! 체력 회복 + 3분간 공격력 +25%', 3); }
    save(); t3ClosePanel(); return;
  }
  if (a === 'gear') {
    const k = btn.dataset.gk, lv = S.gear[k] || 0, cost = t3GearCost(k, lv);
    if (lv >= 5 || !canAfford(cost)) return;
    pay(cost); S.gear[k] = lv + 1;
    if (k === 'arm') S.player.hp = heroMaxHp();
    toast(`🔨 강화 성공! ${k === 'wpn' ? '무기' : k === 'arm' ? '갑옷' : '군마'} +${lv + 1}`, 2.5);
    save(); t3OpenSmith(); return;
  }
  if (a === 'petA' || a === 'petB') {
    const idx = T3._petIdx, cit = T3._petCit;
    T3.town.petYear = S.year;
    if (cit) { cit.petition = false; cit.wait = 1; cit.spd = 1.6; }
    if (idx === 0) {
      if (a === 'petA') {
        const inv = 25 + e * 15; S.gold -= inv;
        if (rand() < 0.72) { S.gold += inv * 2; gainExp(25); banner('💰 교역 대성공!', `금화 +${inv * 2} · 경험치 +25`, 2.6); }
        else { S.gold += inv; gainExp(20); banner('📦 무사 귀환', `원금 회수 + 경험치 +20`, 2.4); }
      } else { gainExp(15); t3BoostMorale(240, '통행세 면제로 민심 상승! 세금 +25%'); }
    } else if (idx === 1) {
      if (a === 'petA') {
        const costW = 15 + e * 8, costG = 20 + e * 12;
        S.wood -= costW; S.gold -= costG; S.artisan = (S.artisan || 0) + 1; gainExp(30);
        banner('⚒️ 명장 합류!', `왕국 자원 생산력 영구 +8% (총 +${S.artisan * 8}%)`, 3);
      } else { T3.town.pop += 2; t3BoostMorale(240, '인구 +2 · 4분간 세금 +25%'); }
    } else {
      if (a === 'petA') {
        const fest = 20 + e * 12; S.gold -= fest; T3.town.pop += 3; gainExp(30);
        t3BoostMorale(300, '축제 대성황! 인구 +3 · 5분간 세금 +25%');
      } else { const g = 15 + e * 10; S.gold += g; toast(`🪙 특별 세금 🪙+${g} 징수`, 2.5); }
    }
    save(); t3ClosePanel(); return;
  }
});

// ---------- 업데이트 ----------
function updateTown3D(dt) {
  const S3 = T3; if (!S3 || !S3.active) return;
  S.time += dt;
  if (typeof tickBuffs === 'function') tickBuffs(dt);
  if (typeof eraTick === 'function') eraTick(dt);
  if (S3.exitCool > 0) S3.exitCool -= dt;

  if (keys['q']) S3.camYaw -= dt * 1.9;
  if (keys['e'] && !S3.nearPoi && !S3.nearCit && !S3.nearRelic) S3.camYaw += dt * 1.9;

  // 이동 (말 탑승 + 장비 + 식사 버프 속도 반영!)
  const mv = moveInput();
  const sprint = !!(keys['shift'] || S3.sprint || mv.l > 0.92);
  S3.moving = mv.l > 0.08;
  if (S3.moving) {
    const cy = Math.cos(S3.camYaw), sy = Math.sin(S3.camYaw);
    const wx = mv.x * cy - mv.y * sy, wz = mv.x * sy + mv.y * cy;
    const gearSpd = (1 + (S.gear ? S.gear.mnt * 0.08 : 0)) * (S.buffs && S.buffs.spdT > 0 ? 1.22 : 1);
    const baseSpd = S3.mounted ? (sprint ? 10.8 : 7.0) : (sprint ? 6.8 : 3.7);
    const sp = baseSpd * gearSpd * Math.max(0.45, mv.l);
    const p = t3ResolveCol(S3.px + wx * sp * dt, S3.pz + wz * sp * dt, S3.mounted ? 0.65 : 0.42);
    S3.px = p.x; S3.pz = p.z;
    const tgtYaw = Math.atan2(wx, wz);
    S3.pYaw += angDiff(tgtYaw, S3.pYaw) * Math.min(1, dt * 12);
    S3.walk += dt * (sprint ? 11 : 6.5);
    if (mv.y < -0.25 && Math.abs(mv.x) > 0.15) {
      const hy = Math.atan2(wx, -wz);
      S3.camYaw += angDiff(hy, S3.camYaw) * Math.min(1, dt * 0.9);
    }
  }
  const ty = t3GroundY(S3.px, S3.pz);
  S3.py += (ty - S3.py) * Math.min(1, dt * 16);

  if (S3.exitCool <= 0 && S3.pz > S3.gateZ + 0.8 && Math.abs(S3.px) < 5.5) { exitTown(false); return; }

  // 플레이어 & 말 포즈
  if (S3.mounted && S3.horseM) {
    S3.horseM.group.visible = true;
    S3.horseM.group.position.set(S3.px, S3.py, S3.pz);
    S3.horseM.pose({ walk: S3.walk * 0.7, moving: S3.moving, ridden: true, yaw: S3.pYaw });
    S3.playerM.pose({ sit: true, swing: 0, yaw: S3.pYaw });
    R3D.ride(S3.horseM, S3.playerM.group, S3.px, S3.py, S3.pz, 1.55);
  } else {
    if (S3.horseM) S3.horseM.group.visible = false;
    S3.playerM.pose({ walk: S3.walk, moving: S3.moving, slow: !sprint, swing: 0, yaw: S3.pYaw });
    S3.playerM.group.position.set(S3.px, S3.py, S3.pz);
  }

  // 도로 위 움직이는 탈것 업데이트
  for (const v of S3.vehicles) {
    // 플레이어나 광장 중앙과 너무 가까우면 잠깐 멈춤(안전 주행)
    const aheadZ = v.z + v.dir * 3.8;
    const blocked = Math.abs(S3.px - v.x) < 1.8 && Math.abs(S3.pz - aheadZ) < 3.6;
    if (!blocked) {
      v.z += v.dir * v.spd * dt;
      v.walk += dt * v.spd * 2.2;
      if (v.z < S3.keepZ + 12) v.z = S3.gateZ - 6;
      if (v.z > S3.gateZ - 5) v.z = S3.keepZ + 13;
    }
    v.g.position.set(v.x, 0, v.z);
    if (v.horse) v.horse.pose({ walk: v.walk, moving: !blocked, ridden: false, yaw: 0 });
  }

  // 숨겨진 황금 보물 회전 & 근접 감지
  S3.nearRelic = false;
  if (S3.relic && !S3.relic.found) {
    S3.relic.gem.rotation.y = S.time * 2.4;
    S3.relic.gem.position.y = 0.68 + Math.sin(S.time * 3.5) * 0.1;
    if (Math.hypot(S3.px - S3.relic.x, S3.pz - S3.relic.z) < 2.6) S3.nearRelic = true;
  }

  // 보행 주민 업데이트
  for (const c of S3.citizens) {
    if (c.talkT > 0 || c.petition) {
      if (c.talkT > 0) c.talkT -= dt;
      const d2 = (c.x - S3.px) ** 2 + (c.z - S3.pz) ** 2;
      if (c.talkT > 0 || d2 < 36) {
        const dy = Math.atan2(S3.px - c.x, S3.pz - c.z);
        c.yaw += angDiff(dy, c.yaw) * Math.min(1, dt * 10);
      }
      c.m.pose({ walk: c.walk, moving: false, slow: true, swing: 0, yaw: c.yaw });
      continue;
    }
    if (c.wait > 0) { c.wait -= dt; c.m.pose({ walk: c.walk, moving: false, slow: true, swing: 0, yaw: c.yaw }); continue; }
    const nz = c.z + c.dir * c.spd * dt;
    if (nz > S3.gateZ - 4 || nz < S3.keepZ + 11) { c.dir *= -1; c.wait = 0.6 + rand() * 1.4; }
    else {
      const d2 = (c.x - S3.px) ** 2 + (nz - S3.pz) ** 2;
      if (d2 > 1.2 * 1.2) { c.z = nz; c.walk += dt * c.spd * 3.2; } else c.wait = 0.5;
    }
    const tyaw = c.dir > 0 ? 0 : Math.PI;
    c.yaw += angDiff(tyaw, c.yaw) * Math.min(1, dt * 8);
    c.y = t3GroundY(c.x, c.z);
    c.m.group.position.set(c.x, c.y, c.z);
    c.m.pose({ walk: c.walk, moving: c.wait <= 0, slow: true, swing: 0, yaw: c.yaw });
  }
  for (const g of S3.guards) {
    if (g.talkT > 0) g.talkT -= dt;
    const d2 = (g.x - S3.px) ** 2 + (g.z - S3.pz) ** 2;
    const tyaw = d2 < 25 ? Math.atan2(S3.px - g.x, S3.pz - g.z) : g.yaw;
    g.m.pose({ walk: 0, moving: false, swing: 0, yaw: tyaw });
  }

  // 가까운 시설 / 주민 탐지
  let bestP = null, bdP = 1e9;
  for (const p of S3.pois) { const d = Math.hypot(S3.px - p.x, S3.pz - p.z); if (d < p.r && d < bdP) { bdP = d; bestP = p; } }
  S3.nearPoi = bestP;

  let bestC = null, bdC = 3.2;
  for (const c of S3.citizens.concat(S3.guards)) { const d = Math.hypot(S3.px - c.x, S3.pz - c.z); if (d < bdC) { bdC = d; bestC = c; } }
  S3.nearCit = bestC;

  if (S3.talk) {
    S3.talk.t -= dt;
    if (S3.talk.t <= 0 || Math.hypot(S3.px - S3.talk.c.x, S3.pz - S3.talk.c.z) > 8) { S3.talk = null; $('talkBox').classList.remove('show'); }
  }
}

// ---------- 상호작용 ----------
function t3Say(c) {
  if (!c || !T3) return;
  if (c.petition) { t3OpenPetition(c); return; }
  const e = clamp(S.era | 0, 0, ERAS.length - 1);
  c.talkT = 5.5;
  if (!c.talked) {
    c.talked = true; T3.greeted++;
    if (T3.greeted === 2 && !(T3.town.moraleT > 60)) t3BoostMorale(240, '영주 순시 효과! 4분간 세금 +25%');
  }
  let roleLabel, line;
  if (c.role === 'guard') {
    roleLabel = c.name;
    const GL = [`${EV_HAIL[e]}! ${T3.town.name} 거리는 오늘도 평온합니다.`, `성문 경계 이상 없습니다! 언제든 명령만 내리십시오.`, `최근 산적들이 얼씬거리지 못하도록 순찰을 강화했습니다.`];
    line = GL[ri(GL.length)];
  } else {
    roleLabel = (VROLE[c.role] || VROLE.idle)[e] + ' ' + c.name;
    const L = (VLINES[c.role] || VLINES.idle)[e];
    line = rand() < 0.3 ? `${EV_HAIL[e]}! ${L[ri(L.length)]}` : L[ri(L.length)];
  }
  T3.talk = { c, t: 5.5, html: `<b>${roleLabel}</b>${line}` };
  $('talkBox').innerHTML = T3.talk.html;
  $('talkBox').classList.add('show');
}

function t3CollectRelic() {
  if (!T3 || !T3.relic || T3.relic.found) return;
  T3.relic.found = true; T3.relic.g.visible = false;
  T3.town.chestYear = S.year;
  const g = 35 + T3.era * 18 + T3.lv * 6, xp = 25;
  S.gold += g; gainExp(xp);
  banner('✨ 숨겨진 황금 보물 발견!', `🪙 +${g} · ⭐ 경험치 +${xp}`, 2.8);
  save();
}

function t3Interact() {
  if (!T3 || MODE !== 'town' || paused) return;
  if (T3.nearRelic) { t3CollectRelic(); return; }
  if (T3.nearCit && T3.nearCit.petition) { t3OpenPetition(T3.nearCit); return; }
  if (T3.nearPoi) {
    const a = T3.nearPoi.act;
    if (a === 'exit') { exitTown(false); return; }
    if (a === 'tavern') { t3OpenTavern(T3.nearPoi.name); return; }
    if (a === 'smith') { t3OpenSmith(); return; }
    if (a === 'build') { const t = T3.town; S.player.x = (t.x + 0.5) * T; S.player.y = (t.y + 0.5) * T; openBuild(true); return; }
    if (a === 'tech') { if (typeof openTechPanel === 'function') openTechPanel(); return; }
    if (a === 'army') { if (typeof openArmyPanel === 'function') openArmyPanel(); return; }
    if (a === 'board') { if (typeof evBoard === 'function') evBoard(); return; }
  }
  if (T3.nearCit) t3Say(T3.nearCit);
}

tapHooks.push((sx, sy) => {
  if (MODE !== 'town' || !T3 || paused) return;
  const pr = {};
  let best = null, bd = 68 * 68;
  for (const c of T3.citizens.concat(T3.guards)) {
    if ((c.x - T3.px) ** 2 + (c.z - T3.pz) ** 2 > 14 * 14) continue;
    R3D.project(c.x, c.y + 1.35, c.z, pr); if (!pr.vis) continue;
    const d = (pr.x - sx) ** 2 + (pr.y - sy) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  if (best) {
    if (Math.hypot(best.x - T3.px, best.z - T3.pz) < 5.5) t3Say(best);
    else toast('조금 더 가까이 가서 말을 걸어 보세요', 1.5);
    return;
  }
  if (T3.nearRelic || T3.nearPoi) t3Interact();
});

keyHooks.push((k, down) => {
  if (!down || MODE !== 'town' || !T3 || paused) return;
  if (k === 'e' || k === ' ' || k === 'f') { if (T3.nearRelic || T3.nearPoi || T3.nearCit) t3Interact(); }
  if (k === 'r' && T3.canRide) { T3.mounted = !T3.mounted; S.player.mounted = T3.mounted; toast(T3.mounted ? '🐴 말에 올랐습니다' : '🚶 말에서 내렸습니다', 1.4); }
  if (k === 'escape') exitTown(false);
});

// ---------- 렌더링 ----------
const t3SunDir = new THREE.Vector3(), t3C1 = new THREE.Color(), t3CarHead = new THREE.Color('#fff0c0'), t3CarTail = new THREE.Color('#ff3020');
function drawTown3D() {
  const S3 = T3; if (!S3 || !S3.active) return;
  const now = performance.now(), dt = Math.min(0.1, (now - S3.lastT) / 1000); S3.lastT = now;
  R3D.tick(dt);
  const tm = S.time;
  if (typeof RA !== 'undefined' && RA.U) { RA.U.time.value = tm; RA.U.chop.value.z = 0; if (RA.U.fade) RA.U.fade.value.set(0, 0, 0, 0); }

  // 3인칭 전신 추적 카메라 (서울 러시 구도: 영주 전신 + 양옆 상가 + 긴 소실점)
  const fx = Math.sin(S3.camYaw), fz = -Math.cos(S3.camYaw);
  const rx = Math.cos(S3.camYaw), rz = Math.sin(S3.camYaw);
  let wantBack = S3.mounted ? 5.6 : 4.9;
  for (let d = 1.0; d <= wantBack; d += 0.35) {
    const cx = S3.px - fx * d + rx * 0.24 * (d / wantBack);
    const cz = S3.pz - fz * d + rz * 0.24 * (d / wantBack);
    if (S3.colliders.some(c => Math.abs(cx - c.x) < c.hx + 0.15 && Math.abs(cz - c.z) < c.hz + 0.15)) {
      wantBack = Math.max(2.1, d - 0.35); break;
    }
  }
  S3.camBack += (wantBack - S3.camBack) * Math.min(1, dt * 10);
  const B = S3.camBack, cp = Math.cos(S3.camPitch), sp = Math.sin(S3.camPitch);
  const camX = S3.px - fx * B * cp + rx * 0.24 * (B / 4.9);
  const camY = S3.py + (S3.mounted ? 2.45 : 2.15) + B * sp;
  const camZ = S3.pz - fz * B * cp + rz * 0.24 * (B / 4.9);
  S3.cam.position.set(camX, camY, camZ);
  S3.cam.lookAt(S3.px + fx * 10 + rx * 0.15, S3.py + (S3.mounted ? 1.7 : 1.32) - sp * 1.1, S3.pz + fz * 10 + rz * 0.15);
  S3.cam.updateMatrixWorld();

  // 시간대별 조명 · 하늘 · 안개
  const ph = ((S.time / DAY_LEN) + 0.08) % 1, K = w3dKey(ph), d = dayInfo();
  const night = clamp(d.dark / 0.6, 0, 1), on = K.on;
  const day = ph < 0.5, ang = (day ? ph : ph - 0.5) * 2 * Math.PI;
  t3SunDir.set(Math.cos(ang) * 0.85 + 0.25, 0.32 + Math.max(0, Math.sin(ang)) * 0.72, 0.48).normalize();

  S3.scene.background.copy(K.fog); S3.scene.fog.color.copy(K.fog);
  S3.scene.fog.near = lerp(44, 24, on); S3.scene.fog.far = lerp(142, 88, on);
  S3.sun.color.copy(K.sun); S3.sun.intensity = K.sI * 1.18;
  S3.hemi.color.copy(K.sky); S3.hemi.groundColor.copy(K.gnd); S3.hemi.intensity = K.hI * 1.08;
  if (S3.sky) S3.sky.update(K, t3SunDir, night, tm, 1.0);

  // 텍셀 스냅 그림자
  {
    const sh = 28, texel = (sh * 2) / Math.max(256, S3.sun.shadow.mapSize.x || 1024);
    const sx = Math.round((S3.px + fx * 8) / texel) * texel, sz = Math.round((S3.pz + fz * 8) / texel) * texel;
    S3.sun.target.position.set(sx, 0, sz);
    S3.sun.position.copy(t3SunDir).multiplyScalar(55).add(S3.sun.target.position);
    S3.sun.target.updateMatrixWorld();
  }

  const G = R3D.grade;
  G.exposure = K.ex * 1.02; G.bloom = K.bl; G.threshold = K.th; G.knee = 0.6;
  G.sat = K.sat; G.contrast = K.con; G.lift.copy(K.lift); G.gain.copy(K.gain); G.vignette = K.vig * 0.85;
  R3D.renderer.toneMappingExposure = R3D.fx && R3D.fx.on ? 1 : K.ex;
  if (R3D.uWin) { R3D.uWin.value = on * 1.7; R3D.uWinLit.value = 0.78; }
  if (R3D.uUp) R3D.uUp.value.setRGB(1.0, 0.58, 0.28).multiplyScalar(on * 0.75);
  if (R3D.uRim) R3D.uRim.value.setRGB(1.0, 0.94, 0.84).multiplyScalar(0.24).lerp(t3C1.setRGB(0.45, 0.55, 1.0).multiplyScalar(0.14), on);
  for (const e of S3.emMats) e.mat.emissiveIntensity = lerp(e.min || 0, e.max, on);

  // 바닥 신호등 LED (10초 주기로 초록↔빨강 전환)
  if (S3.ledStrips.length) {
    const green = Math.floor(tm / 10) % 2 === 0;
    for (const lm of S3.ledStrips) lm.color.setRGB(green ? 0.18 : 2.2, green ? 2.2 : 0.22, green ? 0.72 : 0.18);
  }
  // 분수 물줄기 애니메이션
  if (S3.fountainSpray) {
    const pa = S3.fountainSpray.geometry.attributes.position.array;
    for (let i = 0; i < 48; i++) {
      const ph2 = (tm * 1.15 + i / 48) % 1, a = i * 2.39996, rad = 0.35 + ph2 * 1.85;
      pa[i * 3] = Math.cos(a) * rad;
      pa[i * 3 + 1] = 1.15 + 2.4 * ph2 * (1 - ph2) * 3.8;
      pa[i * 3 + 2] = Math.sin(a) * rad;
    }
    S3.fountainSpray.geometry.attributes.position.needsUpdate = true;
  }

  for (const f of S3.flags) w3dWave(f, tm);
  S3.poiRings.forEach((rg, i) => { const s = 1 + Math.sin(tm * 4 + i) * 0.08; rg.scale.set(s, 1, s); });

  // 가로등 · 차량 헤드라이트 빛무리 + 바닥 빛웅덩이 + 4개 PointLight
  const G1 = S3.glows, P1 = S3.pools; G1.begin(); P1.begin();
  if (on > 0.01) {
    for (const s of S3.lights) {
      const fl = s.fire ? 0.84 + Math.sin(tm * 17 + s.x) * 0.1 + Math.sin(tm * 27 + s.z) * 0.06 : 1;
      const kk = s.k * on * fl;
      s._d = (s.x - S3.px) ** 2 + (s.z - S3.pz) ** 2; s._kk = kk;
      if (s.glow) G1.add(s.x, s.y, s.z, s.glow, s.col, kk * 0.34);
      if (s.pool) P1.add(s.x, 0.19, s.z, s.pool, s.col, kk * 0.45);
    }
    for (const v of S3.vehicles) {
      G1.add(v.x, 0.8, v.z + v.dir * 2.0, 1.4, t3CarHead, on * 0.9);
      P1.add(v.x, 0.06, v.z + v.dir * 4.5, 5.5, t3CarHead, on * 0.55);
      if (S3.era === 4) G1.add(v.x, 0.75, v.z - v.dir * 2.0, 0.95, t3CarTail, on * 0.75);
    }
    S3.lights.sort((a, b) => a._d - b._d);
  }
  G1.end(); P1.end();
  const nReal = R3D.fx ? R3D.fx.lights() : 4;
  for (let i = 0; i < S3.pts.length; i++) {
    const L = S3.pts[i], s = S3.lights[i];
    L.visible = i < nReal && on > 0.01 && !!s;
    if (L.visible) { L.position.set(s.x, s.y, s.z); L.color.copy(s.col); L.intensity = s._kk * 0.55; }
    else L.intensity = 0;
  }

  const BL = S3.blobs; BL.begin();
  BL.add(S3.px, S3.pz, S3.mounted ? 0.95 : 0.58, S3.py);
  for (const c of S3.citizens) BL.add(c.x, c.z, 0.5, c.y);
  for (const g of S3.guards) BL.add(g.x, g.z, 0.54, g.y);
  BL.end();

  {
    const pa = S3.ambPts.geometry.attributes.position.array, sd = S3.pSeed;
    for (let i = 0; i < sd.length; i += 3) {
      pa[i] = sd[i] + Math.sin(tm * 0.45 + i) * 1.6;
      pa[i + 1] = sd[i + 1] + Math.sin(tm * 0.8 + i * 0.3) * 0.45;
      pa[i + 2] = sd[i + 2] + Math.cos(tm * 0.38 + i) * 1.6;
    }
    S3.ambPts.geometry.attributes.position.needsUpdate = true;
    S3.ambPts.material.color.setHex(night > 0.3 ? 0xc8ff68 : 0xfff4d4);
    S3.ambPts.material.opacity = night > 0.3 ? 0.85 : 0.32;
    S3.ambPts.material.size = night > 0.3 ? 0.22 : 0.12;
  }

  R3D.render(S3.scene, S3.cam);

  // 2D 오버레이 (시설 이름표 · 민원 ❗ 표시 · 보물 근접 안내 · 조이스틱 · 말풍선)
  R3D.overlay();
  const g = ctx, pr = {};
  g.textAlign = 'center';
  for (const p of S3.pois) {
    const dist = Math.hypot(p.x - S3.px, p.z - S3.pz);
    if (dist > 34) continue;
    R3D.project(p.x, 3.2, p.z, pr); if (!pr.vis) continue;
    const a = clamp((34 - dist) / 10, 0, 1);
    g.globalAlpha = a * 0.92;
    g.font = '800 12px system-ui, sans-serif';
    const label = `${p.icon} ${p.name}${dist > 4 ? ` · ${Math.round(dist)}m` : ''}`;
    const tw = g.measureText(label).width + 16;
    g.fillStyle = 'rgba(16,20,28,.72)'; rrect(g, pr.x - tw / 2, pr.y - 20, tw, 22, 11); g.fill();
    g.strokeStyle = p.col; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = '#fff'; g.fillText(label, pr.x, pr.y - 5);
  }
  // 민원 주민 머리 위 황금 ❗
  for (const c of S3.citizens) {
    if (!c.petition) continue;
    R3D.project(c.x, c.y + 2.35 + Math.sin(tm * 5) * 0.14, c.z, pr);
    if (!pr.vis) continue;
    g.globalAlpha = 1;
    g.fillStyle = '#ffd54a'; g.strokeStyle = '#3a2000'; g.lineWidth = 3;
    g.beginPath(); g.arc(pr.x, pr.y - 8, 13, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#2a1200'; g.font = '900 17px system-ui'; g.fillText('!', pr.x, pr.y - 2);
  }
  // 숨겨진 황금 보물 근접 힌트 (16m 이내일 때 반짝임 표시)
  if (S3.relic && !S3.relic.found) {
    const rd = Math.hypot(S3.relic.x - S3.px, S3.relic.z - S3.pz);
    if (rd < 18) {
      R3D.project(S3.relic.x, 1.9, S3.relic.z, pr);
      if (pr.vis) {
        g.globalAlpha = clamp((18 - rd) / 8, 0.25, 1);
        g.font = '800 12px system-ui'; const lb = `✨ 황금 보물 · ${Math.round(rd)}m`;
        const tw = g.measureText(lb).width + 14;
        g.fillStyle = 'rgba(40,28,6,.82)'; rrect(g, pr.x - tw / 2, pr.y - 18, tw, 20, 10); g.fill();
        g.fillStyle = '#ffe58a'; g.fillText(lb, pr.x, pr.y - 4);
      }
    }
  }
  g.globalAlpha = 1;
  drawJoystick();

  if (S3.talk) {
    const tb = $('talkBox'), c = S3.talk.c;
    R3D.project(c.x, c.y + 2.05, c.z, pr);
    if (pr.vis && pr.x > 0 && pr.x < VW && pr.y > 90 && pr.y < VH) {
      tb.style.left = clamp(pr.x, 130, VW - 130) + 'px'; tb.style.top = pr.y + 'px'; tb.classList.remove('low');
    } else { tb.style.left = '50%'; tb.style.top = ''; tb.classList.add('low'); }
  }
}

// ---------- 마을 내부 HUD & 원형 거리 미니맵 ----------
function hudTown() {
  const S3 = T3; if (!S3 || !S3.active) return;
  const ph = ((S.time / DAY_LEN) + 0.08) % 1;
  const hrs = ((ph * 24 + 6) % 24);
  const hh = String(hrs | 0).padStart(2, '0'), mm = String(((hrs % 1) * 60) | 0).padStart(2, '0');
  const icon = hrs >= 6 && hrs < 17 ? '☀️' : hrs >= 17 && hrs < 19.5 ? '🌅' : '🌙';
  const tags = [];
  if (S3.town.moraleT > 0) tags.push(`✨민심+25%`);
  if (S.buffs && S.buffs.atkT > 0) tags.push(`🍖공+25%`);
  if (S.buffs && S.buffs.spdT > 0) tags.push(`🍜속+22%`);
  const hdr = `<b>${S3.town.name} ${eraCur().town} Lv${S3.lv}</b><small>${icon} ${hh}:${mm} (탭:시간) · 👥 ${S3.town.pop} · 🪙 ${S.gold}${tags.length ? '<br>' + tags.join(' ') : ''}</small>`;
  const el = $('townHud');
  if (el && el.dataset.s !== hdr) { el.dataset.s = hdr; el.innerHTML = hdr; }

  const pr = $('townPrompt');
  let ptxt = '';
  if (S3.nearRelic) ptxt = `<b>E</b> ✨ 숨겨진 황금 보물 열기!`;
  else if (S3.nearCit && S3.nearCit.petition) ptxt = `<b>E</b> ❗ 민원 듣기 · ${S3.nearCit.name}`;
  else if (S3.nearPoi) ptxt = `<b>E</b> ${S3.nearPoi.icon} ${S3.nearPoi.label} · ${S3.nearPoi.name}`;
  else if (S3.nearCit) {
    const nm = S3.nearCit.role === 'guard' ? S3.nearCit.name : `${(VROLE[S3.nearCit.role] || VROLE.idle)[S3.era]} ${S3.nearCit.name}`;
    ptxt = `<b>E</b> 💬 말 걸기 · ${nm}`;
  }
  if (pr) {
    pr.style.display = ptxt && !paused ? 'block' : 'none';
    if (ptxt && pr.dataset.s !== ptxt) { pr.dataset.s = ptxt; pr.innerHTML = ptxt; }
  }
  const ab = $('townActBtn');
  if (ab) {
    ab.style.display = (S3.nearRelic || S3.nearPoi || S3.nearCit) && !paused ? 'flex' : 'none';
    ab.innerHTML = S3.nearRelic ? '✨<br>보물' : (S3.nearCit && S3.nearCit.petition) ? '❗<br>민원' : S3.nearPoi ? (S3.nearPoi.act === 'exit' ? '🚪<br>나가기' : '✨<br>이용') : '💬<br>대화';
  }
  const rb = $('townRideBtn');
  if (rb) {
    rb.style.display = S3.canRide && !paused ? 'flex' : 'none';
    rb.innerHTML = S3.mounted ? '🚶<br>내리기' : '🐴<br>승마';
    rb.classList.toggle('on', S3.mounted);
  }

  // 원형 거리 미니맵
  const mc = $('townMap');
  if (mc) {
    const mg = mc.getContext('2d'), R = mc.width / 2, sc = 1.15;
    mg.clearRect(0, 0, mc.width, mc.height);
    mg.save();
    mg.beginPath(); mg.arc(R, R, R - 2, 0, Math.PI * 2); mg.clip();
    mg.fillStyle = '#252c26'; mg.fillRect(0, 0, mc.width, mc.height);
    mg.translate(R, R);
    mg.rotate(S3.camYaw);
    mg.translate(-S3.px * sc, -S3.pz * sc);

    mg.fillStyle = '#5c626a';
    mg.fillRect(-(S3.ROAD_HW + S3.SIDE_W) * sc, -S3.L * sc, (S3.ROAD_HW + S3.SIDE_W) * 2 * sc, S3.L * 2 * sc);
    mg.fillRect(-S3.W_CROSS * sc, -(S3.ROAD_HW + 4.6) * sc, S3.W_CROSS * 2 * sc, (S3.ROAD_HW + 4.6) * 2 * sc);
    mg.fillStyle = '#383d44';
    mg.fillRect(-S3.ROAD_HW * sc, -S3.L * sc, S3.ROAD_HW * 2 * sc, S3.L * 2 * sc);
    mg.fillRect(-S3.W_CROSS * sc, -S3.ROAD_HW * sc, S3.W_CROSS * 2 * sc, S3.ROAD_HW * 2 * sc);
    mg.fillStyle = '#6c6860'; mg.fillRect(-12 * sc, -12 * sc, 24 * sc, 24 * sc);

    for (const b of S3.mapBoxes) {
      mg.fillStyle = b.col || '#6a665e';
      mg.fillRect((b.x - b.w / 2) * sc, (b.z - b.d / 2) * sc, b.w * sc, b.d * sc);
      if (b.icon) {
        mg.save(); mg.translate(b.x * sc, b.z * sc); mg.rotate(-S3.camYaw);
        mg.fillStyle = '#f2c14e'; mg.beginPath(); mg.arc(0, 0, 7, 0, 7); mg.fill();
        mg.fillStyle = '#1b1610'; mg.font = '900 9px system-ui'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
        mg.fillText(b.icon, 0, 0.5); mg.restore();
      }
    }
    mg.fillStyle = '#6be07b'; mg.beginPath(); mg.arc(0, S3.gateZ * sc, 4.5, 0, 7); mg.fill();
    for (const c of S3.citizens) {
      mg.fillStyle = c.petition ? '#ffd54a' : 'rgba(255,255,255,.72)';
      mg.beginPath(); mg.arc(c.x * sc, c.z * sc, c.petition ? 4.2 : 1.8, 0, 7); mg.fill();
    }
    mg.restore();

    mg.save(); mg.translate(R, R);
    mg.fillStyle = '#4fa3ff'; mg.strokeStyle = '#fff'; mg.lineWidth = 1.8;
    mg.beginPath(); mg.moveTo(0, -8); mg.lineTo(6, 6); mg.lineTo(0, 3); mg.lineTo(-6, 6); mg.closePath();
    mg.fill(); mg.stroke();
    mg.restore();
    const na = S3.camYaw - Math.PI / 2;
    mg.fillStyle = '#ffd54a'; mg.font = '900 10px system-ui'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
    mg.fillText('북', R + Math.cos(na) * (R - 9), R + Math.sin(na) * (R - 9));
  }
}

// ---------- UI 버튼 연결 ----------
if ($('townExitBtn')) $('townExitBtn').addEventListener('click', () => exitTown(false));
if ($('townPrompt')) $('townPrompt').addEventListener('click', () => t3Interact());
if ($('townActBtn')) holdBtn($('townActBtn'), () => t3Interact());
if ($('townRunBtn')) $('townRunBtn').addEventListener('click', () => {
  if (!T3) return;
  T3.sprint = !T3.sprint;
  $('townRunBtn').classList.toggle('on', T3.sprint);
});
if ($('townRideBtn')) $('townRideBtn').addEventListener('click', () => {
  if (!T3 || !T3.canRide) return;
  T3.mounted = !T3.mounted; S.player.mounted = T3.mounted;
  toast(T3.mounted ? '🐴 말에 올랐습니다' : '🚶 말에서 내렸습니다', 1.4);
});
if ($('townHud')) $('townHud').addEventListener('click', () => {
  // 시계 탭: 아침(09:30) → 노을(17:45) → 밤(21:30) 순환 (야경 감상!)
  if (!T3 || MODE !== 'town') return;
  const ph = ((S.time / DAY_LEN) + 0.08) % 1, hrs = (ph * 24 + 6) % 24;
  const nextH = hrs < 15 ? 17.75 : hrs < 20 ? 21.5 : 9.5;
  S.time = (((((nextH - 6 + 24) % 24) / 24) - 0.08 + 1) % 1) * DAY_LEN;
  toast(nextH === 9.5 ? '☀️ 상쾌한 아침' : nextH === 17.75 ? '🌅 황금빛 노을' : '🌙 불빛 켜진 밤거리', 1.5);
});
