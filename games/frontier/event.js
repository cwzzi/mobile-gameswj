'use strict';
// ===== event.js: 특별 사건 — '장면 속으로' 들어가 직접 겪는 이벤트 =====
// 사건 세 가지 (모두 같은 틀: 묻기(네/아니오) → 어깨 뒤 낮은 시점(3인칭) → 목표 상자 · 마을 사람 단서 · 돌아가기 → 보상 → 위에서 내려다보는 시점)
//   findPerson 사람 찾기: 마을 아이/노인이 사라졌다 — 마을 사람에게 묻고 숲 가장자리에서 찾는다 (아니오 = 경비병을 보낸다)
//   treasure   보물찾기: 떠돌이가 두고 간 옛 지도에 X 표시가 셋 — 마을 사람·은둔자의 말로 가짜를 거르고 「파기」
//   thief      도둑 추격: 장터 도둑이 물건을 훔쳐 달아났다 — 직접 뛰어가 붙잡는다 (지치면 헉헉, 덤불에 숨기도 한다)
// 📜 소식 버튼(오른쪽): 지금 들어와 있는 의뢰 목록 → 골라서 들어간다. 새 소식은 새 게임/불러오기 뒤 60~90초에 처음, 그 뒤 120~200초마다
//   (그때 다른 창이 열려 있지 않으면 바로 묻는다. 아니면 소식판에 쌓아 둔다 — 최대 3개)
//   3인칭 동안: 조이스틱 = 카메라 기준 이동, 화면 오른쪽 끌기 = 시선 돌리기(Q/E 키도), 마을 사람 톡/「말 걸기」 = 대화
// 저장하지 않는다 (S 밖 전역 EV · EVQ) → 저장 형식 그대로. 새로고침하면 사건은 사라지고 타이머가 다시 돈다
// 테스트: __game.startEvent('findPerson' | 'treasure' | 'thief'), __game.ev, __game.evq, __game.evBoard()
let EV = null;
const EVCAM = { k: 0, yaw: 0 }; // 3인칭 섞임(0~1)과 바라보는 방향 (world3d.js w3dTPCam)
let evT = 0, evNext = 75, evS = null, evClock = 0, evLastGen = -99, evKindLast = null;
const EVQ = []; let evQid = 0; // 소식판 (의뢰 목록)
const EV_KIND_ORDER = ['treasure', 'findPerson', 'thief'];
function evBusy() { return !!EV; }
// 자유 탐험(🚶): 사건이 없어도 영주 등 뒤 시점으로 땅 전체를 걷거나 말 타고 돌아다니며 주민과 이야기한다 (다시 누르면 내려다보는 시점)
let FREE = false;
function evTP() { return !!(EV && EV.tp) || FREE; }
function freeSet(on) {
  on = !!on && USE3D && MODE === 'world' && !(EV && EV.tp);
  if (on === FREE) return;
  FREE = on; auto = null; actHeld = false;
  if (on) {
    EVCAM.yaw = 0;
    if (S.armyMode !== 'guard') { FREE_ARMY = S.armyMode; S.armyMode = 'guard'; for (const s of soldiers) s.post = null; } // 따라오던 병사는 마을에 (시야를 가리지 않게)
    banner('🚶 자유 탐험', '왼쪽 끌기 이동 · 오른쪽 끌기 시선 · 주민을 톡 하면 대화', 2.4);
  } else if (FREE_ARMY) { S.armyMode = FREE_ARMY; FREE_ARMY = null; for (const s of soldiers) s.post = null; }
  $('freeBtn').classList.toggle('on', FREE);
  document.body.classList.toggle('free', FREE);
}
let FREE_ARMY = null;
function evTPSpeed() { return EV && EV.kind === 'thief' && EV.phase === 'search' ? 124 : 85; } // 도둑 추격은 뛰어서
function evEra() { return clamp(S.era | 0, 0, ERAS.length - 1); }

