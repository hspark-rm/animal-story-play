// 보호소 시뮬레이션. 화면과 분리된 순수 계산이다.
// tick(state)은 하루를 진행하고 화면에 띄울 사건 목록을 돌려준다.
// 플레이어가 골라야 하는 일(수술, 이송, 기업 제안)은 s.pending에 쌓고 화면이 하나씩 묻는다.
(function (G) {
  const D = G.DATA;
  const SIM = {};
  const j = G.j;

  /* ---------- 난수: 저장해도 이어지도록 상태에 씨앗을 둔다 ---------- */
  function rand(s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const randInt = (s, a, b) => a + Math.floor(rand(s) * (b - a + 1));
  const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const weighted = (s, list, w) => {
    const total = list.reduce((a, x) => a + w(x), 0);
    let r = rand(s) * total;
    for (const x of list) { if ((r -= w(x)) < 0) return x; }
    return list[list.length - 1];
  };
  const won = (v) => `${Math.round(v / 10000).toLocaleString()}만원`;

  /* ---------- 날짜 ---------- */
  const DPM = D.TIME.daysPerMonth;
  SIM.dateOf = (day) => {
    const m = Math.floor(day / DPM);
    return { year: Math.floor(m / 12) + 1, month: (m % 12) + 1, dayOfMonth: (day % DPM) + 1 };
  };
  SIM.season = (day) => { const m = SIM.dateOf(day).month; return Object.keys(D.SEASONS).find((k) => D.SEASONS[k].months.includes(m)); };
  SIM.dateLabel = (day) => {
    const d = SIM.dateOf(day);
    return `${d.year}년차 ${d.month}월 ${Math.ceil(d.dayOfMonth / 7.5)}주 · ${D.SEASONS[SIM.season(day)].name}`;
  };

  /* ---------- 장부: 돈이 움직일 때는 모두 여기를 거친다 ---------- */
  function income(s, key, amt) {
    amt = Math.round(amt);
    s.money += amt;
    s.ledger.income[key] = (s.ledger.income[key] || 0) + amt;
  }
  function expense(s, key, amt) {
    if (key === 'medical' && has(s, 'lab')) amt *= 0.8;   // 연구 협력실: 진료비 -20%
    if (key === 'medical' && s.siteTrait === 'senior') amt *= 0.8;   // 노령 전문 분점
    amt = Math.round(amt);
    s.money -= amt;
    s.ledger.expense[key] = (s.ledger.expense[key] || 0) + amt;
  }
  function cash(s, key, amt) {   // 손익이 아닌 현금 흐름(대출, 상환)
    amt = Math.round(amt);
    s.money += amt;
    s.ledger.cash[key] = (s.ledger.cash[key] || 0) + amt;
  }
  const newLedger = () => ({ income: {}, expense: {}, cash: {}, rescued: 0, adopted: 0, transferred: 0, stayDays: 0, repStart: 0 });

  /* ---------- 새 게임 ---------- */
  // opts: playerName, playerGender('m'|'f'), shelterName, tutorial(빈 땅에서 시작해 안내를 따라 짓는다)
  SIM.newGame = (seed, careerKey, opts = {}) => {
    const C = D.CAREERS[careerKey || 'ordinary'];
    const s = {
      v: D.SAVE_VERSION, rng: seed ?? (Date.now() | 0), day: 0, career: careerKey || 'ordinary',
      money: C.money, reputation: C.reputation, awareness: C.awareness, donors: C.donors,
      donorFee: C.donorFee, snsMult: C.snsMult,
      gridW: D.GRID.cols, gridH: D.GRID.rows, land: 0, grid: Array(D.GRID.cols * D.GRID.rows).fill(null),
      shelterName: opts.shelterName || '우리 보호소', player: { name: opts.playerName || D.OWNER.defaultName[opts.playerGender || 'f'], gender: opts.playerGender || 'f' },
      tutorial: opts.tutorial ? { step: 0 } : null,
      facilities: {}, animals: [], staff: [], nextId: 1,
      campaigns: [], celebs: [], trend: null, combosFound: [], buffs: [],
      npcRep: D.NPCS.map((n) => 30 + n.size * 15),
      stats: { rescued: 0, adopted: 0, transferred: 0, returned: 0, bites: 0, diets: 0, declined: 0, born: 0, placed: 0, doorstep: 0, donorsPeak: C.donors },
      feed: [], usedNames: [],
      inv: { ...D.START_ITEMS }, autoBuy: true, goodsLog: [], shortNotice: {},   // 자동 구입은 기본으로 켠다(v0.14 시험: 끄면 10년 내내 Lv1)
      feeLevel: 1, loans: [], loanDefault: false, intakePolicy: 'all', speciesPolicy: opts.species || 'both', resolve: !!C.resolve,
      autoReport: false, reportDue: null, level: SIM.levelFor(C.reputation), autoMed: true,
      corporate: null, corporateOffered: false, subsidy: false, quotaLeft: 0,
      jobPosts: {}, volPost: null, applicants: [], hiredNamed: [],
      album: [], pending: [], yearLog: [], ending: null, seen: {}, closed: null, yardItems: {}, siteId: 'main', siteName: '본점', siteTrait: null, sites: {},
      ledger: newLedger(), report: null, prevReport: null,
      quarterFinance: false, fundraisedQ: 0, acctFails: 0, lowFunds: 0,
    };
    s.ledger.repStart = s.reputation;
    // 시작은 봉사자가 아니라 '나'
    s.staff.push({ id: s.nextId++, name: s.player.name, role: 'owner', gender: s.player.gender, level: 1, exp: 0, stats: { ...D.OWNER.stats[s.career] } });
    placeMain(s);
    if (!s.tutorial) {
      if (wants(s, 'dog')) { placeFacility(s, 'bigkennel', 3, 4); placeFacility(s, 'kennel', 3, 5); }
      if (wants(s, 'cat')) placeFacility(s, 'cattery', 5, 5);
      if (C.extra.includes('yard')) placeFacility(s, 'yard', 2, 5);
      if (wants(s, 'dog')) intakeAnimal(s, 'jindo', true);
      if (wants(s, 'cat')) intakeAnimal(s, 'korshort', true);
      pushFeed(s, `${j(s.shelterName, '이가')} 문을 열었다. 첫 식구는 둘.`, 'calm');
    } else {
      pushFeed(s, `${s.shelterName} 자리에 빈 땅이 생겼다. 무엇부터 지을까?`, 'calm');
    }
    return s;
  };

  /* ---------- 보호소 등급 ---------- */
  const repEff = (s) => Math.min(s.reputation, D.REP_EFFECT_MAX);   // 공식에 쓰는 평판
  SIM.repEff = repEff;
  SIM.levelFor = (rep) => D.LEVELS.filter((l) => rep >= l.rep).pop().lv;
  SIM.levelInfo = (lv) => D.LEVELS.find((l) => l.lv === lv);
  function checkLevel(s, ev) {
    const lv = SIM.levelFor(s.reputation);
    if (lv <= s.level) return;
    s.level = lv;
    const opened = Object.entries(D.FACILITIES).filter(([k, f]) => f.lv === lv && !f.fixed && (k !== 'exotic' || D.EXOTIC.enabled)).map(([, f]) => f.name);
    const projects = Object.values(D.PROJECTS).filter((p) => p.need.lv === lv).map((p) => p.name);
    ev.push({ type: 'popup', title: `보호소 등급 Lv${lv}`, body: `${j(SIM.levelInfo(lv).name, '이가')} 되었어요.${opened.length ? `\n새로 지을 수 있어요: ${opened.join(', ')}` : ''}${projects.length ? `\n특수 사업이 열려요(조건 충족 시): ${projects.join(', ')}` : ''}${D.LEVEL_PERKS[lv] ? `\n열린 것: ${D.LEVEL_PERKS[lv]}` : ''}${lv === D.MAIN_STAGE_LV[1] || lv === D.MAIN_STAGE_LV[2] ? '\n본관이 커졌어요!' : ''}` });
    pushFeed(s, `우리 보호소가 '${SIM.levelInfo(lv).name}'로 불리기 시작했다`, 'good');
  }

  // 예전 v2 저장에 없던 값을 채운다
  SIM.migrate = (s) => {
    if (s.level == null) s.level = SIM.levelFor(s.reputation);
    if (s.intakePolicy == null) s.intakePolicy = 'ask';
    if (!s.speciesPolicy) s.speciesPolicy = 'both';
    if (s.resolve == null) s.resolve = !!D.CAREERS[s.career || 'ordinary'].resolve;
    if (s.autoReport == null) s.autoReport = false;
    if (s.reportDue === undefined) s.reportDue = null;
    if (s.autoMed == null) s.autoMed = true;
    if (s.gridW == null) { s.gridW = D.GRID.cols; s.gridH = D.GRID.rows; s.land = 0; }
    s.grid = Array(s.gridW * s.gridH).fill(null);
    for (const f of Object.values(s.facilities)) for (const [cx, cy] of SIM.cellsOf(f)) if (cx < s.gridW && cy < s.gridH) s.grid[idx(s, cx, cy)] = f.id;
    if (!s.shelterName) s.shelterName = '우리 보호소';
    if (!s.player) s.player = { name: '나', gender: 'f' };
    if (s.tutorial === undefined) s.tutorial = null;
    if (!s.yearLog) s.yearLog = [];
    if (!s.yardItems) s.yardItems = {};
    if (!s.dex) { s.dex = {}; for (const a of [...s.animals, ...s.album]) { const d = (s.dex[a.breed] = s.dex[a.breed] || []); if (!d.includes(a.coat || 0)) d.push(a.coat || 0); } }
    if (!s.siteId) { s.siteId = 'main'; s.siteName = '본점'; s.siteTrait = null; }
    if (!s.sites) s.sites = {};
    for (const a of s.animals) if (!a.story) a.story = ['예전부터 보호소에서 지내 왔다'];
    if (!Object.values(s.facilities).some((f) => f.type === 'main')) placeMain(s);
    if (s.ending === undefined) s.ending = null;
    if (!s.seen) s.seen = {};
    for (const k of Object.keys(s.jobPosts || {})) if (Array.isArray(s.jobPosts[k])) s.jobPosts[k] = { until: s.day, list: s.jobPosts[k] };   // 채용 개편 이전 저장
    if (s.closed === undefined) s.closed = null;
    s.stats.born = s.stats.born || 0; s.stats.placed = s.stats.placed || 0; s.stats.doorstep = s.stats.doorstep || 0;
    for (const a of s.animals) {
      if (a.coat == null) a.coat = D.COATS[a.breed] ? a.id % D.COATS[a.breed].length : 0;
      if (a.furDays == null) { a.furDays = D.GROOM.breeds.includes(a.breed) ? a.id % 50 : 0; a.freshDays = 0; }
      if (a.sex == null) { a.sex = (a.id % 2) ? 'F' : 'M'; a.neutered = a.species === 'exotic' ? null : false; a.vaccinated = false; a.pregnant = false; a.dueIn = 0; a.nursingLeft = 0; }
    }
    for (const f of Object.values(s.facilities)) if (f.buildLeft == null) f.buildLeft = 0;
    return s;
  };

  /* ---------- 공용 ---------- */
  // 피드 분류(v0.16): adopt(입양) · sns(소식) · alert(알림). 위쪽 SNS 띠에는 입양을 빼고, 입양은 오른쪽 위 팝업으로 보인다
  function pushFeed(s, text, kind, cat) {
    s.feed.unshift({ day: s.day, text, kind, cat: cat || (kind === 'warn' ? 'alert' : 'sns') });
    if (s.feed.length > 60) s.feed.length = 60;
  }
  const idx = (s, x, y) => y * s.gridW + x;
  // 털색 번호(DATA.COATS 순서). 털색 표가 없는 품종은 0
  function pickCoat(s, breed) {
    const list = D.COATS[breed];
    if (!list) return 0;
    const tot = list.reduce((t, c) => t + c[2], 0);
    let r = rand(s) * tot;
    for (let i = 0; i < list.length; i++) { r -= list[i][2]; if (r < 0) return i; }
    return 0;
  }
  SIM.coatName = (a) => { const c = D.COATS[a.breed]; return c && c[a.coat || 0] ? c[a.coat || 0][0] : null; };
  SIM.coatTint = (a) => { const c = D.COATS[a.breed]; return c && c[a.coat || 0] ? c[a.coat || 0][1] : null; };
  SIM.size = (type) => D.FACILITIES[type].size || 1;
  const cellsOf = (type, x, y) => {
    const n = SIM.size(type), out = [];
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) out.push([x + dx, y + dy]);
    return out;
  };
  SIM.cellsOf = (f) => cellsOf(f.type, f.x, f.y);
  // 지을 수 있는 자리인가: 모든 칸이 부지 안(길 제외)이고 비어 있어야 한다
  SIM.canPlace = (s, type, x, y) => cellsOf(type, x, y).every(([cx, cy]) => cx >= 0 && cy >= 0 && cx < s.gridW && cy < s.gridH - 1 && !s.grid[idx(s, cx, cy)]);
  SIM.facilityAt = (s, x, y) => {
    if (x < 0 || y < 0 || x >= s.gridW || y >= s.gridH) return null;
    const id = s.grid[idx(s, x, y)];
    return id ? s.facilities[id] : null;
  };
  // 완공된 시설만. 공사 중(buildLeft > 0)인 시설은 자리만 차지하고 작동하지 않는다
  const facList = (s, type) => Object.values(s.facilities).filter((f) => !f.buildLeft && (!type || f.type === type));
  const has = (s, type) => facList(s, type).length > 0;
  const activeCampaign = (s, type) => s.campaigns.some((c) => c.type === type && c.until > s.day);
  const activeCelebs = (s) => s.celebs.filter((c) => c.until > s.day);
  const hasBuff = (s, id) => s.buffs.some((b) => b.id === id && b.until > s.day);

  function placeFacility(s, type, x, y, days) {
    const id = s.nextId++;
    s.facilities[id] = { id, type, x, y, buildLeft: days || 0 };
    for (const [cx, cy] of cellsOf(type, x, y)) s.grid[idx(s, cx, cy)] = id;
    return id;
  }

  // 본관: 부지 뒤쪽 가운데부터 2×2 빈자리를 찾아 세운다(예전 저장은 처음 불러올 때 자리를 찾는다)
  function placeMain(s) {
    const cx = Math.floor(s.gridW / 2) - 1;
    const tries = [];
    for (let y = 0; y < s.gridH - 2; y++) for (let d = 0; d < s.gridW; d++) for (const x of [cx - d, cx + d]) tries.push([x, y]);
    const spot = tries.find(([x, y]) => SIM.canPlace(s, 'main', x, y));
    if (spot) placeFacility(s, 'main', spot[0], spot[1]);
  }
/* ---------- 분점: 맞바꾸기 (v0.9.1) ---------- */
  // 화면에 뜬 곳(본점 또는 분점)의 땅·시설·아이·직원은 s 바로 아래에 두고, 나머지 곳은 s.sites에 보관한다
  const SITE_KEYS = ['facilities', 'grid', 'gridW', 'gridH', 'land', 'animals', 'staff', 'yardItems', 'siteId', 'siteName', 'siteTrait'];
  function swapTo(s, id) {
    if (s.siteId === id || !s.sites || !s.sites[id]) return;
    const cur = {};
    for (const k of SITE_KEYS) cur[k] = s[k];
    s.sites[s.siteId] = cur;
    Object.assign(s, s.sites[id]);
    s.sites[id] = null;
  }
  SIM.siteIds = (s) => ['main', ...Object.keys(s.sites || {}).filter((k) => k !== 'main').map(Number).sort()].filter((id, i, a) => a.indexOf(id) === i)
    .filter((id) => id === s.siteId || (s.sites && s.sites[id]) || id === 'main');
  SIM.withSite = (s, id, fn) => {
    if (s.siteId === id) return fn();
    const prev = s.siteId;
    swapTo(s, id);
    try { return fn(); } finally { swapTo(s, prev); }
  };
  SIM.forEachSite = (s, fn) => {
    for (const id of SIM.siteIds(s)) SIM.withSite(s, id, () => {
      if (id === 'main') return fn(true);
      // 분점: 입소는 모두 받기, 종은 특성대로
      const keep = [s.intakePolicy, s.speciesPolicy];
      const tr = D.BRANCH_TRAITS[s.siteTrait] || {};
      s.intakePolicy = 'all';
      s.speciesPolicy = tr.species || 'both';
      try { fn(false); } finally { [s.intakePolicy, s.speciesPolicy] = keep; }
    });
  };
  SIM.viewSite = (s, id) => { swapTo(s, id); return { ok: true }; };
  SIM.siteLabel = (s, id) => (id === 'main' ? '본점' : `${id}호점`);
  // 분점에서 생긴 알림에는 분점 이름을 붙이고, 고를 일(수술 등)은 점장이 대신 정한다
  function branchPost(s, ev, mark, pend) {
    const tag = `[${s.siteName}] `;
    for (let i = mark; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === 'toast' || e.type === 'adopt') e.text = tag + e.text;
      else if (e.type === 'popup') e.title = tag + e.title;
      else if (e.type === 'visit' || e.type === 'built') { ev.splice(i, 1); i--; }
    }
    const added = s.pending.splice(pend);
    for (const p of added) {
      if (p.kind === 'injury') {
        const a = s.animals.find((x) => x.id === p.id);
        s.pending.unshift(p);
        SIM.resolve(s, a && s.money > a.surgeryCost * 2 ? 'pay' : 'transfer');
      }
    }
  }
  SIM.branchInfo = (s, no) => D.BRANCHES.find((b) => b.no === no);
  SIM.openBranch = (s, no, trait) => {
    const B = SIM.branchInfo(s, no), T = D.BRANCH_TRAITS[trait];
    if (!B || !T) return { ok: false };
    if (s.sites && (s.sites[no] || s.siteId === no)) return { ok: false, msg: '이미 연 분점이에요' };
    if (no === 3 && !(s.sites && (s.sites[2] || s.siteId === 2))) return { ok: false, msg: '2호점을 먼저 열어야 해요' };
    if (s.level < B.lv) return { ok: false, msg: `보호소 등급 Lv${B.lv}부터 열 수 있어요` };
    if (s.money < B.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'facility', B.cost);
    const L = D.LAND[0];
    s.sites = s.sites || {};
    s.sites[no] = { facilities: {}, grid: Array(L.cols * L.rows).fill(null), gridW: L.cols, gridH: L.rows, land: 0, animals: [], staff: [], yardItems: {},
      siteId: no, siteName: `${no}호점`, siteTrait: trait };
    SIM.withSite(s, no, () => {
      for (const [type, x, y] of T.layout) if (SIM.canPlace(s, type, x, y)) placeFacility(s, type, x, y);
      // 점장 한 명과 돌봄 담당 두 명이 함께 시작한다
      s.staff.push({ id: s.nextId++, name: personName(s), role: 'manager', title: '점장', level: 2, exp: 0, stats: { care: 4, heal: 1, train: 2, groom: 2, acct: 5, sns: 2 } });
      for (let i = 0; i < 2; i++) s.staff.push({ id: s.nextId++, name: personName(s), role: 'carer', level: 1, exp: 0, stats: { care: 5, heal: 1, train: 1, groom: 1, acct: 0, sns: 0 } });
    });
    pushFeed(s, `${s.shelterName} ${no}호점(${T.name})이 문을 열었다`, 'good');
    return { ok: true, msg: `${no}호점(${T.name})을 열었어요. 위쪽에서 지점을 바꿔 볼 수 있어요`, events: [{ type: 'popup', title: `${no}호점 개점!`, body: `${T.name}\n${T.desc}\n점장과 돌봄 담당 두 명이 함께해요.` }] };
  };
  // 분점의 달 비용(급여·유지비). 본점 정산 때 함께 낸다
  function branchMonthlyCost(s) {
    let cost = 0;
    for (const id of SIM.siteIds(s)) {
      if (id === s.siteId) continue;
      const site = s.sites[id];
      if (!site) continue;
      cost += site.staff.reduce((t, st) => t + SIM.salary(st), 0);
      cost += Object.values(site.facilities).filter((f) => !f.buildLeft).reduce((t, f) => t + D.FACILITIES[f.type].upkeep * (D.UPKEEP_BY_LV[s.level] || 1), 0);
    }
    return cost;
  }

  SIM.mainStage = (s) => D.MAIN_STAGE_LV.filter((lv) => s.level >= lv).length;   // 1~3

  /* ---------- 특수 사업·너튜브·굿즈 개발 (v0.8) ---------- */
  SIM.projectLock = (s, id) => {
    const P = D.PROJECTS[id], n = P.need;
    if (n.lv && s.level < n.lv) return `보호소 등급 Lv${n.lv}부터`;
    if (n.adopted && s.stats.adopted < n.adopted) return `누적 입양 ${n.adopted}마리부터 (지금 ${s.stats.adopted})`;
    if (n.aware && s.awareness < n.aware) return `인식 ${n.aware} 이상부터 (지금 ${Math.round(s.awareness)})`;
    if (P.once && s.channel) return '이미 열었어요';
    const active = (s.projects || []).find((p) => p.id === id);
    if (active && active.until > s.day) return `진행 중 (${active.until - s.day}일 남음)`;
    if (active && P.cool && s.day < active.until + P.cool) return `${active.until + P.cool - s.day}일 뒤 다시 할 수 있어요`;
    return null;
  };
  SIM.projectActive = (s, id) => (s.projects || []).some((p) => p.id === id && p.until > s.day);
  SIM.startProject = (s, id) => {
    const P = D.PROJECTS[id];
    const lock = SIM.projectLock(s, id);
    if (lock) return { ok: false, msg: lock };
    if (s.money < P.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'campaign', P.cost);
    if (id === 'channel') { s.channel = { subs: 0, videos: 0 }; pushFeed(s, `${s.shelterName} 너튜브 채널이 문을 열었다`, 'good'); return { ok: true, msg: '채널을 열었어요. 이제 영상을 찍어 보세요' }; }
    s.projects = (s.projects || []).filter((p) => p.id !== id);
    s.projects.push({ id, start: s.day, until: s.day + P.days, done: false });
    if (id === 'lecture') { s.awareness = clamp(s.awareness + 6, 0, 100); s.buffs.push({ id: 'lecture', until: s.day + 30 }); }
    if (id === 'fund') { s.reputation += 30; s.awareness = clamp(s.awareness + 3, 0, 100); s.stats.fund = (s.stats.fund || 0) + 1; }
    pushFeed(s, `${j(P.name, '이가')} 시작됐다`, 'good');
    return { ok: true, msg: `${P.name} 시작!` };
  };
  SIM.shootVideo = (s, kind) => {
    const V = D.VIDEOS[kind];
    if (!s.channel) return { ok: false, msg: '채널을 먼저 열어야 해요' };
    if (s.channel.lastShot === s.day) return { ok: false, msg: '영상은 하루에 하나만 찍어요' };
    if (s.money < V.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'campaign', V.cost);
    const k = (1 + power(s, 'sns') * 0.06) * s.snsMult * (activeCelebs(s).length ? 1.5 : 1)
      * (kind === 'review' ? 1 + Math.min(1, s.stats.adopted / 300) : kind === 'vlog' ? 1 + SIM.mood(s) / 60 : (power(s, 'train') > 0 ? 1.5 : 1));
    const add = Math.round(randInt(s, V.subs[0], V.subs[1]) * k);
    s.channel.subs += add; s.channel.videos++; s.channel.lastShot = s.day;
    s.awareness = clamp(s.awareness + V.aware, 0, 100);
    return { ok: true, msg: `${V.name} 업로드! 구독자 +${add.toLocaleString()}` };
  };
  // 매일: 진행 중 사업의 효과와 끝날 때 결과
  function projectTick(s, ev) {
    for (const p of s.projects || []) {
      if (p.done) continue;
      if (p.id === 'mega' && p.until > s.day) s.awareness = clamp(s.awareness + 15 / D.PROJECTS.mega.days, 0, 100);
      if (p.id === 'farm' && p.until > s.day && rand(s) < 0.2) {
        const keys = D.TREND_BREEDS.filter((b) => D.BREEDS[b] && wants(s, D.BREEDS[b].species));
        if (keys.length) intakeAnimal(s, pick(s, keys), false, ev, { how: 'farm' });
      }
      if (s.day < p.until) continue;
      p.done = true;
      const P = D.PROJECTS[p.id];
      let body = '';
      if (p.id === 'charity') { const g = randInt(s, 800, 1500) * 10_000; income(s, 'gift', g); const d = randInt(s, 30, 60); s.donors += d; body = `모금 ${won(g)} · 정기후원자 +${d}명`; }
      else if (p.id === 'mega') body = '도시 곳곳에서 "사지 말고 입양하세요" 캠페인 광고를 볼 수 있었어요.';
      else if (p.id === 'rescue') body = '떠돌던 아이들을 많이 품었어요. 이제 한 아이 한 아이 가족을 찾아 줄 차례예요.';
      else if (p.id === 'farm') { s.waveDamp = (s.waveDamp || 1) * 0.6; s.awareness = clamp(s.awareness + 8, 0, 100); s.reputation += 20; body = '그곳은 문을 닫았고, 남겨진 아이들은 이제 쉴 수 있어요.\n앞으로 유행 뒤 유기 물결이 크게 줄어요.'; }
      else if (p.id === 'lecture') body = '강연을 들은 사람들이 주변에 입양 이야기를 전하고 있어요.';
      ev.push({ type: 'popup', title: `${P.name} 마무리`, body });
      pushFeed(s, `${j(P.name, '이가')} 마무리됐다`, 'good');
    }
  }
  SIM.goodsNext = (s) => D.GOODS.find((g) => !(s.goods && s.goods.released.some((r) => r.id === g.id)));
  SIM.developGoods = (s) => {
    s.goods = s.goods || { released: [], dev: null };
    if (!has(s, 'shop')) return { ok: false, msg: '굿즈샵이 있어야 해요' };
    if (s.goods.dev) return { ok: false, msg: '이미 개발 중이에요' };
    const g = SIM.goodsNext(s);
    if (!g) return { ok: false, msg: '모든 굿즈를 출시했어요' };
    if (s.money < g.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'facility', g.cost);
    s.goods.dev = { id: g.id, left: g.days };
    return { ok: true, msg: `${g.name} 개발 시작! ${g.days}일 걸려요` };
  };
  function goodsTick(s, ev) {
    const G = s.goods;
    if (!G || !G.dev) return;
    if (--G.dev.left > 0) return;
    const g = D.GOODS.find((x) => x.id === G.dev.id);
    const q = clamp(Math.round(2 + power(s, 'sns') * 0.12 + rand(s) * 2), 1, 5);
    G.released.push({ id: g.id, q });
    G.dev = null;
    ev.push({ type: 'popup', title: `${g.name} 출시!`, body: `완성도 ${'★'.repeat(q)}${'☆'.repeat(5 - q)}\n달마다 굿즈샵 매출에 더해져요.` });
    pushFeed(s, `${s.shelterName}의 새 굿즈 '${g.name}' 출시`, 'good');
  }
  SIM.goodsMonthly = (s) => (s.goods ? s.goods.released.reduce((t, r) => t + D.GOODS.find((g) => g.id === r.id).base * r.q / 3, 0) : 0) * (0.6 + repEff(s) / 1000);

  /* ---------- 시설 업그레이드 (v0.8) ---------- */
  SIM.facLevel = (f) => (f && f.lvl) || 1;
  const upAny = (s, type, lv) => facList(s, type).some((f) => SIM.facLevel(f) >= lv);   // 그 단계 이상 시설이 하나라도
  SIM.upgradeInfo = (f) => { const list = D.UPGRADES[f.type]; return list ? list[SIM.facLevel(f) - 1] || null : null; };
  SIM.upgrade = (s, id) => {
    const f = s.facilities[id];
    const u = f && SIM.upgradeInfo(f);
    if (!u) return { ok: false, msg: '더 올릴 단계가 없어요' };
    if (f.buildLeft) return { ok: false, msg: '공사가 끝나야 올릴 수 있어요' };
    if (s.money < u.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'facility', u.cost);
    f.lvl = SIM.facLevel(f) + 1;
    pushFeed(s, `${D.FACILITIES[f.type].name}에 '${u.name}'을 갖췄다`, 'good');
    return { ok: true, msg: `${u.name} 완료! ${u.desc}` };
  };

  /* ---------- 꾸밈과 분위기 (v0.7) ---------- */
  const decorList = (s, type) => facList(s).filter((f) => D.FACILITIES[f.type].decor && (!type || f.type === type));
  SIM.yardItemList = (s) => Object.entries(s.yardItems || {}).map(([k, type]) => { const [x, y] = k.split(',').map(Number); return { x, y, type }; });
  const hasYardItem = (s, type) => SIM.yardItemList(s).some((it) => it.type === type);
  SIM.mood = (s) => {
    const count = {};
    let m = (has(s, 'main') ? D.MOOD.mainStage[SIM.mainStage(s) - 1] : 0) + (has(s, 'hall') ? D.MOOD.hall : 0);
    const add = (type, v) => { count[type] = (count[type] || 0) + 1; m += count[type] > D.MOOD.sameMax ? v / 2 : v; };
    for (const f of decorList(s)) add(f.type, D.FACILITIES[f.type].mood);
    for (const it of SIM.yardItemList(s)) add(it.type, D.YARD_ITEMS[it.type].mood);
    return Math.round(m);
  };
  SIM.moodEffect = (s) => {
    const steps = Math.floor(SIM.mood(s) / D.MOOD.step);
    return { visit: Math.min(D.MOOD.visitMax, steps * D.MOOD.visit), adopt: Math.min(D.MOOD.adoptMax, steps * D.MOOD.adopt) };
  };
  // 꾸밈 콤보: 붙은 두 꾸밈, 또는 한 마당 안의 놀이기구 세트
  SIM.decorCombos = (s) => {
    const on = new Set();
    for (const c of D.DECOR_COMBOS) {
      if (c.yard) {
        const items = SIM.yardItemList(s);
        for (const g of SIM.groups(s).yard) {
          const cells = new Set(g.cells.map(([x, y]) => `${x},${y}`));
          const here = new Set(items.filter((it) => cells.has(`${it.x},${it.y}`)).map((it) => it.type));
          if (c.yard.every((t) => here.has(t))) on.add(c.id);
        }
        continue;
      }
      for (const f of decorList(s, c.a)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const g = SIM.facilityAt(s, f.x + dx, f.y + dy);
        if (g && g.type === c.b && !g.buildLeft) on.add(c.id);
      }
    }
    return on;
  };
  SIM.placeYardItem = (s, type, x, y) => {
    const it = D.YARD_ITEMS[type];
    const f = SIM.facilityAt(s, x, y);
    if (!f || f.type !== 'yard' || f.buildLeft) return { ok: false, msg: '완공된 산책장 칸 위에만 놓을 수 있어요' };
    if (s.yardItems[`${x},${y}`]) return { ok: false, msg: '그 칸에는 이미 놀이기구가 있어요' };
    if (s.money < it.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'facility', it.cost);
    s.yardItems[`${x},${y}`] = type;
    const ev = [];
    checkNewCombos(s, ev);
    return { ok: true, msg: `${j(it.name, '을를')} 놓았어요`, events: ev };
  };
  SIM.removeYardItem = (s, key) => {
    const type = s.yardItems[key];
    if (!type) return { ok: false };
    delete s.yardItems[key];
    income(s, 'refund', D.YARD_ITEMS[type].cost * 0.3);
    return { ok: true, msg: `${j(D.YARD_ITEMS[type].name, '을를')} 치웠어요` };
  };
  // 산책장이 옮겨지거나 철거되면 그 위 놀이기구도 치운다(30% 환급)
  function clearYardItems(s, f) {
    if (f.type !== 'yard') return;
    for (const [cx, cy] of SIM.cellsOf(f)) if (s.yardItems[`${cx},${cy}`]) SIM.removeYardItem(s, `${cx},${cy}`);
  }

  /* ---------- 이어 짓기 묶음 ---------- */
  // 견사: 같은 줄로 붙은 것을 x축 방향 먼저, 다음 y축 방향으로 최대 3칸씩 묶는다
  // 산책장: 상하좌우로 붙은 것을 최대 8칸까지 한 마당으로 묶는다
  SIM.groups = (s) => {
    const at = (x, y, type) => { const f = SIM.facilityAt(s, x, y); return f && f.type === type && !f.buildLeft ? f : null; };
    // 견사·대형견사·묘사: 같은 종류가 일렬로 붙으면 한 동(최대 D.MERGE[type]칸)
    const out = {};
    for (const type of D.MERGE_LINE) {
      const list = facList(s, type).sort((a, b) => a.y - b.y || a.x - b.x);
      const used = new Set(), groups = [];
      for (const axis of ['x', 'y']) {
        for (const k of list) {
          if (used.has(k.id)) continue;
          const run = [k];
          while (run.length < D.MERGE[type]) {
            const last = run[run.length - 1];
            const nx = at(last.x + (axis === 'x' ? 1 : 0), last.y + (axis === 'y' ? 1 : 0), type);
            if (!nx || used.has(nx.id)) break;
            run.push(nx);
          }
          if (run.length > 1) { run.forEach((f) => used.add(f.id)); groups.push({ type, axis, ids: run.map((f) => f.id), x: k.x, y: k.y, len: run.length }); }
        }
      }
      for (const k of list) if (!used.has(k.id)) groups.push({ type, axis: 'x', ids: [k.id], x: k.x, y: k.y, len: 1 });
      out[type] = groups;
    }
    const seen = new Set(), yard = [];
    for (const y0 of facList(s, 'yard').sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (seen.has(y0.id)) continue;
      const cells = [], queue = [y0];
      seen.add(y0.id);
      while (queue.length && cells.length < D.MERGE.yard) {
        const f = queue.shift();
        cells.push(f);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const g = at(f.x + dx, f.y + dy, 'yard');
          if (g && !seen.has(g.id) && cells.length + queue.length < D.MERGE.yard) { seen.add(g.id); queue.push(g); }
        }
      }
      yard.push({ ids: cells.map((f) => f.id), cells: cells.map((f) => [f.x, f.y]), len: cells.length });
    }
    out.yard = yard;
    return out;
  };
  // 견사 한 칸의 정원: 묶음의 첫 칸이 붙인 칸 수만큼 더 받는다
  // 이어 지은 동은 첫 칸이 붙인 칸 수만큼 더 받는다
  SIM.lineCap = (s, f, groups) => {
    const list = (groups || SIM.groups(s))[f.type];
    const g = list && list.find((k) => k.ids.includes(f.id));
    return D.FACILITIES[f.type].cap + (g && g.ids[0] === f.id ? g.len - 1 : 0) + ((f.type === 'kennel' || f.type === 'bigkennel') && SIM.facLevel(f) >= 3 ? 1 : 0) + (f.type === 'cattery' && s.siteTrait === 'cat' ? 1 : 0);
  };
  SIM.kennelCap = SIM.lineCap;
  // 개의 몸집: 소형견은 소형견사, 중·대형견은 대형견사에서 지낸다
  SIM.dogSize = (a) => (D.BREEDS[a.breed || a] && D.BREEDS[a.breed || a].size) || 'large';

  /* ---------- 땅 넓히기 ---------- */
  SIM.expandLand = (s) => {
    const next = D.LAND[s.land + 1];
    if (!next) return { ok: false, msg: '더 넓힐 땅이 없어요' };
    if (s.level < next.lv) return { ok: false, msg: `보호소 등급 Lv${next.lv}부터 넓힐 수 있어요` };
    if (s.money < next.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'facility', next.cost);
    s.land++;
    s.gridW = next.cols;
    s.gridH = next.rows;
    s.grid = Array(s.gridW * s.gridH).fill(null);
    for (const f of Object.values(s.facilities)) for (const [cx, cy] of cellsOf(f.type, f.x, f.y)) s.grid[idx(s, cx, cy)] = f.id;
    pushFeed(s, `${j(s.shelterName, '이가')} '${next.name}'로 부지를 넓혔다`, 'good');
    return { ok: true, msg: `부지가 ${next.cols}×${next.rows - 1}칸으로 넓어졌어요`, events: [{ type: 'popup', title: '땅이 넓어졌어요', body: `${next.name}\n이제 ${next.cols}×${next.rows - 1}칸에 지을 수 있어요.` }] };
  };

  function freeName(s) {
    const left = D.ANIMAL_NAMES.filter((n) => !s.usedNames.includes(n));
    const n = left.length ? pick(s, left) : `${pick(s, D.ANIMAL_NAMES)}${randInt(s, 2, 9)}`;
    s.usedNames.push(n);
    if (s.usedNames.length > D.ANIMAL_NAMES.length - 3) s.usedNames.splice(0, 10);
    return n;
  }
  const personName = (s) => pick(s, D.SURNAMES) + pick(s, D.GIVEN);

  function freeHome(s, species, breed) {
    const types = species === 'dog' ? [SIM.dogSize(breed) === 'small' ? 'kennel' : 'bigkennel'] : species === 'cat' ? ['cattery'] : ['exotic', 'bigkennel', 'kennel'];
    const groups = SIM.groups(s);
    for (const type of types) {
      for (const f of facList(s, type)) {
        const n = s.animals.filter((a) => a.home === f.id).length;
        const cap = D.MERGE_LINE.includes(type) ? SIM.lineCap(s, f, groups) : D.FACILITIES[type].cap;
        if (n < cap) return f.id;
      }
    }
    return null;
  }
  SIM.hasRoom = (s, a) => !!freeHome(s, a.species, a.breed);
  SIM.freeSlots = (s) => { const c = SIM.capacity(s); return Math.max(0, c.small - c.ns) + Math.max(0, c.large - c.nl) + Math.max(0, c.cat - c.nc); };
  // 특수동물이 전용 사육장이 아닌 곳에 있으면 '임시 거처'
  // 중·대형견이 소형견사에 있어도 '임시 거처'(예전 저장에서 옮겨 온 아이들)
  SIM.makeshift = (s, a) => {
    const h = s.facilities[a.home];
    if (!h) return false;
    if (a.species === 'exotic') return h.type !== 'exotic';
    return a.species === 'dog' && h.type === 'kennel' && SIM.dogSize(a) === 'large';
  };
  SIM.capacity = (s) => {
    const groups = SIM.groups(s);
    const small = facList(s, 'kennel').reduce((a, f) => a + SIM.lineCap(s, f, groups), 0);
    const large = facList(s, 'bigkennel').reduce((a, f) => a + SIM.lineCap(s, f, groups), 0);
    const dog = small + large;
    const cat = facList(s, 'cattery').reduce((a, f) => a + SIM.lineCap(s, f, groups), 0);
    const dogs = s.animals.filter((a) => a.species === 'dog');
    const ns = dogs.filter((a) => SIM.dogSize(a) === 'small').length, nl = dogs.length - ns;
    const nd = s.animals.filter((a) => a.species === 'dog').length;
    const nc = s.animals.filter((a) => a.species === 'cat').length;
    const exo = facList(s, 'exotic').length * D.FACILITIES.exotic.cap;
    const ne = s.animals.filter((a) => a.species === 'exotic').length;
    return { dog, cat, nd, nc, exo, ne, small, large, ns, nl };
  };

  /* ---------- 사람 능력 ---------- */
  const lvl = (st) => 1 + 0.15 * (st.level - 1);
  // 직무의 주 능력치는 그대로, 나머지 능력치는 30%만 일에 보탠다
  function power(s, stat, attending) {
    let p = 0;
    for (const st of s.staff) {
      if (st.role === 'volunteer' && attending && !attending.has(st.id)) continue;
      const main = st.role === 'volunteer' ? 'care' : D.ROLES[st.role].main;
      p += (st.stats[stat] || 0) * lvl(st) * (main === stat ? 1 : 0.3);
    }
    return p;
  }
  SIM.power = (s, stat) => power(s, stat);
  SIM.salary = (st) => st.role === 'volunteer' || st.role === 'owner' ? 0
    : Math.round((D.ROLES[st.role].base + D.ROLES[st.role].perStat * Object.values(st.stats).reduce((a, b) => a + b, 0)) * (1 + (st.raise || 0)));

  function makeVolunteer(s) {
    return {
      id: s.nextId++, name: personName(s), role: 'volunteer', level: 1, exp: 0,
      stats: { care: randInt(s, 2, 6), heal: randInt(s, 0, 2), train: randInt(s, 1, 3), groom: randInt(s, 0, 3), acct: randInt(s, 0, 3), sns: randInt(s, 0, 4) },
      interviewed: false, trained: false, mistakes: 0,
    };
  }

  function makeCandidate(s, role) {
    // 채용 개편(v0.15): 능력치는 모두 무작위. 주 능력치는 평판이 높을수록 높은 쪽으로 기울지만 폭이 넓어 들쭉날쭉하다.
    // 지원자마다 남다른 장기 하나(다른 능력치 +2~4)가 붙을 수 있다
    const r = D.ROLES[role], H = D.HIRING;
    const stats = {};
    for (const k of Object.keys(D.STATS)) stats[k] = randInt(s, H.otherMin, H.otherMax);
    stats[r.main] = clamp(Math.round(H.mainBase + repEff(s) / H.mainRepDiv + rand(s) * H.mainSpread + D.CAREERS[s.career].hireBonus), 1, 10);
    if (rand(s) < H.talentChance) {
      const others = Object.keys(D.STATS).filter((k) => k !== r.main);
      const t = pick(s, others);
      stats[t] = clamp(stats[t] + randInt(s, 2, 4), 0, 10);
    }
    return { name: personName(s), role, stats, level: 1 };
  }

  /* ---------- 콤보 ---------- */
  SIM.combos = (s) => {
    const out = {};
    for (const c of D.COMBOS) out[c.id] = new Set();
    for (const f of facList(s)) {
      for (const [fx, fy] of SIM.cellsOf(f)) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const g = SIM.facilityAt(s, fx + dx, fy + dy);
          if (!g || g.id === f.id || g.buildLeft) continue;
          for (const c of D.COMBOS) if (f.type === c.a && (g.type === c.b || (c.b === 'kennel' && g.type === 'bigkennel'))) out[c.id].add(g.id);
        }
      }
    }
    return out;
  };

  function checkNewCombos(s, events) {
    const ds = SIM.decorCombos(s);
    for (const c of D.DECOR_COMBOS) {
      if (ds.has(c.id) && !s.combosFound.includes(`d-${c.id}`)) {
        s.combosFound.push(`d-${c.id}`);
        s.reputation += 3;
        events.push({ type: 'popup', title: '꾸밈 콤보 발견!', body: `${c.name}\n${c.desc}` });
      }
    }
    const cs = SIM.combos(s);
    for (const c of D.COMBOS) {
      if (cs[c.id].size && !s.combosFound.includes(c.id)) {
        s.combosFound.push(c.id);
        s.reputation += 5;
        events.push({ type: 'popup', title: '콤보 발견!', body: `${c.name}\n${c.desc}` });
      }
    }
  }

  /* ---------- 유행 ---------- */
  function trendPhase(s) {
    const t = s.trend;
    if (!t || s.day < t.viralDay) return 'calm';
    if (s.day < t.viralDay + 60) return 'viral';
    if (s.day < t.waveStart) return 'boom';
    if (s.day < t.waveEnd) return 'wave';
    return 'calm';
  }
  SIM.trendPhase = trendPhase;

  const wants = (s, species) => !s.speciesPolicy || s.speciesPolicy === 'both' || s.speciesPolicy === species;
  SIM.wants = wants;
  // 고른 종의 길고양이·유기견 비중(품종 가중치 합 기준)
  SIM.speciesShare = (s) => {
    if (!s.speciesPolicy || s.speciesPolicy === 'both') return 1;
    const all = Object.values(D.BREEDS).filter((b) => b.species !== 'exotic').reduce((t, b) => t + b.base, 0);
    return Object.values(D.BREEDS).filter((b) => b.species === s.speciesPolicy).reduce((t, b) => t + b.base, 0) / all;
  };
  function chooseBreed(s) {
    const keys = Object.keys(D.BREEDS).filter((k) => D.BREEDS[k].species !== 'exotic' && wants(s, D.BREEDS[k].species));
    const wave = trendPhase(s) === 'wave';
    return weighted(s, keys, (k) => D.BREEDS[k].base + (wave && k === s.trend.breed ? D.TREND.waveWeight * s.trend.intensity : 0));
  }

  /* ---------- 동물 들어오기 ---------- */
  SIM.ageLabel = (days) => {
    const m = Math.floor(days / 30);
    return m < 12 ? `${Math.max(1, m)}개월` : `${Math.floor(m / 12)}살`;
  };
  SIM.ageGroup = (a) => (a.ageDays < 365 ? D.AGE.groups[0] : a.ageDays >= 96 * 30 ? D.AGE.groups[2] : D.AGE.groups[1]);
  SIM.ageAdopt = (a) => { const y = a.ageDays / 365; return (D.AGE.adoptCurve.find(([lim]) => y < lim) || [0, 0.25])[1]; };
  SIM.ageName = (a) => D.AGE.names[a.species][SIM.ageGroup(a).key];
  // 들어올 때 나이는 추정값이다. 보호소에서 태어난 아이만 정확하다
  SIM.ageText = (a) => `${a.bornHere ? '' : '추정 '}${SIM.ageLabel(a.ageDays)} (${SIM.ageName(a)})`;

  function makeAnimal(s, breedKey, quiet, opts) {
    const b = D.BREEDS[breedKey];
    const closed = !quiet && !opts.returned && rand(s) < 0.2;
    const injured = !quiet && !opts.returned && rand(s) < D.INJURY.rate;
    const trendy = s.trend && breedKey === s.trend.breed && ['boom', 'wave'].includes(trendPhase(s));
    const fat = b.species === 'dog' && !quiet && rand(s) < (trendy ? D.DIET.trendRate : D.DIET.rate);
    const g = weighted(s, D.AGE.groups, (x) => x.w);
    let cost = injured ? randInt(s, D.INJURY.cost[0] / 100_000, D.INJURY.cost[1] / 100_000) * 100_000 : 0;
    if (s.intakePolicy === 'care') cost = Math.round(cost * 0.8 / 100_000) * 100_000;
    const ageDays = opts.ageDays || randInt(s, g.months[0], g.months[1]) * 30;
    const sex = b.femaleOnly || rand(s) < 0.5 ? 'F' : 'M';
    const adult = ageDays >= D.MEDICAL.neuter.minDays;
    const exotic = b.species === 'exotic';
    const neutered = exotic ? null : adult && rand(s) < D.MEDICAL.intake.neutered;
    const vaccinated = ageDays >= D.MEDICAL.vaccine.minDays && rand(s) < D.MEDICAL.intake.vaccinated;
    const pregnant = !quiet && !exotic && !opts.returned && sex === 'F' && adult && !neutered && ageDays < 96 * 30 && rand(s) < D.PREGNANCY.rate;
    return {
      allergy: !exotic && rand(s) < D.ALLERGY.rate ? { cause: pick(s, D.ALLERGY.causes), known: false } : null,
      sex, neutered, vaccinated, pregnant, dueIn: pregnant ? randInt(s, D.PREGNANCY.dueDays[0], D.PREGNANCY.dueDays[1]) : 0, nursingLeft: 0,
      id: s.nextId++, name: opts.name || freeName(s), breed: breedKey, species: b.species, home: null,
      ageDays,
      health: injured ? randInt(s, 10, 25) : randInt(s, 30, 70),
      trust: closed ? 0 : opts.returned ? 30 : randInt(s, 15, 45), social: randInt(s, 20, 50),
      closed, opened: false, days: 0, returned: !!opts.returned, fat, dietDays: 0,
      coat: opts.coat ?? pickCoat(s, breedKey),
      injured, surgeryCost: cost,
      // 털이 긴 품종은 길에서 오면 수북한 채 들어오는 일이 많다(미용 뒤 지난 날 수)
      furDays: D.GROOM.breeds.includes(breedKey) ? (!quiet && !opts.returned && rand(s) < D.GROOM.intakeShaggy ? D.GROOM.shaggyDays + randInt(s, 0, 30) : randInt(s, 0, 25)) : 0,
      freshDays: 0,
    };
  }
  const needsCare = (a) => a.injured || (a.closed && !a.opened) || a.fat;

  function sendAway(s, a, events, why) {
    const npc = pick(s, D.NPCS).name;
    const bn = D.BREEDS[a.breed].name;
    if (why === 'declined') {
      s.stats.declined++;
      s.reputation = Math.max(0, s.reputation - 0.5);
      if (events) events.push({ type: 'toast', text: `${bn} ${j(a.name, '을를')} ${j(npc, '으로')} 안내했어요` });
    } else {
      s.stats.transferred++; s.ledger.transferred++;
      s.reputation = Math.max(0, s.reputation - 1 - s.buffs.filter((b) => b.transfer && b.until > s.day).reduce((t, b) => t + b.transfer, 0));
      if (events) events.push({ type: 'toast', text: `자리가 없어요. ${bn} 한 마리를 ${j(npc, '으로')} 보냈어요` });
      pushFeed(s, `더 받을 자리가 없어 ${j(bn, '이가')} ${j(npc, '으로')} 옮겨 갔다`, 'warn');
    }
  }

  // 자리를 찾아 실제로 들인다
  // 아이마다 짧은 이야기(지도에서 아이를 누르면 보인다). 최근 6줄만 남긴다
  function story(s, a, text) {
    a.story = a.story || [];
    a.story.push(`${SIM.dateLabel(s.day).replace(/ · .*$/, '')} ${text}`);
    if (a.story.length > 6) a.story.splice(1, 1);   // 첫 줄(들어온 경위)은 남긴다
  }
  SIM.story = story;

  // 도감: 만난 품종과 털색
  function dexAdd(s, a) {
    s.dex = s.dex || {};
    const d = (s.dex[a.breed] = s.dex[a.breed] || []);
    const c = a.coat || 0;
    if (!d.includes(c)) d.push(c);
  }
  function admit(s, a, events) {
    const b = D.BREEDS[a.breed];
    const home = freeHome(s, b.species, a.breed);
    if (!home) {
      // 자리가 없으면 자리가 있는 다른 지점(본점·분점)으로 보낸다. 평판 감점 없음
      const here = s.siteId;
      for (const id of SIM.siteIds(s)) {
        if (id === here) continue;
        const moved = SIM.withSite(s, id, () => {
          if (D.BRANCH_TRAITS[s.siteTrait] && D.BRANCH_TRAITS[s.siteTrait].species && D.BRANCH_TRAITS[s.siteTrait].species !== b.species) return false;
          const h = freeHome(s, b.species, a.breed);
          if (!h) return false;
          a.home = h; s.animals.push(a); s.stats.rescued++; s.ledger.rescued++;
          if (!a.story) story(s, a, '자리가 넉넉한 지점으로 와서 지내게 됐다');
          return true;
        });
        if (moved) { if (events) events.push({ type: 'toast', text: `${j(a.name, '은는')} 자리가 있는 ${SIM.siteLabel(s, id)}으로 갔어요` }); return a; }
      }
      sendAway(s, a, events, 'full');
      return null;
    }
    a.home = home;
    s.animals.push(a);
    s.stats.rescued++; s.ledger.rescued++;
    if (SIM.projectActive(s, 'rescue')) s.reputation += 1;
    dexAdd(s, a);
    if (!a.story) story(s, a, a.returned ? '새 가족과 맞지 않아 다시 돌아왔다' : a.how === 'doorstep' ? '아침에 보호소 문 앞에서 발견됐다' : a.how === 'forced' ? '지자체 위탁으로 들어왔다' : a.how === 'farm' ? '문을 닫은 번식장에서 구조됐다' : a.closed ? '사람을 피하던 채로 길에서 구조됐다' : a.injured ? '다친 채 길에서 구조됐다' : '길에서 구조됐다');
    if (a.injured) s.pending.push({ kind: 'injury', id: a.id });
    if (events) {
      let text = `길에서 온 ${b.name} ${j(a.name, '이가')} 들어왔어요`;
      if (a.closed) text = `마음을 닫은 ${b.name} ${j(a.name, '이가')} 들어왔어요`;
      if (a.fat) text = `살이 많이 찐 ${b.name} ${j(a.name, '이가')} 들어왔어요. 다이어트가 필요해요`;
      if (a.pregnant) text = `배가 부른 ${b.name} ${j(a.name, '이가')} 들어왔어요. 곧 출산할 것 같아요`;
      if (a.injured) text = `크게 다친 ${b.name} ${j(a.name, '이가')} 들어왔어요`;
      if (a.returned) text = `${j(a.name, '이가')} 다시 돌아왔어요`;
      events.push({ type: 'toast', text });
      events.push({ type: 'intake', animal: a.id });
    }
    return a;
  }

  // opts.forced = 지자체 위탁처럼 거절할 수 없는 입소
  function intakeAnimal(s, breedKey, quiet, events, opts = {}) {
    // 고양이 출산기(봄~여름): 길에서 오는 고양이 중 아기 고양이 비중이 커진다
    if (!quiet && !opts.returned && !opts.ageDays && D.BREEDS[breedKey].species === 'cat' && rand(s) < D.SEASONS[SIM.season(s.day)].kitten) opts = { ...opts, ageDays: randInt(s, 40, 100) };
    if (!quiet && !opts.ageDays && s.siteTrait === 'senior' && rand(s) < D.BRANCH_TRAITS.senior.senior) opts = { ...opts, ageDays: randInt(s, 96, 150) * 30 };   // 노령 전문 분점
    const a = makeAnimal(s, breedKey, quiet, opts);
    if (opts.how) a.how = opts.how;
    if (quiet || opts.returned || opts.forced) return admit(s, a, events);
    if (s.intakePolicy === 'healthy' && needsCare(a)) { sendAway(s, a, events, 'declined'); return null; }
    if (s.intakePolicy === 'ask') { s.pending.push({ kind: 'intake', animal: a }); return null; }
    return admit(s, a, events);
  }

  /* ---------- 물품 ---------- */
  SIM.dailyNeed = (s) => {
    const known = (a) => a.allergy && a.allergy.known;
    const dogs = s.animals.filter((a) => a.species === 'dog' && !a.fat && !known(a)).length;
    const fat = s.animals.filter((a) => a.fat && !known(a)).length;
    const cats = s.animals.filter((a) => a.species === 'cat' && !known(a)).length;
    const allergic = s.animals.filter(known).length;
    const exo = s.animals.filter((a) => a.species === 'exotic').length;
    const sick = s.animals.filter((a) => a.health < 50).length;
    const all = dogs + fat + cats + exo + allergic;
    const cs = SIM.combos(s);
    const comboDogs = s.animals.filter((a) => a.species === 'dog' && !a.fat && cs.feed.has(a.home)).length;
    const dogCut = dogs ? 1 - 0.2 * comboDogs / dogs : 1;
    const store = (has(s, 'storage') ? 0.85 : 1) * (upAny(s, 'storage', 2) ? 0.9 : 1);
    const need = {};
    for (const [k, it] of Object.entries(D.ITEMS)) {
      const p = it.per;
      need[k] = ((p.dog || 0) * (dogs * dogCut + exo * 0.6) + (p.fat || 0) * fat + (p.allergic || 0) * allergic + (p.cat || 0) * cats + (p.all || 0) * all + (p.sick || 0) * sick) * store;
      if (k === 'toys' && hasYardItem(s, 'balls')) need[k] *= 1 + D.YARD_ITEMS.balls.toys;   // 공 바구니
    }
    return need;
  };
  SIM.daysLeft = (s, item, need) => {
    const n = (need || SIM.dailyNeed(s))[item];
    return n > 0 ? s.inv[item] / n : Infinity;
  };

  SIM.buy = (s, item, packs, auto) => {
    const it = D.ITEMS[item];
    const cost = it.price * packs * (auto && !upAny(s, 'storage', 3) ? D.AUTO_BUY.markup : 1);
    if (s.money < cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'items', cost);
    s.inv[item] += it.pack * packs;
    return { ok: true };
  };

  function consume(s, ev) {
    const need = SIM.dailyNeed(s);
    const short = {};
    for (const [k, n] of Object.entries(need)) {
      if (n <= 0) continue;
      if (s.inv[k] >= n) s.inv[k] -= n;
      else { s.inv[k] = 0; short[k] = true; }
    }
    // 자동 구입이 꺼진 채 필수 물품이 바닥나면 원인을 바로 알려 주고 켤 수 있게 한다(30일에 한 번)
    if (!s.autoBuy && Object.keys(short).some((k) => !D.ITEMS[k].optional) && s.day - (s.stockoutAsked ?? -99) >= 30 && !s.pending.some((p) => p.kind === 'stockout')) {
      s.stockoutAsked = s.day;
      s.pending.push({ kind: 'stockout', items: Object.keys(short).filter((k) => !D.ITEMS[k].optional) });
    }
    // 처음 바닥난 날과 그 뒤 열흘마다 알린다
    for (const k of Object.keys(short)) {
      if (D.ITEMS[k].optional) continue;
      if (!s.shortNotice[k] || s.day - s.shortNotice[k] >= 10) {
        s.shortNotice[k] = s.day;
        ev.push({ type: 'toast', text: `${j(D.ITEMS[k].name, '이가')} 떨어졌어요. ${D.ITEMS[k].lack}` });
        pushFeed(s, `[알림] ${j(D.ITEMS[k].name, '이가')} 떨어졌다. ${D.ITEMS[k].lack}`, 'warn');   // 토스트만으로는 놓치기 쉽다
      }
    }
    if (s.autoBuy) {
      for (const k of Object.keys(D.ITEMS)) {
        const target = k === 'carriers' ? 2 : need[k] * D.AUTO_BUY.targetDays;
        const low = k === 'carriers' ? s.inv[k] < 1 : need[k] > 0 && s.inv[k] < need[k] * D.AUTO_BUY.belowDays;
        if (!low) continue;
        const packs = Math.max(1, Math.ceil((target - s.inv[k]) / D.ITEMS[k].pack));
        SIM.buy(s, k, packs, true);
      }
    }
    return short;
  }

  function donations(s) {
    let p = Math.min(0.6, s.donors / 250 + repEff(s) / 2000);
    if (activeCampaign(s, 'wishlist')) p = Math.min(0.9, p * 2);
    if (rand(s) >= p) return;
    const d = weighted(s, D.DONATED, (x) => x.w);
    const q = randInt(s, d.qty[0], d.qty[1]);
    s.inv[d.item] += q;
    s.goodsLog.unshift({ day: s.day, text: `${d.text} ${q}${D.ITEMS[d.item].unit}` });
    if (s.goodsLog.length > 30) s.goodsLog.length = 30;
    if (rand(s) < 0.25) pushFeed(s, `후원자님이 ${j(d.text, '을를')} 보내 주셨다`, 'good');
  }

  /* ---------- 보호소 앞에 두고 간 아이 ---------- */
  function doorstep(s, ev) {
    const c = pick(s, D.DOORSTEP.cases);
    const n = randInt(s, c.n[0], c.n[1]);
    const keys = Object.keys(D.BREEDS).filter((k) => D.BREEDS[k].species === c.species && D.BREEDS[k].base > 0);
    const breed = weighted(s, keys, (k) => D.BREEDS[k].base);
    let away = 0;
    for (let i = 0; i < n; i++) {
      const ageDays = c.baby ? randInt(s, 20, 50) : c.senior ? randInt(s, 110, 150) * 30 : undefined;
      const a = makeAnimal(s, breed, false, { ageDays });
      a.how = 'doorstep';
      if (c.baby) { a.pregnant = false; a.injured = false; a.health = randInt(s, 35, 55); a.trust = randInt(s, 30, 50); }
      if (!admit(s, a, null)) away++;
    }
    s.stats.doorstep += n;
    ev.push({ type: 'popup', title: '보호소 앞에 두고 간 아이', body: c.text(n) + (away ? `\n${away === n ? '맞는 집에 자리가 없어' : `${away}마리는 자리가 없어`} 이웃 보호소로 보냈어요.` : '') });
    pushFeed(s, '보호소 앞에 동물을 두고 간 일이 또 생겼다', 'warn');
  }

  /* ---------- 알러지 ---------- */
  function allergyFlare(s, a, ev) {
    a.allergy.known = true;
    a.health = clamp(a.health - D.ALLERGY.healthDrop, 0, 100);
    const cost = Math.round(D.ALLERGY.checkCost * (SIM.inHouse(s) ? D.MEDICAL.inHouse : 1));
    expense(s, 'medical', cost);
    ev.push({ type: 'popup', title: '알러지였어요', body: `${j(a.name, '이가')} 사료를 먹고 온몸을 긁으며 토했어요.\n검사해 보니 ${a.allergy.cause} 알러지였어요. 사료에 ${j(a.allergy.cause, '이가')} 들어 있었어요.\n검사·치료비 ${won(cost)} · 앞으로는 저알러지 처방식이 필요해요.` });
    pushFeed(s, `${a.name}의 숨은 ${a.allergy.cause} 알러지를 찾아냈다`, 'warn');
  }

  /* ---------- 출산 ---------- */
  function giveBirth(s, mom, ev) {
    const b = D.BREEDS[mom.breed];
    const n = randInt(s, D.PREGNANCY.litter[mom.species][0], D.PREGNANCY.litter[mom.species][1]);
    mom.pregnant = false;
    mom.nursingLeft = D.PREGNANCY.nursingDays;
    const names = [];
    for (let i = 0; i < n; i++) {
      // 새끼는 어미 곁에서 지낸다(정원을 넘을 수 있다)
      const baby = {
        id: s.nextId++, name: freeName(s), breed: mom.breed, species: mom.species, home: mom.home,
        sex: b.femaleOnly || rand(s) < 0.5 ? 'F' : 'M', neutered: false, vaccinated: false, pregnant: false, dueIn: 0, nursingLeft: 0,
        ageDays: 0, bornHere: true, health: 60, trust: 70, social: 40,
        story: [`${SIM.dateLabel(s.day).replace(/ · .*$/, '')} 보호소에서 ${mom.name}의 아기로 태어났다`],
        coat: rand(s) < 0.6 ? (mom.coat || 0) : pickCoat(s, mom.breed),
        closed: false, opened: false, days: 0, returned: false, fat: false, dietDays: 0, injured: false, surgeryCost: 0,
      };
      s.animals.push(baby);
      names.push(baby.name);
    }
    s.stats.born += n;
    s.reputation += 3;
    ev.push({ type: 'popup', title: '새 생명이 태어났어요', body: `${j(mom.name, '이가')} ${b.name} 새끼 ${n}마리를 낳았어요.\n${names.join(', ')}\n두 달 동안은 엄마 곁에서 지내요.` });
    pushFeed(s, `보호소에서 ${b.name} 새끼 ${n}마리가 태어났다`, 'good');
  }

  /* ---------- 진료: 예방접종·중성화 ---------- */
  SIM.inHouse = (s) => has(s, 'clinic') && s.staff.some((x) => x.role === 'vet');
  SIM.medCost = (s, a, kind) => {
    let c = D.MEDICAL[kind].cost[a.species];
    if (c != null && kind === 'neuter' && a.sex === 'F') c += D.MEDICAL.neuter.femaleExtra;   // 여아 중성화는 개복 수술이라 더 비싸다(v0.15)
    return c == null ? null : Math.round(c * (SIM.inHouse(s) ? D.MEDICAL.inHouse : 1) * (kind === 'neuter' && hasBuff(s, 'neuterWeek') ? 0.5 : 1));   // 봄 중성화 주간
  };
  SIM.needs = (a, kind) => {
    if (kind === 'vaccine') return !a.vaccinated && a.ageDays >= D.MEDICAL.vaccine.minDays;
    return a.species !== 'exotic' && !a.neutered && a.ageDays >= D.MEDICAL.neuter.minDays && !a.pregnant && !a.nursingLeft && !a.injured;
  };
  function treat(s, a, kind) {
    const cost = SIM.medCost(s, a, kind);
    if (cost == null || !SIM.needs(a, kind)) return { ok: false };
    if (s.money < cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'medical', cost);
    if (kind === 'vaccine') a.vaccinated = true; else { a.neutered = true; a.coneDays = D.MEDICAL.neuter.coneDays; }   // 수술 뒤 넥카라(그림만, 능력치 영향 없음)
    return { ok: true, msg: `${a.name} ${D.MEDICAL[kind].name} 완료 (${won(cost)})` };
  }
  SIM.isShaggy = (a) => D.GROOM.breeds.includes(a.breed) && (a.furDays || 0) >= D.GROOM.shaggyDays;
  SIM.isFresh = (a) => (a.freshDays || 0) > 0;
  function groomAnimal(s, a, ev, by) {
    a.furDays = 0;
    a.freshDays = D.GROOM.freshDays;
    a.groomedDay = s.day;
    s.awareness += D.GROOM.aware;
    s.stats.groomed = (s.stats.groomed || 0) + 1;
    story(s, a, `${by ? `${by}의 손에` : '바깥 미용실에서'} 털을 다듬고 새 모습이 됐다`);
    pushFeed(s, `${a.name}의 미용 전·후 사진이 공유되고 있다`, 'good');
    if (ev) ev.push({ type: 'toast', text: `${a.name} 미용 완료! 한동안 입양 문의가 늘어요` });
  }
  // 미용사가 없을 때 아이 카드에서 바깥 미용을 맡긴다
  SIM.groomOut = (s, id) => {
    const a = s.animals.find((x) => x.id === id);
    if (!a || !SIM.isShaggy(a)) return { ok: false };
    if (s.money < D.GROOM.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'medical', D.GROOM.cost);
    const ev = [];
    groomAnimal(s, a, ev, null);
    return { ok: true, msg: `${a.name} 바깥 미용 완료 (${won(D.GROOM.cost)})`, events: ev };
  };
  SIM.treat = (s, id, kind) => {
    const a = s.animals.find((x) => x.id === id);
    return a ? treat(s, a, kind) : { ok: false };
  };
  SIM.setAutoMed = (s, on) => { s.autoMed = on; return { ok: true }; };
  // 진료실과 수의사가 있으면 수의사 한 명이 하루에 한 건씩 처리한다(자금이 넉넉할 때만)
  function autoMedical(s, ev) {
    if (!s.autoMed || !SIM.inHouse(s)) return;
    let slots = s.staff.filter((x) => x.role === 'vet').length;
    for (const kind of ['vaccine', 'neuter']) {
      for (const a of s.animals) {
        if (!slots) return;
        if (!SIM.needs(a, kind)) continue;
        const cost = SIM.medCost(s, a, kind);
        if (s.money < cost + 500_000) return;
        if (treat(s, a, kind).ok) slots--;
      }
    }
  }

  /* ---------- 하루 진행 ---------- */
  // 입양 한 건 처리(이동장·책임비·앨범·파양 예약). 성공하면 true
  function adoptOne(s, a, ev, opts = {}) {
    const fee = D.ADOPT_FEES[s.feeLevel];
    if (s.inv.carriers < 1) {
      if (!s.shortNotice.carrierAdopt || s.day - s.shortNotice.carrierAdopt >= 10) {
        s.shortNotice.carrierAdopt = s.day;
        ev.push({ type: 'toast', text: `${a.name}의 새 가족이 왔는데 이동장이 없어요` });
      }
      return false;
    }
    s.inv.carriers--;
    s.animals = s.animals.filter((x) => x !== a);
    if (a.species === 'exotic') {
      s.stats.placed++;
      s.reputation += 6;
      ev.push({ type: 'adopt', animal: a.id, text: `${D.BREEDS[a.breed].name} ${j(a.name, '이가')} 전문 보호시설로 떠났어요` });
      pushFeed(s, `${D.BREEDS[a.breed].name} ${j(a.name, '이가')} 넓은 전문 보호시설에서 새 삶을 시작했다`, 'good');
      return true;
    }
    s.stats.adopted++; s.ledger.adopted++; s.ledger.stayDays += a.days;
    if (SIM.ageGroup(a).key === 'senior') s.stats.seniorAdopted = (s.stats.seniorAdopted || 0) + 1;
    if (fee.fee) income(s, 'fee', fee.fee);
    const gift = Math.round(randInt(s, 10, 30) * D.ADOPT_GIFT_MULT) * 10_000;
    income(s, 'gift', gift);
    s.reputation += (a.closed ? 5 : 2) + (SIM.ageGroup(a).key === 'senior' ? D.AGE.seniorRep * (s.siteTrait === 'senior' ? 2 : 1) : 0);
    const willReturn = a.trust < 75 && rand(s) < fee.returnRate * 3 * (!a.neutered && a.ageDays >= D.MEDICAL.neuter.minDays ? 1.5 : 1) * (opts.bonded ? D.VISIT.bondReturn : 1) * (upAny(s, 'adoption', 2) ? 0.7 : 1) * (hasBuff(s, 'giftCampaign') ? 0.5 : 1);
    s.album.unshift({ id: a.id, name: a.name, breed: a.breed, coat: a.coat, day: s.day, ageDays: a.ageDays, news: [], next: 0,
      returnDay: willReturn ? s.day + randInt(s, 30, 90) : null, closed: a.closed, family: opts.family || null, letters: [] });
    if (s.album.length > 80) s.album.length = 80;
    ev.push({ type: 'adopt', animal: a.id, breed: a.breed, name: a.name, coat: a.coat, family: opts.family || null, text: `${a.name} 입양! (책임비 ${won(fee.fee)} · 후원 ${won(gift)})` });
    if (opts.family) pushFeed(s, `${j(opts.family, '이가')} 교감 끝에 ${a.name}의 가족이 되었다`, 'good', 'adopt');
    else pushFeed(s, a.closed ? `한때 마음을 닫았던 ${j(a.name, '이가')} 새 가족을 만났다` : SIM.ageGroup(a).key === 'senior' ? `${SIM.ageLabel(a.ageDays)} ${j(a.name, '이가')} 새 가족을 만났다. 노령 입양 이야기가 공유되고 있다` : `${a.name}의 새 가족이 입양 후기를 올렸다`, 'good', 'adopt');
    return true;
  }

  // 방문자: 하루 한 번 확률로 가족이 찾아와 아이 하나와 교감한다
  function visitorTick(s, ev) {
    const V = D.VISIT;
    if (s.day < V.fromDay || s.day < (s.visitNext || 0) || s.pending.some((p) => p.kind === 'visit')) return;
    const rate = V.base * (1 + s.awareness / 100 + repEff(s) / 600) * (has(s, 'adoption') ? V.adoptionRoom : 1) * (1 + SIM.moodEffect(s).visit);
    if (rand(s) >= rate) return;
    const pool = s.animals.filter((a) => a.species !== 'exotic' && !a.reservedBy && !a.closed && a.trust >= V.minTrust && !a.injured && !a.pregnant && !a.nursingLeft);
    if (!pool.length) return;
    const fam = pick(s, V.families);
    // 가족마다 끌리는 나이대가 있다(노부부는 노령 동물, 아이 있는 집은 어린 동물)
    const a = weighted(s, pool, (x) => SIM.ageAdopt(x) * D.BREEDS[x.breed].adopt * (fam.likes === SIM.ageGroup(x).key ? V.likeBoost : 1) * (SIM.isReady(x) ? 2 : 1));
    const acts = V.acts[a.species] || V.acts.dog;
    const act = acts[randInt(s, 0, acts.length - 1)].replaceAll('{n}', j(a.name, '이가'));
    s.visitNext = s.day + V.cooldown;
    a.trust = Math.min(100, a.trust + V.trustGain);
    story(s, a, `${j(fam.name, '과와')} 함께 놀았다`);
    a.social = Math.min(100, a.social + V.socialGain);
    s.visitCount = s.visitCount || {};
    const times = (s.visitCount[fam.name] = (s.visitCount[fam.name] || 0) + 1);
    ev.push({ type: 'visit', animal: a.id, family: fam.name, again: times > 1 });
    if (rand(s) < V.wantRate * SIM.ageAdopt(a) * (fam.likes === SIM.ageGroup(a).key ? V.likeBoost : 1) * (SIM.decorCombos(s).has('garden') ? 1.1 : 1) * (upAny(s, 'adoption', 3) ? 1.2 : 1)) {
      s.pending.push({ kind: 'visit', animal: a.id, family: fam.name, act, ready: SIM.isReady(a), issues: SIM.readyIssues(a) });
    } else {
      ev.push({ type: 'toast', text: `${fam.name} 방문: ${act}` });
      pushFeed(s, `${j(fam.name, '이가')} 보호소에 들러 ${j(a.name, '과와')} 시간을 보냈다`, 'calm');
    }
  }

  // 바깥 사건(다른 보호소의 스캔들, 제도 변화). 아직 안 일어난 것 중 조건이 맞는 것을 고른다
  function externalEvent(s, monthIdx, ev) {
    const X = D.EXTERNAL;
    s.extDone = s.extDone || [];
    if (monthIdx < X.fromMonth || s.pending.some((p) => p.kind === 'external') || rand(s) >= X.monthlyChance) return;
    s.extDay = s.extDay || {};
    // 한 번 일어난 사건도 3년이 지나면 다시 일어날 수 있다(제도 변화 사건은 한 번만)
    const pool = X.events.filter((e) => (!s.extDone.includes(e.id) || (!e.needAfter && s.day - (s.extDay[e.id] || 0) > 3 * 360)) && (!e.needAfter || s.extDone.includes(e.needAfter)));
    if (!pool.length) return;
    const e = pick(s, pool);
    if (!s.extDone.includes(e.id)) s.extDone.push(e.id);
    s.extDay[e.id] = s.day;
    s.awareness = clamp(s.awareness + e.aware, 0, 100);
    if (e.donors) s.donors = Math.max(0, Math.round(s.donors * (1 + e.donors)));
    if (e.rep) s.reputation += e.rep;
    if (e.surge) s.buffs.push({ id: `surge-${e.id}`, until: s.day + e.surge.days, intake: e.surge.mult });
    if (e.transferPenalty) s.buffs.push({ id: 'transferPenalty', until: s.day + e.transferPenalty.days, transfer: e.transferPenalty.extra });
    if (e.lawCheck) {
      // 신고제: 비좁게(임시 거처) 운영 중이면 평판 -, 아니면 +
      const cramped = s.animals.some((a) => SIM.makeshift(s, a));
      s.reputation = Math.max(0, s.reputation + (cramped ? -8 : 6));
      e.extra = cramped ? '\n우리 보호소에는 비좁게 지내는 아이가 있어 평판이 깎였어요.' : '\n우리 보호소는 기준을 넉넉히 지켜 평판이 올랐어요.';
    }
    pushFeed(s, e.title, e.donors < 0 || e.aware < 0 ? 'warn' : 'good');
    s.pending.push({ kind: 'external', id: e.id, extra: e.extra || '' });
  }

  // 하루 입양 확률(아이 카드의 '입양 가능성'에도 쓴다). ctx 없이 부르면 오늘 기준으로 다시 계산한다
  SIM.adoptChance = (s, a, ctx = {}) => {
    const groom = ctx.groom ?? power(s, 'groom');
    const cs = ctx.cs || SIM.combos(s);
    const phase = ctx.phase || trendPhase(s);
    const fee = D.ADOPT_FEES[s.feeLevel];
    let p = (D.ADOPT_BASE || 0.03) * D.BREEDS[a.breed].adopt * (1 + repEff(s) / (D.REP_ADOPT_DIV || 400)) * fee.adopt * (1 + groom * 0.04) * (a.fat ? D.DIET.adoptMult : 1) * SIM.ageAdopt(a);
    if (SIM.isShaggy(a)) p *= D.GROOM.adoptShaggy; else if (SIM.isFresh(a)) p *= D.GROOM.adoptFresh;   // 미용(v0.12)
    p *= D.CAREERS[s.career].adoptMult || 1;   // 경력 난이도가 중반 이후에도 남게(v0.14: 일반인이 원장님과 같은 길을 갔다)
    if (has(s, 'adoption')) p *= 1.5;
    if (has(s, 'main')) p *= 1.15;                       // 본관 입양 상담
    p *= 1 + SIM.moodEffect(s).adopt;                    // 분위기
    p *= D.SEASONS[SIM.season(s.day)].adopt || 1;        // 가을 산책철
    if (has(s, 'rehab') && SIM.ageGroup(a).key === 'senior') p *= 1.3;   // 재활센터
    if (cs.meet.size) p *= 1.2;
    if (activeCampaign(s, 'adoptDay')) p *= 1.6;
    if (activeCelebs(s).length) p *= 1.3;
    for (const b of s.buffs) if (b.adopt && b.until > s.day && (!b.species || b.species === a.species)) p *= b.adopt;
    if (s.trend && a.breed === s.trend.breed && (phase === 'viral' || phase === 'boom')) p *= 1.4;
    p *= (D.BRANCH_TRAITS[s.siteTrait] || {}).adopt || 1;   // 입양 카페형 분점
    return Math.min(0.95, p);
  };

  // 다음 달 수지 예상(경영 탭). 확률로 들어오는 돈(입양 책임비·모금·물품)은 빼고 고정된 것만 센다
  SIM.monthForecast = (s) => {
    const inc = { 정기후원: s.donors * s.donorFee, 기업: s.corporate && s.corporate.until > s.day ? s.corporate.monthly : 0,
      보조금: s.subsidy ? D.SUBSIDY.monthly : 0, 채널: s.channel ? s.channel.subs * D.CHANNEL_PAY : 0, 굿즈: has(s, 'shop') ? SIM.goodsMonthly(s) : 0 };
    const out = { 급여: s.staff.reduce((t, x) => t + SIM.salary(x), 0),
      유지비: facList(s).reduce((t, f) => t + D.FACILITIES[f.type].upkeep * (D.UPKEEP_BY_LV[s.level] || 1), 0),
      대출: (s.loans || []).reduce((t, l) => t + l.remaining * D.LOAN_TERMS.monthlyRate + Math.min(l.remaining, l.amount / D.LOAN_TERMS.months), 0) };
    const sum = (o) => Object.values(o).reduce((t, v) => t + v, 0);
    return { inc, out, net: sum(inc) - sum(out) };
  };

  // 하루 진행(v0.9.1 분점): 화면에 떠 있는 곳과 상관없이 본점·분점을 차례로 맞바꿔 각자 하루를 보내고,
  // 보호소 전체 일(사업·계절·후원·보고서·달 정산)은 본점 기준으로 한 번만 한다
  SIM.tick = (s) => {
    if (s.closed) return [];   // 폐업한 보호소는 시간이 멈춘다
    const ev = [];
    s.day++;
    SIM.forEachSite(s, (isMain) => {
      const mark = ev.length, pend = s.pending.length;
      siteBuild(s, ev);
      if (isMain) globalA(s, ev);
      siteCore(s, ev, isMain);
      staffExp(s, ev);
      if (!isMain) branchPost(s, ev, mark, pend);
    });
    SIM.withSite(s, 'main', () => globalB(s, ev));
    return ev;
  };
  function siteBuild(s, ev) {
    for (const f of Object.values(s.facilities)) {
      if (!f.buildLeft) continue;
      f.buildLeft--;
      if (!f.buildLeft) {
        ev.push({ type: 'toast', text: `${D.FACILITIES[f.type].name} 완공!` });
        ev.push({ type: 'built', id: f.id });
        checkNewCombos(s, ev);
      }
    }
  }
  const today0 = (s) => SIM.dateOf(s.day);
  function globalA(s, ev) {
    projectTick(s, ev);
    if (has(s, 'edu')) s.awareness = clamp(s.awareness + 0.03, 0, 100);   // 교육관
    if (has(s, 'hall') && s.day % DPM === 0) s.reputation += 5;           // 명예의 전당
    goodsTick(s, ev);
    // 계절이 바뀌면 알린다
    if (SIM.season(s.day) !== SIM.season(s.day - 1)) {
      const se = D.SEASONS[SIM.season(s.day)];
      ev.push({ type: 'toast', text: se.msg });
      ev.push({ type: 'season', season: SIM.season(s.day) });
      pushFeed(s, se.msg, 'calm');
    }
    // 계절 행사(설·추석·연말·봄 중성화)
    for (const e of D.SEASON_EVENTS) if (today0(s).month === e.month && today0(s).dayOfMonth === e.day) {
      if (e.surge) { s.buffs.push({ id: `surge-${e.id}`, until: s.day + e.surge.days, intake: e.surge.mult }); ev.push({ type: 'popup', title: e.title, body: e.body }); }
      else s.pending.push({ kind: 'season', id: e.id });
    }
    // 이웃 보호소의 공동 구조 요청
    if (s.day % DPM === 10 && rand(s) < D.NEIGHBOR.askChance && !s.pending.some((p) => p.kind === 'neighbor')) {
      const npc = pick(s, D.NPCS);
      s.pending.push({ kind: 'neighbor', who: npc.name, n: randInt(s, D.NEIGHBOR.askN[0], D.NEIGHBOR.askN[1]) });
    }
    // 기념일(세계 고양이의 날 등)
    const today = SIM.dateOf(s.day);
    for (const d of D.DAYS) if (today.month === d.month && today.dayOfMonth === d.day && !s.pending.some((p) => p.kind === 'memorial')) s.pending.push({ kind: 'memorial', id: d.id });
  }
  function siteCore(s, ev, isMain) {
    const cs = SIM.combos(s);
    const phase = trendPhase(s);

    // 봉사자는 그날 60% 확률로 나온다
    const attending = new Set(s.staff.filter((st) => st.role !== 'volunteer' || rand(s) < 0.6).map((st) => st.id));
    const short = consume(s, ev);
    const heal = power(s, 'heal', attending) * (has(s, 'clinic') ? 1 : 0.4) * (short.meds ? 0.5 : 1);
    const train = power(s, 'train', attending);
    const care = power(s, 'care', attending);
    const groom = power(s, 'groom', attending);
    // 미용(v0.12): 출근한 미용사마다 가장 수북한 아이 한 명을 능력에 비례한 확률로 미용한다
    for (const st of s.staff) {
      if (st.role !== 'groomer' || !attending.has(st.id)) continue;
      const shaggy = s.animals.filter((a) => SIM.isShaggy(a) && !a.injured).sort((x, y) => y.furDays - x.furDays)[0];
      if (shaggy && rand(s) < Math.min(1, (st.stats.groom || 0) * lvl(st) / D.GROOM.perPower)) groomAnimal(s, shaggy, ev, st.name);
    }
    const n = Math.max(6, s.animals.length);
    const rainy = hasBuff(s, 'rain');
    const yardBig = 1 + D.MERGE.yardBonus * (Math.max(1, ...SIM.groups(s).yard.map((g) => g.len)) - 1);
    // 꾸밈·놀이기구 효과(v0.7)
    const dcs = SIM.decorCombos(s);
    const dogDecorHeal = 1 + (decorList(s, 'waterbowl').length ? 0.05 : 0) + (decorList(s, 'shade').length ? 0.05 : 0) + (dcs.has('summer') ? 0.1 : 0);
    const yardTrain = 1 + (hasYardItem(s, 'aframe') ? D.YARD_ITEMS.aframe.train : 0) + (hasYardItem(s, 'hurdle') ? D.YARD_ITEMS.hurdle.train : 0) + (dcs.has('course') || upAny(s, 'yard', 3) ? 0.2 : 0);
    const yardSocial = 1 + (hasYardItem(s, 'tunnel') ? D.YARD_ITEMS.tunnel.social : 0);
    const catTower = decorList(s, 'cattower').length > 0;
    const season = D.SEASONS[SIM.season(s.day)];
    const seasonHeal = season.heal;
    const rehab = upAny(s, 'clinic', 3);
    const rehabCenter = has(s, 'rehab');

    const births = [];
    for (const a of s.animals) {
      a.days++;
      a.ageDays++;
      if (a.nursingLeft) a.nursingLeft--;
      if (a.coneDays) a.coneDays--;
      if (a.freshDays) a.freshDays--;
      if (D.GROOM.breeds.includes(a.breed)) a.furDays = (a.furDays || 0) + 1;
      if (a.pregnant && --a.dueIn <= 0) births.push(a);
      const b = D.BREEDS[a.breed];
      const fac = s.facilities[a.home];
      const ms = SIM.makeshift(s, a) ? D.EXOTIC.makeshift : 1;   // 전용이 아닌 집(특수동물, 소형견사의 대형견)
      const healBonus = (cs.care.has(fac.id) || cs.catvet.has(fac.id)) ? 1.3 : 1;
      const heated = (fac.type === 'kennel' || fac.type === 'bigkennel') && SIM.facLevel(fac) >= 2;   // 바닥 난방
      const decorHeal = (a.species === 'dog' ? dogDecorHeal : 1) * (heated ? Math.max(1, seasonHeal) : seasonHeal) * (rehab ? 1.2 : 1) * (rehabCenter && (a.injured || SIM.ageGroup(a).key === 'senior') ? 1.3 : 1);
      let starving = (a.species === 'dog' && short.dogFood) || (a.species === 'cat' && short.catFood);
      if (a.allergy && a.allergy.known) starving = !!short.hypoFood;
      if (a.allergy && !a.allergy.known && !starving && rand(s) < D.ALLERGY.flare * (has(s, 'lab') ? 0.5 : 1)) allergyFlare(s, a, ev);
      if (starving) a.health = clamp(a.health - 1, 0, 100);
      else a.health = clamp(a.health + (0.4 + (heal * 4.8 / n) * healBonus + care * 0.5 / n) * ms * decorHeal, 0, a.injured ? 30 : 100);
      let tg = 0.25 + train * 3 / n + care * 0.6 / n;
      if (a.closed && !a.opened) tg *= 0.5 * (s.resolve ? D.RESOLVE.closedTrust : 1);
      if (short.towels) tg *= 0.6;
      if ((a.species === 'cat' && !short.churu) || (a.species === 'dog' && !a.fat && !short.dogchew)) tg *= 1.2;
      // 산책장 = 훈련장: 개는 산책장에서 훈련받으며 신뢰가 오른다(훈련사가 있으면 더)
      if (a.species === 'dog' && has(s, 'yard')) tg += D.YARD.trainTrust * yardBig * (train > 0 ? D.YARD.trainerBoost : 1) * yardTrain;
      if (fac.type === 'cattery' && SIM.facLevel(fac) >= 3) tg *= a.closed && !a.opened ? 2 : 1.1;   // 창가 해먹
      a.trust = clamp(a.trust + tg * ms, 0, 100);
      let sg = 0.2 + train * 1.8 / n + care * 0.6 / n + (short.toys ? 0 : 0.15);
      if (a.species === 'dog' && has(s, 'yard')) sg += 0.6 * b.energy * yardBig * (cs.walk.has(fac.id) ? 1.3 : 1) * yardSocial;
      if (a.species === 'cat' && catTower) sg *= 1.1;
      // 활동량이 많은 품종은 뛸 곳이 없으면 사회성이 덜 오른다
      else if (a.species === 'dog' && b.energy > 1) sg -= D.YARD.restless * (b.energy - 1);
      if (rainy) sg *= upAny(s, 'yard', 2) ? 0.8 : 0.5;   // 잔디 관리
      if ((fac.type === 'kennel' || fac.type === 'bigkennel') && SIM.facLevel(fac) >= 3) sg *= 1.1;
      if (fac.type === 'cattery' && SIM.facLevel(fac) >= 2) sg *= 1.15;
      if (a.fat) sg *= D.DIET.socialMult;
      a.social = clamp(a.social + sg * ms, 0, 100);
      if (a.fat && !short.dietFood) {
        a.dietDays += a.species === 'dog' && has(s, 'yard') && rand(s) < D.YARD.dietBoost ? 2 : 1;   // 산책장 운동
        if (a.dietDays >= D.DIET.days) {
          a.fat = false;
          s.stats.diets++;
          s.reputation += s.intakePolicy === 'care' ? 4 : 2;
          ev.push({ type: 'toast', text: `${a.name} 다이어트 성공! 몸이 가벼워졌어요` });
          story(s, a, '다이어트에 성공했다');
          pushFeed(s, `${a.name}의 다이어트 전후 사진이 화제다`, 'good');
        }
      }
      if (a.closed && !a.opened && a.trust >= 40) {
        a.opened = true;
        story(s, a, '처음으로 꼬리를 흔들며 마음을 열었다');
        s.stats.opened = (s.stats.opened || 0) + 1;
        s.reputation += s.intakePolicy === 'care' ? 6 : 4;
        if (!s.seen.opened) { s.seen.opened = true; ev.push({ type: 'popup', title: '마음을 열었어요', body: `${j(a.name, '이가')} 처음으로 꼬리를 흔들었어요.\n이제부터는 아이 머리 위 하트와 SNS 소식으로 알려 드려요.` }); }
        else ev.push({ type: 'toast', text: `${j(a.name, '이가')} 마음을 열었어요` });
        ev.push({ type: 'emote', id: a.id, key: 'heart' });
        pushFeed(s, `마음을 닫았던 ${j(a.name, '이가')} 사람 손에 머리를 기댔다`, 'good');
      }
    }
    if (short.pads || short.litter) s.reputation = Math.max(0, s.reputation - 0.15);
    for (const m of births) giveBirth(s, m, ev);
    // 무지개다리(비유): 평균 수명을 넘긴 아이가 아주 드물게 조용히 떠난다
    for (const a of [...s.animals]) {
      const life = D.BREEDS[a.breed].life;
      if (!life || a.ageDays < life[0] * 365 || rand(s) >= D.RAINBOW.perDay * (1 + (a.ageDays / 365 - life[0]))) continue;
      s.animals = s.animals.filter((x) => x !== a);
      s.memories = s.memories || [];
      s.memories.unshift({ name: a.name, breed: a.breed, coat: a.coat, day: s.day, ageDays: a.ageDays, days: a.days });
      s.stats.rainbow = (s.stats.rainbow || 0) + 1;
      ev.push({ type: 'popup', title: '무지개다리', body: `${j(a.name, '이가')} 따뜻한 담요 위에서 긴 낮잠에 들었어요.\n${s.shelterName}에서 ${a.days}일, 사랑받으며 지냈어요.\n'추억' 앨범에 이름을 남겨 둘게요.` });
      pushFeed(s, `${j(a.name, '이가')} 무지개다리를 건넜다. 함께한 시간을 기억한다`, 'calm');
      ev.push({ type: 'adopt', animal: a.id, text: `${a.name}, 고마웠어` });
    }
    autoMedical(s, ev);

    // 봉사자의 실수: 돌봄이 낮고 경험이 적을수록 잦다. 교육을 받으면 절반
    for (const st of s.staff) {
      if (st.role !== 'volunteer' || !attending.has(st.id)) continue;
      const rate = D.VOLUNTEER.mistakeRate * (1 - st.stats.care / 12) * (1 - (st.level - 1) * 0.15) * (st.trained ? 0.5 : 1);
      if (rand(s) >= rate) continue;
      const fats = s.animals.filter((a) => a.fat);
      const kinds = ['leash', 'bag', 'snack'].concat(fats.length ? ['overfeed', 'overfeed'] : []);
      const kind = pick(s, kinds);
      const m = D.VOLUNTEER.mistakes[kind];
      const a = kind === 'overfeed' ? pick(s, fats) : pick(s, s.animals.length ? s.animals : [{ name: '아이' }]);
      st.mistakes++;
      if (kind === 'overfeed') a.dietDays = Math.max(0, a.dietDays - 5);
      else if (kind === 'leash' && a.trust !== undefined) a.trust = clamp(a.trust - 8, 0, 100);
      else if (kind === 'bag') s.inv.dogFood = Math.round(s.inv.dogFood * 0.8);
      else if (kind === 'snack' && a.health !== undefined) a.health = clamp(a.health - 6, 0, 100);
      ev.push({ type: 'toast', text: `${m.text(st.name, a.name)}. ${m.effect}` });
    }

    // 마음을 열지 않은 아이가 봉사자를 무는 사고. 훈련사가 있으면 줄어든다
    const closedOnes = s.animals.filter((a) => a.closed && !a.opened);
    const vols = s.staff.filter((st) => st.role === 'volunteer' && attending.has(st.id));
    if (closedOnes.length && vols.length) {
      const biteP = 0.012 * closedOnes.length / (1 + train / 8);
      if (rand(s) < biteP) {
        const a = pick(s, closedOnes), v = pick(s, vols);
        s.stats.bites++;
        expense(s, 'medical', 100_000);
        s.reputation = Math.max(0, s.reputation - 8);
        s.awareness = clamp(s.awareness - 2, 0, 100);
        a.trust = clamp(a.trust - 10, 0, 100);
        const quits = rand(s) < 0.6;
        if (quits) s.staff = s.staff.filter((x) => x !== v);
        pushFeed(s, `보호소 봉사자가 다쳤다는 글이 올라왔다`, 'warn');
        ev.push({ type: 'popup', title: '물림 사고', body: `아직 마음을 열지 않은 ${j(a.name, '이가')} ${v.name}님을 물었어요.\n치료비 10만원 · 평판 -8 · 인식 -2${quits ? `\n${v.name}님이 봉사를 그만두기로 했어요.` : ''}\n훈련사가 있으면 이런 일이 줄어요.` });
      }
    }

    // 입양
    for (const a of [...s.animals]) {
      if (!SIM.isReady(a) || a.reservedBy) continue;
      if (rand(s) >= SIM.adoptChance(s, a, { groom, cs, phase })) continue;
      adoptOne(s, a, ev);
    }

    // 방문자 교감: 입양 준비된 아이와 놀다가 바로 입양을 원하거나, 준비가 끝나면 데려가겠다고 예약한다
    for (const a of [...s.animals]) {
      if (!a.reservedBy) continue;
      if (s.day > a.reservedUntil) {   // 너무 오래 기다리면 약속이 풀린다
        pushFeed(s, `${j(a.reservedBy, '이가')} 기다리다 다른 인연을 만났다. ${a.name}의 입양 약속이 풀렸다`, 'calm');
        a.reservedBy = null;
        continue;
      }
      if (!SIM.isReady(a)) continue;
      const fam = a.reservedBy;
      if (adoptOne(s, a, ev, { bonded: true, family: fam })) {
        if (!s.seen.promised) { s.seen.promised = true; ev.push({ type: 'popup', title: '약속한 가족이 왔어요', body: `${j(fam, '이가')} 약속대로 ${j(a.name, '을를')} 데리러 왔어요.\n교감하고 간 입양은 파양이 적어요. 다음부터는 짧은 알림으로 알려 드려요.` }); }
        else ev.push({ type: 'toast', text: `${j(fam, '이가')} 약속대로 ${j(a.name, '을를')} 데리러 왔어요` });
      }
    }
    if (isMain) visitorTick(s, ev);   // 방문자는 본점만

    if (isMain) albumTick(s, ev);   // 입양 간 아이 소식은 보호소 전체에서 한 번
    // 길에서 오는 아이들 + 지자체 위탁 의무 수용
    let pIn = 0.1 + (100 - s.awareness) / 100 * 0.18;
    if (phase === 'wave') pIn += 0.2 * s.trend.intensity;
    pIn *= D.INTAKE_RATE * SIM.speciesShare(s) * D.SEASONS[SIM.season(s.day)].intake;   // 여름 휴가철 유기 증가
    for (const b of s.buffs) if (b.intake && b.until > s.day) pIn *= b.intake;   // 바깥 사건으로 몰려드는 아이들
    if (SIM.projectActive(s, 'rescue')) pIn *= 2.5;
    // 이웃 도시 연계 구조: 인식이 높아 길에서 오는 아이가 줄어도, 이름난 보호소에는 다른 도시의 부탁이 온다
    if (s.level >= D.REGION_INTAKE.fromLv) pIn += D.REGION_INTAKE.rate * (s.awareness / 100) * D.INTAKE_RATE * SIM.speciesShare(s);
    // 튜토리얼 중(첫 식구가 오기 전)에는 길에서 오는 아이가 없다
    const quiet = isMain && s.tutorial && s.tutorial.step < 5;
    if (!quiet && rand(s) < Math.min(0.85, pIn)) intakeAnimal(s, chooseBreed(s), false, ev);
    if (!isMain) pIn *= (D.BRANCH_TRAITS[s.siteTrait] || {}).intake || 1;   // 분점 특성
    // 연계 의뢰(v0.14): 빈자리가 많으면 이웃 보호소·지자체가 아이를 부탁한다(받기 정책을 따른다)
    if (!quiet && s.level >= D.REFERRAL.fromLv) {
      const c = SIM.capacity(s), cap = c.small + c.large + c.cat;
      const fill = cap ? s.animals.length / cap : 1, R = D.REFERRAL;
      let lam = fill < R.target ? R.rate * (1 - fill / R.target) * SIM.speciesShare(s) : 0;
      for (let k = 0; k < R.maxPerDay && lam > 0; k++, lam -= 1) {
        if (rand(s) >= Math.min(1, lam)) continue;
        // 빈자리가 있는 종류(소형견·대형견·고양이)의 아이를 부탁받는다. 꽉 찬 종류가 와서 곧장 이송되는 일이 없게
        let bk = null;
        for (let t = 0; t < 8 && !bk; t++) { const c2 = chooseBreed(s); if (SIM.hasRoom(s, { breed: c2, species: D.BREEDS[c2].species, ageDays: 900 })) bk = c2; }
        if (bk) intakeAnimal(s, bk, false, ev, { how: 'referral' });
      }
    }
    if (isMain && s.subsidy && s.quotaLeft > 0 && rand(s) < 0.15) { s.quotaLeft--; intakeAnimal(s, chooseBreed(s), false, ev, { forced: true, how: 'forced' }); }

    if (isMain && s.trend && s.day === s.trend.waveStart) {
      const bn = D.BREEDS[s.trend.breed].name;
      ev.push({ type: 'popup', title: '반짝 인기가 지나간 자리', body: `길에서 발견되는 ${j(bn, '이가')} 늘고 있어요.\n한동안 ${j(bn, '이가')} 많이 들어올 거예요.` });
    }
  }
  function albumTick(s, ev) {
    for (const e of s.album) {
      if (e.returnDay && s.day >= e.returnDay && !e.back) {
        e.back = true;
        s.stats.returned++;
        s.reputation = Math.max(0, s.reputation - 3);
        intakeAnimal(s, e.breed, false, ev, { returned: true, name: e.name, coat: e.coat, ageDays: e.ageDays + (s.day - e.day) });
        ev.push({ type: 'popup', title: '다시 돌아온 아이', body: `${j(e.name, '이가')} 새 가족과 맞지 않아 돌아왔어요.\n입양 전 상담과 책임비가 이런 일을 줄여요.` });
        continue;
      }
      if (e.back || e.next >= D.ADOPT_NEWS.length) continue;
      const [months, lines] = D.ADOPT_NEWS[e.next];
      if (s.day - e.day >= months * DPM) {
        const text = pick(s, lines);
        e.news.push({ day: s.day, text });
        e.next++;
        pushFeed(s, `[입양 소식] ${e.name}: ${text}`, 'good', 'adopt');
        ev.push({ type: 'adoptNews', breed: e.breed, name: e.name, coat: e.coat, text, milestone: months >= 12 });
      }
    }
    // 감사 편지(v0.16): 입양 간 지 minDays일이 지난 가족 중 한 곳이 가끔 편지를 보낸다(아이마다 max통까지)
    const L = D.LETTER;
    if (rand(s) < L.perDay) {
      const ok = s.album.filter((e) => !e.back && s.day - e.day >= L.minDays && (e.letters || []).length < L.max);
      if (ok.length) {
        const e = pick(s, ok), t = pick(s, D.LETTERS);
        const owner = (s.staff.find((x) => x.role === 'owner') || {}).name || '선생님';
        const body = t.replace(/\{name\|([^}]+)\}/g, (_, pair) => j(e.name, pair)).replaceAll('{name}', e.name)
          .replaceAll('{shelter}', s.shelterName || '보호소').replaceAll('{owner}', owner);
        const from = e.family ? `${e.family} 드림` : `${e.name}네 가족 드림`;
        e.letters = e.letters || [];
        e.letters.push({ day: s.day, body, from });
        s.reputation += L.rep;
        s.stats.letters = (s.stats.letters || 0) + 1;
        pushFeed(s, `${e.name}의 가족에게서 편지가 왔다`, 'good', 'adopt');
        ev.push({ type: 'letter', breed: e.breed, name: e.name, coat: e.coat, body, from });
      }
    }

  }
  function staffExp(s, ev) {
    for (const st of s.staff) {
      st.exp++;
      if (st.exp >= 40 * st.level && st.level < D.STAFF.maxLevel && st.role !== 'owner') {
        st.exp = 0; st.level++;
        const main = st.role === 'volunteer' ? 'care' : D.ROLES[st.role].main;
        st.stats[main] = Math.min(10, st.stats[main] + 1);
        ev.push({ type: 'toast', text: `${st.name} 레벨 ${st.level}! ${D.STATS[main]} +1` });
        if (D.STAFF.raiseLevels.includes(st.level) && st.role !== 'volunteer' && !s.pending.some((p) => p.kind === 'raise' && p.id === st.id)) s.pending.push({ kind: 'raise', id: st.id, site: s.siteId });
      }
    }

  }
  function globalB(s, ev) {
    const phase = trendPhase(s);
    donations(s);
    volunteerApplicants(s, ev);
    jobApplicants(s, ev);   // 채용 공고 지원자(v0.15)

    if (activeCampaign(s, 'school')) s.awareness = clamp(s.awareness + 0.12, 0, 100);

    if (s.day % 5 === 0) {
      const bn = s.trend ? D.BREEDS[s.trend.breed].name : '';
      pushFeed(s, pick(s, phase === 'calm' ? D.FEED.calm : D.FEED[phase](bn)), phase);
    }

    if (s.reportDue && s.day >= s.reportDue.due) for (const e of SIM.submitReport(s, true)) ev.push(e);
    if (s.autoReport && !s.staff.some((x) => x.role === 'manager')) {
      s.autoReport = false;
      ev.push({ type: 'toast', text: '회계사가 없어 보고서 자동 제출이 꺼졌어요' });
    }
    if (s.day % DPM === 0) monthly(s, ev);
    s.reputation = Math.round(Math.max(0, s.reputation) * 10) / 10;   // 평판 상한 없음(v0.9)
    checkLevel(s, ev);
    return ev;
  }

  /* ---------- 봉사자 모집 ---------- */
  function volunteerApplicants(s, ev) {
    if (!s.volPost) return;
    if (s.volPost.until <= s.day) { s.volPost = null; return; }
    if (s.applicants.length >= 4 || rand(s) >= 0.12 + s.awareness / 500) return;
    const v = makeVolunteer(s, false);
    s.applicants.push(v);
    ev.push({ type: 'toast', text: `봉사 지원자 ${v.name}님이 연락해 왔어요` });
  }

  /* ---------- 월말 ---------- */
  function monthly(s, ev) {
    const monthIdx = s.day / DPM;

    income(s, 'donors', s.donors * s.donorFee * (SIM.dateOf(s.day - 1).month === 12 ? D.SEASONS.winter.decGift : 1));   // 연말 후원(막 끝난 달이 12월)
    if (s.money > D.RESERVE.limit) {
      s.donors = Math.max(0, Math.round(s.donors * (1 - D.RESERVE.donorLoss)));
      if (rand(s) < 0.3) pushFeed(s, `"${s.shelterName}는 후원금을 쌓아만 둔다"는 글이 돌고 있다. 특수 사업에 써 보자`, 'warn');
    }
    if (s.corporate && s.corporate.until > s.day) income(s, 'corporate', s.corporate.monthly);
    else if (s.corporate) { s.corporate = null; s.corporateOffered = false; pushFeed(s, '기업 후원 계약이 끝났다', 'calm'); }
    if (s.subsidy) { income(s, 'subsidy', D.SUBSIDY.monthly); s.quotaLeft = D.SUBSIDY.quota; }

    // 굿즈샵
    const shops = facList(s, 'shop').length;
    if (shops) {
      const merch = SIM.combos(s).merch.size ? 1.3 : 1;
      const sales = shops * (repEff(s) * 2000 + power(s, 'sns') * 40_000 * s.snsMult) * (0.8 + rand(s) * 0.4) * merch;
      const shopLv = Math.max(...facList(s, 'shop').map(SIM.facLevel));
      const upSales = sales * (shopLv >= 3 ? 1.6 : shopLv >= 2 ? 1.3 : 1);
      income(s, 'goods', upSales * (SIM.projectActive(s, 'charity') ? 2 : 1));
      expense(s, 'goodsCost', sales * 0.4);
    }

    let salary = 0;
    for (const st of s.staff) salary += SIM.salary(st);
    expense(s, 'salary', salary);
    let upkeep = 0;
    for (const f of facList(s)) upkeep += D.FACILITIES[f.type].upkeep * (D.UPKEEP_BY_LV[s.level] || 1);   // 등급이 오르면 운영비도 오른다
    const branchCost = branchMonthlyCost(s);
    if (branchCost) expense(s, 'branch', branchCost);   // 분점 급여·유지비
    expense(s, 'upkeep', upkeep);

    // 대출 상환: 원금 1/12 + 남은 원금의 1%
    for (const l of s.loans) {
      const interest = l.remaining * D.LOAN_TERMS.monthlyRate;
      const principal = Math.min(l.remaining, l.amount / D.LOAN_TERMS.months);
      expense(s, 'interest', interest);
      cash(s, 'loanRepay', -principal);
      l.remaining -= principal;
    }
    s.loans = s.loans.filter((l) => l.remaining > 1);
    if (s.money < 0 && s.loans.length && !s.loanDefault) {
      s.loanDefault = true;
      s.reputation = Math.max(0, s.reputation - 10);
      ev.push({ type: 'popup', title: '대출 상환이 밀렸어요', body: '신용이 떨어져 더 이상 대출을 받을 수 없어요. 평판 -10' });
    }

    ev.push({ type: 'toast', text: `월말 정산: 자금 ${won(s.money)}` });

    const gain = Math.round(repEff(s) / 50 + s.awareness / 30 + rand(s) * 2);
    const churn = Math.round(s.donors * (s.acctFails ? 0.06 : 0.04));
    s.donors = Math.max(0, s.donors + Math.round(gain * (D.CAREERS[s.career].donorMult || 1)) - churn);   // 경력 배율은 게임 내내 유지(v0.14)
    s.stats.donorsPeak = Math.max(s.stats.donorsPeak, s.donors);
    s.awareness = clamp(s.awareness - 1, 10, 100);
    s.npcRep = s.npcRep.map((r, i) => { const cap = D.NPC_REP_CAP.base + D.NPCS[i].size * D.NPC_REP_CAP.perSize; return r + D.NPCS[i].size * (6 + rand(s) * 8) * D.NPC_REP_RATE * Math.max(0.05, 1 - r / cap); });

    if (monthIdx % 12 === D.TREND.viralMonth - 1) startTrend(s, ev);
    const ph = trendPhase(s);
    if (s.trend && (ph === 'viral' || ph === 'boom') && !s.trend.celebDone && rand(s) < 0.5) {
      s.trend.celebDone = true;
      const c = pick(s, D.CELEBS);
      const bn = D.BREEDS[s.trend.breed].name;
      if (s.celebs.some((x) => x.id === c.id)) {
        pushFeed(s, `${c.name}: "${bn} 키우기 전에 꼭 한 번 더 생각해 주세요"`, 'good');
        s.trend.intensity = Math.max(0.2, s.trend.intensity * 0.8);
      } else {
        s.trend.intensity += D.TREND.celebBoost;
        pushFeed(s, `${j(c.name, '이가')} ${bn} 분양 영상을 올렸다. 조회수가 치솟는다`, 'viral');
        ev.push({ type: 'popup', title: '유행이 더 커져요', body: `${c.name}의 ${bn} 영상이 화제예요.\n몇 달 뒤 길에서 오는 ${j(bn, '이가')} 늘 수 있어요.` });
      }
    }

    // 무작위 사건
    const r = rand(s);
    if (r < 0.12) {
      const k = pick(s, ['dogFood', 'catFood', 'towels', 'pads']);
      const q = D.ITEMS[k].pack * randInt(s, 2, 4);
      s.inv[k] += q;
      ev.push({ type: 'popup', title: '큰 물품 후원 도착', body: `동네 마트에서 ${D.ITEMS[k].name} ${q}${D.ITEMS[k].unit}을 보내왔어요.` });
      s.goodsLog.unshift({ day: s.day, text: `${D.ITEMS[k].name} ${q}${D.ITEMS[k].unit} (마트 후원)` });
    } else if (r < 0.22 && [6, 7].includes(SIM.dateOf(s.day).month)) {   // 장마는 6~7월에만
      s.buffs.push({ id: 'rain', until: s.day + 15 });
      ev.push({ type: 'toast', text: '장마가 시작됐어요. 보름간 사회성이 덜 올라요' });
    } else if (r < 0.32) {
      s.reputation += 6;
      ev.push({ type: 'popup', title: '지역 신문 취재', body: '보호소 이야기가 동네 신문에 실렸어요. 평판 +6' });
      pushFeed(s, '동네 신문 1면에 우리 보호소가 나왔다', 'good');
    }
    s.buffs = s.buffs.filter((b) => b.until > s.day);
    s.campaigns = s.campaigns.filter((c) => c.until > s.day);
    s.celebs = s.celebs.filter((c) => c.until > s.day);

    // 보호소 앞에 두고 간 아이
    if (!(s.tutorial && s.tutorial.step < 5) && rand(s) < D.DOORSTEP.monthlyChance) doorstep(s, ev);

    // 특수동물 이벤트
    if (D.EXOTIC.enabled && monthIdx >= D.EXOTIC.fromMonth && rand(s) < D.EXOTIC.monthlyChance && !s.pending.some((p) => p.kind === 'exotic')) {
      s.pending.push({ kind: 'exotic', breed: pick(s, ['raccoon', 'meerkat']), n: randInt(s, D.EXOTIC.count[0], D.EXOTIC.count[1]) });
    }

    // 기업 후원 제안
    if (!s.corporate && !s.corporateOffered && s.day >= (s.corporateAgain || 0) && s.reputation >= D.CORPORATE.minRep && s.acctFails === 0) {
      s.corporateOffered = true;
      s.pending.push({ kind: 'corporate' });
    }

    // 자금 부족: 매달 경고하고, 마이너스가 BANKRUPT.months 달 이어지면 폐업한다(v0.14: 빚이 수천만 원이어도 계속되던 문제)
    if (s.money < 0) {
      s.lowFunds++;
      // 폐업 판정은 따로 센다: 아이 이송을 고르면 lowFunds가 1로 돌아가 2와 1만 오가며 끝없이 버텼다(v0.14 시험)
      // 빚이 BANKRUPT.floor보다 작으면 경고만 하고 폐업까지 세지 않는다(월말에 잠깐 0 아래로 걸치는 것까지 폐업이 되지 않게)
      s.negMonths = s.money < -D.BANKRUPT.floor ? (s.negMonths || 0) + 1 : Math.max(0, (s.negMonths || 0) - 1);
      const limit = D.BANKRUPT.months + (s.resolve ? D.RESOLVE.delay : 0);
      if (s.negMonths >= limit && !s.closed) {
        s.closed = { day: s.day, debt: s.money };
        ev.push({ type: 'closure', report: SIM.finalReport(s) });
        return;
      }
      if (s.negMonths > 0) ev.push({ type: 'popup', title: `빚이 ${s.negMonths}개월째 쌓이고 있어요`, body: `지금 자금 ${won(s.money)}원이에요. 빚이 ${won(D.BANKRUPT.floor)}원을 넘는 달이 ${limit - s.negMonths}개월 더 이어지면 보호소가 문을 닫아요.\n대출, 긴급 모금, 직원 조정, 시설 철거로 버틸 수 있어요.` });
      if (s.lowFunds === 1) {
        ev.push({ type: 'popup', title: '자금이 바닥났어요', body: `${s.resolve ? '포기하지 않는 마음으로 조금 더 버틸 수 있어요. 하지만 ' : ''}계속 마이너스면 아이들 일부를 이웃 보호소로 보내야 하고, ${limit}개월이 이어지면 문을 닫아요.\n대출이나 긴급 모금, 직원 조정을 생각해 보세요.` });
      } else if (s.lowFunds === 2 + (s.resolve ? D.RESOLVE.delay : 0) && s.animals.length) {
        s.pending.push({ kind: 'forceTransfer', n: Math.max(1, Math.ceil(s.animals.length * 0.25)) });
      } else if (s.lowFunds >= 3 + (s.resolve ? D.RESOLVE.delay : 0) || s.negMonths >= 2) {   // 이송으로 lowFunds가 돌아가도 급여가 밀린 달 수는 그대로 센다
        const paid = s.staff.filter((x) => x.role !== 'volunteer' && x.role !== 'owner').sort((a, b) => SIM.salary(b) - SIM.salary(a));
        if (paid.length) {
          s.staff = s.staff.filter((x) => x !== paid[0]);
          ev.push({ type: 'popup', title: '직원이 떠났어요', body: `급여가 밀려 ${D.ROLES[paid[0].role].name} ${j(paid[0].name, '이가')} 보호소를 떠났어요.` });
        }
      }
    } else { s.lowFunds = 0; s.negMonths = 0; }

    externalEvent(s, monthIdx, ev);
    if (s.channel && s.channel.subs) income(s, 'goods', Math.round(s.channel.subs * D.CHANNEL_PAY));   // 채널 수익
    if (s.goods && s.goods.released.length && has(s, 'shop')) income(s, 'goods', Math.round(SIM.goodsMonthly(s) * (SIM.projectActive(s, 'charity') ? 2 : 1)));
    // 업적
    s.achievements = s.achievements || {};
    for (const A of D.ACHIEVEMENTS) if (!s.achievements[A.id] && A.test(s)) {
      s.achievements[A.id] = s.day;
      s.reputation += 3;
      ev.push({ type: 'popup', title: `업적: ${A.name}`, body: `${A.desc}\n평판 +3` });
    }
    // 연말 '올해의 보호소' 시상: 이웃 보호소 순위 1위면
    if (monthIdx % 12 === 0 && SIM.summary(s).rank === 1) {
      s.donors += D.NEIGHBOR.awardDonors; s.reputation += D.NEIGHBOR.awardRep;
      s.awards = (s.awards || 0) + 1;
      ev.push({ type: 'popup', title: '올해의 보호소', body: `이웃 보호소들이 뽑은 올해의 보호소로 ${j(s.shelterName, '이가')} 선정됐어요!\n정기후원자 +${D.NEIGHBOR.awardDonors} · 평판 +${D.NEIGHBOR.awardRep}` });
    }
    if (monthIdx % 3 === 0) quarterReport(s, ev);
    if (monthIdx % 12 === 0) {
      const sum = SIM.summary(s);
      s.yearLog.push({ year: sum.year, rescued: sum.rescued, adopted: sum.adopted, donors: sum.donors, money: sum.money, rank: sum.rank });
      // 10년째 결산은 엔딩이 대신한다. 엔딩은 한 번만 나온다
      if (monthIdx / 12 >= D.ENDING.years && !s.ending) {
        s.ending = { day: s.day, continued: false };
        ev.push({ type: 'ending', report: SIM.finalReport(s) });
      } else ev.push({ type: 'year', summary: sum });
    }
  }

  function startTrend(s, ev) {
    const breed = pick(s, D.TREND_BREEDS);
    const delay = randInt(s, D.TREND.waveDelayMonths[0], D.TREND.waveDelayMonths[1]);
    s.trend = {
      breed, viralDay: s.day, intensity: (s.waveDamp || 1) * (SIM.projectActive(s, 'mega') ? 0.5 : 1) * (has(s, 'edu') ? 0.85 : 1), celebDone: false,
      waveStart: s.day + delay * DPM,
      waveEnd: s.day + (delay + D.TREND.waveMonths) * DPM,
    };
    const bn = D.BREEDS[breed].name;
    pushFeed(s, D.FEED.viral(bn)[0], 'viral');
    ev.push({ type: 'popup', title: `SNS에서 ${bn} 열풍`, body: `"${bn} 키우는 일상" 영상이 퍼지고 있어요.\n반짝 인기가 지나간 뒤를 대비해야 할지도.` });
  }

  /* ---------- 분기 보고 ---------- */
  SIM.acctScore = (s) => Math.round(power(s, 'acct') * 3 + (s.quarterFinance ? 15 : 0));
  // 회계 기준: 분기 수입이 커질수록 오르되, 후반에도 넘을 수 있게 완만하게(로그) 오르고 60에서 멈춘다
  SIM.acctRequired = (s) => Math.min(60, 8 + Math.round(Math.log2(1 + Object.values(s.ledger.income).reduce((a, b) => a + b, 0) / 1_000_000) * 7));

  function quarterReport(s, ev) {
    const L = s.ledger;
    const inc = Object.values(L.income).reduce((a, b) => a + b, 0);
    const exp = Object.values(L.expense).reduce((a, b) => a + b, 0);
    const d = SIM.dateOf(s.day - 1);
    s.reportDue = {
      due: s.day + D.REPORT.dueDays,
      report: {
        label: `${d.year}년차 ${Math.ceil(d.month / 3)}분기`, income: { ...L.income }, expense: { ...L.expense }, cash: { ...L.cash },
        inc, exp, net: inc - exp, rescued: L.rescued, adopted: L.adopted, transferred: L.transferred,
        avgStay: L.adopted ? Math.round(L.stayDays / L.adopted) : 0,
        score: SIM.acctScore(s), required: SIM.acctRequired(s),
        repDelta: Math.round(s.reputation - L.repStart), money: s.money, donors: s.donors,
      },
    };
    s.ledger = newLedger();
    s.ledger.repStart = s.reputation;
    s.quarterFinance = false;
    s.fundraisedQ = 0;
    if (s.autoReport && s.staff.some((x) => x.role === 'manager')) {
      for (const e of SIM.submitReport(s, false, true)) ev.push(e);
    } else {
      ev.push({ type: 'toast', text: `분기 보고서를 ${D.REPORT.dueDays}일 안에 제출하세요` });
    }
  }

  // 보고서 제출: 이때 회계를 평가한다. late = 기한을 넘겨 강제로 제출된 경우
  SIM.submitReport = (s, late, auto) => {
    const due = s.reportDue;
    if (!due) return [];
    const r = due.report;
    const ev = [];
    r.late = !!late;
    r.auto = !!auto;
    if (late) r.score -= D.REPORT.latePenalty;
    r.pass = r.score >= r.required;
    const pts = (r.net > 0 ? 1 : 0) + (r.adopted >= 12 ? 1 : 0) + (r.adopted >= 25 ? 1 : 0) + (r.repDelta > 20 ? 1 : 0) + (r.pass ? 1 : -1) - (r.transferred > 10 ? 1 : 0) - (late ? 1 : 0);
    r.grade = pts >= 4 ? 'S' : pts === 3 ? 'A' : pts === 2 ? 'B' : pts >= 0 ? 'C' : 'D';
    s.prevReport = s.report;
    s.report = r;
    s.reportDue = null;
    if (late) {
      s.reputation = Math.max(0, s.reputation - D.REPORT.lateRep);
      pushFeed(s, '"보고서는 언제 올라오나요?" 후원자 문의가 이어졌다', 'warn');
      ev.push({ type: 'popup', title: '보고서 기한을 넘겼어요', body: `회계 점수 -${D.REPORT.latePenalty} · 평판 -${D.REPORT.lateRep}\n회계사를 채용하면 자동으로 제출할 수 있어요.` });
    }
    ev.push({ type: 'quarter', report: r, prev: s.prevReport });
    if (!r.pass) {
      s.acctFails++;
      const lost = Math.round(s.donors * 0.1);
      s.donors -= lost;
      s.reputation = Math.max(0, s.reputation - 15);
      pushFeed(s, '"후원금은 어디에 쓰였나요?" 문의 글이 퍼지고 있다', 'warn');
      let body = `회계 점수 ${r.score} / 기준 ${r.required}\n후원자 ${lost}명이 떠났고 평판이 15 떨어졌어요.\n회계사를 두거나 '후원금 사용 내역 공개'를 하세요.`;
      if (s.acctFails >= 2 && s.corporate) {
        s.corporate = null;
        body += '\n\n두 분기 연속 미흡이라 기업 후원 계약이 해지됐어요.';
      }
      ev.push({ type: 'popup', title: '회계 보고 미흡', body });
    } else s.acctFails = 0;
    return ev;
  };

  SIM.setAutoReport = (s, on) => {
    if (on && !s.staff.some((x) => x.role === 'manager')) return { ok: false, msg: '회계사를 채용해야 자동 제출을 켤 수 있어요' };
    s.autoReport = on;
    return { ok: true };
  };

  /* ---------- 결정이 필요한 일 ---------- */
  SIM.fundraiseEstimate = (s, cost) => {
    // 인플루언서는 사람이 많이 모이지만 한 사람의 후원금이 작다
    const base = cost * (0.35 + power(s, 'sns') * 0.04 * s.snsMult + s.donors * s.donorFee / 4_000_000);
    return Math.round(base * (s.fundraisedQ ? 0.5 : 1) * (s.intakePolicy === 'care' ? 1.3 : 1));
  };

  // choice: injury → 'pay' | 'fund' | 'transfer', corporate → 'accept' | 'decline', forceTransfer → extra = 보낼 아이 id 목록
  // 자동 선택 규칙(v0.12): 밸런스 시험(tools/sim_test.js)과 게임 시험 모드(?test&auto)가 같은 규칙을 쓴다
  SIM.botChoice = (s, p, strategy = 'normal') => {
    if (p.kind === 'injury') {
      const a = s.animals.find((x) => x.id === p.id);
      const fund = a ? SIM.fundraiseEstimate(s, a.surgeryCost) : 0;
      if (!a || s.money > a.surgeryCost * 2.5) return 'pay';
      if (strategy === 'normal' && s.money + fund > a.surgeryCost * 1.3) return 'fund';
      return 'transfer';
    }
    if (p.kind === 'visit') return strategy === 'normal' ? (p.ready ? 'adopt' : 'reserve') : 'later';
    if (p.kind === 'external') return strategy === 'normal' ? 'respond' : 'skip';
    if (p.kind === 'memorial') return strategy === 'normal' && s.money > 5_000_000 ? 'party' : 'post';
    if (p.kind === 'stockout') return strategy === 'normal' ? 'on' : 'off';
    return 'accept';
  };
  SIM.resolve = (s, choice, extra) => {
    const p = s.pending.shift();
    if (!p) return { ok: false };
    const ev = [];
    if (p.kind === 'stockout') {
      if (choice === 'on') { s.autoBuy = true; consume(s, ev); }   // 켜자마자 모자란 것을 산다(소비량 0이 아니면 한 번 더 깎이지만 하루치라 작다)
      return { ok: true, events: ev };
    }
    if (p.kind === 'exotic') {
      const bn = D.BREEDS[p.breed].name;
      if (choice === 'accept') {
        for (let i = 0; i < p.n; i++) admit(s, makeAnimal(s, p.breed, false, {}), ev);
        s.reputation += 4;
        pushFeed(s, `야생동물 카페에 남겨졌던 ${j(bn, '이가')} 우리 보호소로 왔다`, 'good');
      } else pushFeed(s, `남겨진 ${bn}들은 다른 곳에서 맡기로 했다`, 'calm');
      return { ok: true, events: ev };
    }
    if (p.kind === 'intake') {
      if (choice === 'accept') admit(s, p.animal, ev);
      else sendAway(s, p.animal, ev, 'declined');
      return { ok: true, events: ev };
    }
    if (p.kind === 'injury') {
      const a = s.animals.find((x) => x.id === p.id);
      if (!a) return { ok: true, events: ev };
      if (choice === 'transfer') {
        s.animals = s.animals.filter((x) => x !== a);
        s.stats.transferred++; s.ledger.transferred++;
        s.reputation = Math.max(0, s.reputation - 5);
        pushFeed(s, `${j(a.name, '이가')} 큰 병원이 있는 보호소로 옮겨 갔다`, 'warn');
        return { ok: true, events: ev };
      }
      if (choice === 'fund') {
        const raised = Math.round(SIM.fundraiseEstimate(s, a.surgeryCost) * (0.8 + rand(s) * 0.4));
        income(s, 'fundraise', raised);
        s.fundraisedQ++;
        s.reputation += 3;
        pushFeed(s, `${a.name} 수술비 긴급 모금에 ${won(raised)}이 모였다`, 'good');
        ev.push({ type: 'popup', title: '긴급 모금 결과', body: `${won(raised)}이 모였어요. 수술비 ${won(a.surgeryCost)}` });
      }
      if (upAny(s, 'clinic', 2)) a.surgeryCost = Math.round(a.surgeryCost * 0.7);   // 수술실
      expense(s, 'medical', a.surgeryCost);
      a.injured = false;
      a.health = Math.max(a.health, 40);
      if (s.intakePolicy === 'care') s.reputation += 3;
      ev.push({ type: 'toast', text: `${a.name} 수술 성공! 이제 회복만 남았어요` });
      story(s, a, '큰 수술을 이겨 냈다');
    } else if (p.kind === 'visit') {
      const a = s.animals.find((x) => x.id === p.animal);
      if (!a) return { ok: true, events: ev };
      if (choice === 'adopt' && SIM.isReady(a)) {
        if (adoptOne(s, a, ev, { bonded: true, family: p.family })) ev.push({ type: 'toast', text: `${a.name}, ${j(p.family, '과와')} 함께 새 집으로!` });
      } else if (choice === 'reserve') {
        a.reservedBy = p.family;
        a.reservedUntil = s.day + D.VISIT.reserveDays;
        pushFeed(s, `${j(p.family, '이가')} ${a.name}의 입양 준비가 끝나길 기다리기로 했다`, 'good');
      } else {
        a.trust = Math.min(100, a.trust + 3);
        pushFeed(s, `${j(p.family, '이가')} 다음에 다시 오겠다며 돌아갔다`, 'calm');
      }
    } else if (p.kind === 'external') {
      const e = D.EXTERNAL.events.find((x) => x.id === p.id);
      const r = e && e.respond;
      if (choice === 'respond' && r) {
        if (s.money < r.cost) { s.pending.unshift(p); return { ok: false, msg: '자금이 부족해요' }; }
        expense(s, 'campaign', r.cost);
        s.donors = Math.round(s.donors * (1 + r.donors));
        s.reputation += r.rep;
        if (r.aware) s.awareness = clamp(s.awareness + r.aware, 0, 100);
        pushFeed(s, r.text, 'good');
        ev.push({ type: 'toast', text: r.text });
      }
    } else if (p.kind === 'raise') {
      SIM.withSite(s, p.site || 'main', () => {
        const st = s.staff.find((x) => x.id === p.id);
        if (!st) return;
        if (choice === 'accept') { st.raise = (st.raise || 0) + D.STAFF.raise; pushFeed(s, `${j(st.name, '이가')} 급여 인상에 고마워했다`, 'good'); }
        else { st.stats.care = Math.max(0, (st.stats.care || 0) - 1); pushFeed(s, `${j(st.name, '이가')} 조금 서운해한다`, 'calm'); }
      });
    } else if (p.kind === 'season') {
      const e = D.SEASON_EVENTS.find((x) => x.id === p.id), c = e.choice;
      if (choice === 'accept') {
        if (s.money < c.cost) { s.pending.unshift(p); return { ok: false, msg: '자금이 부족해요' }; }
        if (c.cost) expense(s, 'campaign', c.cost);
        if (c.aware) s.awareness = clamp(s.awareness + c.aware, 0, 100);
        if (c.returnCut) s.buffs.push({ id: 'giftCampaign', until: s.day + c.days });
        if (c.neuterDiscount) s.buffs.push({ id: 'neuterWeek', until: s.day + c.days });
        pushFeed(s, `${e.title}: ${c.label}`, 'good');
      }
    } else if (p.kind === 'neighbor') {
      if (choice === 'accept') {
        let took = 0;
        // 자리가 있는 만큼만 받는다(받자마자 다른 곳으로 다시 보내지 않게)
        for (let i = 0, tries = 0; took < p.n && tries < p.n * 4; tries++) {
          const breed = chooseBreed(s);
          if (!freeHome(s, D.BREEDS[breed].species, breed)) continue;
          if (intakeAnimal(s, breed, false, ev, { forced: true, how: 'neighbor' })) took++;
        }
        if (!took) { pushFeed(s, `${p.who}의 부탁을 받았지만 자리가 없어 맡지 못했다`, 'calm'); return { ok: true, events: ev }; }
        s.reputation += D.NEIGHBOR.askRep;
        ev.push({ type: 'toast', text: `${p.who}에서 ${took}마리를 받았어요. 평판 +${D.NEIGHBOR.askRep}` });
        pushFeed(s, `${j(p.who, '과와')} 함께 구조한 아이들을 나눠 맡았다`, 'good');
      } else pushFeed(s, `${j(p.who, '이가')} 다른 곳에 도움을 청했다`, 'calm');
    } else if (p.kind === 'memorial') {
      const d = D.DAYS.find((x) => x.id === p.id), o = D.DAY_EVENT[choice === 'party' ? 'party' : 'post'];
      if (s.money < o.cost) { s.pending.unshift(p); return { ok: false, msg: '자금이 부족해요' }; }
      if (o.cost) expense(s, 'campaign', o.cost);
      const add = Math.round(randInt(s, o.donors[0], o.donors[1]) * (1 + power(s, 'sns') * 0.08) * s.snsMult);
      s.donors += add;
      s.awareness = clamp(s.awareness + o.aware, 0, 100);
      s.reputation += o.rep;
      s.buffs.push({ id: `day-${d.id}`, until: s.day + o.days, adopt: o.adopt, species: d.species });
      const who = d.species === 'cat' ? '고양이' : d.species === 'dog' ? '강아지' : '아이';
      pushFeed(s, choice === 'party' ? `${d.name}을 맞아 ${s.shelterName}에서 ${who}들을 만나는 행사가 열렸다` : `${j(s.shelterName, '이가')} ${d.name} 맞이 ${who} 소개 글을 올렸다`, 'good');
      ev.push({ type: 'toast', text: `${d.name}: 정기후원자 +${add}, ${o.days}일간 ${who} 입양 ×${o.adopt}` });
    } else if (p.kind === 'corporate') {
      if (choice === 'accept') {
        s.corporate = { until: s.day + D.CORPORATE.months * DPM, monthly: D.CORPORATE.monthly };
        pushFeed(s, '지역 기업과 1년 후원 협약을 맺었다', 'good');
      } else { s.corporateOffered = false; s.corporateAgain = s.day + 360; }   // 거절하면 1년 동안 다시 묻지 않는다
    } else if (p.kind === 'forceTransfer') {
      const ids = new Set(extra || []);
      let moved = 0;
      for (const a of [...s.animals]) {
        if (moved >= p.n) break;
        if (ids.size && !ids.has(a.id)) continue;
        s.animals = s.animals.filter((x) => x !== a);
        moved++;
      }
      s.stats.transferred += moved; s.ledger.transferred += moved;
      s.reputation = Math.max(0, s.reputation - 2 * moved);
      s.lowFunds = 1;
      pushFeed(s, `자금이 모자라 아이들 ${moved}마리가 이웃 보호소로 떠났다`, 'warn');
    }
    return { ok: true, events: ev };
  };

  /* ---------- 플레이어 행동 ---------- */
  SIM.build = (s, type, x, y) => {
    const f = D.FACILITIES[type];
    if (f.fixed) return { ok: false, msg: '본관은 하나뿐이에요' };
    if (f.lv > s.level) return { ok: false, msg: `보호소 등급 Lv${f.lv}부터 지을 수 있어요` };
    if (!SIM.canPlace(s, type, x, y)) return { ok: false, msg: SIM.size(type) > 1 ? `${SIM.size(type)}×${SIM.size(type)}칸 빈자리가 필요해요 (누른 칸이 왼쪽 위)` : '이미 시설이 있어요' };
    if (s.money < f.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'facility', f.cost);
    placeFacility(s, type, x, y, f.days);
    if (!f.days) { const ev = []; checkNewCombos(s, ev); return { ok: true, msg: `${j(f.name, '을를')} 놓았어요`, events: ev }; }   // 꾸밈은 바로 설치
    return { ok: true, msg: `${j(f.name, '이가')} 공사를 시작했어요. ${f.days}일 뒤 완공`, events: [] };
  };

  // 건물 옮기기: 비용은 건설비의 10%. 안에 사는 아이들은 그대로 따라간다
  SIM.moveCost = (f) => Math.round(D.FACILITIES[f.type].cost * D.MOVE_RATE);
  SIM.canMove = (s, id, x, y) => {
    const f = s.facilities[id];
    if (!f) return false;
    for (const [cx, cy] of SIM.cellsOf(f)) s.grid[idx(s, cx, cy)] = null;
    const ok = SIM.canPlace(s, f.type, x, y);
    for (const [cx, cy] of SIM.cellsOf(f)) s.grid[idx(s, cx, cy)] = f.id;
    return ok;
  };
  SIM.moveFacility = (s, id, x, y) => {
    const f = s.facilities[id];
    if (!f) return { ok: false };
    if (f.x === x && f.y === y) return { ok: false, msg: '지금 있는 자리예요' };
    const cost = SIM.moveCost(f);
    if (s.money < cost) return { ok: false, msg: '자금이 부족해요' };
    if (!SIM.canMove(s, id, x, y)) return { ok: false, msg: SIM.size(f.type) > 1 ? `${SIM.size(f.type)}×${SIM.size(f.type)}칸 빈자리가 필요해요 (누른 칸이 왼쪽 위)` : '그 자리는 비어 있지 않아요' };
    expense(s, 'facility', cost);
    clearYardItems(s, f);
    for (const [cx, cy] of SIM.cellsOf(f)) s.grid[idx(s, cx, cy)] = null;
    f.x = x; f.y = y;
    for (const [cx, cy] of SIM.cellsOf(f)) s.grid[idx(s, cx, cy)] = f.id;
    const ev = [];
    checkNewCombos(s, ev);
    return { ok: true, msg: `${j(D.FACILITIES[f.type].name, '을를')} 옮겼어요 (${won(cost)})`, events: ev };
  };

  SIM.demolish = (s, id) => {
    const f = s.facilities[id];
    if (!f) return { ok: false };
    if (s.animals.some((a) => a.home === id)) return { ok: false, msg: '아이들이 지내고 있어서 철거할 수 없어요' };
    if (D.FACILITIES[f.type].fixed) return { ok: false, msg: '본관은 철거할 수 없어요. 옮길 수는 있어요' };
    clearYardItems(s, f);
    for (const [cx, cy] of SIM.cellsOf(f)) s.grid[idx(s, cx, cy)] = null;
    delete s.facilities[id];
    income(s, 'refund', D.FACILITIES[f.type].cost * 0.3);
    return { ok: true };
  };

  SIM.postJob = (s, role) => {
    const r = D.ROLES[role];
    if (s.jobPosts[role] && !s.jobPosts[role].list) return { ok: false, msg: '지원서를 받고 있어요' };
    if (s.money < r.post) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'hiring', r.post);
    // 채용 개편(v0.15): 공고를 내면 D.HIRING.days일 뒤에 지원자 목록이 나온다(jobApplicants)
    s.jobPosts[role] = { until: s.day + D.HIRING.days, list: null };
    pushFeed(s, `${D.ROLES[role].name} 채용 공고를 냈다. ${D.HIRING.days}일 동안 지원서를 받는다`, 'calm');
    return { ok: true, msg: `${D.HIRING.days}일 뒤에 지원자를 볼 수 있어요` };
  };
  function jobApplicants(s, ev) {
    for (const role of Object.keys(s.jobPosts)) {
      const post = s.jobPosts[role];
      if (post.list || post.until > s.day) continue;
      const res = makeApplicants(s, role);
      post.list = res.list;
      ev.push({ type: 'toast', text: `${D.ROLES[role].name} 공고에 ${res.list.length}명이 지원했어요` });
      for (const e of res.events) ev.push(e);
    }
  }
  function makeApplicants(s, role) {
    const list = [];
    for (const nm of D.NAMED) {
      if (nm.role !== role || s.hiredNamed.includes(nm.name) || s.reputation < nm.minRep * D.CAREERS[s.career].namedRepCut) continue;
      if (rand(s) < nm.chance) list.push({ name: nm.name, sprite: nm.sprite, title: nm.title, legend: !!nm.legend, role, stats: { ...nm.stats }, level: 1 });
    }
    const n = 3 + (rand(s) < 0.5 ? 1 : 0);   // 지원자 3~4명
    while (list.length < n) list.push(makeCandidate(s, role));
    const legends = list.filter((c) => c.legend);
    return { list: list.slice(0, n), events: legends.length ? [{ type: 'popup', title: '전설의 인재가 지원했어요', body: legends.map((c) => `${c.title} ${c.name}`).join('\n') }] : [] };
  }

  SIM.hireCandidate = (s, role, i) => {
    const c = s.jobPosts[role] && s.jobPosts[role].list && s.jobPosts[role].list[i];
    if (!c) return { ok: false };
    s.staff.push({ id: s.nextId++, name: c.name, sprite: c.sprite, title: c.title, legend: c.legend, role, level: 1, exp: 0, stats: { ...c.stats } });
    if (c.title) s.hiredNamed.push(c.name);
    delete s.jobPosts[role];
    pushFeed(s, `${c.title ? c.title + ' ' : ''}${j(c.name, '이가')} ${j(D.ROLES[role].name, '으로')} 합류했다`, 'good');
    return { ok: true, name: c.name };
  };

  SIM.postVolunteers = (s) => {
    if (s.volPost) return { ok: false, msg: '이미 모집 중이에요' };
    if (s.money < D.VOLUNTEER.post) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'hiring', D.VOLUNTEER.post);
    s.volPost = { until: s.day + 14 };
    return { ok: true };
  };
  SIM.interview = (s, id) => {
    const v = s.applicants.find((x) => x.id === id);
    if (!v || v.interviewed) return { ok: false };
    v.interviewed = true;
    return { ok: true };
  };
  // 교육: 지원자나 봉사자 모두 받을 수 있다. 실수가 절반으로 준다
  SIM.trainVolunteer = (s, id) => {
    const v = s.applicants.find((x) => x.id === id) || s.staff.find((x) => x.id === id && x.role === 'volunteer');
    if (!v || v.trained) return { ok: false };
    if (s.money < D.VOLUNTEER.training) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'hiring', D.VOLUNTEER.training);
    v.trained = true;
    return { ok: true };
  };
  SIM.acceptVolunteer = (s, id) => {
    const v = s.applicants.find((x) => x.id === id);
    if (!v) return { ok: false };
    if (s.staff.filter((x) => x.role === 'volunteer').length >= D.VOLUNTEER.max) return { ok: false, msg: `봉사자는 ${D.VOLUNTEER.max}명까지예요` };
    s.applicants = s.applicants.filter((x) => x !== v);
    s.staff.push(v);
    return { ok: true, name: v.name };
  };
  SIM.rejectApplicant = (s, id) => {
    s.applicants = s.applicants.filter((x) => x.id !== id);
    return { ok: true };
  };

  // 연수: 주 능력치 +1(최대 10), 사람마다 60일에 한 번
  SIM.trainStaff = (s, id) => {
    const st = s.staff.find((x) => x.id === id);
    if (!st || st.role === 'volunteer') return { ok: false };
    const main = st.role === 'owner' ? 'care' : D.ROLES[st.role].main;
    if (st.stats[main] >= 10) return { ok: false, msg: '이미 최고 수준이에요' };
    if (st.trainedDay && s.day - st.trainedDay < D.STAFF.trainCooldown) return { ok: false, msg: `${D.STAFF.trainCooldown - (s.day - st.trainedDay)}일 뒤 다시 보낼 수 있어요` };
    if (s.money < D.STAFF.trainCost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'hiring', D.STAFF.trainCost);
    st.stats[main]++; st.trainedDay = s.day;
    return { ok: true, msg: `${j(st.name, '이가')} 연수를 마쳤어요. ${D.STATS[main]} +1` };
  };
  SIM.fire = (s, id) => {
    if (s.staff.some((x) => x.id === id && x.role === 'owner')) return { ok: false, msg: '나는 보호소를 떠날 수 없어요' };
    s.staff = s.staff.filter((x) => x.id !== id);
    return { ok: true };
  };

  SIM.rename = (s, kind, id, name) => {
    const clean = String(name).replace(/\s+/g, ' ').trim().slice(0, 8);
    if (!clean) return { ok: false, msg: '이름을 입력해 주세요' };
    const list = kind === 'animal' ? s.animals : s.staff;
    const x = list.find((o) => o.id === id);
    if (!x) return { ok: false };
    x.name = clean;
    return { ok: true };
  };

  SIM.campaign = (s, type) => {
    const c = D.CAMPAIGNS[type];
    if (s.money < c.cost) return { ok: false, msg: '자금이 부족해요' };
    if (c.days && activeCampaign(s, type)) return { ok: false, msg: '이미 진행 중이에요' };
    if (type === 'finance' && s.quarterFinance) return { ok: false, msg: '이번 분기에는 이미 공개했어요' };
    expense(s, 'campaign', c.cost);
    const ev = [];
    if (type === 'poster') {
      s.awareness = clamp(s.awareness + 4, 0, 100);
      pushFeed(s, '동네 게시판에 "입양은 가족을 맞는 일" 포스터가 붙었다', 'good');
    } else if (type === 'snsVideo') {
      const k = (activeCelebs(s).length ? 2 : 1) * (1 + power(s, 'sns') * 0.08) * s.snsMult;
      const add = Math.round(randInt(s, 8, 15) * k);
      s.donors += add; s.reputation += 2;
      ev.push({ type: 'toast', text: `영상이 퍼졌어요! 정기후원자 +${add}` });
      pushFeed(s, '보호소 아이들 하루 영상이 공유되고 있다', 'good');
    } else if (type === 'finance') {
      s.quarterFinance = true;
      pushFeed(s, '보호소가 이번 분기 후원금 사용 내역을 올렸다', 'good');
    } else {
      s.campaigns.push({ type, until: s.day + c.days });
      if (type === 'school' && s.trend && s.day < s.trend.waveStart) {
        s.trend.intensity = Math.max(0.2, s.trend.intensity * (1 - D.TREND.schoolCut * (hasBuff(s, 'lecture') ? 2 : 1)));
        ev.push({ type: 'toast', text: '아이들이 "반짝 인기"의 뒷이야기를 배웠어요. 다가올 물결이 줄어요' });
      }
      const line = { school: '초등학교에서 동물 가족 수업이 열렸다', adoptDay: '이번 주말은 입양의 날! 방문 예약이 몰린다', wishlist: '보호소 필요 물품 목록이 공유되고 있다' }[type];
      pushFeed(s, line, 'good');
    }
    return { ok: true, events: ev };
  };

  SIM.hireCeleb = (s, id) => {
    const c = D.CELEBS.find((x) => x.id === id);
    if (s.celebs.some((x) => x.id === id && x.until > s.day)) return { ok: false, msg: '이미 함께하고 있어요' };
    if (s.money < c.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'campaign', c.cost);
    s.celebs.push({ id, until: s.day + c.days });
    s.reputation += 10;
    const add = Math.round(c.fans / 50_000);
    s.donors += add;
    pushFeed(s, `${c.name}: "${c.line}"`, 'good');
    return { ok: true, events: [{ type: 'popup', title: `${c.name} 방문!`, body: `${c.line}\n정기후원자 +${add}, 30일간 입양 확률 상승` }] };
  };

  SIM.takeLoan = (s, i) => {
    if (s.loanDefault) return { ok: false, msg: '상환이 밀린 적이 있어 대출을 받을 수 없어요' };
    if (s.loans.length) return { ok: false, msg: '지금 대출을 다 갚아야 새로 받을 수 있어요' };
    const L = D.LOANS[i];
    cash(s, 'loanIn', L.amount);
    s.loans.push({ amount: L.amount, remaining: L.amount });
    pushFeed(s, `보호소가 ${won(L.amount)} 대출을 받아 확장에 나섰다`, 'calm');
    return { ok: true };
  };

  SIM.setFee = (s, level) => { s.feeLevel = level; return { ok: true }; };
  // 아이와 직접 교감(지도에서 아이를 눌러서). 종류마다 하루 한 번
  SIM.interact = (s, id, kind) => {
    const a = s.animals.find((x) => x.id === id);
    if (!a) return { ok: false };
    a.touched = a.touched || {};
    if (a.touched[kind] === s.day) return { ok: false, msg: '오늘은 이미 했어요. 내일 또 해 주세요' };
    if (s.touchDay !== s.day) { s.touchDay = s.day; s.touchCount = 0; }
    if (s.touchCount >= D.TOUCH_PER_DAY) return { ok: false, msg: `오늘은 ${D.TOUCH_PER_DAY}번 다 교감했어요. 내일 또 해 주세요` };
    if (kind === 'treat') {
      const item = a.species === 'cat' ? 'churu' : 'dogchew';
      if (a.fat) return { ok: false, msg: '다이어트 중이라 간식은 참아요' };
      if ((s.inv[item] || 0) < 1) return { ok: false, msg: `${j(D.ITEMS[item].name, '이가')} 없어요` };
      s.inv[item]--;
      a.trust = clamp(a.trust + 3, 0, 100);
    } else if (kind === 'play') {
      if ((s.inv.toys || 0) < 0.2) return { ok: false, msg: '장난감이 없어요' };
      s.inv.toys -= 0.2;
      a.social = clamp(a.social + 2, 0, 100);
    } else a.trust = clamp(a.trust + 1, 0, 100);
    a.touched[kind] = s.day;
    s.touchCount++;
    const msg = { pet: `${j(a.name, '이가')} 손에 머리를 기댔어요 (신뢰 +1)`, treat: `${j(a.name, '이가')} 맛있게 먹었어요 (신뢰 +3)`, play: `${j(a.name, '이가')} 신나게 놀았어요 (사회성 +2)` }[kind];
    if (!a.touched.storied) { story(s, a, `${j(s.player ? s.player.name : '나', '과와')} 처음 놀았다`); a.touched.storied = true; }
    return { ok: true, msg };
  };

  SIM.setIntakePolicy = (s, k) => { s.intakePolicy = k; return { ok: true }; };
  SIM.setSpeciesPolicy = (s, k) => { if (D.SPECIES_POLICIES[k]) s.speciesPolicy = k; return { ok: true, msg: { both: '이제 강아지와 고양이를 모두 받아요', dog: '이제 강아지만 받아요', cat: '이제 고양이만 받아요' }[s.speciesPolicy] }; };
  SIM.setSubsidy = (s, on) => {
    s.subsidy = on;
    if (on) s.quotaLeft = D.SUBSIDY.quota;
    pushFeed(s, on ? '지자체 위탁 보조금을 받기 시작했다. 매달 아이들을 더 맡는다' : '지자체 위탁 보조금을 그만 받기로 했다', 'calm');
    return { ok: true };
  };
  SIM.setAutoBuy = (s, on) => { s.autoBuy = on; return { ok: true }; };

  // 튜토리얼: 견사·묘사가 완공되면 첫 식구 둘이 온다
  SIM.tutorialArrive = (s) => {
    const ev = [];
    const dog = wants(s, 'dog'), cat = wants(s, 'cat');
    if (dog) intakeAnimal(s, 'jindo', true, ev);
    if (cat) intakeAnimal(s, 'korshort', true, ev);
    const who = dog && cat ? '강아지와 고양이를' : dog ? '강아지를' : '고양이를';
    ev.push({ type: 'popup', title: '첫 식구가 왔어요', body: `동네 사람이 길에서 떠돌던 ${who} 데려왔어요.\n이제부터 보호소가 바빠질 거예요.` });
    pushFeed(s, `${s.shelterName}에 첫 식구가 들어왔다`, 'good');
    return ev;
  };
  // 안내를 건너뛰면 견사·묘사를 바로 짓고 첫 식구를 들인다
  SIM.skipTutorial = (s) => {
    const spot = (type) => { for (let y = 3; y < s.gridH - 1; y++) for (let x = 2; x < s.gridW; x++) if (SIM.canPlace(s, type, x, y)) return [x, y]; return null; };
    if (wants(s, 'dog') && !Object.values(s.facilities).some((f) => f.type === 'bigkennel')) { const p = spot('bigkennel'); if (p) placeFacility(s, 'bigkennel', ...p); }
    if (wants(s, 'cat') && !Object.values(s.facilities).some((f) => f.type === 'cattery')) { const p = spot('cattery'); if (p) placeFacility(s, 'cattery', ...p); }
    if (wants(s, 'dog') && !Object.values(s.facilities).some((f) => f.type === 'kennel')) { const p = spot('kennel'); if (p) placeFacility(s, 'kennel', ...p); }
    for (const f of Object.values(s.facilities)) f.buildLeft = 0;
    return SIM.tutorialArrive(s);
  };
  SIM.finishTutorial = (s) => {
    s.tutorial = null;
    income(s, 'gift', 500_000);   // 튜토리얼 완료 선물
    return { ok: true };
  };

  SIM.summary = (s) => {
    const ranks = [...s.npcRep.map((r, i) => ({ name: D.NPCS[i].name, rep: r })), { name: s.shelterName || '우리 보호소', rep: s.reputation + s.stats.adopted * 2 }]
      .sort((a, b) => b.rep - a.rep);
    return {
      year: SIM.dateOf(s.day - 1).year,
      rescued: s.stats.rescued, adopted: s.stats.adopted, transferred: s.stats.transferred, returned: s.stats.returned,
      donors: s.donors, money: s.money, rank: ranks.findIndex((r) => r.name === (s.shelterName || '우리 보호소')) + 1, total: ranks.length,
    };
  };

  // 10년 성과 보고와 앨범 속 아이들의 한마디. 같은 저장에서는 늘 같은 문장이 나오도록 id로 고른다
  SIM.finalReport = (s) => {
    const sum = SIM.summary(s), E = D.ENDING;
    // 엔딩 갈래: 세 요소를 ★1~3으로 매긴다
    const good = sum.adopted - sum.returned;
    const tier = (v, [m, h]) => (v >= h ? 3 : v >= m ? 2 : 1);
    const stars = { aware: tier(s.awareness, E.tiers.aware), adopt: tier(good, E.tiers.adopt), rep: tier(s.reputation, E.tiers.rep) };
    const fits = (need) => Object.entries(need).every(([k, v]) => (k === 'sum' ? stars.aware + stars.adopt + stars.rep >= v : stars[k] >= v));
    const route = E.routes.find((r) => fits(r.need)) || E.routes[E.routes.length - 1];
    const fillS = (t) => t.replaceAll('{shelter}가', j(s.shelterName, '이가')).replaceAll('{shelter}를', j(s.shelterName, '을를')).replaceAll('{shelter}', s.shelterName);
    const title = { id: route.id, art: route.art, name: route.name, text: fillS(route.text) };
    const owner = (s.staff.find((x) => x.role === 'owner') || {}).name || '선생님';
    const fill = (t, e) => t.replaceAll('{shelter}', s.shelterName).replaceAll('{owner}', owner).replaceAll('{name}', e.name);
    const kept = s.album.filter((e) => !e.back);
    // 마음을 닫았던 아이를 먼저, 나머지는 앨범 전체에서 고르게 뽑는다
    const picks = kept.filter((e) => e.closed).slice(0, 2);
    const rest = kept.filter((e) => !picks.includes(e));
    const want = Math.min(E.voices - picks.length, rest.length);
    for (let i = 0; i < want; i++) picks.push(rest[Math.floor(i * rest.length / want)]);
    const voices = picks.map((e) => {
      const sp = D.BREEDS[e.breed] ? D.BREEDS[e.breed].species : 'dog';
      const years = (s.day - e.day) / (12 * DPM);
      const pool = e.closed ? E.lines.closed : years >= 5 ? E.lines.old.concat(E.lines.any) : years < 1 ? E.lines.recent.concat(E.lines.any)
        : E.lines.any.concat(E.lines[sp] || []);
      return { name: e.name, breed: e.breed, coat: e.coat, years: Math.floor(years), text: fill(pool[(e.id * 7) % pool.length], e) };
    });
    return {
      ...sum, years: E.years, title, voices, owner, stars, good, awareness: Math.round(s.awareness),
      cityDrop: Math.min(80, Math.round(s.awareness * 0.5 + (s.stats.fund || 0) * 2)),   // 도시 유기동물 신고 감소율(가상 수치, 인식 개선·기금에 비례)
      born: s.stats.born, doorstep: s.stats.doorstep, donorsPeak: s.stats.donorsPeak, rep: Math.round(s.reputation),
      facilities: Object.keys(s.facilities).length, staff: s.staff.filter((x) => x.role !== 'owner' && x.role !== 'volunteer').length,
      yearLog: s.yearLog.slice(),
    };
  };
  SIM.continueAfterEnding = (s) => { if (s.ending) s.ending.continued = true; return { ok: true }; };

  // 입양 조건: 건강·신뢰·사회성 + 접종 + 생후 60일 이상, 임신·수유 중이 아님.
  // 중성화는 필수가 아니다(2026-10-04). 대신 중성화 안 한 아이는 파양 위험이 조금 높다
  SIM.readyIssues = (a) => {
    const out = [];
    if (a.injured) out.push('수술');
    if (a.pregnant) out.push('출산 전');
    if (a.nursingLeft) out.push('수유 중');
    if (a.ageDays < D.MEDICAL.babyAdoptDays) out.push('너무 어려요');
    if (a.species !== 'exotic') {
      if (!a.vaccinated) out.push('예방접종');
      if (a.health < D.ADOPT_READY.health) out.push('건강');
      if (a.trust < D.ADOPT_READY.trust) out.push('신뢰');
      if (a.social < D.ADOPT_READY.social) out.push('사회성');
    } else {
      if (a.health < D.ADOPT_READY.health) out.push('건강');
      if (a.trust < 40) out.push('신뢰');
    }
    return out;
  };
  SIM.isReady = (a) => SIM.readyIssues(a).length === 0;

  // 시험 봇 규칙(v0.14): 밸런스 시험(tools/sim_test.js)과 게임 시험 모드(?test&auto&bot)가 함께 쓴다.
    // 사람 플레이를 흉내 낸 단순 규칙이라 실제 플레이와는 다를 수 있다
    SIM.botAct = (s) => {
    // 후반: 돈이 넉넉하면 특수 사업·영상·업그레이드·굿즈에 쓴다(v0.9, 자금 폭주를 실제 플레이에 가깝게 재기)
    if (s.day % 30 === 15) {
      for (const k of Object.keys(D.PROJECTS)) if (!SIM.projectLock(s, k) && s.money > D.PROJECTS[k].cost * 3) SIM.startProject(s, k);
      if (s.channel && s.money > 3_000_000) SIM.shootVideo(s, 'review');
      if (s.money > 20_000_000) for (const f of Object.values(s.facilities)) { const u = SIM.upgradeInfo(f); if (u && s.money > u.cost * 4) SIM.upgrade(s, f.id); }
      if (s.money > 10_000_000) SIM.developGoods(s);
      for (const B of D.BRANCHES) if (s.money > B.cost * 2) SIM.openBranch(s, B.no, ['cafe', 'senior', 'cat'][B.no % 3]);
    }

    const cap = SIM.capacity(s);
    // 지을 자리: 기준 건물 옆에서 먼저 찾고, 없으면 아무 빈자리
    let want = null;
    const spot = () => { for (let y = 0; y < s.gridH - 1; y++) for (let x = 0; x < s.gridW; x++) if (SIM.canPlace(s, want, x, y)) return [x, y]; return [-9, -9]; };
    const near = (type) => {
      const f = Object.values(s.facilities).find((g) => g.type === type);
      if (!f) return spot();
      for (const [cx, cy] of SIM.cellsOf(f)) for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[-1,-1],[1,1]]) {
        const x = cx + dx, y = cy + dy;
        if (SIM.canPlace(s, want, x, y)) return [x, y];
      }
      return spot();
    };
    const build = (type, pos) => { want = type; SIM.build(s, type, ...pos()); };
    const has = (t) => Object.values(s.facilities).some((f) => f.type === t);
    const building = (t) => Object.values(s.facilities).some((f) => f.type === t && f.buildLeft);
    const hasRole = (r) => s.staff.some((x) => x.role === r);
    // 고정비를 감당할 수 있을 때만 사람을 늘린다
    const monthlyIn = s.donors * s.donorFee + (s.corporate ? s.corporate.monthly : 0);
    const monthlyOut = s.staff.reduce((a, x) => a + SIM.salary(x), 0) + Object.values(s.facilities).reduce((a, f) => a + D.FACILITIES[f.type].upkeep, 0);
    const canAfford = (role) => monthlyIn > monthlyOut + D.ROLES[role].base + D.ROLES[role].perStat * 15;
    const hire = (role) => {
      if (!canAfford(role)) return;
      if (!s.jobPosts[role]) SIM.postJob(s, role);
      const c = s.jobPosts[role] && s.jobPosts[role].list; if (!c) return;   // 채용 개편: 지원자는 며칠 뒤에 나온다
      const best = c.map((x, i) => [x.stats[D.ROLES[role].main], i]).sort((a, b) => b[0] - a[0])[0][1];
      SIM.hireCandidate(s, role, best);
    };
    if (cap.nl >= cap.large && !building('bigkennel') && s.money > 2_000_000) build('bigkennel', () => near('yard'));
    if (cap.ns >= cap.small && !building('kennel') && s.money > 2_000_000) build('kennel', () => near('yard'));
    if (cap.nc >= cap.cat && !building('cattery') && s.money > 1_500_000) build('cattery', () => near('clinic'));
    if (!has('yard') && s.money > 1_500_000) build('yard', () => near('kennel'));
    if (!hasRole('trainer') && s.money > 1_500_000) hire('trainer');
    if (!has('clinic') && s.money > 3_000_000) build('clinic', () => near('kennel'));
    if (!hasRole('vet') && has('clinic') && s.money > 2_000_000) hire('vet');
    if (!hasRole('manager') && s.day > 30 && s.money > 2_000_000) hire('manager');
    if (!hasRole('groomer') && s.money > 3_000_000) hire('groomer');
    if (!has('adoption') && s.money > 2_500_000) build('adoption', () => near('yard'));
    if (s.land < 2 && s.money > 15_000_000) SIM.expandLand(s);
    if (s.staff.filter((x) => x.role === 'volunteer').length < 4 && !s.volPost && s.money > 500_000) SIM.postVolunteers(s);
    for (const a of [...s.applicants]) { SIM.interview(s, a.id); if (a.stats.care >= 3) SIM.acceptVolunteer(s, a.id); else SIM.rejectApplicant(s, a.id); }
    // 진료: 진료실·수의사가 없으면 자금이 있을 때 밖에서 접종·중성화를 맡긴다
    if (!SIM.inHouse(s)) {
      for (const a of s.animals) {
        for (const kind of ['vaccine', 'neuter']) {
          // 접종은 싸고 급하니 먼저, 중성화는 여유가 있을 때
          const reserve = kind === 'vaccine' ? 200_000 : 500_000;
          if (SIM.needs(a, kind) && s.money > SIM.medCost(s, a, kind) + reserve) SIM.treat(s, a.id, kind);
        }
      }
    }
    if (s.day % 45 === 10 && s.money > 1_500_000) SIM.campaign(s, 'snsVideo');
    if (s.day % 90 === 80 && !s.quarterFinance && s.money > 300_000) SIM.campaign(s, 'finance');
    if (s.trend && SIM.trendPhase(s) === 'viral' && s.money > 1_500_000) SIM.campaign(s, 'school');
    if (s.day % 60 === 20 && s.money > 1_200_000) SIM.campaign(s, 'poster');
  };

  G.SIM = SIM;
})(window);
