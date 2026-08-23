/* ===== Sniper Fury — Cấu hình & dữ liệu màn chơi ===== */
(function () {
  'use strict';

  const CONFIG = {
    WORLD_W: 2560,          // chiều rộng thế giới (px ảo)
    WORLD_H: 1440,          // chiều cao thế giới
    GROUND_Y: 1180,         // đường chân đất

    HEAD_R: 12,             // bán kính vùng đầu (headshot)
    BODY_W: 36,             // rộng vùng thân
    BODY_H: 80,             // cao vùng thân

    SCORE_BODY: 100,
    SCORE_HEAD: 250,
    SCORE_HOSTAGE_PENALTY: -500,

    RELOAD_TIME: 1.6,       // giây nạp đạn
    BREATH_MAX: 3.2,        // giây giữ hơi tối đa
    BREATH_REGEN: 1.4,      // tốc độ hồi hơi (x/s)
    SWAY_AMP: 9,            // biên độ lắc ngắm (px)
    WIND_OFFSET: 70,        // độ lệch đạn tối đa theo gió (px)

    STAR3_TIME: 0.5,        // còn >50% thời gian => 3 sao
    STAR2_TIME: 0.2,        // còn >20% thời gian => 2 sao
  };

  /* Giải thích trường:
     seed        : hạt tạo cảnh (nhà cửa) — cố định mỗi lần chơi
     time        : thời gian giới hạn (giây)
     magSize     : đạn trong băng
     reserve     : đạn dự trữ
     wind        : gió -1 (trái) .. 1 (phải)
     enemies     : số quân địch
     hostages    : số dân thường (KHÔNG được bắn)
     spawnEvery  : giây giữa các lần địch xuất hiện
     speed       : tốc độ di chuyển của địch (px/s)
     peekChance  : xác suất địch nấp/rình (0..1)
  */
  const LEVELS = [
    { name: 'Trại Huấn Luyện',   seed: 101, time: 90, magSize: 5, reserve: 20, wind: 0,     enemies: 3,  hostages: 0, spawnEvery: 3.0, speed: 0,   peekChance: 0 },
    { name: 'Trạm Kiểm Soát',    seed: 202, time: 85, magSize: 5, reserve: 20, wind: 0,     enemies: 4,  hostages: 0, spawnEvery: 2.8, speed: 20,  peekChance: 0.1 },
    { name: 'Khu Phố Cổ',        seed: 303, time: 80, magSize: 5, reserve: 18, wind: 0.15,  enemies: 5,  hostages: 0, spawnEvery: 2.6, speed: 35,  peekChance: 0.15 },
    { name: 'Bến Cargo',         seed: 404, time: 80, magSize: 5, reserve: 18, wind: 0.25,  enemies: 6,  hostages: 1, spawnEvery: 2.4, speed: 45,  peekChance: 0.2 },
    { name: 'Khu Công Nghiệp',   seed: 505, time: 75, magSize: 5, reserve: 16, wind: 0.35,  enemies: 7,  hostages: 1, spawnEvery: 2.2, speed: 55,  peekChance: 0.25 },
    { name: 'Thị Trấn Biên Giới',seed: 606, time: 75, magSize: 5, reserve: 16, wind: -0.4,  enemies: 8,  hostages: 2, spawnEvery: 2.0, speed: 65,  peekChance: 0.3 },
    { name: 'Nhà Máy Đêm',       seed: 707, time: 70, magSize: 5, reserve: 15, wind: -0.5,  enemies: 9,  hostages: 2, spawnEvery: 1.9, speed: 75,  peekChance: 0.35 },
    { name: 'Căn Cứ Sa Mạc',     seed: 808, time: 70, magSize: 4, reserve: 14, wind: 0.6,   enemies: 10, hostages: 2, spawnEvery: 1.8, speed: 85,  peekChance: 0.4 },
    { name: 'Thành Phố Bão Tố',  seed: 909, time: 65, magSize: 4, reserve: 13, wind: -0.75, enemies: 11, hostages: 3, spawnEvery: 1.6, speed: 95,  peekChance: 0.45 },
    { name: 'Pháo Đài Cuối',     seed: 999, time: 60, magSize: 4, reserve: 12, wind: 0.9,   enemies: 12, hostages: 3, spawnEvery: 1.5, speed: 110, peekChance: 0.5 },
  ];

  window.CONFIG = CONFIG;
  window.LEVELS = LEVELS;
})();