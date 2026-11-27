'use strict';
// ===== town3d.js: 마을 내부 전용 실사 3D 거리 씬 (1단위 = 1m) =====
// 오버월드에서 내 마을에 들어가면 MODE = 'town' 으로 전환되어,
// 해당 마을의 시대(0~4) · 레벨(1~5) · 지은 건물 목록 · 인구 · 현재 시각(낮/노을/밤)에 맞춰
// 실제 1m 스케일의 대로 · 보도 · 광장 · 상가 · 간판 · 노점 · 가로수 · 행인을 생성한다.
let T3 = null;

const T3_ERA_CFG = [
  { // 0: 부족 시대
    roadBg: '#8c6f4b', sideBg: '#7a6343', curb: '#6a5236', wall: '#5e442a',
    shops: ['물물교환', '가죽 작업장', '토기 가마', '사냥꾼 숙소', '곡물 창고', '주술사 천막'],
    stallKind: 'tribal', lampH: 2.6, lampCol: '#ff7024', lampFire: true,
    storyMin: 1, storyMax: 1, facadeStyle: 'tribal',
  },
  { // 1: 고대 왕국
    roadBg: '#b89f74', sideBg: '#cab690', curb: '#9c8660', wall: '#b8a07a',
    shops: ['청동 대장간', '토기 상점', '향신료 상회', '곡물 창고', '서생 학사', '여관 주막', '직물 공방', '포도주 가게'],
    stallKind: 'ancient', lampH: 3.0, lampCol: '#ff8a34', lampFire: true,
    storyMin: 1, storyMax: 2, facadeStyle: 'ancient',
  },
  { // 2: 중세
    roadBg: '#6c6a66', sideBg: '#9a958b', curb: '#7d7870', wall: '#8f8b82',
    shops: ['황금사자 여관', '왕실 빵집', '철갑 대장간', '포목 상회', '약초방', '길드 회관', '마구 상점', '주막', '제화점', '양초 공방'],
    stallKind: 'medieval', lampH: 3.3, lampCol: '#ff963c', lampFire: false,
    storyMin: 2, storyMax: 3, facadeStyle: 'medieval',
  },
  { // 3: 근세
    roadBg: '#575a60', sideBg: '#a6a198', curb: '#78746c', wall: '#a29a8e',
    shops: ['황제 상회', '인쇄소', '시계방', '서점', '포목점', '제과점', '약국', '항해 기구상', '여관', '대장간'],
    stallKind: 'early', lampH: 3.7, lampCol: '#ffa64e', lampFire: false,
    storyMin: 2, storyMax: 4, facadeStyle: 'early',
  },
  { // 4: 근대 (서울 러시 감성: 아스팔트 도로 · 보도블록 + 적벽돌 띠 · 상가 · 한글 간판 · 포장마차 · 가스등)
    roadBg: '#3b3e44', sideBg: '#9a9da2', curb: '#7c8088', wall: '#8a5240',
    shops: ['종로 상회', '국밥집', '양복점', '제과점', '다방', '서적상', '시계포', '사진관', '약방', '전당포', '포목상', '이발소'],
    stallKind: 'pojang', lampH: 4.1, lampCol: '#ffd898', lampFire: false,
    storyMin: 3, storyMax: 5, facadeStyle: 'modern',
  },
];

const T3_FAC_INFO = {
  keep: { name: '영주관 · 성채', icon: '🏰', badge: '성', col: '#f2c14e', act: 'build', label: '마을 관리 · 건설' },
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

// 도로 텍스처 (u: 가로 8.4m 전체, v: 세로 8.4m 반복)
function t3RoadTex(era) {
  return t3CachedTex('road|' + era, 512, (g, N) => {
    const r = mulberry(1001 + era * 77);
    const C = T3_ERA_CFG[era];
    g.fillStyle = C.roadBg; g.fillRect(0, 0, N, N);
    if (era === 0) { // 부족: 다져진 흙길 + 바퀴 자국 + 가장자리 풀
      for (let i = 0; i < 1600; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(65,45,25,.14)' : 'rgba(185,155,110,.12)';
        g.fillRect(r() * N, r() * N, 3 + r() * 14, 3 + r() * 14);
      }
      g.fillStyle = 'rgba(58,40,22,.22)'; g.fillRect(N * 0.28, 0, N * 0.08, N); g.fillRect(N * 0.64, 0, N * 0.08, N);
      for (let s of [0, N - 34]) { g.fillStyle = 'rgba(72,102,48,.38)'; g.fillRect(s, 0, 34, N); }
    } else if (era === 1) { // 고대: 큰 사암 판석
      const rows = 8, cols = 6, cw = N / cols, ch = N / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const ox = (y % 2) * cw * 0.5;
        const v = 0.9 + r() * 0.18;
        g.fillStyle = `rgb(${182 * v | 0},${156 * v | 0},${114 * v | 0})`;
        g.fillRect((x * cw + ox) % N + 2, y * ch + 2, cw - 4, ch - 4);
      }
      g.fillStyle = 'rgba(80,62,38,.25)'; for (let i = 0; i < 600; i++) g.fillRect(r() * N, r() * N, 4, 4);
    } else if (era === 2 || era === 3) { // 중세·근세: 호박돌 / 화강암 포석
      const rows = era === 2 ? 16 : 20, cols = era === 2 ? 12 : 16, cw = N / cols, ch = N / rows;
      g.fillStyle = '#3a3836'; g.fillRect(0, 0, N, N);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const ox = (y % 2) * cw * 0.5;
        const v = (era === 2 ? 0.82 : 0.72) + r() * 0.25, w = era === 2 ? 10 : 0;
        g.fillStyle = `rgb(${(116 + w) * v | 0},${(113 + w * 0.7) * v | 0},${110 * v | 0})`;
        const px = (x * cw + ox) % N;
        g.fillRect(px + 2, y * ch + 2, cw - 3.5, ch - 3.5);
        if (px + cw > N) g.fillRect(px - N + 2, y * ch + 2, cw - 3.5, ch - 3.5);
      }
      // 배수로 띠
      g.fillStyle = 'rgba(20,22,26,.35)'; g.fillRect(0, 0, 18, N); g.fillRect(N - 18, 0, 18, N);
    } else { // 근대: 아스팔트 + 미세 입자 + 중앙 노란 복선 + 흰 점선 차선 + 붉은 전용차로 띠
      for (let i = 0; i < 5500; i++) {
        const c = 48 + (r() * 26 | 0);
        g.fillStyle = `rgba(${c},${c + 2},${c + 5},0.35)`;
        g.fillRect(r() * N, r() * N, 2 + r() * 3, 2 + r() * 3);
      }
      // 좌측 붉은 전용차로 감성 (서울 러시 포인트)
      g.fillStyle = 'rgba(136,52,48,.52)'; g.fillRect(N * 0.06, 0, N * 0.36, N);
      // 가장자리 흰 실선 + 배수로 음영
      g.fillStyle = 'rgba(18,20,24,.45)'; g.fillRect(0, 0, 16, N); g.fillRect(N - 16, 0, 16, N);
      g.fillStyle = 'rgba(235,235,230,.85)'; g.fillRect(20, 0, 7, N); g.fillRect(N - 27, 0, 7, N);
      // 중앙 황색 이중선
      g.fillStyle = '#e5b83b'; g.fillRect(N * 0.5 - 9, 0, 6, N); g.fillRect(N * 0.5 + 3, 0, 6, N);
      // 점선 차선
      g.fillStyle = 'rgba(240,240,235,.8)';
      for (let y = 20; y < N; y += 128) { g.fillRect(N * 0.25 - 3, y, 6, 62); g.fillRect(N * 0.75 - 3, y, 6, 62); }
    }
  });
}

