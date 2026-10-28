# 코드 서명 (SignPath Foundation, 무료)

윈도우 스마트 앱 컨트롤은 서명이 없는 프로그램을 막아요. 오픈소스 프로젝트는 SignPath Foundation에서 무료로 서명을 받을 수 있어요.
서명은 GitHub Actions(`.github/workflows/release.yml`)가 빌드할 때 자동으로 받아요.

## 1. GitHub에 공개 저장소 만들기

1. GitHub에서 **공개(Public)** 저장소를 새로 만들어요. 이름 예시는 `fox-pet`이에요.
   README나 라이선스는 추가하지 말고 빈 저장소로 만들어요. 이 폴더에 이미 들어 있어요.
2. 이 폴더(`pet`)를 그 저장소에 올려요.

## 2. SignPath Foundation에 신청하기

1. https://signpath.org 에서 오픈소스 프로젝트로 신청해요.
   - 저장소 주소, 라이선스(GPL-3.0), 프로젝트 설명이 필요해요.
   - 심사 기준에 맞아야 해요. 예를 들면 공개 저장소, OSI 라이선스, 빌드가 CI에서 이루어질 것, 악성 기능이 없을 것 같은 조건이에요.
   - 앱이 쓰는 파일(`C:\여유노` 숨김 폴더의 일기 포함)은 README에 적어 뒀어요. 심사할 때 그대로 설명하면 돼요.
2. 승인되면 SignPath에서 아래를 설정해요.
   - **프로젝트:** 슬러그 `fox-pet`, GitHub 저장소 연결 (Trusted Build System: GitHub.com)
   - **서명 정책:** 슬러그 `release-signing`
   - **아티팩트 설정 두 개:**
     - 슬러그 `app-files`: 내용은 `.signpath/app-files.xml`
     - 슬러그 `installer`: 내용은 `.signpath/installer.xml`
3. SignPath에서 API 토큰을 만들어요.

## 3. GitHub 저장소 설정

저장소 Settings → Secrets and variables → Actions:

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `SIGNPATH_API_TOKEN` | SignPath API 토큰 |
| Variable | `SIGNPATH_ORGANIZATION_ID` | SignPath 조직 ID |

## 4. 배포하기

`package.json`의 `version`을 올리고 `v1.0.1` 같은 태그를 푸시하면, Actions가 빌드하고 서명한 설치 파일을 Releases에 올려요.

```bash
git tag v1.0.0
git push origin v1.0.0
```

SignPath Foundation은 서명할 때마다 사람이 승인하는 경우가 있어요. 그럴 때는 서명이 끝날 때까지 Actions가 기다려요.
