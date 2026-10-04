// 동물·인물 포즈 띠 그림(v0.10). tools/pose_sheets.py가 만든 assets/sprites/pose-<키>.png와 src/pose_manifest.js를 쓴다.
// 띠 한 장 = 같은 크기 칸 여러 개. 칸 아래 가운데가 발 위치다. 띠가 없는 품종은 예전 2장 그림을 그대로 쓴다.
(function (G) {
  const POSE = {};
  const S = G.POSE_SHEETS || {};
  POSE.has = (key) => !!S[key] && G.SPR && G.SPR.has(`pose-${key}`);
  POSE.sheet = (key) => S[key];
  POSE.frame = (key, name) => { const s = S[key]; const i = s ? s.frames.indexOf(name) : -1; return i < 0 ? 0 : i; };

  // 상태 그림이 습성보다 먼저 보인다(사양 §2 우선순위). 상태가 없으면 null
  POSE.stateOf = (a) => {
    if (a.nursingLeft > 0) return 'nursing';
    if (a.injured || a.coneDays > 0) return 'injured';   // 다쳤거나 중성화 수술 뒤 넥카라
    if (a.health < 50) return 'sick';
    if (a.pregnant) return 'pregnant';
    if (a.closed && !a.opened) return 'closed';
    if (a.fat) return 'fat';
    return null;
  };
  // 상태별로 걸을 때 쓸 그림: null이면 보통 걷기 4장. 아픈 아이와 젖 먹이는 엄마는 걷지 않는다
  POSE.walkOf = (st) => (st === 'injured' || st === 'pregnant' || st === 'fat' ? st : null);
  POSE.still = (st) => st === 'sick' || st === 'nursing';
  POSE.LABEL = { nursing: '새끼를 돌보는 중', injured: '넥카라를 하고 회복 중', sick: '몸이 안 좋아요', pregnant: '출산을 기다려요', closed: '마음의 문을 닫았어요', fat: '다이어트 중' };

  // 쉴 때 고를 습성과 가중치. 신뢰가 높을수록 꼬리 흔들기·발라당, 노령은 눕기·자기, 아기는 꼬리 흔들기·기지개가 늘어난다
  POSE.idle = (a, ageKey, rnd = Math.random) => {
    const t = a.trust || 0, old = ageKey === 'senior', baby = ageKey === 'baby';
    const w = {
      sit: 3, lie: 3, 'lie-side': old ? 4 : 2, sleep: old ? 5 : baby ? 3 : 2, stretch: baby ? 2 : 1,
      wag: (t >= 50 ? 3 : 1) * (baby ? 2 : 1), belly: t >= 70 ? 3 : t >= 40 ? 1 : 0,
    };
    let sum = 0; for (const k in w) sum += w[k];
    let r = rnd() * sum;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'sit';
  };

  // 화면 밖(HTML) 초상: 띠에서 한 칸을 캔버스로 잘라, 털색 tint가 있으면 곱하기로 입힌다
  const imgs = {};
  POSE.portrait = (key, name, tint, scale = 3) => {
    const s = S[key];
    if (!s) return null;
    const c = document.createElement('canvas');
    c.width = s.w * scale; c.height = s.h * scale;
    c.className = 'pose-portrait';
    const draw = (img) => {
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, POSE.frame(key, name) * s.w, 0, s.w, s.h, 0, 0, c.width, c.height);
      if (tint) {
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(img, POSE.frame(key, name) * s.w, 0, s.w, s.h, 0, 0, c.width, c.height);
      }
    };
    let img = imgs[key];
    if (!img) { img = imgs[key] = new Image(); img.src = G.SPR.path(`pose-${key}`); }
    if (img.complete && img.naturalWidth) draw(img); else img.addEventListener('load', () => draw(img), { once: true });
    return c;
  };

  // 아이 카드 전용 클로즈업(v0.10): 상태마다 4프레임. 상태는 프레임마다 다시 읽어 바로 바뀐다
  POSE.cuState = (a) => {
    const st = POSE.stateOf(a);
    if (st === 'nursing') return ['cu2', 'nurse', '새끼들을 돌보고 있어요'];
    if (st === 'injured') return ['cu2', 'cone', a.injured ? '넥카라를 하고 치료 중이에요' : '수술 뒤 넥카라를 하고 회복 중이에요'];
    if (st === 'sick') return ['cu2', 'sick', '몸이 안 좋아 누워 있어요'];
    if (st === 'pregnant') return ['cu2', 'preg', '출산을 기다리고 있어요'];
    if (st === 'closed') return (a.trust || 0) < 20 ? ['cu1', 'tremble', '겁이 나서 떨고 있어요'] : ['cu1', 'wary', '아직 경계하고 있어요'];
    return (a.trust || 0) >= 60 ? ['cu1', 'happy', '기분이 좋아요'] : ['cu1', 'calm', '편안하게 쉬고 있어요'];
  };
  POSE.hasCloseup = (breed) => POSE.has(`${breed}.cu1`) && POSE.has(`${breed}.cu2`);
  // getA: 지금 아이 객체를 돌려주는 함수(없어지면 멈춘다). onLabel: 상태 문구가 바뀔 때 부른다
  POSE.closeup = (breed, getA, onLabel, scale = 1.7) => {
    const k1 = `${breed}.cu1`, k2 = `${breed}.cu2`, s1 = S[k1], s2 = S[k2];
    const c = document.createElement('canvas');
    c.width = Math.max(s1.w, s2.w) * scale + 4; c.height = Math.max(s1.h, s2.h) * scale + 2;
    c.className = 'pose-portrait closeup';
    const load = (k) => { let img = imgs[k]; if (!img) { img = imgs[k] = new Image(); img.src = G.SPR.path(`pose-${k}`); } return img; };
    const im = { cu1: load(k1), cu2: load(k2) };
    const g = c.getContext('2d');
    let i = 0, label = null, born = Date.now();
    const draw = () => {
      const a = getA();
      if (!a || (!c.isConnected && Date.now() - born > 2000)) return false;
      const [sheet, row, text] = POSE.cuState(a);
      if (text !== label) { label = text; if (onLabel) onLabel(text); }
      const sk = sheet === 'cu1' ? k1 : k2, sh = S[sk], img = im[sheet];
      if (!img.complete || !img.naturalWidth) return true;
      const f = POSE.frame(sk, `${row}-${i % 4}`);
      // 떨 때는 1~2px씩 흔들고, 경계할 때는 아주 조금만 흔든다
      const jit = row === 'tremble' ? (i % 2 ? 2 : -2) : 0;
      const w = sh.w * scale, h = sh.h * scale, x = (c.width - w) / 2 + jit, y = c.height - h;
      g.clearRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = false;
      g.drawImage(img, f * sh.w, 0, sh.w, sh.h, x, y, w, h);
      const tint = G.SIM && G.SIM.coatTint(a);
      if (tint) {
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(img, f * sh.w, 0, sh.w, sh.h, x, y, w, h);
        g.globalCompositeOperation = 'source-over';
      }
      return true;
    };
    const tick = () => {
      if (!draw()) return;
      i++;
      const a = getA(), row = a ? POSE.cuState(a)[1] : '';
      setTimeout(tick, row === 'tremble' ? 110 : row === 'sick' || row === 'preg' || row === 'calm' ? 420 : 240);
    };
    for (const img of Object.values(im)) if (!img.complete) img.addEventListener('load', () => draw(), { once: true });
    tick();
    return c;
  };

  G.POSE = POSE;
})(window);
