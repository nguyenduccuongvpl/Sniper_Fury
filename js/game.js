/* ===== Sniper Fury — Engine game chính ===== */
(function () {
  'use strict';

  const C = window.CONFIG;
  const TAU = Math.PI * 2;

  /* RNG có hạt giống để cảnh vật giống nhau mỗi lần chơi */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  class SniperGame {
    constructor(canvas, hooks) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.hooks = hooks || {};
      this.audio = new window.SoundKit();

      this.state = 'idle'; // idle | playing | paused | ended
      this.mouse = { x: innerWidth / 2, y: innerHeight / 2 };
      this.keys = {};

      this.viewW = 0; this.viewH = 0;
      this.camX = 0; this.camY = 0;

      this.swayT = 0;
      this.shake = 0;
      this.flash = 0;
      this.tracers = [];
      this.particles = [];
      this.floatTexts = [];
      this.hitMarker = 0;

      this._resize = this.resize.bind(this);
      addEventListener('resize', this._resize);
      this.resize();
      this.bindInput();
      requestAnimationFrame((t) => this.loop(t));
    }

    /* ---------- Khung canvas ---------- */
    resize() {
      this.viewW = this.canvas.width = innerWidth;
      this.viewH = this.canvas.height = innerHeight;
    }

    bindInput() {
      addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
      addEventListener('mousedown', (e) => {
        if (e.button === 0 && this.state === 'playing') this.shoot();
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
    }

    /* ---------- Bắt đầu màn chơi ---------- */
    startLevel(levelIndex) {
      this.levelIndex = levelIndex;
      this.level = window.LEVELS[levelIndex];
      const L = this.level;

      this.timeLeft = L.time;
      this.score = 0;
      this.shotsFired = 0;
      this.shotsHit = 0;
      this.kills = 0;
      this.totalEnemies = L.enemies;

      this.mag = L.magSize;
      this.reserve = L.reserve;
      this.reloading = false;
      this.reloadT = 0;

      this.breath = C.BREATH_MAX;
      this.elapsed = 0;

      this.buildScene(L.seed);
      this.spawnEnemies(L);

      this.tracers.length = 0;
      this.particles.length = 0;
      this.floatTexts.length = 0;

      this.state = 'playing';
      this.showMsg('MÀN ' + (levelIndex + 1) + ': ' + L.name.toUpperCase());
    }

    /* ---------- Tạo cảnh vật từ seed ---------- */
    buildScene(seed) {
      const rng = mulberry32(seed);
      this.rng = rng;
      this.buildings = [];
      this.covers = [];

      let x = 60;
      while (x < C.WORLD_W - 160) {
        const w = 200 + rng() * 280;
        const h = 220 + rng() * 440;
        const b = { x, y: C.GROUND_Y - h, w, h, windows: [] };
        // Cửa sổ
        const cols = Math.floor(w / 70);
        const rows = Math.floor(h / 90);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (rng() > 0.25) {
              b.windows.push({
                x: x + 22 + c * 70,
                y: b.y + 26 + r * 90,
                lit: rng() > 0.6
              });
            }
          }
        }
        this.buildings.push(b);
        x += w + 50 + rng() * 140;
      }

      // Núi xa
      this.mountains = [];
      let mx = -100;
      while (mx < C.WORLD_W * 1.3) {
        const mw = 400 + rng() * 500;
        const mh = 250 + rng() * 320;
        this.mountains.push({ x: mx, w: mw, h: mh });
        mx += mw * 0.7;
      }

      // Mây
      this.clouds = [];
      for (let i = 0; i < 8; i++) {
        this.clouds.push({
          x: rng() * C.WORLD_W,
          y: 80 + rng() * 260,
          s: 0.7 + rng() * 1.3
        });
      }

      // Thùng che (cho địch nấp)
      for (let i = 0; i < 10; i++) {
        this.covers.push({
          x: 150 + rng() * (C.WORLD_W - 300),
          y: C.GROUND_Y,
          w: 70 + rng() * 50,
          h: 55 + rng() * 35
        });
      }
    }

    /* ---------- Sinh địch & dân thường ---------- */
    spawnEnemies(L) {
      const rng = mulberry32(L.seed * 7 + 13);
      this.enemies = [];
      const total = L.enemies + L.hostages;
      // Vị trí: nóc nhà / cửa sổ / mặt đất
      const spots = [];
      for (const b of this.buildings) {
        spots.push({ type: 'roof', x: b.x + 40 + rng() * (b.w - 80), y: b.y });
        if (rng() > 0.5) spots.push({ type: 'window', x: b.x + b.w / 2, y: b.y + 60 + rng() * (b.h - 120), b });
      }
      for (let i = 0; i < 14; i++) {
        spots.push({ type: 'ground', x: 140 + rng() * (C.WORLD_W - 280), y: C.GROUND_Y });
      }
      // Xáo trộn vị trí
      for (let i = spots.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [spots[i], spots[j]] = [spots[j], spots[i]];
      }

      // Chỉ số dân thường ở các vị trí cố định (dễ nhận biết), địch xen kẽ
      const hostageIdx = new Set();
      while (hostageIdx.size < L.hostages) {
        hostageIdx.add(Math.floor(rng() * total));
      }

      let enemyCount = 0;
      for (let i = 0; i < total; i++) {
        const spot = spots[i % spots.length];
        const isHostage = hostageIdx.has(i);
        const e = {
          id: i,
          isHostage,
          spawned: false,
          alive: true,
          spawnAt: 1.5 + i * L.spawnEvery + rng() * 0.8,
          fade: 0,
          x: clamp(spot.x, 80, C.WORLD_W - 80),
          baseY: spot.y,
          dir: rng() > 0.5 ? 1 : -1,
          phase: rng() * TAU,
          hitFlash: 0,
          peek: null
        };

        if (spot.type === 'window') {
          e.y = spot.y + 46; // đứng trong cửa sổ (chân tại đây)
          e.staticY = true;
        } else {
          e.y = spot.y;
          e.staticY = false;
        }

        if (!isHostage && L.speed > 0 && spot.type !== 'window' && !e.peek) {
          e.minX = clamp(e.x - 120 - rng() * 100, 60, C.WORLD_W - 60);
          e.maxX = clamp(e.x + 120 + rng() * 100, 60, C.WORLD_W - 60);
        } else {
          e.minX = e.maxX = e.x;
        }

        if (!isHostage && rng() < L.peekChance && spot.type !== 'window') {
          // Địch nấp sau thùng, thò lên định kỳ
          const cover = this.covers[Math.floor(rng() * this.covers.length)];
          e.peek = { cover, timer: rng() * 2, up: false };
          e.x = cover.x + cover.w / 2;
          e.y = C.GROUND_Y;
        }

        if (!isHostage) enemyCount++;
        this.enemies.push(e);
      }
    }

    /* ---------- Bắn ---------- */
    aimWorld() {
      // Tâm ống ngắm nằm giữa màn hình; camera theo chuột (ánh xạ tuyệt đối)
      const camX = (this.mouse.x / this.viewW) * (C.WORLD_W - this.viewW);
      const camY = (this.mouse.y / this.viewH) * (C.WORLD_H - this.viewH);
      this.camX = camX; this.camY = camY;
      return {
        x: camX + this.viewW / 2,
        y: camY + this.viewH / 2
      };
    }

    shoot() {
      if (this.reloading) return;
      if (this.mag <= 0) { this.audio.empty(); this.showMsg('HẾT ĐẠN — NHẤN R!', 900); return; }

      this.mag--;
      this.shotsFired++;
      this.audio.shot();
      this.shake = 16;
      this.flash = 0.12;

      const holdBreath = this.keys['Space'] || this.keys['ShiftLeft'] || this.keys['ShiftRight'];
      const sway = this.currentSway(holdBreath);
      const aim = this.aimWorld();
      // Đạn lệch theo gió + độ lắc
      const ix = aim.x + sway.x + this.level.wind * C.WIND_OFFSET;
      const iy = aim.y + sway.y;

      let hitEnemy = null, isHead = false;
      for (const e of this.enemies) {
        if (!e.alive || !e.spawned) continue;
        if (e.peek && !e.peek.up) continue; // đang nấp thì đạn không trúng
        const feetX = e.x, feetY = e.y;
        const headCY = feetY - (e.isHostage ? 84 : 82);
        const dxh = ix - feetX, dyh = iy - headCY;
        if (dxh * dxh + dyh * dyh <= C.HEAD_R * C.HEAD_R) {
          hitEnemy = e; isHead = true; break;
        }
        if (Math.abs(ix - feetX) <= C.BODY_W / 2 && iy >= feetY - C.BODY_H && iy <= feetY) {
          hitEnemy = e; isHead = false; break;
        }
      }

      this.tracers.push({ x1: this.camX + this.viewW / 2, y1: this.camY + this.viewH, x2: ix, y2: iy, t: 0 });

      if (hitEnemy) {
        this.shotsHit++;
        this.hitMarker = 0.25;
        if (hitEnemy.isHostage) {
          hitEnemy.alive = false;
          this.score += C.SCORE_HOSTAGE_PENALTY;
          this.audio.hitHostage();
          this.addParticles(ix, iy, '#ffffff', 18);
          this.addFloatText(hitEnemy.x, hitEnemy.y - 110, 'DÂN THƯỜNG! ' + C.SCORE_HOSTAGE_PENALTY, '#ff5252');
          this.endLevel(false, 'Bạn đã bắn nhầm dân thường!');
          return;
        } else {
          hitEnemy.alive = false;
          this.kills++;
          const pts = isHead ? C.SCORE_HEAD : C.SCORE_BODY;
          this.score += pts;
          if (isHead) { this.audio.hitHead(); this.addFloatText(hitEnemy.x, hitEnemy.y - 110, 'HEADSHOT! +' + pts, '#ffd54f'); }
          else { this.audio.hitBody(); this.addFloatText(hitEnemy.x, hitEnemy.y - 110, '+' + pts, '#ffffff'); }
          this.addParticles(ix, iy, '#c62828', 14);
        }
      } else {
        this.audio.dust();
        this.addParticles(clamp(ix, 0, C.WORLD_W), clamp(iy, 0, C.GROUND_Y), '#9e9e9e', 8);
      }

      // Hết đạn cả băng lẫn dự trữ mà chưa hạ hết địch => thua
      if (this.mag <= 0 && this.reserve <= 0 && this.kills < this.totalEnemies) {
        this.endLevel(false, 'Hết đạn trước khi hoàn thành nhiệm vụ!');
      }

      // Hết băng mà còn đạn dự trữ => tự động nạp
      if (this.mag <= 0 && this.reserve > 0) this.startReload();
    }

    startReload() {
      if (this.reloading || this.mag >= this.level.magSize || this.reserve <= 0) return;
      this.reloading = true;
      this.reloadT = 0;
      this.audio.reload();
    }

    currentSway(holdBreath) {
      const amp = holdBreath ? 1.2 : C.SWAY_AMP;
      return {
        x: Math.sin(this.swayT * 1.7) * amp + Math.sin(this.swayT * 0.6) * amp * 0.4,
        y: Math.cos(this.swayT * 1.3) * amp * 0.7
      };
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
      }, win ? 600 : 1200);
    }

    pause() { if (this.state === 'playing') { this.state = 'paused'; if (this.hooks.onPause) this.hooks.onPause(); } }
    resume() { if (this.state === 'paused') { this.state = 'playing'; if (this.hooks.onResume) this.hooks.onResume(); } }
    quitToMenu() { this.state = 'idle'; }

    showMsg(text, duration = 1800) {
      if (this.hooks.onMessage) this.hooks.onMessage(text, duration);
    }

    /* ---------- Hiệu ứng ---------- */
    addParticles(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = 40 + Math.random() * 160;
        this.particles.push({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          life: 0.5 + Math.random() * 0.4, t: 0,
          color, size: 2 + Math.random() * 3
        });
      }
    }

    addFloatText(x, y, text, color) {
      this.floatTexts.push({ x, y, text, color, t: 0 });
    }

    /* ---------- Vòng lặp chính ---------- */
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
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endLevel(false, 'Hết thời gian!');
        return;
      }

      // Nạp đạn
      if (this.reloading) {
        this.reloadT += dt;
        if (this.reloadT >= C.RELOAD_TIME) {
          this.reloading = false;
          const need = L.magSize - this.mag;
          const take = Math.min(need, this.reserve);
          this.mag += take;
          this.reserve -= take;
        }
      }

      // Hơi thở
      const holding = this.keys['Space'] || this.keys['ShiftLeft'] || this.keys['ShiftRight'];
      if (holding && this.breath > 0) this.breath = Math.max(0, this.breath - dt);
      else this.breath = Math.min(C.BREATH_MAX, this.breath + C.BREATH_REGEN * dt);

      // Cập nhật địch
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (!e.spawned) {
          if (this.elapsed >= e.spawnAt) { e.spawned = true; }
          continue;
        }
        e.fade = Math.min(1, e.fade + dt * 3);
        e.phase += dt;

        if (e.peek) {
          e.peek.timer -= dt;
          if (e.peek.up && e.peek.timer <= 0) { e.peek.up = false; e.peek.timer = 1.2 + Math.random() * 1.6; }
          else if (!e.peek.up && e.peek.timer <= 0) { e.peek.up = true; e.peek.timer = 1.4 + Math.random() * 1.4; }
        } else if (e.maxX > e.minX) {
          e.x += e.dir * L.speed * dt;
          if (e.x > e.maxX) { e.x = e.maxX; e.dir = -1; }
          if (e.x < e.minX) { e.x = e.minX; e.dir = 1; }
        }
      }

      // Hiệu ứng
      this.shake = Math.max(0, this.shake - dt * 60);
      this.flash = Math.max(0, this.flash - dt);
      this.hitMarker = Math.max(0, this.hitMarker - dt);
      for (const tr of this.tracers) tr.t += dt;
      this.tracers = this.tracers.filter(tr => tr.t < 0.12);
      for (const p of this.particles) {
        p.t += dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += 300 * dt;
      }
      this.particles = this.particles.filter(p => p.t < p.life);
      for (const f of this.floatTexts) f.t += dt;
      this.floatTexts = this.floatTexts.filter(f => f.t < 1.2);

      // Hoàn thành màn?
      const allSpawned = this.enemies.every(e => e.spawned || e.isHostage === false ? true : true);
      const remaining = this.enemies.filter(e => !e.isHostage && e.alive).length;
      const pendingSpawns = this.enemies.filter(e => !e.isHostage && !e.spawned).length;
      if (remaining === 0 && pendingSpawns === 0) {
        this.endLevel(true);
      }

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
          reloadPct: this.reloading ? this.reloadT / C.RELOAD_TIME : 0
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

      this.aimWorld(); // cập nhật camera

      ctx.save();
      // Rung màn hình khi bắn
      if (this.shake > 0) {
        ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      }
      ctx.translate(-this.camX, -this.camY);

      this.drawSky(ctx);
      this.drawMountains(ctx);
      this.drawBuildings(ctx);
      this.drawGround(ctx);
      this.drawCovers(ctx);
      this.drawEnemies(ctx);
      this.drawParticles(ctx);
      this.drawTracers(ctx);
      this.drawFloatTexts(ctx);

      ctx.restore();

      this.drawScope(ctx);
    }

    drawSky(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, C.GROUND_Y);
      g.addColorStop(0, '#2c3e50');
      g.addColorStop(0.55, '#c7823a');
      g.addColorStop(1, '#e8a95c');
      ctx.fillStyle = g;
      ctx.fillRect(this.camX - 10, this.camY - 10, this.viewW + 20, C.GROUND_Y - this.camY + 20);

      // Mặt trời
      ctx.fillStyle = 'rgba(255, 220, 150, 0.9)';
      ctx.beginPath();
      ctx.arc(C.WORLD_W * 0.72, 240, 85, 0, TAU);
      ctx.fill();

      // Mây
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (const cl of this.clouds) {
        ctx.beginPath();
        ctx.ellipse(cl.x, cl.y, 90 * cl.s, 26 * cl.s, 0, 0, TAU);
        ctx.ellipse(cl.x + 60 * cl.s, cl.y + 8 * cl.s, 65 * cl.s, 20 * cl.s, 0, 0, TAU);
        ctx.fill();
      }
    }

    drawMountains(ctx) {
      ctx.fillStyle = 'rgba(52, 62, 72, 0.75)';
      for (const m of this.mountains) {
        ctx.beginPath();
        ctx.moveTo(m.x, C.GROUND_Y);
        ctx.lineTo(m.x + m.w / 2, C.GROUND_Y - m.h);
        ctx.lineTo(m.x + m.w, C.GROUND_Y);
        ctx.closePath();
        ctx.fill();
      }
    }

    drawBuildings(ctx) {
      for (const b of this.buildings) {
        ctx.fillStyle = '#4a4440';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#3a3532';
        ctx.fillRect(b.x, b.y, b.w, 12);
        for (const wd of b.windows) {
          ctx.fillStyle = wd.lit ? '#ffd77a' : '#22201e';
          ctx.fillRect(wd.x, wd.y, 34, 46);
        }
      }
    }

    drawGround(ctx) {
      const g = ctx.createLinearGradient(0, C.GROUND_Y, 0, C.WORLD_H);
      g.addColorStop(0, '#5d5a3e');
      g.addColorStop(1, '#3c3a28');
      ctx.fillStyle = g;
      ctx.fillRect(this.camX - 10, C.GROUND_Y, this.viewW + 20, C.WORLD_H - C.GROUND_Y + 20);
    }

    drawCovers(ctx) {
      for (const cv of this.covers) {
        ctx.fillStyle = '#6d5836';
        ctx.fillRect(cv.x, cv.y - cv.h, cv.w, cv.h);
        ctx.strokeStyle = '#4a3c24';
        ctx.lineWidth = 3;
        ctx.strokeRect(cv.x, cv.y - cv.h, cv.w, cv.h);
        ctx.beginPath();
        ctx.moveTo(cv.x, cv.y - cv.h);
        ctx.lineTo(cv.x + cv.w, cv.y);
        ctx.stroke();
      }
    }

    drawEnemies(ctx) {
      for (const e of this.enemies) {
        if (!e.alive || !e.spawned || e.fade <= 0) continue;
        const hidden = e.peek && !e.peek.up;
        ctx.save();
        ctx.globalAlpha = hidden ? 0 : e.fade;

        const bob = e.maxX > e.minX ? Math.sin(e.phase * 8) * 2 : 0;
        const fx = e.x, fy = e.y + bob;

        if (e.isHostage) {
          // Dân thường: áo trắng, giơ 2 tay
          ctx.strokeStyle = '#e8d5b0'; // da
          ctx.lineWidth = 5;
          // Tay giơ lên
          ctx.beginPath();
          ctx.moveTo(fx - 10, fy - 66); ctx.lineTo(fx - 22, fy - 96);
          ctx.moveTo(fx + 10, fy - 66); ctx.lineTo(fx + 22, fy - 96);
          ctx.stroke();
          // Chân
          ctx.beginPath();
          ctx.moveTo(fx - 7, fy - 30); ctx.lineTo(fx - 8, fy);
          ctx.moveTo(fx + 7, fy - 30); ctx.lineTo(fx + 8, fy);
          ctx.stroke();
          // Thân áo trắng
          ctx.fillStyle = '#f5f5f5';
          ctx.fillRect(fx - 13, fy - 68, 26, 40);
          // Đầu
          ctx.fillStyle = '#e8c49a';
          ctx.beginPath();
          ctx.arc(fx, fy - 80, 11, 0, TAU);
          ctx.fill();
        } else {
          // Quân địch: bóng đen quân đội
          const bodyColor = '#23281f';
          // Súng ngang
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(fx - 4, fy - 58); ctx.lineTo(fx + 30 * e.dir, fy - 64);
          ctx.stroke();
          // Chân
          ctx.strokeStyle = bodyColor;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(fx - 6, fy - 32); ctx.lineTo(fx - 9, fy);
          ctx.moveTo(fx + 6, fy - 32); ctx.lineTo(fx + 9, fy);
          ctx.stroke();
          // Thân
          ctx.fillStyle = bodyColor;
          ctx.fillRect(fx - 13, fy - 70, 26, 42);
          // Đầu + mũ
          ctx.beginPath();
          ctx.arc(fx, fy - 81, 11, 0, TAU);
          ctx.fill();
          ctx.fillRect(fx - 13, fy - 92, 26, 6);
        }

        // Nhấp nháy đỏ khi vừa trúng đạn (không dùng vì chết ngay) — giữ chỗ
        ctx.restore();
      }
    }

    drawParticles(ctx) {
      for (const p of this.particles) {
        ctx.globalAlpha = 1 - p.t / p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    drawTracers(ctx) {
      for (const tr of this.tracers) {
        ctx.globalAlpha = 1 - tr.t / 0.12;
        ctx.strokeStyle = '#fffbe0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tr.x1, tr.y1);
        ctx.lineTo(tr.x2, tr.y2);
        ctx.stroke();
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

    /* ---------- Ống ngắm ---------- */
    drawScope(ctx) {
      const cx = this.viewW / 2, cy = this.viewH / 2;
      const R = Math.min(this.viewW, this.viewH) * 0.36;

      const holdBreath = (this.keys['Space'] || this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.breath > 0;
      const sway = this.currentSway(holdBreath);
      const sx = cx + sway.x, sy = cy + sway.y;

      // Nền đen ngoài ống ngắm
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.viewW, this.viewH);
      ctx.arc(cx, cy, R, 0, TAU, true);
      ctx.fillStyle = 'rgba(2, 4, 2, 0.985)';
      ctx.fill('evenodd');

      // Ánh sáng xanh nhẹ bên trong
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.clip();
      ctx.fillStyle = 'rgba(120, 180, 120, 0.04)';
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // Chữ thập
      ctx.strokeStyle = 'rgba(20, 30, 15, 0.9)';
      ctx.lineWidth = 1.5;
      const gap = 26, len = R;
      ctx.beginPath();
      ctx.moveTo(sx - len, sy); ctx.lineTo(sx - gap, sy);
      ctx.moveTo(sx + gap, sy); ctx.lineTo(sx + len, sy);
      ctx.moveTo(sx, sy - len); ctx.lineTo(sx, sy - gap);
      ctx.moveTo(sx, sy + gap); ctx.lineTo(sx, sy + len);
      ctx.stroke();

      // Mil-dots
      ctx.fillStyle = 'rgba(20, 30, 15, 0.9)';
      for (let i = 1; i <= 4; i++) {
        const d = gap + i * 34;
        [[sx - d, sy], [sx + d, sy], [sx, sy - d], [sx, sy + d]].forEach(([mx, my]) => {
          ctx.beginPath();
          ctx.arc(mx, my, 2, 0, TAU);
          ctx.fill();
        });
      }

      // Điểm ngắm trung tâm
      ctx.fillStyle = 'rgba(220, 40, 40, 0.95)';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, TAU);
      ctx.fill();

      // Hit marker
      if (this.hitMarker > 0) {
        ctx.strokeStyle = `rgba(255, 80, 80, ${this.hitMarker / 0.25})`;
        ctx.lineWidth = 3;
        const m = 14, mo = 7;
        ctx.beginPath();
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
          ctx.moveTo(sx + dx * mo, sy + dy * mo);
          ctx.lineTo(sx + dx * m, sy + dy * m);
        });
        ctx.stroke();
      }

      ctx.restore();

      // Viền ống ngắm
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, R - 9, 0, TAU);
      ctx.strokeStyle = 'rgba(90, 110, 80, 0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Chớp sáng khi bắn
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255, 245, 200, ${this.flash * 1.5})`;
        ctx.fillRect(0, 0, this.viewW, this.viewH);
      }
    }
  }

  window.SniperGame = SniperGame;
})();