// 보도블록 텍스처 (u: 가로 5.4m 전체 — 연석쪽이 u=0, 건물쪽이 u=1)
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
      // 서울 러시 스타일: 정갈한 회색 정사각 보도블록 + 적벽돌 기하 띠 + 연석 쪽 노란 점자블록 띠!
      const step = 32;
      for (let y = 0; y < N; y += step) for (let x = 0; x < N; x += step) {
        const brickBand = x >= N * 0.44 && x < N * 0.62;
        const v = 0.92 + r() * 0.14;
        if (brickBand) g.fillStyle = `rgb(${156 * v | 0},${98 * v | 0},${90 * v | 0})`;
        else g.fillStyle = `rgb(${164 * v | 0},${166 * v | 0},${172 * v | 0})`;
        g.fillRect(x + 1.5, y + 1.5, step - 3, step - 3);
        if (brickBand) { // 작은 벽돌 분할선
          g.fillStyle = 'rgba(60,35,30,.28)';
          g.fillRect(x + step / 2, y + 1, 1.5, step - 2);
          g.fillRect(x + 1, y + step / 2, step - 2, 1.5);
        }
      }
      // 연석 테두리(좌측) + 노란 점자블록 줄
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

// 광장 바닥 텍스처
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
    // 광장 테두리 장식 띠
    g.strokeStyle = era === 4 ? 'rgba(150,86,78,.55)' : 'rgba(110,95,75,.4)';
    g.lineWidth = 10; g.strokeRect(20, 20, N - 40, N - 40);
  });
}

// 다층 상가·거리 건물 파사드 텍스처 + 밤 발광 창문 맵 (실사 건물 사이를 채워 웅장한 거리 소실점 형성)
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
    ['#b8b0a4', '#9e5c48', '#c8c4bc', '#8c949c'],
  ][era];
  const base = pal[variant % pal.length];
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  // 벽면 질감(벽돌/석재/회반죽)
  if (era === 4 && variant % 2 === 1) { // 근대 적벽돌
    for (let y = 0; y < N; y += 14) for (let x = 0; x < N; x += 28) {
      const ox = ((y / 14 | 0) % 2) * 14, v = 0.86 + r() * 0.24;
      g.fillStyle = `rgb(${155 * v | 0},${84 * v | 0},${64 * v | 0})`;
      g.fillRect((x + ox) % N + 1, y + 1, 26, 12);
    }
  } else {
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(0,0,0,.045)' : 'rgba(255,255,255,.04)';
      g.fillRect(r() * N, r() * N, 8 + r() * 28, 4 + r() * 14);
    }
  }
  // 1층 상가 기단부 (아래 26%)
  const gH = Math.round(N * 0.26);
  g.fillStyle = era === 4 ? '#52565e' : era >= 2 ? '#6e685e' : '#8a7658';
  g.fillRect(0, N - gH, N, gH);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, N - gH - 6, N, 6);
  // 1층 상점 셔터/문/쇼윈도
  const shops = 3, sw = N / shops;
  for (let i = 0; i < shops; i++) {
    const sx = i * sw + 16, sy = N - gH + 18, w = sw - 32, h = gH - 22;
    g.fillStyle = era === 4 ? '#222830' : '#3a2c20';
    g.fillRect(sx, sy, w, h);
    g.strokeStyle = era === 4 ? '#787e88' : '#58422c'; g.lineWidth = 4; g.strokeRect(sx, sy, w, h);
    // 밤에 상점 쇼윈도 발광
    if (r() < 0.78) {
      ge.fillStyle = era === 4 ? '#ffd690' : '#ffab52';
      ge.fillRect(sx + 6, sy + 6, w - 12, h - 12);
    }
    if (era === 4) { // 셔터 가로줄
      g.fillStyle = 'rgba(255,255,255,.08)';
      for (let yy = sy + 8; yy < sy + h; yy += 8) g.fillRect(sx + 2, yy, w - 4, 2);
    }
  }
  // 위층 창문 그리드 (3~4개 층)
  const floors = era <= 1 ? 2 : era === 2 ? 3 : 4;
  const cols = era <= 1 ? 3 : 4;
  const topY = 24, availH = N - gH - topY - 10, fh = availH / floors, cw = N / cols;
  for (let f = 0; f < floors; f++) {
    const fy = topY + f * fh;
    // 층간 몰딩 / 목골조
    g.fillStyle = era === 2 ? '#5a3e24' : 'rgba(255,255,255,.22)';
    g.fillRect(0, fy - 4, N, era === 2 ? 9 : 6);
    g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, fy + 5, N, 4);
    for (let c = 0; c < cols; c++) {
      const wx = c * cw + cw * 0.16, wy = fy + fh * 0.18, ww = cw * 0.68, wh = fh * 0.58;
      if (era === 2) { g.fillStyle = '#5a3e24'; g.fillRect(c * cw - 4, fy, 8, fh); }
      // 창틀 음영
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      // 유리 (어두운 청회색 그라데이션)
      const gr = g.createLinearGradient(wx, wy, wx, wy + wh);
      gr.addColorStop(0, era === 4 ? '#2b3d4f' : '#232c38');
      gr.addColorStop(1, era === 4 ? '#4a5f72' : '#181e26');
      g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
      // 창살
      g.fillStyle = era === 4 ? '#c8ccd2' : '#4a3622';
      g.fillRect(wx + ww * 0.48, wy, 4, wh);
      if (era <= 3) g.fillRect(wx, wy + wh * 0.48, ww, 4);
      // 창턱
      g.fillStyle = era === 4 ? '#d8dce2' : '#8a7c6a';
      g.fillRect(wx - 5, wy + wh, ww + 10, 7);
      // 근대: 실외기/환풍기 디테일 (서울 러시 감성)
      if (era === 4 && c < cols - 1) {
        const ax = wx + ww + 6, ay = wy + wh - 24;
        if (ax + 18 < (c + 1) * cw) {
          g.fillStyle = '#dad8d0'; g.fillRect(ax, ay, 18, 22);
          g.fillStyle = '#7c8086'; g.beginPath(); g.arc(ax + 9, ay + 11, 6, 0, 7); g.fill();
        }
      }
      // 밤 창문 발광
      if (r() < 0.62) {
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

// 한글 간판 / 표지판 텍스처
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

// 세로 돌출 간판 텍스처 (근대 상가)
function t3VertSignTex(text, bg, fg) {
  const key = `vsign|${text}|${bg}|${fg}`;
  if (t3TexCache.has(key)) return t3TexCache.get(key);
  const c = document.createElement('canvas'); c.width = 128; c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 384);
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 6; g.strokeRect(6, 6, 116, 372);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...text].filter(ch => ch !== ' ').slice(0, 5);
  const fs = chars.length <= 3 ? 64 : 52;
  g.font = `900 ${fs}px "Malgun Gothic", system-ui, sans-serif`;
  const step = 330 / Math.max(1, chars.length);
  chars.forEach((ch, i) => g.fillText(ch, 64, 30 + step * (i + 0.5)));
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = Math.min(4, R3D.maxAniso || 4);
  t3TexCache.set(key, t);
  return t;
}

// 포장마차 앞면 비닐 창 텍스처 (서울 러시 감성)
function t3PojangTex(title) {
  const key = 'pojang|' + title;
  if (t3TexCache.has(key)) return t3TexCache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e5862c'; g.fillRect(0, 0, 512, 256);
  // 따뜻한 내부 비닐 창
  const gr = g.createLinearGradient(0, 64, 0, 232);
  gr.addColorStop(0, '#fff2cf'); gr.addColorStop(1, '#f4c882');
  g.fillStyle = gr; g.fillRect(18, 72, 476, 166);
  // 내부 병·카운터·손님 실루엣
  g.fillStyle = '#a86a32'; g.fillRect(18, 174, 476, 64);
  g.fillStyle = 'rgba(110,65,25,.65)';
  for (let x = 42; x < 470; x += 48) { g.fillRect(x, 134, 14, 40); g.fillRect(x + 3, 122, 8, 12); }
  // 윗부분 상호
  g.fillStyle = '#fff8e4'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 38px "Malgun Gothic", system-ui, sans-serif';
  g.fillText(title, 256, 38);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  t3TexCache.set(key, t);
  return t;
}

