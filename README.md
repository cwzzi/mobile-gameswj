# mobile-gameswj

폰 브라우저에서 바로 플레이하는 웹(HTML5) 게임 모음입니다. 설치 없이 링크만 열면 됩니다.

## 게임

| 게임 | 설명 |
|---|---|
| [개척왕](games/frontier/) | 탑다운 오픈월드에서 말을 타고 누비며 자원을 모으고, 마을을 세워 영토를 넓히는 게임. 산적과 싸우며 영토 1200칸 달성이 목표 |

## 구조

```
index.html        게임 목록 페이지
games/<게임이름>/  게임 하나당 폴더 하나 (index.html에서 시작)
shared/           여러 게임이 같이 쓰는 코드·이미지
```

## 플레이

GitHub Pages를 켜면 `https://<사용자>.github.io/mobile-gameswj/` 에서 열립니다.
(Settings → Pages → Branch: `main` / root)

## 새 게임 추가

1. `games/<게임이름>/index.html` 만들기
2. 루트 `index.html` 목록에 링크 추가
