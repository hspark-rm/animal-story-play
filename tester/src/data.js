// 게임 밸런스와 콘텐츠 정의. 숫자를 바꿀 때는 tools/sim_test.js로 1년 시뮬레이션을 다시 돌려 본다.
// 금액 단위는 원. 화면에는 만원 단위로 보여 준다.
(function (G) {
  const DATA = {};

  // 받침에 맞는 조사를 붙인다. j('먼치킨','이가') → '먼치킨이', j('견사','을를') → '견사를'
  // 받침 없는 글자나 ㄹ 받침 뒤에는 '로', 그 밖의 받침 뒤에는 '으로'
  G.j = (word, pair) => {
    const w = String(word);
    const last = w.replace(/[^가-힣a-zA-Z0-9]+$/, '').slice(-1);
    const code = last.charCodeAt(0) - 0xAC00;
    // 숫자는 읽는 소리로: 0영 1일 3삼 6육 7칠 8팔은 받침 있음(1·7·8은 ㄹ)
    const digitJong = { 0: 21, 1: 8, 3: 16, 6: 1, 7: 8, 8: 8 };
    const jong = /[0-9]/.test(last) ? (digitJong[last] || 0) : code >= 0 && code <= 11171 ? code % 28 : 0;
    if (pair === '으로') return w + (jong === 0 || jong === 8 ? '로' : '으로');
    return w + (jong ? pair[0] : pair[1]);
  };
  const j = G.j;

  DATA.SAVE_VERSION = 2;

  DATA.TIME = {
    dayMs: 4200,          // 1배속에서 하루 = 4.2초 → 1년(360일) ≈ 25분
    daysPerMonth: 30,
    monthsPerYear: 12,
  };

  DATA.GRID = { cols: 8, rows: 10 };   // 처음 부지(맨 아래 줄은 길)
  // 땅 넓히기: 투자하면 부지가 커진다. 기존 시설은 제자리에 그대로 있고 길이 앞으로 물러난다
  DATA.LAND = [
    { cols: 8,  rows: 10 },
    { cols: 10, rows: 12, cost: 5_000_000,  lv: 2, name: '옆 공터 매입' },
    { cols: 12, rows: 14, cost: 12_000_000, lv: 4, name: '뒷산 자락까지 확장' },
  ];

  // 경력별 시작 조건. 플레이어가 새 게임에서 고른다
  DATA.CAREERS = {
    director: {
      name: '은퇴한 동물유치원 원장님', diff: '쉬움', tag: '경험과 인맥이 두텁다',
      desc: '자금·평판이 넉넉하고 좋은 인재가 먼저 찾아옵니다. 산책장을 갖추고 시작합니다.',
      money: 12_000_000, reputation: 150, awareness: 40, donors: 60, donorFee: 10_000, snsMult: 1, hireBonus: 2, namedRepCut: 0.5,
      extra: ['yard'],
      intro: [
        '동물유치원을 30년 동안 운영했다. 졸업한 강아지만 수천 마리.',
        '은퇴하던 날, 졸업생 보호자들이 말했다. "원장님, 이제 좀 쉬세요."',
        '그런데 쉬는 동안 자꾸 보호소 소식이 눈에 밟혔다.',
        '오랜 인맥과 노하우를 마지막으로 쓸 곳을 찾았다. 작은 보호소의 문을 연다.',
      ],
    },
    influencer: {
      name: '인스타 10만 인플루언서', diff: '보통', tag: 'SNS는 강하고 지갑은 얇다',
      desc: 'SNS 효과가 2배이고 후원자가 많습니다. 다만 후원자 한 명의 후원금이 작습니다.',
      money: 5_000_000, reputation: 80, awareness: 55, donors: 120, donorFee: 4_000, snsMult: 2, hireBonus: 1, namedRepCut: 0.8,
      extra: [],
      intro: [
        '반려견과의 일상을 올리던 계정이 어느새 팔로워 10만이 됐다.',
        '보호소 봉사 영상 하나가 유난히 많이 퍼졌다. 댓글이 수천 개.',
        '"좋아요"는 쏟아지는데, 그 아이들의 사료값은 그대로였다.',
        '그렇다면 직접 해 보자. 팔로워들과 함께 만드는 보호소.',
      ],
    },
    ordinary: {
      name: '일반인', diff: '어려움', tag: '맨손에서 시작한다',
      desc: '자금과 후원자가 적고 아무도 나를 모릅니다. 대신 얼마 전 반려동물을 떠나보내 누구보다 의지가 강합니다. 자금이 바닥나도 한 달 더 버티고, 마음을 닫은 아이와 더 빨리 가까워집니다.',
      money: 4_000_000, reputation: 20, awareness: 25, donors: 22, donorFee: 10_000, snsMult: 1, hireBonus: 0, namedRepCut: 1, resolve: true,
      extra: [],
      intro: [
        '19년을 함께한 뽀삐가 무지개다리를 건넜다.',
        '텅 빈 집이 견디기 힘들어 임시보호를 시작했다. 한 아이, 또 한 아이.',
        '아이들이 새 가족을 만나 떠날 때마다 마음 한쪽이 단단해졌다.',
        '뽀삐가 남겨 준 자리를 다른 아이들에게 내어 주기로 했다. 작은 임시보호소를 연다.',
      ],
    },
  };

  DATA.START = {
    money: 5_000_000,
    reputation: 50,
    awareness: 30,        // 지역 인식 0–100. 낮을수록 길에서 오는 아이가 많다
    donors: 35,           // 정기후원자 수
    donorFee: 10_000,     // 정기후원자 1명당 월 후원금
  };

  /* ---------- 보호소 등급과 시설 ---------- */
  // 등급은 평판으로 오르고 내려가지 않는다. 등급마다 지을 수 있는 시설이 늘어난다
  DATA.LEVELS = [
    { lv: 1, rep: 0,   name: '동네 임시보호소' },
    { lv: 2, rep: 60,  name: '작은 보호소' },
    { lv: 3, rep: 150, name: '믿을 만한 보호소' },
    { lv: 4, rep: 300, name: '이름난 보호소' },
    { lv: 5, rep: 500, name: '모두의 보호소' },
  ];

  // lv = 지을 수 있는 등급, days = 공사 기간(일). 공사 중에는 작동하지 않고 유지비도 들지 않는다
  DATA.FACILITIES = {
    // size = 차지하는 칸(정사각형 한 변). 견사·진료실은 2×2 큰 건물
    // 개 집은 몸집으로 나눈다(2026-10-04): 소형견사 = 소형견, 대형견사 = 중·대형견
    kennel:   { name: '소형견사',   lv: 1, days: 4,  cost: 500_000,   upkeep: 20_000, cap: 2, species: 'dog', dogSize: 'small', desc: '소형견 2마리가 지냅니다. 일렬로 붙여 지으면 최대 3칸짜리 긴 견사가 되고, 붙인 칸마다 1마리를 더 받아요.' },
    bigkennel: { name: '대형견사',  lv: 1, days: 5,  cost: 650_000,   upkeep: 25_000, cap: 1, species: 'dog', dogSize: 'large', desc: '중·대형견 1마리가 넉넉히 지냅니다. 일렬로 붙여 지으면 최대 3칸짜리 긴 견사가 되고, 붙인 칸마다 1마리를 더 받아요.' },
    cattery:  { name: '묘사',       lv: 1, days: 3,  cost: 400_000,   upkeep: 15_000, cap: 3, species: 'cat', desc: '고양이 3마리가 지냅니다. 일렬로 붙여 지으면 최대 3칸짜리 긴 묘사가 되고, 붙인 칸마다 1마리를 더 받아요.' },
    storage:  { name: '물품 창고',   lv: 1, days: 3,  cost: 500_000,   upkeep: 10_000, desc: '물품이 덜 상해 소비량이 15% 줄어듭니다.' },
    yard:     { name: '산책장',     lv: 2, days: 5,  cost: 600_000,   upkeep: 15_000, desc: '개들이 뛰놀며 훈련하는 곳. 사회성과 신뢰가 오르고 다이어트가 빨라져요. 활동량 많은 품종일수록 효과가 커요. 붙여 지으면 최대 8칸까지 한 마당이 돼요.' },
    adoption: { name: '입양 상담실', lv: 2, days: 7,  cost: 800_000,   upkeep: 30_000, desc: '입양 확률이 오릅니다.' },
    clinic:   { name: '진료실',     lv: 3, days: 12, size: 2, cost: 1_800_000, upkeep: 60_000, desc: '2×2칸. 수의사가 있으면 건강 회복이 빨라지고 진료를 안에서 해요.' },
    shop:     { name: '굿즈샵',     lv: 4, days: 8,  cost: 1_500_000, upkeep: 40_000, desc: '달마다 굿즈 매출이 납니다. 평판과 SNS 능력치가 클수록 잘 팔립니다.' },
    exotic:   { name: '특수동물 사육장', lv: 3, days: 8, cost: 1_500_000, upkeep: 40_000, cap: 3, species: 'exotic', desc: '라쿤·미어캣처럼 특별한 아이들이 지냅니다. 없으면 견사에서 불편하게 지내요.' },
    // 본관(v0.7): 시작부터 부지 뒤쪽 가운데에 있다. 짓기 목록에 없고 철거할 수 없으며 옮길 수는 있다.
    // 보호소 등급에 따라 모습이 3단계로 바뀌고(Lv1·Lv3·Lv5), 입양 상담을 기본으로 맡는다
    main:     { name: '본관',       lv: 1, days: 0,  size: 2, cost: 0, upkeep: 30_000, fixed: true, desc: '보호소의 중심 건물. 입양 상담을 기본으로 맡아 입양 확률이 조금 오르고, 등급이 오르면 모습이 바뀌며 분위기가 좋아져요.' },
    // 꾸밈(v0.7): 1칸, 바로 설치, 유지비 없음. mood = 분위기 점수, h = 화면 높이(월드 px)
    planter:   { name: '화분',         decor: true, lv: 1, days: 0, cost: 30_000,  upkeep: 0, mood: 1, h: 38, sprite: 'deco-planter',   desc: '분위기 +1' },
    hedge:     { name: '생울타리',     decor: true, lv: 1, days: 0, cost: 50_000,  upkeep: 0, mood: 1, h: 34, sprite: 'deco-hedge',     desc: '분위기 +1' },
    wastebin:  { name: '배변 봉투함',  decor: true, lv: 1, days: 0, cost: 50_000,  upkeep: 0, mood: 1, h: 48, sprite: 'deco-wastebin',  desc: '분위기 +1' },
    waterbowl: { name: '물그릇 쉼터',  decor: true, lv: 1, days: 0, cost: 50_000,  upkeep: 0, mood: 1, h: 22, sprite: 'deco-waterbowl', desc: '분위기 +1 · 개 건강 회복 +5%' },
    flowerbed: { name: '화단',         decor: true, lv: 1, days: 0, cost: 60_000,  upkeep: 0, mood: 2, h: 30, sprite: 'deco-flowerbed', desc: '분위기 +2' },
    bench:     { name: '벤치',         decor: true, lv: 1, days: 0, cost: 80_000,  upkeep: 0, mood: 2, h: 36, sprite: 'deco-parkbench', desc: '분위기 +2' },
    shade:     { name: '그늘막',       decor: true, lv: 2, days: 0, cost: 120_000, upkeep: 0, mood: 2, h: 52, sprite: 'deco-shade',     desc: '분위기 +2 · 개 건강 회복 +5%' },
    parasol:   { name: '파라솔 테이블', decor: true, lv: 2, days: 0, cost: 150_000, upkeep: 0, mood: 3, h: 52, sprite: 'deco-parasol',   desc: '분위기 +3' },
    bigtree:   { name: '큰 나무',      decor: true, lv: 2, days: 0, cost: 100_000, upkeep: 0, mood: 3, h: 92, sprite: 'deco-bigtree',   desc: '분위기 +3' },
    cattower:  { name: '실외 캣타워',  decor: true, lv: 2, days: 0, cost: 300_000, upkeep: 0, mood: 2, h: 60, sprite: 'deco-cattower',  desc: '분위기 +2 · 고양이 사회성 +10%' },
    arch:      { name: '꽃 아치',      decor: true, lv: 3, days: 0, cost: 200_000, upkeep: 0, mood: 4, h: 64, sprite: 'deco-arch',      desc: '분위기 +4' },
  };

  // 시설 업그레이드(v0.8): 시설마다 2·3단계. 바로 적용되고, 건물 위에 별로 표시한다.
  // 견사·묘사는 그 건물에 사는 아이에게만, 나머지는 그 단계 이상인 시설이 하나라도 있으면 보호소 전체에 효과
  DATA.UPGRADES = {
    kennel:    [{ name: '바닥 난방', cost: 300_000, desc: '겨울에도 건강 회복이 줄지 않아요' }, { name: '개별 놀이 공간', cost: 700_000, desc: '정원 +1 · 사회성 +10%' }],
    bigkennel: [{ name: '바닥 난방', cost: 400_000, desc: '겨울에도 건강 회복이 줄지 않아요' }, { name: '개별 놀이 공간', cost: 900_000, desc: '정원 +1 · 사회성 +10%' }],
    cattery:   [{ name: '캣워크',   cost: 300_000, desc: '고양이 사회성 +15%' }, { name: '창가 해먹', cost: 700_000, desc: '신뢰 +10% · 마음 닫은 아이 회복 2배' }],
    clinic:    [{ name: '수술실',   cost: 1_500_000, desc: '큰 수술 비용 -30%' }, { name: '재활실', cost: 2_500_000, desc: '모든 아이 건강 회복 +20%' }],
    yard:      [{ name: '잔디 관리', cost: 300_000, desc: '비 오는 날에도 사회성이 덜 줄어요' }, { name: '훈련 코스', cost: 800_000, desc: '어질리티 코스 효과(훈련 +20%)를 늘 받아요' }],
    adoption:  [{ name: '입양 후 상담', cost: 600_000, desc: '파양 -30%' }, { name: '가족 매칭', cost: 1_200_000, desc: '방문자가 입양을 원할 확률 +20%' }],
    storage:   [{ name: '냉장 보관', cost: 400_000, desc: '물품 소비 -10%' }, { name: '자동 주문', cost: 800_000, desc: '자동 구입 웃돈 없음' }],
    shop:      [{ name: '온라인 판매', cost: 1_500_000, desc: '굿즈 매출 +30%' }, { name: '굿즈 공방', cost: 3_000_000, desc: '굿즈 매출 +30% 더' }],
  };

  // 특수 사업(v0.8): 후반 해금. 큰돈이 드는 기간제 사업으로 후반 자금의 쓸 곳이 된다.
  // need = 해금 조건(등급·누적 입양·인식). cool = 끝난 뒤 다시 할 수 있기까지 일수
  DATA.PROJECTS = {
    channel:  { name: '유튜브 채널 개설', need: { lv: 4, adopted: 80 }, cost: 3_000_000, days: 0, once: true,
                desc: '보호소 채널을 열어요. 영상을 찍을 때마다 구독자와 인식이 오르고, 구독자 수만큼 달마다 수익이 나요.' },
    lecture:  { name: '대중 강연', need: { lv: 4, adopted: 150 }, cost: 1_000_000, days: 7, cool: 60,
                desc: '인식 +6 · 30일간 학교 교육 효과 2배' },
    charity:  { name: '자선 행사(바자회·걷기 대회)', need: { lv: 4, adopted: 200 }, cost: 5_000_000, days: 14, cool: 120,
                desc: '끝나면 큰 모금과 정기후원자 유입 · 행사 동안 굿즈 매출 2배' },
    mega:     { name: '대규모 인식개선 사업', need: { lv: 5, adopted: 300 }, cost: 10_000_000, days: 90, cool: 180,
                desc: '인식 +15(기간 동안 차츰) · 진행 중 시작되는 유행의 유기 물결 절반' },
    rescue:   { name: '대대적 구조 작전', need: { lv: 5, adopted: 250 }, cost: 8_000_000, days: 30, cool: 120,
                desc: '30일간 보호 요청 2.5배 · 구조할 때마다 평판 +1. 자리를 넉넉히 마련하고 시작하세요' },
    farm:     { name: '무허가 번식장 정리 지원', need: { lv: 5, aware: 80, adopted: 350 }, cost: 15_000_000, days: 60, cool: 360,
                desc: '쉴 틈 없이 새끼를 낳아야 했던 곳이 문을 닫도록 돕고, 남겨진 아이들을 받아요. 이후 유기 물결이 영구히 줄어요(×0.6)' },
  };
  DATA.VIDEOS = {
    review: { name: '입양 후기 영상', cost: 500_000, subs: [800, 2000], aware: 1, desc: '입양 간 아이가 많을수록 잘 돼요' },
    vlog:   { name: '보호소 하루 브이로그', cost: 300_000, subs: [400, 1200], aware: 1, desc: '분위기가 좋을수록 잘 돼요' },
    train:  { name: '훈련 영상', cost: 600_000, subs: [600, 1800], aware: 2, desc: '훈련사가 있으면 잘 돼요' },
  };
  DATA.CHANNEL_PAY = 4;   // 구독자 1명당 월 수익(원)

  // 굿즈 개발(v0.8): 굿즈샵이 있으면 직접 기획해 출시한다. 앞 단계를 출시해야 다음이 열린다.
  // 완성도 ★1~5는 SNS 능력치와 운으로 정해지고, 달마다 base × 완성도/3 × 평판 보정만큼 팔린다
  DATA.GOODS = [
    { id: 'sticker',   name: '스티커',   cost: 300_000,   days: 7,  base: 150_000 },
    { id: 'ecobag',    name: '에코백',   cost: 800_000,   days: 14, base: 350_000 },
    { id: 'calendar',  name: '달력',     cost: 1_500_000, days: 21, base: 600_000 },
    { id: 'plush',     name: '인형',     cost: 3_000_000, days: 30, base: 1_000_000 },
    { id: 'photobook', name: '입양 사진집', cost: 5_000_000, days: 45, base: 1_600_000 },
  ];

  // 산책장 놀이기구(v0.7): 완공된 산책장 칸 위에만 놓는다(칸당 하나). 개는 그 위를 그대로 지나다닌다
  DATA.YARD_ITEMS = {
    aframe: { name: '어질리티 A프레임', cost: 250_000, mood: 1, h: 34, sprite: 'deco-aframe', train: 0.10, desc: '산책장 훈련 효과 +10%' },
    tunnel: { name: '터널',             cost: 300_000, mood: 1, h: 30, sprite: 'deco-tunnel', social: 0.10, desc: '산책장 사회성 +10%' },
    hurdle: { name: '허들',             cost: 150_000, mood: 1, h: 30, sprite: 'deco-hurdle', train: 0.05, desc: '산책장 훈련 효과 +5%' },
    balls:  { name: '공 바구니',        cost: 100_000, mood: 1, h: 26, sprite: 'deco-balls',  toys: -0.10, desc: '장난감 소비 -10%' },
  };

  // 분위기: 꾸밈 점수 합(같은 꾸밈은 5개 넘으면 절반만). 20점마다 방문자 +5%·입양 +2%(상한 +25%·+10%)
  DATA.MOOD = { step: 20, visit: 0.05, visitMax: 0.25, adopt: 0.02, adoptMax: 0.10, sameMax: 5, mainStage: [0, 5, 10] };
  // 본관 단계: 보호소 등급이 이 값 이상이면 그 단계
  DATA.MAIN_STAGE_LV = [1, 3, 5];
  // 꾸밈 콤보: 붙어 있으면(산책장 놀이기구는 같은 마당 안에 있으면) 발동
  DATA.DECOR_COMBOS = [
    { id: 'garden', a: 'bench', b: 'flowerbed', name: '쉬어 가는 정원', desc: '벤치 옆 화단: 방문자가 입양을 원할 확률 +10%' },
    { id: 'course', yard: ['aframe', 'tunnel', 'hurdle'], name: '어질리티 코스', desc: '한 마당에 A프레임·터널·허들: 훈련 효과 +20%' },
    { id: 'summer', a: 'waterbowl', b: 'shade', name: '여름 쉼터', desc: '물그릇 쉼터 옆 그늘막: 개 건강 회복 +10%' },
  ];

  DATA.COMBOS = [
    { id: 'walk',   a: 'yard',     b: 'kennel',   name: '산책 동선',   desc: '산책장 옆 견사: 개 사회성 +30%' },
    { id: 'care',   a: 'clinic',   b: 'kennel',   name: '24시 돌봄',   desc: '진료실 옆 견사: 건강 회복 +30%' },
    { id: 'catvet', a: 'clinic',   b: 'cattery',  name: '고양이 진료', desc: '진료실 옆 묘사: 건강 회복 +30%' },
    { id: 'meet',   a: 'adoption', b: 'yard',     name: '첫 만남 산책', desc: '상담실 옆 산책장: 입양 확률 +20%' },
    { id: 'feed',   a: 'storage',  b: 'kennel',   name: '사료 직배송', desc: '창고 옆 견사: 그 견사의 물품 소비 -20%' },
    { id: 'merch',  a: 'shop',     b: 'adoption', name: '입양 기념품', desc: '굿즈샵 옆 상담실: 굿즈 매출 +30%' },
  ];

  /* ---------- 사람 ---------- */
  DATA.STATS = { care: '돌봄', heal: '치료', train: '훈련', groom: '미용', acct: '회계', sns: 'SNS' };

  // 직무: main = 주 능력치. 월급 = base + 능력치 합 × perStat. post = 채용 공고비
  // owner = 플레이어 '나'. 채용 목록에 나오지 않고 월급이 없으며 내보낼 수 없다
  DATA.OWNER = {
    name: '대표', stats: {
      director:   { care: 6, heal: 2, train: 6, groom: 3, acct: 3, sns: 2 },
      influencer: { care: 4, heal: 1, train: 2, groom: 3, acct: 2, sns: 7 },
      ordinary:   { care: 6, heal: 2, train: 3, groom: 2, acct: 2, sns: 2 },
    },
    defaultName: { m: '김민준', f: '김서연' },
  };

  DATA.ROLES = {
    owner:   { name: '대표',      main: 'care',  base: 0, perStat: 0, post: 0, hidden: true, desc: '보호소를 연 사람, 바로 나.' },
    vet:     { name: '수의사',    main: 'heal',  base: 300_000, perStat: 10_000, post: 100_000, desc: '건강을 회복시킵니다. 진료실이 있어야 힘을 냅니다.' },
    trainer: { name: '훈련사',    main: 'train', base: 150_000, perStat: 8_000, post: 100_000, desc: '신뢰와 사회성을 올립니다.' },
    groomer: { name: '미용사',    main: 'groom', base: 150_000, perStat: 8_000, post: 100_000, desc: '아이들을 단장해 입양 확률을 올립니다.' },
    carer:   { name: '케어 담당', main: 'care',  base: 120_000, perStat: 6_000, post: 80_000,  desc: '매일 아이들을 돌봐 건강·신뢰·사회성이 고르게 오릅니다.' },
    manager: { name: '회계사',    main: 'acct',  base: 180_000, perStat: 8_000, post: 100_000, desc: '회계를 맡습니다. 분기 회계 점수가 오르고, 분기 보고서를 자동으로 제출할 수 있어요.' },
    social:  { name: 'SNS 담당',  main: 'sns',   base: 150_000, perStat: 8_000, post: 100_000, desc: 'SNS 영상과 긴급 모금, 굿즈 매출을 키웁니다.' },
  };
  // 봉사자는 나쁜 사람이 아니라 서툰 사람이다. 돌봄 능력치가 낮고 경험이 적을수록 실수가 잦다.
  // 면접(무료)을 하면 능력치가 보이고, 교육(비용)을 받으면 실수가 절반으로 준다
  DATA.VOLUNTEER = {
    name: '봉사자', max: 6, post: 50_000, training: 30_000,
    mistakeRate: 0.05,                  // 돌봄 0·레벨 1 기준 하루 실수 확률
    mistakes: {
      overfeed: { text: (v, a) => `${v}님이 다이어트 중인 ${a}에게 일반 사료를 듬뿍 줬어요`, effect: '다이어트가 닷새 뒤로 밀렸어요' },
      leash:    { text: (v, a) => `${v}님이 산책 줄을 놓쳐 ${j(a, '과와')} 한바탕 술래잡기를 했어요`, effect: '놀란 아이의 신뢰가 조금 떨어졌어요' },
      bag:      { text: (v) => `${v}님이 사료 봉지를 열어 둔 채 퇴근했어요`, effect: '사료가 눅눅해져 일부를 버렸어요' },
      snack:    { text: (v, a) => `${v}님이 ${a}에게 간식을 몰래 너무 많이 줬어요`, effect: '배탈이 나서 건강이 조금 떨어졌어요' },
    },
  };

  DATA.SURNAMES = ['김', '이', '박', '최', '정', '한', '오', '윤', '강', '조', '신', '임', '서', '문', '배', '노', '하', '유'];
  DATA.GIVEN = ['하늘', '도윤', '서진', '유나', '민호', '지우', '세린', '태오', '다은', '은결', '우현', '하린', '보람', '새솔', '가온', '나래', '라온', '시후', '예린', '주안', '채온', '한별', '해든', '아름'];

  // 이름 있는 인물: 해당 직무 공고를 내면 minRep 이상일 때 지원자 목록에 나온다(한 번 채용하면 다시 나오지 않음).
  // legend는 평판 600 이상에서 지원자 중 5%로 등장한다. 강햇님·민정식은 제작자의 지인, 전설 4명은 가상 인물이다
  DATA.NAMED = [
    { name: '강햇님', sprite: 'kanghaetnim', title: '손끝이 다정한 미용사', role: 'groomer', minRep: 0, chance: 1,
      stats: { care: 5, heal: 1, train: 2, groom: 8, acct: 1, sns: 4 } },
    { name: '민정식', sprite: 'minjeongsik', title: '아이들이 먼저 알아보는 사람', role: 'carer', minRep: 100, chance: 1,
      stats: { care: 9, heal: 3, train: 4, groom: 3, acct: 1, sns: 1 } },
    { name: '한누리', sprite: 'hannuri', title: '들개를 부르는 사람', role: 'trainer', minRep: 600, chance: 0.05, legend: true,
      stats: { care: 6, heal: 2, train: 10, groom: 1, acct: 1, sns: 4 } },
    { name: '윤가람', sprite: 'yungaram', title: '새벽 진료실의 수의사', role: 'vet', minRep: 600, chance: 0.05, legend: true,
      stats: { care: 7, heal: 10, train: 3, groom: 1, acct: 2, sns: 2 } },
    { name: '백서윤', sprite: 'baekseoyun', title: '영수증 한 장도 놓치지 않는 회계사', role: 'manager', minRep: 600, chance: 0.05, legend: true,
      stats: { care: 3, heal: 1, train: 1, groom: 1, acct: 10, sns: 3 } },
    { name: '도하람', sprite: 'dohaeram', title: '알고리즘을 읽는 사람', role: 'social', minRep: 600, chance: 0.05, legend: true,
      stats: { care: 3, heal: 1, train: 2, groom: 2, acct: 3, sns: 10 } },
  ];

  /* ---------- 동물 ---------- */
  // 품종과 유입 빈도(base). 국가동물보호정보시스템 유기동물 공고 표본 720건(2026-10-04 수집)의 품종 분포를 따른다.
  // 믹스견은 진도믹스로, 한국 고양이·믹스묘는 코숏으로 묶었다. 말티푸는 공고 품종에 따로 없어(대개 믹스견) 임의값이다.
  // life = 평균 수명(년), health = 흔히 말하는 건강 유의사항(게임 속 안내이며 수의학적 진단이 아니다)
  DATA.BREEDS = {
    jindo:        { name: '진도믹스',       species: 'dog', size: 'large', base: 388, energy: 1.2, adopt: 0.8, life: [13, 15], colors: ['#e9d7b0', '#c9a978', '#3a2a1c'],
      health: '운동량이 많아 산책이 부족하면 스트레스를 받아요. 피부병과 낯가림을 살펴 주세요.' },
    poodle:       { name: '푸들',           species: 'dog', size: 'small', base: 94, energy: 1.1, adopt: 1.1, life: [14, 17], colors: ['#9a5a34', '#c98a5a', '#2a1a12'],
      health: '슬개골 탈구와 치아 관리에 신경 써야 해요. 털이 계속 자라 미용이 필요해요.' },
    maltese:      { name: '말티즈',         species: 'dog', size: 'small', base: 78, energy: 0.9, adopt: 1.2, life: [12, 15], colors: ['#ffffff', '#ece8f0', '#2a2a33'],
      health: '슬개골 탈구와 눈물 자국, 치아 질환이 흔해요. 심장 질환도 정기적으로 살펴 주세요.' },
    pomeranian:   { name: '포메라니안',     species: 'dog', size: 'small', base: 52, energy: 1.0, adopt: 1.2, life: [12, 16], colors: ['#f0a050', '#ffd9a8', '#3a2a1c'],
      health: '기관지가 약하고 슬개골 탈구가 잦아요. 털이 빠지는 탈모 증상을 살펴 주세요.' },
    bichon:       { name: '비숑',           species: 'dog', size: 'small', base: 30, energy: 1.0, adopt: 1.2, life: [14, 16], colors: ['#ffffff', '#e8e4f0', '#2a2a33'],
      health: '피부가 예민하고 눈물 자국이 잘 생겨요. 슬개골도 살펴 주세요.' },
    bordercollie: { name: '보더콜리',       species: 'dog', size: 'large', base: 24, energy: 1.8, adopt: 0.9, life: [12, 15], colors: ['#2a2a30', '#ffffff', '#1a1a1a'],
      health: '운동과 일이 부족하면 문제 행동이 생겨요. 고관절과 눈 질환을 살펴 주세요.' },
    shihtzu:      { name: '시츄',           species: 'dog', size: 'small', base: 20, energy: 0.8, adopt: 1.0, life: [10, 16], colors: ['#f2f0ea', '#c9a060', '#2a1a12'],
      health: '눈이 튀어나와 각막 상처가 잘 나요. 코가 짧아 더위에 약해요.' },
    spitz:        { name: '스피츠',         species: 'dog', size: 'small', base: 18, energy: 1.3, adopt: 1.0, life: [12, 16], colors: ['#ffffff', '#f0ece4', '#2a2a33'],
      health: '경계심이 강해 짖음이 많을 수 있어요. 슬개골과 털 관리를 챙겨 주세요.' },
    labrador:     { name: '래브라도 리트리버', species: 'dog', size: 'large', base: 18, energy: 1.4, adopt: 0.9, life: [10, 13], colors: ['#e8c88a', '#f2dcae', '#3a2a1c'],
      health: '살이 잘 찌고 고관절·팔꿈치 이형성증이 흔해요. 체중 관리가 중요해요.' },
    shiba:        { name: '시바',           species: 'dog', size: 'large', base: 10, energy: 1.3, adopt: 1.0, life: [13, 16], colors: ['#d9824a', '#fff0d8', '#2a1a12'],
      health: '독립심이 강하고 피부 알러지가 잦아요. 슬개골도 살펴 주세요.' },
    schnauzer:    { name: '슈나우저',       species: 'dog', size: 'small', base: 10, energy: 1.2, adopt: 1.0, life: [12, 15], colors: ['#8a8a8a', '#c8c8c8', '#2a2a2a'],
      health: '고지혈증과 췌장염에 약해 기름진 음식을 피해야 해요. 요로결석도 살펴 주세요.' },
    yorkie:       { name: '요크셔테리어',   species: 'dog', size: 'small', base: 8, energy: 1.0, adopt: 1.1, life: [13, 16], colors: ['#c9a060', '#4a5a7a', '#2a1a12'],
      health: '아주 작아 저혈당과 기관지 협착에 주의해요. 치아가 약해요.' },
    golden:       { name: '골든 리트리버',  species: 'dog', size: 'large', base: 8, energy: 1.4, adopt: 0.9, life: [10, 12], colors: ['#e0a850', '#f2cf8a', '#3a2a1c'],
      health: '고관절 이형성증과 피부병, 종양이 비교적 잦아요. 체중 관리가 중요해요.' },
    chihuahua:    { name: '치와와',         species: 'dog', size: 'small', base: 8, energy: 1.0, adopt: 1.0, life: [14, 18], colors: ['#e8c890', '#f5e2bc', '#2a1a12'],
      health: '추위에 약하고 슬개골 탈구가 잦아요. 정수리 뼈가 덜 닫힌 아이도 있어요.' },
    frenchie:     { name: '프렌치 불독',    species: 'dog', size: 'small', base: 6, energy: 0.8, adopt: 1.1, life: [10, 12], colors: ['#e8d8b8', '#f5ead4', '#2a1a12'],
      health: '코가 짧아 호흡이 힘들고 더위에 아주 약해요. 척추와 피부를 살펴 주세요.' },
    maltipoo:     { name: '말티푸',         species: 'dog', size: 'small', base: 6, energy: 1.0, adopt: 1.2, life: [12, 16], colors: ['#f5e6c8', '#fff4e0', '#3a2a1c'],
      health: '말티즈와 푸들처럼 슬개골과 눈물 자국, 치아 관리가 필요해요.' },
    corgi:        { name: '웰시코기',       species: 'dog', size: 'large', base: 4, energy: 1.6, adopt: 1.2, life: [12, 14], colors: ['#e08a3c', '#fff4e4', '#3a2a1c'],
      health: '허리가 길어 척추·디스크에 부담이 가요. 살이 잘 쪄서 체중 관리가 중요해요.' },
    samoyed:      { name: '사모예드',       species: 'dog', size: 'large', base: 4, energy: 1.5, adopt: 1.0, life: [12, 14], colors: ['#ffffff', '#f2f0ea', '#2a2a33'],
      health: '두꺼운 털 때문에 더위에 약해요. 고관절과 신장 질환을 살펴 주세요.' },
    dachshund:    { name: '닥스훈트',       species: 'dog', size: 'small', base: 4, energy: 1.1, adopt: 1.0, life: [12, 16], colors: ['#a0522d', '#c9824a', '#2a1a12'],
      health: '허리가 아주 길어 디스크가 잘 생겨요. 계단과 높은 곳을 피해 주세요.' },
    husky:        { name: '시베리안 허스키', species: 'dog', size: 'large', base: 2, energy: 1.9, adopt: 0.8, life: [12, 15], colors: ['#8a8a92', '#ffffff', '#2a2a30'],
      health: '운동량이 아주 많고 더위에 약해요. 탈출을 잘해서 울타리를 꼼꼼히 살펴 주세요.' },
    // 한국 고양이(코숏)는 공고 578건을 털색별로 나눴다. 털색 비율은 공식 통계가 없어 추정값이다
    korshort:     { name: '코숏 고등어',     species: 'cat', base: 170, energy: 1.0, adopt: 0.9, life: [12, 18], colors: ['#9a9aa2', '#5e5e68', '#2a2a33'],
      health: '대체로 튼튼해요. 길에서 온 아이는 구내염과 피부병을 살펴 주세요.' },
    korcheese:    { name: '코숏 치즈',       species: 'cat', base: 130, energy: 1.0, adopt: 1.0, life: [12, 18], colors: ['#f0a050', '#ffe0b0', '#3a2a1c'],
      health: '대체로 튼튼해요. 살이 잘 찌는 편이라 먹는 양을 살펴 주세요.' },
    kortuxedo:    { name: '코숏 턱시도',     species: 'cat', base: 90, energy: 1.1, adopt: 0.9, life: [12, 18], colors: ['#2a2a30', '#ffffff', '#1a1a1a'],
      health: '대체로 튼튼해요. 길에서 온 아이는 구내염과 피부병을 살펴 주세요.' },
    korcalico:    { name: '코숏 삼색이',     species: 'cat', base: 70, energy: 1.0, adopt: 1.0, life: [12, 18], colors: ['#ffffff', '#f0a050', '#2a2a30'], femaleOnly: true,
      health: '삼색이는 유전적으로 거의 모두 암컷이에요. 중성화를 꼭 챙겨 주세요.' },
    korblack:     { name: '코숏 올블랙',     species: 'cat', base: 60, energy: 1.0, adopt: 0.8, life: [12, 18], colors: ['#1e1e24', '#34343c', '#f2d24a'],
      health: '대체로 튼튼해요. 검은 고양이는 입양이 늦는 편이라 사진을 밝게 찍어 주세요.' },
    korcow:       { name: '코숏 젖소',       species: 'cat', base: 58, energy: 1.0, adopt: 0.9, life: [12, 18], colors: ['#ffffff', '#2a2a30', '#1a1a1a'],
      health: '대체로 튼튼해요. 흰 털 부분은 햇볕에 화상을 입기 쉬워요.' },
    russianblue:  { name: '러시안블루',     species: 'cat', base: 4, energy: 1.0, adopt: 1.2, life: [15, 20], colors: ['#8a96a8', '#6a7688', '#2a2a33'],
      health: '예민하고 낯을 가려요. 살이 잘 쪄서 먹는 양을 살펴 주세요.' },
    persian:      { name: '페르시안',       species: 'cat', base: 2, energy: 0.7, adopt: 1.1, life: [12, 17], colors: ['#ffffff', '#f2ece4', '#2a2a33'],
      health: '코가 짧아 눈물과 호흡을 살펴야 해요. 다낭성 신장 질환이 유전되기도 해요.' },
    angora:       { name: '터키시 앙고라',  species: 'cat', base: 2, energy: 1.1, adopt: 1.1, life: [12, 18], colors: ['#ffffff', '#f5f2ec', '#2a2a33'],
      health: '흰 털에 파란 눈인 아이는 청각 장애가 있을 수 있어요. 털 엉킴을 살펴 주세요.' },
    americanshort:{ name: '아메리칸 숏헤어', species: 'cat', base: 2, energy: 1.0, adopt: 1.1, life: [15, 20], colors: ['#c0c0c8', '#4a4a52', '#2a2a33'],
      health: '튼튼한 편이지만 비만과 비대성 심근증을 살펴 주세요.' },
    ragdoll:      { name: '랙돌',           species: 'cat', base: 2, energy: 0.8, adopt: 1.2, life: [12, 17], colors: ['#f2e6d0', '#8a6a4a', '#2a2a33'],
      health: '순하고 몸집이 커요. 비대성 심근증과 요로 질환을 살펴 주세요.' },
    scottishfold: { name: '스코티시 폴드',   species: 'cat', base: 6, energy: 0.8, adopt: 1.3, life: [11, 15], colors: ['#c8c0b0', '#e8e0d0', '#2a2a33'],
      health: '접힌 귀는 연골 이상 때문이라 관절 통증(골연골 이형성증)이 흔해요. 걸음걸이를 살펴 주세요.' },
    british:      { name: '브리티시 숏헤어', species: 'cat', base: 5, energy: 0.8, adopt: 1.2, life: [12, 17], colors: ['#8a96a8', '#a8b2c0', '#2a2a33'],
      health: '살이 잘 찌고 비대성 심근증을 살펴야 해요.' },
    siamese:      { name: '샴',             species: 'cat', base: 4, energy: 1.3, adopt: 1.1, life: [12, 18], colors: ['#f2e6d0', '#5a3e2b', '#2a2a33'],
      health: '말이 많고 사람을 좋아해요. 호흡기와 치아를 살펴 주세요.' },
    norwegian:    { name: '노르웨이 숲',     species: 'cat', base: 3, energy: 1.1, adopt: 1.1, life: [12, 16], colors: ['#9a7a5a', '#d8c0a0', '#2a1a12'],
      health: '털이 길고 두꺼워 엉키지 않게 빗어 주세요. 비대성 심근증도 살펴요.' },
    mainecoon:    { name: '메인쿤',         species: 'cat', base: 3, energy: 1.0, adopt: 1.1, life: [12, 15], colors: ['#8a6a4a', '#c8a880', '#2a1a12'],
      health: '몸집이 아주 커요. 고관절 이형성증과 심장 질환을 살펴 주세요.' },
    munchkin:     { name: '먼치킨',         species: 'cat', base: 1, energy: 1.0, adopt: 1.3, life: [12, 15], colors: ['#f0b060', '#fff0d8', '#3a2a1c'],
      health: '다리가 짧아 관절과 척추에 부담이 갈 수 있어요. 높은 곳에서 뛰어내리지 않게 해 주세요.' },
    // 특수동물: 길에서 오지 않고 이벤트로만 들어온다(base 0). 입양 대신 전문 보호시설로 보낸다
    raccoon:  { name: '라쿤',   species: 'exotic', base: 0, energy: 1.0, adopt: 0.25, life: [10, 13], colors: ['#8a8a92', '#2a2a30', '#f2f2f2'],
      health: '야생동물이라 사람 손을 어려워해요. 넓은 공간과 물놀이 공간이 필요해요.' },
    meerkat:  { name: '미어캣', species: 'exotic', base: 0, energy: 1.0, adopt: 0.25, life: [8, 12], colors: ['#d9b27a', '#8a6a3a', '#2a1a12'],
      health: '무리 생활을 해서 혼자 두면 스트레스를 받아요. 따뜻한 굴과 모래가 필요해요.' },
  };
  // SNS 유행 후보: 미디어에서 자주 유행하는 소형·인기 품종
  DATA.TREND_BREEDS = ['corgi', 'bichon', 'poodle', 'maltipoo', 'pomeranian', 'shiba', 'frenchie', 'samoyed', 'munchkin', 'ragdoll', 'scottishfold', 'british'];
  // enabled: false = 보류 중(2026-10-04 사용자 결정). 켜면 이벤트와 특수동물 사육장이 나타난다
  DATA.EXOTIC = {
    enabled: false,
    monthlyChance: 0.08, fromMonth: 4, count: [1, 3],
    makeshift: 0.5,             // 전용 사육장 없이 견사에 있으면 회복·신뢰·사회성이 절반
    story: (name, n) => `동네 야생동물 카페가 문을 닫았어요.\n남겨진 ${name} ${n}마리를 맡아 줄 곳을 찾고 있대요.`,
  };

  DATA.ANIMAL_NAMES = ['콩이', '보리', '두부', '호두', '밤이', '쿠키', '뭉치', '달이', '초코', '감자', '하루', '모카', '라떼', '구름', '나비', '복실', '토리', '단추', '솜이', '누룽지', '깨비', '순대', '망고', '포도', '찹쌀', '도토리', '여름', '가을', '별이', '봄이'];

  // 나이: 들어올 때 추정한다(정확한 생일은 모른다). 어릴수록 입양이 빠르고, 노령일수록 느리다
  DATA.AGE = {
    groups: [
      { key: 'baby',   w: 2,   months: [2, 11],   adopt: 1.4 },
      { key: 'adult',  w: 5,   months: [12, 84],  adopt: 1.0 },
      { key: 'senior', w: 2.5, months: [96, 156], adopt: 0.6 },
    ],
    // 나이별 입양 배율(현실 반영, 2026-10-04): 어릴수록 잘 가고 나이 들수록 급격히 어렵다.
    // [이 나이(년) 미만이면, 배율]. 노령 입양은 드문 만큼 평판을 더 얻는다(seniorRep)
    adoptCurve: [[0.5, 2.2], [1, 1.7], [3, 1.15], [7, 0.85], [10, 0.45], [99, 0.25]],
    seniorRep: 4,
    names: {
      dog:    { baby: '강아지',     adult: '성견', senior: '노령견' },
      cat:    { baby: '아기 고양이', adult: '성묘', senior: '노령묘' },
      exotic: { baby: '새끼',       adult: '성체', senior: '노령' },
    },
  };

  // 의료: 입양하려면 예방접종이 필수. 중성화는 선택(안 하면 파양 위험 1.5배).
  // 진료실과 수의사가 있으면 보호소 안에서 처리해 비용이 크게 준다
  DATA.MEDICAL = {
    // 바깥 동물병원 비용(지자체 중성화 지원을 받은 값). 진료실+수의사가 있으면 inHouse 비율만 든다
    vaccine: { name: '필수 예방접종', cost: { dog: 30_000, cat: 25_000, exotic: 80_000 }, minDays: 60,
      detail: { dog: '종합백신·광견병', cat: '종합백신', exotic: '전문 수의사 상담' } },
    neuter:  { name: '중성화 수술',   cost: { dog: 150_000, cat: 100_000 }, minDays: 180 },
    inHouse: 0.4,              // 진료실+수의사가 있으면 비용의 40%만 든다
    babyAdoptDays: 60,         // 생후 60일이 지나야 입양 갈 수 있다
    intake: { vaccinated: 0.3, neutered: 0.25 },   // 성체로 들어올 때 이미 되어 있을 확률
  };

  // 숨은 알러지: 들어올 때는 모른다. 일반 사료를 먹다가 증상이 나타나야 알게 된다
  DATA.ALLERGY = { rate: 0.06, flare: 0.02, healthDrop: 20, checkCost: 150_000,
    causes: ['닭고기', '소고기', '밀'] };

  // 보호소 앞에 두고 간 아이: 거절할 수 없다. kind = 들어오는 모습
  DATA.DOORSTEP = {
    monthlyChance: 0.15,
    cases: [
      { species: 'cat', n: [2, 4], baby: true,  text: (n) => `아침에 문을 여니 상자 하나가 놓여 있었어요.\n안에서 아기 고양이 ${n}마리가 울고 있어요.` },
      { species: 'dog', n: [1, 1], senior: true, text: () => '대문 기둥에 늙은 개 한 마리가 묶여 있었어요.\n목줄에는 "미안해"라고 적힌 쪽지가 달려 있어요.' },
      { species: 'dog', n: [2, 3], baby: true,  text: (n) => `밤사이 누군가 강아지 ${n}마리를 두고 갔어요.\n담요 한 장과 사료 한 줌이 함께 있어요.` },
      { species: 'dog', n: [1, 1],              text: () => '이사 가는 날이라며 개 한 마리를 맡기고 간 사람이 다시 오지 않아요.' },
    ],
  };

  // 임신: 중성화하지 않은 성체 암컷이 임신한 채로 들어올 수 있다. 출산 후 새끼는 어미 곁에서 지낸다
  DATA.PREGNANCY = { rate: 0.15, dueDays: [10, 50], litter: { dog: [3, 6], cat: [3, 5] }, nursingDays: 60 };

  // 입소 기준: 어떤 아이를 받을지 정하는 전략
  // 길에서 오는 아이 빈도 배율(2026-10-04 사용자 요청으로 절반). 위탁 의무 수용·현관 앞 사건은 그대로
  DATA.INTAKE_RATE = 0.5;
  // 아이가 절반으로 줄면 입양도 줄어든다. 동네 전체에 아이가 줄었으니 이웃 보호소 평판 성장도 줄이고,
  // 입양 한 건의 후원 선물을 늘려 수입을 맞춘다(1년 시뮬레이션 10판으로 맞춤)
  DATA.NPC_REP_RATE = 0.8;
  // 후반 균형(2026-10-04 점검 반영): 적립금이 너무 많으면 "후원금을 왜 안 쓰나" 비판으로 후원자가 조금씩 떠나고,
  // 등급이 오르면 운영비가 오른다. 인식이 높아 길에서 오는 아이가 줄면 이웃 도시 연계 구조 요청이 대신 온다
  DATA.RESERVE = { limit: 100_000_000, donorLoss: 0.02 };
  DATA.UPKEEP_BY_LV = [1, 1, 1.1, 1.2, 1.35, 1.5];
  DATA.REGION_INTAKE = { fromLv: 4, rate: 0.12 };
  DATA.TOUCH_PER_DAY = 3;   // 아이 카드에서 하루에 할 수 있는 교감 횟수(모든 아이 합쳐서)
  // 이웃 보호소 평판은 끝없이 오르지 않고 규모에 맞는 상한으로 다가간다(10년 후반 순위 붕괴 방지)
  DATA.NPC_REP_CAP = { base: 500, perSize: 220 };
  DATA.ADOPT_GIFT_MULT = 1.5;

  // 받는 아이 종류(시작 화면에서 고르고, 경영 탭에서 언제든 바꾼다). 한 종만 받으면 길에서 오는 빈도는
  // 그 종의 실제 비중(품종 가중치 합)만큼만 남는다. 현관 앞에 두고 간 아이·돌아온 아이는 종을 가리지 않는다
  DATA.SPECIES_POLICIES = {
    both: { name: '둘 다',   desc: '강아지와 고양이를 모두 받아요.' },
    dog:  { name: '강아지만', desc: '강아지만 받아요. 고양이 보호 요청은 이웃 보호소로 안내돼요.' },
    cat:  { name: '고양이만', desc: '고양이만 받아요. 강아지 보호 요청은 이웃 보호소로 안내돼요.' },
  };

  DATA.INTAKE_POLICIES = {
    all:     { name: '모두 받기', desc: '들어오는 아이를 모두 받아요.' },
    healthy: { name: '건강한 아이 위주', desc: '다치거나 마음을 닫았거나 살찐 아이는 이웃 보호소로 보내요. 회전은 빠르지만 평판이 조금씩 깎여요.' },
    care:    { name: '돌봄이 필요한 아이 집중', desc: '모두 받되, 수술비 -20% · 긴급 모금 +30%. 아픈 아이가 회복할 때마다 평판이 더 올라요.' },
    ask:     { name: '매번 묻기', desc: '아이가 올 때마다 받을지 직접 골라요.' },
  };

  DATA.ADOPT_READY = { health: 70, trust: 60, social: 60 };

  // 다이어트: 살이 찐 채로 들어오는 개. 다이어트 사료를 30일 먹으면 끝난다.
  // 유행 품종은 '반짝 인기' 때 간식을 많이 먹고 자라 살찐 채로 들어오는 경우가 많다
  DATA.DIET = { rate: 0.12, trendRate: 0.4, days: 30, adoptMult: 0.5, socialMult: 0.7 };

  DATA.INJURY = { rate: 0.08, cost: [2_000_000, 5_000_000] };

  // 입양 책임비: 높을수록 수입은 늘고 입양 확률과 '다시 돌아오는 아이'는 줄어든다
  DATA.ADOPT_FEES = [
    { name: '없음',   fee: 0,       adopt: 1.15, returnRate: 0.08 },
    { name: '5만원',  fee: 50_000,  adopt: 1.0,  returnRate: 0.03 },
    { name: '15만원', fee: 150_000, adopt: 0.8,  returnRate: 0.01 },
  ];

  /* ---------- 물품 ---------- */
  // per: 하루 소비량 (dog = 다이어트 중이 아닌 개, fat = 다이어트 중인 개, cat = 고양이, all = 전체, sick = 건강 50 미만)
  DATA.ITEMS = {
    dogFood:  { name: '건사료(개)',     unit: 'kg',  pack: 15,  price: 60_000,  per: { dog: 0.25 },  lack: '개 건강이 떨어져요' },
    dietFood: { name: '다이어트 사료',  unit: 'kg',  pack: 8,   price: 70_000,  per: { fat: 0.25 },  lack: '다이어트 중인 아이가 일반 사료를 먹어요' },
    hypoFood: { name: '저알러지 처방식', unit: 'kg',  pack: 6,   price: 90_000,  per: { allergic: 0.2 }, lack: '알러지 있는 아이가 아파요' },
    catFood:  { name: '건사료(고양이)', unit: 'kg',  pack: 7,   price: 50_000,  per: { cat: 0.06 },  lack: '고양이 건강이 떨어져요' },
    litter:   { name: '고양이 모래',    unit: 'kg',  pack: 10,  price: 15_000,  per: { cat: 0.2 },   lack: '위생이 나빠져 평판이 떨어져요' },
    pads:     { name: '배변패드',       unit: '장',  pack: 100, price: 20_000,  per: { dog: 1 },     lack: '위생이 나빠져 평판이 떨어져요' },
    towels:   { name: '수건·담요',      unit: '장',  pack: 10,  price: 30_000,  per: { all: 0.05 },  lack: '신뢰가 더디게 올라요' },
    meds:     { name: '기본 약품',      unit: '세트', pack: 1,  price: 100_000, per: { sick: 0.05 }, lack: '치료 효과가 절반이 돼요' },
    carriers: { name: '이동장',         unit: '개',  pack: 1,   price: 30_000,  per: {},             lack: '입양 보낼 때 이동장이 없어요' },
    toys:     { name: '장난감',         unit: '묶음', pack: 1,  price: 20_000,  per: { all: 0.02 },  lack: '사회성 보너스가 없어요', optional: true },
    // 간식: 보통명사처럼 쓰이는 이름을 그대로 쓴다. 있으면 그 종의 신뢰가 20% 빨리 오른다
    churu:    { name: '츄르',           unit: '개',  pack: 20,  price: 12_000,  per: { cat: 0.5 },   lack: '고양이와 친해지는 속도가 느려져요', optional: true },
    dogchew:  { name: '개껌',           unit: '개',  pack: 30,  price: 15_000,  per: { dog: 0.5 },   lack: '강아지와 친해지는 속도가 느려져요', optional: true },
  };
  DATA.START_ITEMS = { dogFood: 15, dietFood: 0, hypoFood: 0, catFood: 7, litter: 10, pads: 100, towels: 10, meds: 1, carriers: 2, toys: 2, churu: 20, dogchew: 30 };
  DATA.AUTO_BUY = { belowDays: 7, targetDays: 14, markup: 1.1 };
  // 후원 물품: w = 도착 빈도 가중치, qty = 한 번에 오는 양. 헌 수건이 가장 흔하다
  DATA.DONATED = [
    { item: 'towels',   w: 5, qty: [5, 20],   text: '헌 수건 한 보따리' },
    { item: 'dogFood',  w: 3, qty: [7, 15],   text: '개 사료' },
    { item: 'catFood',  w: 3, qty: [3, 7],    text: '고양이 사료' },
    { item: 'pads',     w: 2, qty: [50, 100], text: '배변패드' },
    { item: 'litter',   w: 2, qty: [5, 10],   text: '고양이 모래' },
    { item: 'toys',     w: 2, qty: [1, 3],    text: '장난감' },
    { item: 'churu',    w: 4, qty: [10, 40],  text: '츄르 한 상자' },
    { item: 'dogchew',  w: 2, qty: [10, 30],  text: '개껌 한 봉지' },
    { item: 'carriers', w: 1, qty: [1, 2],    text: '안 쓰는 이동장' },
  ];

  /* ---------- 경영 ---------- */
  DATA.CAMPAIGNS = {
    poster:   { name: '동네 포스터',          cost: 300_000,   days: 0,  desc: '지역 인식 +4' },
    adoptDay: { name: '입양의 날 행사',        cost: 800_000,   days: 30, desc: '30일간 입양 확률 ×1.6' },
    school:   { name: '학교 교육',            cost: 1_000_000, days: 60, desc: '60일간 인식이 천천히 오르고, 다가올 유기 물결을 줄입니다' },
    snsVideo: { name: 'SNS 영상',             cost: 600_000,   days: 0,  desc: '정기후원자 증가. SNS 능력치와 섭외 인물이 효과를 키웁니다' },
    finance:  { name: '후원금 사용 내역 공개', cost: 200_000,   days: 0,  desc: '이번 분기 회계 점수 +15' },
    wishlist: { name: '필요 물품 목록 공유',   cost: 100_000,   days: 30, desc: '30일간 후원 물품이 두 배로 자주 와요' },
  };

  // 방문자 교감 → 입양(2026-10-04). 가족이 찾아와 아이 하나와 놀고, 마음에 들면 바로 입양하거나
  // 아직 준비가 덜 됐으면 준비가 끝날 때까지 기다리겠다고 약속한다. 교감 후 입양은 파양이 적다
  DATA.VISIT = {
    fromDay: 20, cooldown: 6, base: 0.06, adoptionRoom: 1.5,
    minTrust: 35, trustGain: 6, socialGain: 5,
    wantRate: 0.45, likeBoost: 1.8, bondReturn: 0.4, reserveDays: 60,
    families: [
      { name: '초등학생 남매네 가족', likes: 'baby', who: ['visitor-mom', 'visitor-boy', 'visitor-girl'] },
      { name: '신혼부부', likes: 'baby', who: ['visitor-groom', 'visitor-bride'] },
      { name: '은퇴한 노부부', likes: 'senior', who: ['visitor-grandpa', 'visitor-grandma'] },
      { name: '혼자 사는 직장인', likes: 'adult', who: ['visitor-office'] },
      { name: '마당 있는 주택의 가족', likes: 'adult', who: ['visitor-dad', 'visitor-boy'] },
      { name: '첫 반려를 준비하는 대학원생', likes: null, who: ['visitor-student'] },
      { name: '예전에 노견을 보낸 가족', likes: 'senior', who: ['visitor-dad', 'visitor-mom'] },
    ],
    // 교감 장면에서 방문자가 하는 말(말풍선)
    talk: ['귀여워!', '이리 와~', '안녕?', '손!', '착하다~', '우리 집 갈래?'],
    acts: {
      dog: ['산책 줄을 잡자 {n} 먼저 앞장섰어요', '공을 던지자 {n} 물어 와서 발 앞에 놓았어요', '{n} 손바닥에 올린 간식을 조심조심 받아먹었어요', '쪼그려 앉자 {n} 무릎에 턱을 올렸어요'],
      cat: ['낚싯대 장난감에 {n} 한참을 뛰어올랐어요', '{n} 손등에 머리를 비볐어요', '가만히 앉아 있자 {n} 무릎으로 올라왔어요', '{n} 눈을 천천히 깜빡이며 인사했어요'],
    },
  };

  // 계절(2026-10-04). 실제 경향을 따른다: 여름 휴가철에 유기가 가장 많고, 봄~여름은 고양이 출산기,
  // 겨울은 아이들 건강 회복이 더디고, 연말에는 후원이 는다
  DATA.SEASONS = {
    spring: { name: '봄',   months: [3, 4, 5],   intake: 1.0, kitten: 0.4, heal: 1.0,  gift: 1.0, msg: '봄이 왔어요. 고양이 출산기라 아기 고양이가 많이 들어와요.' },
    summer: { name: '여름', months: [6, 7, 8],   intake: 1.35, kitten: 0.4, heal: 1.0, gift: 1.0, msg: '여름 휴가철이에요. 한 해 중 유기가 가장 많은 때예요.' },
    autumn: { name: '가을', months: [9, 10, 11], intake: 1.0, kitten: 0,   heal: 1.0,  gift: 1.0, msg: '가을이에요. 산책하기 좋아 입양 문의가 늘어요.', adopt: 1.1 },
    winter: { name: '겨울', months: [12, 1, 2],  intake: 0.9, kitten: 0,   heal: 0.85, gift: 1.0, msg: '겨울이에요. 추위에 아이들 건강 회복이 더뎌요. 12월엔 연말 후원이 늘어요.', decGift: 1.25 },
  };

  // 바깥 사건(2026-10-04): 실제로 있었던 일의 유형을 참고해 가상 이름·비유로 만든다. 다른 보호소의 일이
  // 동물 보호 전체의 신뢰를 흔든다. 참고 유형(국내 보도): 보호소를 사칭한 '신종 펫숍'(2023 대량 암매장 적발),
  // 단체 대표의 후원금 유용·구조 사진 조작(2019 기소), 대형 단체의 몰래 한 안락사 폭로(2019),
  // 사설 보호소 애니멀 호딩 → 민간동물보호시설 신고제 시행(2023)
  // 한 해에 한두 번(1년차는 없음). respond = '우리 운영 공개하기'로 맞설 때 비용과 효과
  DATA.EXTERNAL = {
    monthlyChance: 0.12, fromMonth: 12,
    events: [
      { id: 'fakeshelter', title: '"착한 보호소"의 정체', who: '이웃 도시의 한 "안락사 없는 보호소"',
        body: '{who}가 사실은 큰돈을 받고 아이들을 맡던 가게였다는 보도가 나왔어요.\n맡겨진 아이들 상당수가 끝내 돌아오지 못했대요.\n사람들이 보호소라는 이름 자체를 의심하기 시작했어요.',
        aware: -4, donors: -0.06, rep: 0, surge: { days: 30, mult: 1.6 },
        respond: { cost: 200_000, label: '우리 보호소 운영 공개하기', donors: 0.04, rep: 4, text: '입소 비용이 없고 후원금 사용 내역을 모두 공개한다는 글이 공유되고 있어요.' } },
      { id: 'embezzle', title: '후원금이 사라졌다', who: '한 동물단체 대표',
        body: '{who}가 후원금을 집세와 여행에 썼다는 혐의로 재판에 넘겨졌어요.\n구조 사진까지 꾸며 냈다는 소식에 정기후원을 끊는 사람이 늘고 있어요.',
        aware: -2, donors: -0.08, rep: 0,
        respond: { cost: 200_000, label: '후원금 사용 내역 공개하기', donors: 0.06, rep: 3, text: '영수증까지 올린 우리 보호소의 공개 글에 "여긴 믿을 수 있다"는 댓글이 달렸어요.' } },
      { id: 'secret', title: '감춰진 이별', who: '이름난 대형 단체',
        body: '{who}가 구조한 아이들을 몰래 먼 길로 떠나보내 왔다는 내부 고발이 나왔어요.\n사람들의 실망이 커서, 한동안은 아이를 이웃 보호소로 보내기만 해도 눈총을 받아요.',
        aware: -6, donors: -0.05, rep: 0, transferPenalty: { days: 60, extra: 2 },
        respond: { cost: 300_000, label: '"끝까지 함께" 약속 캠페인', donors: 0.03, rep: 5, aware: 3, text: '"끝까지 함께한다"는 우리 보호소의 약속이 널리 퍼졌어요.' } },
      { id: 'hoarding', title: '넘쳐 버린 사설 보호소', who: '도시 외곽의 한 사설 보호소',
        body: '{who}에서 감당하지 못할 만큼 많은 아이가 방치된 채 발견됐어요.\n구조된 아이들이 근처 보호소로 나뉘어 들어올 거예요.\n이 일을 계기로 보호시설 신고제가 논의되기 시작했어요.',
        aware: 2, donors: 0, rep: 0, surge: { days: 20, mult: 2.2 } },
      { id: 'law', title: '보호시설 신고제 시행', who: '',
        body: '이제 보호시설은 신고하고 기준을 지켜야 해요.\n깨끗하고 넉넉하게 운영하는 곳은 신뢰를 얻고, 비좁은 곳은 눈총을 받아요.',
        aware: 4, donors: 0.03, rep: 0, needAfter: 'hoarding', lawCheck: true },
      { id: 'ban', title: '사칭 보호소 금지법 통과', who: '',
        body: '보호소를 사칭해 돈을 받는 가게를 막는 법이 통과됐어요.\n보호소를 다시 믿어 보겠다는 사람들이 늘고 있어요.',
        aware: 5, donors: 0.04, rep: 2, needAfter: 'fakeshelter' },
    ],
  };

  // 기념일: 해마다 같은 날 찾아온다. 행사를 열지, SNS에 글만 올릴지 고른다.
  // species가 있으면 그 종의 입양만 늘고, null이면 모든 아이의 입양이 는다
  DATA.DAYS = [
    { id: 'cat', month: 8, day: 8, name: '세계 고양이의 날', species: 'cat',
      text: '고양이 사진이 타임라인을 가득 채우는 날이에요.\n보호소 고양이들을 소개하기 좋은 때예요.' },
    { id: 'homeless', month: 8, day: 17, name: '세계 유기동물의 날', species: null,
      text: '집 없는 동물들을 기억하고, 입양을 생각해 보는 날이에요.\n사람들의 관심이 보호소로 모여요.' },
    { id: 'dog', month: 8, day: 26, name: '세계 강아지의 날', species: 'dog',
      text: '산책길마다 강아지 이야기가 오가는 날이에요.\n보호소 강아지들을 소개하기 좋은 때예요.' },
    { id: 'animal', month: 10, day: 4, name: '세계 동물의 날', species: null,
      text: '모든 동물의 삶을 생각해 보는 날이에요.\n동네 학교와 가게들이 함께할 곳을 찾고 있어요.' },
  ];
  DATA.DAY_EVENT = {
    party: { cost: 500_000, days: 14, adopt: 1.8, donors: [6, 12], aware: 3, rep: 3 },   // 기념 행사 열기
    post:  { cost: 0,       days: 7,  adopt: 1.2, donors: [1, 4],  aware: 1, rep: 0 },   // SNS에 글만 올리기
  };

  DATA.LOANS = [
    { amount: 5_000_000,  label: '500만원' },
    { amount: 10_000_000, label: '1,000만원' },
    { amount: 20_000_000, label: '2,000만원' },
  ];
  DATA.LOAN_TERMS = { months: 12, monthlyRate: 0.01 };

  // 분기 보고서: 분기가 끝나면 제출 버튼이 뜬다. 기한을 넘기면 회계 점수와 평판이 깎인다
  DATA.REPORT = { dueDays: 10, latePenalty: 15, lateRep: 5 };
  // 강한 의지(일반인 경력): 자금 부족 단계가 한 달씩 늦게 오고, 마음을 닫은 아이의 신뢰가 더 빨리 오른다
  DATA.RESOLVE = { delay: 1, closedTrust: 1.25 };

  // 이어 짓기: 견사는 일렬로 최대 3칸, 산책장은 붙어 있으면 최대 8칸까지 한 덩어리가 된다
  // 털색 변형: 같은 품종 그림에 색을 곱해(Phaser tint) 입힌다. 곱셈이라 원래 그림보다 밝게는 못 만든다.
  // 그래서 밝은 털 그림이 있는 품종에만 더 짙은 털색을 준다. [이름, 색(null = 원래 그림), 가중치]
  // 고양이는 코숏 털색 6종을 이미 따로 그려 두었으므로 여기서 다루지 않는다
  DATA.COATS = {
    jindo:      [['백구', null, 5], ['황구', 0xe8a868, 4], ['갈색', 0xb08060, 1], ['흑구', 0x6a6060, 1]],
    labrador:   [['옐로', null, 5], ['초콜릿', 0x9a6a50, 2], ['블랙', 0x585058, 2]],
    poodle:     [['브라운', null, 4], ['다크 브라운', 0x8a6a5a, 2], ['블랙', 0x5a5058, 1]],
    pomeranian: [['오렌지', null, 5], ['초코', 0xa07060, 1], ['블랙', 0x605860, 1]],
    chihuahua:  [['크림', null, 4], ['폰', 0xe0b080, 3], ['초코', 0xa07868, 1]],
    golden:     [['골드', null, 4], ['다크 골드', 0xd09868, 2]],
    maltipoo:   [['크림', null, 4], ['애프리콧', 0xf0c090, 3], ['레드', 0xd89068, 1]],
    frenchie:   [['폰', null, 4], ['브린들', 0x8a7870, 2]],
    dachshund:  [['레드', null, 4], ['초코', 0x9a7868, 2], ['블랙탄', 0x6a6068, 1]],
    shiba:      [['적색', null, 6], ['흑색', 0x706068, 1]],
  };

  // 산책장은 훈련장을 겸한다(2026-10-04). 개 신뢰 +trainTrust/일(훈련사 있으면 ×trainerBoost),
  // 활동량 많은 품종은 산책장이 없으면 사회성이 덜 오르고, 다이어트 중이면 운동으로 하루가 더 줄 수 있다
  DATA.YARD = { trainTrust: 0.15, trainerBoost: 1.5, restless: 0.3, dietBoost: 0.3 };
  // 화면 속 산책 범위(칸): 품종 활동량 × 몸집 × 나이·체형. 고양이는 집 앞에만 있는다
  DATA.WALK = { perEnergy: 2.4, small: 0.8, large: 1.2, baby: 0.6, senior: 0.5, fat: 0.6, max: 4 };

  // 일렬로 이어 지으면 한 동이 되는 시설과 최대 칸 수. 산책장은 모양 상관없이 최대 8칸
  DATA.MERGE = { kennel: 3, bigkennel: 3, cattery: 3, yard: 8, yardBonus: 0.1 };
  DATA.MERGE_LINE = ['kennel', 'bigkennel', 'cattery'];
  DATA.DOG_SIZE = { small: '소형견', large: '중·대형견' };
  DATA.MOVE_RATE = 0.1;   // 건물 옮기기 비용 = 건설비의 10% (철거 환급은 30%)

  DATA.CORPORATE = { minRep: 300, monthly: 1_000_000, months: 12 };
  DATA.SUBSIDY = { monthly: 1_500_000, quota: 4 };   // 대신 매달 4마리를 더 받아야 한다

  DATA.CELEBS = [
    { id: 'solha', name: '윤솔하', kind: '배우',        fans: 1_200_000, cost: 2_500_000, days: 30,
      line: '오늘 보호소 봉사 다녀왔어요. 아이들이 생각보다 훨씬 사람을 좋아해요.' },
    { id: 'momo',  name: '꼬리흔들TV 모모', kind: '펫 유튜버', fans: 450_000, cost: 1_200_000, days: 30,
      line: '구독자님들, 오늘은 입양 브이로그 대신 보호소 브이로그 찍었어요!' },
  ];

  // 이웃 보호소 NPC. 이름은 실제 단체와 겹치지 않는지 tools/check_names.js로 확인했다.
  // 유형 비율은 실제 조사(게재 106곳)를 따르되, 지역은 가상 도시로 바꿨다(2026-10-04 사용자 요청).
  // 실제 지역 비율 경기 52·서울 44·인천 5 → 솔마루시·다온시·해솔항
  DATA.HOME_CITY = '다온시';
  DATA.NPCS = [
    { name: '햇살꼬리 쉼터',     region: '솔마루시', type: '구조·보호', size: 3 },
    { name: '포근발자국 하우스', region: '솔마루시', type: '구조·보호', size: 2 },
    { name: '두근두근 냥이마을', region: '다온시', type: '구조·보호', size: 2 },
    { name: '별빛산책 보금자리', region: '솔마루시', type: '구조·보호', size: 4 },
    { name: '온기한스푼',       region: '다온시', type: '옹호·연구', size: 1 },
    { name: '소나무언덕 친구들', region: '솔마루시', type: '구조·보호', size: 2 },
    { name: '다정한골목',       region: '다온시', type: '혼합',      size: 2 },
    { name: '바닷바람 멍냥소',   region: '해솔항', type: '구조·보호', size: 2 },
    { name: '느린걸음 연구소',   region: '다온시', type: '옹호·연구', size: 1 },
    { name: '꼬마발 구조대',     region: '솔마루시', type: '구조·보호', size: 3 },
  ];

  DATA.TREND = {
    viralMonth: 2,            // 해마다 2월에 유행이 터진다
    waveDelayMonths: [6, 8],  // 바이럴 후 6–8개월 뒤 유기 물결
    waveMonths: 4,
    waveWeight: 1300,         // 물결 기간 그 품종 유입 가중치 가산 (품종 가중치 합 약 1,390 기준)
    schoolCut: 0.4,           // 학교 교육 1회당 물결 세기 감소율
    celebBoost: 0.5,          // 유행 품종을 소개한 인플루언서가 키우는 비율
  };

  DATA.FEED = {
    viral: (b) => [`#${b}챌린지 조회수 300만 돌파`, `"우리 집 ${b} 일상" 영상이 실시간 인기`, `${b} 분양 문의 폭주라는 뉴스가 떴다`],
    boom: (b) => [`요즘 산책길마다 ${b}`, `${b} 굿즈가 품절됐다`, `"${b} 키우기 생각보다 힘들어요" 글에 공감 1만`],
    wave: (b) => [`${j(b, '이가')} 길에서 발견됐다는 제보가 늘었다`, `"반짝 인기"가 지나간 자리에 ${b}들이 남았다`],
    calm: ['츄르 한 개에 마음을 연 길고양이 이야기가 공유되고 있다', '비 오는 날 산책 못 한 아이들 사진이 올라왔다', '"입양은 가족을 맞는 일" 캠페인이 공유되고 있다', '이웃 보호소에 사료 기부 릴레이가 이어졌다'],
  };

  // 입양 간 아이 소식: [입양 후 개월 수, 문장 후보]
  // 엔딩: 10년을 운영하면 성과 보고와 앨범 속 아이들의 한마디가 나온다. 그 뒤로는 계속할지 고른다
  DATA.ENDING = {
    years: 10,
    voices: 8,   // 한마디를 전하는 아이 수(앨범에서 고름)
    // 엔딩 갈래(2026-10-04): 인식 개선·성공적인 입양(입양 − 파양)·평판을 3단계(★1~3)로 매기고,
    // 위에서부터 처음 맞는 갈래를 고른다. 기준은 10년 시뮬레이션(방치 ≈ 인식 10·입양 3·평판 0,
    // 보통 운영 ≈ 인식 98·입양 410·평판 990)으로 잡았다
    tiers: { aware: [45, 80], adopt: [120, 300], rep: [400, 800] },
    routes: [
      { id: 'utopia', need: { aware: 3, adopt: 3, rep: 3 }, art: 'year', name: '모두의 마을',
        text: '다온시에서는 이제 "어디서 데려왔어요?"라고 물으면 모두 보호소 이름을 말해요.\n버려지는 아이보다 새 가족을 찾는 아이가 더 빨리 줄었어요.\n{shelter}가 바꾼 10년이에요.' },
      { id: 'culture', need: { aware: 3, adopt: 3 }, art: 'adopt', name: '입양이 당연한 도시',
        text: '반려동물을 맞을 때 입양부터 떠올리는 사람이 많아졌어요.\n동네 아이들은 학교에서 {shelter} 이야기를 배워요.' },
      { id: 'aware', need: { aware: 3 }, art: 'news', name: '인식이 바뀐 도시',
        text: '반짝 유행에 휩쓸려 데려왔다가 버리는 일이 눈에 띄게 줄었어요.\n{shelter}의 캠페인은 이웃 도시로도 퍼졌어요.' },
      { id: 'famous', need: { adopt: 3, rep: 3 }, art: 'celeb', name: '이름난 입양의 집',
        text: '먼 동네에서도 가족을 찾으러 오는 보호소가 되었어요.\n입양 후기 게시판에는 오늘도 새 사진이 올라와요.' },
      { id: 'bridge', need: { adopt: 3 }, art: 'adopt', name: '새 가족을 잇는 다리',
        text: '셀 수 없이 많은 아이가 {shelter}를 거쳐 새 집으로 갔어요.\n명절마다 안부 사진이 쏟아져요.' },
      { id: 'trusted', need: { rep: 3 }, art: 'quarter', name: '모두가 믿는 보호소',
        text: '어려운 구조가 생기면 모두가 가장 먼저 {shelter}에 연락해요.\n투명한 운영은 동네의 자랑이 되었어요.' },
      { id: 'steady', need: { sum: 6 }, art: 'level', name: '동네의 든든한 보호소',
        text: '산책길 사람들이 간식을 들고 들르는 곳이 되었어요.\n크게 이름나지 않아도, 이 동네엔 {shelter}가 있어요.' },
      { id: 'small', need: {}, art: 'open', name: '작지만 따뜻한 보호소',
        text: '크지 않아도, 이곳을 거쳐 간 아이들은 모두 이름을 얻었어요.\n다음 10년은 조금 더 멀리 가 봐요.' },
    ],
    lines: {
      any: [
        '{shelter}에서 처음 먹은 밥 맛, 아직 기억해요.',
        '{shelter} 사람들 덕분에 지금은 우리 집 소파가 제 자리예요.',
        '산책길에 {shelter} 앞을 지나면 꼬리가 저절로 흔들려요.',
        '"{name}", 지금도 그 이름으로 불려요. 지어 줘서 고마워요.',
        '처음 목욕시켜 준 손이 따뜻했어요.',
        '우리 가족은 제가 {shelter}에서 왔다고 자랑해요.',
        '{owner}님, 그때 안아 줘서 고마워요.',
      ],
      cat: ['창가 햇볕 자리는 이제 제 거예요.', '숨숨집에서 나오던 날, 기다려 줘서 고마웠어요.'],
      dog: ['이제 산책 줄만 보면 현관으로 달려가요.', '새 가족이랑 바다에 가 봤어요. 파도가 신기했어요.'],
      closed: ['그때는 아무도 믿지 못했어요. 끝까지 기다려 줘서 고마워요.', '처음으로 손에 머리를 기댔던 날, 기억하세요?'],
      old: ['저 이제 흰 털이 많이 났어요. 그래도 매일 행복해요.', '나이가 들어 느려졌지만, 가족이 제 걸음에 맞춰 걸어 줘요.'],
      recent: ['새 집에 온 지 얼마 안 됐지만, 벌써 제 방석이 생겼어요.'],
    },
  };

  DATA.ADOPT_NEWS = [
    [1,  ['새 집 냄새를 다 맡고 나서야 잠들었대요', '첫날 밤엔 현관 앞에서 잤대요', '이름을 부르면 고개를 갸웃한대요']],
    [3,  ['소파 한가운데를 차지했대요', '산책길 친구가 생겼대요', '간식 서랍 위치를 외웠대요']],
    [6,  ['첫 바다 여행을 다녀왔대요', '할머니 무릎이 제일 좋은 자리래요', '사진첩이 벌써 꽉 찼대요']],
    [12, ['입양 1주년 케이크를 먹었대요', '이제는 집이 제 집인 걸 안대요', '동생이 생겼대요. 둘이 꼭 붙어 자요']],
  ];

  G.DATA = DATA;
})(window);