// ---------- 말 (시대: 0 부족 · 1 고대 · 2 중세 · 3 근세 · 4 근대) ----------
const EV_KIDS = ['순이', '돌이', '복동이', '꽃님이', '막동이', '달래', '분이', '똘이'];
const EV_ELDERS = ['김 노인', '박 할머니', '최 영감', '이 할멈', '한 노인', '윤 할머니'];
const EV_NAMES = ['갑돌', '을순', '삼월', '덕배', '옥분', '만석', '두리', '말순', '칠복', '봉구', '금순', '오목', '개똥', '향단', '마당쇠', '들레'];
// 역할 이름 (시대별)
const VROLE = {
  farm: ['밭일꾼', '농부', '농부', '농부', '농부'], chores: ['아낙', '아낙', '아낙', '주민', '주부'], trade: ['물물교환꾼', '상인', '상인', '상인', '상회 주인'],
  study: ['주술사 제자', '서생', '수도사', '학자', '신식 학교 교사'], smith: ['돌칼 장인', '청동 대장장이', '대장장이', '대장장이', '공장 기계공'], fletch: ['사냥꾼', '활 장인', '활 장인', '화약 장인', '총포 장인'],
  groom: ['말 길들이는 이', '마부', '마부', '마부', '기병대 마부'], water: ['물 긷는 아이', '물 긷는 아낙', '물 긷는 아낙', '물장수', '수돗가 아낙'],
  lumber: ['나무꾼', '나무꾼', '나무꾼', '벌목꾼', '제재소 일꾼'], quarry: ['돌 줍는 이', '석공', '석공', '석공', '채석장 인부'], mine: ['금 캐는 이', '광부', '광부', '광부', '탄광 광부'],
  idle: ['부족민', '백성', '농민', '시민', '시민'],
};
// 역할별 평소 말
const VLINES = {
  farm: [['조 이삭이 여물었어요. 올겨울은 배곯지 않겠네요.', '돌괭이가 또 부러졌지 뭐예요.'], ['청동 낫 덕분에 추수가 빨라졌어요!', '올해는 비가 알맞게 와서 보리가 잘 됐습니다.'],
    ['영주님 밭부터 갈고 우리 밭을 갈아야 해서… 아이고 허리야.', '삼포식으로 돌려 짓으니 땅이 덜 지치네요.'], ['새로 들어온 감자란 작물, 척박한 땅에서도 잘 자라요!', '농사 개량 책자를 읽어 봤는데 글씨가 너무 작아요.'], ['기계로 탈곡하니 일손이 반으로 줄었어요!', '화학 비료란 걸 뿌렸더니 이삭이 두 배예요.']],
  chores: [['가죽을 무두질하는 중이에요. 냄새는 좀 참아 주세요.', '모닥불 꺼뜨리면 큰일 나요!'], ['베틀로 삼베를 짜고 있어요.', '토기에 장을 담갔어요. 맛 좀 보실래요?'],
    ['빵 굽는 날이라 화덕 앞이 덥네요.', '양털로 실을 잣는 중이에요.'], ['유리창 덕분에 집 안이 환해졌어요.', '시계탑 종소리에 맞춰 밥을 짓는답니다.'], ['재봉틀 소리 들리세요? 옷 한 벌이 금방이에요.', '석유 등잔 덕에 밤에도 바느질을 해요.']],
  trade: [['조개껍데기 세 개면 이 흑요석을 드리지요.', '저 너머 부족이 소금을 가져왔대요.'], ['동전이 생기니 장사가 훨씬 편해요!', '비단길 건너온 향신료, 한번 보세요.'],
    ['장날이라 사람이 바글바글해요.', '길드 허가 없이는 여기서 못 팝니다요.'], ['배가 들어오면 후추 값이 떨어질 거예요.', '어음 한 장이면 먼 도시와도 거래하지요.'], ['기차로 들어온 물건이라 값이 싸졌어요!', '전보 한 통이면 먼 도시 시세를 바로 알지요.']],
  study: [['별자리를 보면 사냥 날을 알 수 있대요.', '동굴 벽에 오늘 사냥을 그려 두었어요.'], ['죽간에 왕의 업적을 새기고 있습니다.', '숫자를 셈하는 법을 배우는 중이에요.'],
    ['필사본 한 권 베끼는 데 한 해가 걸립니다.', '라틴어… 아니 옛 글은 어렵군요.'], ['인쇄기 덕분에 책이 싸졌습니다!', '망원경으로 달의 산을 봤어요!'], ['아이들에게 신식 산수와 지리를 가르쳐요.', '증기기관 원리를 칠판에 그려 보았지요.']],
  smith: [['흑요석을 떼어 창날을 만들어요.', '돌칼은 날이 금방 무뎌져요.'], ['구리에 주석을 섞으면 더 단단해지지요.', '청동 칼 한 자루 녹이는 데 하루가 꼬박이에요.'],
    ['철은 뜨거울 때 두드려야 합니다! 땅, 땅!', '기사님들 갑옷 수선이 밀려 있어요.'], ['총열을 곧게 뽑는 게 제일 어렵습니다.', '용광로 불이 꺼지면 안 돼요!'], ['증기 망치가 하루에 백 사람 몫을 해요!', '강철 레일을 뽑느라 용광로가 쉴 틈이 없어요.']],
  fletch: [['짐승 힘줄로 활시위를 매요.', '오늘은 사슴 두 마리를 잡았어요!'], ['좋은 화살깃은 독수리 깃이 최고지요.', '활은 매일 당겨 봐야 해요.'],
    ['석궁 시위를 감는 데 한참 걸려요.', '주목나무 활이 제일 멀리 나가요.'], ['화약은 불 근처에 두면 안 돼요! 절대!', '머스킷 한 발 쏘고 장전하는 데 한참이에요.'], ['후장식 소총은 엎드려서도 장전할 수 있어요.', '탄피는 꼭 주워 오라고 일러 두세요!']],
  groom: [['야생마를 길들이는 중이에요. 조심하세요!', '말 등에 올라탄 건 우리 부족이 처음일걸요?'], ['전차 끄는 말은 잘 먹여야 해요.', '말발굽이 닳아서 걱정이에요.'],
    ['쇠 편자를 박으니 말이 덜 다쳐요.', '기사님 말은 성질이 사나워요.'], ['역마차가 다니니 소식이 빨라졌어요.', '기병대 말은 특별히 크답니다.'], ['기병대 말은 대포 소리에도 놀라지 않게 길들여요.', '기차가 생기니 역마차 손님이 줄었네요.']],
  water: [['샘물이 맑아서 좋아요.', '물동이가 무거워요… 영차.'], ['우물 덕분에 강까지 안 가도 돼요.', '두레박 줄이 닳았네요.'],
    ['우물가는 소문이 제일 빨리 도는 곳이죠.', '물 한 바가지 드릴까요?'], ['물 한 통에 동전 한 닢이요!', '수도관이 생긴다는 소문이 있던데요.'], ['수도꼭지만 틀면 물이 나온대요. 신기하죠?', '우물물보다 수돗물이 맑아요.']],
  lumber: [['돌도끼로 나무 베기 힘들어요.'], ['청동 도끼는 잘 들어요!'], ['이 참나무는 성 지을 때 쓴대요.'], ['톱질 한 번에 반 토막이지요!'], ['증기 톱이 순식간에 통나무를 켜요!']],
  quarry: [['큰 돌을 굴려 옮겨요.'], ['돌을 반듯하게 다듬는 중이에요.'], ['성벽 돌은 이렇게 쪼개요.'], ['화약으로 바위를 깨면 금방이에요.'], ['다이너마이트 조심! 귀 막으세요!']],
  mine: [['반짝이는 돌을 찾았어요!'], ['금맥이 굵어요!'], ['갱도 버팀목을 잘 세워야 해요.'], ['양수기 덕분에 갱도가 덜 잠겨요.'], ['석탄이 있어야 공장도 기차도 돌아가지요.']],
  idle: [['오늘 사냥은 잘 됐나요?', '저 산 너머엔 무엇이 있을까요?'], ['세금이 조금만 줄면 좋겠어요…', '성벽이 높아서 든든해요.'],
    ['도적떼 소문 때문에 밤길이 무서워요.', '성당 종소리가 참 좋지요?'], ['신문 보셨어요? 바다 건너 소식이 가득해요.', '도시가 날마다 커지네요!'], ['기차 타 보셨어요? 바람처럼 달려요!', '가로등이 켜지니 밤거리가 대낮 같아요.']],
};
const EV_HAIL = ['족장님', '전하', '폐하', '황제 폐하', '대군주 폐하'];
// 보물찾기 · 도둑 추격 (시대별)
const EV_TR = {
  traveler: ['떠돌이 사냥꾼', '대상 행렬의 낙타꾼', '떠돌이 음유시인', '배에서 내린 늙은 선원', '기차에서 내린 외국인 측량기사'],
  map: ['짐승 가죽에 그린 그림 지도', '구운 점토판 지도', '낡은 양피지 보물 지도', '바닷물에 얼룩진 해도', '등고선이 그려진 측량 지도'],
  treasure: ['옛 대족장의 흑요석 보물', '옛 왕의 청동 보물', '몰락한 기사단의 금고', '해적이 묻은 금화 상자', '파산한 철도 재벌의 비밀 금고'],
  relic: ['흑요석 의식용 칼', '청동 거울과 옥 목걸이', '보석 박힌 성배', '황금 회중시계와 금화', '금괴와 채권 다발'],
  hermit: ['늙은 주술사', '은둔 현자', '숲속 은수자', '외딴 오두막 노인', '은퇴한 철도 기관사'],
  junk: ['깨진 토기 조각', '녹슨 청동 화살촉', '부러진 쟁기 날', '빈 럼주 병', '녹슨 레일 못'],
};
const EV_TH = {
  market: ['물물교환 터', '장터', '장날 장터', '시장', '기차역 앞 시장'],
  who: ['이웃 부족 좀도둑', '소매치기', '소매치기', '소매치기', '신문팔이로 꾸민 소매치기'],
  item: ['말린 고기 꾸러미', '청동 거울', '은화 주머니', '금화 주머니', '은 회중시계'],
  caught: ['"으악! 놔줘요! 배가 고파서 그랬어요…"', '"아이고, 왕의 손에 잡히다니…"', '"자, 잘못했습니다! 영주님께서 직접 쫓아오실 줄이야!"', '"황제께서 이렇게 빠르실 줄은… 항복합니다!"', '"대군주 폐하께서 몸소 뛰어오시다니… 순사보다 빠르십니다!"'],
};
function evRole(v) {
  if (v.job) return v.job.type in VROLE ? v.job.type : 'idle';
  return v.act || v.task || 'idle';
}
// 8방위 (게임 좌표 y가 남쪽)
function evDir(dx, dy) { return ['동', '남동', '남', '남서', '서', '북서', '북', '북동'][(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8]; }
function evPlace(tx, ty) {
  let w = 0, m = 0;
  for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) { const t = tileAt(x, y); if (t === WATER) w++; else if (t === MOUNTAIN || t === GOLD) m++; }
  if (tileAt(tx, ty) === FOREST || [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => tileAt(tx + a, ty + b) === FOREST).length >= 2) return w > 3 ? '물가 숲' : m > 3 ? '산기슭 숲' : '숲';
  return w > 3 ? '물가' : m > 3 ? '산기슭' : '들판';
}

