# 코드 서명 (Certum Open Source Code Signing)

윈도우 스마트 앱 컨트롤은 서명이 없는 프로그램을 막아요. 이 프로젝트는 Certum의 오픈소스 개발자용 인증서
**Open Source Code Signing in the Cloud**(클라우드, SimplySign)로 서명해요.

## 1. 인증서 받기 (처음 한 번, 이후 해마다)

1. (권장) 결제 전에 Certum 고객지원에 한국 거주 개인도 신청할 수 있는지 물어봐요.
2. https://shop.certum.eu/code-signing.html 에서 **Open Source Code Signing in the Cloud**를 사요.
3. Certum 계정의 "Data security products"에서 활성화하고, 서류를 올려요.
   - **본인 확인:** 자동 확인, 신분증 양면 사진, 공증 등 중 하나를 골라요. 이름은 신분증과 똑같이 적어요.
   - **주소 증명:** 본인 이름으로 된 최근 공과금 고지서
   - **프로젝트 주소:** `https://github.com/uuuufuuuuf/fox-pet` (본인 프로젝트인 게 보여야 해요)
4. 발급되면 아래를 설치해요.
   - 휴대폰: **SimplySign** 앱 (로그인 코드를 만들어요)
   - PC: **SimplySign Desktop** (인증서를 윈도우 인증서 저장소에 가상 카드로 연결해요)
   - 설치 방법은 Certum이 보내 주는 활성화 안내서를 따라요.

## 2. 빌드하고 서명하기 (배포할 때마다)

1. `package.json`의 `version`을 올려요. 예: `1.0.0` → `1.0.1`
2. SimplySign Desktop을 켜고, 휴대폰 SimplySign 앱의 코드로 로그인해요.
3. 이 폴더에서 실행해요.

   ```bash
   npm run release
   ```

   - 인증서("Open Source Developer")를 찾아서 빌드하고, SHA-256과 Certum 타임스탬프로 서명해요.
     앱 exe, dll, 제거 프로그램, 설치 파일이 모두 대상이에요.
   - 끝나면 모든 파일의 서명을 검사하고, 설치 파일 경로를 알려 줘요.
   - 인증서가 여러 개면 `npm run release -- -Thumbprint <지문>`으로 하나를 골라요.
4. GitHub에서 새 Release를 만들고 `dist\FoxPet-Setup-<버전>.exe`를 올려요. 태그는 `v<버전>`이에요.

## 알아 둘 점

- 인증서가 만료돼도, 만료 전에 타임스탬프와 함께 서명한 파일은 계속 유효해요.
- 유료로 파는 프로그램에 서명하면 Certum이 인증서를 폐기해요. 이 프로젝트는 무료 오픈소스예요.
- 새 인증서는 처음에 SmartScreen 평판이 쌓이지 않아서, 한동안 "PC 보호" 경고가 뜰 수 있어요. 서명이 있으면 스마트 앱 컨트롤은 통과해요.
