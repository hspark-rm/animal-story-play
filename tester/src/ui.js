// 화면 위의 DOM 부분: 상단 정보, SNS 띠, 아래 판(시트), 사건 카드, 선택 창, 시작 화면, 저장.
(function (G) {
  const D = G.DATA, SIM = G.SIM, SPR = G.SPR, j = G.j;
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (v) => `${Math.round(v / 10000).toLocaleString()}만`;
  const SAVE_KEY = 'animal-story-save-v2';

  const UI = { sheet: null, modalOpen: false, tab: { people: 'staff', manage: 'campaign', build: 'fac' }, renaming: null };
  const BUILD = G.BUILD || { flavor: 'dev', version: '0' };
  // 배포판은 테스트용 하나로 통합했다(2026-10-04). 보호소 이름 짓기와 튜토리얼은 항상 켠다
  UI.features = { shelterName: true, tutorial: true };
  UI.versionText = `v${BUILD.version} · ${BUILD.flavor === 'dev' ? '개발용' : '테스트'}`;
  let state, hooks;
  const queue = [];   // 사건 카드와 선택 창을 차례로 띄운다

  /* ---------- 저장 ---------- */
  UI.load = () => {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      return s && s.v === D.SAVE_VERSION ? SIM.migrate(s) : null;
    } catch (e) { return null; }
  };
  UI.save = (s) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* 저장이 막힌 창에서도 게임은 계속된다 */ } };
  UI.clearSave = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ } };

  /* ---------- 상단 ---------- */
  UI.hud = () => {
    if (!state) return;
    $('date').textContent = SIM.dateLabel(state.day);
    $('shelter-name').textContent = state.shelterName || '';
    UI.tutorialTick();
    $('money').textContent = won(state.money);
    $('money').classList.toggle('neg', state.money < 0);
    $('rep').textContent = Math.round(state.reputation);
    $('aware').textContent = Math.round(state.awareness);
    $('donors').textContent = `${state.donors}명`;
    const rb = $('report-btn');
    rb.hidden = !state.reportDue;
    if (state.reportDue) {
      const left = state.reportDue.due - state.day;
      rb.textContent = `분기 보고서 제출 (D-${left})`;
      rb.classList.toggle('urgent', left <= 3);
    }
    const f = state.feed[0];
    if (f && $('ticker-text').textContent !== f.text) {
      $('ticker-text').textContent = f.text;
      $('ticker').classList.remove('flash'); void $('ticker').offsetWidth; $('ticker').classList.add('flash');
    }
  };
  UI.setSpeed = (v) => {
    for (const b of document.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === v));
  };

  UI.toast = (text) => {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), 2800);
  };

  /* ---------- 사건 카드·선택 창 차례 관리 ---------- */
  const icon = (kind, key, cls) => { const u = SPR.iconURL(kind, key, D); return u ? `<img alt="" ${cls ? `class="${cls}"` : ''} src="${u}">` : ''; };
  const sexMark = (a) => (a.sex === 'F' ? '♀' : '♂');
  // 사건 제목 → 사건 그림(event-*.png). 그림이 없으면 동물 아이콘
  const EVENT_ART = [
    [/콤보/, 'combo'], [/열풍/, 'trend'], [/반짝/, 'wave'], [/유행이 더|방문/, 'celeb'], [/물림/, 'bite'], [/봉사자에게|실수/, 'mistake'],
    [/회계 보고/, 'account'], [/기한/, 'deadline'], [/자금|아이들을 보내야|직원이 떠/, 'funds'], [/대출/, 'loan'], [/물품|마트/, 'goods'],
    [/신문/, 'news'], [/마음을 열/, 'open'], [/다이어트/, 'diet'], [/다친|수술/, 'surgery'], [/다시 돌아온/, 'return'],
    [/두고 간/, 'doorstep'], [/새 생명|출산/, 'birth'], [/알러지/, 'allergy'], [/등급/, 'level'], [/접종|중성화/, 'medical'],
    [/데려가|방문/, 'adopt'], [/보고서/, 'quarter'], [/결산|성과 보고|년이 지났/, 'year'], [/입양/, 'adopt'],
  ];
  function eventArt(title) {
    const hit = EVENT_ART.find(([re]) => re.test(title));
    return (hit && icon('event', hit[1])) || icon('animal', 'jindo');
  }

  UI.event = (title, body) => { queue.push({ type: 'event', title, body }); pump(); };
  function pump() {
    if (UI.modalOpen) return;
    const m = queue.shift();
    if (!m) { if (hooks) hooks.onModal(false); return; }
    UI.modalOpen = true;
    hooks.onModal(true);
    if (m.type === 'event') {
      $('event-art').innerHTML = eventArt(m.title);
      $('event-title').textContent = m.title;
      $('event-body').textContent = m.body;
      $('event').hidden = false;
      $('event-card').focus();
    } else {
      $('modal-title').textContent = m.title;
      $('modal-body').innerHTML = m.html;
      $('modal-actions').innerHTML = m.actions.map((a, i) => `<button type="button" data-i="${i}" class="${a.ghost ? 'ghost' : ''}" ${a.disabled ? 'disabled' : ''}>${a.label}${a.note ? `<small>${a.note}</small>` : ''}</button>`).join('');
      UI.currentChoice = m;
      $('modal').hidden = false;
      if (m.onShow) m.onShow();
      const first = $('modal-actions').querySelector('button:not([disabled])');
      if (first) first.focus();
    }
  }
  function closeOverlay() {
    $('event').hidden = true;
    $('modal').hidden = true;
    UI.modalOpen = false;
    UI.currentChoice = null;
    pump();
    if (!UI.modalOpen) UI.askPending();
    hooks.onChange();
  }
  function choice(title, html, actions, onShow) { queue.push({ type: 'choice', title, html, actions, onShow }); pump(); }

  /* ---------- 사건 처리 ---------- */
  UI.handle = (events) => {
    for (const e of events || []) {
      if (e.type === 'toast' || e.type === 'adopt') UI.toast(e.text);
      else if (e.type === 'popup') UI.event(e.title, e.body);
      else if (e.type === 'quarter') showReport(e.report, e.prev, true);
      else if (e.type === 'ending') showEnding(e.report);
      else if (e.type === 'visit') { if (hooks.onVisit) hooks.onVisit(e.animal, e.family); }
      else if (e.type === 'year') {
        const s = e.summary;
        UI.event(`${s.year}년차 결산`, `구조 ${s.rescued} · 입양 ${s.adopted} · 이송 ${s.transferred} · 다시 돌아온 아이 ${s.returned}\n정기후원자 ${s.donors}명 · 자금 ${won(s.money)}원\n이웃 보호소 ${s.total}곳 중 ${s.rank}위`);
      }
    }
    if (UI.sheet) UI.renderSheet();
  };

  // 10년 엔딩: 성과 보고 → 앨범 속 아이들의 한마디 → 계속 운영할지 고르기
  function showEnding(r) {
    const per = r.yearLog.map((y, i) => ({ year: y.year, n: y.adopted - (i ? r.yearLog[i - 1].adopted : 0) }));
    const top = Math.max(1, ...per.map((p) => p.n));
    const bars = per.map((p) => `<span class="ebar"><i style="height:${Math.round(p.n / top * 100)}%"></i><b>${p.n}</b><small>${p.year}</small></span>`).join('');
    const star = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
    choice(`엔딩: ${r.title.name}`, `${icon('event', r.title.art) || ''}<span class="end-title">${esc(state.shelterName)} · ${r.title.name}</span>
<span class="note">${esc(r.title.text)}</span>
<span class="end-grid end-stars"><span>인식 개선 (${r.awareness})</span><b>${star(r.stars.aware)}</b><span>성공적인 입양 (${r.good}마리)</span><b>${star(r.stars.adopt)}</b><span>평판 (${Math.round(r.rep)})</span><b>${star(r.stars.rep)}</b></span>
<span class="note">다온시의 유기동물 신고가 ${r.cityDrop}% 줄었어요.</span>
      `, [{ label: '10년 성과 보고 보기', run: () => { closeOverlay(); showReport10(r, bars); } }]);
  }
  function showReport10(r, bars) {
    choice(`${r.years}년 운영 성과 보고`, `<span class="end-title">${esc(state.shelterName)} · ${r.title.name}</span>
<span class="end-grid"><span>구조한 아이</span><b>${r.rescued}</b><span>새 가족을 만난 아이</span><b>${r.adopted}</b><span>여기서 태어난 아이</span><b>${r.born}</b><span>이웃 보호소로 보낸 아이</span><b>${r.transferred}</b><span>다시 돌아온 아이</span><b>${r.returned}</b><span>정기후원자 (최고)</span><b>${r.donors}명 (${r.donorsPeak}명)</b><span>남은 자금</span><b>${won(r.money)}원</b><span>평판</span><b>${r.rep}</b><span>이웃 보호소 순위</span><b>${r.total}곳 중 ${r.rank}위</b><span>시설 · 직원</span><b>${r.facilities}동 · ${r.staff}명</b></span>
<span class="note">해마다 입양 간 아이</span><span class="ebars">${bars}</span>`, [
      { label: '앨범 속 아이들의 한마디 듣기', run: () => { closeOverlay(); showVoices(r); } },
    ]);
  }
  function showVoices(r) {
    const list = r.voices.length
      ? r.voices.map((v) => `<span class="voice">${icon('animal', v.breed)}<span><b>${esc(v.name)}</b> <small>${D.BREEDS[v.breed].name}${v.years ? ` · 입양 ${v.years}년째` : ''}</small><br>“${esc(v.text)}”</span></span>`).join('')
      : '<span class="note">앨범이 비어 있어요. 그래도 이곳을 거쳐 간 아이들은 모두 따뜻한 밥을 먹었어요.</span>';
    choice('앨범 속 아이들이 전하는 말', list, [
      { label: '다음', run: () => { closeOverlay(); askContinue(r); } },
    ]);
  }
  function askContinue(r) {
    choice(`${r.years}년이 지났어요`, `${r.owner}님, ${r.years}년 동안 ${j(esc(state.shelterName), '을를')} 지켜 줘서 고마워요.\n여기서 이야기를 마칠 수도, 보호소를 계속 운영할 수도 있어요.`, [
      { label: '계속 운영하기', note: '지금 보호소 그대로 이어서', run: () => { SIM.continueAfterEnding(state); closeOverlay(); UI.save(state); UI.toast('보호소 운영을 이어 가요'); } },
      { label: '여기서 마치기', note: '저장을 지우고 처음 화면으로', ghost: true, run: () => { closeOverlay(); hooks.onNewGame(); } },
    ]);
  }

  // 플레이어가 골라야 하는 일
  UI.askPending = () => {
    if (UI.modalOpen || !state || !state.pending.length) return;
    const p = state.pending[0];
    const done = (c, extra) => { const r = SIM.resolve(state, c, extra); closeOverlay(); UI.handle(r.events); };
    if (p.kind === 'intake') {
      const a = p.animal, b = D.BREEDS[a.breed];
      const flags = [a.injured ? `크게 다쳤어요 (수술비 ${won(a.surgeryCost)}원)` : '', a.pregnant ? '임신했어요' : '', a.closed ? '마음을 닫았어요' : '', a.fat ? '다이어트가 필요해요' : ''].filter(Boolean);
      const c = SIM.capacity(state);
      const room = a.species === 'dog' ? (SIM.dogSize(a) === 'small' ? `소형견사 ${c.ns}/${c.small}` : `대형견사 ${c.nl}/${c.large}`) : `고양이 ${c.nc}/${c.cat}`;
      choice('보호 요청이 왔어요', `${icon(a.fat ? 'animal-fat' : 'animal', a.breed)}
${b.name}${SIM.coatName(a) ? `(${SIM.coatName(a)})` : ''} ${sexMark(a)} · ${a.species === 'dog' ? `${D.DOG_SIZE[SIM.dogSize(a)]} · ` : ''}${SIM.ageText(a)} · 건강 ${a.health}
중성화 ${a.neutered ? '했어요' : '안 했어요'} · 예방접종 ${a.vaccinated ? '했어요' : '안 했어요'}
${flags.join(' · ') || '건강한 편이에요'}
<span class="note">${b.health}</span><span class="note">지금 자리: ${room}</span>`, [
        { label: '우리가 맡을게요', run: () => done('accept') },
        { label: '이웃 보호소에 부탁하기', note: '평판 -0.5', ghost: true, run: () => done('decline') },
      ]);
      return;
    }
    if (p.kind === 'injury') {
      const a = state.animals.find((x) => x.id === p.id);
      if (!a) { SIM.resolve(state, 'pay'); UI.askPending(); return; }
      const est = SIM.fundraiseEstimate(state, a.surgeryCost);
      choice('크게 다친 아이', `${icon('animal', a.breed)}\n${D.BREEDS[a.breed].name} ${j(esc(a.name), '이가')} 다친 채로 들어왔어요.\n수술비 ${won(a.surgeryCost)}원 · 지금 자금 ${won(state.money)}원`, [
        { label: '바로 수술하기', note: `자금에서 ${won(a.surgeryCost)}원`, disabled: state.money < a.surgeryCost, run: () => done('pay') },
        { label: '긴급 모금 후 수술하기', note: `예상 모금 약 ${won(est)}원 · 모자라면 자금에서 채워요${state.fundraisedQ ? ' · 이번 분기 두 번째라 효과 절반' : ''}`, run: () => done('fund') },
        { label: '큰 병원이 있는 보호소로 보내기', note: '평판 -5', ghost: true, run: () => done('transfer') },
      ]);
    } else if (p.kind === 'visit') {
      const a = state.animals.find((x) => x.id === p.animal);
      if (!a) { done('skip'); return; }
      const b = D.BREEDS[a.breed];
      const head = `${icon(a.fat ? 'animal-fat' : 'animal', a.breed)}\n${j(esc(p.family), '이가')} ${j(esc(a.name), '과와')} 시간을 보냈어요.\n${esc(p.act)}.\n<span class="note">${b.name} · ${SIM.ageText(a)}</span>`;
      if (SIM.isReady(a)) {
        choice('이 아이를 데려가고 싶대요', `${head}\n가족이 바로 입양하고 싶어 해요.`, [
          { label: '입양 상담하기', note: '교감한 가족이라 파양 위험이 낮아요', disabled: state.inv.carriers < 1, run: () => done('adopt') },
          { label: '다음에 다시 오시라고 하기', ghost: true, run: () => done('later') },
        ]);
      } else {
        choice('준비되면 데려가고 싶대요', `${head}\n아직 입양 준비가 덜 됐어요: ${SIM.readyIssues(a).join(' · ')}\n준비가 끝나면 바로 데리러 오겠대요.`, [
          { label: '약속하기', note: `준비가 끝나는 날 이 가족에게 입양 (최대 ${D.VISIT.reserveDays}일 기다려요)`, run: () => done('reserve') },
          { label: '다음에 다시 오시라고 하기', ghost: true, run: () => done('later') },
        ]);
      }
    } else if (p.kind === 'external') {
      const e = D.EXTERNAL.events.find((x) => x.id === p.id);
      const fx = [e.aware ? `인식 ${e.aware > 0 ? '+' : ''}${e.aware}` : '', e.donors ? `정기후원자 ${e.donors > 0 ? '+' : ''}${Math.round(e.donors * 100)}%` : '', e.surge ? `${e.surge.days}일간 보호 요청 ×${e.surge.mult}` : '', e.transferPenalty ? `${e.transferPenalty.days}일간 이송 시 평판 추가 -${e.transferPenalty.extra}` : ''].filter(Boolean).join(' · ');
      const acts = e.respond
        ? [{ label: `${e.respond.label} (${won(e.respond.cost)}원)`, note: `정기후원자 +${Math.round(e.respond.donors * 100)}% · 평판 +${e.respond.rep}${e.respond.aware ? ` · 인식 +${e.respond.aware}` : ''}`, disabled: state.money < e.respond.cost, run: () => done('respond') },
          { label: '조용히 지켜보기', ghost: true, run: () => done('skip') }]
        : [{ label: '확인', run: () => done('ok') }];
      choice(e.title, `${icon('event', 'news') || ''}\n${esc(e.body.replace('{who}', e.who))}${esc(p.extra || '')}\n<span class="note">${fx}</span>`, acts);
    } else if (p.kind === 'memorial') {
      const d = D.DAYS.find((x) => x.id === p.id), P = D.DAY_EVENT.party, Q = D.DAY_EVENT.post;
      const who = d.species === 'cat' ? '고양이' : d.species === 'dog' ? '강아지' : '모든 아이';
      choice(`오늘은 ${d.name}`, `${icon('animal', d.species === 'cat' ? 'korshort' : 'jindo')}\n${d.text}`, [
        { label: `기념 행사 열기 (${won(P.cost)}원)`, note: `${P.days}일간 ${who} 입양 ×${P.adopt} · 후원자·인식 상승`, disabled: state.money < P.cost, run: () => done('party') },
        { label: 'SNS에 소개 글만 올리기', note: `${Q.days}일간 ${who} 입양 ×${Q.adopt}`, ghost: true, run: () => done('post') },
      ]);
    } else if (p.kind === 'corporate') {
      choice('기업 후원 제안', `지역 기업이 1년간 매달 ${won(D.CORPORATE.monthly)}원을 후원하겠대요.\n회계 보고가 두 분기 연속 미흡하면 계약이 해지돼요.`, [
        { label: '협약 맺기', run: () => done('accept') },
        { label: '정중히 거절하기', ghost: true, run: () => done('decline') },
      ]);
    } else if (p.kind === 'forceTransfer') {
      const list = state.animals.map((a) => `<label class="pick"><input type="checkbox" name="ft" value="${a.id}"> ${icon(a.fat ? 'animal-fat' : 'animal', a.breed)} ${esc(a.name)} · ${D.BREEDS[a.breed].name}</label>`).join('');
      choice('아이들을 보내야 해요', `자금이 두 달째 마이너스예요. 이웃 보호소로 보낼 아이 ${p.n}마리를 골라 주세요.${list}`, [
        { label: `${p.n}마리 보내기`, disabled: true, run: () => done('ok', [...document.querySelectorAll('input[name="ft"]:checked')].map((x) => Number(x.value))) },
      ], () => {
        const b = $('modal-actions').querySelector('button');
        $('modal-body').onchange = () => { b.disabled = document.querySelectorAll('input[name="ft"]:checked').length !== p.n; };
      });
    }
  };

  /* ---------- 분기 보고서 ---------- */
  const LABELS = {
    donors: '정기후원', gift: '입양 후원', fee: '입양 책임비', fundraise: '긴급 모금', goods: '굿즈 매출', corporate: '기업 후원', subsidy: '지자체 보조금', refund: '철거 환급',
    salary: '급여', upkeep: '시설 유지', items: '물품 구입', medical: '의료비', goodsCost: '굿즈 원가', interest: '대출 이자', campaign: '캠페인·섭외', facility: '건설', hiring: '채용·교육',
    loanIn: '대출 받음', loanRepay: '원금 상환',
  };
  function reportHTML(r, prev) {
    const diff = (k, kind) => {
      if (!prev) return '';
      const d = (r[kind][k] || 0) - (prev[kind][k] || 0);
      return d ? `<span class="${(kind === 'income') === d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${won(Math.abs(d))}</span>` : '';
    };
    const rows = (kind) => Object.entries(r[kind]).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td>${LABELS[k] || k}</td><td class="num">${won(v)}</td><td class="num">${diff(k, kind)}</td></tr>`).join('');
    const cashRows = Object.entries(r.cash || {}).map(([k, v]) => `<tr><td>${LABELS[k] || k}</td><td class="num">${won(v)}</td><td></td></tr>`).join('');
    return `<div style="display:flex;align-items:center;gap:12px"><span class="grade">${r.grade}</span>
      <span>순이익 <b class="${r.net >= 0 ? 'up' : 'down'}">${won(r.net)}원</b><br>평판 ${r.repDelta >= 0 ? '+' : ''}${r.repDelta} · 자금 ${won(r.money)}원</span></div>
      <table class="ledger"><tbody><tr><th colspan="3">수입</th></tr>${rows('income') || '<tr><td colspan="3">없음</td></tr>'}
      <tr class="total"><td>합계</td><td class="num">${won(r.inc)}</td><td></td></tr>
      <tr><th colspan="3">지출</th></tr>${rows('expense') || '<tr><td colspan="3">없음</td></tr>'}
      <tr class="total"><td>합계</td><td class="num">${won(r.exp)}</td><td></td></tr>
      ${cashRows ? `<tr><th colspan="3">대출</th></tr>${cashRows}` : ''}</tbody></table>
      <div class="card"><span class="note">구조 ${r.rescued} · 입양 ${r.adopted} · 이송 ${r.transferred} · 평균 보호 ${r.avgStay}일</span>
      <span class="note">회계 점수 <b class="${r.pass ? 'up' : 'down'}">${r.score}</b> / 기준 ${r.required} ${r.pass ? '통과' : '미흡'}${r.late ? ' · 기한 초과' : ''}${r.auto ? ' · 회계사 자동 제출' : ''}</span></div>`;
  }
  function showReport(r, prev, auto) {
    choice(`${r.label} 보고서`, reportHTML(r, prev), [{ label: auto ? '다음 분기도 힘내기' : '닫기', run: () => closeOverlay() }]);
  }

  /* ---------- 시작 화면 ---------- */
  const STORY_ART = {
    ordinary: [['animal', 'jindo'], ['animal', 'korshort'], ['staff', 'volunteer'], ['tile', 'kennel']],
    director: [['tile', 'yard'], ['staff', 'trainer'], ['animal', 'bichon'], ['tile', 'adoption']],
    influencer: [['staff', 'social'], ['animal', 'corgi'], ['tile', 'storage'], ['tile', 'shop']],
  };
  UI.showStart = (onPick) => {
    UI.modalOpen = true;
    if (hooks) hooks.onModal(true);
    const box = $('start-inner');
    const logo = SPR.iconURL('logo', '', D);
    box.innerHTML = `${logo ? `<h1 class="start-logo"><img src="${logo}" alt="유기동물 스토리"></h1>` : '<h1 class="start-title">유기동물 스토리</h1>'}<p class="start-sub">당신은 어떤 사람인가요?</p>
      ${Object.entries(D.CAREERS).map(([k, c]) => `<button type="button" class="career" data-career="${k}">
        <span class="diff ${c.diff}">${c.diff}</span><b>${c.name}</b><span>${c.tag}</span><span>${c.desc}</span></button>`).join('')}<p class="version">${UI.versionText}</p>`;
    $('start').hidden = false;
    box.onclick = (e) => {
      const b = e.target.closest('[data-career]');
      if (b) showIntro(b.dataset.career, onPick);
    };
  };
  function showIntro(key, onPick) {
    const c = D.CAREERS[key];
    let i = 0;
    const box = $('start-inner');
    const draw = () => {
      const [kind, k] = STORY_ART[key][i];
      const scene = icon('intro', `${key}-${i + 1}`, 'wide') || icon(kind, k);
      box.innerHTML = `<div class="story"><div class="scene">${scene}</div><p>${esc(c.intro[i])}</p>
        <div class="dots">${c.intro.map((_, n) => `<i class="${n === i ? 'on' : ''}"></i>`).join('')}</div>
        <button type="button" id="story-next">${i < c.intro.length - 1 ? '다음' : '보호소 문 열기'}</button></div>`;
      $('story-next').focus();
    };
    box.onclick = (e) => {
      if (e.target.id !== 'story-next') return;
      if (++i < c.intro.length) { draw(); return; }
      showSetup(key, onPick);
    };
    draw();
  }

  // 시작 설정: 성별·이름(+테스터용은 보호소 이름)
  function showSetup(career, onPick) {
    const box = $('start-inner');
    let gender = 'f', species = 'both';
    const draw = () => {
      box.innerHTML = `<div class="setup"><h2>보호소를 여는 사람</h2>
        <div class="genders" role="group" aria-label="성별">
          ${['f', 'm'].map((g) => `<button type="button" data-gender="${g}" aria-pressed="${gender === g}">${SPR.has(`player-${g}-0`) ? `<img alt="" src="${SPR.path(`player-${g}-0`)}">` : ''}${g === 'f' ? '여성' : '남성'}</button>`).join('')}
        </div>
        <p class="setup-q">어떤 아이들을 받을까요? <small>경영 탭에서 언제든 바꿀 수 있어요</small></p>
        <div class="genders species" role="group" aria-label="받는 아이">
          ${Object.entries(D.SPECIES_POLICIES).map(([k, sp]) => `<button type="button" data-species="${k}" aria-pressed="${species === k}">${k === 'cat' ? icon('animal', 'korshort') : icon('animal', 'jindo')}${k === 'both' ? icon('animal', 'korshort') : ''}${sp.name}</button>`).join('')}
        </div>
                <label for="setup-name">내 이름<input type="text" id="setup-name" maxlength="8" value="${esc(D.OWNER.defaultName[gender])}"></label>
        ${UI.features.shelterName ? `<label for="setup-shelter">보호소 이름<input type="text" id="setup-shelter" maxlength="10" value="햇살 보호소"></label>` : ''}
        <button type="button" class="go" id="setup-go">보호소 문 열기</button>
        <p class="version">${UI.versionText}</p></div>`;
    };
    draw();
    box.onclick = (e) => {
      const g = e.target.closest('[data-gender]');
      if (g) {
        const name = $('setup-name').value, shelter = $('setup-shelter') && $('setup-shelter').value;
        const wasDefault = name === D.OWNER.defaultName[gender];
        gender = g.dataset.gender;
        draw();
        $('setup-name').value = wasDefault ? D.OWNER.defaultName[gender] : name;
        if (shelter != null && $('setup-shelter')) $('setup-shelter').value = shelter;
        return;
      }
      const sp = e.target.closest('[data-species]');
      if (sp) {
        const name = $('setup-name').value, shelter = $('setup-shelter') && $('setup-shelter').value;
        species = sp.dataset.species;
        draw();
        $('setup-name').value = name;
        if (shelter != null && $('setup-shelter')) $('setup-shelter').value = shelter;
        return;
      }
      if (e.target.id !== 'setup-go') return;
      const clean = (v, d) => (String(v || '').replace(/\s+/g, ' ').trim().slice(0, 10) || d);
      const opts = {
        playerGender: gender,
        species,
        playerName: clean($('setup-name').value, D.OWNER.defaultName[gender]).slice(0, 8),
        shelterName: $('setup-shelter') ? clean($('setup-shelter').value, '햇살 보호소') : '우리 보호소',
        tutorial: UI.features.tutorial,
      };
      $('start').hidden = true;
      UI.modalOpen = false;
      onPick(career, opts);
    };
  }

  /* ---------- 튜토리얼 ---------- */
  const has = (type) => Object.values(state.facilities).some((f) => f.type === type);
  const built = (type) => Object.values(state.facilities).some((f) => f.type === type && !f.buildLeft);
  const TUTORIAL = [
    { text: () => `${state.shelterName}에 오신 걸 환영해요!\n위쪽에는 자금·평판·인식·후원자가, 그 아래 띠에는 동네 SNS 소식이 흘러요.\n지도는 두 손가락으로 확대하고 끌어서 옮길 수 있어요.`, target: '#hud', next: true },
    { text: () => '아이들이 지낼 집부터 지어요. 첫 식구는 진도믹스라 대형견사가 필요해요.\n아래 [건설]을 누르고 대형견사의 [짓기]를 고른 뒤, 지도의 빈칸을 눌러요.\n소형견은 소형견사, 중·대형견은 대형견사에서 지내요.',
      target: () => (UI.sheet === 'build' ? '[data-act="build"][data-arg="bigkennel"]' : $('build-hint').hidden ? '[data-sheet="build"]' : '#build-hint'), done: () => has('bigkennel') || !SIM.wants(state, 'dog') },
    { text: () => '이번엔 고양이 집, 묘사를 지어요. [건설] → 묘사 [짓기] → 빈칸.',
      target: () => (UI.sheet === 'build' ? '[data-act="build"][data-arg="cattery"]' : $('build-hint').hidden ? '[data-sheet="build"]' : '#build-hint'), done: () => has('cattery') || !SIM.wants(state, 'cat') },
    { text: () => '공사에는 며칠이 걸려요.\n오른쪽 위 빨리 감기 버튼으로 시간을 빠르게 해 보세요.', target: '[data-speed="4"]',
      done: () => (built('bigkennel') || !SIM.wants(state, 'dog')) && (built('cattery') || !SIM.wants(state, 'cat')), after: () => UI.handle(SIM.tutorialArrive(state)) },
    { text: () => '첫 식구가 왔어요!\n[동물]을 눌러 아이들의 건강·신뢰·사회성과 입양까지 남은 일을 확인해 보세요.', target: '[data-sheet="animals"]', done: () => UI.sheet === 'animals' },
    { text: () => '[물품]에서는 사료·모래 재고와 남은 일수를 봐요.\n떨어지면 아이들이 아파요. 자동 구입도 켤 수 있어요.', target: '[data-sheet="goods"]', done: () => UI.sheet === 'goods' },
    { text: () => `[사람]에는 바로 나, ${state.player.name}이(가) 있어요.\n봉사자 모집과 직원 채용도 여기서 해요.`, target: '[data-sheet="people"]', done: () => UI.sheet === 'people' },
    { text: () => '[경영]에서는 입소 기준, 캠페인, 대출, 분기 보고서를 다뤄요.\n분기가 끝나면 아래에 보고서 제출 버튼이 반짝여요.', target: '[data-sheet="manage"]', done: () => UI.sheet === 'manage' },
    { text: () => '안내는 여기까지예요. 완료 선물로 50만원을 드려요.\n아이들 모두 좋은 가족을 만나길!', target: null, next: true, finish: true },
  ];
  let coachTarget = null;
  function setCoachTarget(sel) {
    const el = sel ? document.querySelector(sel) : null;
    if (el === coachTarget) return;
    if (coachTarget) coachTarget.classList.remove('coach-target');
    coachTarget = el;
    if (el) el.classList.add('coach-target');
  }
  UI.tutorialTick = () => {
    const t = state && state.tutorial;
    if (!t || UI.modalOpen) { if (!t) { $('coach').hidden = true; setCoachTarget(null); } return; }
    const step = TUTORIAL[t.step];
    if (!step) return;
    if (step.done && step.done()) {
      if (step.after) step.after();
      t.step++;
      hooks.onChange();
      return;
    }
    $('coach').hidden = false;
    const text = step.text();
    if ($('coach-text').textContent !== text) $('coach-text').textContent = text;
    $('coach-next').hidden = !step.next;
    setCoachTarget(typeof step.target === 'function' ? step.target() : step.target);
  };
  function coachNext() {
    const t = state.tutorial, step = TUTORIAL[t.step];
    if (step.finish) { SIM.finishTutorial(state); setCoachTarget(null); $('coach').hidden = true; UI.toast('튜토리얼 완료! +50만원'); hooks.onChange(); return; }
    t.step++;
  }
  function coachSkip() {
    // 건너뛰면 견사·묘사·첫 식구를 바로 마련하고 안내를 끝낸다(선물은 없음)
    if (state.tutorial.step < 4) UI.handle(SIM.skipTutorial(state));
    state.tutorial = null;
    setCoachTarget(null);
    $('coach').hidden = true;
    hooks.onChange();
    hooks.onRelayout();
  }

  /* ---------- 아래 판 ---------- */
  const SHEETS = { build: '건설', animals: '동물', people: '사람', goods: '물품', manage: '경영', album: '입양 앨범', feed: 'SNS 피드' };

  UI.openSheet = (key) => {
    if (UI.sheet === key) { UI.closeSheet(); return; }
    UI.sheet = key;
    UI.renaming = null;
    $('sheet').hidden = false;
    $('sheet-title').textContent = SHEETS[key];
    for (const b of document.querySelectorAll('[data-sheet]')) b.setAttribute('aria-current', String(b.dataset.sheet === key));
    UI.renderSheet();
  };
  UI.closeSheet = () => {
    UI.sheet = null;
    $('sheet').hidden = true;
    for (const b of document.querySelectorAll('[data-sheet]')) b.removeAttribute('aria-current');
  };

  const bar = (label, v) => `<span>${label}</span><span class="bar"><i class="${v < 60 ? 'low' : ''}" style="width:${Math.round(v)}%"></i></span>`;
  const btn = (act, arg, label, opts = {}) => `<button type="button" class="act ${opts.ghost ? 'ghost' : ''}" data-act="${act}" data-arg="${esc(arg)}" ${opts.disabled ? 'disabled' : ''}>${label}</button>`;
  const tabs = (sheet, list) => `<div class="tabs">${list.map(([k, l]) => `<button type="button" data-tab="${sheet}:${k}" aria-pressed="${UI.tab[sheet] === k}">${l}</button>`).join('')}</div>`;
  const statsLine = (st) => `<span class="stats-line">${Object.entries(D.STATS).map(([k, l]) => `${l} <b>${st[k] ?? '?'}</b>`).join(' · ')}</span>`;
  const renameRow = (kind, id, name) => (UI.renaming && UI.renaming.id === id
    ? `<div class="rename"><input id="rename-input" maxlength="8" value="${esc(name)}" aria-label="새 이름">${btn('renameSave', `${kind}:${id}`, '저장')}${btn('renameCancel', '', '취소', { ghost: true })}</div>`
    : '');

  function medBtns(a) {
    const out = [];
    for (const kind of ['vaccine', 'neuter']) {
      if (!SIM.needs(a, kind)) continue;
      const c = SIM.medCost(state, a, kind);
      out.push(btn('treat', `${a.id}:${kind}`, `${kind === 'vaccine' ? '접종' : '중성화(선택)'} ${won(c)}`, { disabled: state.money < c }));
    }
    return out.join('');
  }

  function animalRow(a) {
    const b = D.BREEDS[a.breed];
    const badges = [];
    const issues = SIM.isReady(a) ? [] : SIM.readyIssues(a);
    if (a.injured) badges.push('<span class="badge closed">수술이 필요해요</span>');
    if (a.pregnant) badges.push(`<span class="badge trend">임신 · 출산까지 약 ${a.dueIn}일</span>`);
    if (a.nursingLeft) badges.push(`<span class="badge">수유 중 ${a.nursingLeft}일</span>`);
    if (a.bornHere && a.ageDays < 120) badges.push('<span class="badge">보호소에서 태어났어요</span>');
    if (a.allergy && a.allergy.known) badges.push('<span class="badge closed">처방식 필요</span>');
    if (SIM.makeshift(state, a)) badges.push(`<span class="badge closed">${a.species === 'dog' ? '좁은 집 · 대형견사가 필요해요' : '임시 거처'}</span>`);
    if (SIM.isReady(a)) badges.push('<span class="badge ready">입양 준비 완료</span>');
    if (a.fat) badges.push(`<span class="badge">다이어트 ${a.dietDays}/${D.DIET.days}일</span>`);
    if (a.closed && !a.opened) badges.push('<span class="badge closed">마음을 닫은 아이</span>');
    if (a.returned) badges.push('<span class="badge">다시 돌아온 아이</span>');
    if (a.reservedBy) badges.push(`<span class="badge ready">${j(esc(a.reservedBy), '이가')} 기다려요</span>`);
    { const m = SIM.ageAdopt(a); if (m >= 1.7) badges.push('<span class="badge ready">어려서 입양 문의 많음</span>'); else if (m <= 0.45) badges.push('<span class="badge closed">나이가 많아 입양이 어려워요</span>'); }
    if (state.trend && state.trend.breed === a.breed) badges.push('<span class="badge trend">유행 품종</span>');
    return `<div class="row">${icon(a.fat ? 'animal-fat' : 'animal', a.breed)}
      <div class="main"><span class="name">${esc(a.name)} ${sexMark(a)}</span><span class="sub">${b.name}${SIM.coatName(a) ? `(${SIM.coatName(a)})` : ''} · ${a.species === 'dog' ? `${D.DOG_SIZE[SIM.dogSize(a)]} · ` : ''}${SIM.ageText(a)} · 평균 수명 ${b.life[0]}–${b.life[1]}년 · 보호 ${a.days}일째</span>
      <span class="sub">${a.species === 'exotic' ? '' : `중성화 ${a.neutered ? 'O' : 'X'} · `}예방접종 ${a.vaccinated ? 'O' : 'X'}${a.allergy && a.allergy.known ? ` · ${a.allergy.cause} 알러지` : ''}</span>
      <span class="sub">건강 메모: ${b.health}</span>
      ${issues.length ? `<span class="sub">입양까지: ${issues.join(' · ')}</span>` : ''}
      <div class="bars">${bar('건강', a.health)}${bar('신뢰', a.trust)}${bar('사회성', a.social)}</div>
      ${badges.length ? `<div class="badges">${badges.join('')}</div>` : ''}
      ${renameRow('animal', a.id, a.name) || `<div class="btns">${medBtns(a)}${btn('rename', `animal:${a.id}`, '이름 짓기', { ghost: true })}</div>`}</div></div>`;
  }

  const RENDER = {
    build() {
      const lvl = SIM.levelInfo(state.level), next = SIM.levelInfo(state.level + 1);
      const nextLand = D.LAND[state.land + 1];
      const land = `<div class="card"><b>부지 ${state.gridW}×${state.gridH - 1}칸</b>${nextLand ? `<span class="note">${nextLand.name}: ${nextLand.cols}×${nextLand.rows - 1}칸으로 넓히기 · ${won(nextLand.cost)}원 · Lv${nextLand.lv}부터</span><div class="btns">${btn('land', '', '땅 넓히기', { disabled: state.level < nextLand.lv || state.money < nextLand.cost })}</div>` : '<span class="note">가장 넓은 부지예요</span>'}</div>`;
      const head = land + `<div class="card"><b>보호소 등급 Lv${state.level} · ${lvl.name}</b><span class="note">${next ? `평판 ${next.rep}이 되면 Lv${next.lv} ${next.name}` : '최고 등급이에요'} · 지금 평판 ${Math.round(state.reputation)}</span></div>`;
      const tabBar = tabs('build', [['fac', '시설'], ['deco', '꾸미기']]);
      if (UI.tab.build === 'deco') {
        // 꾸미기(v0.7): 분위기 점수와 효과, 꾸밈 목록, 산책장 놀이기구, 꾸밈 콤보
        const mood = SIM.mood(state), eff = SIM.moodEffect(state);
        const top = `<div class="card"><b>분위기 ${mood}</b><span class="note">분위기 ${D.MOOD.step}점마다 방문자 +${D.MOOD.visit * 100}%, 입양 +${D.MOOD.adopt * 100}% (지금 방문자 +${Math.round(eff.visit * 100)}% · 입양 +${Math.round(eff.adopt * 100)}%). 같은 꾸밈은 ${D.MOOD.sameMax}개를 넘으면 점수가 절반이에요. 본관은 등급이 오르면 분위기 +${D.MOOD.mainStage[1]}·+${D.MOOD.mainStage[2]}.</span></div>`;
        const decos = Object.entries(D.FACILITIES).filter(([, f]) => f.decor).map(([k, f]) => {
          const locked = f.lv > state.level;
          return `<div class="row" ${locked ? 'style="opacity:.6"' : ''}>${SPR.has(f.sprite) ? `<img alt="" class="ic" src="${SPR.path(f.sprite)}">` : ''}
          <div class="main"><span class="name">${f.name}</span><span class="sub">${won(f.cost)}원 · ${f.desc}</span></div>
          ${btn('build', k, locked ? `Lv${f.lv}부터` : '놓기', { disabled: locked || state.money < f.cost })}</div>`;
        }).join('');
        const items = Object.entries(D.YARD_ITEMS).map(([k, it]) => `<div class="row">${SPR.has(it.sprite) ? `<img alt="" class="ic" src="${SPR.path(it.sprite)}">` : ''}
          <div class="main"><span class="name">${it.name}</span><span class="sub">${won(it.cost)}원 · 분위기 +${it.mood} · ${it.desc}</span></div>
          ${btn('build', `yi:${k}`, '놓기', { disabled: state.money < it.cost || !Object.values(state.facilities).some((f) => f.type === 'yard' && !f.buildLeft) })}</div>`).join('');
        const dc = D.DECOR_COMBOS.map((c) => (state.combosFound.includes(`d-${c.id}`)
          ? `<div class="card"><b>${c.name}</b><span class="note">${c.desc}</span></div>` : '<div class="card"><b>???</b><span class="note">꾸밈을 어울리게 붙여 놓으면 발견돼요</span></div>')).join('');
        return `${tabBar}${top}<h3 class="section-title">꾸밈 (빈칸에 놓기)</h3>${decos}
          <h3 class="section-title">산책장 놀이기구 (산책장 칸 위에 놓기)</h3>${items}
          <h3 class="section-title">꾸밈 콤보</h3>${dc}`;
      }
      const rows = Object.entries(D.FACILITIES).filter(([k, f]) => (k !== 'exotic' || D.EXOTIC.enabled) && !f.decor && !f.fixed).map(([k, f]) => {
        const locked = f.lv > state.level;
        return `<div class="row" ${locked ? 'style="opacity:.6"' : ''}>${icon('tile', k)}
          <div class="main"><span class="name">${f.name}</span><span class="sub">${won(f.cost)}원 · 공사 ${f.days}일 · 월 ${won(f.upkeep)}원</span><span class="sub">${f.desc}</span></div>
          ${btn('build', k, locked ? `Lv${f.lv}부터` : '짓기', { disabled: locked || state.money < f.cost })}</div>`;
      }).join('');
      const combos = D.COMBOS.map((c) => (state.combosFound.includes(c.id)
        ? `<div class="card"><b>${c.name}</b><span class="note">${c.desc}</span></div>`
        : '<div class="card"><b>???</b><span class="note">어떤 시설을 붙여 지으면 발견돼요</span></div>')).join('');
      return `${tabBar}${head}${rows}<p class="note">시설을 누르면 정보를 볼 수 있어요. 맨 아래 줄은 길이라 지을 수 없어요. 콤보는 공사가 끝나야 발견돼요.</p>
        <h3 class="section-title">콤보 (${state.combosFound.length}/${D.COMBOS.length})</h3>${combos}`;
    },
    animals() {
      const c = SIM.capacity(state);
      const order = (a) => (a.injured ? 0 : SIM.isReady(a) ? 1 : 2);
      const list = [...state.animals].sort((a, b) => order(a) - order(b));
      return `<p class="note">소형견 ${c.ns}/${c.small} · 중·대형견 ${c.nl}/${c.large} · 고양이 ${c.nc}/${c.cat} · 건강 ${D.ADOPT_READY.health}, 신뢰·사회성 ${D.ADOPT_READY.trust} 이상이면 입양을 기다려요. 다이어트 중인 아이는 입양 확률이 절반이에요.</p>
        ${list.map(animalRow).join('') || '<p class="note">지금은 보호 중인 아이가 없어요.</p>'}`;
    },
    people() {
      let body = '';
      const t = UI.tab.people;
      if (t === 'staff') {
        body = state.staff.map((st) => {
          const role = st.role === 'volunteer' ? D.VOLUNTEER.name : st.role === 'owner' ? '대표 (나)' : D.ROLES[st.role].name;
          const extra = st.role === 'volunteer'
            ? `${st.trained ? '교육 이수' : '교육 전'} · 실수 ${st.mistakes}번`
            : `월급 ${won(SIM.salary(st))}원`;
          const actions = [btn('rename', `staff:${st.id}`, '이름 짓기', { ghost: true })];
          if (st.role === 'volunteer' && !st.trained) actions.push(btn('trainVol', st.id, `교육 ${won(D.VOLUNTEER.training)}`, { disabled: state.money < D.VOLUNTEER.training }));
          if (st.role !== 'owner') actions.push(btn('fire', st.id, '내보내기', { ghost: true }));
          const face = st.role === 'owner' && SPR.has(`player-${st.gender}-0`) ? `<img alt="" src="${SPR.path(`player-${st.gender}-0`)}">` : icon('staff', st.role);
          return `<div class="row ${st.legend ? 'legend' : ''}">${face}
            <div class="main"><span class="name">${esc(st.name)}</span>
            <span class="sub">${st.title ? `${esc(st.title)} · ` : ''}${role} · 레벨 ${st.level} · ${extra}</span>${statsLine(st.stats)}
            ${renameRow('staff', st.id, st.name) || `<div class="btns">${actions.join('')}</div>`}</div></div>`;
        }).join('') || '<p class="note">아직 아무도 없어요.</p>';
        body += `<p class="note">월 인건비 합계 ${won(state.staff.reduce((a, x) => a + SIM.salary(x), 0))}원 · 정기후원 월 ${won(state.donors * state.donorFee)}원</p>`;
      } else if (t === 'hire') {
        body = Object.entries(D.ROLES).filter(([, r]) => !r.hidden).map(([k, r]) => {
          const cands = state.jobPosts[k];
          const list = cands ? cands.map((c, i) => `<div class="row ${c.legend || c.title ? 'legend' : ''}">${icon('staff', k)}
              <div class="main"><span class="name">${esc(c.name)}</span><span class="sub">${c.title ? esc(c.title) + ' · ' : ''}월급 ${won(SIM.salary({ role: k, stats: c.stats }))}원</span>${statsLine(c.stats)}</div>
              ${btn('hire', `${k}:${i}`, '채용')}</div>`).join('') : '';
          return `<div class="card"><b>${r.name}</b><span class="note">${r.desc} 주 능력치: ${D.STATS[r.main]}</span>
            <div class="btns">${btn('postJob', k, cands ? `다시 공고 ${won(r.post)}` : `공고 내기 ${won(r.post)}`, { disabled: state.money < r.post })}</div></div>${list}`;
        }).join('') + '<p class="note">지원자의 능력은 보호소 평판에 따라 달라져요.</p>';
      } else {
        const vols = state.staff.filter((x) => x.role === 'volunteer').length;
        body = `<div class="card"><b>봉사자 모집</b><span class="note">봉사자는 무급이에요. 공고를 내면 2주 동안 지원자가 한 명씩 연락해 와요. 현재 ${vols}/${D.VOLUNTEER.max}명</span>
          <span class="note">처음엔 서툴러 실수를 해요. 교육을 받으면 실수가 절반으로 줄어요.</span>
          <div class="btns">${state.volPost ? `<span class="note">모집 중 (${state.volPost.until - state.day}일 남음)</span>` : btn('postVol', '', `모집 공고 ${won(D.VOLUNTEER.post)}`, { disabled: state.money < D.VOLUNTEER.post })}</div></div>`;
        body += state.applicants.map((v) => `<div class="row">${icon('staff', 'volunteer')}
          <div class="main"><span class="name">${esc(v.name)}</span>
          ${v.interviewed ? statsLine(v.stats) : '<span class="sub">면접을 보면 어떤 사람인지 알 수 있어요</span>'}
          ${v.trained ? '<span class="sub">교육 이수</span>' : ''}
          <div class="btns">${v.interviewed ? '' : btn('interview', v.id, '면접', { ghost: true })}
          ${v.trained ? '' : btn('trainVol', v.id, `교육 ${won(D.VOLUNTEER.training)}`, { ghost: true, disabled: state.money < D.VOLUNTEER.training })}
          ${btn('acceptVol', v.id, '함께하기')}${btn('rejectVol', v.id, '돌려보내기', { ghost: true })}</div></div></div>`).join('');
      }
      return tabs('people', [['staff', '함께하는 사람'], ['hire', '채용'], ['vol', '봉사자 모집']]) + body;
    },
    goods() {
      const need = SIM.dailyNeed(state);
      const rows = Object.entries(D.ITEMS).map(([k, it]) => {
        const left = SIM.daysLeft(state, k, need);
        const leftTxt = k === 'carriers' ? `${state.inv[k]}개` : left === Infinity ? '쓰는 아이 없음' : `${Math.floor(left)}일치`;
        const low = k === 'carriers' ? state.inv[k] < 1 : left < D.AUTO_BUY.belowDays;
        return `<div class="row">${icon('item', k)}<div class="main"><div class="stock"><span class="name">${it.name}</span><span class="days ${low ? 'low' : ''}">${leftTxt}</span></div>
          <span class="sub">재고 ${Math.floor(state.inv[k] * 10) / 10}${it.unit} · 하루 ${Math.round(need[k] * 100) / 100}${it.unit} · 한 묶음 ${it.pack}${it.unit} ${won(it.price)}원</span>
          ${low ? `<span class="sub" style="color:var(--bad)">${it.lack}</span>` : ''}
          <div class="btns">${btn('buy', `${k}:1`, '1묶음', { disabled: state.money < it.price })}${btn('buy', `${k}:5`, '5묶음', { ghost: true, disabled: state.money < it.price * 5 })}</div></div></div>`;
      }).join('');
      const log = state.goodsLog.slice(0, 8).map((g) => `<div class="feed-item good"><time>${SIM.dateLabel(g.day)}</time>${esc(g.text)}</div>`).join('');
      const wish = state.campaigns.some((c) => c.type === 'wishlist' && c.until > state.day);
      return `<label class="toggle"><input type="checkbox" id="autobuy" ${state.autoBuy ? 'checked' : ''}> 자동 구입 (재고 ${D.AUTO_BUY.belowDays}일치 아래면 ${D.AUTO_BUY.targetDays}일치를 10% 비싸게 주문)</label>
        ${rows}
        <div class="card"><b>필요 물품 목록 공유</b><span class="note">${D.CAMPAIGNS.wishlist.desc}</span>
        <div class="btns">${btn('campaign', 'wishlist', wish ? '공유 중' : `공유하기 ${won(D.CAMPAIGNS.wishlist.cost)}`, { disabled: wish || state.money < D.CAMPAIGNS.wishlist.cost })}</div></div>
        <h3 class="section-title">최근 후원 물품</h3>${log || '<p class="note">아직 도착한 물품이 없어요.</p>'}`;
    },
    manage() {
      const t = UI.tab.manage;
      let body = '';
      if (t === 'campaign') {
        const tr = state.trend, ph = SIM.trendPhase(state);
        let card = '<div class="card"><b>요즘 SNS</b><span class="note">눈에 띄는 유행은 없어요.</span></div>';
        if (tr && ph !== 'calm') {
          const bn = D.BREEDS[tr.breed].name;
          const txt = { viral: `${bn} 영상이 퍼지는 중이에요. 몇 달 뒤 길에서 오는 ${j(bn, '이가')} 늘 수 있어요. 학교 교육이 물결을 줄여요.`,
            boom: `${bn} 분양이 늘었다는 뉴스가 이어져요. 살이 찐 채로 들어오는 ${j(bn, '이가')} 많아질 거예요.`,
            wave: `길에서 오는 ${j(bn, '이가')} 늘었어요. 견사·묘사와 다이어트 사료를 준비해 두세요.` }[ph];
          card = `<div class="card alert"><b>${bn} 열풍 · ${{ viral: '바이럴', boom: '반짝 인기', wave: '유기 물결' }[ph]}</b><span class="note">${txt}</span><span class="note">물결 세기 ×${tr.intensity.toFixed(2)}</span></div>`;
        }
        const rows = Object.entries(D.CAMPAIGNS).map(([k, c]) => {
          const on = state.campaigns.some((x) => x.type === k && x.until > state.day) || (k === 'finance' && state.quarterFinance);
          return `<div class="row"><div class="main"><span class="name">${c.name}</span><span class="sub">${won(c.cost)}원 · ${c.desc}</span></div>
            ${btn('campaign', k, on ? '진행 중' : '시작', { disabled: on || state.money < c.cost })}</div>`;
        }).join('');
        body = `${card}<p class="note">지역 인식 ${Math.round(state.awareness)} · 지금 회계 점수 ${SIM.acctScore(state)} / 이번 분기 기준 약 ${SIM.acctRequired(state)}</p>${rows}`;
      } else if (t === 'celeb') {
        body = D.CELEBS.map((c) => {
          const on = state.celebs.some((x) => x.id === c.id && x.until > state.day);
          return `<div class="row"><div class="main"><span class="name">${c.name}</span>
            <span class="sub">${c.kind} · 팬 ${(c.fans / 10000).toLocaleString()}만 명 · 섭외 ${won(c.cost)}원 · ${c.days}일</span>
            <span class="sub">함께하는 동안 입양 확률이 오르고 SNS 영상 효과가 두 배가 돼요. 섭외해 두면 유행 품종 분양 영상 대신 신중한 입양을 이야기해 줘요.</span></div>
            ${btn('celeb', c.id, on ? '함께하는 중' : '섭외', { disabled: on || state.money < c.cost })}</div>`;
        }).join('') + '<p class="note">등장인물은 모두 가상 인물입니다.</p>';
      } else if (t === 'money') {
        const loan = state.loans[0];
        body = `<div class="card"><b>받는 아이</b><span class="note">${D.SPECIES_POLICIES[state.speciesPolicy || 'both'].desc}</span>
          <div class="tabs">${Object.entries(D.SPECIES_POLICIES).map(([k, sp]) => `<button type="button" data-act="species" data-arg="${k}" aria-pressed="${(state.speciesPolicy || 'both') === k}">${sp.name}</button>`).join('')}</div></div>
          <div class="card"><b>입소 기준</b><span class="note">${D.INTAKE_POLICIES[state.intakePolicy].desc}</span>
          <div class="tabs">${Object.entries(D.INTAKE_POLICIES).map(([k, ip]) => `<button type="button" data-act="policy" data-arg="${k}" aria-pressed="${state.intakePolicy === k}">${ip.name}</button>`).join('')}</div></div>
          <div class="card"><b>진료 자동 처리</b><span class="note">진료실과 수의사가 있으면 수의사가 하루에 한 건씩 접종·중성화를 해요. 비용은 바깥 병원의 ${Math.round(D.MEDICAL.inHouse * 100)}%예요.</span>
          <label class="toggle"><input type="checkbox" id="automed" ${state.autoMed ? 'checked' : ''}> 자동으로 처리하기 ${SIM.inHouse(state) ? '' : '(진료실과 수의사가 있어야 동작해요)'}</label></div>
          <div class="card"><b>분기 보고서 자동 제출</b><span class="note">분기가 끝나면 ${D.REPORT.dueDays}일 안에 보고서를 제출해야 해요. 늦으면 회계 점수 -${D.REPORT.latePenalty} · 평판 -${D.REPORT.lateRep}.</span>
          <label class="toggle"><input type="checkbox" id="autoreport" ${state.autoReport ? 'checked' : ''} ${state.staff.some((x) => x.role === 'manager') ? '' : 'disabled'}> 자동으로 제출하기 ${state.staff.some((x) => x.role === 'manager') ? '' : '(회계사를 채용하면 켤 수 있어요)'}</label></div>
          <div class="card"><b>대출</b><span class="note">월 이자 1%, 12개월에 나눠 갚아요. 상환이 밀리면 신용이 떨어져요.</span>
          ${loan ? `<span class="note">남은 원금 ${won(loan.remaining)}원</span>` : `<div class="btns">${D.LOANS.map((l, i) => btn('loan', i, l.label, { disabled: state.loanDefault })).join('')}</div>`}
          ${state.loanDefault ? '<span class="note" style="color:var(--bad)">상환이 밀린 적이 있어 대출을 받을 수 없어요</span>' : ''}</div>
          <div class="card"><b>입양 책임비</b><span class="note">높을수록 수입은 늘고, 입양은 줄고, 다시 돌아오는 아이도 줄어요.</span>
          <div class="tabs">${D.ADOPT_FEES.map((f, i) => `<button type="button" data-act="fee" data-arg="${i}" aria-pressed="${state.feeLevel === i}">${f.name}</button>`).join('')}</div></div>
          <div class="card"><b>지자체 위탁 보조금</b><span class="note">매달 ${won(D.SUBSIDY.monthly)}원을 받는 대신, 매달 ${D.SUBSIDY.quota}마리를 더 맡아야 해요.</span>
          <label class="toggle"><input type="checkbox" id="subsidy" ${state.subsidy ? 'checked' : ''}> 보조금 받기</label></div>
          <div class="card"><b>기업 후원</b><span class="note">${state.corporate ? `협약 중 · 매달 ${won(state.corporate.monthly)}원 · ${Math.ceil((state.corporate.until - state.day) / 30)}개월 남음` : `평판 ${D.CORPORATE.minRep} 이상이고 회계 보고에 문제가 없으면 제안이 와요.`}</span></div>
          <div class="card"><b>굿즈샵</b><span class="note">[건설]에서 지을 수 있어요. 평판과 SNS 담당이 매출을 키워요.</span></div>`;
      } else if (t === 'report') {
        body = state.report ? `<h3 class="section-title">${state.report.label}</h3>${reportHTML(state.report, state.prevReport)}`
          : `<p class="note">${state.reportDue ? '제출을 기다리는 보고서가 있어요. 하단의 반짝이는 버튼을 누르세요.' : '첫 분기 보고서는 3월 말에 나와요.'}</p>`;
      } else {
        const me = state.reputation + state.stats.adopted * 2;
        const list = [...state.npcRep.map((r, i) => ({ ...D.NPCS[i], rep: r })), { name: state.shelterName || '우리 보호소', region: D.HOME_CITY, type: '구조·보호', rep: me, me: true }]
          .sort((a, b) => b.rep - a.rep);
        const rows = list.map((n, i) => `<tr class="${n.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(n.name)}<br><span class="note">${n.region} · ${n.type}</span></td><td>${Math.round(n.rep)}</td></tr>`).join('');
        const st = state.stats;
        body = `<div class="card"><b>지금까지</b><span class="note">구조 ${st.rescued} · 입양 ${st.adopted} · 이송 ${st.transferred} · 다시 돌아온 아이 ${st.returned} · 다이어트 성공 ${st.diets} · 물림 사고 ${st.bites} · 이웃에 안내 ${st.declined} · 보호소에서 태어남 ${st.born} · 문 앞에 두고 감 ${st.doorstep}</span>
          <span class="note">경력: ${D.CAREERS[state.career].name} (${D.CAREERS[state.career].diff})</span></div>
          <div style="overflow-x:auto"><table class="rank"><tbody>${rows}</tbody></table></div>
          <p class="note">이웃 보호소는 모두 가상 단체입니다. 점수 = 평판 + 입양 수 × 2</p>
          <p class="version">${UI.versionText}</p>
          ${btn('newGame', '', UI.confirmNew ? '정말 처음부터? 한 번 더 누르면 시작해요' : '새 게임', { ghost: true })}`;
      }
      return tabs('manage', [['campaign', '캠페인'], ['celeb', '섭외'], ['money', '운영·자금'], ['report', '보고서'], ['rank', '순위']]) + body;
    },
    album() {
      if (!state.album.length) return '<p class="note">아직 입양 간 아이가 없어요. 입양 간 아이들의 소식이 1·3·6·12개월 뒤에 도착해요.</p>';
      return state.album.map((e) => {
        const news = [...e.news].reverse().map((n) => `<span class="sub">${SIM.dateLabel(n.day)} · ${esc(n.text)}</span>`).join('');
        return `<div class="row">${icon('animal', e.breed)}<div class="main"><span class="name">${esc(e.name)}</span>
          <span class="sub">${D.BREEDS[e.breed].name} · ${SIM.dateLabel(e.day)} 입양${e.back ? ' · 다시 돌아왔어요' : ''}</span>
          ${news || '<span class="sub">새 가족의 첫 소식을 기다리는 중</span>'}</div></div>`;
      }).join('');
    },
    feed() {
      return state.feed.map((f) => `<div class="feed-item ${f.kind === 'warn' ? 'warn' : f.kind === 'good' ? 'good' : ''}"><time>${SIM.dateLabel(f.day)}</time>${esc(f.text)}</div>`).join('');
    },
  };

  UI.renderSheet = () => {
    if (!UI.sheet || !RENDER[UI.sheet]) return;
    // 이름을 입력하는 중에는 다시 그리지 않는다
    if (UI.renaming && document.activeElement && document.activeElement.id === 'rename-input') return;
    const body = $('sheet-body');
    const y = body.scrollTop;
    body.innerHTML = RENDER[UI.sheet]();
    body.scrollTop = y;
  };

  UI.moveHint = (f) => {
    $('build-hint').hidden = !f;
    if (f) $('build-hint-text').textContent = `${j(D.FACILITIES[f.type].name, '을를')} 옮길 자리를 누르세요 · ${won(SIM.moveCost(f))}원`;
  };

  UI.buildHint = (type) => {
    $('build-hint').hidden = !type;
    if (type) $('build-hint-text').textContent = type.startsWith('yi:') ? `${j(D.YARD_ITEMS[type.slice(3)].name, '을를')} 놓을 산책장 칸을 누르세요` : `${j(D.FACILITIES[type].name, '을를')} ${D.FACILITIES[type].decor ? '놓을' : '지을'} 칸을 누르세요`;
  };

  UI.showFacility = (f) => {
    const def = D.FACILITIES[f.type];
    const here = state.animals.filter((a) => a.home === f.id);
    UI.sheet = 'facility';
    $('sheet').hidden = false;
    $('sheet-title').textContent = def.name;
    $('sheet-body').innerHTML = `${f.buildLeft ? `<div class="card"><b>공사 중</b><span class="note">${f.buildLeft}일 뒤 완공돼요. 그동안은 쓸 수 없어요.</span></div>` : ''}<p class="note">${def.desc} 유지비 월 ${won(def.upkeep)}원</p>${here.map(animalRow).join('')}
      ${f.type === 'yard' ? SIM.yardItemList(state).filter((it) => SIM.facilityAt(state, it.x, it.y) === f).map((it) => `<div class="row">${SPR.has(D.YARD_ITEMS[it.type].sprite) ? `<img alt="" class="ic" src="${SPR.path(D.YARD_ITEMS[it.type].sprite)}">` : ''}<div class="main"><span class="name">${D.YARD_ITEMS[it.type].name}</span><span class="sub">${D.YARD_ITEMS[it.type].desc}</span></div>${btn('removeItem', `${it.x},${it.y}`, '치우기 (30% 환급)', { ghost: true })}</div>`).join('') : ''}
      ${f.type === 'main' ? `<p class="note">본관 ${SIM.mainStage(state)}단계 · 보호소 등급 Lv${D.MAIN_STAGE_LV[1]}·Lv${D.MAIN_STAGE_LV[2]}에 커져요</p>` : ''}
      <div class="btns">${btn('move', f.id, `옮기기 · ${won(SIM.moveCost(f))}원 (건설비 10%)`, { disabled: state.money < SIM.moveCost(f) })}
      ${def.fixed ? '' : btn('demolish', f.id, '철거 (건설비 30% 환급)', { ghost: true })}</div>`;
  };

  /* ---------- 연결 ---------- */
  const ACTIONS = {
    build: (a) => { UI.closeSheet(); hooks.onBuildMode(a); return null; },
    demolish: (a) => { const r = SIM.demolish(state, Number(a)); if (r.ok) UI.closeSheet(); return r; },
    removeItem: (a) => { const r = SIM.removeYardItem(state, a); if (r.ok) { UI.closeSheet(); hooks.onChange(); } return r; },
    postJob: (a) => SIM.postJob(state, a),
    hire: (a) => { const [role, i] = a.split(':'); const r = SIM.hireCandidate(state, role, Number(i)); if (r.ok) UI.toast(`${r.name}님이 합류했어요`); return r; },
    fire: (a) => SIM.fire(state, Number(a)),
    postVol: () => SIM.postVolunteers(state),
    interview: (a) => SIM.interview(state, Number(a)),
    trainVol: (a) => SIM.trainVolunteer(state, Number(a)),
    acceptVol: (a) => { const r = SIM.acceptVolunteer(state, Number(a)); if (r.ok) UI.toast(`봉사자 ${r.name}님과 함께해요`); return r; },
    rejectVol: (a) => SIM.rejectApplicant(state, Number(a)),
    buy: (a) => { const [k, n] = a.split(':'); return SIM.buy(state, k, Number(n)); },
    campaign: (a) => SIM.campaign(state, a),
    celeb: (a) => SIM.hireCeleb(state, a),
    loan: (a) => { const r = SIM.takeLoan(state, Number(a)); if (r.ok) UI.toast('대출금이 들어왔어요'); return r; },
    fee: (a) => SIM.setFee(state, Number(a)),
    policy: (a) => SIM.setIntakePolicy(state, a),
    species: (a) => SIM.setSpeciesPolicy(state, a),
    move: (a) => { UI.closeSheet(); hooks.onMoveMode(Number(a)); return null; },
    land: () => { const r = SIM.expandLand(state); if (r.ok) { UI.toast(r.msg); UI.closeSheet(); hooks.onRelayout(); } return r; },
    treat: (a) => { const [id, kind] = a.split(':'); const r = SIM.treat(state, Number(id), kind); if (r.ok) UI.toast(r.msg); return r; },
    rename: (a) => {
      const [kind, id] = a.split(':');
      UI.renaming = { kind, id: Number(id) };
      UI.renderSheet();
      const el = $('rename-input');
      if (el) { el.focus(); el.select(); }
      return null;
    },
    renameCancel: () => { UI.renaming = null; return { ok: true }; },
    renameSave: (a) => {
      const [kind, id] = a.split(':');
      const r = SIM.rename(state, kind, Number(id), $('rename-input').value);
      if (r.ok) UI.renaming = null;
      return r;
    },
    newGame: () => {
      if (!UI.confirmNew) { UI.confirmNew = true; setTimeout(() => { UI.confirmNew = false; }, 4000); return { ok: true }; }
      UI.confirmNew = false;
      hooks.onNewGame();
      return null;
    },
  };

  UI.init = (h) => {
    hooks = h;
    // 메뉴·속도 버튼 아이콘
    for (const b of document.querySelectorAll('[data-sheet]')) {
      const u = SPR.iconURL('ui', { build: 'build', animals: 'animals', people: 'people', goods: 'goods', manage: 'manage', album: 'album' }[b.dataset.sheet], D);
      if (u) b.insertAdjacentHTML('afterbegin', `<img class="dock-ico" alt="" src="${u}">`);
    }
    for (const b of document.querySelectorAll('[data-speed]')) {
      const v = Number(b.dataset.speed);
      const u = SPR.iconURL('ui', v === 0 ? 'pause' : v === 1 ? 'play' : 'fast', D);
      if (u) b.innerHTML = `<img class="speed-ico" alt="" src="${u}">${v > 1 ? `<span>×${v}</span>` : ''}`;
    }
    for (const [id, key] of [['money', 'money'], ['rep', 'rep'], ['aware', 'aware'], ['donors', 'donors']]) {
      const u = SPR.iconURL('icon', key, D);
      if (u) $(id).parentElement.insertAdjacentHTML('afterbegin', `<img class="hud-ico" alt="" src="${u}">`);
    }
    for (const b of document.querySelectorAll('[data-speed]')) b.addEventListener('click', () => hooks.onSpeed(Number(b.dataset.speed)));
    for (const b of document.querySelectorAll('[data-sheet]')) b.addEventListener('click', () => UI.openSheet(b.dataset.sheet));
    $('ticker').addEventListener('click', () => UI.openSheet('feed'));
    $('sheet-close').addEventListener('click', UI.closeSheet);
    $('event-card').addEventListener('click', closeOverlay);
    $('modal-actions').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled || !UI.currentChoice) return;
      UI.currentChoice.actions[Number(b.dataset.i)].run();
    });
    $('build-cancel').addEventListener('click', () => { hooks.onBuildMode(null); hooks.onMoveMode(null); });
    $('rotate-btn').addEventListener('click', () => hooks.onRotate && hooks.onRotate());
    $('coach-next').addEventListener('click', coachNext);
    $('coach-skip').addEventListener('click', coachSkip);
    $('report-btn').addEventListener('click', () => { UI.handle(SIM.submitReport(state, false)); hooks.onChange(); UI.hud(); });
    $('sheet-body').addEventListener('click', (e) => {
      const tb = e.target.closest('[data-tab]');
      if (tb) { const [sh, k] = tb.dataset.tab.split(':'); UI.tab[sh] = k; UI.renaming = null; UI.renderSheet(); return; }
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const r = ACTIONS[b.dataset.act](b.dataset.arg);
      if (!r) return;
      if (!r.ok && r.msg) UI.toast(r.msg);
      if (r.events) UI.handle(r.events);
      hooks.onChange();
      UI.renderSheet();
    });
    $('sheet-body').addEventListener('change', (e) => {
      if (e.target.id === 'autobuy') SIM.setAutoBuy(state, e.target.checked);
      if (e.target.id === 'subsidy') SIM.setSubsidy(state, e.target.checked);
      if (e.target.id === 'automed') SIM.setAutoMed(state, e.target.checked);
      if (e.target.id === 'autoreport') { const r = SIM.setAutoReport(state, e.target.checked); if (!r.ok) { UI.toast(r.msg); e.target.checked = false; } }
      hooks.onChange();
    });
    $('sheet-body').addEventListener('keydown', (e) => {
      if (e.target.id === 'rename-input' && e.key === 'Enter') {
        e.preventDefault();
        e.target.closest('.rename').querySelector('[data-act="renameSave"]').click();
      }
    });
  };
  UI.setState = (s) => { state = s; };

  G.UI = UI;
})(window);