// ---------- 거리 소품 / 건축 생성 ----------
function t3BuildScene(town) {
  const era = clamp(S.era | 0, 0, ERAS.length - 1);
  const lv = townLevel(town);
  const cfg = T3_ERA_CFG[era];
  const r = mulberry(9001 + town.id * 97 + era * 31 + lv * 13);
  const col = TOWN_COLORS[town.id % TOWN_COLORS.length];

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(56, VW / VH, 0.15, 220);
  scene.background = new THREE.Color(0x9ccbe6);
  scene.fog = new THREE.Fog(0xbcd4e8, 42, 135);

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
  const glows = R3D.glows(scene, 140);
  const pools = R3D.pools(scene, 100);
  const blobs = R3D.blobs(scene, 90);

  const own = []; // dispose 할 지오메트리·재질
  const track = o => { own.push(o); return o; };
  const colliders = []; // { x, z, hx, hz }
  const addCol = (x, z, hx, hz) => colliders.push({ x, z, hx, hz });
  const pois = []; // 상호작용 지점 { x, z, r, kind, title, sub, act, badge, col }
  const mapBoxes = []; // 미니맵 건물 사각형 { x, z, w, d, col, icon }
  const lights = []; // 밤 가로등/노점 광원 후보 { x, y, z, col, k, glow, pool, fire }
  const flags = [];
  const emMats = []; // 밤에 발광 강도를 조절할 재질(상가 창문 · 간판 · 포장마차)

  const L = 44 + lv * 5; // 남북 반길이 (49~69m)
  const W_CROSS = 38;    // 동서 교차로 반길이
  const ROAD_HW = 4.2;   // 도로 반폭 (총 8.4m)
  const SIDE_W = 5.4;    // 보도 폭
  const SIDE_H = 0.16;   // 보도 턱 높이

  // 1) 바깥 대지 (멀리 잔디/흙 배경)
  const outerGeo = track(new THREE.PlaneGeometry(360, 360).rotateX(-Math.PI / 2));
  const outerMat = track(new THREE.MeshLambertMaterial({ color: era === 4 ? 0x5c6458 : era === 1 ? 0xa89468 : 0x567a3e }));
  const outer = new THREE.Mesh(outerGeo, outerMat);
  outer.position.set(0, -0.06, 0); outer.receiveShadow = true; scene.add(outer);

  // 2) 중앙 대로 (남북) + 동서 교차로
  const roadTex = t3RoadTex(era).clone(); roadTex.needsUpdate = true;
  roadTex.repeat.set(1, (L * 2) / 8.4); track(roadTex);
  const roadMat = track(new THREE.MeshLambertMaterial({ map: roadTex }));
  const roadGeo = track(new THREE.PlaneGeometry(ROAD_HW * 2, L * 2).rotateX(-Math.PI / 2));
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.position.set(0, 0, 0); road.receiveShadow = true; scene.add(road);

  const crossTex = t3RoadTex(era).clone(); crossTex.needsUpdate = true;
  crossTex.repeat.set(1, (W_CROSS * 2) / 8.4); track(crossTex);
  const crossMat = track(new THREE.MeshLambertMaterial({ map: crossTex }));
  const crossGeo = track(new THREE.PlaneGeometry(ROAD_HW * 2, W_CROSS * 2).rotateX(-Math.PI / 2).rotateY(Math.PI / 2));
  const cross = new THREE.Mesh(crossGeo, crossMat);
  cross.position.set(0, 0.008, 0); cross.receiveShadow = true; scene.add(cross);

  // 3) 중앙 광장 바닥
  const plazaTex = t3PlazaTex(era).clone(); plazaTex.needsUpdate = true;
  plazaTex.repeat.set(5, 5); track(plazaTex);
  const plazaMat = track(new THREE.MeshLambertMaterial({ map: plazaTex }));
  const plazaGeo = track(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2));
  const plaza = new THREE.Mesh(plazaGeo, plazaMat);
  plaza.position.set(0, 0.015, 0); plaza.receiveShadow = true; scene.add(plaza);

  // 4) 횡단보도 (근대만 흰 줄무늬 횡단보도, 고대~근세는 은은한 판석 횡단 띠)
  if (era >= 1) {
    const cwMat = track(new THREE.MeshLambertMaterial({ color: era === 4 ? 0xebeae4 : era === 1 ? 0xc8b288 : 0x8f8a80 }));
    const cwGeo = track(new THREE.PlaneGeometry(era === 4 ? 0.55 : 0.72, era === 4 ? 2.8 : 1.6).rotateX(-Math.PI / 2));
    for (const cz of [24, 12.5, -12.5]) {
      for (let x = -3.2; x <= 3.21; x += 1.06) {
        const m = new THREE.Mesh(cwGeo, cwMat); m.position.set(x, 0.022, cz); m.receiveShadow = true; scene.add(m);
      }
    }
  }

  // 5) 3D 높이가 있는 양쪽 보도 (연석 턱 포함) — 남쪽 구간(z: 12..L), 북쪽 구간(z: -L..-12), 교차로 보도
  const curbMat = track(new THREE.MeshLambertMaterial({ color: cfg.curb }));
  function addSidewalk(cx, cz, w, d, flipU) {
    const st = t3SidewalkTex(era).clone(); st.needsUpdate = true;
    st.repeat.set(flipU ? -1 : 1, d / 5.4); track(st);
    const topMat = track(new THREE.MeshLambertMaterial({ map: st }));
    const box = new THREE.Mesh(track(new THREE.BoxGeometry(w, SIDE_H, d)), [curbMat, curbMat, topMat, curbMat, curbMat, curbMat]);
    box.position.set(cx, SIDE_H / 2, cz); box.receiveShadow = true; scene.add(box);
  }
  const segS = L - 12, segN = L - 12;
  addSidewalk(-(ROAD_HW + SIDE_W / 2), 12 + segS / 2, SIDE_W, segS, true);
  addSidewalk(+(ROAD_HW + SIDE_W / 2), 12 + segS / 2, SIDE_W, segS, false);
  addSidewalk(-(ROAD_HW + SIDE_W / 2), -(12 + segN / 2), SIDE_W, segN, true);
  addSidewalk(+(ROAD_HW + SIDE_W / 2), -(12 + segN / 2), SIDE_W, segN, false);
  // 동서 교차로 보도
  const cSideLen = W_CROSS - 12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const st = t3SidewalkTex(era).clone(); st.needsUpdate = true;
    st.repeat.set(cSideLen / 5.4, 1); track(st);
    const tm = track(new THREE.MeshLambertMaterial({ map: st }));
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(cSideLen, SIDE_H, 4.6)), [curbMat, curbMat, tm, curbMat, curbMat, curbMat]);
    m.position.set(sx * (12 + cSideLen / 2), SIDE_H / 2, sz * (ROAD_HW + 2.3)); m.receiveShadow = true; scene.add(m);
  }

  // 건물 뒤쪽 지반(보도 바깥)
  const lotMat = track(new THREE.MeshLambertMaterial({ color: era === 4 ? 0x767a80 : era === 0 ? 0x685c40 : 0x867e70 }));
  for (const sx of [-1, 1]) {
    const lm = new THREE.Mesh(track(new THREE.PlaneGeometry(36, L * 2 + 20).rotateX(-Math.PI / 2)), lotMat);
    lm.position.set(sx * (ROAD_HW + SIDE_W + 18), SIDE_H - 0.01, 0); lm.receiveShadow = true; scene.add(lm);
  }

  // 6) 중앙 광장 랜드마크 (z = 0, x = 0)
  {
    const px = 0, pz = 0;
    const baseR = era === 0 ? 2.4 : 3.2;
    const ped = new THREE.Mesh(track(new THREE.CylinderGeometry(baseR, baseR + 0.35, 0.36, era === 0 ? 10 : 12)), track(new THREE.MeshLambertMaterial({ color: era === 0 ? '#746652' : '#9c968c' })));
    ped.position.set(px, 0.18, pz); ped.receiveShadow = true; ped.castShadow = true; scene.add(ped);
    addCol(px, pz, baseR + 0.3, baseR + 0.3);
    if (era === 0) {
      if (typeof RA !== 'undefined' && RA.has('campfire')) {
        const cf = RA.group('campfire', true); cf.scale.setScalar(1.55); cf.position.set(px, 0.36, pz); scene.add(cf);
      }
      const fl = new THREE.Mesh(w3dFlameGeo(), R3D.mats.fire); fl.scale.set(2.8, 3.2, 2.8); fl.position.set(px, 0.52, pz); scene.add(fl);
      lights.push({ x: px, y: 1.8, z: pz, col: new THREE.Color('#ff7a26'), k: 4.5, glow: 2.6, pool: 8.5, fire: true });
    } else if (era <= 2) {
      if (typeof RA !== 'undefined' && RA.has('well')) {
        const wl = RA.group('well', true); wl.scale.setScalar(1.35); wl.position.set(px, 0.36, pz); scene.add(wl);
      } else {
        const wl = new THREE.Mesh(track(new THREE.CylinderGeometry(1.1, 1.2, 1.1, 10)), track(new THREE.MeshLambertMaterial({ color: '#9c968c' })));
        wl.position.set(px, 0.9, pz); wl.castShadow = true; scene.add(wl);
      }
      lights.push({ x: px, y: 2.8, z: pz, col: new THREE.Color('#ffa850'), k: 2.5, glow: 1.6, pool: 7.0 });
    } else {
      // 근세/근대: 석조 분수대 + 시계/기념탑 기둥
      const basin = new THREE.Mesh(track(new THREE.CylinderGeometry(2.5, 2.7, 0.72, 16)), track(new THREE.MeshLambertMaterial({ color: '#aba79e' })));
      basin.position.set(px, 0.72, pz); basin.castShadow = true; basin.receiveShadow = true; scene.add(basin);
      const wat = new THREE.Mesh(track(new THREE.CylinderGeometry(2.25, 2.25, 0.12, 16)), track(new THREE.MeshLambertMaterial({ color: '#42a4b8', emissive: '#103040' })));
      wat.position.set(px, 1.06, pz); scene.add(wat);
      const colM = new THREE.Mesh(track(new THREE.CylinderGeometry(0.45, 0.65, 4.4, 10)), track(new THREE.MeshLambertMaterial({ color: '#c4beb2' })));
      colM.position.set(px, 2.9, pz); colM.castShadow = true; scene.add(colM);
      const topOrb = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.55, 1)), track(new THREE.MeshLambertMaterial({ color: '#e6c258', emissive: '#8a5a10', emissiveIntensity: 0.4 })));
      topOrb.position.set(px, 5.4, pz); scene.add(topOrb);
      lights.push({ x: px, y: 5.4, z: pz, col: new THREE.Color('#ffd88a'), k: 3.2, glow: 2.4, pool: 9.0 });
    }
  }

  // 광장 소식판 (우측 광장 입구)
  {
    const bx = 7.4, bz = 9.2;
    const bg = new THREE.Group(); bg.position.set(bx, SIDE_H, bz); bg.rotation.y = -0.35;
    const woodM = track(new THREE.MeshLambertMaterial({ color: '#5a3a20' }));
    for (const dx of [-0.9, 0.9]) { const p = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 2.3, 0.14)), woodM); p.position.set(dx, 1.15, 0); p.castShadow = true; bg.add(p); }
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(2.3, 0.14, 0.65)), track(new THREE.MeshLambertMaterial({ color: '#3a3028' })));
    roof.position.set(0, 2.32, 0); roof.castShadow = true; bg.add(roof);
    const boardMat = track(new THREE.MeshLambertMaterial({ map: t3SignTex('마을 소식판', '의뢰 · 사건 확인', '#efe2c2', '#3a2410', '#9a6a2a') }));
    const bd = new THREE.Mesh(track(new THREE.BoxGeometry(1.75, 1.05, 0.08)), boardMat); bd.position.set(0, 1.55, 0); bd.castShadow = true; bg.add(bd);
    scene.add(bg);
    addCol(bx, bz, 1.1, 0.5);
    pois.push({ x: bx, z: bz + 1.5, r: 2.6, kind: 'board', ...T3_FAC_INFO.board });
  }

  // 7) 북쪽 랜드마크: 영주관 / 성채 (대로 끝 정면, z = -(L - 4))
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
    // 성채 위 대형 깃발
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6)), track(new THREE.MeshLambertMaterial({ color: '#3a2a1a' })));
    pole.position.set(0, keepH + 1.8, keepZ - 4); scene.add(pole);
    const fl = w3dFlag(col, 3.2, 1.9); fl.mesh.position.set(0.08, keepH + 3.9, keepZ - 4); scene.add(fl.mesh); own.push(fl.mesh.geometry); flags.push(fl);
    // 성채 현판
    const signM = track(new THREE.MeshLambertMaterial({ map: t3SignTex(`${town.name} ${eraCur().town}`, `${rulerName()} 관청`, '#26201a', '#fff4d4', '#f2c14e') }));
    const signMesh = new THREE.Mesh(track(new THREE.BoxGeometry(5.2, 1.45, 0.16)), signM);
    signMesh.position.set(0, 4.4, keepZ + 5.6); scene.add(signMesh);
    addCol(0, keepZ - 4, 9.5, 8.5);
    mapBoxes.push({ x: 0, z: keepZ - 4, w: 18, d: 15, col: '#d8a840', icon: '성' });
    pois.push({ x: 0, z: keepZ + 7.2, r: 3.4, kind: 'keep', ...T3_FAC_INFO.keep });
    lights.push({ x: -3.2, y: 3.5, z: keepZ + 6.2, col: new THREE.Color(cfg.lampCol), k: 3.5, glow: 1.8, pool: 8.5, fire: cfg.lampFire });
    lights.push({ x: +3.2, y: 3.5, z: keepZ + 6.2, col: new THREE.Color(cfg.lampCol), k: 3.5, glow: 1.8, pool: 8.5, fire: cfg.lampFire });
  }

  // 8) 남문 (출구, z = L - 6)
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
    // 문 아치 상단 보 + 한글 간판
    const archY = era === 0 ? 4.8 : 6.4;
    const beam = new THREE.Mesh(track(new THREE.BoxGeometry(14.4, 1.1, 1.4)), gMat);
    beam.position.set(0, archY, gateZ); beam.castShadow = true; scene.add(beam);
    const gSignTex = t3SignTex(era === 4 ? `${town.name} 1번가` : `${town.name} 남문`, '월드로 나가는 길', era === 4 ? '#1e3554' : '#2e2218', '#ffffff', era === 4 ? '#66c2ff' : '#f2c14e');
    const gSignMat = track(new THREE.MeshLambertMaterial({ map: gSignTex, emissive: '#ffffff', emissiveMap: gSignTex, emissiveIntensity: 0 }));
    emMats.push({ mat: gSignMat, max: 0.75 });
    const gSign = new THREE.Mesh(track(new THREE.BoxGeometry(5.6, 1.5, 0.18)), gSignMat);
    gSign.position.set(0, archY, gateZ - 0.75); scene.add(gSign);
    // 성벽 양옆 울타리
    const wallH = era === 0 ? 3.2 : 5.4;
    for (const sx of [-1, 1]) {
      const wm = new THREE.Mesh(track(new THREE.BoxGeometry(28, wallH, 1.6)), gMat);
      wm.position.set(sx * 23, wallH / 2, gateZ); wm.castShadow = true; wm.receiveShadow = true; scene.add(wm);
    }
    pois.push({ x: 0, z: gateZ - 1.5, r: 3.4, kind: 'gate', ...T3_FAC_INFO.gate });
    lights.push({ x: -4.8, y: 3.6, z: gateZ - 1.2, col: new THREE.Color(cfg.lampCol), k: 3.2, glow: 1.6, pool: 7.5, fire: cfg.lampFire });
    lights.push({ x: +4.8, y: 3.6, z: gateZ - 1.2, col: new THREE.Color(cfg.lampCol), k: 3.2, glow: 1.6, pool: 7.5, fire: cfg.lampFire });
  }

  // 9) 거리 양옆 건물 배치 — 실제 지어진 건물(RA GLB) + 시대별 다층 상가 파사드 혼합!
  const townBlds = S.buildings.filter(b => b.town === town.id && b.type !== 'farm' && b.type !== 'tower');
  const facPriority = ['market', 'school', 'barracks', 'range', 'stable', 'factory', 'lumber', 'quarry', 'mine', 'house'];
  townBlds.sort((a, b) => facPriority.indexOf(a.type) - facPriority.indexOf(b.type));

  // 대로 양옆 슬롯 목록 생성 (남쪽과 북쪽 모두 촘촘히 배치해 거리감 극대화)
  const slots = [];
  for (let z = gateZ - 11; z >= 16; z -= 12.2) { slots.push({ side: -1, z }); slots.push({ side: 1, z }); }
  for (let z = -16; z >= keepZ + 14; z -= 12.2) { slots.push({ side: -1, z }); slots.push({ side: 1, z }); }
  // 동서 교차로 양옆 슬롯
  for (const sx of [-1, 1]) for (let d = 17; d <= 31; d += 12.5) {
    slots.push({ cross: true, x: sx * d, z: -13.5, faceZ: 1 });
    slots.push({ cross: true, x: sx * d, z: +13.5, faceZ: -1 });
  }

  // 실제 지어진 기능 건물 우선 배치 (중복 타입은 최대 1~2개만 특수 POI로)
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

    // 처마 / 파라펫 / 박공 지붕
    if (era === 4) {
      const parapet = new THREE.Mesh(track(new THREE.BoxGeometry(w + 0.35, 0.45, d + 0.35)), roofMat);
      parapet.position.y = h + 0.22; parapet.castShadow = true; g.add(parapet);
    } else {
      const roof = new THREE.Mesh(track(w3dPrism(d + 0.6, era === 1 ? 1.5 : 2.6, w + 0.5).rotateY(Math.PI / 2)), roofMat);
      roof.position.y = h; roof.castShadow = true; g.add(roof);
    }

    // 1층 차양(어닝)
    const awnCol = ['#b84434', '#386898', '#3c7a4e', '#c68a32', '#4a4e58'][variant % 5];
    const awn = new THREE.Mesh(track(new THREE.BoxGeometry(w * 0.88, 0.16, 1.35)), track(new THREE.MeshLambertMaterial({ color: awnCol })));
    awn.position.set(0, 3.05, d / 2 + 0.62); awn.rotation.x = 0.25; awn.castShadow = true; g.add(awn);

    // 한글 가로 간판
    if (shopName) {
      const sBg = era === 4 ? ['#1d3557', '#7f1d1d', '#14532d', '#3b2416', '#2a2a32'][variant % 5] : '#3a2818';
      const sFg = '#fff8e8';
      const st = t3SignTex(shopName, null, sBg, sFg, '#f2c14e');
      const sm = track(new THREE.MeshLambertMaterial({ map: st, emissive: '#ffffff', emissiveMap: st, emissiveIntensity: 0 }));
      emMats.push({ mat: sm, max: era === 4 ? 0.95 : 0.45 });
      const sign = new THREE.Mesh(track(new THREE.BoxGeometry(Math.min(4.4, w * 0.48), 1.0, 0.16)), sm);
      sign.position.set(0, 3.65, d / 2 + 0.14); g.add(sign);

      // 근대/근세: 도로 쪽으로 튀어나온 세로 돌출 간판 (서울 러시 시그니처!)
      if (era >= 3 && stories >= 3) {
        const vt = t3VertSignTex(shopName, ['#b83228', '#224b8a', '#266a44', '#c27e1c'][variant % 4], '#fff');
        const vm = track(new THREE.MeshLambertMaterial({ map: vt, emissive: '#ffffff', emissiveMap: vt, emissiveIntensity: 0 }));
        emMats.push({ mat: vm, max: 1.05 });
        const vs = new THREE.Mesh(track(new THREE.BoxGeometry(0.18, 3.2, 0.92)), vm);
        vs.position.set(w * 0.38, 5.8, d / 2 + 0.68); vs.castShadow = true; g.add(vs);
      }
    }
    scene.add(g);
    const hx = isCross ? w / 2 : d / 2, hz = isCross ? d / 2 : w / 2;
    addCol(cx, cz, hx + 0.2, hz + 0.2);
    mapBoxes.push({ x: cx, z: cz, w: hx * 2, d: hz * 2, col: era === 4 ? '#6e6a62' : '#7a7262' });
  }

  for (const sl of slots) {
    const b = bIdx < townBlds.length ? townBlds[bIdx] : null;
    const isCross = !!sl.cross;
    const cx = isCross ? sl.x : sl.side * (ROAD_HW + SIDE_W + 5.2);
    const cz = sl.z;
    const faceDir = isCross ? sl.faceZ : -sl.side; // 도로를 바라보는 방향
    const shopName = cfg.shops[shopIdx++ % cfg.shops.length];

    // 실제 지은 건물 중 기능 건물이 있고 실사 모델이 준비돼 있으면 실제 1m 스케일로 배치!
    // (근대 Era 4 에서는 앞쪽 상가 통일감을 위해 다층 벽돌·유리 상가에 해당 시설 간판과 POI를 입힌다)
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
        addCol(cx + sl.side * 0.5, cz, hx + 0.2, hz + 0.2);

        mapBoxes.push({ x: cx + sl.side * 0.5, z: cz, w: hx * 2, d: hz * 2, col: fi ? fi.col : '#8a7a62', icon: fi ? fi.badge : null });
        if (fi) {
          // 건물 앞 한글 간판 기둥 (양면 판독 + 보행 시선 쪽으로 살짝 각도)
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
          if (!usedFac.has(b.type)) {
            usedFac.add(b.type);
            pois.push({ x: sl.side * (ROAD_HW + SIDE_W - 1.8), z: cz, r: 2.8, kind: b.type, ...fi });
          }
        }
        placedReal = true;
      } else if (era === 4 && fi) {
        // 근대: 다층 도시 상가 건물에 해당 시설(학당·병영·장터·공장 등) 간판 + POI 연결!
        const stories = 3 + Math.floor(r() * 3);
        const bw = 10.8 + r() * 0.8, bd = 9.6 + r() * 1.0;
        placeFacadeBuilding(cx, cz, faceDir, bw, bd, stories, Math.floor(r() * 12), fi.name, false);
        mapBoxes[mapBoxes.length - 1].col = fi.col;
        mapBoxes[mapBoxes.length - 1].icon = fi.badge;
        if (!usedFac.has(b.type)) {
          usedFac.add(b.type);
          pois.push({ x: sl.side * (ROAD_HW + SIDE_W - 1.8), z: cz, r: 2.9, kind: b.type, ...fi });
        }
        placedReal = true;
      }
    }
    if (!placedReal) {
      // 시대별 거리 상가 / 주택
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

  // 근대/근세 원경 스카이라인 실루엣 (대로 북쪽·동서 너머로 멀리 도시 깊이감)
  if (era >= 3) {
    const skyBldMat = track(new THREE.MeshLambertMaterial({ color: era === 4 ? '#7c8694' : '#8a8278' }));
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + 0.15;
      const dist = L + 22 + r() * 34;
      const w = 10 + r() * 14, d = 10 + r() * 14, h = (era === 4 ? 18 : 12) + r() * (era === 4 ? 26 : 12);
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), skyBldMat);
      m.position.set(Math.sin(a) * dist, h / 2, Math.cos(a) * dist);
      scene.add(m);
    }
  }

  // 10) 보도 위 노점 / 포장마차 (서울 러시 시그니처!)
  const stallSpots = [
    { side: 1, z: 20, title: era === 4 ? '종로 포장마차' : '국밥 · 주막' },
    { side: -1, z: 28, title: era === 4 ? '떡볶이 · 어묵' : '과일 좌판' },
    { side: 1, z: -20, title: era === 4 ? '호떡 · 군밤' : '비단 · 잡화' },
    { side: -1, z: -24, title: era === 4 ? '포장마차' : '대장간 노점' },
  ];
  for (const st of stallSpots) {
    if (Math.abs(st.z) > L - 14) continue;
    const sx = st.side * (ROAD_HW + SIDE_W - 1.55), sz = st.z;
    const g = new THREE.Group(); g.position.set(sx, SIDE_H, sz);
    g.rotation.y = st.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    if (era === 4) {
      // 주황색 포장마차 천막 + 앞/옆면 모두 따뜻한 비닐 창 + 빨강/파랑 플라스틱 의자
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
      // 시대별 시장 천막 좌판
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
    scene.add(g);
    addCol(sx, sz, 1.25, 2.2);
  }

  // 11) 가로수 + 수목보호대 + 가로등 (연석 따라 일렬 배치 → 서울 러시 원근 리듬!)
  const planterMat = track(new THREE.MeshLambertMaterial({ color: era === 4 ? '#5c6068' : '#7a7468' }));
  const soilMat = track(new THREE.MeshLambertMaterial({ color: '#4c3e2c' }));
  const lampPostMat = track(new THREE.MeshLambertMaterial({ color: era >= 3 ? '#22262c' : '#5a3a20' }));
  const lampGlowMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(cfg.lampCol).multiplyScalar(1.6) }));
  const hasRealTree = realOk && RA.has('tree_broadleaf_a');
  const treeScale = 0.56;

  for (let z = gateZ - 14; z >= keepZ + 12; z -= 15) {
    if (Math.abs(z) < 12.5) continue; // 광장/교차로 비움
    for (const sx of [-1, 1]) {
      const tx = sx * (ROAD_HW + 0.95);
      // 가로수 + 수목보호대
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

      // 가로등 (가로수 사이 z - 7 위치)
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

  // 12) 보행 주민 + 경비병 생성
  const citizens = [];
  const lowQ = R3D.quality && R3D.quality() === 'low';
  const wantCit = clamp(8 + Math.floor(town.pop / 3), 10, lowQ ? 14 : 24);
  const roles = ['idle', 'trade', 'farm', 'chores', 'smith', 'study', 'water'];
  for (let i = 0; i < wantCit; i++) {
    const vl = eraVillager();
    const look = { body: vl.body, legs: vl.legs || '#3a3028', hat: vl.hat, helm: '#e8d8b0', role: 'villager', era, scale: 1 };
    const m = R3D.human(look);
    const cs = m.real ? 2.15 : 1.42;
    m.group.scale.setScalar(cs);
    const side = i % 2 === 0 ? -1 : 1;
    const laneX = side * (ROAD_HW + 2.3 + (r() - 0.5) * 1.4);
    const startZ = lerp(keepZ + 12, gateZ - 6, r());
    const dir = r() < 0.5 ? 1 : -1;
    m.group.position.set(laneX, SIDE_H, startZ);
    scene.add(m.group);
    citizens.push({
      m, cs, x: laneX, z: startZ, y: SIDE_H, side, dir,
      spd: 1.55 + r() * 0.85, walk: r() * 20, yaw: dir > 0 ? 0 : Math.PI,
      wait: r() < 0.2 ? 1 + r() * 3 : 0, talkT: 0,
      name: EV_NAMES[(i * 3 + town.id) % EV_NAMES.length],
      role: roles[i % roles.length],
    });
  }
  // 남문 · 성채 앞 경비병 (군대가 있으면 배치)
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
    guards.push({ m, x: gx, z: gz, y: SIDE_H, yaw: gy, talkT: 0, name: ['수문장', '경비대장', '근위병', '파수병'][i], role: 'guard' });
  }

  // 13) 영주 (플레이어)
  const pLook = Object.assign(eraLook('player'), { scale: 1 });
  const playerM = R3D.human(pLook);
  const pScale = playerM.real ? 2.25 : 1.5;
  playerM.group.scale.setScalar(pScale);
  scene.add(playerM.group);

  // 상호작용 바닥 고리 (빛나는 황금 링 — 서울 러시처럼 목표/시설 위치 명확히 표시)
  const poiRings = pois.map(p => {
    const ring = new THREE.Mesh(
      track(new THREE.RingGeometry(0.95, 1.25, 28).rotateX(-Math.PI / 2)),
      track(new THREE.MeshBasicMaterial({ color: new THREE.Color(p.col).multiplyScalar(1.6), transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }))
    );
    ring.position.set(p.x, (Math.abs(p.x) > ROAD_HW ? SIDE_H : 0) + 0.05, p.z);
    ring.renderOrder = 4; scene.add(ring);
    return ring;
  });

  // 14) 낮 꽃가루 / 밤 반딧불이 입자 (드로우콜 1회)
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
    colliders, pois, poiRings, mapBoxes, lights, flags, emMats,
    citizens, guards, playerM, pScale, ambPts, pSeed,
    // 플레이어 & 카메라 상태 (남문 안쪽 넓은 보도에서 막힘없이 대로와 광장을 바라보며 시작!)
    px: 6.8, pz: gateZ - 3.6, py: SIDE_H, pYaw: Math.PI, walk: 0, moving: false, sprint: false,
    camYaw: 0, camPitch: 0.14, camBack: 4.5,
    nearPoi: null, nearCit: null, talk: null,
    exitCool: 0.8, lastT: performance.now(),
  };
}

