/* ===== Sniper Fury — Cấu hình, vũ khí & dữ liệu màn chơi ===== */
(function () {
  'use strict';

  /* Đặt true để mở khoá mọi súng (chế độ admin) */
  const ADMIN = true;

  const CONFIG = {
    WORLD_W: 3200,          // chiều rộng thế giới (px ảo)
    WORLD_H: 1600,          // chiều cao thế giới
    GROUND_Y: 1250,         // mặt đường

    HEAD_R: 13,             // bán kính vùng đầu (headshot)
    BODY_W: 38,             // rộng vùng thân
    BODY_H: 86,             // cao vùng thân

    SCORE_BODY: 100,
    SCORE_HEAD: 250,
    OFFICER_BODY: 300,
    OFFICER_HEAD: 500,
    HOSTAGE_PENALTY: -500,

    BREATH_MAX: 3.5,        // giây giữ hơi tối đa
    BREATH_REGEN: 1.2,      // tốc độ hồi hơi
    SWAY_AMP: 10,           // biên độ lắc ngắm gốc (px, nhân theo súng)
    WIND_OFFSET: 95,        // độ lệch đạn tối đa theo gió (px)

    BULLET_SPEED: 3400,     // px/s — tốc độ đường đạn hiệu ứng
    STAR3_TIME: 0.45,       // còn >45% thời gian => 3 sao
    STAR2_TIME: 0.15,       // còn >15% thời gian => 2 sao
  };

  /* ===== Kho vũ khí =====
     zoom    : độ phóng đại ống ngắm
     sway    : độ lắc khi ngắm (nhân SWAY_AMP)
     windMul : hệ số chịu gió (nhỏ = ít bị lệch)
     price   : giá mua bằng tổng số sao tích lũy
  */
  const WEAPONS = {
    svd: {
      id: 'svd', name: 'SVD Dragunov', price: 0,
      mag: 10, reload: 2.2, zoom: 3.0, sway: 1.3, windMul: 1.25,
      desc: 'Súng trường bắn tỉa Nga. Nhẹ, băng nhiều, dễ chơi.',
      color: '#7a4f2a', metal: '#3a3f44'
    },
    m200: {
      id: 'm200', name: 'M200 Intervention', price: 8,
      mag: 7, reload: 2.6, zoom: 5.0, sway: 0.9, windMul: 0.85,
      desc: 'Bắn tỉa tầm xa Mỹ. Ống ngắm mạnh, chính xác cao.',
      color: '#2e3338', metal: '#23272b'
    },
    awm: {
      id: 'awm', name: 'AWM', price: 15,
      mag: 5, reload: 2.8, zoom: 6.0, sway: 0.7, windMul: 0.7,
      desc: 'AWP Anh Quốc. Ngắm cực kỳ ổn định, sát thủ đầu xa.',
      color: '#3f4a33', metal: '#2a2f26'
    },
    barrett: {
      id: 'barrett', name: 'Barrett M82', price: 25, adminOnly: true,
      mag: 10, reload: 3.2, zoom: 4.5, sway: 0.5, windMul: 0.55,
      desc: 'Súng bắn tỉa hạng nặng .50 BMG. Ổn định nhất, ít chịu gió.',
      color: '#33383d', metal: '#22262a'
    },
  };

  /* ===== 10 màn chơi — khó dần =====
     theme      : day | dusk | night | storm
     enemies    : số quân địch
     hostages   : số dân thường (tổng)
     walkers    : trong số dân thường, bao nhiêu đang đi lại
     speed      : tốc độ đi tuần của địch (px/s)
     runnerCh   : xác suất địch chạy nhanh
     officers   : số sĩ quan (điểm thưởng cao)
     peekCh     : xác suất địch nấp sau công sự
     wind       : -1 (trái) .. 1 (phải)
  */
  const LEVELS = [
    { name: 'Trại Huấn Luyện',    seed: 101, theme: 'day',   time: 75, enemies: 5,  hostages: 0, walkers: 0, spawnEvery: 2.6, speed: 0,   runnerCh: 0,    officers: 0, peekCh: 0,    wind: 0 },
    { name: 'Trạm Kiểm Soát',     seed: 202, theme: 'day',   time: 72, enemies: 6,  hostages: 0, walkers: 0, spawnEvery: 2.4, speed: 30,  runnerCh: 0.15, officers: 0, peekCh: 0,    wind: 0.1 },
    { name: 'Khu Phố Cổ',         seed: 303, theme: 'day',   time: 70, enemies: 7,  hostages: 1, walkers: 0, spawnEvery: 2.2, speed: 45,  runnerCh: 0.2,  officers: 0, peekCh: 0.15, wind: 0.15 },
    { name: 'Bến Cargo',          seed: 404, theme: 'dusk',  time: 68, enemies: 8,  hostages: 1, walkers: 1, spawnEvery: 2.0, speed: 55,  runnerCh: 0.22, officers: 1, peekCh: 0.2,  wind: 0.25 },
    { name: 'Khu Công Nghiệp',    seed: 505, theme: 'dusk',  time: 65, enemies: 9,  hostages: 2, walkers: 1, spawnEvery: 1.9, speed: 65,  runnerCh: 0.25, officers: 1, peekCh: 0.22, wind: -0.3 },
    { name: 'Thị Trấn Biên Giới', seed: 606, theme: 'dusk',  time: 62, enemies: 10, hostages: 2, walkers: 1, spawnEvery: 1.8, speed: 75,  runnerCh: 0.28, officers: 1, peekCh: 0.25, wind: 0.35 },
    { name: 'Nhà Máy Đêm',        seed: 707, theme: 'night', time: 60, enemies: 11, hostages: 2, walkers: 1, spawnEvery: 1.7, speed: 85,  runnerCh: 0.3,  officers: 2, peekCh: 0.28, wind: -0.45 },
    { name: 'Căn Cứ Sa Mạc',      seed: 808, theme: 'night', time: 58, enemies: 12, hostages: 3, walkers: 2, spawnEvery: 1.6, speed: 95,  runnerCh: 0.32, officers: 2, peekCh: 0.3,  wind: 0.55 },
    { name: 'Thành Phố Bão Tố',   seed: 909, theme: 'storm', time: 55, enemies: 13, hostages: 3, walkers: 2, spawnEvery: 1.5, speed: 105, runnerCh: 0.35, officers: 2, peekCh: 0.33, wind: -0.7 },
    { name: 'Pháo Đài Cuối',      seed: 999, theme: 'storm', time: 52, enemies: 15, hostages: 4, walkers: 2, spawnEvery: 1.4, speed: 120, runnerCh: 0.4,  officers: 3, peekCh: 0.36, wind: 0.85 },
  ];

  window.ADMIN = ADMIN;
  window.CONFIG = CONFIG;
  window.WEAPONS = WEAPONS;
  window.LEVELS = LEVELS;
})();