// ---------- 자리 고르기 ----------
// 마을에서 걸어서 갈 수 있는 땅(물·산 너머 제외)을 넓이 우선으로 훑어 cb(x, y, d, i) 를 부른다
function evScan(t, maxD, cb) {
  const sx = t.x, sy = t.y, seen = new Uint8Array(W * H), q = [sy * W + sx];
  seen[sy * W + sx] = 1;
  const ok = i => { const tt = S.tiles[i]; return tt !== WATER && tt !== MOUNTAIN && tt !== GOLD; };
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0, d = Math.hypot(x - sx, y - sy);
    cb(x, y, d, i);
    if (d > maxD) continue;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + a, ny = y + b; if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      const j = ny * W + nx; if (seen[j] || !ok(j)) continue; seen[j] = 1; q.push(j);
    }
  }
}
const evForestN = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => tileAt(x + a, y + b) === FOREST).length;
const evFree = (x, y) => !S.buildings.some(b => b.x === x && b.y === y) && !S.towns.some(t => Math.abs(t.x - x) <= 1 && Math.abs(t.y - y) <= 1) && !S.camps.some(c => Math.abs(c.x - x) + Math.abs(c.y - y) < 7);
// 사람 찾기: 9~18칸 떨어진 숲 가장자리(없으면 아무 땅)
function evPickSpot(t) {
  const forest = [], land = [];
  evScan(t, 19, (x, y, d, i) => {
    if (d >= 9 && d <= 18 && neighborsLand(x, y) && evFree(x, y)) { if (S.tiles[i] !== FOREST && evForestN(x, y) >= 2) forest.push(i); else land.push(i); }
  });
  const pool = forest.length ? forest : land;
  return pool.length ? pool[ri(pool.length)] : -1;
}
// 보물 표시 셋: 7~17칸, 숲이 아닌 땅, 서로 4칸 넘게 떨어지게. 은둔자: 4~8칸 숲 가장자리
function evPickTreasure(t) {
  const cand = [], hc = [];
  evScan(t, 18, (x, y, d, i) => {
    if (!neighborsLand(x, y) || !evFree(x, y)) return;
    if (d >= 7 && d <= 17 && S.tiles[i] !== FOREST) cand.push([x, y]);
    if (d >= 4 && d <= 8 && S.tiles[i] !== FOREST) hc.push([x, y, evForestN(x, y)]);
  });
  const spots = [];
  for (let k = 0; k < 200 && spots.length < 3 && cand.length; k++) {
    const c = cand[ri(cand.length)];
    if (spots.every(s => Math.hypot(s[0] - c[0], s[1] - c[1]) >= 4.5)) spots.push(c);
  }
  if (spots.length < 3) return null;
  hc.sort((a, b) => b[2] - a[2]);
  const h = hc.length ? hc[ri(Math.min(hc.length, 6))] : null;
  return { spots, hermit: h };
}
// 도둑 숨을 곳: 10~16칸 숲 가장자리(숲 칸도 됨) 둘, 서로 5칸 넘게
function evPickHides(t) {
  const f = [], l = [];
  evScan(t, 17, (x, y, d, i) => {
    if (d < 10 || d > 16 || !neighborsLand(x, y) || !evFree(x, y)) return;
    if (S.tiles[i] === FOREST || evForestN(x, y) >= 2) f.push([x, y]); else l.push([x, y]);
  });
  const pool = f.length >= 2 ? f : f.concat(l), out = [];
  for (let k = 0; k < 120 && out.length < 2 && pool.length; k++) { const c = pool[ri(pool.length)]; if (out.every(s => Math.hypot(s[0] - c[0], s[1] - c[1]) >= 5)) out.push(c); }
  return out.length ? out : null;
}

// ---------- 소식판 (의뢰 목록) ----------
function evNearestTown() { const p = S.player; return S.towns.slice().sort((a, b) => dist2(a.x, a.y, p.x / T, p.y / T) - dist2(b.x, b.y, p.x / T, p.y / T))[0]; }
function evOffer(kind) {
  if (!S || !S.towns.length) return null;
  if (!kind) { const ks = EV_KIND_ORDER.filter(k => k !== evKindLast && !EVQ.some(o => o.kind === k)); kind = ks.length ? ks[ri(ks.length)] : EV_KIND_ORDER[ri(3)]; }
  const t = S.towns[ri(S.towns.length)], e = evEra();
  const o = { id: ++evQid, kind, town: t.id, age: 0, e };
  if (kind === 'findPerson') { o.child = rand() < 0.6; o.name = o.child ? EV_KIDS[ri(EV_KIDS.length)] : EV_ELDERS[ri(EV_ELDERS.length)]; }
  evKindLast = kind; evLastGen = evClock;
  EVQ.push(o); while (EVQ.length > 3) EVQ.shift();
  evBadge();
  return o;
}
function evOfferInfo(o) {
  const t = townById(o.town), tn = t ? t.name : '마을', e = evEra();
  if (o.kind === 'findPerson') return { ic: '🔎', title: `${o.child ? '아이' : '노인'} ${josa(o.name, '이가')} 사라졌다`, desc: `${tn} · 숲 가장자리까지 찾아 나서기 · 보상 큼` };
  if (o.kind === 'treasure') return { ic: '🗺️', title: `${josa(EV_TR.treasure[e], '을를')} 찾아라`, desc: `${tn} 근처 · 지도의 X 표시 셋 중 진짜를 파기` };
  return { ic: '🏃', title: `${EV_TH.market[e]} 도둑을 잡아라`, desc: `${tn} · ${josa(EV_TH.item[e], '을를')} 훔쳐 달아난 ${EV_TH.who[e]} 추격` };
}
function evBadge() {
  const b = $('evBoardBtn'); if (!b) return;
  const n = EVQ.length;
  b.dataset.n = n ? String(n) : ''; b.classList.toggle('new', n > 0);
}
function evBoard() {
  if (!S || MODE !== 'world') return;
  // 빈 소식판을 열면 (25초에 한 번까지) 새 의뢰가 바로 들어온다
  if (!EVQ.length && !EV && S.towns.length && evClock - evLastGen > 25) evOffer();
  paused = true; actHeld = false; auto = null;
  const e = evEra();
  let h = `<h2>📜 소식 · 의뢰</h2><div class="sub">${EV_HAIL[e]}께 들어온 부탁입니다. 골라서 직접 나서 보세요.</div>`;
  if (EV) h += `<div class="lockbox">지금 하는 일: <b>${evNowText()}</b></div>`;
  if (!S.towns.length) h += `<div class="lockbox">마을을 세우면 마을 사람들의 소식이 들어옵니다.</div>`;
  for (const o of EVQ) {
    const I = evOfferInfo(o);
    h += `<button class="opt${EV || S.war ? '' : ' evq'}" data-a="pick" data-id="${o.id}" ${EV || S.war ? 'disabled' : ''}><span class="ic">${I.ic}</span><span>${I.title}<small>${I.desc}</small></span></button>`;
  }
  if (S.towns.length && !EVQ.length) h += `<div class="lockbox">지금은 새 소식이 없습니다. 약 ${Math.max(5, Math.round(evNext - evT))}초 뒤에 새 소식이 들어와요.</div>`;
  if (S.war) h += `<div class="lockbox">⚔️ 전쟁 중에는 의뢰를 맡을 수 없습니다.</div>`;
  h += `<button class="close" data-a="close">닫기</button>`;
  $('evPanel').innerHTML = h; $('evPanel').classList.add('show');
}
function evNowText() {
  if (!EV) return '';
  if (EV.phase === 'guards') return `🛡️ 경비병이 ${josa(evWhoLabel(), '을를')} 찾는 중`;
  const I = evOfferInfo(EV.offer); return I.ic + ' ' + I.title;
}

