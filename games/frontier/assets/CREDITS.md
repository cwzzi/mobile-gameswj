# 3D 모델 출처 (Credits)

이 폴더의 `.glb` 파일은 모두 **CC0 1.0 (퍼블릭 도메인)** 에셋을 게임용으로 줄이고(필요한 모델·애니메이션만 남김, 정점 양자화, 텍스처 256px) 한 파일로 묶은 것입니다.
CC0 이므로 출처 표기 의무는 없지만 감사의 뜻으로 밝혀 둡니다. CC0 법률 전문: `LICENSE-CC0.txt`.

| 파일 | 원본 | 저작자 | 라이선스 |
| --- | --- | --- | --- |
| `props.glb` | KayKit **Medieval Hexagon Pack 1.0** — 건물(집·시장·제재소·광산·망루·성·병영·주점·풍차·우물·밀밭), 성벽·울타리, 나무, 산, 바위, 소품(통·상자·자루·무기걸이·과녁·목재·석재·수레·깃발) | Kay Lousberg (www.kaylousberg.com) | CC0 1.0 |
| `knight.glb`, `knight_lo.glb`, `barbarian.glb`, `barbarian_lo.glb`, `rogue_lo.glb`, `villager_lo.glb` | KayKit **Character Pack: Adventurers 1.0** — Knight, Barbarian, Rogue_Hooded, Rogue (+ 무기/장신구, 애니메이션 13종: knight.glb 에만 포함, 같은 리그라 공유) | Kay Lousberg (www.kaylousberg.com) | CC0 1.0 |

원본 저장소 (라이선스 파일 확인함):

- https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 — `LICENSE.txt`: "License: (Creative Commons Zero, CC0) … free to use in personal, educational and commercial projects."
  - 경로: `addons/kaykit_medieval_hexagon_pack/Assets/gltf/{buildings,decoration}/…`
- https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 — `LICENSE.txt`: "License: (Creative Commons Zero, CC0)"
  - 경로: `addons/kaykit_character_pack_adventures/Characters/gltf/{Knight,Barbarian,Rogue,Rogue_Hooded}.glb`

`*_lo.glb` 는 같은 모델을 meshoptimizer 로 단순화한 군중용(전장 졸병·아군) 버전입니다.
게임 안의 색 바꾸기(진영색 갑옷·두건), 영주의 금관, 건물 조합(농장=밀밭+풍차, 채석장=바위+석재+수레, 성 단계별 구성)은 실행 중에 만들어집니다.

로더: `shared/three/GLTFLoader.js` — three.js r149 의 GLTFLoader + SkeletonUtils + BufferGeometryUtils 를 전역 `THREE` 에 붙도록 묶은 것 (MIT, three.js authors).

## 그래픽 업그레이드 에셋 (조명·후처리·질감)

| 파일 | 크기 | 출처 | 라이선스 |
| --- | --- | --- | --- |
| `anims_ranged.glb` | 132 KB | KayKit **Character Pack: Adventurers 1.0** 원본 `Knight.glb` 에서 원거리 클립 5개(`1H_Ranged_Aiming`, `1H_Ranged_Shoot`, `2H_Ranged_Aiming`, `2H_Ranged_Shoot`, `Throw`)만 뽑고 메시·텍스처·변화 없는 이동/크기 트랙을 뺀 것 (glTF-Transform, MIT). 궁수·석궁병·머스킷병·투석병의 조준/사격 자세에 쓴다 | Kay Lousberg, CC0 1.0 |
| `terrain_detail.jpg` | 151 KB | 이 게임용으로 코드(numpy, 주파수 대역 잡음 · 보로노이)로 새로 만든 512² 반복 질감. R = 풀, G = 모래 물결, B = 바위. 지면 셰이더가 밝기 변화 + 높이맵(→ 법선 요철)으로 쓴다 | 자체 제작, CC0 1.0 |
| `water_normal.jpg` | 72 KB | 같은 방식으로 만든 512² 반복 물결 노멀맵 (물 셰이더가 두 겹으로 흘려 씀) | 자체 제작, CC0 1.0 |

코드 참고 (모두 `post3d.js` / `world3d.js` 안에 새로 작성):

- ACES 톤매핑 근사식(`RRTAndODTFit`, 입출력 행렬): three.js r149 셰이더 청크와 같은 식 (MIT, three.js authors)
- FXAA: Timothy Lottes(NVIDIA)의 FXAA 콘솔판 알고리즘을 짧게 다시 쓴 것
- 블룸 블러: 듀얼 필터(Kawase) 다운/업샘플 — Marius Bjørge, "Bandwidth-Efficient Rendering" (SIGGRAPH 2015) 의 기법
