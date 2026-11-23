'use strict';
// ===== event.js: 특별 사건 — '장면 속으로' 들어가 직접 겪는 이벤트 =====
// 첫 사건: 사람 찾기 (마을 아이/노인이 사라졌다)
//   묻기: "직접 찾으러 가시겠습니까?"  네 → 3인칭(어깨 뒤) 시점으로 바뀌어 직접 걸어 다니며 마을 사람에게 묻고 찾는다
//                                       아니오 → 경비병을 보낸다 (잠시 뒤 작은 보상, 가끔 실패)
//   3인칭 동안: 조이스틱 = 카메라 기준 이동, 화면 오른쪽 끌기 = 시선 돌리기(Q/E 키도), 마을 사람 톡/「말 걸기」 = 대화
//   잃어버린 사람 가까이 가면 찾음 → 보상 → 위에서 내려다보는 시점으로 돌아간다
// 저장하지 않는다 (S 밖 전역 EV) → 저장 형식 그대로. 새로고침하면 사건은 사라진다
// 테스트: __game.startEvent('findPerson'), __game.ev
let EV = null;
const EVCAM = { k: 0, yaw: 0 }; // 3인칭 섞임(0~1)과 바라보는 방향 (world3d.js w3dTPCam)
let evT = 0, evNext = 200;
function evBusy() { return !!EV; }
function evTP() { return !!(EV && EV.tp); }

