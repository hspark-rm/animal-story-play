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
    const jong = code >= 0 && code <= 11171 ? code % 28 : 0;
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
    kennel:   { name: '견사',       lv: 1, days: 6,  size: 2, cost: 1_000_000, upkeep: 30_000, cap: 5, species: 'dog', desc: '2×2칸. 개 5마리가 지냅니다.' },
    cattery:  { name: '묘사',       lv: 1, days: 3,  cost: 400_000,   upkeep: 15_000, cap: 3, species: 'cat', desc: '고양이 3마리가 지냅니다.' },
    storage:  { name: '물품 창고',   lv: 1, days: 3,  cost: 500_000,   upkeep: 10_000, desc: '물품이 덜 상해 소비량이 15% 줄어듭니다.' },
    yard:     { name: '산책장',     lv: 2, days: 5,  cost: 600_000,   upkeep: 15_000, desc: '개의 사회성이 오릅니다.' },
    adoption: { name: '입양 상담실', lv: 2, days: 7,  cost: 800_000,   upkeep: 30_000, desc: '입양 확률이 오릅니다.' },
    clinic:   { name: '진료실',     lv: 3, days: 12, size: 2, cost: 1_800_000, upkeep: 60_000, desc: '2×2칸. 수의사가 있으면 건강 회복이 빨라지고 진료를 안에서 해요.' },
    shop:     { name: '굿즈샵',     lv: 4, days: 8,  cost: 1_500_000, upkeep: 40_000, desc: '달마다 굿즈 매출이 납니다. 평판과 SNS 능력치가 클수록 잘 팔립니다.' },
    exotic:   { name: '특수동물 사육장', lv: 3, days: 8, cost: 1_500_000, upkeep: 40_000, cap: 3, species: 'exotic', desc: '라쿤·미어캣처럼 특별한 아이들이 지냅니다. 없으면 견사에서 불편하게 지내요.' },
  };

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
      leash:    { text: (v, a) => `${v}님이 산책 줄을 놓쳐 ${a}와 한바탕 술래잡기를 했어요`, effect: '놀란 아이의 신뢰가 조금 떨어졌어요' },
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
    jindo:        { name: '진도믹스',       species: 'dog', base: 388, energy: 1.2, adopt: 0.8, life: [13, 15], colors: ['#e9d7b0', '#c9a978', '#3a2a1c'],
      health: '운동량이 많아 산책이 부족하면 스트레스를 받아요. 피부병과 낯가림을 살펴 주세요.' },
    poodle:       { name: '푸들',           species: 'dog', base: 94, energy: 1.1, adopt: 1.1, life: [14, 17], colors: ['#9a5a34', '#c98a5a', '#2a1a12'],
      health: '슬개골 탈구와 치아 관리에 신경 써야 해요. 털이 계속 자라 미용이 필요해요.' },
    maltese:      { name: '말티즈',         species: 'dog', base: 78, energy: 0.9, adopt: 1.2, life: [12, 15], colors: ['#ffffff', '#ece8f0', '#2a2a33'],
      health: '슬개골 탈구와 눈물 자국, 치아 질환이 흔해요. 심장 질환도 정기적으로 살펴 주세요.' },
    pomeranian:   { name: '포메라니안',     species: 'dog', base: 52, energy: 1.0, adopt: 1.2, life: [12, 16], colors: ['#f0a050', '#ffd9a8', '#3a2a1c'],
      health: '기관지가 약하고 슬개골 탈구가 잦아요. 털이 빠지는 탈모 증상을 살펴 주세요.' },
    bichon:       { name: '비숑',           species: 'dog', base: 30, energy: 1.0, adopt: 1.2, life: [14, 16], colors: ['#ffffff', '#e8e4f0', '#2a2a33'],
      health: '피부가 예민하고 눈물 자국이 잘 생겨요. 슬개골도 살펴 주세요.' },
    bordercollie: { name: '보더콜리',       species: 'dog', base: 24, energy: 1.8, adopt: 0.9, life: [12, 15], colors: ['#2a2a30', '#ffffff', '#1a1a1a'],
      health: '운동과 일이 부족하면 문제 행동이 생겨요. 고관절과 눈 질환을 살펴 주세요.' },
    shihtzu:      { name: '시츄',           species: 'dog', base: 20, energy: 0.8, adopt: 1.0, life: [10, 16], colors: ['#f2f0ea', '#c9a060', '#2a1a12'],
      health: '눈이 튀어나와 각막 상처가 잘 나요. 코가 짧아 더위에 약해요.' },
    spitz:        { name: '스피츠',         species: 'dog', base: 18, energy: 1.3, adopt: 1.0, life: [12, 16], colors: ['#ffffff', '#f0ece4', '#2a2a33'],
      health: '경계심이 강해 짖음이 많을 수 있어요. 슬개골과 털 관리를 챙겨 주세요.' },
    labrador:     { name: '래브라도 리트리버', species: 'dog', base: 18, energy: 1.4, adopt: 0.9, life: [10, 13], colors: ['#e8c88a', '#f2dcae', '#3a2a1c'],
      health: '살이 잘 찌고 고관절·팔꿈치 이형성증이 흔해요. 체중 관리가 중요해요.' },
    shiba:        { name: '시바',           species: 'dog', base: 10, energy: 1.3, adopt: 1.0, life: [13, 16], colors: ['#d9824a', '#fff0d8', '#2a1a12'],
      health: '독립심이 강하고 피부 알러지가 잦아요. 슬개골도 살펴 주세요.' },
    schnauzer:    { name: '슈나우저',       species: 'dog', base: 10, energy: 1.2, adopt: 1.0, life: [12, 15], colors: ['#8a8a8a', '#c8c8c8', '#2a2a2a'],
      health: '고지혈증과 췌장염에 약해 기름진 음식을 피해야 해요. 요로결석도 살펴 주세요.' },
    yorkie:       { name: '요크셔테리어',   species: 'dog', base: 8, energy: 1.0, adopt: 1.1, life: [13, 16], colors: ['#c9a060', '#4a5a7a', '#2a1a12'],
      health: '아주 작아 저혈당과 기관지 협착에 주의해요. 치아가 약해요.' },
    golden:       { name: '골든 리트리버',  species: 'dog', base: 8, energy: 1.4, adopt: 0.9, life: [10, 12], colors: ['#e0a850', '#f2cf8a', '#3a2a1c'],
      health: '고관절 이형성증과 피부병, 종양이 비교적 잦아요. 체중 관리가 중요해요.' },
    chihuahua:    { name: '치와와',         species: 'dog', base: 8, energy: 1.0, adopt: 1.0, life: [14, 18], colors: ['#e8c890', '#f5e2bc', '#2a1a12'],
      health: '추위에 약하고 슬개골 탈구가 잦아요. 정수리 뼈가 덜 닫힌 아이도 있어요.' },
    frenchie:     { name: '프렌치 불독',    species: 'dog', base: 6, energy: 0.8, adopt: 1.1, life: [10, 12], colors: ['#e8d8b8', '#f5ead4', '#2a1a12'],
      health: '코가 짧아 호흡이 힘들고 더위에 아주 약해요. 척추와 피부를 살펴 주세요.' },
    maltipoo:     { name: '말티푸',         species: 'dog', base: 6, energy: 1.0, adopt: 1.2, life: [12, 16], colors: ['#f5e6c8', '#fff4e0', '#3a2a1c'],
      health: '말티즈와 푸들처럼 슬개골과 눈물 자국, 치아 관리가 필요해요.' },
    corgi:        { name: '웰시코기',       species: 'dog', base: 4, energy: 1.6, adopt: 1.2, life: [12, 14], colors: ['#e08a3c', '#fff4e4', '#3a2a1c'],
      health: '허리가 길어 척추·디스크에 부담이 가요. 살이 잘 쪄서 체중 관리가 중요해요.' },
    samoyed:      { name: '사모예드',       species: 'dog', base: 4, energy: 1.5, adopt: 1.0, life: [12, 14], colors: ['#ffffff', '#f2f0ea', '#2a2a33'],
      health: '두꺼운 털 때문에 더위에 약해요. 고관절과 신장 질환을 살펴 주세요.' },
    dachshund:    { name: '닥스훈트',       species: 'dog', base: 4, energy: 1.1, adopt: 1.0, life: [12, 16], colors: ['#a0522d', '#c9824a', '#2a1a12'],
      health: '허리가 아주 길어 디스크가 잘 생겨요. 계단과 높은 곳을 피해 주세요.' },
    husky:        { name: '시베리안 허스키', species: 'dog', base: 2, energy: 1.9, adopt: 0.8, life: [12, 15], colors: ['#8a8a92', '#ffffff', '#2a2a30'],
      health: '운동량이 아주 많고 더위에 약해요. 탈출을 잘해서 울타리를 꼼꼼히 살펴 주세요.' },
    korshort:     { name: '코숏',           species: 'cat', base: 578, energy: 1.0, adopt: 0.9, life: [12, 18], colors: ['#9a9aa2', '#5e5e68', '#2a2a33'],
      health: '대체로 튼튼해요. 길에서 온 아이는 구내염과 피부병을 살펴 주세요.' },
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
    munchkin:     { name: '먼치킨',         species: 'cat', base: 1, energy: 1.0, adopt: 1.3, life: [12, 15], colors: ['#f0b060', '#fff0d8', '#3a2a1c'],
      health: '다리가 짧아 관절과 척추에 부담이 갈 수 있어요. 높은 곳에서 뛰어내리지 않게 해 주세요.' },
    // 특수동물: 길에서 오지 않고 이벤트로만 들어온다(base 0). 입양 대신 전문 보호시설로 보낸다
    raccoon:  { name: '라쿤',   species: 'exotic', base: 0, energy: 1.0, adopt: 0.25, life: [10, 13], colors: ['#8a8a92', '#2a2a30', '#f2f2f2'],
      health: '야생동물이라 사람 손을 어려워해요. 넓은 공간과 물놀이 공간이 필요해요.' },
    meerkat:  { name: '미어캣', species: 'exotic', base: 0, energy: 1.0, adopt: 0.25, life: [8, 12], colors: ['#d9b27a', '#8a6a3a', '#2a1a12'],
      health: '무리 생활을 해서 혼자 두면 스트레스를 받아요. 따뜻한 굴과 모래가 필요해요.' },
  };
  // SNS 유행 후보: 미디어에서 자주 유행하는 소형·인기 품종
  DATA.TREND_BREEDS = ['corgi', 'bichon', 'poodle', 'maltipoo', 'pomeranian', 'shiba', 'frenchie', 'samoyed', 'munchkin', 'ragdoll'];
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
    names: {
      dog:    { baby: '강아지',     adult: '성견', senior: '노령견' },
      cat:    { baby: '아기 고양이', adult: '성묘', senior: '노령묘' },
      exotic: { baby: '새끼',       adult: '성체', senior: '노령' },
    },
  };

  // 의료: 입양하려면 예방접종이 필수, 생후 6개월 이상이면 중성화도 필수.
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
    toys:     { name: '장난감·간식',    unit: '묶음', pack: 1,  price: 20_000,  per: { all: 0.02 },  lack: '사회성 보너스가 없어요' },
  };
  DATA.START_ITEMS = { dogFood: 15, dietFood: 0, hypoFood: 0, catFood: 7, litter: 10, pads: 100, towels: 10, meds: 1, carriers: 2, toys: 2 };
  DATA.AUTO_BUY = { belowDays: 7, targetDays: 14, markup: 1.1 };
  // 후원 물품: w = 도착 빈도 가중치, qty = 한 번에 오는 양. 헌 수건이 가장 흔하다
  DATA.DONATED = [
    { item: 'towels',   w: 5, qty: [5, 20],   text: '헌 수건 한 보따리' },
    { item: 'dogFood',  w: 3, qty: [7, 15],   text: '개 사료' },
    { item: 'catFood',  w: 3, qty: [3, 7],    text: '고양이 사료' },
    { item: 'pads',     w: 2, qty: [50, 100], text: '배변패드' },
    { item: 'litter',   w: 2, qty: [5, 10],   text: '고양이 모래' },
    { item: 'toys',     w: 2, qty: [1, 3],    text: '장난감과 간식' },
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

  DATA.CORPORATE = { minRep: 300, monthly: 1_000_000, months: 12 };
  DATA.SUBSIDY = { monthly: 1_500_000, quota: 4 };   // 대신 매달 4마리를 더 받아야 한다

  DATA.CELEBS = [
    { id: 'solha', name: '윤솔하', kind: '배우',        fans: 1_200_000, cost: 2_500_000, days: 30,
      line: '오늘 보호소 봉사 다녀왔어요. 아이들이 생각보다 훨씬 사람을 좋아해요.' },
    { id: 'momo',  name: '꼬리흔들TV 모모', kind: '펫 유튜버', fans: 450_000, cost: 1_200_000, days: 30,
      line: '구독자님들, 오늘은 입양 브이로그 대신 보호소 브이로그 찍었어요!' },
  ];

  // 이웃 보호소 NPC. 이름은 실제 단체와 겹치지 않는지 tools/check_names.js로 확인했다.
  // 지역·유형 비율은 수도권 조사(게재 106곳: 경기 52·서울 44·인천 5, 구조·보호 67·옹호·연구 14·혼합 12)를 따른다
  DATA.NPCS = [
    { name: '햇살꼬리 쉼터',     region: '경기', type: '구조·보호', size: 3 },
    { name: '포근발자국 하우스', region: '경기', type: '구조·보호', size: 2 },
    { name: '두근두근 냥이마을', region: '서울', type: '구조·보호', size: 2 },
    { name: '별빛산책 보금자리', region: '경기', type: '구조·보호', size: 4 },
    { name: '온기한스푼',       region: '서울', type: '옹호·연구', size: 1 },
    { name: '소나무언덕 친구들', region: '경기', type: '구조·보호', size: 2 },
    { name: '다정한골목',       region: '서울', type: '혼합',      size: 2 },
    { name: '바닷바람 멍냥소',   region: '인천', type: '구조·보호', size: 2 },
    { name: '느린걸음 연구소',   region: '서울', type: '옹호·연구', size: 1 },
    { name: '꼬마발 구조대',     region: '경기', type: '구조·보호', size: 3 },
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
    calm: ['비 오는 날 산책 못 한 아이들 사진이 올라왔다', '"입양은 가족을 맞는 일" 캠페인이 공유되고 있다', '이웃 보호소에 사료 기부 릴레이가 이어졌다'],
  };

  // 입양 간 아이 소식: [입양 후 개월 수, 문장 후보]
  DATA.ADOPT_NEWS = [
    [1,  ['새 집 냄새를 다 맡고 나서야 잠들었대요', '첫날 밤엔 현관 앞에서 잤대요', '이름을 부르면 고개를 갸웃한대요']],
    [3,  ['소파 한가운데를 차지했대요', '산책길 친구가 생겼대요', '간식 서랍 위치를 외웠대요']],
    [6,  ['첫 바다 여행을 다녀왔대요', '할머니 무릎이 제일 좋은 자리래요', '사진첩이 벌써 꽉 찼대요']],
    [12, ['입양 1주년 케이크를 먹었대요', '이제는 집이 제 집인 걸 안대요', '동생이 생겼대요. 둘이 꼭 붙어 자요']],
  ];

  G.DATA = DATA;
})(window);
