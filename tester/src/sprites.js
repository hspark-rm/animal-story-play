// 임시 도트 그래픽. 16×16 글자 그림을 팔레트로 칠해 Phaser 텍스처로 만든다.
// 나중에 무료 에셋이나 그림 초안으로 바꿀 때는 같은 텍스처 키로 이미지를 넣으면 된다.
// 텍스처 키 (모두 16×16, 투명 배경):
//   tile-<grass|path|kennel|cattery|clinic|yard|adoption|storage|shop|construction>
//   animal-<jindo|corgi|bichon|poodle|korshort|munchkin>-<0|1>   (0·1 = 걷기 두 프레임)
//   animal-<개 품종>-fat-<0|1>                                    (다이어트가 필요한 체형)
//   staff-<vet|trainer|groomer|carer|manager|social|volunteer>-<0|1>
(function (G) {
  const SPR = {};

  // PNG 에셋: assets/sprites/<키>.png. 목록은 src/sprite_manifest.js(자동 생성)에 있다.
  // PNG가 있으면 그것을 쓰고, 없으면 아래 글자 그림으로 그린다
  const FILES = new Set(G.SPRITE_FILES || []);
  SPR.has = (key) => FILES.has(key);
  // 그림도 버전을 붙여 불러온다(예전 그림이 캐시에 남지 않게)
  SPR.path = (key) => `assets/sprites/${key}.png${G.BUILD && G.BUILD.version ? `?v=${G.BUILD.version}` : ''}`;
  // 시설 아이콘은 아이소메트릭 건물 그림이 있으면 그것을 쓴다
  const SPR_TILE = (key) => (FILES.has(`iso-${key}`) ? `iso-${key}` : `tile-${key}`);
  SPR.preload = (scene) => {
    for (const key of FILES) {
      if (/^(tile|animal|staff|named|iso|deco|bg|player|gt|yard|item|prop|visitor)-/.test(key)) scene.load.image(key, SPR.path(key));
    }
  };

  const DOG = [
    [
      '................',
      '................',
      '................',
      '...........aa...',
      '..........aaaa..',
      '.........aakaa..',
      '.........aaaaak.',
      '..a......aaabb..',
      '..aa....aaab....',
      '...aaaaaaaaa....',
      '...aaaaaaaab....',
      '...abbbbbbbb....',
      '...a.a...a.a....',
      '...k.k...k.k....',
      '................',
      '................',
    ],
    [
      '................',
      '................',
      '................',
      '...........aa...',
      '..........aaaa..',
      '.........aakaa..',
      '.........aaaaak.',
      '.a.......aaabb..',
      '..aa....aaab....',
      '...aaaaaaaaa....',
      '...aaaaaaaab....',
      '...abbbbbbbb....',
      '....a.a.a.a.....',
      '....k.k.k.k.....',
      '................',
      '................',
    ],
  ];

  const DOG_FAT = [
    [
      '................',
      '................',
      '...........aa...',
      '..........aaaa..',
      '.........aakaa..',
      '.........aaaaak.',
      '..a.....aaaabb..',
      '..aa..aaaaaab...',
      '..aaaaaaaaaaaa..',
      '.aaaaaaaaaaaaa..',
      '.aaaaaaaaaaaab..',
      '.abbbbbbbbbbbb..',
      '..abbbbbbbbbb...',
      '...a.a....a.a...',
      '...k.k....k.k...',
      '................',
    ],
    [
      '................',
      '................',
      '...........aa...',
      '..........aaaa..',
      '.........aakaa..',
      '.........aaaaak.',
      '.a......aaaabb..',
      '..aa..aaaaaab...',
      '..aaaaaaaaaaaa..',
      '.aaaaaaaaaaaaa..',
      '.aaaaaaaaaaaab..',
      '.abbbbbbbbbbbb..',
      '..abbbbbbbbbb...',
      '....a.a..a.a....',
      '....k.k..k.k....',
      '................',
    ],
  ];

  const CAT = [
    [
      '................',
      '................',
      '................',
      '..........a.a...',
      '..........aaa...',
      '.........akaka..',
      '.........aaaaa..',
      '.a.......abpba..',
      '.a.......aaaa...',
      '..aaaaaaaaaa....',
      '..aaaaaaaaab....',
      '..abbbbbbbbb....',
      '..a.a....a.a....',
      '..k.k....k.k....',
      '................',
      '................',
    ],
    [
      '................',
      '................',
      '................',
      '..........a.a...',
      '..........aaa...',
      '.........akaka..',
      '.........aaaaa..',
      'a........abpba..',
      '.a.......aaaa...',
      '..aaaaaaaaaa....',
      '..aaaaaaaaab....',
      '..abbbbbbbbb....',
      '...a.a..a.a.....',
      '...k.k..k.k.....',
      '................',
      '................',
    ],
  ];

  const PERSON = [
    [
      '................',
      '......hhhh......',
      '.....hhhhhh.....',
      '.....hssssh.....',
      '.....skssks.....',
      '.....ssssss.....',
      '......ssss......',
      '....cccccccc....',
      '...cccccccccc...',
      '...sccccccccs...',
      '...sccccccccs...',
      '....cccccccc....',
      '....pppppppp....',
      '....ppp..ppp....',
      '....ppp..ppp....',
      '....kkk..kkk....',
    ],
    [
      '................',
      '......hhhh......',
      '.....hhhhhh.....',
      '.....hssssh.....',
      '.....skssks.....',
      '.....ssssss.....',
      '......ssss......',
      '....cccccccc....',
      '...cccccccccc...',
      '...sccccccccs...',
      '...sccccccccs...',
      '....cccccccc....',
      '....pppppppp....',
      '....ppp..ppp....',
      '....kkk..ppp....',
      '.........kkk....',
    ],
  ];

  const TILES = {
    grass: {
      pal: { g: '#8fcf6a', d: '#78b957', l: '#a6dc84' },
      art: [
        'gggggggggggggggg', 'ggggggdggggggggg', 'gggggggggggglggg', 'gggggggggggggggg',
        'ggdggggggggggggg', 'gggggggggggggggg', 'gggggggglgggggdg', 'gggggggggggggggg',
        'gggggggggggggggg', 'gglggggggggggggg', 'ggggggggggdggggg', 'gggggggggggggggg',
        'gggggdgggggggggg', 'ggggggggggggglgg', 'gggggggggggggggg', 'gggggggggggggggg',
      ],
    },
    path: {
      pal: { s: '#e2c68f', d: '#cdb07a', l: '#efd9a8' },
      art: [
        'ssssssssssssssss', 'ssssdsssssssssss', 'sssssssssslsssss', 'ssssssssssssssss',
        'sslsssssssssdsss', 'ssssssssssssssss', 'sssssssdssssssss', 'ssssssssssssssss',
        'ssssssssssslssss', 'ssdsssssssssssss', 'ssssssssssssssss', 'ssssssldssssssss',
        'ssssssssssssssss', 'ssssssssssssdsss', 'sslsssssssssssss', 'ssssssssssssssss',
      ],
    },
    kennel: {
      pal: { r: '#c0503a', R: '#8f3426', w: '#d9a86a', W: '#b98648', k: '#3a2418', g: '#8fcf6a' },
      art: [
        'gggggggggggggggg', 'gggggggrrggggggg', 'ggggggrrrrgggggg', 'gggggrrrrrrggggg',
        'ggggrrrrrrrrgggg', 'gggrrrrrrrrrrggg', 'ggRRRRRRRRRRRRgg', 'gggwwwwwwwwwwggg',
        'gggwwwwwwwwwwggg', 'gggwwwwkkwwwwggg', 'gggwwwkkkkwwwggg', 'gggwwwkkkkwwwggg',
        'gggWWWkkkkWWWggg', 'gggWWWkkkkWWWggg', 'gggggggggggggggg', 'gggggggggggggggg',
      ],
    },
    cattery: {
      pal: { r: '#8a6cc2', R: '#64489a', w: '#f2e2c4', W: '#d8c29a', k: '#3a2a48', b: '#9fd3f0', g: '#8fcf6a' },
      art: [
        'gggggggggggggggg', 'ggggrggggggrgggg', 'ggggrrggggrrgggg', 'ggggrrrrrrrrgggg',
        'gggrrrrrrrrrrggg', 'ggrrrrrrrrrrrrgg', 'ggRRRRRRRRRRRRgg', 'gggwwwwwwwwwwggg',
        'gggwbbwwwwbbwggg', 'gggwbbwwwwbbwggg', 'gggwwwwkkwwwwggg', 'gggwwwwkkwwwwggg',
        'gggWWWWkkWWWWggg', 'gggWWWWkkWWWWggg', 'gggggggggggggggg', 'gggggggggggggggg',
      ],
    },
    clinic: {
      pal: { r: '#4f8fd0', R: '#356ea8', w: '#ffffff', W: '#d9e2ea', c: '#3fae6a', k: '#2a3a4a', b: '#9fd3f0', g: '#8fcf6a' },
      art: [
        'gggggggggggggggg', 'ggrrrrrrrrrrrrgg', 'ggRRRRRRRRRRRRgg', 'ggwwwwwwwwwwwwgg',
        'ggwwwwwccwwwwwgg', 'ggwwwwcccccwwwgg', 'ggwwwwwccwwwwwgg', 'ggwwwwwwwwwwwwgg',
        'ggwbbwwwwwwbbwgg', 'ggwbbwwwwwwbbwgg', 'ggwwwwwkkwwwwwgg', 'ggwwwwwkkwwwwwgg',
        'ggWWWWWkkWWWWWgg', 'ggWWWWWkkWWWWWgg', 'gggggggggggggggg', 'gggggggggggggggg',
      ],
    },
    yard: {
      pal: { f: '#f2e2c4', F: '#b98648', g: '#a6dc84', d: '#8fcf6a', y: '#f2c94c', o: '#e08a3c' },
      art: [
        'FfFfFfFfFfFfFfFf', 'Fggggggggggggggf', 'Fgdggggggggggdgf', 'Fggggggggggggggf',
        'Fgggggggggyygggf', 'Fggggggggyyyyggf', 'Fggggggggyoyyggf', 'Fgggggggggyygggf',
        'Fggdgggggggggggf', 'Fggggggggggggggf', 'Fggggggggggdgggf', 'Fggggggggggggggf',
        'Fgggdggggggggggf', 'Fggggggggggggggf', 'Fggggggggggggggf', 'FfFfFfFfFfFfFfFf',
      ],
    },
    adoption: {
      pal: { r: '#e8743b', R: '#c05a28', w: '#fff4e4', W: '#e8d4b8', h: '#e85a7a', k: '#4a2a1a', b: '#9fd3f0', g: '#8fcf6a' },
      art: [
        'gggggggggggggggg', 'ggggggrrrrgggggg', 'ggggrrrrrrrrgggg', 'ggrrrrrrrrrrrrgg',
        'gRRRRRRRRRRRRRRg', 'ggwwwwwwwwwwwwgg', 'ggwwwhhwwhhwwwgg', 'ggwwhhhhhhhhwwgg',
        'ggwwwhhhhhhwwwgg', 'ggwwwwhhhhwwwwgg', 'ggwbbwwhhwwkkwgg', 'ggwbbwwwwwwkkwgg',
        'ggWWWWWWWWWkkWgg', 'ggWWWWWWWWWkkWgg', 'gggggggggggggggg', 'gggggggggggggggg',
      ],
    },
    shop: {
      pal: { r: '#3fae6a', R: '#2a8a52', w: '#fff8e7', W: '#e8d4b8', y: '#f2c94c', k: '#3a2a1a', b: '#9fd3f0', p: '#e85a7a', g: '#8fcf6a' },
      art: [
        'gggggggggggggggg', 'gggggggggggggggg', 'ggrwrwrwrwrwrwgg', 'ggRwRwRwRwRwRwgg',
        'ggwwwwwwwwwwwwgg', 'ggwyyyyyyyyyywgg', 'ggwykykpkpykywgg', 'ggwyyyyyyyyyywgg',
        'ggwbbbwwwwbbbwgg', 'ggwbpbwkkwbybwgg', 'ggwbbbwkkwbbbwgg', 'ggwwwwwkkwwwwwgg',
        'ggWWWWWkkWWWWWgg', 'ggWWWWWkkWWWWWgg', 'gggggggggggggggg', 'gggggggggggggggg',
      ],
    },
    construction: {
      pal: { g: '#8fcf6a', d: '#b98648', D: '#8a5a2a', y: '#f2c94c', k: '#3a2418', o: '#e08a3c', w: '#fff4e4' },
      art: [
        'gggggggggggggggg', 'ggdggggggggggdgg', 'ggdDDDDDDDDDDdgg', 'ggdggggggggggdgg',
        'ggdgggwwwwgggdgg', 'ggdDDDDDDDDDDdgg', 'ggdggggggggggdgg', 'ggdggykykykggdgg',
        'ggdggggggggggdgg', 'ggdDDDDDDDDDDdgg', 'ggdggggggggggdgg', 'gogdggggggggdgog',
        'ooogggggggggoooo', 'ooooggggggggoooo', 'gggggggggggggggg', 'gggggggggggggggg',
      ],
    },
    storage: {
      pal: { c: '#c99a5a', C: '#9a6e38', k: '#6a4a24', s: '#f2e2c4', g: '#8fcf6a' },
      art: [
        'gggggggggggggggg', 'gggggggggggggggg', 'ggggcccccccggggg', 'ggggckkkkkcggggg',
        'ggggcssssscggggg', 'ggggcssssscggggg', 'ggggCCCCCCCggggg', 'ggcccccccccccggg',
        'ggckkkkckkkkcggg', 'ggcsssscsssscggg', 'ggcsssscsssscggg', 'ggcsssscsssscggg',
        'ggCCCCCCCCCCCggg', 'gggggggggggggggg', 'gggggggggggggggg', 'gggggggggggggggg',
      ],
    },
  };

  const ROLE_COLORS = {
    vet:       { c: '#ffffff', h: '#3a2a20', p: '#4f6f9a' },
    trainer:   { c: '#4fae6a', h: '#6a3a1a', p: '#5a4a3a' },
    groomer:   { c: '#f29ac0', h: '#8a4a2a', p: '#4a4a5a' },
    carer:     { c: '#f0a040', h: '#2a1a12', p: '#5a4a3a' },
    manager:   { c: '#3a4a7a', h: '#1a1a1a', p: '#2a2a3a' },
    social:    { c: '#9a6ad0', h: '#d0a060', p: '#3a3a4a' },
    volunteer: { c: '#f2c94c', h: '#2a1a12', p: '#4a5a7a' },
  };

  function paint(scene, key, art, pal) {
    if (scene.textures.exists(key)) return;
    const h = art.length, w = 16;
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    art.forEach((row, y) => {
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (!ch || ch === '.' || !pal[ch]) continue;
        ctx.fillStyle = pal[ch];
        ctx.fillRect(x, y, 1, 1);
      }
    });
    tex.refresh();
  }

  SPR.build = (scene, D) => {
    for (const [k, t] of Object.entries(TILES)) paint(scene, `tile-${k}`, t.art.map((r) => r.slice(0, 16)), t.pal);
    for (const [k, b] of Object.entries(D.BREEDS)) {
      const pal = { a: b.colors[0], b: b.colors[1], k: b.colors[2], p: '#f29aa8' };
      const frames = b.species === 'dog' ? DOG : CAT;
      frames.forEach((art, i) => paint(scene, `animal-${k}-${i}`, art, pal));
      if (b.species === 'dog') DOG_FAT.forEach((art, i) => paint(scene, `animal-${k}-fat-${i}`, art, pal));
    }
    for (const [role, c] of Object.entries(ROLE_COLORS)) {
      const pal = { h: c.h, s: '#f5cfa8', k: '#2a1a12', c: c.c, p: c.p };
      PERSON.forEach((art, i) => paint(scene, `staff-${role}-${i}`, art, pal));
    }
  };

  // DOM 목록에 쓸 작은 그림 (data URL)
  SPR.iconURL = (() => {
    const cache = {};
    const pngKey = (kind, key) => ({
      tile: SPR_TILE(key), ui: `ui-${key}`, animal: `animal-${key}-0`, 'animal-fat': `animal-${key}-fat-0`, staff: `staff-${key}-0`,
      named: `named-${key}-0`, item: `item-${key}`, icon: `icon-${key}`, event: `event-${key}`, intro: `intro-${key}`, logo: 'logo',
    }[kind]);
    return (kind, key, D) => {
      const id = `${kind}-${key}`;
      if (cache[id]) return cache[id];
      const pk = pngKey(kind, key);
      if (pk && FILES.has(pk)) return (cache[id] = SPR.path(pk));
      // 살찐 체형 그림이 없는 품종은 보통 그림을 쓴다(16칸 임시 그림으로 떨어지면 깨져 보인다)
      if (kind === 'animal-fat' && FILES.has(`animal-${key}-0`)) return (cache[id] = SPR.path(`animal-${key}-0`));
      if (!['animal', 'animal-fat', 'staff', 'tile'].includes(kind) || (kind === 'tile' && !TILES[key])) return null;
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const ctx = c.getContext('2d');
      let art, pal;
      if (kind === 'animal' || kind === 'animal-fat') {
        const b = D.BREEDS[key];
        art = (b.species === 'dog' ? (kind === 'animal-fat' ? DOG_FAT : DOG) : CAT)[0];
        pal = { a: b.colors[0], b: b.colors[1], k: b.colors[2], p: '#f29aa8' };
      } else if (kind === 'staff') {
        const r = ROLE_COLORS[key];
        art = PERSON[0];
        pal = { h: r.h, s: '#f5cfa8', k: '#2a1a12', c: r.c, p: r.p };
      } else {
        art = TILES[key].art.map((r) => r.slice(0, 16));
        pal = TILES[key].pal;
      }
      art.forEach((row, y) => {
        for (let x = 0; x < 16; x++) {
          const ch = row[x];
          if (!ch || ch === '.' || !pal[ch]) continue;
          ctx.fillStyle = pal[ch];
          ctx.fillRect(x, y, 1, 1);
        }
      });
      return (cache[id] = c.toDataURL());
    };
  })();

  G.SPR = SPR;
})(window);