// ---------- 말 (시대: 0 부족 · 1 고대 · 2 중세 · 3 근세) ----------
const EV_KIDS = ['순이', '돌이', '복동이', '꽃님이', '막동이', '달래', '분이', '똘이'];
const EV_ELDERS = ['김 노인', '박 할머니', '최 영감', '이 할멈', '한 노인', '윤 할머니'];
const EV_NAMES = ['갑돌', '을순', '삼월', '덕배', '옥분', '만석', '두리', '말순', '칠복', '봉구', '금순', '오목', '개똥', '향단', '마당쇠', '들레'];
// 역할 이름 (시대별)
const VROLE = {
  farm: ['밭일꾼', '농부', '농부', '농부'], chores: ['아낙', '아낙', '아낙', '주민'], trade: ['물물교환꾼', '상인', '상인', '상인'],
  study: ['주술사 제자', '서생', '수도사', '학자'], smith: ['돌칼 장인', '청동 대장장이', '대장장이', '대장장이'], fletch: ['사냥꾼', '활 장인', '활 장인', '화약 장인'],
  groom: ['말 길들이는 이', '마부', '마부', '마부'], water: ['물 긷는 아이', '물 긷는 아낙', '물 긷는 아낙', '물장수'],
  lumber: ['나무꾼', '나무꾼', '나무꾼', '벌목꾼'], quarry: ['돌 줍는 이', '석공', '석공', '석공'], mine: ['금 캐는 이', '광부', '광부', '광부'],
  idle: ['부족민', '백성', '농민', '시민'],
};
// 역할별 평소 말 ({T} = 군주 칭호에 '님', 예: 족장님 · 왕이시여는 따로)
const VLINES = {
  farm: [['조 이삭이 여물었어요. 올겨울은 배곯지 않겠네요.', '돌괭이가 또 부러졌지 뭐예요.'], ['청동 낫 덕분에 추수가 빨라졌어요!', '올해는 비가 알맞게 와서 보리가 잘 됐습니다.'],
    ['영주님 밭부터 갈고 우리 밭을 갈아야 해서… 아이고 허리야.', '삼포식으로 돌려 짓으니 땅이 덜 지치네요.'], ['새로 들어온 감자란 작물, 척박한 땅에서도 잘 자라요!', '농사 개량 책자를 읽어 봤는데 글씨가 너무 작아요.']],
  chores: [['가죽을 무두질하는 중이에요. 냄새는 좀 참아 주세요.', '모닥불 꺼뜨리면 큰일 나요!'], ['베틀로 삼베를 짜고 있어요.', '토기에 장을 담갔어요. 맛 좀 보실래요?'],
    ['빵 굽는 날이라 화덕 앞이 덥네요.', '양털로 실을 잣는 중이에요.'], ['유리창 덕분에 집 안이 환해졌어요.', '시계탑 종소리에 맞춰 밥을 짓는답니다.']],
  trade: [['조개껍데기 세 개면 이 흑요석을 드리지요.', '저 너머 부족이 소금을 가져왔대요.'], ['동전이 생기니 장사가 훨씬 편해요!', '비단길 건너온 향신료, 한번 보세요.'],
    ['장날이라 사람이 바글바글해요.', '길드 허가 없이는 여기서 못 팝니다요.'], ['배가 들어오면 후추 값이 떨어질 거예요.', '어음 한 장이면 먼 도시와도 거래하지요.']],
  study: [['별자리를 보면 사냥 날을 알 수 있대요.', '동굴 벽에 오늘 사냥을 그려 두었어요.'], ['죽간에 왕의 업적을 새기고 있습니다.', '숫자를 셈하는 법을 배우는 중이에요.'],
    ['필사본 한 권 베끼는 데 한 해가 걸립니다.', '라틴어… 아니 옛 글은 어렵군요.'], ['인쇄기 덕분에 책이 싸졌습니다!', '망원경으로 달의 산을 봤어요!']],
  smith: [['흑요석을 떼어 창날을 만들어요.', '돌칼은 날이 금방 무뎌져요.'], ['구리에 주석을 섞으면 더 단단해지지요.', '청동 칼 한 자루 녹이는 데 하루가 꼬박이에요.'],
    ['철은 뜨거울 때 두드려야 합니다! 땅, 땅!', '기사님들 갑옷 수선이 밀려 있어요.'], ['총열을 곧게 뽑는 게 제일 어렵습니다.', '용광로 불이 꺼지면 안 돼요!']],
  fletch: [['짐승 힘줄로 활시위를 매요.', '오늘은 사슴 두 마리를 잡았어요!'], ['좋은 화살깃은 독수리 깃이 최고지요.', '활은 매일 당겨 봐야 해요.'],
    ['석궁 시위를 감는 데 한참 걸려요.', '주목나무 활이 제일 멀리 나가요.'], ['화약은 불 근처에 두면 안 돼요! 절대!', '머스킷 한 발 쏘고 장전하는 데 한참이에요.']],
  groom: [['야생마를 길들이는 중이에요. 조심하세요!', '말 등에 올라탄 건 우리 부족이 처음일걸요?'], ['전차 끄는 말은 잘 먹여야 해요.', '말발굽이 닳아서 걱정이에요.'],
    ['쇠 편자를 박으니 말이 덜 다쳐요.', '기사님 말은 성질이 사나워요.'], ['역마차가 다니니 소식이 빨라졌어요.', '기병대 말은 특별히 크답니다.']],
  water: [['샘물이 맑아서 좋아요.', '물동이가 무거워요… 영차.'], ['우물 덕분에 강까지 안 가도 돼요.', '두레박 줄이 닳았네요.'],
    ['우물가는 소문이 제일 빨리 도는 곳이죠.', '물 한 바가지 드릴까요?'], ['물 한 통에 동전 한 닢이요!', '수도관이 생긴다는 소문이 있던데요.']],
  lumber: [['돌도끼로 나무 베기 힘들어요.'], ['청동 도끼는 잘 들어요!'], ['이 참나무는 성 지을 때 쓴대요.'], ['톱질 한 번에 반 토막이지요!']],
  quarry: [['큰 돌을 굴려 옮겨요.'], ['돌을 반듯하게 다듬는 중이에요.'], ['성벽 돌은 이렇게 쪼개요.'], ['화약으로 바위를 깨면 금방이에요.']],
  mine: [['반짝이는 돌을 찾았어요!'], ['금맥이 굵어요!'], ['갱도 버팀목을 잘 세워야 해요.'], ['양수기 덕분에 갱도가 덜 잠겨요.']],
  idle: [['오늘 사냥은 잘 됐나요?', '저 산 너머엔 무엇이 있을까요?'], ['세금이 조금만 줄면 좋겠어요…', '성벽이 높아서 든든해요.'],
    ['도적떼 소문 때문에 밤길이 무서워요.', '성당 종소리가 참 좋지요?'], ['신문 보셨어요? 바다 건너 소식이 가득해요.', '도시가 날마다 커지네요!']],
};
const EV_HAIL = ['족장님', '전하', '폐하', '황제 폐하'];
function evRole(v) {
  if (v.job) return v.job.type in VROLE ? v.job.type : 'idle';
  return v.act || v.task || 'idle';
}
function evEra() { return clamp(S.era | 0, 0, 3); }
// 8방위 (게임 좌표 y가 남쪽)
function evDir(dx, dy) { return ['동', '남동', '남', '남서', '서', '북서', '북', '북동'][(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8]; }
function evPlace(tx, ty) {
  let w = 0, m = 0;
  for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) { const t = tileAt(x, y); if (t === WATER) w++; else if (t === MOUNTAIN || t === GOLD) m++; }
  if (tileAt(tx, ty) === FOREST || [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => tileAt(tx + a, ty + b) === FOREST).length >= 2) return w > 3 ? '물가 숲' : m > 3 ? '산기슭 숲' : '숲';
  return w > 3 ? '물가' : m > 3 ? '산기슭' : '들판';
}

