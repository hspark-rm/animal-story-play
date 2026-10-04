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
  const DPR = Math.min(window.devicePixelRatio || 1, 3);

  // 격자 칸(x, y) 안의 한 점(u, v는 0~1) → 월드 좌표
  const iso = (x, y) => ({ x: OX + x * AX - y * AY, y: TOP + x * AXY + y * AYY });
  const tileCenter = (x, y) => iso(x + 0.5, y + 0.5);
  // 월드 좌표 → 격자 칸 (두 축 일차식의 역변환)
  const toTile = (wx, wy) => {
    const u = wx - OX, v = wy - TOP, det = AX * AYY + AY * AXY;
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
  const facKey = (f) => {
    const t = f.buildLeft ? 'construction' : f.type;
    return SPR.has(`iso-${t}`) ? `iso-${t}` : `tile-${t}`;
  };
  // 크기가 제각각인 그림을 월드 단위 높이(또는 너비)에 맞춘다
  const fitHeight = (spr, h, wide = 1) => { const s = h / spr.height; spr.setScale(s * wide, s); };
  const fitWidth = (spr, w) => spr.setScale(w / spr.width);

  class Shelter extends Phaser.Scene {
    constructor() { super('shelter'); }

    preload() { SPR.preload(this); }

    create() {
      setDims(state);
      SPR.build(this, D);
      this.cameras.main.setBackgroundColor('#a8dcef');
      this.drawGround();
      this.drawDecor();
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
    }

    /* 바닥: 차분한 두 톤 바둑판 잔디와 맨 앞 흙길, 뒤쪽 두 변에 나무 울타리 */
    drawGround() {
      // 부지 바깥 동네 바닥: 연한 잔디, 앞쪽 도로
      const out = this.add.graphics().setDepth(-1);
      for (let y = -MARGIN; y < ROWS + MARGIN; y++) {
        for (let x = -MARGIN; x < COLS + MARGIN; x++) {
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
          g.fillStyle(c, 1).fillPoints(p, true);
          g.lineStyle(1, 0xffffff, 0.18).strokePoints(p, true);
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
      fence(iso(0, ROWS - 1), iso(0, 0), ROWS - 1);
      fence(iso(0, 0), iso(COLS, 0), COLS);
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
      for (const [key, x, y, h] of spots) {
        if (!SPR.has(key)) continue;
        const p = iso(x, y);
        const s = this.add.image(p.x, p.y, key).setOrigin(0.5, 1).setDepth(2 + (x + y));
        fitHeight(s, h);
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
      for (const f of Object.values(state.facilities)) {
        const key = facKey(f);
        const n = SIM.size(f.type);
        const base = iso(f.x + n / 2, f.y + n / 2);
        const front = iso(f.x + n, f.y + n);   // 바닥의 앞 꼭짓점
        let img = this.facLayer[f.id];
        // 옮긴 건물은 새 자리에 다시 세운다
        if (img && (img.gx !== f.x || img.gy !== f.y)) { if (img.label) img.label.destroy(); img.destroy(); img = null; delete this.facLayer[f.id]; }
        if (!img) {
          img = this.add.image(front.x, front.y + 2, key).setOrigin(FRONT, 1).setDepth(100 + front.y);
          img.gx = f.x; img.gy = f.y;
          fitWidth(img, TILE_W * n);
          if (!first) { const s = img.scaleY; this.tweens.add({ targets: img, scaleY: { from: s * 0.4, to: s }, duration: 220, ease: 'Back.Out' }); }
          this.facLayer[f.id] = img;
        } else if (img.texture.key !== key) {
          img.setTexture(key);
          fitWidth(img, TILE_W * n);
          const s = img.scaleY;
          this.tweens.add({ targets: img, scaleY: { from: s * 0.4, to: s }, duration: 260, ease: 'Back.Out' });
          this.floatText(base.x, base.y - 60, '완공!', '#e8743b');
        }
        if (f.buildLeft) {
          if (!img.label) img.label = this.add.text(base.x, base.y - 60 * n, '', { fontFamily: 'Do Hyeon, sans-serif', fontSize: '22px', color: '#3b2a20', stroke: '#ffffff', strokeThickness: 5 }).setOrigin(0.5).setDepth(5000);
          img.label.setText(`공사 ${f.buildLeft}일`);
        } else if (img.label) { img.label.destroy(); img.label = null; }
      }
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
      if (spr.flipped) spr.scaleX = -Math.abs(spr.scaleX);
    }

    // 집 칸 안의 아무 곳(테두리 조금 안쪽)
    spotIn(f) { const n = SIM.size(f.type); return iso(f.x + 0.2 + Math.random() * (n - 0.4), f.y + 0.2 + Math.random() * (n - 0.4)); }

    leave(spr) {
      this.floatText(spr.x, spr.y - 40, '♥', '#e85a7a');
      const exit = tileCenter(COLS + 1, ROAD);
      this.tweens.add({ targets: spr, x: exit.x, y: exit.y, duration: 1600, onComplete: () => spr.destroy() });
    }

    floatText(x, y, text, color) {
      const t = this.add.text(x, y, text, { fontFamily: 'Do Hyeon, sans-serif', fontSize: '26px', color, stroke: '#ffffff', strokeThickness: 6 })
        .setOrigin(0.5).setDepth(6000);
      this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 1400, onComplete: () => t.destroy() });
    }

    flipFrames() {
      for (const spr of Object.values(this.animalSpr)) if (spr.active && spr.animal) this.sizeAnimal(spr);
      for (const spr of Object.values(this.staffSpr)) {
        const k = staffKey(spr.staff, spr.moving ? this.frame : 0);
        if (spr.texture.key !== k) { spr.setTexture(k); fitHeight(spr, 54); if (spr.flipped) spr.scaleX = -Math.abs(spr.scaleX); }
      }
    }

    wander(spr, target, step) {
      const dx = target.x - spr.x, dy = target.y - spr.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) { spr.moving = false; return true; }
      spr.moving = true;
      const k = Math.min(dist, step);
      spr.x += dx / dist * k; spr.y += dy / dist * k;
      spr.flipped = dx < 0;
      spr.scaleX = (spr.flipped ? -1 : 1) * Math.abs(spr.scaleX);
      return false;
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

      const k = Math.max(1, speed) * dt / 16;
      for (const spr of Object.values(this.animalSpr)) {
        const home = state.facilities[spr.homeId];
        if (!home || !spr.active) continue;
        if (!spr.target || Math.random() < 0.004) spr.target = this.spotIn(home);
        const step = (spr.animal && spr.animal.fat ? 0.45 : 0.8) * k;
        if (this.wander(spr, spr.target, step) && Math.random() < 0.02) spr.target = this.spotIn(home);
        spr.setDepth(100 + spr.y + 1);
      }
      const facs = Object.values(state.facilities);
      for (const spr of Object.values(this.staffSpr)) {
        if (!spr.target || (this.wander(spr, spr.target, 1.1 * k) && Math.random() < 0.01)) {
          const f = facs[Math.floor(Math.random() * facs.length)];
          spr.target = f ? iso(f.x + 0.5, Math.min(f.y + 1.2, ROAD + 0.5)) : tileCenter(COLS / 2, ROAD);
        }
        spr.setDepth(100 + spr.y + 2);
      }
    }

    drawGrid() {
      const g = this.gridLines;
      if (!g) return;
      g.clear();
      if (!buildType && !moveId) return;
      for (let y = 0; y < ROAD; y++) for (let x = 0; x < COLS; x++) {
        if (moveId ? !SIM.canMove(state, moveId, x, y) : !SIM.canPlace(state, buildType, x, y)) continue;
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
    onSpeed(v) { speed = v; UI.setSpeed(v); },
    onModal() { UI.setSpeed(speed); },
    onBuildMode: setBuild,
    onMoveMode: setMove,
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
    advance(days) {
      for (let i = 0; i < days; i++) UI.handle(SIM.tick(state));
      UI.askPending();
      if (scene()) scene().sync(false);
      return SIM.dateLabel(state.day);
    },
  };
})(window);
