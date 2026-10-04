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
  SIM.dateLabel = (day) => {
    const d = SIM.dateOf(day);
    return `${d.year}년차 ${d.month}월 ${Math.ceil(d.dayOfMonth / 7.5)}주`;
  };

  /* ---------- 장부: 돈이 움직일 때는 모두 여기를 거친다 ---------- */
  function income(s, key, amt) {
    amt = Math.round(amt);
    s.money += amt;
    s.ledger.income[key] = (s.ledger.income[key] || 0) + amt;
  }
  function expense(s, key, amt) {
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
      inv: { ...D.START_ITEMS }, autoBuy: false, goodsLog: [], shortNotice: {},
      feeLevel: 1, loans: [], loanDefault: false, intakePolicy: 'ask', resolve: !!C.resolve,
      autoReport: false, reportDue: null, level: SIM.levelFor(C.reputation), autoMed: true,
      corporate: null, corporateOffered: false, subsidy: false, quotaLeft: 0,
      jobPosts: {}, volPost: null, applicants: [], hiredNamed: [],
      album: [], pending: [],
      ledger: newLedger(), report: null, prevReport: null,
      quarterFinance: false, fundraisedQ: 0, acctFails: 0, lowFunds: 0,
    };
    s.ledger.repStart = s.reputation;
    // 시작은 봉사자가 아니라 '나'
    s.staff.push({ id: s.nextId++, name: s.player.name, role: 'owner', gender: s.player.gender, level: 1, exp: 0, stats: { ...D.OWNER.stats[s.career] } });
    if (!s.tutorial) {
      placeFacility(s, 'kennel', 3, 4);
      placeFacility(s, 'cattery', 5, 5);
      if (C.extra.includes('yard')) placeFacility(s, 'yard', 2, 5);
      intakeAnimal(s, 'jindo', true);
      intakeAnimal(s, 'korshort', true);
      pushFeed(s, `${j(s.shelterName, '이가')} 문을 열었다. 첫 식구는 둘.`, 'calm');
    } else {
      pushFeed(s, `${s.shelterName} 자리에 빈 땅이 생겼다. 무엇부터 지을까?`, 'calm');
    }
    return s;
  };

  /* ---------- 보호소 등급 ---------- */
  SIM.levelFor = (rep) => D.LEVELS.filter((l) => rep >= l.rep).pop().lv;
  SIM.levelInfo = (lv) => D.LEVELS.find((l) => l.lv === lv);
  function checkLevel(s, ev) {
    const lv = SIM.levelFor(s.reputation);
    if (lv <= s.level) return;
    s.level = lv;
    const opened = Object.values(D.FACILITIES).filter((f) => f.lv === lv).map((f) => f.name);
    ev.push({ type: 'popup', title: `보호소 등급 Lv${lv}`, body: `${SIM.levelInfo(lv).name}이 되었어요.${opened.length ? `\n새로 지을 수 있어요: ${opened.join(', ')}` : ''}` });
    pushFeed(s, `우리 보호소가 '${SIM.levelInfo(lv).name}'로 불리기 시작했다`, 'good');
  }

  // 예전 v2 저장에 없던 값을 채운다
  SIM.migrate = (s) => {
    if (s.level == null) s.level = SIM.levelFor(s.reputation);
    if (s.intakePolicy == null) s.intakePolicy = 'ask';
    if (s.resolve == null) s.resolve = !!D.CAREERS[s.career || 'ordinary'].resolve;
    if (s.autoReport == null) s.autoReport = false;
    if (s.reportDue === undefined) s.reportDue = null;
    if (s.autoMed == null) s.autoMed = true;
    if (s.gridW == null) { s.gridW = D.GRID.cols; s.gridH = D.GRID.rows; s.land = 0; }
    if (!s.shelterName) s.shelterName = '우리 보호소';
    if (!s.player) s.player = { name: '나', gender: 'f' };
    if (s.tutorial === undefined) s.tutorial = null;
    s.stats.born = s.stats.born || 0; s.stats.placed = s.stats.placed || 0; s.stats.doorstep = s.stats.doorstep || 0;
    for (const a of s.animals) {
      if (a.sex == null) { a.sex = (a.id % 2) ? 'F' : 'M'; a.neutered = a.species === 'exotic' ? null : false; a.vaccinated = false; a.pregnant = false; a.dueIn = 0; a.nursingLeft = 0; }
    }
    for (const f of Object.values(s.facilities)) if (f.buildLeft == null) f.buildLeft = 0;
    return s;
  };

  /* ---------- 공용 ---------- */
  function pushFeed(s, text, kind) {
    s.feed.unshift({ day: s.day, text, kind });
    if (s.feed.length > 60) s.feed.length = 60;
  }
  const idx = (s, x, y) => y * s.gridW + x;
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

  function freeHome(s, species) {
    const types = species === 'dog' ? ['kennel'] : species === 'cat' ? ['cattery'] : ['exotic', 'kennel'];
    for (const type of types) {
      for (const f of facList(s, type)) {
        const n = s.animals.filter((a) => a.home === f.id).length;
        if (n < D.FACILITIES[type].cap) return f.id;
      }
    }
    return null;
  }
  // 특수동물이 전용 사육장이 아닌 곳에 있으면 '임시 거처'
  SIM.makeshift = (s, a) => a.species === 'exotic' && s.facilities[a.home] && s.facilities[a.home].type !== 'exotic';
  SIM.capacity = (s) => {
    const dog = facList(s, 'kennel').length * D.FACILITIES.kennel.cap;
    const cat = facList(s, 'cattery').length * D.FACILITIES.cattery.cap;
    const nd = s.animals.filter((a) => a.species === 'dog').length;
    const nc = s.animals.filter((a) => a.species === 'cat').length;
    const exo = facList(s, 'exotic').length * D.FACILITIES.exotic.cap;
    const ne = s.animals.filter((a) => a.species === 'exotic').length;
    return { dog, cat, nd, nc, exo, ne };
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
  SIM.salary = (st) => st.role === 'volunteer' ? 0
    : D.ROLES[st.role].base + D.ROLES[st.role].perStat * Object.values(st.stats).reduce((a, b) => a + b, 0);

  function makeVolunteer(s) {
    return {
      id: s.nextId++, name: personName(s), role: 'volunteer', level: 1, exp: 0,
      stats: { care: randInt(s, 2, 6), heal: randInt(s, 0, 2), train: randInt(s, 1, 3), groom: randInt(s, 0, 3), acct: randInt(s, 0, 3), sns: randInt(s, 0, 4) },
      interviewed: false, trained: false, mistakes: 0,
    };
  }

  function makeCandidate(s, role) {
    // 평판이 높을수록 주 능력치가 높은 사람이 지원한다
    const r = D.ROLES[role];
    const stats = {};
    for (const k of Object.keys(D.STATS)) stats[k] = randInt(s, 1, 4);
    stats[r.main] = clamp(Math.round(2 + s.reputation / 120 + rand(s) * 3 + D.CAREERS[s.career].hireBonus), 1, 9);
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
          for (const c of D.COMBOS) if (f.type === c.a && g.type === c.b) out[c.id].add(g.id);
        }
      }
    }
    return out;
  };

  function checkNewCombos(s, events) {
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

  function chooseBreed(s) {
    const keys = Object.keys(D.BREEDS);
    const wave = trendPhase(s) === 'wave';
    return weighted(s, keys, (k) => D.BREEDS[k].base + (wave && k === s.trend.breed ? D.TREND.waveWeight * s.trend.intensity : 0));
  }

  /* ---------- 동물 들어오기 ---------- */
  SIM.ageLabel = (days) => {
    const m = Math.floor(days / 30);
    return m < 12 ? `${Math.max(1, m)}개월` : `${Math.floor(m / 12)}살`;
  };
  SIM.ageGroup = (a) => (a.ageDays < 365 ? D.AGE.groups[0] : a.ageDays >= 96 * 30 ? D.AGE.groups[2] : D.AGE.groups[1]);
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
    const sex = rand(s) < 0.5 ? 'F' : 'M';
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
      injured, surgeryCost: cost,
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
      s.reputation = Math.max(0, s.reputation - 1);
      if (events) events.push({ type: 'toast', text: `자리가 없어요. ${bn} 한 마리를 ${j(npc, '으로')} 보냈어요` });
      pushFeed(s, `더 받을 자리가 없어 ${j(bn, '이가')} ${j(npc, '으로')} 옮겨 갔다`, 'warn');
    }
  }

  // 자리를 찾아 실제로 들인다
  function admit(s, a, events) {
    const b = D.BREEDS[a.breed];
    const home = freeHome(s, b.species);
    if (!home) { sendAway(s, a, events, 'full'); return null; }
    a.home = home;
    s.animals.push(a);
    s.stats.rescued++; s.ledger.rescued++;
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
    const a = makeAnimal(s, breedKey, quiet, opts);
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
    const store = has(s, 'storage') ? 0.85 : 1;
    const need = {};
    for (const [k, it] of Object.entries(D.ITEMS)) {
      const p = it.per;
      need[k] = ((p.dog || 0) * (dogs * dogCut + exo * 0.6) + (p.fat || 0) * fat + (p.allergic || 0) * allergic + (p.cat || 0) * cats + (p.all || 0) * all + (p.sick || 0) * sick) * store;
    }
    return need;
  };
  SIM.daysLeft = (s, item, need) => {
    const n = (need || SIM.dailyNeed(s))[item];
    return n > 0 ? s.inv[item] / n : Infinity;
  };

  SIM.buy = (s, item, packs, auto) => {
    const it = D.ITEMS[item];
    const cost = it.price * packs * (auto ? D.AUTO_BUY.markup : 1);
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
    // 처음 바닥난 날과 그 뒤 열흘마다 알린다
    for (const k of Object.keys(short)) {
      if (!s.shortNotice[k] || s.day - s.shortNotice[k] >= 10) {
        s.shortNotice[k] = s.day;
        ev.push({ type: 'toast', text: `${j(D.ITEMS[k].name, '이가')} 떨어졌어요. ${D.ITEMS[k].lack}` });
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
    let p = Math.min(0.6, s.donors / 250 + s.reputation / 2000);
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
    for (let i = 0; i < n; i++) {
      const ageDays = c.baby ? randInt(s, 20, 50) : c.senior ? randInt(s, 110, 150) * 30 : undefined;
      const a = makeAnimal(s, breed, false, { ageDays });
      if (c.baby) { a.pregnant = false; a.injured = false; a.health = randInt(s, 35, 55); a.trust = randInt(s, 30, 50); }
      admit(s, a, null);
    }
    s.stats.doorstep += n;
    ev.push({ type: 'popup', title: '보호소 앞에 두고 간 아이', body: c.text(n) });
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
        sex: rand(s) < 0.5 ? 'F' : 'M', neutered: false, vaccinated: false, pregnant: false, dueIn: 0, nursingLeft: 0,
        ageDays: 0, bornHere: true, health: 60, trust: 70, social: 40,
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
    const c = D.MEDICAL[kind].cost[a.species];
    return c == null ? null : Math.round(c * (SIM.inHouse(s) ? D.MEDICAL.inHouse : 1));
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
    if (kind === 'vaccine') a.vaccinated = true; else a.neutered = true;
    return { ok: true, msg: `${a.name} ${D.MEDICAL[kind].name} 완료 (${won(cost)})` };
  }
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
  SIM.tick = (s) => {
    const ev = [];
    s.day++;
    for (const f of Object.values(s.facilities)) {
      if (!f.buildLeft) continue;
      f.buildLeft--;
      if (!f.buildLeft) {
        ev.push({ type: 'toast', text: `${D.FACILITIES[f.type].name} 완공!` });
        ev.push({ type: 'built', id: f.id });
        checkNewCombos(s, ev);
      }
    }
    const cs = SIM.combos(s);
    const phase = trendPhase(s);

    // 봉사자는 그날 60% 확률로 나온다
    const attending = new Set(s.staff.filter((st) => st.role !== 'volunteer' || rand(s) < 0.6).map((st) => st.id));
    const short = consume(s, ev);
    const heal = power(s, 'heal', attending) * (has(s, 'clinic') ? 1 : 0.4) * (short.meds ? 0.5 : 1);
    const train = power(s, 'train', attending);
    const care = power(s, 'care', attending);
    const groom = power(s, 'groom', attending);
    const n = Math.max(6, s.animals.length);
    const rainy = hasBuff(s, 'rain');

    const births = [];
    for (const a of s.animals) {
      a.days++;
      a.ageDays++;
      if (a.nursingLeft) a.nursingLeft--;
      if (a.pregnant && --a.dueIn <= 0) births.push(a);
      const b = D.BREEDS[a.breed];
      const fac = s.facilities[a.home];
      const ms = SIM.makeshift(s, a) ? D.EXOTIC.makeshift : 1;
      const healBonus = (cs.care.has(fac.id) || cs.catvet.has(fac.id)) ? 1.3 : 1;
      let starving = (a.species === 'dog' && short.dogFood) || (a.species === 'cat' && short.catFood);
      if (a.allergy && a.allergy.known) starving = !!short.hypoFood;
      if (a.allergy && !a.allergy.known && !starving && rand(s) < D.ALLERGY.flare) allergyFlare(s, a, ev);
      if (starving) a.health = clamp(a.health - 1, 0, 100);
      else a.health = clamp(a.health + (0.4 + (heal * 4.8 / n) * healBonus + care * 0.5 / n) * ms, 0, a.injured ? 30 : 100);
      let tg = 0.25 + train * 3 / n + care * 0.6 / n;
      if (a.closed && !a.opened) tg *= 0.5 * (s.resolve ? D.RESOLVE.closedTrust : 1);
      if (short.towels) tg *= 0.6;
      a.trust = clamp(a.trust + tg * ms, 0, 100);
      let sg = 0.2 + train * 1.8 / n + care * 0.6 / n + (short.toys ? 0 : 0.15);
      if (a.species === 'dog' && has(s, 'yard')) sg += 0.6 * b.energy * (cs.walk.has(fac.id) ? 1.3 : 1);
      if (rainy) sg *= 0.5;
      if (a.fat) sg *= D.DIET.socialMult;
      a.social = clamp(a.social + sg * ms, 0, 100);
      if (a.fat && !short.dietFood) {
        a.dietDays++;
        if (a.dietDays >= D.DIET.days) {
          a.fat = false;
          s.stats.diets++;
          s.reputation += s.intakePolicy === 'care' ? 4 : 2;
          ev.push({ type: 'toast', text: `${a.name} 다이어트 성공! 몸이 가벼워졌어요` });
          pushFeed(s, `${a.name}의 다이어트 전후 사진이 화제다`, 'good');
        }
      }
      if (a.closed && !a.opened && a.trust >= 40) {
        a.opened = true;
        s.reputation += s.intakePolicy === 'care' ? 6 : 4;
        ev.push({ type: 'popup', title: '마음을 열었어요', body: `${j(a.name, '이가')} 처음으로 꼬리를 흔들었어요.` });
        pushFeed(s, `마음을 닫았던 ${j(a.name, '이가')} 사람 손에 머리를 기댔다`, 'good');
      }
    }
    if (short.pads || short.litter) s.reputation = Math.max(0, s.reputation - 0.15);
    for (const m of births) giveBirth(s, m, ev);
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
    const fee = D.ADOPT_FEES[s.feeLevel];
    const celebOn = activeCelebs(s).length > 0;
    for (const a of [...s.animals]) {
      if (!SIM.isReady(a)) continue;
      let p = 0.03 * D.BREEDS[a.breed].adopt * (1 + s.reputation / 400) * fee.adopt * (1 + groom * 0.04) * (a.fat ? D.DIET.adoptMult : 1) * SIM.ageGroup(a).adopt;
      if (has(s, 'adoption')) p *= 1.5;
      if (cs.meet.size) p *= 1.2;
      if (activeCampaign(s, 'adoptDay')) p *= 1.6;
      if (celebOn) p *= 1.3;
      if (s.trend && a.breed === s.trend.breed && (phase === 'viral' || phase === 'boom')) p *= 1.4;
      if (rand(s) >= p) continue;
      if (s.inv.carriers < 1) {
        if (!s.shortNotice.carrierAdopt || s.day - s.shortNotice.carrierAdopt >= 10) {
          s.shortNotice.carrierAdopt = s.day;
          ev.push({ type: 'toast', text: `${a.name}의 새 가족이 왔는데 이동장이 없어요` });
        }
        continue;
      }
      s.inv.carriers--;
      s.animals = s.animals.filter((x) => x !== a);
      if (a.species === 'exotic') {
        s.stats.placed++;
        s.reputation += 6;
        ev.push({ type: 'adopt', animal: a.id, text: `${D.BREEDS[a.breed].name} ${j(a.name, '이가')} 전문 보호시설로 떠났어요` });
        pushFeed(s, `${D.BREEDS[a.breed].name} ${j(a.name, '이가')} 넓은 전문 보호시설에서 새 삶을 시작했다`, 'good');
        continue;
      }
      s.stats.adopted++; s.ledger.adopted++; s.ledger.stayDays += a.days;
      if (fee.fee) income(s, 'fee', fee.fee);
      const gift = randInt(s, 10, 30) * 10_000;
      income(s, 'gift', gift);
      s.reputation += a.closed ? 5 : 2;
      const willReturn = a.trust < 75 && rand(s) < fee.returnRate * 3;
      s.album.unshift({ id: a.id, name: a.name, breed: a.breed, day: s.day, ageDays: a.ageDays, news: [], next: 0,
        returnDay: willReturn ? s.day + randInt(s, 30, 90) : null, closed: a.closed });
      if (s.album.length > 80) s.album.length = 80;
      ev.push({ type: 'adopt', animal: a.id, text: `${a.name} 입양! (책임비 ${won(fee.fee)} · 후원 ${won(gift)})` });
      pushFeed(s, a.closed ? `한때 마음을 닫았던 ${j(a.name, '이가')} 새 가족을 만났다` : `${a.name}의 새 가족이 입양 후기를 올렸다`, 'good');
    }

    // 입양 간 아이 소식과 '다시 돌아온 아이'
    for (const e of s.album) {
      if (e.returnDay && s.day >= e.returnDay && !e.back) {
        e.back = true;
        s.stats.returned++;
        s.reputation = Math.max(0, s.reputation - 3);
        intakeAnimal(s, e.breed, false, ev, { returned: true, name: e.name, ageDays: e.ageDays + (s.day - e.day) });
        ev.push({ type: 'popup', title: '다시 돌아온 아이', body: `${j(e.name, '이가')} 새 가족과 맞지 않아 돌아왔어요.\n입양 전 상담과 책임비가 이런 일을 줄여요.` });
        continue;
      }
      if (e.back || e.next >= D.ADOPT_NEWS.length) continue;
      const [months, lines] = D.ADOPT_NEWS[e.next];
      if (s.day - e.day >= months * DPM) {
        const text = pick(s, lines);
        e.news.push({ day: s.day, text });
        e.next++;
        pushFeed(s, `[입양 소식] ${e.name}: ${text}`, 'good');
      }
    }

    if (s.trend && s.day === s.trend.waveStart) {
      const bn = D.BREEDS[s.trend.breed].name;
      ev.push({ type: 'popup', title: '반짝 인기가 지나간 자리', body: `길에서 발견되는 ${j(bn, '이가')} 늘고 있어요.\n한동안 ${j(bn, '이가')} 많이 들어올 거예요.` });
    }

    // 길에서 오는 아이들 + 지자체 위탁 의무 수용
    let pIn = 0.1 + (100 - s.awareness) / 100 * 0.18;
    if (phase === 'wave') pIn += 0.2 * s.trend.intensity;
    // 튜토리얼 중(첫 식구가 오기 전)에는 길에서 오는 아이가 없다
    const quiet = s.tutorial && s.tutorial.step < 4;
    if (!quiet && rand(s) < Math.min(0.85, pIn)) intakeAnimal(s, chooseBreed(s), false, ev);
    if (s.subsidy && s.quotaLeft > 0 && rand(s) < 0.15) { s.quotaLeft--; intakeAnimal(s, chooseBreed(s), false, ev, { forced: true }); }

    donations(s);
    volunteerApplicants(s, ev);

    if (activeCampaign(s, 'school')) s.awareness = clamp(s.awareness + 0.12, 0, 100);

    for (const st of s.staff) {
      st.exp++;
      if (st.exp >= 40 * st.level && st.level < 5) {
        st.exp = 0; st.level++;
        const main = st.role === 'volunteer' ? 'care' : D.ROLES[st.role].main;
        st.stats[main] = Math.min(10, st.stats[main] + 1);
        ev.push({ type: 'toast', text: `${st.name} 레벨 ${st.level}! ${D.STATS[main]} +1` });
      }
    }

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
    s.reputation = Math.round(clamp(s.reputation, 0, 999) * 10) / 10;
    checkLevel(s, ev);
    return ev;
  };

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

    income(s, 'donors', s.donors * s.donorFee);
    if (s.corporate && s.corporate.until > s.day) income(s, 'corporate', s.corporate.monthly);
    else if (s.corporate) { s.corporate = null; s.corporateOffered = false; pushFeed(s, '기업 후원 계약이 끝났다', 'calm'); }
    if (s.subsidy) { income(s, 'subsidy', D.SUBSIDY.monthly); s.quotaLeft = D.SUBSIDY.quota; }

    // 굿즈샵
    const shops = facList(s, 'shop').length;
    if (shops) {
      const merch = SIM.combos(s).merch.size ? 1.3 : 1;
      const sales = shops * (s.reputation * 2000 + power(s, 'sns') * 40_000 * s.snsMult) * (0.8 + rand(s) * 0.4) * merch;
      income(s, 'goods', sales);
      expense(s, 'goodsCost', sales * 0.4);
    }

    let salary = 0;
    for (const st of s.staff) salary += SIM.salary(st);
    expense(s, 'salary', salary);
    let upkeep = 0;
    for (const f of facList(s)) upkeep += D.FACILITIES[f.type].upkeep;
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

    const gain = Math.round(s.reputation / 50 + s.awareness / 30 + rand(s) * 2);
    const churn = Math.round(s.donors * (s.acctFails ? 0.06 : 0.04));
    s.donors = Math.max(0, s.donors + gain - churn);
    s.stats.donorsPeak = Math.max(s.stats.donorsPeak, s.donors);
    s.awareness = clamp(s.awareness - 1, 10, 100);
    s.npcRep = s.npcRep.map((r, i) => r + D.NPCS[i].size * (6 + rand(s) * 8));

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
    } else if (r < 0.22) {
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
    if (!(s.tutorial && s.tutorial.step < 4) && rand(s) < D.DOORSTEP.monthlyChance) doorstep(s, ev);

    // 특수동물 이벤트
    if (D.EXOTIC.enabled && monthIdx >= D.EXOTIC.fromMonth && rand(s) < D.EXOTIC.monthlyChance && !s.pending.some((p) => p.kind === 'exotic')) {
      s.pending.push({ kind: 'exotic', breed: pick(s, ['raccoon', 'meerkat']), n: randInt(s, D.EXOTIC.count[0], D.EXOTIC.count[1]) });
    }

    // 기업 후원 제안
    if (!s.corporate && !s.corporateOffered && s.reputation >= D.CORPORATE.minRep && s.acctFails === 0) {
      s.corporateOffered = true;
      s.pending.push({ kind: 'corporate' });
    }

    // 자금 부족
    if (s.money < 0) {
      s.lowFunds++;
      if (s.lowFunds === 1) {
        ev.push({ type: 'popup', title: '자금이 바닥났어요', body: `${s.resolve ? '포기하지 않는 마음으로 한 달은 더 버틸 수 있어요. 하지만 ' : ''}계속 마이너스면 아이들 일부를 이웃 보호소로 보내야 해요.\n대출이나 긴급 모금, 직원 조정을 생각해 보세요.` });
      } else if (s.lowFunds === 2 + (s.resolve ? D.RESOLVE.delay : 0) && s.animals.length) {
        s.pending.push({ kind: 'forceTransfer', n: Math.max(1, Math.ceil(s.animals.length * 0.25)) });
      } else if (s.lowFunds >= 3 + (s.resolve ? D.RESOLVE.delay : 0)) {
        const paid = s.staff.filter((x) => x.role !== 'volunteer' && x.role !== 'owner').sort((a, b) => SIM.salary(b) - SIM.salary(a));
        if (paid.length) {
          s.staff = s.staff.filter((x) => x !== paid[0]);
          ev.push({ type: 'popup', title: '직원이 떠났어요', body: `급여가 밀려 ${D.ROLES[paid[0].role].name} ${j(paid[0].name, '이가')} 보호소를 떠났어요.` });
        }
      }
    } else s.lowFunds = 0;

    if (monthIdx % 3 === 0) quarterReport(s, ev);
    if (monthIdx % 12 === 0) ev.push({ type: 'year', summary: SIM.summary(s) });
  }

  function startTrend(s, ev) {
    const breed = pick(s, D.TREND_BREEDS);
    const delay = randInt(s, D.TREND.waveDelayMonths[0], D.TREND.waveDelayMonths[1]);
    s.trend = {
      breed, viralDay: s.day, intensity: 1, celebDone: false,
      waveStart: s.day + delay * DPM,
      waveEnd: s.day + (delay + D.TREND.waveMonths) * DPM,
    };
    const bn = D.BREEDS[breed].name;
    pushFeed(s, D.FEED.viral(bn)[0], 'viral');
    ev.push({ type: 'popup', title: `SNS에서 ${bn} 열풍`, body: `"${bn} 키우는 일상" 영상이 퍼지고 있어요.\n반짝 인기가 지나간 뒤를 대비해야 할지도.` });
  }

  /* ---------- 분기 보고 ---------- */
  SIM.acctScore = (s) => Math.round(power(s, 'acct') * 3 + (s.quarterFinance ? 15 : 0));
  SIM.acctRequired = (s) => 8 + Math.floor(Object.values(s.ledger.income).reduce((a, b) => a + b, 0) / 1_000_000) * 3;

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
  SIM.resolve = (s, choice, extra) => {
    const p = s.pending.shift();
    if (!p) return { ok: false };
    const ev = [];
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
      expense(s, 'medical', a.surgeryCost);
      a.injured = false;
      a.health = Math.max(a.health, 40);
      if (s.intakePolicy === 'care') s.reputation += 3;
      ev.push({ type: 'toast', text: `${a.name} 수술 성공! 이제 회복만 남았어요` });
    } else if (p.kind === 'corporate') {
      if (choice === 'accept') {
        s.corporate = { until: s.day + D.CORPORATE.months * DPM, monthly: D.CORPORATE.monthly };
        pushFeed(s, '지역 기업과 1년 후원 협약을 맺었다', 'good');
      } else s.corporateOffered = false;
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
    if (f.lv > s.level) return { ok: false, msg: `보호소 등급 Lv${f.lv}부터 지을 수 있어요` };
    if (!SIM.canPlace(s, type, x, y)) return { ok: false, msg: SIM.size(type) > 1 ? `${SIM.size(type)}×${SIM.size(type)}칸 빈자리가 필요해요 (누른 칸이 왼쪽 위)` : '이미 시설이 있어요' };
    if (s.money < f.cost) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'facility', f.cost);
    placeFacility(s, type, x, y, f.days);
    return { ok: true, msg: `${j(f.name, '이가')} 공사를 시작했어요. ${f.days}일 뒤 완공`, events: [] };
  };

  SIM.demolish = (s, id) => {
    const f = s.facilities[id];
    if (!f) return { ok: false };
    if (s.animals.some((a) => a.home === id)) return { ok: false, msg: '아이들이 지내고 있어서 철거할 수 없어요' };
    for (const [cx, cy] of SIM.cellsOf(f)) s.grid[idx(s, cx, cy)] = null;
    delete s.facilities[id];
    income(s, 'refund', D.FACILITIES[f.type].cost * 0.3);
    return { ok: true };
  };

  SIM.postJob = (s, role) => {
    const r = D.ROLES[role];
    if (s.money < r.post) return { ok: false, msg: '자금이 부족해요' };
    expense(s, 'hiring', r.post);
    const list = [];
    for (const nm of D.NAMED) {
      if (nm.role !== role || s.hiredNamed.includes(nm.name) || s.reputation < nm.minRep * D.CAREERS[s.career].namedRepCut) continue;
      if (rand(s) < nm.chance) list.push({ name: nm.name, sprite: nm.sprite, title: nm.title, legend: !!nm.legend, role, stats: { ...nm.stats }, level: 1 });
    }
    while (list.length < 3) list.push(makeCandidate(s, role));
    s.jobPosts[role] = list.slice(0, 3);
    const legends = list.filter((c) => c.legend);
    return { ok: true, events: legends.length ? [{ type: 'popup', title: '전설의 인재가 지원했어요', body: legends.map((c) => `${c.title} ${c.name}`).join('\n') }] : [] };
  };

  SIM.hireCandidate = (s, role, i) => {
    const c = s.jobPosts[role] && s.jobPosts[role][i];
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
        s.trend.intensity = Math.max(0.2, s.trend.intensity * (1 - D.TREND.schoolCut));
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
  SIM.setIntakePolicy = (s, k) => { s.intakePolicy = k; return { ok: true }; };
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
    intakeAnimal(s, 'jindo', true, ev);
    intakeAnimal(s, 'korshort', true, ev);
    ev.push({ type: 'popup', title: '첫 식구가 왔어요', body: '동네 사람이 길에서 떠돌던 강아지와 고양이를 데려왔어요.\n이제부터 보호소가 바빠질 거예요.' });
    pushFeed(s, `${s.shelterName}에 첫 식구 둘이 들어왔다`, 'good');
    return ev;
  };
  // 안내를 건너뛰면 견사·묘사를 바로 짓고 첫 식구를 들인다
  SIM.skipTutorial = (s) => {
    const spot = (type) => { for (let y = 3; y < s.gridH - 1; y++) for (let x = 2; x < s.gridW; x++) if (SIM.canPlace(s, type, x, y)) return [x, y]; return null; };
    if (!Object.values(s.facilities).some((f) => f.type === 'kennel')) { const p = spot('kennel'); if (p) placeFacility(s, 'kennel', ...p); }
    if (!Object.values(s.facilities).some((f) => f.type === 'cattery')) { const p = spot('cattery'); if (p) placeFacility(s, 'cattery', ...p); }
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

  // 입양 조건: 건강·신뢰·사회성 + 접종 + (생후 6개월 이상이면) 중성화 + 생후 60일 이상, 임신·수유 중이 아님
  SIM.readyIssues = (a) => {
    const out = [];
    if (a.injured) out.push('수술');
    if (a.pregnant) out.push('출산 전');
    if (a.nursingLeft) out.push('수유 중');
    if (a.ageDays < D.MEDICAL.babyAdoptDays) out.push('너무 어려요');
    if (a.species !== 'exotic') {
      if (!a.vaccinated) out.push('예방접종');
      if (!a.neutered && a.ageDays >= D.MEDICAL.neuter.minDays) out.push('중성화');
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

  G.SIM = SIM;
})(window);
