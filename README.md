# Lenton iOS

Android 렌톤 v0.25.17 / versionCode 201을 기준으로 시작한 네이티브 iOS 포팅 프로젝트입니다.

## 현재 1차 포팅 범위

- Mastodon OAuth 로그인
- 홈 / 퍼블릭 타임라인 및 좌우 전환
- 게시물 작성 / 답글 / 멘션 대상 제외
- CW 상속 및 여러 게시물 타래 작성
- 프로필 / 팔로우 / 뮤트 / 차단 / 신고 / 링크 복사
- 서버 저장형 비밀 메모(private note)
- 리스트 조회 / 생성 / 삭제 / 리스트 타임라인
- DM(Conversations) 조회 및 답장
- 알림
- 다크모드 / 강조색
- 하단 탭 좌우 스와이프

## 로컬 빌드

1. macOS에 Xcode와 XcodeGen 설치
2. `cd ios && xcodegen generate`
3. `LentonIOS.xcodeproj`를 Xcode로 열기

GitHub Actions의 `iOS Simulator Build`는 서명 없이 시뮬레이터 빌드로 컴파일을 검증합니다.

## 실제 iPhone 설치

실기기/TestFlight용 Archive에는 Apple Developer Team, signing certificate, provisioning profile이 추가로 필요합니다.