// ---------- 시작 ----------
// startEvent(kind 또는 소식판 항목) → 묻기 창. 테스트에서 kind 문자열로 부르면 그 자리에서 의뢰를 만든다
function startEvent(arg) {
  if (EV || MODE !== 'world' || !S || !S.towns.length || S.war) return false;
  let o = typeof arg === 'object' && arg ? arg : null;
  if (!o) { o = evOffer(arg || 'findPerson'); if (!o) return false; }
  const i = EVQ.indexOf(o); if (i >= 0) EVQ.splice(i, 1);
  evBadge();
  const ok = o.kind === 'treasure' ? evSetupTreasure(o) : o.kind === 'thief' ? evSetupThief(o) : evSetupFind(o);
  if (!ok) return false;
  evAsk();
  return true;
}
function evBase(o, t) { return { kind: o.kind, offer: o, S, phase: 'ask', tp: false, town: t.id, t: 0, asked: 0, hint: '', reporter: EV_NAMES[ri(EV_NAMES.length)] }; }
function evTownFor(o) { const t = townById(o.town); return t || evNearestTown(); }
function evSetupFind(o) {
  const towns = [evTownFor(o), ...S.towns];
  let t = null, spot = -1;
  for (const tt of towns) { if (!tt) continue; spot = evPickSpot(tt); if (spot >= 0) { t = tt; break; } }
  if (!t) return false;
  const child = o.child !== undefined ? o.child : rand() < 0.6, vl = eraVillager(), e = evEra();
  const name = o.name || (child ? EV_KIDS[ri(EV_KIDS.length)] : EV_ELDERS[ri(EV_ELDERS.length)]);
  const look = child ? { body: vl.body, legs: vl.legs || '#4a3a2a', hat: null, helm: '#e8d8b0', hair: '#3a2414', scale: 1.1 * 0.72, lod: 1, role: 'villager' }
    : { body: '#8a8478', legs: '#4a4038', hat: e ? 'band' : null, helm: '#d8d0c0', hair: '#d8d8d0', scale: 1.1 * 0.95, lod: 1, role: 'villager' };
  const sx = spot % W, sy = (spot / W) | 0;
  EV = Object.assign(evBase(o, t), { who: { child, name, x: (sx + .5) * T, y: (sy + .5) * T, tx: sx, ty: sy, look, yaw: rand() * 6.28, place: evPlace(sx, sy) } });
  return true;
}
function evSetupTreasure(o) {
  const t = evTownFor(o); if (!t) return false;
  const P = evPickTreasure(t); if (!P) return false;
  const real = ri(3), e = evEra();
  const marks = P.spots.map(([x, y], k) => ({ x: (x + .5) * T, y: (y + .5) * T, tx: x, ty: y, real: k === real, st: 'x', place: evPlace(x, y) }));
  let npc = null;
  if (P.hermit) npc = { x: (P.hermit[0] + .5) * T, y: (P.hermit[1] + .5) * T, name: EV_TR.hermit[e], hermit: true, yaw: rand() * 6.28, walk: 0,
    look: { body: e === 0 ? '#6a5038' : '#5a5a50', legs: '#3a3228', hat: e ? null : 'band', helm: '#d8d0c0', hair: '#e0e0d8', scale: 1.1 * 0.95, lod: 1, role: 'villager' } };
  EV = Object.assign(evBase(o, t), { marks, npc, dug: 0, dig: null, ruled: [] });
  return true;
}
function evSetupThief(o) {
  const t = evTownFor(o); if (!t) return false;
  const hides = evPickHides(t); if (!hides) return false;
  const e = evEra();
  EV = Object.assign(evBase(o, t), { hides: hides.map(([x, y]) => ({ x: (x + .5) * T, y: (y + .5) * T, place: evPlace(x, y) })), hideI: 0, limit: 80,
    thief: { x: 0, y: 0, walk: 0, st: 'run', stam: 2.5, hid: 0, swerve: 0, swT: 0, look: { body: e >= 2 ? '#3a3236' : '#4a3a2c', legs: '#2a2422', hat: 'hood', helm: '#2a2220', scale: 1.1 * 0.95, lod: 1, role: 'villager' } } });
  return true;
}
function evWhoLabel() { const w = EV && EV.who; return !w ? '' : w.child ? `아이 ${w.name}` : w.name; }
function evAsk() {
  paused = true; actHeld = false; auto = null;
  const t = townById(EV.town), tn = t ? t.name : '마을', e = evEra(), H = EV_HAIL[e];
  const where = USE3D ? '마을 속으로 들어가 직접 걸으며' : '직접';
  let h;
  if (EV.kind === 'findPerson') {
    const w = EV.who;
    const what = w.child ? `${josa(w.name, '이가')} 아침에 ${['열매를 따러', '양 떼를 따라', '나물을 캐러', '놀러', '기차 구경하러'][e]} 나가서는 해가 기울도록 돌아오지 않았어요!` : `${w.name}께서 약초를 캐러 나가셨다가 아직 안 돌아오셨어요!`;
    h = `<h2>🔎 ${w.child ? '아이가' : '노인이'} 사라졌다!</h2>
    <div class="sub"><b>${tn}</b>의 ${josa(EV.reporter, '이가')} 헐레벌떡 달려왔습니다.</div>
    <div class="evquote">"${H}, ${what}"</div>
    <div class="evq-ask">직접 찾으러 가시겠습니까?</div>
    <button class="opt primary" data-a="go"><span class="ic">🚶</span><span>네<small>${where} 마을 사람들에게 묻고 찾아 나섭니다 · 보상이 큽니다</small></span></button>
    <button class="opt" data-a="guard"><span class="ic">🛡️</span><span>아니오<small>경비병을 보냅니다 · 잠시 뒤 결과가 오고, 보상이 적거나 못 찾을 수도 있어요</small></span></button>`;
  } else if (EV.kind === 'treasure') {
    h = `<h2>🗺️ 옛 보물 지도</h2>
    <div class="sub"><b>${tn}</b>에 묵어 간 ${josa(EV_TR.traveler[e], '이가')} ${josa(EV_TR.map[e], '을를')} 두고 갔습니다.</div>
    <div class="evquote">"${H}, 이 지도에 ${tn} 근처 X 표시가 세 군데 있습니다. ${josa(EV_TR.treasure[e], '이가')} 묻혀 있다는데… 진짜는 하나뿐이랍니다."</div>
    <div class="evq-ask">직접 보물을 찾으러 가시겠습니까?</div>
    <button class="opt primary" data-a="go"><span class="ic">⛏️</span><span>네<small>${where} 표시를 찾아가 「파기」 · 마을 사람과 ${EV_TR.hermit[e]}에게 물어 가짜를 거르세요</small></span></button>
    <button class="opt" data-a="later"><span class="ic">📜</span><span>아니오<small>나중에 · 📜 소식판에 남겨 둡니다</small></span></button>`;
  } else {
    h = `<h2>🏃 도둑이야!</h2>
    <div class="sub"><b>${tn}</b> ${EV_TH.market[e]}에서 ${josa(EV.reporter, '이가')} 소리칩니다.</div>
    <div class="evquote">"${H}! ${josa(EV_TH.who[e], '이가')} 제 ${josa(EV_TH.item[e], '을를')} 훔쳐 달아났어요! 저쪽 ${EV.hides[0].place} 쪽으로요!"</div>
    <div class="evq-ask">직접 쫓아가시겠습니까?</div>
    <button class="opt primary" data-a="go"><span class="ic">🏃</span><span>네<small>${tn}에서 바로 뛰어나가 붙잡습니다 · 도둑은 지치면 헉헉대고, 덤불에 숨기도 해요</small></span></button>
    <button class="opt" data-a="later"><span class="ic">📜</span><span>아니오<small>나중에 · 📜 소식판에 남겨 둡니다 (그사이 도둑은 숨어 있어요)</small></span></button>`;
  }
  $('evPanel').innerHTML = h; $('evPanel').classList.add('show');
}
function evEnterTP() {
  if (!EV) return;
  freeSet(false);
  dismount(); auto = null; actHeld = false;
  EV.phase = 'search'; EV.tp = USE3D; EV.t = 0;
  // 따라오던 병사들은 마을에 남는다 (3인칭 화면을 가리지 않게) → 끝나면 원래대로
  if (EV.tp && S.armyMode !== 'guard') { EV.army = S.armyMode; S.armyMode = 'guard'; for (const s of soldiers) s.post = null; }
  EVCAM.yaw = 0; // 지금 화면(북쪽을 위로)과 같은 방향으로 내려앉는다
  if (EV.kind === 'thief') evThiefStart();
  if (EV.kind === 'findPerson') banner('🔎 ' + evWhoLabel() + ' 찾기', '마을 사람들에게 물어보세요', 2.5);
  else if (EV.kind === 'treasure') banner('🗺️ 보물찾기', 'X 표시 셋 중 진짜를 찾아 파세요', 2.5);
  else banner('🏃 도둑을 잡아라!', '가까이 따라붙으면 붙잡습니다', 2.2);
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
function evShelve() { // 나중에: 소식판으로 되돌림
  if (!EV) return;
  const o = EV.offer; evExitTP(); EV.phase = 'end';
  if (o && !EVQ.includes(o)) { EVQ.unshift(o); while (EVQ.length > 3) EVQ.pop(); }
  evBadge();
}
$('evPanel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.a;
  $('evPanel').classList.remove('show'); paused = false;
  if (a === 'pick') { const o = EVQ.find(q => q.id === +b.dataset.id); if (o && !startEvent(o)) { toast('지금은 이 의뢰를 맡을 수 없어요', 2); EVQ.splice(EVQ.indexOf(o), 1); evBadge(); } return; }
  if (a === 'close' || !EV) return;
  if (a === 'go') evEnterTP();
  else if (a === 'guard') evGuards();
  else if (a === 'later') { evShelve(); EV = null; toast('📜 소식판에 남겨 두었습니다 · 오른쪽 📜 버튼', 2.5); }
  else if (a === 'done') { evExitTP(); EV.phase = 'end'; }
});
$('evExit').addEventListener('click', () => {
  if (!EV || EV.phase !== 'search') return;
  if (EV.kind === 'findPerson') evGuards(); // 돌아가면 경비병에게 맡긴다
  else if (EV.kind === 'treasure') { evShelve(); toast('🗺️ 지도는 📜 소식판에 남겨 두었습니다', 2.5); }
  else { evExitTP(); EV.phase = 'end'; toast(`🏃 ${josa(EV_TH.who[evEra()], '이가')} 달아났습니다…`, 2.5); }
});
$('evBoardBtn').addEventListener('click', () => { if (MODE === 'world' && !paused) evBoard(); });