// ---------- 진입 / 퇴장 ----------
let t3ExitGrace = 0; // 퇴장 직후 월드에서 바로 재진입 방지

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
  banner(`🏘️ ${town.name} ${eraCur().town}`, 'WASD/조이스틱 이동 · 오른쪽 끌기 시선 · E/탭 대화 및 시설 이용', 2.8);
  t3Resize();
}

function exitTown(silent) {
  if (!T3) return;
  const town = T3.town;
  // 리소스 정리
  for (const c of T3.citizens) if (c.m.dispose) c.m.dispose();
  for (const g of T3.guards) if (g.m.dispose) g.m.dispose();
  if (T3.playerM && T3.playerM.dispose) T3.playerM.dispose();
  for (const o of T3.own) { try { o.dispose(); } catch (e) {} }
  T3.active = false;
  T3 = null;
  MODE = 'world';
  document.body.classList.remove('town');
  lookHook = null;
  $('talkBox').classList.remove('show');
  if ($('townPrompt')) $('townPrompt').style.display = 'none';
  if ($('townActBtn')) $('townActBtn').style.display = 'none';
  if ($('townRunBtn')) $('townRunBtn').classList.remove('on');
  // 마을 남쪽 바깥으로 부드럽게 배치해 즉시 재진입 방지
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

// ---------- 이동 & 충돌 ----------
function t3ResolveCol(x, z, rad) {
  const S3 = T3;
  x = clamp(x, -S3.W_CROSS + 2, S3.W_CROSS - 2);
  z = clamp(z, S3.keepZ + 5.2, S3.gateZ + 2.2);
  for (let it = 0; it < 2; it++) {
    for (const c of S3.colliders) {
      const dx = x - c.x, dz = z - c.z, ox = c.hx + rad - Math.abs(dx), oz = c.hz + rad - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) x += dx < 0 ? -ox : ox; else z += dz < 0 ? -oz : oz;
      }
    }
  }
  return { x, z };
}

