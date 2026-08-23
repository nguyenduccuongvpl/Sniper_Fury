/* ===== Sniper Fury — Engine game chính (v2) =====
   Cơ chế: giữ chuột trái để ngắm ống ngắm, click chuột trái lần nữa để bắn,
   chuột phải thu hồi ống ngắm. Đạn có hiệu ứng đường đạn bay, súng giảm thanh.
*/
(function () {
  'use strict';

  const C = window.CONFIG;
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* RNG có hạt giống */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Bảng màu theo chủ đề màn chơi */
  const THEMES = {
    day: {
      skyTop: '#4a7fb5', skyMid: '#9cc3dd', skyBot: '#e8d8ae',
      sun: '#fff3c4', sunGlow: 'rgba(255,240,180,0.35)',
      buildingPal: ['#5a5348', '#4e4a42', '#66584a', '#57604f', '#6a5a52'],
      farColor: '#8fa3ad', fog: 'rgba(220,225,215,0.25)',
      dark: 0, litWin: 0.25
    },
    dusk: {
      skyTop: '#2b2d52', skyMid: '#a05c48', skyBot: '#e8a95c',
      sun: '#ffd080', sunGlow: 'rgba(255,160,90,0.4)',
      buildingPal: ['#463f45', '#3d3841', '#50453c', '#44403a', '#4a3e42'],
      farColor: '#5d5568', fog: 'rgba(230,150,100,0.18)',
      dark: 0.15, litWin: 0.5
    },
    night: {
      skyTop: '#070d20', skyMid: '#131c36', skyBot: '#242c48',
      sun: '#e8ecf5', sunGlow: 'rgba(200,215,255,0.25)',
      buildingPal: ['#23262e', '#1e2128', '#282b33', '#20242c', '#262930'],
      farColor: '#161b2a', fog: 'rgba(60,80,120,0.22)',
      dark: 0.42, litWin: 0.75
    },
    storm: {
      skyTop: '#333c46', skyMid: '#4d5862', skyBot: '#6a747c',
      sun: '#aab4bc', sunGlow: 'rgba(170,180,190,0.15)',
      buildingPal: ['#3c4148', '#343940', '#444a52', '#383e45', '#40464d'],
      farColor: '#4a545e', fog: 'rgba(140,150,160,0.3)',
      dark: 0.25, litWin: 0.4,
      rain: true
    }
  };

  class SniperGame {
    constructor(canvas, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.hooks = hooks || {};
      this.audio = new window.SoundKit();

      this.state = 'idle';       // idle | playing | paused | ended
      this.scoped = false;       // đang nhìn qua ống ngắm?
      this.weapon = window.WEAPONS.barrett;
      this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

      this.mouse = { x: innerWidth / 2, y: innerHeight / 2 };
      this.keys = {};

      this.viewW = 0; this.viewH = 0;
      this.camX = 0; this.camY = 0;
      this.aim = { x: 0, y: 0 };
      this.px = 0; this.py = 0;   // điểm thế giới NGAY DƯỚI con trỏ/ngón tay

      this.swayT = 0;
      this.shake = 0;
      this.flash = 0;
      this.recoil = 0;           // độ giật súng (0..1)
      this.hitMarker = 0;

      this.bullets = [];
      this.particles = [];
      this.casings = [];
      this.floatTexts = [];
      this.windStreaks = [];
      this.rainDrops = [];

      addEventListener('resize', () => this.resize());
      this.resize();
      this.bindInput();
      requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
      this.viewW = this.canvas.width = innerWidth;
      this.viewH = this.canvas.height = innerHeight;
    }

    setWeapon(id) { this.weapon = window.WEAPONS[id] || this.weapon; }

    /* ---------- Input ---------- */
    bindInput() {
      addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
      addEventListener('mousedown', (e) => {
        if (e.target !== this.canvas) return;   // bỏ qua click vào nút UI
        if (this.state !== 'playing') return;
        if (e.button === 0) {
          if (!this.scoped) this.scoped = true;   // giữ/chuột trái: vào ống ngắm
          else this.fire();                        // lần nữa: bắn
        } else if (e.button === 2) {
          if (this.scoped) this.scoped = false;    // chuột phải: thu hồi ống ngắm
        }
      });
      addEventListener('keydown', (e) => {
        this.keys[e.code] = true;
        if (this.state === 'playing') {
          if (e.code === 'KeyR') this.startReload();
          if (e.code === 'Escape' || e.code === 'KeyP') this.pause();
        } else if (this.state === 'paused') {
          if (e.code === 'Escape' || e.code === 'KeyP') this.resume();
        }
      });
      addEventListener('keyup', (e) => { this.keys[e.code] = false; });
      addEventListener('contextmenu', (e) => e.preventDefault());

      // ===== Điều khiển cảm ứng (mobile) =====
      const cv = this.canvas;
      cv.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        this.mouse.x = t.clientX; this.mouse.y = t.clientY;
        this.audio.init(); this.audio.resume();
      }, { passive: false });
      cv.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        this.mouse.x = t.clientX; this.mouse.y = t.clientY;
      }, { passive: false });
    }

    /* ---------- Vào màn ---------- */
    startLevel(levelIndex) {
      this.levelIndex = levelIndex;
      this.level = window.LEVELS[levelIndex];
      const L = this.level;
      this.theme = THEMES[L.theme];

      this.timeLeft = L.time;
      this.score = 0;
      this.shotsFired = 0;
      this.shotsHit = 0;
      this.kills = 0;
      this.totalEnemies = L.enemies;

      this.mag = this.weapon.mag;
      this.reserve = L.enemies + 8;
      this.reloading = false;
      this.reloadT = 0;

      this.breath = C.BREATH_MAX;
      this.elapsed = 0;
      this.scoped = false;

      this.buildScene(L);
      this.spawnActors(L);

      this.bullets.length = 0;
      this.particles.length = 0;
      this.casings.length = 0;
      this.floatTexts.length = 0;

      // Hạt hiệu ứng thời tiết/gió
      this.windStreaks = [];
      for (let i = 0; i < 34; i++) {
        this.windStreaks.push({
          x: Math.random() * C.WORLD_W,
          y: 100 + Math.random() * (C.GROUND_Y - 200),
          len: 30 + Math.random() * 70,
          spd: 40 + Math.random() * 60
        });
      }
      this.rainDrops = [];
      if (this.theme.rain) {
        for (let i = 0; i < 130; i++) {
          this.rainDrops.push({
            x: Math.random() * C.WORLD_W,
            y: Math.random() * C.GROUND_Y,
            len: 14 + Math.random() * 22,
            spd: 700 + Math.random() * 500
          });
        }
      }

      this.state = 'playing';
      this.showMsg('MÀN ' + (levelIndex + 1) + ': ' + L.name.toUpperCase(), 2000);
    }

    /* ---------- Xây dựng bối cảnh ---------- */
    buildScene(L) {
      const rng = mulberry32(L.seed);
      this.rng = rng;
      const th = this.theme;

      // Nhà chính (lớp gameplay)
      this.buildings = [];
      let x = 40;
      while (x < C.WORLD_W - 200) {
        const w = 240 + rng() * 300;
        const h = 260 + rng() * 480;
        const color = th.buildingPal[Math.floor(rng() * th.buildingPal.length)];
        const b = { x, y: C.GROUND_Y - h, w, h, color, windows: [], props: [] };

        const cols = Math.max(1, Math.floor(w / 78));
        const rows = Math.max(1, Math.floor(h / 96));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (rng() > 0.22) {
              b.windows.push({
                x: x + 24 + c * 78,
                y: b.y + 30 + r * 96,
                lit: rng() < th.litWin
              });
            }
          }
        }
        // Đồ trên nóc nhà
        if (rng() > 0.4) b.props.push({ type: 'tank', dx: 30 + rng() * (w - 110) });
        if (rng() > 0.5) b.props.push({ type: 'antenna', dx: 20 + rng() * (w - 40), h: 40 + rng() * 60 });
        if (rng() > 0.45) b.props.push({ type: 'ac', dx: 20 + rng() * (w - 70) });

        this.buildings.push(b);
        x += w + 60 + rng() * 160;
      }

      // Skyline xa (parallax)
      this.skyline = [];
      let sx = -200;
      while (sx < C.WORLD_W * 1.4) {
        const sw = 180 + rng() * 320;
        const sh = 180 + rng() * 420;
        this.skyline.push({ x: sx, w: sw, h: sh, ant: rng() > 0.7 });
        sx += sw * (0.75 + rng() * 0.4);
      }

      // Núi rất xa
      this.mountains = [];
      let mx = -300;
      while (mx < C.WORLD_W * 1.5) {
        const mw = 600 + rng() * 700;
        const mh = 260 + rng() * 340;
        this.mountains.push({ x: mx, w: mw, h: mh });
        mx += mw * 0.72;
      }

      // Mây
      this.clouds = [];
      for (let i = 0; i < 10; i++) {
        this.clouds.push({
          x: rng() * C.WORLD_W, y: 70 + rng() * 280,
          s: 0.7 + rng() * 1.5, spd: 4 + rng() * 8
        });
      }

      // Sao (đêm)
      this.stars = [];
      if (L.theme === 'night') {
        for (let i = 0; i < 90; i++) {
          this.stars.push({ x: rng() * C.WORLD_W, y: rng() * 520, tw: rng() * TAU });
        }
      }

      // Chim
      this.birds = [];
      for (let i = 0; i < 5; i++) {
        this.birds.push({
          x: rng() * C.WORLD_W, y: 160 + rng() * 260,
          dir: rng() > 0.5 ? 1 : -1, spd: 20 + rng() * 25, phase: rng() * TAU
        });
      }

      // Công sự bao cát (địch nấp)
      this.covers = [];
      for (let i = 0; i < 12; i++) {
        this.covers.push({
          x: 160 + rng() * (C.WORLD_W - 320),
          y: C.GROUND_Y,
          w: 90 + rng() * 60,
          h: 52 + rng() * 26
        });
      }

      // Đèn đường & cây trên vỉa hè
      this.lamps = [];
      this.trees = [];
      for (let lx = 220; lx < C.WORLD_W; lx += 380 + rng() * 160) {
        this.lamps.push({ x: lx });
      }
      for (let tx = 400; tx < C.WORLD_W; tx += 520 + rng() * 300) {
        this.trees.push({ x: tx, s: 0.8 + rng() * 0.6 });
      }

      // Thùng phuy & thùng hàng ven đường
      this.props = [];
      for (let i = 0; i < 16; i++) {
        this.props.push({
          x: 120 + rng() * (C.WORLD_W - 240),
          type: rng() > 0.5 ? 'barrel' : 'crate',
          s: 0.85 + rng() * 0.4
        });
      }
    }

    /* ---------- Sinh nhân vật ---------- */
    spawnActors(L) {
      const rng = mulberry32(L.seed * 7 + 13);
      this.actors = [];

      const spots = [];
      for (const b of this.buildings) {
        spots.push({ type: 'roof', x: b.x + 50 + rng() * (b.w - 100), y: b.y, b });
        if (rng() > 0.45) spots.push({ type: 'window', x: b.x + b.w / 2, y: b.y + 66 + rng() * (b.h - 140) });
      }
      for (let i = 0; i < 20; i++) {
        spots.push({ type: 'ground', x: 150 + rng() * (C.WORLD_W - 300), y: C.GROUND_Y });
      }
      for (let i = spots.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }

      const totalActors = L.enemies + L.hostages;
      const civIdx = new Set();
      while (civIdx.size < L.hostages) civIdx.add(Math.floor(rng() * totalActors));
      const walkerSet = new Set([...civIdx].slice(0, L.walkers));
      // Sĩ quan ở các vị trí cuối danh sách địch (xuất hiện sau)
      let officersLeft = L.officers;

      let idCounter = 0;
      for (let i = 0; i < totalActors; i++) {
        const spot = spots[i % spots.length];
        const isCiv = civIdx.has(i);
        const isWalker = walkerSet.has(i);
        const a = {
          id: idCounter++,
          kind: isCiv ? 'civilian' : 'enemy',
          spawned: false, alive: true,
          spawnAt: 1.2 + i * L.spawnEvery + rng() * 0.7,
          fade: 0,
          x: clamp(spot.x, 90, C.WORLD_W - 90),
          y: spot.type === 'window' ? spot.y + 48 : spot.y,
          dir: rng() > 0.5 ? 1 : -1,
          phase: rng() * TAU,
          shirt: ['#f5f5f5', '#cfd8dc', '#ffe0b2', '#b2dfdb'][Math.floor(rng() * 4)],
          pants: ['#37474f', '#4e342e', '#455a64'][Math.floor(rng() * 3)],
          skin: ['#e8c49a', '#c68d5e', '#8d5a3a'][Math.floor(rng() * 3)],
          peek: null, officer: false, runner: false
        };

        if (!isCiv) {
          // Phân loại địch
          if (officersLeft > 0 && rng() < 0.3) { a.officer = true; officersLeft--; }
          else if (rng() < L.runnerCh) a.runner = true;

          if (rng() < L.peekCh && spot.type !== 'window') {
            const cover = this.covers[Math.floor(rng() * this.covers.length)];
            a.peek = { timer: rng() * 2, up: false };
            a.x = cover.x + cover.w / 2;
            a.y = C.GROUND_Y;
          } else if (spot.type !== 'window' && L.speed > 0) {
            const range = a.runner ? 260 + rng() * 220 : 110 + rng() * 130;
            if (spot.type === 'roof') {
              // Tuần tra CHỈ trong phạm vi nóc nhà — không đi lơ lửng ngoài không khí
              const lo = spot.b.x + 25, hi = spot.b.x + spot.b.w - 25;
              a.onRoof = true;
              a.roofLo = lo; a.roofHi = hi;
              a.minX = clamp(a.x - range, lo, hi);
              a.maxX = clamp(a.x + range, lo, hi);
              if (a.maxX - a.minX < 50) { a.minX = a.maxX = a.x; }
            } else {
              a.minX = clamp(a.x - range, 70, C.WORLD_W - 70);
              a.maxX = clamp(a.x + range, 70, C.WORLD_W - 70);
            }
          } else {
            a.minX = a.maxX = a.x;
          }
        } else if (isWalker) {
          a.minX = clamp(a.x - 160 - rng() * 120, 80, C.WORLD_W - 80);
          a.maxX = clamp(a.x + 160 + rng() * 120, 80, C.WORLD_W - 80);
        } else {
          a.minX = a.maxX = a.x;
        }

        this.actors.push(a);
      }

      // Ghép cặp đồng đội: đi cùng nhau, 1 người bị hạ thì người kia cảnh giác
      const movers = this.actors.filter(a => a.kind === 'enemy' && !a.peek && a.maxX > a.minX);
      for (let i = 0; i + 1 < movers.length; i += 2) {
        movers[i].buddyId = movers[i + 1].id;
        movers[i + 1].buddyId = movers[i].id;
      }
    }

    /* ---------- Ngắm & camera ---------- */
    aimPoint() {
      // Ánh xạ tuyệt đối vị trí chuột -> toạ độ thế giới
      this.aim.x = (this.mouse.x / this.viewW) * C.WORLD_W;
      this.aim.y = (this.mouse.y / this.viewH) * C.WORLD_H;
      return this.aim;
    }

    currentSway(holdBreath) {
      const amp = C.SWAY_AMP * this.weapon.sway * (holdBreath ? 0.12 : 1);
      return {
        x: Math.sin(this.swayT * 1.7) * amp + Math.sin(this.swayT * 0.6) * amp * 0.4,
        y: Math.cos(this.swayT * 1.3) * amp * 0.7
      };
    }

    holdingBreath() {
      return (this.keys['Space'] || this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.breath > 0;
    }

    /* ---------- Cảnh giác (đồng đội bị hạ / đạn sượt qua) ---------- */
    alertActor(a) {
      if (a.kind !== 'enemy' || !a.alive || a.alert || a.peek) return;
      a.alert = true;
      a.alertTimer = 16 + Math.random() * 8;
      a.alertMark = 1.8;
      if (a.staticY || a.onRoof) {
        // Nấp ngay tại chỗ (trong cửa sổ / trên nóc) rồi thò đầu quan sát
        a.state = 'hide';
        a.hideUp = false;
        a.hideTimer = 0.6 + Math.random();
      } else {
        // Chạy nhanh tới công sự bao cát gần nhất
        let best = null, bd = Infinity;
        for (const cv of this.covers) {
          const d = Math.abs(cv.x + cv.w / 2 - a.x);
          if (d < bd) { bd = d; best = cv; }
        }
        a.hideTarget = best ? best.x + best.w / 2 : a.x;
        a.state = 'seek';
      }
    }

    /* ---------- Bắn ---------- */
    fire() {
      if (this.reloading) return;
      if (this.mag <= 0) { this.audio.empty(); this.showMsg('HẾT ĐẠN — NHẤN R!', 900); return; }

      this.mag--;
      this.shotsFired++;
      this.audio.shot(true);          // giảm thanh
      this.recoil = 1;
      this.shake = this.weapon.id === 'barrett' ? 10 : 6;
      this.flash = 0.06;

      const sway = this.currentSway(this.holdingBreath());
      const windOff = this.level.wind * C.WIND_OFFSET * this.weapon.windMul;
      // Điểm bắn = đúng điểm thế giới dưới con trỏ/ngón tay
      const ax = this.px;
      const ay = this.py;
      let ix = ax + sway.x + windOff;
      let iy = ay + sway.y;

      // Trợ lực khóa mục tiêu trên mobile: hút đạn vào địch gần điểm ngắm
      if (this.isTouch) {
        const assist = this.findAssistTarget(ix, iy);
        if (assist) { ix = assist.x; iy = assist.y; }
      }

      // Xác định kết quả trúng ngay khi bắn, đạn bay tới mới hiện
      let result = null;
      for (const a of this.actors) {
        if (!a.alive || !a.spawned) continue;
        if (a.peek && !a.peek.up) continue;
        if (a.state === 'hide' && !a.hideUp) continue;
        const headCY = a.y - (a.kind === 'civilian' ? 86 : 84);
        const dxh = ix - a.x, dyh = iy - headCY;
        if (dxh * dxh + dyh * dyh <= C.HEAD_R * C.HEAD_R) { result = { targetId: a.id, head: true }; break; }
        if (Math.abs(ix - a.x) <= C.BODY_W / 2 && iy >= a.y - C.BODY_H && iy <= a.y) { result = { targetId: a.id, head: false }; break; }
      }

      // Đạn sượt qua gần -> lính trở nên cực kỳ cảnh giác, tìm chỗ trốn
      for (const a of this.actors) {
        if (a.kind !== 'enemy' || !a.alive || !a.spawned) continue;
        if (result && result.targetId === a.id) continue;
        const dx = ix - a.x, dy = iy - (a.y - 45);
        if (dx * dx + dy * dy < 140 * 140) this.alertActor(a);
      }

      // Đường đạn bay từ nòng súng đến điểm chạm
      const dist = Math.hypot(ix - ax, iy - ay + 300);
      this.bullets.push({
        x1: ax + 46, y1: ay + 300,
        x2: ix, y2: iy,
        t: 0, dur: Math.max(0.07, dist / C.BULLET_SPEED),
        result
      });

      // Vỏ đạn văng ra
      this.casings.push({
        x: ax + 30, y: ay + 250,
        vx: 120 + Math.random() * 160, vy: -260 - Math.random() * 120,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, t: 0
      });

      if (this.mag <= 0 && this.reserve > 0) this.startReload();
    }

    /* Đạn chạm đích — xử lý sát thương */
    resolveImpact(b) {
      const ix = b.x2, iy = b.y2;
      if (!b.result) {
        this.audio.dust();
        this.addParticles(clamp(ix, 0, C.WORLD_W), clamp(iy, 0, C.GROUND_Y), '#9e9e9e', 8);
        this.checkAmmoFail();
        return;
      }
      const target = this.actors.find(a => a.id === b.result.targetId);
      if (!target || !target.alive) { this.checkAmmoFail(); return; }

      this.shotsHit++;
      this.hitMarker = 0.3;

      if (target.kind === 'civilian') {
        target.alive = false;
        this.score += C.HOSTAGE_PENALTY;
        this.audio.hitHostage();
        this.addParticles(ix, iy, '#ffffff', 18);
        this.addFloatText(target.x, target.y - 120, 'DÂN THƯỜNG! ' + C.HOSTAGE_PENALTY, '#ff5252');
        this.endLevel(false, 'Bạn đã bắn nhầm dân thường!');
        return;
      }

      target.alive = false;
      this.kills++;
      // Đồng đội bị hạ -> người còn lại lập tức cảnh giác
      if (target.buddyId != null) {
        const buddy = this.actors.find(x => x.id === target.buddyId);
        if (buddy && buddy.alive) this.alertActor(buddy);
      }
      let pts;
      if (target.officer) pts = b.result.head ? C.OFFICER_HEAD : C.OFFICER_BODY;
      else pts = b.result.head ? C.SCORE_HEAD : C.SCORE_BODY;
      this.score += pts;

      if (b.result.head) {
        this.audio.hitHead();
        this.addFloatText(target.x, target.y - 120,
          (target.officer ? 'SĨ QUAN HEADSHOT! +' : 'HEADSHOT! +') + pts, '#ffd54f');
      } else {
        this.audio.hitBody();
        this.addFloatText(target.x, target.y - 120, '+' + pts, '#ffffff');
      }
      this.addParticles(ix, iy, '#c62828', 14);
      this.checkAmmoFail();
    }

    checkAmmoFail() {
      const remaining = this.actors.filter(a => a.kind === 'enemy' && a.alive).length;
      if (remaining > 0 && this.mag <= 0 && this.reserve <= 0) {
        this.endLevel(false, 'Hết đạn trước khi hoàn thành nhiệm vụ!');
      }
    }

    startReload() {
      if (this.reloading || this.mag >= this.weapon.mag || this.reserve <= 0) return;
      this.reloading = true;
      this.reloadT = 0;
      this.audio.reload();
    }

    /* ---------- Kết thúc màn ---------- */
    endLevel(win, reason) {
      if (this.state === 'ended') return;
      this.state = 'ended';
      const timeFrac = this.timeLeft / this.level.time;
      let stars = 0;
      if (win) {
        stars = timeFrac >= C.STAR3_TIME ? 3 : timeFrac >= C.STAR2_TIME ? 2 : 1;
        this.audio.levelWin();
      } else {
        this.audio.levelFail();
      }
      const accuracy = this.shotsFired > 0 ? Math.round(this.shotsHit / this.shotsFired * 100) : 0;
      setTimeout(() => {
        if (this.hooks.onLevelEnd) {
          this.hooks.onLevelEnd({
            win, reason, stars,
            levelIndex: this.levelIndex,
            score: Math.max(0, this.score),
            kills: this.kills,
            total: this.totalEnemies,
            accuracy,
            timeLeft: Math.max(0, Math.ceil(this.timeLeft))
          });
        }
      }, win ? 700 : 1300);
    }

    /* ---------- Điều khiển cho mobile ---------- */
    toggleScope() { if (this.state === 'playing') this.scoped = !this.scoped; }
    fireButton() { if (this.state === 'playing') this.fire(); }
    reloadButton() { if (this.state === 'playing') this.startReload(); }
    setBreath(on) { this.keys['Space'] = !!on; }

    /* Tìm mục tiêu gần điểm ngắm để trợ lực trên mobile */
    findAssistTarget(ix, iy) {
      let best = null, bd = Infinity;
      for (const a of this.actors) {
        if (a.kind !== 'enemy' || !a.alive || !a.spawned) continue;
        if (a.peek && !a.peek.up) continue;
        if (a.state === 'hide' && !a.hideUp) continue;
        const dh = Math.hypot(ix - a.x, iy - (a.y - 84));   // vùng đầu
        if (dh < bd && dh < 60) { bd = dh; best = { x: a.x, y: a.y - 84 }; }
        const db = Math.hypot(ix - a.x, iy - (a.y - 45));   // vùng thân
        if (db < bd && db < 60) { bd = db; best = { x: a.x, y: a.y - 45 }; }
      }
      return best;
    }

    pause() { if (this.state === 'playing') { this.state = 'paused'; if (this.hooks.onPause) this.hooks.onPause(); } }
    resume() { if (this.state === 'paused') { this.state = 'playing'; if (this.hooks.onResume) this.hooks.onResume(); } }
    quitToMenu() { this.state = 'idle'; this.scoped = false; }

    showMsg(text, duration) {
      if (this.hooks.onMessage) this.hooks.onMessage(text, duration || 1800);
    }

    /* ---------- Hiệu ứng ---------- */
    addParticles(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = 40 + Math.random() * 170;
        this.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 70,
          life: 0.5 + Math.random() * 0.4, t: 0,
          color, size: 2 + Math.random() * 3
        });
      }
    }

    addFloatText(x, y, text, color) {
      this.floatTexts.push({ x, y, text, color, t: 0 });
    }

    /* ---------- Vòng lặp ---------- */
    loop(now) {
      const dt = Math.min(0.05, (now - (this.lastT || now)) / 1000);
      this.lastT = now;
      this.swayT += dt;
      if (this.state === 'playing') this.update(dt);
      this.render(dt);
      requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      const L = this.level;
      this.elapsed += dt;
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endLevel(false, 'Hết thời gian!'); return; }

      // Nạp đạn
      if (this.reloading) {
        this.reloadT += dt;
        if (this.reloadT >= this.weapon.reload) {
          this.reloading = false;
          const take = Math.min(this.weapon.mag - this.mag, this.reserve);
          this.mag += take;
          this.reserve -= take;
        }
      }

      // Hơi thở
      if (this.holdingBreath()) this.breath = Math.max(0, this.breath - dt);
      else this.breath = Math.min(C.BREATH_MAX, this.breath + C.BREATH_REGEN * dt);

      // Nhân vật
      for (const a of this.actors) {
        if (!a.alive) continue;
        if (!a.spawned) { if (this.elapsed >= a.spawnAt) a.spawned = true; continue; }
        a.fade = Math.min(1, a.fade + dt * 3);
        a.phase += dt;

        if (a.alertMark > 0) a.alertMark = Math.max(0, a.alertMark - dt);

        if (a.alert) {
          a.alertTimer -= dt;
          if (a.alertTimer <= 0) {
            // Hết cảnh giác — trở lại tuần tra bình thường
            a.alert = false; a.state = null; a.hideTarget = null;
            if (a.staticY) { a.minX = a.maxX = a.x; }
            else if (a.onRoof) {
              const lo = a.roofLo != null ? a.roofLo : a.x - 120;
              const hi = a.roofHi != null ? a.roofHi : a.x + 120;
              a.minX = clamp(a.x - 120, lo, hi);
              a.maxX = clamp(a.x + 120, lo, hi);
              if (a.maxX - a.minX < 50) { a.minX = a.maxX = a.x; }
            } else {
              a.minX = clamp(a.x - 140, 70, C.WORLD_W - 70);
              a.maxX = clamp(a.x + 140, 70, C.WORLD_W - 70);
            }
          }
        }

        if (a.peek) {
          a.peek.timer -= dt;
          if (a.peek.up && a.peek.timer <= 0) { a.peek.up = false; a.peek.timer = 1.0 + Math.random() * 1.4; }
          else if (!a.peek.up && a.peek.timer <= 0) { a.peek.up = true; a.peek.timer = 1.2 + Math.random() * 1.2; }
        } else if (a.state === 'seek' && a.hideTarget != null) {
          // Chạy nhanh về chỗ trốn
          const d = a.hideTarget - a.x;
          const spd = (a.runner ? L.speed * 2.2 : L.speed) * 2.2 + 80;
          a.dir = d >= 0 ? 1 : -1;
          a.x += a.dir * spd * dt;
          if (Math.abs(a.hideTarget - a.x) < 10) {
            a.x = a.hideTarget;
            a.state = 'hide';
            a.hideUp = false;
            a.hideTimer = 0.5 + Math.random();
          }
        } else if (a.state === 'hide') {
          // Nấp sau công sự, thỉnh thoảng thò đầu quan sát
          a.hideTimer -= dt;
          if (a.hideUp && a.hideTimer <= 0) { a.hideUp = false; a.hideTimer = 1.0 + Math.random() * 1.6; }
          else if (!a.hideUp && a.hideTimer <= 0) { a.hideUp = true; a.hideTimer = 1.1 + Math.random() * 1.1; }
        } else if (a.maxX > a.minX) {
          const spd = a.runner ? L.speed * 2.2 : (a.kind === 'civilian' ? L.speed * 0.5 + 18 : L.speed);
          a.x += a.dir * spd * dt;
          if (a.x > a.maxX) { a.x = a.maxX; a.dir = -1; }
          if (a.x < a.minX) { a.x = a.minX; a.dir = 1; }
        }
      }

      // Đạn bay
      for (const b of this.bullets) b.t += dt;
      const arrived = this.bullets.filter(b => b.t >= b.dur);
      this.bullets = this.bullets.filter(b => b.t < b.dur);
      for (const b of arrived) this.resolveImpact(b);

      // Vỏ đạn
      for (const cs of this.casings) {
        cs.t += dt;
        cs.x += cs.vx * dt; cs.y += cs.vy * dt;
        cs.vy += 900 * dt; cs.rot += cs.vr * dt;
        if (cs.y > C.GROUND_Y) { cs.y = C.GROUND_Y; cs.vy *= -0.3; cs.vx *= 0.6; }
      }
      this.casings = this.casings.filter(cs => cs.t < 2.2);

      // Hiệu ứng chung
      this.shake = Math.max(0, this.shake - dt * 40);
      this.flash = Math.max(0, this.flash - dt);
      this.recoil = Math.max(0, this.recoil - dt * 5);
      this.hitMarker = Math.max(0, this.hitMarker - dt);
      for (const p of this.particles) {
        p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 320 * dt;
      }
      this.particles = this.particles.filter(p => p.t < p.life);
      for (const f of this.floatTexts) f.t += dt;
      this.floatTexts = this.floatTexts.filter(f => f.t < 1.2);

      // Gió & mưa
      const wSpd = this.level.wind * 90;
      for (const ws of this.windStreaks) {
        ws.x += (wSpd + ws.spd * Math.sign(this.level.wind || 1)) * dt;
        if (ws.x > C.WORLD_W + 100) ws.x = -100;
        if (ws.x < -100) ws.x = C.WORLD_W + 100;
      }
      for (const rd of this.rainDrops) {
        rd.y += rd.spd * dt;
        rd.x += this.level.wind * 260 * dt;
        if (rd.y > C.GROUND_Y) { rd.y = -20; rd.x = Math.random() * C.WORLD_W; }
      }

      // Mây trôi & chim bay
      for (const cl of this.clouds) cl.x += cl.spd * dt;
      for (const bd of this.birds) {
        bd.phase += dt * 9;
        bd.x += bd.dir * bd.spd * dt;
        if (bd.x > C.WORLD_W + 50) bd.x = -50;
        if (bd.x < -50) bd.x = C.WORLD_W + 50;
      }

      // Thắng?
      const remaining = this.actors.filter(a => a.kind === 'enemy' && a.alive).length;
      const pending = this.actors.filter(a => a.kind === 'enemy' && !a.spawned).length;
      if (remaining === 0 && pending === 0) { this.endLevel(true); return; }

      // HUD
      if (this.hooks.onHud) {
        this.hooks.onHud({
          level: this.levelIndex + 1,
          remaining, total: this.totalEnemies,
          time: Math.ceil(this.timeLeft),
          wind: L.wind,
          mag: this.mag, reserve: this.reserve,
          score: Math.max(0, this.score),
          breath: this.breath / C.BREATH_MAX,
          reloading: this.reloading,
          reloadPct: this.reloading ? this.reloadT / this.weapon.reload : 0,
          scoped: this.scoped,
          weaponName: this.weapon.name
        });
      }
    }

    /* ================= RENDER ================= */
    render(dt) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.viewW, this.viewH);
      if (this.state === 'idle') {
        ctx.fillStyle = '#0a0f08';
        ctx.fillRect(0, 0, this.viewW, this.viewH);
        return;
      }

      this.aimPoint();

      // Camera: tâm nhìn = điểm ngắm
      this.camX = clamp(this.aim.x - this.viewW / 2, 0, C.WORLD_W - this.viewW);
      this.camY = clamp(this.aim.y - this.viewH / 2, 0, C.WORLD_H - this.viewH);

      // Điểm thế giới ngay dưới con trỏ/ngón tay - nguồn sự thật duy nhất
      this.px = this.camX + this.mouse.x;
      this.py = this.camY + this.mouse.y;

      // Rung + giật
      const shX = (Math.random() - 0.5) * this.shake;
      const shY = (Math.random() - 0.5) * this.shake;

      this.drawSky(ctx);

      ctx.save();
      if (this.scoped) {
        // Zoom quanh DUNG diem con tro dang chi
        // => muc tieu duoi tam ngam KHONG BAO GIO dich khi bat/tat zoom
        ctx.translate(this.mouse.x + shX, this.mouse.y + shY);
        ctx.scale(this.weapon.zoom, this.weapon.zoom);
        ctx.translate(-this.px, -this.py);
      } else {
        ctx.translate(-this.camX + shX, -this.camY + shY);
      }

      this.drawFarLayers(ctx);
      this.drawCity(ctx);
      this.drawStreet(ctx);
      this.drawActors(ctx);
      this.drawWeather(ctx);
      this.drawBullets(ctx);
      this.drawCasings(ctx);
      this.drawParticles(ctx);
      this.drawFloatTexts(ctx);

      ctx.restore();

      // Lớp tối theo chủ đề (đêm/mưa)
      if (this.theme.dark > 0) {
        ctx.fillStyle = `rgba(5,8,20,${this.theme.dark})`;
        ctx.fillRect(0, 0, this.viewW, this.viewH);
      }

      if (this.scoped) this.drawScopeOverlay(ctx);
      else this.drawHipfire(ctx);

      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255,245,200,${this.flash})`;
        ctx.fillRect(0, 0, this.viewW, this.viewH);
      }
    }

    /* ---------- Bầu trời ---------- */
    drawSky(ctx) {
      const th = this.theme;
      const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
      g.addColorStop(0, th.skyTop);
      g.addColorStop(0.55, th.skyMid);
      g.addColorStop(1, th.skyBot);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.viewW, this.viewH);

      // Sao
      if (this.stars.length) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (const s of this.stars) {
          const sx = ((s.x - this.camX * 0.12) % this.viewW + this.viewW) % this.viewW;
          const sy = s.y - this.camY * 0.12;
          if (sy < 0 || sy > this.viewH) continue;
          const tw = 0.5 + 0.5 * Math.sin(this.swayT * 2 + s.tw);
          ctx.globalAlpha = 0.3 + tw * 0.6;
          ctx.fillRect(sx, sy, 2, 2);
        }
        ctx.globalAlpha = 1;
      }

      // Mặt trời / mặt trăng
      const celX = this.viewW * 0.72 - this.camX * 0.08;
      const celY = 170 - this.camY * 0.08;
      ctx.fillStyle = th.sunGlow;
      ctx.beginPath(); ctx.arc(celX, celY, 130, 0, TAU); ctx.fill();
      ctx.fillStyle = th.sun;
      ctx.beginPath(); ctx.arc(celX, celY, 62, 0, TAU); ctx.fill();
      if (this.level.theme === 'night') {
        // Miệng hố mặt trăng
        ctx.fillStyle = 'rgba(160,175,205,0.5)';
        ctx.beginPath(); ctx.arc(celX - 18, celY - 10, 11, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(celX + 14, celY + 16, 8, 0, TAU); ctx.fill();
      }

      // Mây
      ctx.fillStyle = this.level.theme === 'night' ? 'rgba(120,135,170,0.16)' : 'rgba(255,255,255,0.24)';
      for (const cl of this.clouds) {
        const cxp = ((cl.x - this.camX * 0.3) % (C.WORLD_W + 400) + C.WORLD_W + 400) % (C.WORLD_W + 400) - 200;
        ctx.beginPath();
        ctx.ellipse(cxp, cl.y - this.camY * 0.3, 95 * cl.s, 27 * cl.s, 0, 0, TAU);
        ctx.ellipse(cxp + 65 * cl.s, cl.y + 9 * cl.s - this.camY * 0.3, 68 * cl.s, 21 * cl.s, 0, 0, TAU);
        ctx.fill();
      }

      // Chim
      ctx.strokeStyle = this.level.theme === 'night' ? 'rgba(150,160,185,0.5)' : 'rgba(40,45,55,0.6)';
      ctx.lineWidth = 2;
      for (const bd of this.birds) {
        const bx = bd.x - this.camX * 0.5, by = bd.y - this.camY * 0.5;
        const flap = Math.sin(bd.phase) * 7;
        ctx.beginPath();
        ctx.moveTo(bx - 9, by + flap);
        ctx.quadraticCurveTo(bx - 3, by - 4, bx, by);
        ctx.quadraticCurveTo(bx + 3, by - 4, bx + 9, by + flap);
        ctx.stroke();
      }
    }

    /* ---------- Lớn cảnh xa (parallax) ---------- */
    drawFarLayers(ctx) {
      const th = this.theme;
      // Núi rất xa
      ctx.save();
      ctx.translate(this.camX * 0.82, this.camY * 0.82);
      ctx.fillStyle = th.farColor;
      ctx.globalAlpha = 0.5;
      for (const m of this.mountains) {
        ctx.beginPath();
        ctx.moveTo(m.x, C.GROUND_Y);
        ctx.lineTo(m.x + m.w / 2, C.GROUND_Y - m.h);
        ctx.lineTo(m.x + m.w, C.GROUND_Y);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // Skyline thành phố xa
      ctx.save();
      ctx.translate(this.camX * 0.55, this.camY * 0.55);
      ctx.fillStyle = th.farColor;
      ctx.globalAlpha = 0.75;
      for (const s of this.skyline) {
        ctx.fillRect(s.x, C.GROUND_Y - s.h, s.w, s.h);
        if (s.ant) {
          ctx.fillRect(s.x + s.w / 2 - 2, C.GROUND_Y - s.h - 34, 4, 34);
        }
      }
      ctx.restore();

      // Dải sương mù chân trời
      ctx.save();
      ctx.translate(this.camX * 0.7, this.camY * 0.7);
      ctx.fillStyle = th.fog;
      ctx.fillRect(-500, C.GROUND_Y - 130, C.WORLD_W + 1000, 130);
      ctx.restore();
    }

    /* ---------- Thành phố chính ---------- */
    drawCity(ctx) {
      const night = this.level.theme === 'night';
      for (const b of this.buildings) {
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        // Viền nóc
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(b.x, b.y, b.w, 10);
        // Cửa sổ
        for (const wd of b.windows) {
          if (wd.lit) {
            ctx.fillStyle = night ? '#ffca5f' : '#c8d8e8';
            ctx.fillRect(wd.x, wd.y, 32, 44);
            if (night) {
              ctx.fillStyle = 'rgba(255,190,90,0.13)';
              ctx.fillRect(wd.x - 8, wd.y - 8, 48, 60);
            }
          } else {
            ctx.fillStyle = 'rgba(10,12,16,0.75)';
            ctx.fillRect(wd.x, wd.y, 32, 44);
          }
        }
        // Đồ trên nóc
        for (const pr of b.props) {
          const px = b.x + pr.dx;
          if (pr.type === 'tank') {
            ctx.fillStyle = '#4a4440';
            ctx.fillRect(px + 14, b.y - 34, 8, 34);
            ctx.fillStyle = '#5c564e';
            ctx.beginPath();
            ctx.ellipse(px + 18, b.y - 44, 26, 20, 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(px + 18, b.y - 44, 26, 20, 0, 0, TAU); ctx.stroke();
          } else if (pr.type === 'antenna') {
            ctx.strokeStyle = '#33363a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(px, b.y); ctx.lineTo(px, b.y - pr.h);
            ctx.moveTo(px - 10, b.y - pr.h * 0.5); ctx.lineTo(px + 10, b.y - pr.h * 0.5);
            ctx.moveTo(px - 7, b.y - pr.h * 0.75); ctx.lineTo(px + 7, b.y - pr.h * 0.75);
            ctx.stroke();
            if (night) {
              ctx.fillStyle = '#ff4444';
              ctx.beginPath(); ctx.arc(px, b.y - pr.h, 3, 0, TAU); ctx.fill();
            }
          } else if (pr.type === 'ac') {
            ctx.fillStyle = '#3c4046';
            ctx.fillRect(px, b.y - 20, 44, 20);
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            for (let l = 0; l < 3; l++) {
              ctx.beginPath();
              ctx.moveTo(px + 5, b.y - 5 - l * 5);
              ctx.lineTo(px + 39, b.y - 5 - l * 5);
              ctx.stroke();
            }
          }
        }
      }
    }

    /* ---------- Đường phố ---------- */
    drawStreet(ctx) {
      // Mặt đường nhựa
      ctx.fillStyle = '#33343a';
      ctx.fillRect(-200, C.GROUND_Y, C.WORLD_W + 400, 74);
      // Kẻ vạch giữa đường
      ctx.fillStyle = 'rgba(230,200,80,0.75)';
      for (let rx = 0; rx < C.WORLD_W; rx += 130) {
        ctx.fillRect(rx, C.GROUND_Y + 34, 64, 6);
      }
      // Vỉa hè
      ctx.fillStyle = '#4c4a42';
      ctx.fillRect(-200, C.GROUND_Y + 74, C.WORLD_W + 400, C.WORLD_H - C.GROUND_Y - 74 + 200);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let px = 0; px < C.WORLD_W; px += 90) {
        ctx.fillRect(px, C.GROUND_Y + 74, 3, 40);
      }

      // Thùng phuy / thùng hàng
      for (const pr of this.props) {
        if (pr.type === 'barrel') {
          const w = 34 * pr.s, h = 52 * pr.s;
          ctx.fillStyle = '#5d4a35';
          ctx.fillRect(pr.x, C.GROUND_Y - h, w, h);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 2;
          ctx.strokeRect(pr.x, C.GROUND_Y - h, w, h);
          ctx.beginPath();
          ctx.moveTo(pr.x, C.GROUND_Y - h * 0.66); ctx.lineTo(pr.x + w, C.GROUND_Y - h * 0.66);
          ctx.moveTo(pr.x, C.GROUND_Y - h * 0.33); ctx.lineTo(pr.x + w, C.GROUND_Y - h * 0.33);
          ctx.stroke();
        } else {
          const s = 40 * pr.s;
          ctx.fillStyle = '#6d5836';
          ctx.fillRect(pr.x, C.GROUND_Y - s, s, s);
          ctx.strokeStyle = '#4a3c24';
          ctx.lineWidth = 3;
          ctx.strokeRect(pr.x, C.GROUND_Y - s, s, s);
          ctx.beginPath();
          ctx.moveTo(pr.x, C.GROUND_Y - s); ctx.lineTo(pr.x + s, C.GROUND_Y);
          ctx.moveTo(pr.x + s, C.GROUND_Y - s); ctx.lineTo(pr.x, C.GROUND_Y);
          ctx.stroke();
        }
      }

      // Bao cát (công sự)
      for (const cv of this.covers) {
        const rows = 3;
        for (let r = 0; r < rows; r++) {
          const bags = Math.floor(cv.w / 34) - r;
          for (let bgi = 0; bgi < bags; bgi++) {
            const bx = cv.x + bgi * 34 + r * 17;
            const by = C.GROUND_Y - 16 - r * 17;
            ctx.fillStyle = r % 2 ? '#8a7a58' : '#7d6e4e';
            ctx.beginPath();
            ctx.ellipse(bx + 16, by, 19, 10, 0, 0, TAU);
            ctx.fill();
          }
        }
      }

      // Cây
      for (const tr of this.trees) {
        const s = tr.s;
        ctx.fillStyle = '#4a3520';
        ctx.fillRect(tr.x - 6 * s, C.GROUND_Y + 74 - 90 * s, 12 * s, 90 * s);
        ctx.fillStyle = this.level.theme === 'night' ? '#1e3320' : '#3d6b2f';
        ctx.beginPath();
        ctx.arc(tr.x, C.GROUND_Y + 74 - 105 * s, 42 * s, 0, TAU);
        ctx.arc(tr.x - 30 * s, C.GROUND_Y + 74 - 80 * s, 30 * s, 0, TAU);
        ctx.arc(tr.x + 30 * s, C.GROUND_Y + 74 - 80 * s, 30 * s, 0, TAU);
        ctx.fill();
      }

      // Đèn đường
      for (const lp of this.lamps) {
        ctx.strokeStyle = '#2c2e32';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(lp.x, C.GROUND_Y + 74);
        ctx.lineTo(lp.x, C.GROUND_Y + 74 - 170);
        ctx.lineTo(lp.x + 34, C.GROUND_Y + 74 - 170);
        ctx.stroke();
        ctx.fillStyle = this.level.theme === 'night' ? '#ffd77a' : '#c8ccd2';
        ctx.beginPath();
        ctx.ellipse(lp.x + 34, C.GROUND_Y + 74 - 164, 10, 6, 0, 0, TAU);
        ctx.fill();
        if (this.level.theme === 'night') {
          ctx.fillStyle = 'rgba(255,210,120,0.12)';
          ctx.beginPath();
          ctx.moveTo(lp.x + 34, C.GROUND_Y + 74 - 160);
          ctx.lineTo(lp.x - 6, C.GROUND_Y + 74);
          ctx.lineTo(lp.x + 74, C.GROUND_Y + 74);
          ctx.closePath(); ctx.fill();
        }
      }
    }

    /* ---------- Nhân vật ---------- */
    drawActors(ctx) {
      for (const a of this.actors) {
        if (!a.alive || !a.spawned || a.fade <= 0) continue;
        const hiding = a.state === 'hide';
        const hidden = (a.peek && !a.peek.up) || (hiding && !a.hideUp);
        if (hidden) continue;

        ctx.save();
        ctx.globalAlpha = a.fade;
        const moving = a.maxX > a.minX;
        const bob = moving ? Math.abs(Math.sin(a.phase * 7)) * 3 : Math.sin(a.phase * 1.6) * 1.2;
        const fx = a.x, fy = a.y - bob;

        if (a.kind === 'civilian') this.drawCivilian(ctx, a, fx, fy, moving);
        else if (hiding) this.drawSoldierCrouch(ctx, a, fx, fy);
        else this.drawSoldier(ctx, a, fx, fy, moving);

        // Dấu chấm than khi cảnh giác
        if (a.alertMark > 0) {
          ctx.fillStyle = '#ff5252';
          ctx.font = 'bold 30px "Segoe UI", Arial';
          ctx.textAlign = 'center';
          ctx.fillText('!', fx, fy - 112);
        }
        ctx.restore();
      }
    }

    drawSoldier(ctx, a, fx, fy, moving) {
      const swing = moving ? Math.sin(a.phase * 9) * 8 : 0;
      const uniform = a.officer ? '#3a3226' : '#2b3026';
      const vest = a.officer ? '#4a3c28' : '#22261e';

      // Chân (có animation bước đi)
      ctx.strokeStyle = '#1d211a';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx - 5, fy - 36); ctx.lineTo(fx - 6 + swing, fy);
      ctx.moveTo(fx + 5, fy - 36); ctx.lineTo(fx + 6 - swing, fy);
      ctx.stroke();

      // Thân + áo giáp
      ctx.fillStyle = uniform;
      ctx.fillRect(fx - 14, fy - 74, 28, 42);
      ctx.fillStyle = vest;
      ctx.fillRect(fx - 11, fy - 70, 22, 26);

      // Tay cầm súng
      ctx.strokeStyle = uniform;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(fx - 10, fy - 66); ctx.lineTo(fx + 12, fy - 58);
      ctx.moveTo(fx + 2, fy - 62); ctx.lineTo(fx + 20, fy - 54);
      ctx.stroke();

      // Súng trường
      ctx.strokeStyle = '#15171a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(fx - 6, fy - 60); ctx.lineTo(fx + 34 * a.dir, fy - 56);
      ctx.stroke();

      // Đầu
      ctx.fillStyle = a.skin;
      ctx.beginPath(); ctx.arc(fx, fy - 84, 11, 0, TAU); ctx.fill();
      // Mũ / mũ sĩ quan
      ctx.fillStyle = a.officer ? '#2a2418' : '#23281f';
      if (a.officer) {
        ctx.fillRect(fx - 12, fy - 98, 24, 8);
        ctx.fillRect(fx - 14, fy - 91, 28, 4);
      } else {
        ctx.beginPath(); ctx.arc(fx, fy - 86, 12, Math.PI, 0); ctx.fill();
        ctx.fillRect(fx - 13, fy - 88, 26, 4);
      }
      // Khoanh đỏ sĩ quan
      if (a.officer) {
        ctx.fillStyle = '#c62828';
        ctx.fillRect(fx - 14, fy - 66, 5, 10);
      }
    }

    drawSoldierCrouch(ctx, a, fx, fy) {
      // Ngồi nấp sau công sự, chỉ lộ đầu & vai khi thò ra quan sát
      ctx.fillStyle = a.officer ? '#3a3226' : '#2b3026';
      ctx.fillRect(fx - 13, fy - 46, 26, 30);
      ctx.fillStyle = a.skin;
      ctx.beginPath(); ctx.arc(fx, fy - 56, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = a.officer ? '#2a2418' : '#23281f';
      ctx.beginPath(); ctx.arc(fx, fy - 58, 12, Math.PI, 0); ctx.fill();
      ctx.fillRect(fx - 13, fy - 60, 26, 4);
      // Súng chĩa lên khi thò đầu
      ctx.strokeStyle = '#15171a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(fx - 4, fy - 40); ctx.lineTo(fx + 26 * a.dir, fy - 48);
      ctx.stroke();
    }

    drawCivilian(ctx, a, fx, fy, moving) {
      const swing = moving ? Math.sin(a.phase * 8) * 7 : 0;
      // Chân
      ctx.strokeStyle = a.pants;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx - 5, fy - 36); ctx.lineTo(fx - 6 + swing, fy);
      ctx.moveTo(fx + 5, fy - 36); ctx.lineTo(fx + 6 - swing, fy);
      ctx.stroke();
      // Thân áo sáng màu (dễ nhận biết)
      ctx.fillStyle = a.shirt;
      ctx.fillRect(fx - 13, fy - 72, 26, 40);
      // Tay
      ctx.strokeStyle = a.skin;
      ctx.lineWidth = 5;
      ctx.beginPath();
      if (moving) {
        // Người đi lại: tay đánh tự nhiên
        ctx.moveTo(fx - 10, fy - 66); ctx.lineTo(fx - 12 - swing * 0.6, fy - 40);
        ctx.moveTo(fx + 10, fy - 66); ctx.lineTo(fx + 12 + swing * 0.6, fy - 40);
      } else {
        // Người đứng: giơ 2 tay (dấu hiệu đầu hàng)
        ctx.moveTo(fx - 10, fy - 66); ctx.lineTo(fx - 20, fy - 96);
        ctx.moveTo(fx + 10, fy - 66); ctx.lineTo(fx + 20, fy - 96);
      }
      ctx.stroke();
      // Đầu
      ctx.fillStyle = a.skin;
      ctx.beginPath(); ctx.arc(fx, fy - 83, 11, 0, TAU); ctx.fill();
      // Tóc
      ctx.fillStyle = '#3a2a1a';
      ctx.beginPath(); ctx.arc(fx, fy - 86, 11, Math.PI, 0); ctx.fill();
    }

    /* ---------- Thời tiết ---------- */
    drawWeather(ctx) {
      // Vệt gió
      if (Math.abs(this.level.wind) > 0.05) {
        ctx.strokeStyle = 'rgba(255,255,255,0.13)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const ws of this.windStreaks) {
          ctx.moveTo(ws.x, ws.y);
          ctx.lineTo(ws.x - ws.len * Math.sign(this.level.wind), ws.y + 4);
        }
        ctx.stroke();
      }
      // Mưa
      if (this.theme.rain) {
        ctx.strokeStyle = 'rgba(180,200,230,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const rd of this.rainDrops) {
          ctx.moveTo(rd.x, rd.y);
          ctx.lineTo(rd.x - this.level.wind * 8, rd.y - rd.len);
        }
        ctx.stroke();
      }
    }

    /* ---------- Đạn bay ---------- */
    drawBullets(ctx) {
      for (const b of this.bullets) {
        const k = b.t / b.dur;
        const hx = lerp(b.x1, b.x2, k);
        const hy = lerp(b.y1, b.y2, k);
        const ang = Math.atan2(b.y2 - b.y1, b.x2 - b.x1);
        const tailLen = 90;
        const tx = hx - Math.cos(ang) * tailLen;
        const ty = hy - Math.sin(ang) * tailLen;
        const grad = ctx.createLinearGradient(tx, ty, hx, hy);
        grad.addColorStop(0, 'rgba(255,240,180,0)');
        grad.addColorStop(1, 'rgba(255,235,160,0.95)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty); ctx.lineTo(hx, hy);
        ctx.stroke();
        // Đầu đạn phát sáng
        ctx.fillStyle = 'rgba(255,250,210,0.95)';
        ctx.beginPath(); ctx.arc(hx, hy, 3, 0, TAU); ctx.fill();
      }
    }

    drawCasings(ctx) {
      ctx.fillStyle = '#c9a24a';
      for (const cs of this.casings) {
        ctx.save();
        ctx.translate(cs.x, cs.y);
        ctx.rotate(cs.rot);
        ctx.globalAlpha = clamp(2.2 - cs.t, 0, 1);
        ctx.fillRect(-4, -1.5, 8, 3);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    drawParticles(ctx) {
      for (const p of this.particles) {
        ctx.globalAlpha = 1 - p.t / p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    drawFloatTexts(ctx) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 26px "Segoe UI", Arial';
      for (const f of this.floatTexts) {
        ctx.globalAlpha = 1 - f.t / 1.2;
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y - f.t * 45);
      }
      ctx.globalAlpha = 1;
    }

    /* ---------- Ống ngắm (khi ngắm) ---------- */
    drawScopeOverlay(ctx) {
      // Vòng ống ngắm BÁM THEO con trỏ/ngón tay (kẹp trong màn hình)
      const R = Math.min(this.viewW, this.viewH) * 0.46;
      const cx = clamp(this.mouse.x, R, this.viewW - R);
      const cy = clamp(this.mouse.y, R, this.viewH - R);
      // Chữ thập vẽ tại ĐIỂM ĐẠN SẼ CHẠM (độ lắc + gió, nhân zoom vì đang phóng đại)
      const sway = this.currentSway(this.holdingBreath());
      const windOff = this.level.wind * C.WIND_OFFSET * this.weapon.windMul;
      const z = this.weapon.zoom;
      const sx = cx + (sway.x + windOff) * z, sy = cy + sway.y * z;

      ctx.save();
      // Nền đen ngoài ống ngắm
      ctx.beginPath();
      ctx.rect(0, 0, this.viewW, this.viewH);
      ctx.arc(cx, cy, R, 0, TAU, true);
      ctx.fillStyle = 'rgba(1,2,1,0.99)';
      ctx.fill('evenodd');

      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.clip();

      // Chữ thập
      ctx.strokeStyle = 'rgba(15,25,12,0.92)';
      ctx.lineWidth = 1.6;
      const gap = 30, len = R;
      ctx.beginPath();
      ctx.moveTo(sx - len, sy); ctx.lineTo(sx - gap, sy);
      ctx.moveTo(sx + gap, sy); ctx.lineTo(sx + len, sy);
      ctx.moveTo(sx, sy - len); ctx.lineTo(sx, sy - gap);
      ctx.moveTo(sx, sy + gap); ctx.lineTo(sx, sy + len);
      ctx.stroke();

      // Mil-dots
      ctx.fillStyle = 'rgba(15,25,12,0.92)';
      for (let i = 1; i <= 5; i++) {
        const d = gap + i * 36;
        [[sx - d, sy], [sx + d, sy], [sx, sy - d], [sx, sy + d]].forEach(([mx, my]) => {
          ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, TAU); ctx.fill();
        });
      }

      // Điểm đỏ trung tâm
      ctx.fillStyle = 'rgba(230,45,45,0.95)';
      ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, TAU); ctx.fill();

      // Hit marker
      if (this.hitMarker > 0) {
        ctx.strokeStyle = `rgba(255,80,80,${this.hitMarker / 0.3})`;
        ctx.lineWidth = 3;
        const mo = 8, m = 16;
        ctx.beginPath();
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
          ctx.moveTo(sx + dx * mo, sy + dy * mo);
          ctx.lineTo(sx + dx * m, sy + dy * m);
        });
        ctx.stroke();
      }

      // Tên súng nhỏ dưới ống ngắm
      ctx.font = 'bold 15px "Segoe UI", Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(140,180,120,0.75)';
      ctx.fillText(this.weapon.name.toUpperCase() + '  ×' + this.weapon.zoom.toFixed(1), cx, cy + R - 34);
      // Chỉ báo gió mini
      const windTxt = Math.abs(this.level.wind) < 0.05 ? '—' :
        (this.level.wind > 0 ? '→ ' : '← ') + Math.round(Math.abs(this.level.wind) * 10);
      ctx.fillText('GIÓ ' + windTxt, cx, cy + R - 14);

      ctx.restore();

      // Viền ống ngắm
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 16; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R - 10, 0, TAU);
      ctx.strokeStyle = 'rgba(90,110,80,0.5)'; ctx.lineWidth = 3; ctx.stroke();
    }

    /* ---------- Góc nhìn thường (không ngắm) ---------- */
    drawHipfire(ctx) {
      const cx = this.viewW / 2, cy = this.viewH / 2;

      // Vignette nhẹ
      const vg = ctx.createRadialGradient(cx, cy, this.viewH * 0.35, cx, cy, this.viewH * 0.85);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, this.viewW, this.viewH);

      // Chấm ngắm nhỏ (cũng hiển thị điểm đạn sẽ chạm)
      const swayH = this.currentSway(false);
      const windOffH = this.level.wind * C.WIND_OFFSET * this.weapon.windMul;
      const hx2 = this.mouse.x + swayH.x + windOffH, hy2 = this.mouse.y + swayH.y;
      ctx.fillStyle = 'rgba(255,80,80,0.9)';
      ctx.beginPath(); ctx.arc(hx2, hy2, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx2, hy2, 9, 0, TAU); ctx.stroke();

      this.drawGun(ctx);
    }

    /* ================= SÚNG GÓC NHÌN THỨ NHẤT (phong cách Đột Kích) ================= */
    drawGun(ctx) {
      const w = this.weapon;
      const kick = this.recoil;
      const sway = this.currentSway(false);

      // Súng nằm góc phải-dưới, nòng chĩa về phía tâm ngắm
      const gx = this.viewW * 0.88, gy = this.viewH * 1.06;
      const tx = this.viewW * 0.40, ty = this.viewH * 0.55;
      const ang = Math.atan2(ty - gy, tx - gx);
      const s = clamp(Math.min(this.viewW, this.viewH) / 850, 0.75, 1.25);

      ctx.save();
      ctx.translate(gx - sway.x * 0.5, gy - sway.y * 0.5 - kick * 30);
      ctx.rotate(ang + kick * 0.035);
      ctx.scale(s, s);

      // M200 có ngoại hình đặc biệt riêng (skin "Tiên Tử")
      if (w.id === 'm200') {
        this.drawGunM200Body(ctx);
        ctx.restore();
        return;
      }

      /* ----- Bảng màu theo từng khẩu súng VIP ----- */
      let metal, metalHi, body, bodyHi, bodyDk, gripC, scopeC;
      if (w.id === 'awm') {           // AWM — thân xanh quân đội
        metal = '#2c3034'; metalHi = '#4d545b';
        body = '#44543a'; bodyHi = '#5f7449'; bodyDk = '#31402a';
        gripC = '#2a3324'; scopeC = '#191c1f';
      } else if (w.id === 'm200') {   // CheyTac M200 — màu đất sa mạc
        metal = '#26292c'; metalHi = '#474c51';
        body = '#8a7a58'; bodyHi = '#a5946c'; bodyDk = '#6d6046';
        gripC = '#5c5138'; scopeC = '#17191b';
      } else if (w.id === 'svd') {    // SVD Dragunov — gỗ cổ điển
        metal = '#232527'; metalHi = '#41454a';
        body = '#7c4a24'; bodyHi = '#98622f'; bodyDk = '#5e3819';
        gripC = '#4a2c12'; scopeC = '#141618';
      } else {                        // Barrett M82 — đen công nghiệp
        metal = '#2e3236'; metalHi = '#51575e';
        body = '#22262a'; bodyHi = '#3c434a'; bodyDk = '#15171a';
        gripC = '#1c1f22'; scopeC = '#101214';
      }

      const big = w.id === 'barrett';
      const barrelLen = w.id === 'm200' ? 540 : w.id === 'awm' ? 450 : big ? 520 : 420;
      const bw = big ? 13 : 9;   // bán kính nòng

      /* --- Chân chống (bipod) gập dưới nòng --- */
      if (big || w.id === 'awm') {
        ctx.strokeStyle = '#181b1e';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(barrelLen * 0.60, 12);
        ctx.lineTo(barrelLen * 0.50, 78);
        ctx.moveTo(barrelLen * 0.60, 12);
        ctx.lineTo(barrelLen * 0.72, 74);
        ctx.stroke();
      }

      /* --- Báng súng --- */
      const stkG = ctx.createLinearGradient(0, -30, 0, 60);
      stkG.addColorStop(0, bodyHi);
      stkG.addColorStop(0.55, body);
      stkG.addColorStop(1, bodyDk);
      ctx.fillStyle = stkG;
      ctx.beginPath();
      ctx.moveTo(-72, -20);
      ctx.quadraticCurveTo(-88, 8, -78, 44);
      ctx.lineTo(-42, 58);
      ctx.lineTo(98, 50);
      ctx.lineTo(106, -24);
      ctx.closePath();
      ctx.fill();
      // Đệm vai cao su
      ctx.fillStyle = 'rgba(8,9,11,0.9)';
      ctx.fillRect(-80, -18, 13, 66);
      // Đỡ má (cheek rest)
      ctx.fillStyle = bodyDk;
      ctx.fillRect(6, -36, 74, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(6, -36, 74, 4);

      /* --- Thân súng (receiver) --- */
      const rcvG = ctx.createLinearGradient(0, -38, 0, 40);
      rcvG.addColorStop(0, metalHi);
      rcvG.addColorStop(0.45, metal);
      rcvG.addColorStop(1, '#121416');
      ctx.fillStyle = rcvG;
      ctx.fillRect(92, -38, 252, 78);
      // Khấc trang trí trên thân
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(116 + i * 56, -32);
        ctx.lineTo(116 + i * 56, 34);
        ctx.stroke();
      }
      // Ray gắn đồ (picatinny rail)
      ctx.fillStyle = '#101214';
      ctx.fillRect(120, -44, 210, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      for (let i = 0; i < 12; i++) ctx.fillRect(124 + i * 17, -44, 8, 3);

      /* --- Báng cầm (pistol grip) --- */
      ctx.fillStyle = gripC;
      ctx.beginPath();
      ctx.moveTo(148, 34);
      ctx.lineTo(198, 34);
      ctx.lineTo(180, 112);
      ctx.lineTo(136, 106);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(146 + i * 2, 48 + i * 15);
        ctx.lineTo(192 - i * 2, 46 + i * 15);
        ctx.stroke();
      }

      /* --- Cò súng & vành bảo vệ --- */
      ctx.strokeStyle = metal;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(232, 48, 27, 0.1 * Math.PI, 0.95 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#c9a24a';
      ctx.beginPath();
      ctx.moveTo(226, 28);
      ctx.quadraticCurveTo(219, 46, 227, 58);
      ctx.lineTo(236, 53);
      ctx.quadraticCurveTo(231, 40, 235, 30);
      ctx.closePath();
      ctx.fill();

      /* --- Băng đạn --- */
      ctx.fillStyle = metal;
      if (w.id === 'svd') {
        // Băng cong đặc trưng SVD
        ctx.beginPath();
        ctx.moveTo(286, 36);
        ctx.quadraticCurveTo(298, 82, 266, 118);
        ctx.lineTo(228, 104);
        ctx.quadraticCurveTo(252, 70, 256, 36);
        ctx.closePath();
        ctx.fill();
      } else {
        const mw = big ? 48 : 36, mh = big ? 78 : 58;
        ctx.fillRect(272, 36, mw, mh);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(272, 36, mw, mh);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(272, 36, mw, 6);
      }

      /* --- Nòng súng --- */
      const brlG = ctx.createLinearGradient(0, -bw, 0, bw);
      brlG.addColorStop(0, metalHi);
      brlG.addColorStop(0.5, metal);
      brlG.addColorStop(1, '#0e1012');
      ctx.fillStyle = brlG;
      ctx.fillRect(336, -bw, barrelLen - 336, bw * 2);
      // Đầu ruồi
      ctx.fillStyle = '#0c0e10';
      ctx.fillRect(barrelLen * 0.55, -bw - 9, 7, 11);

      /* --- Giảm thanh (suppressor) --- */
      const supLen = big ? 155 : 118;
      const syT = -(bw + (big ? 5 : 3));
      const shH = big ? 28 : 20;
      const supG = ctx.createLinearGradient(0, syT, 0, syT + shH);
      supG.addColorStop(0, '#3d434a');
      supG.addColorStop(0.5, '#1b1e21');
      supG.addColorStop(1, '#0a0c0e');
      ctx.fillStyle = supG;
      ctx.fillRect(barrelLen, syT, supLen, shH);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1.5;
      for (let i = 1; i <= 5; i++) {
        const lx = barrelLen + (supLen / 6) * i;
        ctx.beginPath();
        ctx.moveTo(lx, syT);
        ctx.lineTo(lx, syT + shH);
        ctx.stroke();
      }

      /* --- Ống ngắm tâm điểm --- */
      // Chân đỡ ống ngắm
      ctx.fillStyle = '#131518';
      ctx.fillRect(186, -52, 18, 12);
      ctx.fillRect(322, -52, 18, 12);
      // Thân ống ngắm
      const scpG = ctx.createLinearGradient(0, -84, 0, -50);
      scpG.addColorStop(0, '#41474e');
      scpG.addColorStop(0.4, scopeC);
      scpG.addColorStop(1, '#08090b');
      ctx.fillStyle = scpG;
      ctx.fillRect(176, -84, 196, 32);
      // Chuông kính trước
      ctx.beginPath();
      ctx.ellipse(384, -68, 27, 22, 0, 0, TAU);
      ctx.fill();
      // Mắt kính sau
      ctx.beginPath();
      ctx.ellipse(164, -68, 15, 18, 0, 0, TAU);
      ctx.fill();
      // Kính xanh phản chiếu ánh sáng
      const lensG = ctx.createRadialGradient(386, -70, 2, 386, -70, 20);
      lensG.addColorStop(0, 'rgba(150,205,255,0.95)');
      lensG.addColorStop(0.55, 'rgba(80,130,220,0.45)');
      lensG.addColorStop(1, 'rgba(25,45,85,0.1)');
      ctx.fillStyle = lensG;
      ctx.beginPath();
      ctx.ellipse(386, -69, 21, 16, 0, 0, TAU);
      ctx.fill();
      // Núm chỉnh độ cao
      ctx.fillStyle = '#22262c';
      ctx.fillRect(246, -97, 36, 15);
      ctx.beginPath();
      ctx.arc(264, -97, 9, Math.PI, 0);
      ctx.fill();

      /* --- Tay người cầm (găng chiến thuật) --- */
      this.drawGlove(ctx, 168, 58, 0.75);    // tay phải ôm báng cầm
      this.drawGlove(ctx, 452, 4, 1.05);     // tay trái đỡ nòng

      /* --- Chớp sáng đầu nòng --- */
      if (kick > 0.8) {
        ctx.fillStyle = `rgba(255,232,160,${(kick - 0.8) * 2.2})`;
        ctx.beginPath();
        ctx.arc(barrelLen + supLen + 10, 0, 15, 0, TAU);
        ctx.fill();
      }

      ctx.restore();
    }

    /* Găng tay + cánh tay người cầm súng */
    drawGlove(ctx, x, y, armAng, sleeve = '#39442c', glove = '#262119', gloveHi = '#312a1f') {
      ctx.save();
      ctx.translate(x, y);
      // Cánh tay + tay áo quân đội
      ctx.save();
      ctx.rotate(armAng);
      ctx.fillStyle = sleeve;
      ctx.beginPath();
      ctx.moveTo(16, -20);
      ctx.quadraticCurveTo(110, -6, 168, 66);
      ctx.lineTo(96, 108);
      ctx.quadraticCurveTo(48, 40, 8, 22);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // Găng tay
      ctx.fillStyle = glove;
      ctx.beginPath();
      ctx.ellipse(0, 0, 36, 25, 0, 0, TAU);
      ctx.fill();
      // Ngón tay quấn quanh súng
      ctx.fillStyle = gloveHi;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(-4, -16 + i * 11, 24, 8.5, 0, 0, TAU);
        ctx.fill();
      }
      // Viền sáng nhẹ
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 36, 25, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    /* ===== M200 "TIÊN TỬ" — skin phong cách Đột Kích ===== */
    drawGunM200Body(ctx) {
      const kick = this.recoil;

      /* --- Dải lụa bay phía sau báng --- */
      ctx.lineCap = 'round';
      const ribbons = [
        { w: 16, c: 'rgba(240,160,208,0.45)', p: [[-50, 0], [-150, -30], [-260, 10], [-360, -18]] },
        { w: 9, c: 'rgba(232,197,106,0.5)', p: [[-40, 22], [-140, 44], [-250, 26], [-350, 52]] },
        { w: 6, c: 'rgba(176,244,255,0.35)', p: [[-46, -12], [-160, -52], [-270, -30], [-380, -60]] }
      ];
      for (const rb of ribbons) {
        ctx.strokeStyle = rb.c;
        ctx.lineWidth = rb.w;
        ctx.beginPath();
        ctx.moveTo(rb.p[0][0], rb.p[0][1]);
        ctx.bezierCurveTo(rb.p[1][0], rb.p[1][1], rb.p[2][0], rb.p[2][1], rb.p[3][0], rb.p[3][1]);
        ctx.stroke();
      }

      /* --- Báng súng dạng cánh tiên --- */
      let g = ctx.createLinearGradient(0, -30, 0, 60);
      g.addColorStop(0, '#e87ec2');
      g.addColorStop(0.5, '#b03a86');
      g.addColorStop(1, '#5a1a48');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-70, -18);
      ctx.quadraticCurveTo(-92, 6, -80, 42);
      ctx.quadraticCurveTo(-40, 66, 20, 54);
      ctx.lineTo(104, 44);
      ctx.quadraticCurveTo(116, 8, 108, -26);
      ctx.closePath();
      ctx.fill();
      // Viền vàng kim
      ctx.strokeStyle = '#e8c56a';
      ctx.lineWidth = 3;
      ctx.stroke();
      // Lỗ khoét cánh tiên
      ctx.fillStyle = 'rgba(40,8,32,0.75)';
      ctx.beginPath();
      ctx.ellipse(30, 12, 34, 14, -0.15, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(232,197,106,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      /* --- Thân súng uốn lượn --- */
      g = ctx.createLinearGradient(0, -40, 0, 45);
      g.addColorStop(0, '#f0a0d0');
      g.addColorStop(0.45, '#c04a98');
      g.addColorStop(1, '#701c58');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(96, -34);
      ctx.quadraticCurveTo(220, -46, 330, -30);
      ctx.lineTo(338, 36);
      ctx.quadraticCurveTo(210, 50, 98, 40);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e8c56a';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Gân vàng trên thân
      ctx.strokeStyle = 'rgba(232,197,106,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(110, -22);
      ctx.quadraticCurveTo(220, -32, 326, -20);
      ctx.moveTo(112, 28);
      ctx.quadraticCurveTo(220, 38, 330, 26);
      ctx.stroke();
      // Khấc trang trí
      ctx.fillStyle = 'rgba(90,26,72,0.8)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(140 + i * 42, 4, 7, 13, 0, 0, TAU);
        ctx.fill();
      }

      /* --- Lõi tinh thể năng lượng phát sáng --- */
      ctx.save();
      ctx.shadowColor = '#7fe8ff';
      ctx.shadowBlur = 28;
      g = ctx.createRadialGradient(298, 2, 3, 298, 2, 30);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, '#aef2ff');
      g.addColorStop(0.75, 'rgba(90,190,255,0.55)');
      g.addColorStop(1, 'rgba(90,190,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(298, 2, 26, 32, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      // Vỏ bọc tinh thể
      ctx.strokeStyle = '#e8c56a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(298, 2, 27, 33, 0, 0, TAU);
      ctx.stroke();

      /* --- Báng cầm --- */
      g = ctx.createLinearGradient(0, 30, 0, 115);
      g.addColorStop(0, '#8e2a6e');
      g.addColorStop(1, '#3c1030');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(152, 34);
      ctx.quadraticCurveTo(206, 44, 196, 78);
      ctx.quadraticCurveTo(188, 112, 158, 118);
      ctx.quadraticCurveTo(136, 96, 142, 60);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e8c56a';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Đinh tán vàng
      ctx.fillStyle = '#f5dfa0';
      [[158, 62], [170, 82], [162, 102]].forEach(([dx, dy]) => {
        ctx.beginPath(); ctx.arc(dx, dy, 3, 0, TAU); ctx.fill();
      });

      /* --- Cò súng & vành vàng --- */
      ctx.strokeStyle = '#e8c56a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(238, 50, 26, 0.1 * Math.PI, 0.95 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath();
      ctx.moveTo(232, 30);
      ctx.quadraticCurveTo(225, 48, 233, 60);
      ctx.lineTo(242, 55);
      ctx.quadraticCurveTo(237, 42, 241, 32);
      ctx.closePath();
      ctx.fill();

      /* --- Băng đạn tinh thể --- */
      g = ctx.createLinearGradient(0, 36, 0, 110);
      g.addColorStop(0, '#d76ab0');
      g.addColorStop(1, '#6a1c54');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(280, 36);
      ctx.quadraticCurveTo(296, 74, 272, 108);
      ctx.lineTo(238, 96);
      ctx.quadraticCurveTo(256, 66, 258, 36);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e8c56a';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Ô cửa sổ năng lượng trên băng đạn
      ctx.save();
      ctx.shadowColor = '#7fe8ff';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(140,230,255,0.85)';
      ctx.fillRect(252, 58, 22, 30);
      ctx.restore();

      /* --- Nòng súng quấn lụa vàng-hồng --- */
      const bw = 8;
      g = ctx.createLinearGradient(0, -bw, 0, bw);
      g.addColorStop(0, '#ffd6ee');
      g.addColorStop(0.5, '#d76ab0');
      g.addColorStop(1, '#8e2a6e');
      ctx.fillStyle = g;
      ctx.fillRect(336, -bw, 250, bw * 2);
      // Vòng quấn vàng xen kẽ
      ctx.fillStyle = '#e8c56a';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(352 + i * 40, -bw - 1, 10, bw * 2 + 2);
      }

      /* --- Giảm thanh nón tiên --- */
      g = ctx.createLinearGradient(0, -14, 0, 14);
      g.addColorStop(0, '#f0a0d0');
      g.addColorStop(0.5, '#b03a86');
      g.addColorStop(1, '#5a1a48');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(586, -15);
      ctx.lineTo(700, -10);
      ctx.lineTo(700, 10);
      ctx.lineTo(586, 15);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e8c56a';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Vòng vàng
      ctx.fillStyle = '#e8c56a';
      ctx.fillRect(600, -14, 6, 28);
      ctx.fillRect(640, -13, 6, 26);
      ctx.fillRect(678, -11, 6, 22);
      // Khe thoát tinh thể phát sáng
      ctx.save();
      ctx.shadowColor = '#7fe8ff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(140,230,255,0.9)';
      ctx.fillRect(618, -6, 12, 12);
      ctx.fillRect(656, -5, 12, 10);
      ctx.restore();
      // Chỏm đầu nòng
      ctx.fillStyle = '#f5dfa0';
      ctx.beginPath();
      ctx.arc(702, 0, 7, 0, TAU);
      ctx.fill();

      /* --- Ống ngắm hoàng gia --- */
      // Chân đỡ vàng
      ctx.fillStyle = '#e8c56a';
      ctx.fillRect(186, -52, 16, 14);
      ctx.fillRect(318, -52, 16, 14);
      // Thân ống tím
      g = ctx.createLinearGradient(0, -84, 0, -50);
      g.addColorStop(0, '#a04a88');
      g.addColorStop(0.5, '#6a2a58');
      g.addColorStop(1, '#33102a');
      ctx.fillStyle = g;
      ctx.fillRect(172, -84, 200, 32);
      ctx.strokeStyle = '#e8c56a';
      ctx.lineWidth = 2;
      ctx.strokeRect(172, -84, 200, 32);
      // Chuông kính trước + lens xanh phát sáng
      ctx.fillStyle = '#8e2a6e';
      ctx.beginPath();
      ctx.ellipse(388, -68, 28, 23, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#e8c56a';
      ctx.stroke();
      ctx.save();
      ctx.shadowColor = '#5ad0ff';
      ctx.shadowBlur = 22;
      g = ctx.createRadialGradient(390, -70, 2, 390, -70, 21);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, '#8ce4ff');
      g.addColorStop(1, 'rgba(40,120,220,0.35)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(390, -69, 22, 17, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      // Mắt kính sau
      ctx.fillStyle = '#6a2a58';
      ctx.beginPath();
      ctx.ellipse(160, -68, 15, 18, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#e8c56a';
      ctx.stroke();
      // Núm chỉnh vàng + hạt tinh thể
      ctx.fillStyle = '#e8c56a';
      ctx.fillRect(246, -97, 36, 15);
      ctx.beginPath();
      ctx.arc(264, -97, 9, Math.PI, 0);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = '#7fe8ff';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#aef2ff';
      ctx.beginPath();
      ctx.arc(264, -99, 4, 0, TAU);
      ctx.fill();
      ctx.restore();

      /* --- Chân chống kiểu vũ công --- */
      ctx.strokeStyle = '#d76ab0';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(430, 10);
      ctx.quadraticCurveTo(400, 60, 372, 96);
      ctx.moveTo(430, 10);
      ctx.quadraticCurveTo(462, 58, 492, 88);
      ctx.stroke();
      // Khớp vàng
      ctx.fillStyle = '#e8c56a';
      ctx.beginPath(); ctx.arc(430, 10, 6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(372, 96, 5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(492, 88, 5, 0, TAU); ctx.fill();

      /* --- Tay cầm (găng tím hồng) --- */
      this.drawGlove(ctx, 168, 62, 0.75, '#c05a9e', '#5a2450', '#7a3a6e');
      this.drawGlove(ctx, 452, 2, 1.05, '#c05a9e', '#5a2450', '#7a3a6e');

      /* --- Hạt lấp lánh bay quanh súng --- */
      const tw = this.swayT * 3;
      ctx.fillStyle = 'rgba(174,242,255,0.9)';
      for (let i = 0; i < 6; i++) {
        const a = tw + i * 1.05;
        const sxp = 200 + Math.cos(a) * 180;
        const syp = -30 + Math.sin(a * 1.3) * 60;
        const szz = 1.5 + Math.abs(Math.sin(a * 2)) * 2;
        ctx.globalAlpha = 0.4 + Math.abs(Math.sin(a)) * 0.6;
        ctx.beginPath();
        ctx.arc(sxp, syp, szz, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* --- Chớp sáng đầu nòng (hồng-tím) --- */
      if (kick > 0.8) {
        ctx.save();
        ctx.shadowColor = '#ff9ae0';
        ctx.shadowBlur = 20;
        ctx.fillStyle = `rgba(255,180,235,${(kick - 0.8) * 2.2})`;
        ctx.beginPath();
        ctx.arc(712, 0, 16, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  window.SniperGame = SniperGame;
})();
