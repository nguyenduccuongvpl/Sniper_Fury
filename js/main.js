/* ===== Sniper Fury — Điều phối UI, cửa hàng vũ khí & tiến trình ===== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const LEVELS = window.LEVELS;
  const WEAPONS = window.WEAPONS;

  /* ---------- Lưu tiến trình ---------- */
  const SAVE_KEY = 'sniper_fury_progress_v2';
  const Progress = {
    data: {
      unlocked: 1,
      stars: {}, best: {},
      owned: ['svd'],
      selected: 'barrett'
    },
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) this.data = Object.assign(this.data, JSON.parse(raw));
      } catch (e) { /* bỏ qua */ }
      // Admin: mở khoá mọi súng, mặc định Barrett
      if (window.ADMIN) {
        this.data.owned = Object.keys(WEAPONS);
        this.data.selected = this.data.selected || 'barrett';
      }
    },
    save() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* bỏ qua */ }
    },
    totalStars() {
      return Object.values(this.data.stars).reduce((a, b) => a + b, 0);
    },
    unlock(idx) {
      if (idx + 1 > this.data.unlocked && idx + 1 <= LEVELS.length) {
        this.data.unlocked = idx + 1;
        this.save();
      }
    },
    record(idx, score, stars) {
      const key = String(idx);
      if (!this.data.stars[key] || this.data.stars[key] < stars) this.data.stars[key] = stars;
      if (!this.data.best[key] || this.data.best[key] < score) this.data.best[key] = score;
      this.save();
    },
    buyWeapon(id) {
      const w = WEAPONS[id];
      if (!w || this.data.owned.includes(id)) return false;
      if (window.ADMIN || this.totalStars() >= w.price) {
        this.data.owned.push(id);
        this.data.selected = id;
        this.save();
        return true;
      }
      return false;
    },
    selectWeapon(id) {
      if (!this.data.owned.includes(id)) return false;
      this.data.selected = id;
      this.save();
      return true;
    }
  };
  Progress.load();

  /* ---------- Khởi tạo game ---------- */
  const game = new window.SniperGame($('gameCanvas'), {
    onHud: updateHud,
    onMessage: showMsg,
    onLevelEnd: handleLevelEnd,
    onPause: () => showScreen('pauseScreen'),
    onResume: () => showScreen(null),
  });
  game.setWeapon(Progress.data.selected);

  let currentLevel = 0;
  let lastResult = null;

  /* ---------- Quản lý màn hình ---------- */
  const SCREENS = ['menuScreen', 'levelScreen', 'howtoScreen', 'shopScreen', 'resultScreen', 'pauseScreen'];
  function showScreen(name) {
    SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== name));
    $('hud').classList.toggle('hidden', name !== null || game.state === 'idle');
  }

  /* Yêu cầu toàn màn hình + khóa hướng ngang (mobile) */
  function goLandscape() {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) { /* bỏ qua */ }
  }

  function startLevel(idx) {
    currentLevel = idx;
    goLandscape();
    game.setWeapon(Progress.data.selected);
    game.audio.init();
    game.audio.resume();
    showScreen(null);
    $('hud').classList.remove('hidden');
    game.startLevel(idx);
  }

  function backToMenu() {
    game.quitToMenu();
    updateTotalScore();
    showScreen('menuScreen');
  }

  /* ---------- HUD ---------- */
  function windText(w) {
    if (Math.abs(w) < 0.05) return 'Gió: —';
    const dir = w > 0 ? '→' : '←';
    return `Gió: ${dir} ${Math.round(Math.abs(w) * 10)}`;
  }

  function updateHud(h) {
    $('hudLevel').textContent = `MÀN ${h.level}`;
    $('hudTargets').textContent = `Mục tiêu: ${h.total - h.remaining}/${h.total}`;
    $('hudTime').textContent = `⏱ ${h.time}s`;
    $('hudWind').textContent = windText(h.wind);
    $('hudAmmo').textContent = `🔫 ${h.mag} / ${h.reserve}`;
    $('hudScore').textContent = `Điểm: ${h.score}`;
    $('hudWeapon').textContent = h.weaponName + (h.scoped ? ' 🔍' : '');
    $('breathFill').style.width = `${Math.round(h.breath * 100)}%`;
    $('reloadBar').classList.toggle('hidden', !h.reloading);
    if (h.reloading) $('reloadFill').style.width = `${Math.round(h.reloadPct * 100)}%`;
  }

  let msgTimer = null;
  function showMsg(text, duration) {
    const el = $('hudMessage');
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => el.classList.add('hidden'), duration || 1800);
  }

  /* ---------- Kết thúc màn ---------- */
  function handleLevelEnd(res) {
    lastResult = res;
    if (res.win) {
      Progress.unlock(res.levelIndex);
      Progress.record(res.levelIndex, res.score, res.stars);
      $('resultTitle').textContent = '✅ NHIỆM VỤ HOÀN THÀNH!';
      $('btnNext').style.display = res.levelIndex + 1 < LEVELS.length ? '' : 'none';
    } else {
      $('resultTitle').textContent = '❌ NHIỆM VỤ THẤT BẠI';
      $('btnNext').style.display = 'none';
    }
    $('resultStars').textContent = res.win ? '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars) : '';
    $('resultStats').innerHTML =
      `<p>Lý do: <b>${res.reason || 'Hạ gục toàn bộ mục tiêu'}</b></p>` +
      `<p>Hạ gục: <b>${res.kills}/${res.total}</b> — Độ chính xác: <b>${res.accuracy}%</b></p>` +
      `<p>Thời gian còn lại: <b>${res.timeLeft}s</b> — Điểm: <b>${res.score}</b></p>`;
    showScreen('resultScreen');
  }

  function updateTotalScore() {
    const total = Object.values(Progress.data.best).reduce((a, b) => a + b, 0);
    const stars = Progress.totalStars();
    $('totalScore').textContent =
      total > 0 ? `Tổng điểm tốt nhất: ${total} | Tổng sao: ${stars} ★` : '';
  }

  /* ---------- Lưới chọn màn ---------- */
  function buildLevelGrid() {
    const grid = $('levelGrid');
    grid.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const btn = document.createElement('button');
      btn.className = 'level-btn';
      const locked = i + 1 > Progress.data.unlocked;
      if (locked) btn.classList.add('locked');
      const stars = Progress.data.stars[String(i)] || 0;
      btn.innerHTML = locked
        ? `<span class="lvl-num">🔒</span><span class="lvl-stars">Khóa</span>`
        : `<span class="lvl-num">${i + 1}</span><span class="lvl-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
      btn.title = lv.name;
      if (!locked) btn.addEventListener('click', () => { game.audio.click(); startLevel(i); });
      grid.appendChild(btn);
    });
  }

  /* ---------- Cửa hàng vũ khí ---------- */
  function statBar(label, value) {
    const pct = Math.round(value * 100);
    return `<div class="stat-row"><span>${label}</span>
      <div class="stat-bar"><div class="stat-fill" style="width:${pct}%"></div></div></div>`;
  }

  function buildShop() {
    const grid = $('shopGrid');
    grid.innerHTML = '';
    $('shopStars').textContent = `Bạn đang có ${Progress.totalStars()} ★`;

    Object.values(WEAPONS).forEach(w => {
      const owned = Progress.data.owned.includes(w.id);
      const selected = Progress.data.selected === w.id;
      const card = document.createElement('div');
      card.className = 'weapon-card' + (selected ? ' selected' : '') + (owned ? '' : ' locked');

      let actionHtml;
      if (selected) actionHtml = `<button class="btn btn-small" disabled>✓ ĐANG DÙNG</button>`;
      else if (owned) actionHtml = `<button class="btn btn-small btn-primary" data-act="select" data-id="${w.id}">CHỌN</button>`;
      else actionHtml = `<button class="btn btn-small btn-primary" data-act="buy" data-id="${w.id}">
          MUA — ${w.price} ★</button>`;

      card.innerHTML = `
        ${window.ADMIN && w.adminOnly ? '<div class="admin-badge">👑 ADMIN</div>' : ''}
        <h3>${w.name}</h3>
        <p class="weapon-desc">${w.desc}</p>
        ${statBar('Zoom', Math.min(1, w.zoom / 6))}
        ${statBar('Ổn định', 1 - (w.sway - 0.4) / 1.2)}
        ${statBar('Chống gió', 1 - (w.windMul - 0.4) / 1.1)}
        ${statBar('Băng đạn', w.mag / 10)}
        <p class="weapon-price">${owned ? 'Đã sở hữu' : `Giá: ${w.price} ★`}</p>
        <div class="weapon-action">${actionHtml}</div>
      `;
      grid.appendChild(card);
    });

    grid.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        game.audio.click();
        const id = btn.dataset.id;
        if (btn.dataset.act === 'buy') {
          if (Progress.buyWeapon(id)) showMsg('Đã mua ' + WEAPONS[id].name + '!', 1500);
        } else {
          Progress.selectWeapon(id);
        }
        game.setWeapon(Progress.data.selected);
        buildShop();
      });
    });
  }

  /* ---------- Gắn sự kiện nút ---------- */
  $('btnStart').addEventListener('click', () => {
    game.audio.init(); game.audio.resume(); game.audio.click();
    startLevel(Math.min(Progress.data.unlocked - 1, LEVELS.length - 1));
  });
  $('btnLevels').addEventListener('click', () => { game.audio.click(); buildLevelGrid(); showScreen('levelScreen'); });
  $('btnHowTo').addEventListener('click', () => { game.audio.click(); showScreen('howtoScreen'); });
  $('btnShop').addEventListener('click', () => { game.audio.click(); buildShop(); showScreen('shopScreen'); });
  $('btnBackMenu').addEventListener('click', () => { game.audio.click(); backToMenu(); });
  $('btnBackMenu2').addEventListener('click', () => { game.audio.click(); backToMenu(); });
  $('btnBackMenu3').addEventListener('click', () => { game.audio.click(); backToMenu(); });

  $('btnRetry').addEventListener('click', () => { game.audio.click(); startLevel(lastResult.levelIndex); });
  $('btnNext').addEventListener('click', () => { game.audio.click(); startLevel(lastResult.levelIndex + 1); });
  $('btnMenu').addEventListener('click', () => { game.audio.click(); backToMenu(); });

  $('btnResume').addEventListener('click', () => { game.audio.click(); game.resume(); });
  $('btnRestart').addEventListener('click', () => { game.audio.click(); startLevel(currentLevel); });
  $('btnQuit').addEventListener('click', () => { game.audio.click(); backToMenu(); });

  /* ---------- Điều khiển mobile ---------- */
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) $('mobileControls').classList.remove('hidden');

  /* ---------- Gợi ý xoay ngang màn hình (mobile) ---------- */
  if (isTouch) {
    const st = document.createElement('style');
    st.textContent =
      '#rotateHint{position:fixed;inset:0;z-index:9999;background:#0a0f08;display:none;' +
      'flex-direction:column;align-items:center;justify-content:center;color:#cfe8b0;' +
      'font-family:"Segoe UI",Arial;text-align:center}' +
      '#rotateHint.show{display:flex}' +
      '.rot-icon{font-size:64px;margin-bottom:16px;animation:rotPulse 1.2s infinite}' +
      '@keyframes rotPulse{0%,100%{transform:rotate(0)}50%{transform:rotate(90deg)}}';
    document.head.appendChild(st);

    const rot = document.createElement('div');
    rot.id = 'rotateHint';
    rot.innerHTML = '<div class="rot-icon">📱</div>' +
      '<p>Xoay <b>NGANG</b> màn hình<br>để có trải nghiệm tốt nhất!</p>';
    document.body.appendChild(rot);

    const updRot = () =>
      rot.classList.toggle('show', matchMedia('(orientation: portrait)').matches);
    addEventListener('resize', updRot);
    addEventListener('orientationchange', () => setTimeout(updRot, 150));
    updRot();
  }
  $('mBtnScope').addEventListener('click', () => game.toggleScope());
  $('mBtnFire').addEventListener('click', () => game.fireButton());
  $('mBtnReload').addEventListener('click', () => game.reloadButton());
  const breathBtn = $('mBtnBreath');
  breathBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); game.setBreath(true); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
    breathBtn.addEventListener(ev, () => game.setBreath(false))
  );

  addEventListener('pointerdown', () => { game.audio.init(); game.audio.resume(); }, { once: true });

  updateTotalScore();
})();