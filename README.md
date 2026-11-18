# mobile-gameswj

폰 브라우저에서 바로 플레이하는 웹(HTML5) 게임 모음입니다. 설치 없이 링크만 열면 됩니다.

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