// ---------- 매 프레임 (updateWorld 뒤, 멈춤 아닐 때) ----------
function evUpdate(dt) {
  if (evS !== S) { evS = S; if (FREE) freeSet(false); EV = null; EVCAM.k = 0; EVQ.length = 0; evT = 0; evNext = rr(60, 90); evBadge(); } // 새 게임 · 불러오기
  evClock += dt;
  if (EV && EV.army && !EV.tp) evExitTP();
  if (!EV) {
    if (!S.towns.length || S.war || MODE !== 'world') return;
    evT += dt;
    if (evT > evNext) {
      evT = 0; evNext = rr(120, 200);
      const o = evOffer();
      // 다른 창이 없으면 바로 묻는다. 있으면 소식판에만
      if (o && !document.querySelector('.panel.show') && !paused) startEvent(o);
      else if (o) toast(`📜 새 소식: ${evOfferInfo(o).title}<br><small>오른쪽 📜 버튼</small>`, 3.5);
    }
    return;
  }
  const p = S.player;
  if (EV.phase === 'search') {
    EV.t += dt;
    if (EV.kind === 'findPerson') { const w = EV.who; if (dist2(p.x, p.y, w.x, w.y) < (T * 1.3) ** 2) evFound(); }
    else if (EV.kind === 'treasure') evTreasureTick(dt);
    else evThiefTick(dt);
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
function evResult(title, quote, sub, stats, btn) {
  paused = true; actHeld = false; auto = null;
  $('evPanel').innerHTML = `<h2>${title}</h2>${quote ? `<div class="evquote">${quote}</div>` : ''}
    ${sub ? `<div class="sub" style="text-align:center">${sub}</div>` : ''}
    ${stats ? `<div class="stats">${stats}</div>` : ''}
    <button class="opt primary" data-a="done" style="justify-content:center"><span>${btn || '🏰 마을로 돌아가기'}</span></button>`;
  $('evPanel').classList.add('show');
}
function evFound() {
  const e = evEra(), t = townById(EV.town), w = EV.who;
  const gold = 40 + 25 * e, exp = 30;
  EV.phase = 'found';
  S.gold += gold; gainExp(exp); if (t) t.pop += 2;
  const said = w.child ? `"${EV_HAIL[e]}! 무서웠어요… 길을 잃어서 계속 울었어요."` : `"아이고, ${EV_HAIL[e]}께서 몸소 오시다니… 발목을 삐어 꼼짝 못 하고 있었습니다."`;
  evResult(`🎉 ${josa(evWhoLabel(), '을를')} 찾았다!`, said,
    `${t ? `<b>${t.name}</b> 사람들이 ${EV_HAIL[e]}의 이름을 칭송합니다.` : ''}${EV.asked ? `<br><small>물어본 사람 ${EV.asked}명</small>` : ''}`,
    `<span>🪙 감사의 선물</span><b>+${gold}</b><span>⭐ 경험치</span><b>+${exp}</b><span>👥 ${t ? t.name : '마을'}에 이주민</span><b>+2</b>`, '🏰 함께 마을로 돌아가기');
  save();
}

// ---------- 보물찾기 ----------
function evNearMark(maxTiles) {
  if (!EV || EV.kind !== 'treasure') return null;
  const p = S.player; let best = null, bd = (maxTiles * T) ** 2;
  for (const m of EV.marks) { if (m.st !== 'x') continue; const d = dist2(p.x, p.y, m.x, m.y); if (d < bd) { bd = d; best = m; } }
  return best;
}
function evDig() {
  if (!EV || EV.phase !== 'search' || EV.kind !== 'treasure' || EV.dig) return;
  const m = evNearMark(1.4); if (!m) return;
  EV.dig = { m, t: 1.5 }; actHeld = false;
}
function evTreasureTick(dt) {
  const d = EV.dig; if (!d) return;
  const p = S.player;
  if (dist2(p.x, p.y, d.m.x, d.m.y) > (T * 1.8) ** 2) { EV.dig = null; return; } // 자리를 뜨면 그만
  d.t -= dt;
  if (rand() < dt * 14) emit(d.m.x + rr(-8, 8), d.m.y + rr(-4, 6), 3, { color: ['#7a5a3a', '#5a4028', '#9a7a52'], smin: 40, smax: 110, up: 90, grav: 320, lmin: .3, lmax: .6, zmin: 2, zmax: 3.5 });
  if (d.t > 0) return;
  EV.dig = null; EV.dug++;
  const e = evEra(), m = d.m;
  if (!m.real) {
    m.st = 'dug'; S.gold += 3;
    toast(`⛏️ 빈 구덩이… ${EV_TR.junk[e]}뿐입니다 (🪙+3)<br><small>가짜였어요. 다른 표시를 찾아보세요</small>`, 3.2);
    return;
  }
  m.st = 'chest';
  const gold = 70 + 40 * e, rp = 30 + 20 * e, exp = 40;
  S.gold += gold; gainExp(exp);
  if (S.research && TECH[S.research.id]) S.research.p += rp; else S.dev = (S.dev || 0) + rp;
  EV.phase = 'found';
  emit(m.x, m.y - 10, 30, { color: ['#ffe58a', '#fff', '#ffc030'], kind: 'spark', smin: 80, smax: 240, lmin: .3, lmax: .8 });
  setTimeout(() => {
    if (!EV || EV.kind !== 'treasure') return;
    evResult(`💰 ${josa(EV_TR.treasure[e], '을를')} 찾았다!`, `궤짝 안에서 <b>${EV_TR.relic[e]}</b>${josa(EV_TR.relic[e], '이가').slice(-1)} 반짝입니다.`,
      `${EV.dug === 1 ? '단번에 진짜를 팠습니다! ' : `${EV.dug}번 만에 찾았습니다. `}${EV.asked ? `<small>물어본 사람 ${EV.asked}명</small>` : ''}`,
      `<span>🪙 보물</span><b>+${gold}</b><span>🔬 옛 지식 (연구 점수)</span><b>+${rp}</b><span>⭐ 경험치</span><b>+${exp}</b>`);
  }, 900);
  save();
}
// 셋 중 한 방향으로 가장 끝에 있는 표시 (1.5칸 넘게 앞서야) → [표시, '북'…] 또는 null
function evExtreme(list, want) {
  const D = [['북', m => -m.ty], ['남', m => m.ty], ['동', m => m.tx], ['서', m => -m.tx]];
  for (const [dn, f] of D.sort(() => rand() - 0.5)) {
    const s = list.slice().sort((a, b) => f(b) - f(a));
    if (s.length > 1 && f(s[0]) - f(s[1]) >= 1.5 && (!want || want(s[0]))) return [s[0], dn];
  }
  return null;
}
function evTreasureLine(v) {
  const e = evEra(), live = EV.marks.filter(m => m.st === 'x'), real = EV.marks.find(m => m.real);
  if (v.hermit) {
    const x = evExtreme(EV.marks, m => m.real);
    EV.hermitTold = true;
    if (x) { EV.hint = `가장 ${x[1]}쪽 표시가 진짜`; return `그 지도라면 내 젊을 적에 그린 걸세. 세 표시 중 <i>가장 ${x[1]}쪽</i>에 있는 게 진짜고, 나머진 도굴꾼 속이려고 그린 가짜지.`; }
    EV.hint = `${real.place}의 표시가 진짜`; return `진짜는 <i>${josa(real.place, '이가')} 있는 쪽</i> 표시일세. 여기서 ${evDir(real.x - v.x, real.y - v.y)}쪽으로 가 보게.`;
  }
  const fakes = live.filter(m => !m.real && !EV.ruled.includes(m));
  const r = rand();
  if (fakes.length && r < 0.55) {
    const x = evExtreme(live, m => !m.real && !EV.ruled.includes(m));
    if (x) { EV.ruled.push(x[0]); EV.hint = EV.hint || `가장 ${x[1]}쪽 표시는 가짜`; return `그 지도 얘기 들었어요! <i>가장 ${x[1]}쪽</i> 표시는 가짜래요. 거긴 우리 할아버지가 벌써 파 봤는데 빈 구덩이였대요.`; }
  }
  if (EV.npc && r < 0.85) { const n = EV.npc; return `${josa(EV_TR.hermit[e], '이가')} 그 지도를 그렸다는 소문이 있어요. 마을에서 <i>${evDir(n.x - v.x, n.y - v.y)}쪽</i> ${evPlace(Math.floor(n.x / T), Math.floor(n.y / T))}에 혼자 살아요.`; }
  const N = ['보물이요? 저도 한몫 주시면 같이 팔게요!', '그런 지도는 장터에 가면 열 장씩 팔던데… 조심하세요.', '보물 찾으시면 우물 좀 새로 파 주세요!'];
  return N[ri(N.length)];
}

// ---------- 도둑 추격 ----------
function evThiefStart() {
  const t = townById(EV.town), p = S.player, th = EV.thief;
  // 마을에서 멀리 있으면 마을로 (장터에서 바로 뛰어나간다)
  if (t && dist2(p.x / T, p.y / T, t.x + .5, t.y + .5) > 7 * 7) {
    for (const [dx, dy] of [[0, 2], [1, 2], [-1, 2], [2, 0], [-2, 0], [0, -2], [2, 2], [-2, 2]]) { const x = (t.x + .5 + dx) * T, y = (t.y + .5 + dy) * T; if (canStand(x, y, 6)) { p.x = x; p.y = y; break; } }
  }
  const h = EV.hides[0], a = Math.atan2(h.y - p.y, h.x - p.x);
  th.x = p.x; th.y = p.y;
  for (let d = 2.6; d >= 1.4; d -= 0.4) { const x = p.x + Math.cos(a) * d * T, y = p.y + Math.sin(a) * d * T; if (canStand(x, y, 6)) { th.x = x; th.y = y; break; } }
  EVCAM.yaw = Math.atan2(th.x - p.x, -(th.y - p.y)); // 도둑 쪽을 보며 내려앉는다
}
function evThiefTick(dt) {
  const th = EV.thief, p = S.player, d = Math.hypot(th.x - p.x, th.y - p.y), e = evEra();
  if (th.st === 'hide') {
    if (d < T * 2.4) { th.st = 'run'; th.stam = 3; toast(`🌿 덤불에서 ${josa(EV_TH.who[e], '이가')} 튀어나왔다!`, 1.8); EV.hint = ''; }
  } else {
    if (d < T * 0.95) return evCaught();
    th.stam -= dt * (th.st === 'rest' ? -1.6 : 1);
    if (th.st === 'run' && th.stam <= 0) { th.st = 'rest'; th.stam = 0; floatText(th.x, th.y - 44, '헉헉…', '#ffe0a0', 13); }
    else if (th.st === 'rest' && th.stam >= 2.6) th.st = 'run';
    const h = EV.hides[EV.hideI % EV.hides.length];
    const hx = h.x - th.x, hy = h.y - th.y, hd = Math.hypot(hx, hy) || 1;
    // 숨을 곳에 닿았고 영주가 멀면 숨는다 (두 번까지)
    if (hd < T * 0.8 && d > T * 4.2 && th.hid < 2 && EV.t > 9) { th.st = 'hide'; th.hid++; EV.hideI++; EV.hint = `${h.place} 어딘가에 숨었다`; toast(`🌿 ${josa(EV_TH.who[e], '이가')} ${h.place}에 숨었다! 가까이 가 보세요`, 2.2); return; }
    let ax = (th.x - p.x) / (d || 1), ay = (th.y - p.y) / (d || 1);
    const near = d < T * 3;
    th.swT -= dt; if (th.swT <= 0) { th.swT = rr(0.6, 1.3); th.swerve = near ? rr(-1.1, 1.1) : rr(-0.3, 0.3); }
    let vx = ax * (near ? 1 : 0.35) + hx / hd * (near ? 0.6 : 1), vy = ay * (near ? 1 : 0.35) + hy / hd * (near ? 0.6 : 1);
    const a0 = Math.atan2(vy, vx) + th.swerve;
    const onF = tileAt(th.x / T, th.y / T) === FOREST;
    const sp = (th.st === 'rest' ? 50 : 106) * (onF ? 0.7 : 1) * (d > T * 9 ? 0.75 : 1);
    let moved = false;
    for (const da of [0, 0.6, -0.6, 1.2, -1.2, 2, -2]) {
      const a = a0 + da, ox = th.x, oy = th.y;
      if (moveEnt(th, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt, 6) && Math.hypot(th.x - ox, th.y - oy) > sp * dt * 0.5) { moved = true; th.yaw = Math.atan2(Math.cos(a), Math.sin(a)); break; }
      th.x = ox; th.y = oy;
    }
    if (moved) th.walk += dt * (th.st === 'rest' ? 6 : 12);
    th.moving = moved;
  }
  if (d > T * 22 || EV.t > EV.limit) evThiefLost();
}
function evCaught() {
  const e = evEra(), t = townById(EV.town);
  const gold = 50 + 30 * e, exp = 35;
  EV.phase = 'found'; EV.thief.st = 'caught';
  S.gold += gold; gainExp(exp); if (t) t.pop += 1;
  banner('덥석!', '', 1);
  shake(4);
  evResult(`🤚 ${josa(EV_TH.who[e], '을를')} 붙잡았다!`, EV_TH.caught[e],
    `${josa(EV_TH.item[e], '을를')} 되찾아 ${t ? t.name : '마을'} 장터에 돌려주었습니다. <small>(${Math.round(EV.t)}초 추격)</small>`,
    `<span>🪙 상인들의 사례</span><b>+${gold}</b><span>⭐ 경험치</span><b>+${exp}</b><span>👥 소문 듣고 이주민</span><b>+1</b>`, '🏰 도둑을 끌고 마을로 돌아가기');
  save();
}
function evThiefLost() {
  const e = evEra();
  EV.phase = 'found'; EV.thief.st = 'gone';
  const loss = Math.min(S.gold, 10 + 5 * e); S.gold -= loss;
  evResult(`💨 ${josa(EV_TH.who[e], '을를')} 놓쳤다…`, '"아이고, 다음엔 꼭 잡아 주세요…"',
    `너무 멀어지거나 시간이 다 되면 달아납니다. 지친 틈(헉헉)을 노리고, 숨은 덤불은 가까이 가면 튀어나와요.`,
    loss ? `<span>🪙 상인 위로금</span><b>-${loss}</b>` : '', '🏰 마을로 돌아가기');
}

// ---------- 3인칭 이동 (updateWorld) ----------
function evMove(mv, dt) {
  if (!evTP()) return mv;
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
function evTalkers() { return EV && EV.npc && EV.phase === 'search' ? villagers.concat([EV.npc]) : villagers; }
function evNearVillager(maxTiles) {
  const p = S.player; let best = null, bd = (maxTiles * T) ** 2;
  for (const v of evTalkers()) { const d = dist2(p.x, p.y, v.x, v.y); if (d < bd) { bd = d; best = v; } }
  return best;
}
function evLineFor(v) {
  const e = evEra(), role = v.hermit ? 'idle' : evRole(v);
  if (!v.name) v.name = EV_NAMES[ri(EV_NAMES.length)];
  const roleName = v.hermit ? '' : (VROLE[role] || VROLE.idle)[e];
  let line;
  if (EV && EV.phase === 'search') {
    if (v.evLine && v.evLineEV === EV && !v.hermit) line = v.evLine;
    else {
      if (EV.kind === 'treasure') line = evTreasureLine(v);
      else if (EV.kind === 'thief') {
        const th = EV.thief, dir = evDir(th.x - v.x, th.y - v.y);
        line = th.st === 'hide' ? `방금 ${EV.hides[(EV.hideI - 1 + EV.hides.length) % EV.hides.length].place} 덤불이 마구 흔들렸어요! ${dir}쪽이에요.` : ['저쪽! <i>' + dir + '쪽</i>으로 뛰어갔어요!', `${josa(EV_TH.item[e], '을를')} 들고 ${dir}쪽으로 내뺐어요! 어서요!`][ri(2)];
      } else {
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
      }
      if (!v.hermit) { v.evLine = line; v.evLineEV = EV; }
      if (EV.kind !== 'thief') EV.asked++;
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
  evTalk = { v, t: v.hermit ? 7 : 5, html: `<b>${L.role ? L.role + ' ' : ''}${L.name}</b>${L.line}` };
  $('talkBox').innerHTML = evTalk.html; $('talkBox').classList.add('show');
}
$('talkBtn').addEventListener('click', () => { if ((EV && EV.phase === 'search') || (FREE && !EV)) evSay(evNearVillager(2)); });
$('freeBtn').addEventListener('click', () => freeSet(!FREE));
$('digBtn').addEventListener('click', () => evDig());
$('talkBox').addEventListener('click', () => { evTalk = null; $('talkBox').classList.remove('show'); });
// 3인칭에서 화면을 톡: 가까운 마을 사람이면 말 걸기. 3인칭에선 다른 탭 행동(자동 이동)은 하지 않는다
function evTap(sx, sy) {
  if (!evTP() || !USE3D) return false;
  const p = S.player, pr = {}, hk = W3_TP.hk;
  let best = null, bd = 56 * 56;
  for (const v of evTalkers()) {
    if (dist2(p.x, p.y, v.x, v.y) > (T * 9) ** 2) continue;
    R3D.project(v.x / T, 0.75 * hk, v.y / T, pr); if (!pr.vis) continue;
    const d = (pr.x - sx) ** 2 + (pr.y - sy) ** 2; if (d < bd) { bd = d; best = v; }
  }
  if (best) { if (dist2(p.x, p.y, best.x, best.y) < (T * 4) ** 2) evSay(best); else toast('조금 더 가까이 가서 말을 걸어 보세요', 1.5); }
  else if (EV && evNearMark(1.4)) evDig();
  return true;
}

// ---------- 3D 그리기용 (world3d.js w3dEvent) ----------
// 사람: [{ o: 풀 키 객체, x, y (게임 px), look, yaw?, moving, walk, beam }] · 땅 표시: [{ x, y, st: 'x' | 'dug' | 'chest', beam }]
function evActors() {
  if (!EV || (EV.phase !== 'search' && EV.phase !== 'found')) return null;
  const out = [], p = S.player;
  if (EV.kind === 'findPerson') { const w = EV.who, near = dist2(p.x, p.y, w.x, w.y) < (T * 6) ** 2; out.push({ o: w, x: w.x, y: w.y, look: w.look, yaw: near ? Math.atan2(p.x - w.x, p.y - w.y) : w.yaw, beam: EV.phase === 'search' }); }
  if (EV.npc) { const n = EV.npc, near = dist2(p.x, p.y, n.x, n.y) < (T * 5) ** 2; out.push({ o: n, x: n.x, y: n.y, look: n.look, yaw: near ? Math.atan2(p.x - n.x, p.y - n.y) : n.yaw, beam: false }); }
  if (EV.kind === 'thief' && EV.thief.st !== 'hide' && EV.thief.st !== 'gone') { const th = EV.thief; out.push({ o: th, x: th.x, y: th.y, look: th.look, yaw: th.st === 'caught' ? Math.atan2(p.x - th.x, p.y - th.y) : th.moving ? th.yaw : undefined, moving: th.st !== 'caught' && !!th.moving, walk: th.walk }); }
  return out;
}
function evMarks() { return EV && EV.kind === 'treasure' && (EV.phase === 'search' || EV.phase === 'found') ? EV.marks : null; }

// ---------- HUD (매 프레임, 멈춤과 상관없이) ----------
function evHud(dt) {
  if (FREE && (MODE !== 'world' || (EV && EV.tp))) freeSet(false);
  const tp = evTP();
  EVCAM.k = clamp(EVCAM.k + (tp ? dt : -dt) / 1.3, 0, 1);
  lookHook = tp ? evLook : null;
  document.body.classList.toggle('tp', tp || EVCAM.k > 0.5);
  const hud = $('evHud');
  if (!EV || EV.phase === 'end' || EV.phase === 'ask') { if (hud.style.display !== 'none') hud.style.display = 'none'; }
  else {
    hud.style.display = 'block'; hud.classList.toggle('bot', !EV.tp);
    let s;
    if (EV.phase === 'guards') s = `🛡️ 경비병이 ${josa(evWhoLabel(), '을를')} 찾는 중…`;
    else if (EV.kind === 'treasure') {
      const left = EV.marks.filter(m => m.st === 'x').length;
      s = `🗺️ 진짜 보물 자리를 파라 <span class="evn">표시 ${left}곳 남음</span><small>${EV.dig ? '⛏️ 파는 중…' : EV.hint ? `단서: ${EV.hint}` : '빛기둥이 X 표시 · 마을 사람에게 물어 가짜를 거르세요'}</small>`;
    } else if (EV.kind === 'thief') {
      const th = EV.thief, p = S.player, left = Math.max(0, Math.ceil(EV.limit - EV.t));
      const where = th.st === 'hide' ? EV.hint : `${evDir(th.x - p.x, th.y - p.y)}쪽 ${Math.round(Math.hypot(th.x - p.x, th.y - p.y) / T)}걸음${th.st === 'rest' ? ' · 헉헉, 지쳤다!' : ''}`;
      s = `🏃 ${josa(EV_TH.who[evEra()], '을를')} 잡아라 <span class="evn">⏱ ${left}</span><small>${where}</small>`;
    } else s = `🔎 ${josa(evWhoLabel(), '을를')} 찾아라<small>${EV.hint ? `단서: ${EV.hint} 쪽` : USE3D ? '마을 사람에게 톡 하거나 「말 걸기」로 물어보세요' : '마을 사람 곁에서 「말 걸기」로 물어보세요'}</small>`;
    if (hud.dataset.s !== s) { hud.dataset.s = s; $('evObj').innerHTML = s; }
    $('evExit').style.display = EV.phase === 'search' && EV.tp ? 'block' : 'none';
  }
  const srch = !!(EV && EV.phase === 'search');
  document.body.classList.toggle('evs', srch);
  const near = (srch && !paused && EV.kind !== 'thief') || (FREE && !EV && !paused) ? evNearVillager(2) : null;
  $('talkBtn').style.display = near ? 'flex' : 'none';
  const dig = srch && !paused && !EV.dig && evNearMark(1.4);
  $('digBtn').style.display = dig ? 'flex' : 'none';
  { const fb = $('freeBtn'), fv = USE3D && MODE === 'world' && S && !(EV && EV.tp) ? '' : 'none'; if (fb.style.display !== fv) fb.style.display = fv; }
  const bb = $('evBoardBtn'), bv = MODE === 'world' && S && S.towns.length ? '' : 'none'; if (bb.style.display !== bv) bb.style.display = bv;
  // 말풍선: 말하는 사람 머리 위 (안 보이면 화면 아래쪽)
  const tb = $('talkBox');
  if (evTalk) {
    evTalk.t -= dt;
    if (evTalk.t <= 0 || !evTalkers().includes(evTalk.v) || MODE !== 'world' || paused || dist2(S.player.x, S.player.y, evTalk.v.x, evTalk.v.y) > (T * 5) ** 2) { evTalk = null; tb.classList.remove('show'); }
    else if (USE3D) {
      const pr = R3D.project(evTalk.v.x / T, 1.6 * (EVCAM.k > 0.5 ? W3_TP.hk : 1) + 0.1, evTalk.v.y / T, {});
      if (pr.vis && pr.x > 0 && pr.x < VW && pr.y > 90 && pr.y < VH) { tb.style.left = clamp(pr.x, 130, VW - 130) + 'px'; tb.style.top = pr.y + 'px'; tb.classList.remove('low'); }
      else { tb.style.left = '50%'; tb.style.top = ''; tb.classList.add('low'); }
    } else { tb.style.left = '50%'; tb.style.top = ''; tb.classList.add('low'); }
  }
}

// ---------- 2D 화면 (?2d): 사건 인물 · 표시 그리기 ----------
function evDraw2D(g) {
  const A = evActors(); if (!A) return;
  for (const a of A) {
    const L = a.look;
    if (a.beam) { g.globalAlpha = 0.25 + 0.1 * Math.sin(S.time * 2.2); g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(a.x, a.y - 6, 16, 0, 7); g.fill(); g.globalAlpha = 1; }
    drawHuman(g, a.x, a.y, { scale: L.scale < 0.9 ? 0.55 : 0.72, face: 1, walk: a.walk || 0, body: L.body, legs: L.legs, hat: L.hat, helm: L.helm });
  }
  const M = evMarks();
  if (M) for (const m of M) {
    if (m.st === 'x') { g.strokeStyle = '#c0392b'; g.lineWidth = 4; g.beginPath(); g.moveTo(m.x - 8, m.y - 8); g.lineTo(m.x + 8, m.y + 8); g.moveTo(m.x + 8, m.y - 8); g.lineTo(m.x - 8, m.y + 8); g.stroke(); }
    else { g.fillStyle = m.st === 'chest' ? '#c9a040' : '#5a4028'; g.beginPath(); g.arc(m.x, m.y, 8, 0, 7); g.fill(); }
  }
}
