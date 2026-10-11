# 메이플로그 작업 방식

- 일반 수정은 현재 소스 파일에 반영한다. 로컬 웹 화면은 새로고침하고, 데스크톱 앱은 필요할 때 다시 실행한다.
- 로컬 바탕화면 바로가기는 이 프로젝트의 `node_modules/electron/dist/electron.exe`로 프로젝트 폴더를 실행한다. 개발 확인을 위해 설치 파일이나 `release/<version>` 폴더를 만들지 않는다.
- 사용자가 명시적으로 배포용 설치 파일 생성을 요청할 때만 빌드한다. 일반 수정마다 버전을 올리지 않는다. Git push를 요청한 경우에는 local-first-development 스킬의 버전 규칙을 따른다.
- 보스 목록을 수정하면 `npm run content:build`를 실행한다. 소스 실행에도 같은 목록을 사용한다.
- 기존 기록 보존을 위해 `%APPDATA%/Maplelog`, `maplelog://app/`, `maplelog.records.v1`, `com.maplelog.diary`를 유지한다. 정리 작업에서 사용자 기록 폴더를 삭제하지 않는다.
- 새 시스템의 데이터는 `window.MapleSystems` 공통 저장 API로 관리해 공통 백업에 포함한다. `docs/shared-backups.md`의 버전·복원 규칙을 따른다.