// ---------- 시작 ----------
// 마을에서 걸어서 갈 수 있는 곳(물·산 너머 제외) 중 9~18칸 떨어진 숲 가장자리(없으면 아무 땅)
function evPickSpot(t) {
  const sx = t.x, sy = t.y, seen = new Uint8Array(W * H), q = [sy * W + sx], forest = [], land = [];
  seen[sy * W + sx] = 1;
  const ok = i => { const tt = S.tiles[i]; return tt !== WATER && tt !== MOUNTAIN && tt !== GOLD; };
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0, d = Math.hypot(x - sx, y - sy);
    if (d >= 9 && d <= 18 && neighborsLand(x, y) && !S.camps.some(c => Math.abs(c.x - x) + Math.abs(c.y - y) < 7)) {
      // 숲 바로 옆 풀밭/모래 (나무 그늘 아래 — 가까이 가면 보이고, 멀리선 나무에 가린다)
      if (S.tiles[i] !== FOREST && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => tileAt(x + a, y + b) === FOREST).length >= 2) forest.push(i); else land.push(i);
    }
    if (d > 19) continue;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + a, ny = y + b; if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      const j = ny * W + nx; if (seen[j] || !ok(j)) continue; seen[j] = 1; q.push(j);
    }
  }
  const pool = forest.length ? forest : land;
  return pool.length ? pool[ri(pool.length)] : -1;
}
function startEvent(kind) {
  kind = kind || 'findPerson';
  if (kind !== 'findPerson' || EV || MODE !== 'world' || !S || !S.towns.length || S.war) return false;
  const towns = S.towns.slice().sort((a, b) => dist2(a.x, a.y, S.player.x / T, S.player.y / T) - dist2(b.x, b.y, S.player.x / T, S.player.y / T));
  let t = null, spot = -1;
  for (const tt of towns) { spot = evPickSpot(tt); if (spot >= 0) { t = tt; break; } }
  if (!t) return false;
  const child = rand() < 0.6, vl = eraVillager(), e = evEra();
  const name = child ? EV_KIDS[ri(EV_KIDS.length)] : EV_ELDERS[ri(EV_ELDERS.length)];
  const look = child ? { body: vl.body, legs: vl.legs || '#4a3a2a', hat: null, helm: '#e8d8b0', hair: '#3a2414', scale: 1.1 * 0.72, lod: 1, role: 'villager' }
    : { body: '#8a8478', legs: '#4a4038', hat: e ? 'band' : null, helm: '#d8d0c0', hair: '#d8d8d0', scale: 1.1 * 0.95, lod: 1, role: 'villager' };
  const sx = spot % W, sy = (spot / W) | 0;
  EV = { kind, S, phase: 'ask', tp: false, town: t.id, t: 0, asked: 0, hint: '', reporter: EV_NAMES[ri(EV_NAMES.length)],
    who: { child, name, x: (sx + .5) * T, y: (sy + .5) * T, tx: sx, ty: sy, look, yaw: rand() * 6.28, place: evPlace(sx, sy) } };
  evAsk();
  return true;
}
function evWhoLabel() { const w = EV.who; return w.child ? `아이 ${w.name}` : w.name; }
function evAsk() {
  paused = true; actHeld = false; auto = null;
  const t = townById(EV.town), w = EV.who, tn = t ? t.name : '마을';
  const what = w.child ? `${josa(w.name, '이가')} 아침에 놀러 나가서는 해가 기울도록 돌아오지 않았어요!` : `${w.name}께서 약초를 캐러 나가셨다가 아직 안 돌아오셨어요!`;
  $('evPanel').innerHTML = `<h2>🔎 ${w.child ? '아이' : '노인'}${w.child ? '가' : '이'} 사라졌다!</h2>
    <div class="sub"><b>${tn}</b>의 ${josa(EV.reporter, '이가')} 헐레벌떡 달려왔습니다.</div>
    <div class="evquote">"${EV_HAIL[evEra()]}, ${what}"</div>
    <div style="font-size:17px;font-weight:800;margin:4px 0 12px;text-align:center">직접 찾으러 가시겠습니까?</div>
    <button class="opt primary" data-a="go"><span class="ic">🚶</span><span>네<small>${USE3D ? '마을 속으로 들어가 직접 걸으며' : '직접'} 마을 사람들에게 묻고 찾아 나섭니다 · 보상이 큽니다</small></span></button>
    <button class="opt" data-a="guard"><span class="ic">🛡️</span><span>아니오<small>경비병을 보냅니다 · 잠시 뒤 결과가 오고, 보상이 적거나 못 찾을 수도 있어요</small></span></button>`;
  $('evPanel').classList.add('show');
}
function evEnterTP() {
  if (!EV) return;
  dismount(); auto = null; actHeld = false;
  EV.phase = 'search'; EV.tp = USE3D;
  // 따라오던 병사들은 마을에 남는다 (3인칭 화면을 가리지 않게) → 끝나면 원래대로
  if (EV.tp && S.armyMode !== 'guard') { EV.army = S.armyMode; S.armyMode = 'guard'; for (const s of soldiers) s.post = null; }
  EVCAM.yaw = 0; // 지금 화면(북쪽을 위로)과 같은 방향으로 내려앉는다
  banner('🔎 ' + evWhoLabel() + ' 찾기', '마을 사람들에게 물어보세요', 2.5);
}
function evExitTP() {
  if (!EV) return;
  EV.tp = false;
  if (EV.army) { S.armyMode = EV.army; EV.army = null; for (const s of soldiers) s.post = null; }
}
function evGuards() {
  if (!EV) return;
  evExitTP(); EV.phase = 'guards'; EV.t = 22 + rand() * 10;
  toast(`🛡️ 경비병들이 ${josa(evWhoLabel(), '을를')} 찾으러 나갔습니다`, 2.5);
}
$('evPanel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !EV) return;
  $('evPanel').classList.remove('show'); paused = false;
  const a = b.dataset.a;
  if (a === 'go') evEnterTP();
  else if (a === 'guard') evGuards();
  else if (a === 'done') { evExitTP(); EV.phase = 'end'; }
});
$('evExit').addEventListener('click', () => {
  if (!EV || EV.phase !== 'search') return;
  evGuards(); // 돌아가면 경비병에게 맡긴다
});

