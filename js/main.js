/* ===== Sniper Fury — Điều phối UI & tiến trình ===== */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const LEVELS = window.LEVELS;

  /* ---------- Lưu tiến trình ---------- */
  const SAVE_KEY = 'sniper_fury_progress_v1';
  const Progress = {
    data: { unlocked: 1, stars: {}, best: {} },
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) this.data = Object.assign(this.data, JSON.parse(raw));
      } catch (e) { /* bỏ qua */ }
    },
    save() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* bỏ qua */ }
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

  let currentLevel = 0;
  let lastResult = null;

  /* ---------- Quản lý màn hình ---------- */
  const SCREENS = ['menuScreen', 'levelScreen', 'howtoScreen', 'resultScreen', 'pauseScreen'];
  function showScreen(name) {
    SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== name));
    $('hud').classList.toggle('hidden', name !== null || game.state === 'idle');
  }

  function startLevel(idx) {
    currentLevel = idx;
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
    const strength = Math.round(Math.abs(w) * 10);
    return `Gió: ${dir} ${strength}`;
  }

  function updateHud(h) {
    $('hudLevel').textContent = `MÀN ${h.level}`;
    $('hudTargets').textContent = `Mục tiêu: ${h.total - h.remaining}/${h.total}`;
    $('hudTime').textContent = `⏱ ${h.time}s`;
    $('hudWind').textContent = windText(h.wind);
    $('hudAmmo').textContent = `🔫 ${h.mag} / ${h.reserve}`;
    $('hudScore').textContent = `Điểm: ${h.score}`;
    $('breathFill').style.width = `${Math.round(h.breath * 100)}%`;
    $('reloadBar').classList.toggle('hidden', !h.reloading);
    if (h.reloading) $('reloadFill').style.width = `${Math.round(h.reloadPct * 100)}%`;
  }

  let msgTimer = null;
  function showMsg(text, duration) {
    const el = $('hudMessage');
    el.textContent = text;
    el.classList.remove('hidden');
    // Kích hoạt lại animation
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
    const totalStars = Object.values(Progress.data.stars).reduce((a, b) => a + b, 0);
    $('totalScore').textContent =
      total > 0 ? `Tổng điểm tốt nhất: ${total} ★ | Tổng sao: ${'★'.repeat(Math.min(totalStars, 30))}` : '';
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

  /* ---------- Gắn sự kiện nút ---------- */
  $('btnStart').addEventListener('click', () => {
    game.audio.init(); game.audio.resume(); game.audio.click();
    startLevel(Math.min(Progress.data.unlocked - 1, LEVELS.length - 1));
  });
  $('btnLevels').addEventListener('click', () => { game.audio.click(); buildLevelGrid(); showScreen('levelScreen'); });
  $('btnHowTo').addEventListener('click', () => { game.audio.click(); showScreen('howtoScreen'); });
  $('btnBackMenu').addEventListener('click', () => { game.audio.click(); backToMenu(); });
  $('btnBackMenu2').addEventListener('click', () => { game.audio.click(); backToMenu(); });

  $('btnRetry').addEventListener('click', () => { game.audio.click(); startLevel(lastResult.levelIndex); });
  $('btnNext').addEventListener('click', () => { game.audio.click(); startLevel(lastResult.levelIndex + 1); });
  $('btnMenu').addEventListener('click', () => { game.audio.click(); backToMenu(); });

  $('btnResume').addEventListener('click', () => { game.audio.click(); game.resume(); });
  $('btnRestart').addEventListener('click', () => { game.audio.click(); startLevel(currentLevel); });
  $('btnQuit').addEventListener('click', () => { game.audio.click(); backToMenu(); });

  // Mở khoá âm thanh khi người dùng tương tác lần đầu
  addEventListener('pointerdown', () => { game.audio.init(); game.audio.resume(); }, { once: true });

  updateTotalScore();
})();