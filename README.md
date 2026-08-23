# 🎯 Sniper Fury

Game xạ thủ bắn tỉa 2D viết bằng **HTML5 Canvas + JavaScript thuần** — không cần cài đặt, không cần build, chạy trực tiếp trên trình duyệt.

![Gameplay](https://img.shields.io/badge/genre-sniper%20shooter-green) ![Tech](https://img.shields.io/badge/tech-HTML5%20Canvas-blue)

## 🎮 Tính năng

- **10 màn chơi** từ dễ đến khó (Trại Huấn Luyện → Pháo Đài Cuối)
- Ống ngắm chân thực: chữ thập, mil-dots, độ lắc khi ngắm
- Cơ chế **giữ hơi** (Space/Shift) để ngắm ổn định
- **Gió** ảnh hưởng đường đạn (mạnh dần theo màn)
- Headshot (+250 điểm), bắn thân (+100 điểm)
- **Dân thường** — bắn nhầm là thất bại ngay!
- Địch di chuyển, nấp sau thùng rồi thò lên
- Hệ thống sao (1–3★), lưu tiến trình bằng localStorage
- Âm thanh tổng hợp bằng WebAudio (không cần file ngoài)

## 🕹️ Điều khiển

| Phím | Chức năng |
|------|-----------|
| Chuột | Ngắm bắn qua ống ngắm |
| Click trái | Bắn |
| `R` | Nạp đạn |
| `Space` / `Shift` | Giữ hơi (ngắm ổn định) |
| `Esc` / `P` | Tạm dừng |

## 🚀 Chạy game

Chỉ cần mở file `index.html` trong trình duyệt, hoặc:

```bash
npx serve .
```

## 📦 Triển khai (CI/CD)

Repo có sẵn GitHub Actions workflow (`.github/workflows/deploy.yml`) tự động deploy lên **GitHub Pages** mỗi khi push nhánh `main`.

Bật Pages tại: **Settings → Pages → Source: GitHub Actions**

Game sẽ sống tại: `https://nguyenduccuongvpl.github.io/Sniper_Fury/`

## 📁 Cấu trúc

```
Sniper_Fury/
├── index.html              # Khung game + UI overlay
├── css/style.css           # Giao diện HUD & menu
├── js/
│   ├── config.js           # Hằng số + dữ liệu 10 màn chơi
│   ├── audio.js            # Âm thanh WebAudio tổng hợp
│   ├── game.js             # Engine: render, AI địch, va chạm, ống ngắm
│   └── main.js             # Điều phối màn hình, HUD, lưu tiến trình
└── .github/workflows/deploy.yml  # CI/CD → GitHub Pages
```

## 🎬 Quay video YouTube

Lối chơi đơn giản, dễ hiểu người xem:
1. Mở màn 1, giới thiệu cơ chế ngắm – giữ hơi – bắn headshot
2. Chơi tăng dần độ khó, nhấn mạnh yếu tố gió và dân thường
3. Kết thúc bằng màn 10 "Pháo Đài Cuối"

Khuyến nghị quay ở 1920×1080, fullscreen (F11) để ống ngắm đẹp nhất.

## 📄 License

MIT