// ---------- 매 프레임 (updateWorld 안, 멈춤 아닐 때) ----------
function evUpdate(dt) {
  if (EV && EV.S !== S) { EV = null; EVCAM.k = 0; } // 새 게임 · 불러오기
  if (EV && EV.army && !EV.tp) evExitTP();
  if (!EV) {
    if (!S.towns.length || S.war || MODE !== 'world') return;
    evT += dt;
    if (evT > evNext) { evT = 0; evNext = rr(240, 420); if (S.towns.reduce((a, t) => a + t.pop, 0) >= 6 && rand() < 0.65) startEvent('findPerson'); }
    return;
  }
  const p = S.player, w = EV.who;
  if (EV.phase === 'search') {
    if (dist2(p.x, p.y, w.x, w.y) < (T * 1.3) ** 2) evFound();
  } else if (EV.phase === 'guards') {
    EV.t -= dt;
    if (EV.t <= 0) {
      const ok = rand() < 0.72, e = evEra();
      if (ok) {
        const g = 15 + 10 * e; S.gold += g;
        toast(`🛡️ 경비병이 ${josa(evWhoLabel(), '을를')} 찾아 데려왔습니다 · 🪙+${g}`, 3.5);
      } else {
        const t = townById(EV.town); if (t && t.pop > 2) t.pop--;
        toast(`🛡️ 경비병이 ${josa(evWhoLabel(), '을를')} 끝내 찾지 못했습니다… 마을이 슬픔에 잠겼습니다 (👥-1)`, 4);
      }
      EV.phase = 'end';
    }
  } else if (EV.phase === 'end' && EVCAM.k <= 0.001) EV = null;
}
function evFound() {
  const e = evEra(), t = townById(EV.town), w = EV.who;
  const gold = 40 + 25 * e, exp = 30;
  EV.phase = 'found'; paused = true; actHeld = false; auto = null;
  S.gold += gold; gainExp(exp); if (t) t.pop += 2;
  const said = w.child ? `"${EV_HAIL[e]}! 무서웠어요… 길을 잃어서 계속 울었어요."` : `"아이고, ${EV_HAIL[e]}께서 몸소 오시다니… 발목을 삐어 꼼짝 못 하고 있었습니다."`;
  $('evPanel').innerHTML = `<h2>🎉 ${josa(evWhoLabel(), '을를')} 찾았다!</h2>
    <div class="evquote">${said}</div>
    <div class="sub" style="text-align:center">${t ? `<b>${t.name}</b> 사람들이 ${EV_HAIL[e]}의 이름을 칭송합니다.` : ''}${EV.asked ? `<br><small>물어본 사람 ${EV.asked}명</small>` : ''}</div>
    <div class="stats"><span>🪙 감사의 선물</span><b>+${gold}</b><span>⭐ 경험치</span><b>+${exp}</b><span>👥 ${t ? t.name : '마을'}에 이주민</span><b>+2</b></div>
    <button class="opt primary" data-a="done" style="justify-content:center"><span>🏰 함께 마을로 돌아가기</span></button>`;
  $('evPanel').classList.add('show');
  save();
}