function t3GroundY(x, z) {
  const S3 = T3;
  // 도로/광장 위는 0, 보도 위는 SIDE_H
  if (Math.abs(x) < S3.ROAD_HW && Math.abs(z) > 12) return 0;
  if (Math.abs(z) < S3.ROAD_HW && Math.abs(x) > 12) return 0;
  if (Math.abs(x) <= 12 && Math.abs(z) <= 12) return 0.02;
  return S3.SIDE_H;
}

// ---------- 업데이트 ----------
function updateTown3D(dt) {
  const S3 = T3; if (!S3 || !S3.active) return;
  S.time += dt;
  if (typeof eraTick === 'function') eraTick(dt);
  if (S3.exitCool > 0) S3.exitCool -= dt;

  // 키보드 시선 회전
  if (keys['q']) S3.camYaw -= dt * 1.9;
  if (keys['e'] && !S3.nearPoi && !S3.nearCit) S3.camYaw += dt * 1.9;

  // 이동
  const mv = moveInput();
  const sprint = !!(keys['shift'] || S3.sprint || mv.l > 0.92);
  S3.moving = mv.l > 0.08;
  if (S3.moving) {
    const cy = Math.cos(S3.camYaw), sy = Math.sin(S3.camYaw);
    // 카메라 기준 전진(-z)과 좌우(+x)
    const wx = mv.x * cy - mv.y * sy;
    const wz = mv.x * sy + mv.y * cy;
    const sp = (sprint ? 6.8 : 3.7) * Math.max(0.45, mv.l);
    const nx = S3.px + wx * sp * dt, nz = S3.pz + wz * sp * dt;
    const p = t3ResolveCol(nx, nz, 0.42);
    S3.px = p.x; S3.pz = p.z;
    const tgtYaw = Math.atan2(wx, wz);
    S3.pYaw += angDiff(tgtYaw, S3.pYaw) * Math.min(1, dt * 12);
    S3.walk += dt * (sprint ? 11 : 6.5);
    // 앞으로 걸을 때 카메라 살짝 따라 돌기
    if (mv.y < -0.25 && Math.abs(mv.x) > 0.15) {
      const hy = Math.atan2(wx, -wz);
      S3.camYaw += angDiff(hy, S3.camYaw) * Math.min(1, dt * 0.9);
    }
  }
  const ty = t3GroundY(S3.px, S3.pz);
  S3.py += (ty - S3.py) * Math.min(1, dt * 16);

  // 남문 밖으로 걸어 나가면 자동 퇴장
  if (S3.exitCool <= 0 && S3.pz > S3.gateZ + 0.8 && Math.abs(S3.px) < 5.5) {
    exitTown(false);
    return;
  }

  // 플레이어 포즈
  S3.playerM.pose({ walk: S3.walk, moving: S3.moving, slow: !sprint, swing: 0, yaw: S3.pYaw });
  S3.playerM.group.position.set(S3.px, S3.py, S3.pz);

  // 보행 주민 업데이트
  for (const c of S3.citizens) {
    if (c.talkT > 0) {
      c.talkT -= dt;
      const dy = Math.atan2(S3.px - c.x, S3.pz - c.z);
      c.yaw += angDiff(dy, c.yaw) * Math.min(1, dt * 10);
      c.m.pose({ walk: c.walk, moving: false, slow: true, swing: 0, yaw: c.yaw });
      continue;
    }
    if (c.wait > 0) {
      c.wait -= dt;
      c.m.pose({ walk: c.walk, moving: false, slow: true, swing: 0, yaw: c.yaw });
      continue;
    }
    const nz = c.z + c.dir * c.spd * dt;
    if (nz > S3.gateZ - 4 || nz < S3.keepZ + 11) { c.dir *= -1; c.wait = 0.6 + rand() * 1.4; }
    else {
      // 플레이어와 너무 가까우면 살짝 비켜 서기
      const d2 = (c.x - S3.px) ** 2 + (nz - S3.pz) ** 2;
      if (d2 > 1.2 * 1.2) { c.z = nz; c.walk += dt * c.spd * 3.2; }
      else { c.wait = 0.5; }
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
  for (const p of S3.pois) {
    const d = Math.hypot(S3.px - p.x, S3.pz - p.z);
    if (d < p.r && d < bdP) { bdP = d; bestP = p; }
  }
  S3.nearPoi = bestP;

  let bestC = null, bdC = 3.2;
  for (const c of S3.citizens.concat(S3.guards)) {
    const d = Math.hypot(S3.px - c.x, S3.pz - c.z);
    if (d < bdC) { bdC = d; bestC = c; }
  }
  S3.nearCit = bestC;

  // 말풍선 타이머
  if (S3.talk) {
    S3.talk.t -= dt;
    if (S3.talk.t <= 0 || Math.hypot(S3.px - S3.talk.c.x, S3.pz - S3.talk.c.z) > 8) {
      S3.talk = null; $('talkBox').classList.remove('show');
    }
  }
}

// ---------- 상호작용 ----------
function t3Say(c) {
  if (!c || !T3) return;
  const e = clamp(S.era | 0, 0, ERAS.length - 1);
  c.talkT = 5.5;
  let roleLabel, line;
  if (c.role === 'guard') {
    roleLabel = c.name;
    const GL = [
      `${EV_HAIL[e]}! ${T3.town.name} 거리는 오늘도 평온합니다.`,
      `성문 경계 이상 없습니다! 언제든 명령만 내리십시오.`,
      `최근 산적들이 얼씬거리지 못하도록 순찰을 강화했습니다.`,
    ];
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

function t3Interact() {
  if (!T3 || MODE !== 'town' || paused) return;
  if (T3.nearPoi) {
    const a = T3.nearPoi.act;
    if (a === 'exit') { exitTown(false); return; }
    if (a === 'build') {
      // 플레이어 위치를 마을 위로 맞춰 기존 openBuild가 이 마을을 열도록
      const t = T3.town; S.player.x = (t.x + 0.5) * T; S.player.y = (t.y + 0.5) * T;
      openBuild(true); return;
    }
    if (a === 'tech') { if (typeof openTechPanel === 'function') openTechPanel(); return; }
    if (a === 'army') { if (typeof openArmyPanel === 'function') openArmyPanel(); return; }
    if (a === 'board') { if (typeof evBoard === 'function') evBoard(); return; }
  }
  if (T3.nearCit) t3Say(T3.nearCit);
}

// 탭으로 주민에게 말 걸기 또는 시설 이용
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
  if (T3.nearPoi) t3Interact();
});

keyHooks.push((k, down) => {
  if (!down || MODE !== 'town' || !T3 || paused) return;
  if (k === 'e' || k === ' ' || k === 'f') { if (T3.nearPoi || T3.nearCit) t3Interact(); }
  if (k === 'escape') exitTown(false);
});

// ---------- 렌더링 ----------
const t3SunDir = new THREE.Vector3(), t3C1 = new THREE.Color();
function drawTown3D() {
  const S3 = T3; if (!S3 || !S3.active) return;
  const now = performance.now(), dt = Math.min(0.1, (now - S3.lastT) / 1000); S3.lastT = now;
  R3D.tick(dt);
  const tm = S.time;
  if (typeof RA !== 'undefined' && RA.U) { RA.U.time.value = tm; RA.U.chop.value.z = 0; if (RA.U.fade) RA.U.fade.value.set(0, 0, 0, 0); }

  // 3인칭 어깨 뒤 추적 카메라 (서울 러시 구도: 영주 전신이 하단 중앙에 보이고 거리 소실점이 길게 열림)
  const fx = Math.sin(S3.camYaw), fz = -Math.cos(S3.camYaw);
  const rx = Math.cos(S3.camYaw), rz = Math.sin(S3.camYaw);
  let wantBack = 4.6;
  // 카메라 벽 충돌 방지
  for (let d = 0.8; d <= 4.7; d += 0.35) {
    const cx = S3.px - fx * d + rx * 0.42 * (d / 4.6);
    const cz = S3.pz - fz * d + rz * 0.42 * (d / 4.6);
    if (S3.colliders.some(c => Math.abs(cx - c.x) < c.hx + 0.35 && Math.abs(cz - c.z) < c.hz + 0.35)) {
      wantBack = Math.max(1.6, d - 0.5); break;
    }
  }
  S3.camBack += (wantBack - S3.camBack) * Math.min(1, dt * 10);
  const B = S3.camBack, cp = Math.cos(S3.camPitch), sp = Math.sin(S3.camPitch);
  const camX = S3.px - fx * B * cp + rx * 0.38 * (B / 4.6);
  const camY = S3.py + 1.55 + B * sp + 0.35;
  const camZ = S3.pz - fz * B * cp + rz * 0.38 * (B / 4.6);
  S3.cam.position.set(camX, camY, camZ);
  S3.cam.lookAt(S3.px + fx * 11 + rx * 0.22, S3.py + 1.18 - sp * 1.0, S3.pz + fz * 11 + rz * 0.22);
  S3.cam.updateMatrixWorld();

  // 시간대별 조명 · 하늘 · 안개 · 색보정 (world3d.js W3_KEYS 재사용!)
  const ph = ((S.time / DAY_LEN) + 0.08) % 1, K = w3dKey(ph), d = dayInfo();
  const night = clamp(d.dark / 0.6, 0, 1), on = K.on;
  const day = ph < 0.5, ang = (day ? ph : ph - 0.5) * 2 * Math.PI;
  // 대각선 긴 그림자가 보도 위로 예쁘게 떨어지도록 태양 각도 조절
  t3SunDir.set(Math.cos(ang) * 0.85 + 0.25, 0.32 + Math.max(0, Math.sin(ang)) * 0.72, 0.48).normalize();

  S3.scene.background.copy(K.fog);
  S3.scene.fog.color.copy(K.fog);
  S3.scene.fog.near = lerp(42, 24, on);
  S3.scene.fog.far = lerp(138, 86, on);
  S3.sun.color.copy(K.sun); S3.sun.intensity = K.sI * 1.18;
  S3.hemi.color.copy(K.sky); S3.hemi.groundColor.copy(K.gnd); S3.hemi.intensity = K.hI * 1.08;
  if (S3.sky) S3.sky.update(K, t3SunDir, night, tm, 1.0);

  // 텍셀 스냅 그림자 카메라 (플레이어 주변 ±28m 선명한 대각선 그림자)
  {
    const sc = S3.sun.shadow.camera, sh = 28;
    const texel = (sh * 2) / Math.max(256, S3.sun.shadow.mapSize.x || 1024);
    const sx = Math.round((S3.px + fx * 8) / texel) * texel;
    const sz = Math.round((S3.pz + fz * 8) / texel) * texel;
    S3.sun.target.position.set(sx, 0, sz);
    S3.sun.position.copy(t3SunDir).multiplyScalar(55).add(S3.sun.target.position);
    S3.sun.target.updateMatrixWorld();
  }

  // 색보정 · 창문/상가/간판 발광
  const G = R3D.grade;
  G.exposure = K.ex * 1.02; G.bloom = K.bl; G.threshold = K.th; G.knee = 0.6;
  G.sat = K.sat; G.contrast = K.con; G.lift.copy(K.lift); G.gain.copy(K.gain); G.vignette = K.vig * 0.85;
  R3D.renderer.toneMappingExposure = R3D.fx && R3D.fx.on ? 1 : K.ex;
  if (R3D.uWin) { R3D.uWin.value = on * 1.7; R3D.uWinLit.value = 0.78; }
  if (R3D.uUp) R3D.uUp.value.setRGB(1.0, 0.58, 0.28).multiplyScalar(on * 0.75);
  if (R3D.uRim) R3D.uRim.value.setRGB(1.0, 0.94, 0.84).multiplyScalar(0.24).lerp(t3C1.setRGB(0.45, 0.55, 1.0).multiplyScalar(0.14), on);
  for (const e of S3.emMats) e.mat.emissiveIntensity = lerp(e.min || 0, e.max, on);

  // 깃발 · POI 고리 맥동
  for (const f of S3.flags) w3dWave(f, tm);
  S3.poiRings.forEach((rg, i) => {
    const s = 1 + Math.sin(tm * 4 + i) * 0.08;
    rg.scale.set(s, 1, s);
  });

  // 가로등 / 노점 / 모닥불 빛무리 + 바닥 빛웅덩이 + 가까운 4개 실제 PointLight
  const G1 = S3.glows, P1 = S3.pools; G1.begin(); P1.begin();
  if (on > 0.01) {
    for (const s of S3.lights) {
      const fl = s.fire ? 0.84 + Math.sin(tm * 17 + s.x) * 0.1 + Math.sin(tm * 27 + s.z) * 0.06 : 1;
      const kk = s.k * on * fl;
      s._d = (s.x - S3.px) ** 2 + (s.z - S3.pz) ** 2; s._kk = kk;
      if (s.glow) G1.add(s.x, s.y, s.z, s.glow, s.col, kk * 0.34);
      if (s.pool) P1.add(s.x, 0.19, s.z, s.pool, s.col, kk * 0.45);
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

  // 발밑 그림자 (영주 + 주민 + 경비병)
  const BL = S3.blobs; BL.begin();
  BL.add(S3.px, S3.pz, 0.58, S3.py);
  for (const c of S3.citizens) BL.add(c.x, c.z, 0.5, c.y);
  for (const g of S3.guards) BL.add(g.x, g.z, 0.54, g.y);
  BL.end();

  // 꽃가루(낮) / 반딧불이(밤) 부유 입자
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

  // 2D 오버레이 (시설 이름표 · 조이스틱 · 말풍선 위치 · 원형 거리 미니맵)
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
  g.globalAlpha = 1;
  drawJoystick();

  // 말풍선 화면 투영
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
  // 시각 문자열 (00:00~23:59)
  const ph = ((S.time / DAY_LEN) + 0.08) % 1;
  const hrs = ((ph * 24 + 6) % 24);
  const hh = String(hrs | 0).padStart(2, '0'), mm = String(((hrs % 1) * 60) | 0).padStart(2, '0');
  const icon = hrs >= 6 && hrs < 17 ? '☀️' : hrs >= 17 && hrs < 19.5 ? '🌅' : '🌙';
  const hdr = `<b>${S3.town.name} ${eraCur().town} Lv${S3.lv}</b><small>${icon} ${hh}:${mm} · 👥 ${S3.town.pop} · 🪙 ${S.gold}</small>`;
  const el = $('townHud');
  if (el && el.dataset.s !== hdr) { el.dataset.s = hdr; el.innerHTML = hdr; }

  // 하단 중앙 상호작용 안내 (서울 러시 스타일: [E] 눌러 ...)
  const pr = $('townPrompt');
  let ptxt = '';
  if (S3.nearPoi) ptxt = `<b>E</b> ${S3.nearPoi.icon} ${S3.nearPoi.label} · ${S3.nearPoi.name}`;
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
    ab.style.display = (S3.nearPoi || S3.nearCit) && !paused ? 'flex' : 'none';
    ab.innerHTML = S3.nearPoi ? (S3.nearPoi.act === 'exit' ? '🚪<br>나가기' : '✨<br>이용') : '💬<br>대화';
  }

  // 원형 거리 미니맵 (서울 러시 스타일)
  const mc = $('townMap');
  if (mc) {
    const mg = mc.getContext('2d'), R = mc.width / 2, sc = 1.15;
    mg.clearRect(0, 0, mc.width, mc.height);
    mg.save();
    mg.beginPath(); mg.arc(R, R, R - 2, 0, Math.PI * 2); mg.clip();
    mg.fillStyle = '#252c26'; mg.fillRect(0, 0, mc.width, mc.height);
    mg.translate(R, R);
    mg.rotate(S3.camYaw); // 카메라 진행 방향이 항상 위쪽!
    mg.translate(-S3.px * sc, -S3.pz * sc);

    // 보도 + 도로 + 광장
    mg.fillStyle = '#5c626a';
    mg.fillRect(-(S3.ROAD_HW + S3.SIDE_W) * sc, -S3.L * sc, (S3.ROAD_HW + S3.SIDE_W) * 2 * sc, S3.L * 2 * sc);
    mg.fillRect(-S3.W_CROSS * sc, -(S3.ROAD_HW + 4.6) * sc, S3.W_CROSS * 2 * sc, (S3.ROAD_HW + 4.6) * 2 * sc);
    mg.fillStyle = '#383d44';
    mg.fillRect(-S3.ROAD_HW * sc, -S3.L * sc, S3.ROAD_HW * 2 * sc, S3.L * 2 * sc);
    mg.fillRect(-S3.W_CROSS * sc, -S3.ROAD_HW * sc, S3.W_CROSS * 2 * sc, S3.ROAD_HW * 2 * sc);
    mg.fillStyle = '#6c6860'; mg.fillRect(-12 * sc, -12 * sc, 24 * sc, 24 * sc);

    // 건물 블록 & 시설 배지
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
    // 출구 표시
    mg.fillStyle = '#6be07b'; mg.beginPath(); mg.arc(0, S3.gateZ * sc, 4.5, 0, 7); mg.fill();
    // 주민 점
    mg.fillStyle = 'rgba(255,255,255,.72)';
    for (const c of S3.citizens) { mg.beginPath(); mg.arc(c.x * sc, c.z * sc, 1.8, 0, 7); mg.fill(); }
    mg.restore();

    // 중앙 플레이어 화살표
    mg.save(); mg.translate(R, R);
    mg.fillStyle = '#4fa3ff'; mg.strokeStyle = '#fff'; mg.lineWidth = 1.8;
    mg.beginPath(); mg.moveTo(0, -8); mg.lineTo(6, 6); mg.lineTo(0, 3); mg.lineTo(-6, 6); mg.closePath();
    mg.fill(); mg.stroke();
    mg.restore();
    // 북쪽(N) 표식
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
