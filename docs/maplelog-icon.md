# 메이플로그 아이콘

내장 imagegen 도구로 제작. 투명 PNG 원본은 `assets/maplelog-icon.png`, Windows 다중 해상도 아이콘은 `assets/maplelog-icon.ico`.
ICO에는 16, 24, 32, 48, 64, 128, 256px 이미지를 포함하며 Electron nativeImage로 변환했다.

Windows 작업 표시줄은 창을 표시하기 전에 `BrowserWindow.setAppDetails`로 `com.maplelog.diary`와 ICO 경로를 지정한다. 로컬 소스 실행에서도 메이플로그 아이콘을 사용하며, 작업 표시줄의 재실행 명령에는 Electron 실행 파일과 프로젝트 경로를 함께 넣는다.

로컬 실행 시 시작 메뉴의 `메이플로그.lnk`도 같은 앱 ID와 현재 소스 실행 경로로 갱신한다. 같은 앱 ID를 가진 예전 설치 바로가기가 삭제된 실행 파일을 가리키면 Windows가 작업 표시줄에 기본 아이콘을 표시할 수 있기 때문이다.

## 생성 프롬프트

Create ONE polished application icon for MAPLELOG, a Korean MapleStory-inspired boss diary and mesos earnings tracker. Asset: desktop Windows app icon, readable at 32px. A chunky orange-red maple leaf embossed on the front cover of a compact closed adventure journal, with one small cyan bookmark/tab suggesting recorded progress. Warm cream page edges, charcoal navy cover #26323b, bright maple orange #ff9a24 and yellow highlights, subtle cyan #39bfd2 accent matching a game auction UI. Charming crisp 2D game inventory icon, restrained pixel-art inspired geometry, bold clean silhouette, strong contrast, minimal details. Centered square composition, fills about 85 percent of canvas, complete icon visible. Transparent background outside the journal silhouette. No text, no letters, no numbers, no official logos, no mushroom character, no extra objects, no floor, no mockup, no watermark. Make this a distinctive coherent single emblem not a scene.