// ---------- 3인칭 이동 (updateWorld) ----------
function evMove(mv, dt) {
  if (!EV || !EV.tp) return mv;
  if (keys['q']) EVCAM.yaw -= dt * 1.8; if (keys['e']) EVCAM.yaw += dt * 1.8;
  const y = EVCAM.yaw, c = Math.cos(y), s = Math.sin(y);
  const wx = mv.x * c - mv.y * s, wz = mv.x * s + mv.y * c;
  // 앞으로 밀고 있으면 카메라가 천천히 영주가 향한 쪽으로 따라 돈다 (옆으로만 밀면 게걸음)
  if (mv.l > 0.08 && mv.y < 0) { const hy = Math.atan2(wx, -wz); EVCAM.yaw += angDiff(hy, EVCAM.yaw) * Math.min(1, dt * 1.6 * (-mv.y / mv.l)); }
  return { x: wx, y: wz, l: mv.l };
}
lookHook = null;
function evLook(dx) { EVCAM.yaw += dx * 0.008; }

// ---------- 말 걸기 ----------
let evTalk = null; // { v, html, t }
function evNearVillager(maxTiles) {
  const p = S.player; let best = null, bd = (maxTiles * T) ** 2;
  for (const v of villagers) { const d = dist2(p.x, p.y, v.x, v.y); if (d < bd) { bd = d; best = v; } }
  return best;
}
function evLineFor(v) {
  const e = evEra(), role = evRole(v);
  if (!v.name) v.name = EV_NAMES[ri(EV_NAMES.length)];
  const roleName = (VROLE[role] || VROLE.idle)[e];
  let line;
  if (EV && EV.phase === 'search') {
    if (v.evLine && v.evLineEV === EV) line = v.evLine;
    else {
      const w = EV.who, dx = w.x - v.x, dy = w.y - v.y, dir = evDir(dx, dy), far = Math.hypot(dx, dy) / T > 13 ? '꽤 멀리 ' : '';
      const where = `${dir}쪽 ${w.place}`;
      const give = EV.hintN === undefined ? rand() < 0.8 : rand() < (EV.noHint >= 1 ? 1 : 0.6);
      if (give) {
        const H = w.child ? [`${josa(w.name, '이가')} ${far}${josa(where, '으로로')} 가는 걸 봤어요!`, `아까 ${far}${dir}쪽에서 아이 우는 소리가 들렸어요.`, `${w.name}? 나비 쫓아서 ${josa(where, '으로로')} 뛰어가던데요.`]
          : [`${w.name}께서 ${far}${where}에서 약초를 캐신다고 했어요.`, `${dir}쪽으로 지팡이 짚고 가시는 걸 봤어요.`, `${w.place}에 좋은 약초가 난다고 ${dir}쪽으로 가셨는데…`];
        line = H[ri(H.length)]; EV.hint = where; EV.hintN = (EV.hintN || 0) + 1; EV.noHint = 0;
      } else {
        const N = ['저런, 큰일이네… 저는 못 봤어요. 다른 사람한테도 물어보세요.', '못 봤는데요… 우물가 사람들이 알지도 몰라요.', '아이고, 일하느라 정신이 없어서… 죄송해요.'];
        line = N[ri(N.length)]; EV.noHint = (EV.noHint || 0) + 1;
      }
      v.evLine = line; v.evLineEV = EV; EV.asked++;
    }
  } else {
    const L = (VLINES[role] || VLINES.idle)[e];
    line = rand() < 0.25 ? `${EV_HAIL[e]}! ${L[ri(L.length)]}` : L[ri(L.length)];
  }
  return { role: roleName, name: v.name, line };
}
function evSay(v) {
  if (!v) return;
  const L = evLineFor(v);
  v.talkT = 5;
  evTalk = { v, t: 5, html: `<b>${L.role} ${L.name}</b>${L.line}` };
  $('talkBox').innerHTML = evTalk.html; $('talkBox').classList.add('show');
}
$('talkBtn').addEventListener('click', () => { if (EV && EV.phase === 'search') evSay(evNearVillager(2)); });
$('talkBox').addEventListener('click', () => { evTalk = null; $('talkBox').classList.remove('show'); });
// 3인칭에서 화면을 톡: 가까운 마을 사람이면 말 걸기. 3인칭에선 다른 탭 행동(자동 이동)은 하지 않는다
function evTap(sx, sy) {
  if (!EV || !EV.tp || !USE3D) return false;
  const p = S.player, pr = {}, hk = W3_TP.hk;
  let best = null, bd = 56 * 56;
  for (const v of villagers) {
    if (dist2(p.x, p.y, v.x, v.y) > (T * 9) ** 2) continue;
    R3D.project(v.x / T, 0.75 * hk, v.y / T, pr); if (!pr.vis) continue;
    const d = (pr.x - sx) ** 2 + (pr.y - sy) ** 2; if (d < bd) { bd = d; best = v; }
  }
  if (best) { if (dist2(p.x, p.y, best.x, best.y) < (T * 4) ** 2) evSay(best); else toast('조금 더 가까이 가서 말을 걸어 보세요', 1.5); }
  return true;
}

