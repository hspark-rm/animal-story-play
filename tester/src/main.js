// 보호소 지도 그리기와 시간 진행. 계산은 SIM, 메뉴는 UI가 맡는다.
// 지도는 카이로소프트식 아이소메트릭(마름모 바닥)으로 그린다. 논리 격자(x, y)는 그대로 두고 화면 좌표만 바꾼다.
(function (G) {
  const D = G.DATA, SIM = G.SIM, SPR = G.SPR, UI = G.UI;
  // 바닥 격자의 두 축. 건물 그림이 정면 대칭이 아니라 왼쪽 앞에서 본 각도로 그려져 있어서,
  // 그림 속 산책장 울타리에서 잰 기울기에 맞춘다(x축 0.367, y축 0.62, 가로폭 57:43)
  const AX = 56, AXY = 56 * 0.367;   // x가 1 늘 때: 오른쪽으로 AX, 아래로 AXY
  const AY = 42, AYY = 42 * 0.62;    // y가 1 늘 때: 왼쪽으로 AY, 아래로 AYY
  const TILE_W = AX + AY;            // 한 칸 바닥의 가로폭
  const FRONT = AX / TILE_W;         // 건물 그림에서 앞 꼭짓점이 놓인 가로 위치(왼쪽 기준 비율)
  const MARGIN = 5;                  // 부지 바깥 동네 칸 수
  // 부지 크기는 땅 넓히기로 바뀐다. 장면을 만들 때마다 다시 계산한다
  let COLS = D.GRID.cols, ROWS = D.GRID.rows, ROAD = ROWS - 1, OX = 0, TOP = 0, WORLD_W = 0, WORLD_H = 0;
  function setDims(s) {
    COLS = s.gridW; ROWS = s.gridH; ROAD = ROWS - 1;
    OX = 40 + MARGIN * AX + (ROWS + MARGIN) * AY;
    TOP = 200 + MARGIN * (AXY + AYY);
    WORLD_W = OX + (COLS + MARGIN) * AX + MARGIN * AY + 40;
    WORLD_H = TOP + (COLS + MARGIN) * AXY + (ROWS + MARGIN) * AYY + 60;
  }
  // 시점 돌리기(좌우 거울). 건물 뒷면 그림 없이 지도를 좌우로 뒤집어 다른 각도에서 보게 한다.
  // 보기 설정이라 저장 데이터가 아니라 이 기기의 브라우저에만 남긴다
  let MIR = false;
  try { MIR = localStorage.getItem('animal-story-view') === 'mirror'; } catch (e) { /* 막힌 창 */ }
  const GAP = 0.07;                  // 건물을 바닥 칸보다 이만큼(칸 단위, 사방) 안쪽에 세워 건물 사이에 틈을 둔다
  const DPR = Math.min(window.devicePixelRatio || 1, 3);

  // 격자 칸(x, y) 안의 한 점(u, v는 0~1) → 월드 좌표
  const iso = (x, y) => { const sx = OX + x * AX - y * AY; return { x: MIR ? WORLD_W - sx : sx, y: TOP + x * AXY + y * AYY }; };
  const tileCenter = (x, y) => iso(x + 0.5, y + 0.5);
  // 월드 좌표 → 격자 좌표(소수). 앞뒤 가림 판정과 길찾기에 쓴다
  const toCell = (wx, wy) => {
    const u = (MIR ? WORLD_W - wx : wx) - OX, v = wy - TOP, det = AX * AYY + AY * AXY;
    return { x: (u * AYY + AY * v) / det, y: (AX * v - AXY * u) / det };
  };
  // 월드 좌표 → 격자 칸 (두 축 일차식의 역변환)
  const toTile = (wx, wy) => {
    const u = (MIR ? WORLD_W - wx : wx) - OX, v = wy - TOP, det = AX * AYY + AY * AXY;
    return { x: Math.floor((u * AYY + AY * v) / det), y: Math.floor((AX * v - AXY * u) / det) };
  };

  let state = null;
  let speed = 1, buildType = null, moveId = null, acc = 0, game = null;

  // 그림 키: PNG가 있으면 PNG, 살찐 체형 PNG가 없으면 보통 체형을 옆으로 늘려 쓴다
  const animalTex = (a, frame) => {
    const fat = `animal-${a.breed}-fat-${frame}`, normal = `animal-${a.breed}-${frame}`;
    if (a.fat && a.species === 'dog') {
      if (SPR.has(fat)) return { key: fat, wide: 1 };
      if (SPR.has(normal)) return { key: normal, wide: 1.2 };
      return { key: fat, wide: 1 };
    }
    return { key: normal, wide: 1 };
  };
  const staffKey = (st, frame) => {
    if (st.role === 'owner' && SPR.has(`player-${st.gender || 'f'}-${frame}`)) return `player-${st.gender || 'f'}-${frame}`;
    if (st.sprite && SPR.has(`named-${st.sprite}-${frame}`)) return `named-${st.sprite}-${frame}`;
    return `staff-${st.role === 'owner' ? 'carer' : st.role}-${frame}`;
  };
  // 건물 그림에서 바닥 앞 꼭짓점(벽 모서리 아래 끝)의 픽셀 위치. 화분·상자처럼 앞에 놓인 장식이
  // 모서리보다 아래로 내려온 그림이 있어서, 맨 아래 픽셀이 아니라 벽 모서리에 맞춘다(2026-10-04 실측)
  const ANCHOR = {
    'iso-kennel': [114, 157], 'iso-cattery': [108, 179], 'iso-clinic': [130, 148], 'iso-yard': [108, 116],
    'iso-adoption': [119, 152], 'iso-storage': [119, 149], 'iso-shop': [110, 141], 'iso-construction': [108, 145],
    'iso-kennel-2x': [230, 233], 'iso-kennel-2y': [115, 225], 'iso-kennel-3x': [258, 242], 'iso-kennel-3y': [88, 252],
    'iso-cattery-2x': [282, 296], 'iso-cattery-3x': [313, 251], 'iso-cattery-2y': [80, 236], 'iso-cattery-3y': [57, 271],
    // 본관은 정면에 가깝게 그려져 있어 폭 대신 앞 벽 길이로 크기를 맞춘다('left')
    'iso-main-1': [265, 370, 'left'], 'iso-main-2': [320, 293, 'left'], 'iso-main-3': [305, 334, 'left'],
    'iso-bigkennel': [115, 165], 'iso-bigkennel-2x': [233, 263], 'iso-bigkennel-3x': [277, 260], 'iso-bigkennel-2y': [97, 248], 'iso-bigkennel-3y': [82, 257],
  };
  // 산책장 울타리 조각: [기준점 x 비율, 기준점 y 비율, 그림 속 변 가로 길이(px), 월드 가로 길이]
  // 기준점 = 조각 왼쪽 끝이 바닥 변과 만나는 점. 값은 tools/make_yard_parts.py 출력에서 옮김
  const YARD_FENCE = { 'yard-fence-x': [0, 30 / 74, 106, AX], 'yard-fence-y': [0, 80 / 85, 81, AY] };
  const facKey = (f) => {
    const def = D.FACILITIES[f.type];
    if (def.decor && SPR.has(def.sprite)) return def.sprite;
    if (f.type === 'main' && SPR.has('iso-main-1')) return `iso-main-${SIM.mainStage(state)}`;
    const t = f.buildLeft ? 'construction' : f.type;
    return SPR.has(`iso-${t}`) ? `iso-${t}` : `tile-${t}`;
  };
  // 크기가 제각각인 그림을 월드 단위 높이(또는 너비)에 맞춘다
  const fitHeight = (spr, h, wide = 1) => { const s = h / spr.height; spr.setScale(s * wide, s); };
  const fitWidth = (spr, w) => spr.setScale(w / spr.width);
  // 거울 시점에서는 그림을 좌우로 뒤집고 기준점도 반대편으로 옮긴다
  const originM = (img, ox, oy) => img.setFlipX(MIR).setOrigin(MIR ? 1 - ox : ox, oy);
  const anchorImg = (img, key) => {
    const a = ANCHOR[key];
    if (a && img.width > 1) originM(img, a[0] / img.width, (a[1] + 1) / img.height);
    else originM(img, img.fallbackOrigin ?? FRONT, 1);
  };

  class Shelter extends Phaser.Scene {
    constructor() { super('shelter'); }

    preload() { SPR.preload(this); }

    create() {
      setDims(state);
      SPR.build(this, D);
      this.cameras.main.setBackgroundColor(SPR.has('bg-canopy') ? '#5f9e45' : '#a8dcef');
      // 게임개발스토리식 배경: 지도 바깥을 숲 무늬 한 장으로 끝없이 채운다(빈 하늘색이 보이지 않게)
      this.seasonGround = []; this.seasonTrees = [];   // 계절 따라 색·그림을 바꿀 바닥과 바깥 나무
      if (SPR.has('bg-canopy')) this.canopy = this.add.tileSprite(WORLD_W / 2, WORLD_H / 2, WORLD_W * 4, WORLD_H * 4, 'bg-canopy').setTileScale(0.5).setDepth(-20);
      this.drawGround();
      this.drawDecor();
      // 구름: 지도 위쪽을 천천히 흘러간다(가리지 않게 반투명)
      for (let i = 1; i <= 3; i++) {
        if (!SPR.has(`bg-cloud-${i}`)) continue;
        const c = this.add.image(Math.random() * WORLD_W, TOP - 80 + Math.random() * WORLD_H * 0.25, `bg-cloud-${i}`).setAlpha(0.88).setDepth(5400);
        fitWidth(c, 150 + Math.random() * 60);
        const drift = () => this.tweens.add({ targets: c, x: WORLD_W + 200, duration: (WORLD_W + 200 - c.x) * 90, onComplete: () => { c.x = -200; drift(); } });
        drift();
      }
      this.gridLines = this.add.graphics().setDepth(5);
      this.facLayer = {};
      this.animalSpr = {};
      this.staffSpr = {};
      this.frame = 0;
      this.time.addEvent({ delay: 320, loop: true, callback: () => { this.frame ^= 1; this.flipFrames(); } });
      this.setupInput();
      this.fitCamera(true);
      this.scale.on('resize', () => this.fitCamera(false));
      this.sync(true);
      this.applySeason(SIM.season(state.day));
      this.startTraffic();
      this.setPaused(speed === 0);
    }

    // 일시정지: 날짜만 멈추는 게 아니라 걷기·트윈·타이머·눈비까지 모두 멈춘다
    setPaused(p) {
      this.paused = p;
      this.time.paused = p;
      if (p) this.tweens.pauseAll(); else this.tweens.resumeAll();
      if (this.fx) { if (p) this.fx.pause(); else this.fx.resume(); }
    }

    // 계절: 바깥 숲·바닥 색, 바깥 나무 일부를 벚꽃·단풍으로, 겨울엔 눈사람과 하얀 막, 꽃잎·낙엽·눈이 흩날린다
    applySeason(season) {
      if (this.fx) { this.fx.destroy(); this.fx = null; }
      if (this.winterVeil) { this.winterVeil.destroy(); this.winterVeil = null; }
      for (const o of this.snowmen || []) o.destroy();
      this.snowmen = [];
      const tint = { spring: [0xffffff, 0xffffff], summer: [0xffffff, 0xeeffe0], autumn: [0xfff0c8, 0xf0b878], winter: [0xe6eef8, 0xc8d8e8] }[season];
      for (const g of this.seasonGround) g.setTint(tint[0]);
      if (this.canopy) this.canopy.setTint(tint[1]);
      const swap = { spring: 'bg-tree-spring', autumn: 'bg-tree-autumn' }[season];
      for (const t of this.seasonTrees) {
        const k = swap && SPR.has(swap) && t.pick < 0.4 ? swap : t.baseKey;
        if (t.texture.key !== k) { t.setTexture(k); fitHeight(t, t.baseH); }
        t.setTint(season === 'winter' ? 0xd6e2ee : season === 'autumn' && k === t.baseKey ? 0xffd090 : 0xffffff);
      }
      if (season === 'winter') {
        this.winterVeil = this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W * 4, WORLD_H * 4, 0xffffff, 0.16).setDepth(-1.5);
        if (SPR.has('bg-snowman')) for (const [x, y] of [[-1.2, ROWS - 3], [COLS + 0.6, 2.5], [COLS * 0.3, -1.4]]) {
          const p = iso(x, y), m = this.add.image(p.x, p.y, 'bg-snowman').setOrigin(0.5, 1).setDepth(2 + x + y);
          fitHeight(m, 44);
          this.snowmen.push(m);
        }
      }
      // 흩날리는 것: 작은 점 그림을 그때그때 만들어 쓴다
      const fx = { spring: ['fx-petal', 0xf7b6c8], autumn: ['fx-leaf', 0xe8843c], winter: ['fx-snow', 0xffffff] }[season];
      if (fx) {
        if (!this.textures.exists(fx[0])) {
          const g = this.make.graphics({ x: 0, y: 0, add: false });
          g.fillStyle(fx[1], 1);
          if (season === 'winter') g.fillCircle(3, 3, 3); else g.fillRect(0, 0, season === 'spring' ? 5 : 6, season === 'spring' ? 3 : 4);
          g.generateTexture(fx[0], 6, 6);
          g.destroy();
        }
        this.fx = this.add.particles(0, 0, fx[0], {
          x: { min: -WORLD_W * 0.2, max: WORLD_W * 1.2 }, y: { min: TOP - 400, max: TOP - 100 },
          lifespan: 16000, speedY: { min: 22, max: 40 }, speedX: { min: -12, max: 22 },
          rotate: { min: 0, max: 360 }, scale: { min: 0.8, max: 1.6 }, alpha: { start: 0.95, end: 0.6 },
          frequency: season === 'winter' ? 60 : 160, quantity: 1,
        }).setDepth(5300);
        if (this.paused) this.fx.pause();
      }
    }

    // 바깥 길의 움직이는 것들: 차·버스·오토바이·자전거가 도로로, 개와 산책하는 이웃이 보도로 지나간다
    startTraffic() {
      const roads = [
        { a: (t) => iso(t, ROWS + 1.5), from: -MARGIN, to: COLS + MARGIN },     // 앞 도로(x축)
        { a: (t) => iso(COLS + 1.5, t), from: -MARGIN, to: ROWS + MARGIN },     // 오른쪽 도로(y축)
      ];
      const spawn = () => {
        if (!this.scene.isActive()) return;
        const r = roads[Math.random() < 0.6 ? 0 : 1], fwd = Math.random() < 0.5;
        const t0 = fwd ? r.from : r.to, t1 = fwd ? r.to : r.from;
        const p0 = r.a(t0), p1 = r.a(t1);
        const roll = Math.random();
        if (roll < 0.22) this.walker(r, fwd);   // 산책하는 이웃
        else {
          const kinds = [['bg-car', 40, true], ['bg-bus', 52, true], ['bg-scooter', 34, false], ['bg-cyclist', 36, false]].filter(([k]) => SPR.has(k));
          const [key, h, isoFacing] = kinds[Math.floor(Math.random() * kinds.length)];
          // 그림 방향: 차·버스는 왼쪽 앞을, 오토바이·자전거는 오른쪽을 본다. 화면에서 가는 방향에 맞춰 뒤집는다
          const goRight = p1.x > p0.x;
          const v = this.add.image(p0.x, p0.y, key).setOrigin(0.5, 0.92).setFlipX(isoFacing ? goRight : !goRight);
          fitHeight(v, h);
          const d = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          this.tweens.add({ targets: v, x: p1.x, y: p1.y, duration: d * (key === 'bg-cyclist' ? 22 : 11), onUpdate: () => v.setDepth(this.charDepth(v.x, v.y)), onComplete: () => v.destroy() });
        }
        this.time.delayedCall(2500 + Math.random() * 5000, spawn);
      };
      this.time.delayedCall(1200, spawn);
    }

    walker(r, fwd) {
      const people = ['visitor-grandpa', 'visitor-office', 'visitor-student', 'visitor-dad', 'visitor-bride'].filter((k) => SPR.has(`${k}-0`));
      if (!people.length) return;
      const off = (p) => ({ x: p.x, y: p.y - 18 });   // 도로보다 보도 쪽으로 조금
      const p0 = off(r.a(fwd ? r.from : r.to)), p1 = off(r.a(fwd ? r.to : r.from));
      const key = people[Math.floor(Math.random() * people.length)];
      const v = this.add.sprite(p0.x, p0.y, `${key}-0`).setOrigin(0.5, 1).setScale(0.72);
      v.base = key; v.passerby = true;
      (this.visitors = (this.visitors || []).filter((x) => x.active)).push(v);
      const breeds = Object.keys(D.BREEDS).filter((b) => D.BREEDS[b].species === 'dog' && SPR.has(`animal-${b}-0`));
      const dog = this.add.sprite(p0.x + 16, p0.y + 3, `animal-${breeds[Math.floor(Math.random() * breeds.length)]}-0`).setOrigin(0.5, 1);
      fitHeight(dog, 26);
      const goRight = p1.x > p0.x;
      if (!goRight) dog.scaleX = -Math.abs(dog.scaleX);
      this.tweenPath(v, [p1], 26, () => v.destroy());
      this.tweens.add({ targets: dog, x: p1.x + (goRight ? 16 : -16), y: p1.y + 3, duration: Math.hypot(p1.x - p0.x, p1.y - p0.y) * 26, onUpdate: () => dog.setDepth(this.charDepth(dog.x, dog.y)), onComplete: () => dog.destroy() });
    }

    /* 바닥: 차분한 두 톤 바둑판 잔디와 맨 앞 흙길, 뒤쪽 두 변에 나무 울타리 */
    drawGround() {
      // 부지 바깥 동네 바닥: 연한 잔디, 앞쪽 도로
      // 바닥 질감 그림(gt-*)이 있으면 칸마다 붙인다. tools/make_ground_tiles.py가 격자 각도에 맞춰 만든 그림이다
      if (SPR.has('gt-grass-a')) {
        const key = (x, y) => {
          if (x >= 0 && y >= 0 && x < COLS && y < ROWS) return y === ROAD ? 'gt-dirt' : ((x + y) % 2 ? 'gt-grass-a' : 'gt-grass-b');
          if (y === ROWS + 1 || x === COLS + 1) return 'gt-asphalt';
          if (y === ROWS || x === COLS) return 'gt-paving';
          return 'gt-meadow';
        };
        for (let y = -MARGIN; y < ROWS + MARGIN; y++) {
          for (let x = -MARGIN; x < COLS + MARGIN; x++) {
            const p = iso(x, y);
            this.seasonGround.push(originM(this.add.image(p.x, p.y, key(x, y)), 85 / 198, 1 / 95).setScale(0.5).setDepth(-2));
          }
        }
      }
      const tex = SPR.has('gt-grass-a');
      const out = this.add.graphics().setDepth(-1);
      for (let y = -MARGIN; y < ROWS + MARGIN; y++) {
        for (let x = -MARGIN; x < COLS + MARGIN; x++) {
          if (tex) break;
          if (x >= 0 && y >= 0 && x < COLS && y < ROWS) continue;
          const street = y === ROWS + 1 || x === COLS + 1;
          const c = street ? 0x9aa3ab : ((x + y) % 2 ? 0xbfe3a0 : 0xb6dc96);
          const p = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)];
          out.fillStyle(c, 1).fillPoints(p, true);
          if (street) out.lineStyle(2, 0xf2f2f2, 0.6).lineBetween((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, (p[2].x + p[3].x) / 2, (p[2].y + p[3].y) / 2);
        }
      }
      const g = this.add.graphics().setDepth(0);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const road = y === ROAD;
          const c = road ? ((x + y) % 2 ? 0xe9d3a2 : 0xe2c993) : ((x + y) % 2 ? 0xa9d672 : 0x9ccd66);
          const p = [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)];
          if (!tex) g.fillStyle(c, 1).fillPoints(p, true);
          g.lineStyle(1, 0xffffff, tex ? 0.12 : 0.18).strokePoints(p, true);
        }
      }
      // 바닥 두께(앞쪽 두 면)
      const left = [iso(0, ROWS), iso(COLS, ROWS), { x: iso(COLS, ROWS).x, y: iso(COLS, ROWS).y + 14 }, { x: iso(0, ROWS).x, y: iso(0, ROWS).y + 14 }];
      const right = [iso(COLS, 0), iso(COLS, ROWS), { x: iso(COLS, ROWS).x, y: iso(COLS, ROWS).y + 14 }, { x: iso(COLS, 0).x, y: iso(COLS, 0).y + 14 }];
      g.fillStyle(0x8a6a44, 1).fillPoints(left, true);
      g.fillStyle(0x6f5235, 1).fillPoints(right, true);
      // 울타리: 위 꼭짓점에서 왼쪽·오른쪽 뒤 변을 따라
      const f = this.add.graphics().setDepth(1);
      const fence = (a, b, n) => {
        for (let i = 0; i <= n; i++) {
          const t = i / n, px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
          f.fillStyle(0x7a5232, 1).fillRect(px - 2, py - 26, 4, 26);
        }
        for (const h of [8, 18]) {
          f.lineStyle(4, 0xa8784a, 1).lineBetween(a.x, a.y - h, b.x, b.y - h);
        }
      };
      // 흰 피켓 울타리(v0.7): 부지 네 둘레. 앞쪽 가운데는 정문
      this.fenceObjs = [];
      if (!SPR.has('fence-white-x')) {
        fence(iso(0, ROWS - 1), iso(0, 0), ROWS - 1);
        fence(iso(0, 0), iso(COLS, 0), COLS);
        return;
      }
      const piece = (key, at, box) => {
        const [ox, oy, len, axisW] = YARD_FENCE[key.replace('fence-white', 'yard-fence')];
        const img = originM(this.add.image(at.x, at.y, key), ox, oy).setScale(axisW / len).setDepth(1.6);
        if (box) { img.box = box; this.fenceObjs.push(img); }
      };
      const gx = Math.floor(COLS / 2);
      for (let x = 0; x < COLS; x++) piece('fence-white-x', iso(x, 0), null);                                   // 뒤 오른쪽
      for (let y = 0; y < ROWS; y++) piece('fence-white-y', iso(0, y + 1), null);                               // 뒤 왼쪽
      for (let x = 0; x < COLS; x++) if (x !== gx) piece('fence-white-x', iso(x, ROWS), { x0: x, y0: ROWS, x1: x + 1, y1: ROWS + 0.01 });   // 앞 왼쪽
      for (let y = 0; y < ROWS; y++) piece('fence-white-y', iso(COLS, y + 1), { x0: COLS, y0: y, x1: COLS + 0.01, y1: y + 1 });            // 앞 오른쪽
      if (SPR.has('deco-gate')) {
        const p = iso(gx + 0.5, ROWS);
        const gate = originM(this.add.image(p.x, p.y + 6, 'deco-gate'), 0.5, 1);
        fitHeight(gate, 44);
        gate.box = { x0: gx, y0: ROWS, x1: gx + 1, y1: ROWS + 0.01 };
        this.fenceObjs.push(gate);
      }
      if (SPR.has('deco-signboard')) {
        const p = iso(gx + 1.7, ROWS + 0.45);
        const sign = originM(this.add.image(p.x, p.y, 'deco-signboard'), 0.5, 1);
        fitHeight(sign, 54);
        sign.box = { x0: gx + 1.5, y0: ROWS + 0.3, x1: gx + 1.9, y1: ROWS + 0.6 };
        this.fenceObjs.push(sign);
        // 간판 글자는 보호소 이름. 그림 위 판자 가운데에 겹친다
        this.signText = this.add.text(p.x, p.y - 36, state.shelterName, { fontFamily: 'Do Hyeon, sans-serif', fontSize: '11px', color: '#fff6e0', stroke: '#5a3a1e', strokeThickness: 3 }).setOrigin(0.5).setDepth(5000);
      }
    }

    /* 울타리 바깥 장식: 그림이 있을 때만 */
    drawDecor() {
      const R = ROWS, C = COLS;
      const spots = [
        // 울타리 바로 바깥 소품
        ['deco-tree', -0.9, 1.5, 120], ['deco-tree', -0.9, R * 0.45, 110], ['deco-bush', -0.7, R - 3, 60], ['deco-tree', 1.5, -0.9, 120],
        ['deco-lamp', C * 0.45, -0.6, 90], ['deco-tree', C - 2.5, -0.9, 115], ['deco-bush', C - 0.8, -0.7, 60], ['deco-mailbox', -0.6, R - 1.4, 50],
        ['deco-sign', C + 0.6, R - 1.6, 60], ['deco-flowers', C + 0.5, R - 3.5, 50],
        // 뒤쪽 동네 풍경
        ['bg-house', -3, 1, 150], ['bg-townhouse', -3.2, R * 0.55, 165], ['bg-trees', -3, R - 1, 120],
        ['bg-store', 1.5, -3.2, 150], ['bg-pond', C * 0.5, -3, 110], ['bg-playground', C - 1, -3.2, 130],
        // 앞쪽 길가
        ['bg-busstop', C + 2.6, R - 4, 110], ['bg-car', C * 0.4, R + 2.6, 80], ['bg-garden', C + 2.8, 1.5, 110],
      ];
      const taken = new Set();
      for (const [key, x, y, h] of spots) {
        if (!SPR.has(key)) continue;
        const p = iso(x, y);
        const s = this.add.image(p.x, p.y, key).setOrigin(0.5, 1).setDepth(2 + (x + y));
        fitHeight(s, h);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) taken.add(`${Math.floor(x) + dx},${Math.floor(y) + dy}`);
      }
      // 바깥 둘레를 나무로 채운다. 부지에서 멀수록 빽빽하게, 같은 그림 몇 장을 크기·좌우만 바꿔 되풀이한다
      const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
      const kinds = [['deco-tree', 105, 125], ['bg-trees', 95, 120], ['deco-tree', 95, 115], ['deco-bush', 45, 60]].filter(([k]) => SPR.has(k));
      if (!kinds.length) return;
      for (let y = -MARGIN; y < ROWS + MARGIN; y++) {
        for (let x = -MARGIN; x < COLS + MARGIN; x++) {
          if (x >= 0 && y >= 0 && x < COLS && y < ROWS) continue;          // 부지
          if (x >= COLS && x <= COLS + 1 && y < ROWS + 2) continue;          // 오른쪽 보도·도로
          if (y >= ROWS && y <= ROWS + 1 && x < COLS + 2) continue;          // 앞쪽 보도·도로
          if (taken.has(`${x},${y}`)) continue;
          const d = Math.max(-x, -y, x - COLS + 1, y - ROWS + 1);            // 부지에서 떨어진 칸 수
          const r = hash(x, y);
          const front = y > ROWS + 1 || x > COLS + 1;                         // 도로 건너편은 시야를 가리지 않게 성기게
          if (d <= 1 || r > (d >= 4 ? 0.9 : d >= 3 ? 0.65 : 0.35) * (front ? 0.55 : 1)) continue;
          const [key, h0, h1] = kinds[Math.floor(hash(y, x) * kinds.length)];
          const tx = x + 0.3 + hash(x + 7, y) * 0.4, ty = y + 0.3 + hash(x, y + 7) * 0.4;
          const p = iso(tx, ty);
          const img = this.add.image(p.x, p.y, key).setOrigin(0.5, 1).setDepth(2 + tx + ty);
          if (key !== 'deco-bush') { img.baseKey = key; img.baseH = h0 + (h1 - h0) * r; img.pick = hash(x + 11, y + 13); this.seasonTrees.push(img); }
          fitHeight(img, h0 + (h1 - h0) * r);
          if (hash(x + 3, y + 5) < 0.5) img.setFlipX(true);
        }
      }
    }

    // 이어 지은 산책장: 칸마다 잔디를 깔고, 바깥 변에만 산책장 그림에서 떼어 낸 울타리 조각을 세운다
    // (tools/make_yard_parts.py). 위·왼쪽 변은 뒤 울타리, 오른쪽·아래 변은 앞 울타리
    drawYards(groups) {
      for (const o of this.yardObjs || []) o.destroy();
      this.yardObjs = [];
      const fx = SPR.has('yard-fence-x'), fy = SPR.has('yard-fence-y');
      const fence = (key, at, front, cx, cy) => {
        const [ox, oy, len, axisW] = YARD_FENCE[key];
        const img = originM(this.add.image(at.x, at.y, key), ox, oy).setScale(axisW / len);
        img.setDepth(1.6);
        if (front) img.box = { x0: cx, y0: cy, x1: cx + 1, y1: cy + 1 };   // 앞 울타리는 건물과 같이 앞뒤를 가린다
        this.yardObjs.push(img);
      };
      for (const g of groups) {
        const inG = new Set(g.cells.map(([x, y]) => `${x},${y}`));
        for (const [x, y] of g.cells) {
          const top = iso(x, y);
          if (SPR.has('gt-grass-b')) this.yardObjs.push(originM(this.add.image(top.x, top.y, (x + y) % 2 ? 'gt-grass-a' : 'gt-grass-b'), 85 / 198, 1 / 95).setScale(0.5).setTint(0xd8f2a0).setDepth(1.4));
          if (!fx || !fy) continue;
          if (!inG.has(`${x},${y - 1}`)) fence('yard-fence-x', iso(x, y), false);          // 뒤 오른쪽 변
          if (!inG.has(`${x - 1},${y}`)) fence('yard-fence-y', iso(x, y + 1), false);      // 뒤 왼쪽 변
          if (!inG.has(`${x},${y + 1}`)) fence('yard-fence-x', iso(x, y + 1), true, x, y);       // 앞 왼쪽 변
          if (!inG.has(`${x + 1},${y}`)) fence('yard-fence-y', iso(x + 1, y + 1), true, x, y);   // 앞 오른쪽 변
        }
      }
    }

    fitCamera(first) {
      const cam = this.cameras.main;
      const w = this.scale.width, h = this.scale.height;
      const fit = Math.min(w / WORLD_W, h / WORLD_H);
      const old = this.fitZoom;
      this.fitZoom = fit;
      // 화면 방향이 바뀌면(세로↔가로) 처음처럼 다시 맞춘다
      const portraitNow = h > w * 1.1;
      if (this.portrait !== undefined && this.portrait !== portraitNow) first = true;
      this.portrait = portraitNow;
      this.minZoom = fit * 0.9;
      this.maxZoom = fit * 4;
      cam.setBounds(-WORLD_W * 0.5, -WORLD_H * 0.5, WORLD_W * 2, WORLD_H * 2);
      if (first || !old) {
        // 세로 화면에서는 마름모 지도가 작아 보이므로 처음부터 확대해 보호소 가운데를 보여 준다
        const portrait = h > w * 1.1;
        cam.setZoom(Phaser.Math.Clamp(portrait ? fit * 1.8 : fit, this.minZoom, this.maxZoom));
        const c = tileCenter(COLS / 2 - 0.5, ROWS / 2 - 0.5);
        cam.centerOn(c.x, c.y - 30);
      } else {
        cam.setZoom(Phaser.Math.Clamp(cam.zoom * fit / old, this.minZoom, this.maxZoom));
      }
    }

    /* 손가락 하나로 끌면 이동, 두 손가락으로 벌리면 확대. 마우스 휠도 확대 */
    setupInput() {
      this.input.addPointer(1);
      const cam = this.cameras.main;
      let drag = null, pinch = null;
      this.input.on('pointerdown', (p) => {
        const ps = this.input.manager.pointers.filter((q) => q.isDown);
        if (ps.length >= 2) {
          const [a, b] = ps;
          pinch = { dist: Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y), zoom: cam.zoom };
          drag = null;
        } else {
          drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, moved: false };
        }
      });
      this.input.on('pointermove', () => {
        const ps = this.input.manager.pointers.filter((q) => q.isDown);
        if (pinch && ps.length >= 2) {
          const [a, b] = ps;
          const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
          cam.setZoom(Phaser.Math.Clamp(pinch.zoom * d / pinch.dist, this.minZoom, this.maxZoom));
          return;
        }
        const p = ps[0];
        if (drag && p) {
          const dx = p.x - drag.x, dy = p.y - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 8 * DPR) drag.moved = true;
          if (drag.moved) cam.setScroll(drag.sx - dx / cam.zoom, drag.sy - dy / cam.zoom);
        }
      });
      this.input.on('pointerup', (p) => {
        const still = this.input.manager.pointers.filter((q) => q.isDown).length;
        if (pinch) { if (!still) pinch = null; drag = null; return; }
        if (drag && !drag.moved) this.onTap(p);
        drag = null;
      });
      this.input.on('wheel', (p, objs, dx, dy) => {
        cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), this.minZoom, this.maxZoom));
      });
    }

    /* 상태와 화면 맞추기 */
    sync(first) {
      if (!this.facLayer) return;   // 장면이 아직 만들어지기 전(그림 불러오는 중)
      for (const [id, img] of Object.entries(this.facLayer)) {
        if (!state.facilities[id]) { if (img.label) img.label.destroy(); img.destroy(); delete this.facLayer[id]; }
      }
      // 이어 지은 견사는 긴 건물 한 동으로, 이어 지은 산책장은 울타리 마당으로 그린다
      const groups = SIM.groups(state);
      const kRole = {};
      this.kAxis = {};
      for (const type of D.MERGE_LINE) for (const g of groups[type]) {
        g.ids.forEach((id, i) => { kRole[id] = { g, lead: i === 0 }; });
        if (g.len > 1) for (const id of g.ids) this.kAxis[id] = g.axis;
      }
      const yardBig = new Set(groups.yard.filter((g) => g.len > 1).flatMap((g) => g.ids));
      this.drawYards(groups.yard.filter((g) => g.len > 1));
      this.drawYardItems();
      for (const f of Object.values(state.facilities)) {
        let key = facKey(f);
        let n = SIM.size(f.type);
        let box = { x0: f.x, y0: f.y, x1: f.x + n, y1: f.y + n };
        let originX = FRONT, hidden = yardBig.has(f.id);
        const kr = kRole[f.id];
        if (kr && kr.g.len > 1) {
          const { g } = kr, L = g.len, mk = `iso-${g.type}-${L}${g.axis}`;
          if (!kr.lead) hidden = true;
          else if (SPR.has(mk)) {
            key = mk;
            box = g.axis === 'x' ? { x0: g.x, y0: g.y, x1: g.x + L, y1: g.y + 1 } : { x0: g.x, y0: g.y, x1: g.x + 1, y1: g.y + L };
            originX = g.axis === 'x' ? (L * AX) / (L * AX + AY) : AX / (AX + L * AY);
          }
        }
        // 바닥보다 GAP만큼 안쪽에 세운다: 앞 꼭짓점을 안으로 당기고 폭을 줄인다
        const def = D.FACILITIES[f.type];
        const front = def.decor ? iso(f.x + 0.5, f.y + 0.68) : iso(box.x1 - GAP, box.y1 - GAP);   // 꾸밈은 칸 가운데 조금 앞에 선다
        const width = (box.x1 - box.x0 - 2 * GAP) * AX + (box.y1 - box.y0 - 2 * GAP) * AY;
        const sizeFac = (img) => {
          if (def.decor && SPR.has(key)) { originM(img, 0.5, 1); fitHeight(img, def.h); return; }
          fitWidth(img, width);
          const a = ANCHOR[key];
          if (a && a[2] === 'left') img.setScale((box.x1 - box.x0 - 2 * GAP) * AX / a[0]);
        };
        const sig = `${key}|${f.x},${f.y}|${hidden}`;
        const base = iso(f.x + n / 2, f.y + n / 2);
        let img = this.facLayer[f.id];
        // 자리·그림이 바뀐 건물(옮김, 이어 짓기)은 다시 세운다
        if (img && img.sig !== sig && !(f.buildLeft === 0 && img.texture.key === 'iso-construction')) { if (img.label) img.label.destroy(); img.destroy(); img = null; delete this.facLayer[f.id]; }
        if (!img) {
          img = this.add.image(front.x, front.y + 1, key).setOrigin(originX, 1);
          img.fallbackOrigin = originX;
          anchorImg(img, key);
          img.sig = sig;
          img.setVisible(!hidden);
          sizeFac(img);
          if (!first) { const s = img.scaleY; this.tweens.add({ targets: img, scaleY: { from: s * 0.4, to: s }, duration: 220, ease: 'Back.Out' }); }
          this.facLayer[f.id] = img;
        } else if (img.texture.key !== key) {
          // 완공 순간: 그림만 바꾸지 말고 자리도 다시 잡는다. 옆 칸과 이어져 긴 건물의 첫 칸이 되면
          // 앞 꼭짓점이 공사 때와 달라진다(2026-10-04 긴 묘사가 두 칸 왼쪽에 그려진 버그)
          img.setPosition(front.x, front.y + 1);
          img.fallbackOrigin = originX;
          img.setVisible(!hidden);
          img.setTexture(key);
          anchorImg(img, key);
          img.sig = sig;
          sizeFac(img);
          const s = img.scaleY;
          this.tweens.add({ targets: img, scaleY: { from: s * 0.4, to: s }, duration: 260, ease: 'Back.Out' });
          this.floatText(base.x, base.y - 60, '완공!', '#e8743b');
        }
        img.box = box;
        if (f.buildLeft) {
          if (!img.label) img.label = this.add.text(base.x, base.y - 60 * n, '', { fontFamily: 'Do Hyeon, sans-serif', fontSize: '22px', color: '#3b2a20', stroke: '#ffffff', strokeThickness: 5 }).setOrigin(0.5).setDepth(5000);
          img.label.setText(`공사 ${f.buildLeft}일`);
        } else if (img.label) { img.label.destroy(); img.label = null; }
      }
      this.sortDepths();
      this.buildWalkGrid();
      const alive = new Map(state.animals.map((a) => [a.id, a]));
      for (const [id, spr] of Object.entries(this.animalSpr)) {
        if (!alive.has(Number(id))) { this.leave(spr); delete this.animalSpr[id]; }
      }
      for (const a of state.animals) {
        const home = state.facilities[a.home];
        if (!home) continue;
        let spr = this.animalSpr[a.id];
        if (!spr) {
          const start = first ? this.spotIn(home) : tileCenter(home.x, ROAD);
          spr = this.add.sprite(start.x, start.y, animalTex(a, 0).key).setOrigin(0.5, 1);
          this.animalSpr[a.id] = spr;
          if (!first) this.floatText(start.x, start.y - 40, '새 식구', '#3b6fd0');
        }
        spr.animal = a;
        spr.homeId = a.home;
        this.sizeAnimal(spr);
      }
      const staffIds = new Set(state.staff.map((s) => s.id));
      for (const [id, spr] of Object.entries(this.staffSpr)) {
        if (!staffIds.has(Number(id))) { spr.destroy(); delete this.staffSpr[id]; }
      }
      for (const st of state.staff) {
        if (!this.staffSpr[st.id]) {
          const p = tileCenter(COLS / 2, ROAD);
          const spr = this.add.sprite(p.x, p.y, staffKey(st, 0)).setOrigin(0.5, 1);
          fitHeight(spr, 54);
          spr.staff = st;
          this.staffSpr[st.id] = spr;
        }
      }
      this.drawGrid();
    }

    sizeAnimal(spr) {
      const a = spr.animal;
      const t = animalTex(a, spr.moving ? this.frame : 0);
      if (spr.texture.key !== t.key) spr.setTexture(t.key);
      const h = a.ageDays < 120 ? 20 : a.species === 'cat' ? 28 : 34;
      fitHeight(spr, h, t.wide);
      const tint = SIM.coatTint(a);
      if (tint) spr.setTint(tint); else spr.clearTint();
      if (spr.flipped) spr.scaleX = -Math.abs(spr.scaleX);
    }

    // 집 칸 안의 아무 곳(테두리 조금 안쪽)
    // 동물은 집 건물 앞쪽 띠(앞 두 변 근처)에 세운다. 건물 그림 안쪽에 두면 지붕에 가려 안 보인다.
    // 이어 지은 견사는 긴 벽 앞으로만 다닌다(칸 사이 벽 쪽으로 가면 건물 속에 묻힌다)
    spotIn(f) {
      const n = SIM.size(f.type), r = Math.random, along = 0.15 + r() * (n - 0.3);
      // 벽 바로 앞(바닥 바깥 0.1~0.4칸)에 세운다. 벽 안쪽에 세우면 벽이 비쳐 보이는 것처럼 겹친다
      let depth = n + 0.1 + r() * 0.3;
      const axis = this.kAxis && this.kAxis[f.id];
      // 앞 칸에 다른 건물이 있는 변은 피한다(그 건물 지붕 위에 서 있는 것처럼 보인다)
      const blocked = (edge) => { for (let i = 0; i < n; i++) { const o = edge === 'y' ? SIM.facilityAt(state, f.x + i, f.y + n) : SIM.facilityAt(state, f.x + n, f.y + i); if (o && o.id !== f.id && o.type !== 'yard') return true; } return false; };
      const by = blocked('y'), bx = blocked('x');
      let onY = axis ? axis === 'x' : r() < 0.5;     // 앞쪽 y변(왼쪽 앞) 또는 x변(오른쪽 앞)
      if (!axis && by !== bx) onY = !by;
      if (onY ? by : bx) depth = n - 0.1;   // 앞이 막힌 변밖에 없으면 벽 앞쪽 안에 둔다
      return onY ? iso(f.x + along, f.y + depth) : iso(f.x + depth, f.y + along);
    }

    // 동물 하루 일과(화면만): 산책·산책장 훈련·장난감 놀이·집 앞 쉬기. 물품이 있어야 놀이가 나온다
    pickActivity(spr, home) {
      const a = spr.animal, inv = state.inv, r = Math.random();
      spr.act = 'home';
      let to = this.spotIn(home);
      if (!a) { this.go(spr, to); return; }
      if (a.species === 'dog') {
        const yards = Object.values(state.facilities).filter((f) => f.type === 'yard' && !f.buildLeft);
        const energy = D.BREEDS[a.breed].energy;
        if (yards.length && r < 0.3) {
          const y = yards.reduce((m, f) => (Math.hypot(f.x - home.x, f.y - home.y) < Math.hypot(m.x - home.x, m.y - home.y) ? f : m));
          spr.act = 'train'; to = iso(y.x + 0.2 + Math.random() * 0.6, y.y + 0.2 + Math.random() * 0.6);
        } else if (r < 0.3 + 0.25 * energy) {
          const t = this.walkSpot(a, home);
          if (t) { spr.act = 'walk'; to = t; }
        } else if (r < 0.95 && ((inv.toys || 0) > 0 || (inv.dogchew || 0) > 0)) spr.act = 'play';
      } else if (a.species === 'cat' && r < 0.3 && ((inv.toys || 0) > 0 || (inv.churu || 0) > 0)) spr.act = 'play';
      this.go(spr, to);
    }

    // 산책 범위: 활동량 × 몸집 × 나이·체형(DATA.WALK). 부지 안, 건물이 없는 칸(산책장은 지나가도 된다)
    walkSpot(a, home) {
      const W = D.WALK, n = SIM.size(home.type), g = SIM.ageGroup(a).key;
      const R = Math.min(W.max, D.BREEDS[a.breed].energy * W.perEnergy * W[SIM.dogSize(a)] * (g === 'baby' ? W.baby : g === 'senior' ? W.senior : 1) * (a.fat ? W.fat : 1));
      const cx = home.x + n / 2, cy = home.y + n / 2;
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2, d = 0.8 + Math.random() * Math.max(0.2, R - 0.8);
        const tx = cx + Math.cos(ang) * d, ty = cy + Math.sin(ang) * d;
        if (tx < 0.2 || ty < 0.2 || tx > COLS - 0.2 || ty > ROAD - 0.2) continue;
        const f = SIM.facilityAt(state, Math.floor(tx), Math.floor(ty));
        if (f && f.type !== 'yard') continue;
        return iso(tx, ty);
      }
      return null;
    }

    onArrive(spr) {
      const a = spr.animal;
      if (!a || !spr.active) return;
      if (spr.act === 'train') {
        spr.hold = this.time.now + 2600;
        this.tweens.add({ targets: spr, y: spr.y - 10, duration: 180, yoyo: true, repeat: 2, ease: 'Quad.Out' });
        if (Math.random() < 0.6) this.floatText(spr.x, spr.y - 40, ['앉아!', '기다려!', '점프!', '잘했어!', '손!'][Math.floor(Math.random() * 5)], '#3a8a3a');
      } else if (spr.act === 'play') this.play(spr);
      else if (spr.act === 'fetch') { if (spr.onFetch) spr.onFetch(); spr.onFetch = null; spr.act = 'home'; spr.hold = this.time.now + 800; }
      else if (spr.act === 'walk' && Math.random() < 0.4) spr.hold = this.time.now + 1200;   // 냄새 맡기
    }

    // 장난감·개껌·츄르 놀이. 물품 그림을 잠깐 띄운다
    play(spr) {
      const a = spr.animal, inv = state.inv, dir = spr.flipped ? -1 : 1;
      const prop = (key, x, y) => { const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(spr.depth + 0.2); fitHeight(img, 15); return img; };
      const opts = a.species === 'cat' ? ['toys', 'churu'] : ['toys', 'dogchew'];
      const have = opts.filter((k) => (inv[k] || 0) > 0 && SPR.has(`item-${k}`));
      if (!have.length) return;
      const kind = have[Math.floor(Math.random() * have.length)];
      if (kind === 'toys' && a.species === 'dog') {
        // 공 던지기: 공이 굴러가면 쫓아가서 물어 온다
        const ball = prop('item-toys', spr.x + dir * 8, spr.y);
        const to = { x: spr.x + dir * (40 + Math.random() * 30), y: spr.y + (Math.random() - 0.5) * 24 };
        this.tweens.add({ targets: ball, x: to.x, y: to.y, duration: 650, ease: 'Quad.Out' });
        spr.act = 'fetch'; this.go(spr, to, true);
        spr.onFetch = () => { ball.destroy(); this.floatText(spr.x, spr.y - 36, '♥', '#e85a7a'); };
        return;
      }
      if (kind === 'toys' && a.species === 'cat') {
        // 고양이 장난감은 개와 다르다: 털실 공을 굴려 쫓거나, 낚싯대 깃털에 뛰어오른다
        if (Math.random() < 0.5 && SPR.has('prop-yarn')) {
          const yarn = prop('prop-yarn', spr.x + dir * 8, spr.y);
          fitHeight(yarn, 11);
          const to = { x: spr.x + dir * (22 + Math.random() * 16), y: spr.y + (Math.random() - 0.5) * 14 };
          this.tweens.add({ targets: yarn, x: to.x, y: to.y, angle: dir * 360, duration: 700, ease: 'Quad.Out' });
          spr.act = 'fetch'; this.go(spr, { x: to.x - dir * 8, y: to.y }, true);
          spr.onFetch = () => {
            this.tweens.add({ targets: yarn, x: yarn.x + dir * 6, duration: 140, yoyo: true, repeat: 3, onComplete: () => yarn.destroy() });
            this.floatText(spr.x, spr.y - 30, '♥', '#e85a7a');
          };
          return;
        }
        if (SPR.has('prop-wand')) {
          const wand = prop('prop-wand', spr.x + dir * 14, spr.y - 22);
          fitHeight(wand, 20);
          if (dir < 0) wand.setFlipX(true);
          spr.hold = this.time.now + 2600;
          this.tweens.add({ targets: wand, angle: { from: -18, to: 18 }, duration: 260, yoyo: true, repeat: 4 });
          this.tweens.add({ targets: spr, y: spr.y - 12, duration: 200, yoyo: true, repeat: 3, ease: 'Quad.Out' });
          this.time.delayedCall(2600, () => { wand.destroy(); if (spr.active) this.floatText(spr.x, spr.y - 30, '♥', '#e85a7a'); });
          return;
        }
      }
      const img = prop(`item-${kind}`, spr.x + dir * 12, spr.y - 2);
      spr.hold = this.time.now + 2800;
      this.tweens.add({ targets: spr, angle: { from: -5, to: 5 }, duration: 160, yoyo: true, repeat: 6, onComplete: () => { spr.angle = 0; } });
      this.time.delayedCall(2800, () => { img.destroy(); if (spr.active) this.floatText(spr.x, spr.y - 36, a.species === 'cat' ? '♥' : '♪', '#e85a7a'); });
    }

    leave(spr) {
      this.floatText(spr.x, spr.y - 40, '♥', '#e85a7a');
      const from = { x: spr.px ?? spr.x, y: spr.py ?? spr.y };
      spr.x = from.x; spr.y = from.y;
      const gate = tileCenter(Math.floor(COLS / 2), ROAD);
      this.tweenPath(spr, [...this.route(from, gate), iso(COLS / 2 + 0.5, ROWS + 1.5), iso(COLS + 1.5, ROWS + 1.5)], 6, () => spr.destroy());
    }

    // 경유점을 차례로 트윈으로 걷는다(방문자, 떠나는 아이). msPerPx = 1px 가는 데 걸리는 시간
    tweenPath(o, pts, msPerPx, done) {
      const stepTo = () => {
        const to = pts.shift();
        if (!to || !o.active) { o.moving = false; if (done) done(); return; }
        const d = Math.hypot(to.x - o.x, to.y - o.y);
        o.moving = true;
        if (Math.abs(to.x - o.x) > 1.5) o.flipped = to.x < o.x;
        o.scaleX = (o.flipped ? -1 : 1) * Math.abs(o.scaleX);
        this.tweens.add({ targets: o, x: to.x, y: to.y, duration: Math.max(60, d * msPerPx), ease: pts.length ? 'Linear' : 'Sine.Out',
          onUpdate: () => o.setDepth(this.charDepth(o.x, o.y)), onComplete: stepTo });
      };
      stepTo();
    }

    floatText(x, y, text, color) {
      const t = this.add.text(x, y, text, { fontFamily: 'Do Hyeon, sans-serif', fontSize: '26px', color, stroke: '#ffffff', strokeThickness: 6 })
        .setOrigin(0.5).setDepth(6000);
      this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 1400, onComplete: () => t.destroy() });
    }

    // 방문자: 가족이 길에서 정문(앞 흙길 가운데)으로 들어와 아이에게 걸어가 교감하고, 다시 정문으로 나간다
    visit(animalId, familyName, again) {
      const spr = this.animalSpr[animalId];
      if (!spr) return;
      const fam = D.VISIT.families.find((f) => f.name === familyName);
      let who = (fam && fam.who) || [];
      who = who.filter((k) => SPR.has(`${k}-0`));
      if (!who.length) who = [Math.random() < 0.5 ? 'player-m' : 'player-f'];
      const street = iso(COLS / 2 + 0.5, ROWS + 1.5), gate = tileCenter(Math.floor(COLS / 2), ROAD);
      const exit = iso(COLS + 1.5, ROWS + 1.5);
      spr.hold = this.time.now + 14000;   // 가족이 올 때까지 기다린다
      const home = { x: spr.px ?? spr.x, y: spr.py ?? spr.y };
      const people = who.map((key, i) => {
        const v = this.add.sprite(street.x - i * 14, street.y + i * 4, `${key}-0`).setOrigin(0.5, 1).setScale(0.72);
        v.base = key;
        (this.visitors = (this.visitors || []).filter((x) => x.active)).push(v);
        // 방문자 표시: 맨 앞 사람 머리 위에 "처음 왔어요~ / 또 왔어요~"
        if (i === 0) v.label = this.add.text(v.x, v.y, again ? '또 왔어요~' : '처음 왔어요~', { fontFamily: 'Do Hyeon, sans-serif', fontSize: '12px', color: again ? '#c0506e' : '#3b6fd0', backgroundColor: '#fffdf5', padding: { x: 4, y: 2 } }).setOrigin(0.5, 1).setDepth(5200);
        return v;
      });
      const offset = (pts, i) => pts.map((p) => ({ x: p.x - i * 14, y: p.y + i * 5 }));
      let arrived = 0;
      people.forEach((v, i) => {
        const path = [gate, ...this.route(gate, { x: home.x + 24, y: home.y + 8 })];
        this.time.delayedCall(i * 380, () => this.tweenPath(v, offset(path, i), 10, () => { if (++arrived === people.length) bond(); }));
      });
      const bond = () => {
        // 교감: 쪼그려 앉아 쓰다듬고, 아이는 폴짝, 말풍선과 하트
        const hugged = this.hug(people[0], people[0].base, spr, 2800);
        people.forEach((v, i) => {
          v.flipped = v.x > (spr.px ?? spr.x); v.scaleX = (v.flipped ? -1 : 1) * Math.abs(v.scaleX);
          if (!(hugged && i === 0)) this.tweens.add({ targets: v, scaleY: v.scaleY * 0.88, duration: 260, yoyo: true, repeat: 2, delay: i * 200 });
          this.time.delayedCall(300 + i * 700, () => this.floatText(v.x, v.y - 58, D.VISIT.talk[Math.floor(Math.random() * D.VISIT.talk.length)], '#3b6fd0'));
        });
        if (spr.active) {
          this.tweens.add({ targets: spr, y: spr.y - 9, duration: 170, yoyo: true, repeat: 3, delay: 400 });
          for (let i = 0; i < 3; i++) this.time.delayedCall(500 + i * 650, () => { if (spr.active) this.floatText(spr.x, spr.y - 36, '♥', '#e85a7a'); });
        }
        this.time.delayedCall(3200, () => {
          spr.hold = 0;
          people.forEach((v, i) => this.time.delayedCall(i * 300, () =>
            this.tweenPath(v, [...this.route(v, gate), street, exit], 10, () => v.destroy())));
        });
      };
    }

    // 안아 주기(v0.7): 사람이 아이를 품에 안는다. 안은 모습 그림(<기본>-hug) 위 가슴 높이에 실제 아이 그림을 작게 겹친다.
    // 기본 모습이 아니라 교감할 때만 쓴다. 큰 개(중·대형견 성견)는 안지 않고 쪼그려 쓰다듬는다
    hug(person, base, spr, ms = 2600) {
      const a = spr && spr.animal;
      if (!a || !spr.active || !SPR.has(`${base}-hug`)) return false;
      if (a.species === 'dog' && SIM.dogSize(a) === 'large' && SIM.ageGroup(a).key !== 'baby') return false;
      const t = animalTex(a, 0);
      person.hugging = true;
      const sx = Math.abs(person.scaleX), sy = person.scaleY, h = person.displayHeight;
      person.setTexture(`${base}-hug`);
      person.setScale(sx, sy);
      const held = this.add.image(person.x, person.y - h * 0.34, t.key).setOrigin(0.5, 0.6).setDepth(person.depth + 0.05);
      fitHeight(held, a.species === 'cat' ? 17 : 19, t.wide);
      const tint = SIM.coatTint(a);
      if (tint) held.setTint(tint);
      if (person.flipped) held.scaleX = -Math.abs(held.scaleX);
      spr.setVisible(false);
      spr.hold = this.time.now + ms + 200;
      this.tweens.add({ targets: held, y: held.y - 2, duration: 300, yoyo: true, repeat: Math.floor(ms / 600) });
      for (let i = 0; i < 2; i++) this.time.delayedCall(400 + i * 900, () => this.floatText(person.x, person.y - h - 6, '♥', '#e85a7a'));
      this.time.delayedCall(ms, () => {
        held.destroy();
        if (spr.active) spr.setVisible(true);
        person.hugging = false;
        if (person.active) { person.setTexture(`${base}-0`); person.setScale(sx * (person.flipped ? -1 : 1), sy); }
      });
      return true;
    }

    flipFrames() {
      for (const v of this.visitors || []) if (v.active && !v.hugging) { v.setTexture(`${v.base}-${v.moving ? this.frame : 0}`); v.scaleX = (v.flipped ? -1 : 1) * Math.abs(v.scaleX); }
      for (const spr of Object.values(this.animalSpr)) if (spr.active && spr.animal) this.sizeAnimal(spr);
      for (const spr of Object.values(this.staffSpr)) {
        if (spr.hugging) continue;
        const k = staffKey(spr.staff, spr.moving ? this.frame : 0);
        if (spr.texture.key !== k) { spr.setTexture(k); fitHeight(spr, 54); if (spr.flipped) spr.scaleX = -Math.abs(spr.scaleX); }
      }
    }

    // 산책장 놀이기구: 산책장 칸 위에 그린다(v0.7). 개는 그 위를 그대로 지나다닌다
    drawYardItems() {
      for (const o of this.itemObjs || []) o.destroy();
      this.itemObjs = [];
      for (const it of SIM.yardItemList(state)) {
        const d = D.YARD_ITEMS[it.type];
        if (!SPR.has(d.sprite)) continue;
        const p = iso(it.x + 0.5, it.y + 0.62);
        const img = originM(this.add.image(p.x, p.y, d.sprite), 0.5, 1);
        fitHeight(img, d.h);
        img.box = { x0: it.x + 0.3, y0: it.y + 0.3, x1: it.x + 0.7, y1: it.y + 0.7 };
        this.itemObjs.push(img);
      }
    }

    // 건물·앞 울타리의 앞뒤 순서: 바닥 상자로 위상 정렬한다(긴 건물도 맞게 가린다).
    // A가 B의 뒤 = A의 앞쪽 끝이 B의 뒤쪽 끝보다 뒤(x 또는 y). 서로 대각선이면 겹치지 않으므로 순서를 두지 않는다
    sortDepths() {
      const nodes = [...Object.values(this.facLayer).filter((o) => o.visible), ...(this.yardObjs || []).filter((o) => o.box),
        ...(this.itemObjs || []), ...(this.fenceObjs || [])];
      const behind = (a, b) => (a.box.x1 <= b.box.x0 + 1e-6 || a.box.y1 <= b.box.y0 + 1e-6);
      const n = nodes.length, indeg = new Array(n).fill(0), next = nodes.map(() => []);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === j || !behind(nodes[i], nodes[j]) || behind(nodes[j], nodes[i])) continue;
        next[i].push(j); indeg[j]++;
      }
      const key = (o) => o.box.x1 + o.box.y1;
      const ready = nodes.map((_, i) => i).filter((i) => !indeg[i]);
      const order = [];
      while (ready.length) {
        ready.sort((p, q) => key(nodes[p]) - key(nodes[q]));
        const i = ready.shift();
        order.push(i);
        for (const j of next[i]) if (!--indeg[j]) ready.push(j);
      }
      for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);   // 순환이 있으면 앞 꼭짓점 순서로
      order.forEach((i, r) => nodes[i].setDepth(100 + r * 4));
      this.sorted = nodes.map((o) => ({ o, box: o.box, b: o.getBounds() }));
    }

    // 사람·동물의 깊이: 화면에서 겹치는 건물 중 뒤에 있는 것보다 앞, 앞에 있는 것보다 뒤
    charDepth(x, y) {
      const c = toCell(x, y);
      let lo = 99, hi = Infinity;
      for (const { o, box, b } of this.sorted || []) {
        if (x < b.left - 8 || x > b.right + 8 || y < b.top || y - 50 > b.bottom) continue;
        if (c.x >= box.x1 - 1e-3 || c.y >= box.y1 - 1e-3) lo = Math.max(lo, o.depth);
        else if (c.x <= box.x0 + 1e-3 || c.y <= box.y0 + 1e-3) hi = Math.min(hi, o.depth);
        else lo = Math.max(lo, o.depth);
      }
      const d = lo + 1 + y * 1e-4;
      return d < hi ? d : hi - 1 + y * 1e-4;
    }

    // 걸을 수 있는 칸: 부지 안(맨 아래 흙길 포함)에서 건물이 없는 칸과 산책장
    buildWalkGrid() {
      const g = new Uint8Array(COLS * ROWS);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const f = SIM.facilityAt(state, x, y);
        g[y * COLS + x] = !f || (f.type === 'yard' && !f.buildLeft) ? 1 : 0;
      }
      this.walkGrid = g;
    }

    // 칸 단위 길찾기(너비 우선, 8방향, 건물 모서리는 비스듬히 못 지나감) → 꺾이는 곳만 남긴 경유점
    route(from, to) {
      const W = this.walkGrid;
      const a = toCell(from.x, from.y), b = toCell(to.x, to.y);
      const cl = (v, m) => Math.max(0, Math.min(m - 1, Math.floor(v)));
      const sx = cl(a.x, COLS), sy = cl(a.y, ROWS), tx = cl(b.x, COLS), ty = cl(b.y, ROWS);
      if (!W || (sx === tx && sy === ty)) return [to];
      const ok = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && (W[y * COLS + x] || (x === tx && y === ty));
      const prev = new Int32Array(COLS * ROWS).fill(-1), start = sy * COLS + sx, goal = ty * COLS + tx;
      prev[start] = start;
      const q = [start];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      while (q.length && prev[goal] < 0) {
        const i = q.shift(), x = i % COLS, y = (i / COLS) | 0;
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy, j = ny * COLS + nx;
          if (!ok(nx, ny) || prev[j] >= 0) continue;
          if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue;
          prev[j] = i; q.push(j);
        }
      }
      if (prev[goal] < 0) return [to];
      const cells = [];
      for (let i = goal; i !== start; i = prev[i]) cells.push(i);
      cells.reverse();
      cells.pop();                                   // 마지막 칸 대신 정확한 목표점으로 간다
      const pts = [];
      let pdx = null, pdy = null, px = sx, py = sy;
      cells.forEach((i, k) => {
        const x = i % COLS, y = (i / COLS) | 0, dx = x - px, dy = y - py;
        const nextI = cells[k + 1];
        const ndx = nextI === undefined ? null : (nextI % COLS) - x, ndy = nextI === undefined ? null : ((nextI / COLS) | 0) - y;
        if (ndx !== dx || ndy !== dy) pts.push(iso(x + 0.35 + Math.random() * 0.3, y + 0.35 + Math.random() * 0.3));   // 꺾이는 칸
        px = x; py = y; pdx = dx; pdy = dy;
      });
      pts.push(to);
      return pts;
    }

    go(spr, to, direct) {
      spr.path = direct ? [to] : this.route({ x: spr.px ?? spr.x, y: spr.py ?? spr.y }, to);
      spr.arrived = false;
    }

    // 경유점을 따라 걷는다. 출발·도착에서 속도를 부드럽게 올리고 줄이며, 걸을 때 살짝 통통 튄다
    walk(spr, base) {
      if (spr.px === undefined) { spr.px = spr.x; spr.py = spr.y; spr.v = 0; spr.phase = 0; }
      const path = spr.path;
      if (!path || !path.length) { spr.moving = false; spr.v = 0; this.place(spr); return true; }
      const t = path[0], dx = t.x - spr.px, dy = t.y - spr.py, dist = Math.hypot(dx, dy);
      const want = path.length === 1 ? base * Math.min(1, 0.3 + dist / 14) : base;
      spr.v += (want - spr.v) * 0.18;
      if (dist <= Math.max(spr.v, 0.5)) { spr.px = t.x; spr.py = t.y; path.shift(); }
      else { spr.px += dx / dist * spr.v; spr.py += dy / dist * spr.v; }
      spr.moving = path.length > 0;
      if (Math.abs(dx) > 1.5) spr.flipped = dx < 0;            // 거의 수직으로 갈 때는 방향을 바꾸지 않는다
      spr.scaleX = (spr.flipped ? -1 : 1) * Math.abs(spr.scaleX);
      spr.phase += spr.v * 0.32;
      this.place(spr);
      return !path.length;
    }

    place(spr) {
      const bob = spr.moving ? Math.abs(Math.sin(spr.phase)) * 2.4 : 0;
      spr.x = spr.px; spr.y = spr.py - bob;
      spr.setDepth(this.charDepth(spr.px, spr.py));
    }

    update(_, dt) {
      if (speed > 0 && !UI.modalOpen) {
        acc += dt * speed;
        while (acc >= D.TIME.dayMs) {
          acc -= D.TIME.dayMs;
          UI.handle(SIM.tick(state));
          UI.askPending();
          this.sync(false);
          if (state.day % D.TIME.daysPerMonth === 0) UI.save(state);
          if (UI.modalOpen) { acc = 0; break; }
        }
      }
      UI.hud();
      // 방문자 머리 위 말: 따라다니고, 방문자가 떠나면 지운다
      for (const v of this.visitors || []) if (v.label) { if (v.active) v.label.setPosition(v.x, v.y - v.displayHeight - 3); else { v.label.destroy(); v.label = null; } }
      if (this.paused) return;

      const k = Math.max(1, speed) * dt / 16;
      // 건물 화면 범위는 세워질 때 커지는 연출이 있어 가끔 다시 잰다
      if (this.sorted && (this.boundsTick = (this.boundsTick || 0) + 1) % 45 === 0) for (const n of this.sorted) if (n.o.active) n.b = n.o.getBounds();
      for (const spr of Object.values(this.animalSpr)) {
        const home = state.facilities[spr.homeId];
        if (!home || !spr.active) continue;
        if (spr.hold && spr.hold > this.time.now) { spr.moving = false; spr.setDepth(this.charDepth(spr.x, spr.py ?? spr.y)); continue; }
        if (!spr.path) this.pickActivity(spr, home);
        const a = spr.animal, bb = a && D.BREEDS[a.breed];
        const pace = a && a.species === 'dog' ? (SIM.dogSize(a) === 'large' ? 1.15 : 0.9) * Math.min(1.3, bb.energy) : 0.7;
        const step = (a && a.fat ? 0.45 : 0.8) * pace * k;
        if (this.walk(spr, step)) {
          if (!spr.arrived) { spr.arrived = true; this.onArrive(spr); }
          else if (Math.random() < 0.012) this.pickActivity(spr, home);
        }
      }
      const facs = Object.values(state.facilities);
      for (const spr of Object.values(this.staffSpr)) {
        if (spr.hugging) continue;
        const done = spr.path && this.walk(spr, 1.1 * k);
        // 돌보러 간 아이 곁에 닿으면 안아 준다(안을 수 없는 큰 개는 하트만)
        if (done && spr.careFor) {
          const a = this.animalSpr[spr.careFor];
          spr.careFor = null;
          if (a && a.active && !this.hug(spr, staffKey(spr.staff, 0).replace(/-0$/, ''), a)) this.floatText(a.x, a.y - 36, '♥', '#e85a7a');
          continue;
        }
        if (!spr.path || (done && Math.random() < 0.01)) {
          const pets = Object.values(this.animalSpr).filter((x) => x.active && x.visible && !(x.hold > this.time.now));
          if (pets.length && Math.random() < 0.35) {
            const a = pets[Math.floor(Math.random() * pets.length)];
            spr.careFor = a.animal.id;
            this.go(spr, { x: (a.px ?? a.x) + 14, y: (a.py ?? a.y) + 4 });
          } else {
            const f = facs[Math.floor(Math.random() * facs.length)];
            const n = f ? SIM.size(f.type) : 1;
            this.go(spr, f ? iso(f.x + n * (0.2 + Math.random() * 0.6), Math.min(f.y + n + 0.3, ROAD + 0.5)) : tileCenter(COLS / 2, ROAD));
          }
        }
      }
    }

    drawGrid() {
      const g = this.gridLines;
      if (!g) return;
      g.clear();
      if (!buildType && !moveId) return;
      for (let y = 0; y < ROAD; y++) for (let x = 0; x < COLS; x++) {
        const yi = buildType && buildType.startsWith('yi:');
        const okCell = moveId ? SIM.canMove(state, moveId, x, y)
          : yi ? (() => { const f = SIM.facilityAt(state, x, y); return f && f.type === 'yard' && !f.buildLeft && !state.yardItems[`${x},${y}`]; })()
            : SIM.canPlace(state, buildType, x, y);
        if (!okCell) continue;
        const p = [iso(x + 0.08, y + 0.08), iso(x + 0.92, y + 0.08), iso(x + 0.92, y + 0.92), iso(x + 0.08, y + 0.92)];
        g.fillStyle(0xffffff, 0.22).fillPoints(p, true);
        g.lineStyle(2, 0xffffff, 0.8).strokePoints(p, true);
      }
    }

    onTap(p) {
      if (UI.modalOpen) return;
      const w = this.cameras.main.getWorldPoint(p.x, p.y);
      const { x, y } = toTile(w.x, w.y);
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
      if (moveId) {
        const r = SIM.moveFacility(state, moveId, x, y);
        UI.toast(r.msg || '옮길 수 없어요');
        if (!r.ok) return;
        UI.handle(r.events);
        setMove(null);
        this.sync(false);
        UI.save(state);
        return;
      }
      if (buildType && buildType.startsWith('yi:')) {
        const r = SIM.placeYardItem(state, buildType.slice(3), x, y);
        UI.toast(r.msg);
        if (!r.ok) return;
        UI.handle(r.events);
        this.sync(false);
        UI.save(state);
        if (state.money < D.YARD_ITEMS[buildType.slice(3)].cost) setBuild(null);
        return;
      }
      if (buildType) {
        if (y >= ROAD) { UI.toast('길에는 지을 수 없어요'); return; }
        const r = SIM.build(state, buildType, x, y);
        if (!r.ok) { UI.toast(r.msg); return; }
        UI.toast(r.msg);
        UI.handle(r.events);
        this.sync(false);
        UI.save(state);
        if (state.money < D.FACILITIES[buildType].cost) setBuild(null);
        return;
      }
      const f = SIM.facilityAt(state, x, y);
      if (f) UI.showFacility(f);
    }
  }

  const scene = () => game && game.scene.getScene('shelter');
  function setBuild(type) {
    buildType = type;
    moveId = null;
    UI.buildHint(type);
    if (scene()) scene().drawGrid();
  }
  function setMove(id) {
    moveId = id;
    buildType = null;
    UI.moveHint(id && state.facilities[id]);
    if (scene()) scene().drawGrid();
  }

  // 캔버스를 기기 픽셀 크기로 만들고 CSS로 줄여 보여 준다 → 고해상도 화면에서도 선명하다
  function stageSize() {
    const el = document.getElementById('game');
    return { w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) };
  }
  function resizeGame() {
    if (!game) return;
    const { w, h } = stageSize();
    game.scale.resize(Math.round(w * DPR), Math.round(h * DPR));
    game.scale.setZoom(1 / DPR);
  }

  function begin(s) {
    state = s;
    UI.setState(state);
    if (!game) {
      const { w, h } = stageSize();
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: 'game', width: Math.round(w * DPR), height: Math.round(h * DPR), pixelArt: true,
        backgroundColor: '#a8dcef',
        scale: { mode: Phaser.Scale.NONE, zoom: 1 / DPR },
        scene: Shelter,
      });
      new ResizeObserver(resizeGame).observe(document.getElementById('game'));
    } else {
      scene().scene.restart();
    }
    UI.save(state);
    UI.askPending();
  }

  function startNew() {
    UI.showStart((career, opts) => {
      begin(SIM.newGame(undefined, career, opts));
      if (!opts.tutorial) UI.event('보호소 운영 안내', '· [건설]에서 견사·묘사를 늘리세요. 붙여 지으면 콤보가 생겨요\n· [물품]에서 사료와 모래를 사 두세요. 떨어지면 아이들이 아파요\n· [사람]에서 봉사자와 직원을 모으세요\n· [경영]에서 입소 기준, 분기 보고서, SNS 유행을 확인하세요\n· 지도는 두 손가락으로 확대하고, 끌어서 옮길 수 있어요');
    });
  }

  UI.init({
    onSpeed(v) { speed = v; UI.setSpeed(v); if (scene() && scene().setPaused) scene().setPaused(v === 0); },
    onSeason(se) { if (scene() && scene().applySeason) scene().applySeason(se); },
    onModal() { UI.setSpeed(speed); },
    onBuildMode: setBuild,
    onMoveMode: setMove,
    onRotate() {
      MIR = !MIR;
      try { localStorage.setItem('animal-story-view', MIR ? 'mirror' : 'normal'); } catch (e) { /* 막힌 창 */ }
      if (scene()) scene().scene.restart();
    },
    onVisit(id, family, again) { if (scene() && scene().visit) scene().visit(id, family, again); },
    onChange() { if (scene()) scene().sync(false); if (state) UI.save(state); },
    onRelayout() { if (scene()) scene().scene.restart(); },
    onNewGame() {
      UI.clearSave();
      UI.closeSheet();
      startNew();
    },
  });
  UI.setSpeed(speed);

  const saved = UI.load();
  if (saved) begin(saved); else startNew();
  window.addEventListener('pagehide', () => { if (state) UI.save(state); });

  // 점검용: 콘솔에서 GAME.advance(30)처럼 며칠을 한 번에 진행한다
  G.GAME = {
    state: () => state,
    phaser: () => game,
    iso: (x, y) => iso(x, y),   // 점검용: 격자 → 월드 좌표
    advance(days) {
      for (let i = 0; i < days; i++) UI.handle(SIM.tick(state));
      UI.askPending();
      if (scene()) scene().sync(false);
      return SIM.dateLabel(state.day);
    },
  };
})(window);