// ---------- HUD (매 프레임, 멈춤과 상관없이) ----------
function evHud(dt) {
  const tp = !!(EV && EV.tp);
  EVCAM.k = clamp(EVCAM.k + (tp ? dt : -dt) / 1.3, 0, 1);
  lookHook = tp ? evLook : null;
  document.body.classList.toggle('tp', tp || EVCAM.k > 0.5);
  const hud = $('evHud');
  if (!EV || EV.phase === 'end' || EV.phase === 'ask') { if (hud.style.display !== 'none') hud.style.display = 'none'; }
  else {
    hud.style.display = 'block'; hud.classList.toggle('bot', !EV.tp);
    let s;
    if (EV.phase === 'guards') s = `🛡️ 경비병이 ${josa(evWhoLabel(), '을를')} 찾는 중…`;
    else s = `🔎 ${josa(evWhoLabel(), '을를')} 찾아라<small>${EV.hint ? `단서: ${EV.hint} 쪽` : USE3D ? '마을 사람에게 톡 하거나 「말 걸기」로 물어보세요' : '마을 사람 곁에서 「말 걸기」로 물어보세요'}</small>`;
    if (hud.dataset.s !== s) { hud.dataset.s = s; $('evObj').innerHTML = s; }
    $('evExit').style.display = EV.phase === 'search' && EV.tp ? 'block' : 'none';
  }
  const srch = !!(EV && EV.phase === 'search');
  document.body.classList.toggle('evs', srch);
  const near = srch && !paused ? evNearVillager(2) : null;
  $('talkBtn').style.display = near ? 'flex' : 'none';
  // 말풍선: 말하는 사람 머리 위 (안 보이면 화면 아래쪽)
  const tb = $('talkBox');
  if (evTalk) {
    evTalk.t -= dt;
    if (evTalk.t <= 0 || !villagers.includes(evTalk.v) || MODE !== 'world' || paused || dist2(S.player.x, S.player.y, evTalk.v.x, evTalk.v.y) > (T * 5) ** 2) { evTalk = null; tb.classList.remove('show'); }
    else if (USE3D) {
      const pr = R3D.project(evTalk.v.x / T, 1.6 * (EVCAM.k > 0.5 ? W3_TP.hk : 1) + 0.1, evTalk.v.y / T, {});
      if (pr.vis && pr.x > 0 && pr.x < VW && pr.y > 90 && pr.y < VH) { tb.style.left = clamp(pr.x, 130, VW - 130) + 'px'; tb.style.top = pr.y + 'px'; tb.classList.remove('low'); }
      else { tb.style.left = '50%'; tb.style.top = ''; tb.classList.add('low'); }
    } else { tb.style.left = '50%'; tb.style.top = ''; tb.classList.add('low'); }
  }
}

// ---------- 2D 화면 (?2d): 잃어버린 사람 그리기 ----------
function evDraw2D(g) {
  if (!EV || EV.phase !== 'search') return;
  const w = EV.who, L = w.look;
  g.globalAlpha = 0.25 + 0.1 * Math.sin(S.time * 2.2); g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(w.x, w.y - 6, 16, 0, 7); g.fill(); g.globalAlpha = 1;
  drawHuman(g, w.x, w.y, { scale: w.child ? 0.55 : 0.72, face: 1, walk: 0, body: L.body, legs: L.legs, hat: L.hat, helm: L.helm });
}
