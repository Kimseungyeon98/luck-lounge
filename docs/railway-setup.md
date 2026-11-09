# Railway 무료 배포 (한 번만)

운빨 라운지를 Railway 무료 요금제로 띄우는 과정입니다. 20~30분 정도 걸립니다.
끝나면 `main` 브랜치에 머지할 때마다 Railway가 자동으로 다시 배포합니다.

> 2026년 11월 기준 내용입니다. 가입하면 30일 체험($5 크레딧)을 주고, 그 뒤에는 **무료 요금제(매달 $1 크레딧)**로 바뀝니다.
> 무료 요금제는 서비스당 메모리 0.5GB · 저장공간 0.5GB까지이고, 서비스마다 **App Sleeping(자동 잠자기)**을 켜야 합니다.
> 진행 전에 <https://railway.com/pricing> 에서 현재 조건을 확인해 주세요. 화면의 메뉴 이름은 바뀌어 있을 수 있습니다.

## 어떻게 0원으로 버티나

Railway는 서버가 깨어 있는 시간만큼 크레딧을 씁니다. App Sleeping을 켜면 아무도 접속하지 않을 때 서버가 잠들고,
누가 팀 링크를 열면 다시 깨어납니다. 커피 내기는 하루에 잠깐만 쓰므로 한 달 사용료가 $1 안에 들어갈 것으로 봅니다.

- 잠든 뒤 첫 접속은 서버가 깨어나는 동안 10~30초 걸릴 수 있습니다. 그다음 사람부터는 바로 들어옵니다.
- 서버가 잠들면 대기실 상태(누가 어디 서 있는지)는 사라집니다. 내기 기록과 통계는 DB에 있어 그대로입니다.
- 크레딧을 다 쓰면 그달 남은 기간은 멈추고, 다음 달 크레딧이 들어오면 다시 켜집니다.

## 1. 가입

1. <https://railway.com> → **Login** → **GitHub로 로그인**
2. 처음이면 체험(Trial)으로 시작합니다. 결제 정보를 요구하면 무료 요금제 조건을 다시 확인한 뒤 진행해 주세요.

## 2. 앱 서비스 만들기

1. **New Project → Deploy from GitHub repo**
2. GitHub 권한 창이 뜨면 `Kimseungyeon98/luck-lounge` 저장소 접근을 허용
3. `luck-lounge` 저장소 선택 → Railway가 저장소 루트의 `Dockerfile`을 찾아 빌드를 시작합니다
   - 첫 빌드는 5~10분 걸립니다 (프론트엔드 + 백엔드를 함께 빌드).
   - DB를 아직 안 만들어서 첫 실행은 실패합니다. 3번까지 하면 다시 배포됩니다.

## 3. PostgreSQL 만들기

같은 프로젝트 화면에서 **+ Create (또는 New) → Database → PostgreSQL**.
`Postgres`라는 이름의 서비스가 생깁니다. 이름을 바꾸면 아래 변수의 `Postgres` 부분도 같이 바꿔 주세요.

## 4. 앱 환경 변수

앱 서비스(`luck-lounge`) → **Variables → Raw Editor** 에 아래를 붙여 넣고 저장합니다.
`${{ ... }}` 는 Railway가 다른 서비스의 값을 넣어 주는 문법이라 비밀번호를 직접 적을 필요가 없습니다.

```
DB_URL=jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
BASE_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
DEFAULT_TEAM_NAME=우리 팀
```

`DEFAULT_TEAM_NAME`은 실제 팀 이름으로 고쳐 주세요. 서버가 처음 뜰 때 이 이름으로 팀을 하나 만듭니다.

> 비밀값은 대화창이나 이슈에 붙이지 마세요. Railway Variables에만 둡니다.

## 5. 앱 서비스 설정

앱 서비스 → **Settings**

| 항목 | 값 |
|---|---|
| Networking → Public Networking | **Generate Domain** (포트를 물으면 `8080`) |
| Region | **Southeast Asia (Singapore)** — 한국에서 가장 가까움 |
| Replicas | **1** (대기실 상태를 서버 메모리에 두므로 2개 이상이면 사람들이 다른 대기실에 들어감) |
| Serverless / App Sleeping | **켜기** |

## 6. DB 서비스 설정

`Postgres` 서비스 → **Settings**

| 항목 | 값 |
|---|---|
| Region | 앱과 같은 **Southeast Asia (Singapore)** |
| Serverless / App Sleeping | **켜기** (무료 요금제 조건) |

앱은 아무도 없을 때 DB 연결을 1분 안에 모두 닫도록 설정되어 있어서, 앱과 DB가 함께 잠들 수 있습니다.

## 7. 팀 링크 확인

앱 서비스 → **Deployments → 가장 위 배포 → Deploy Logs** 에서 아래 줄을 찾습니다.

```
팀 링크 [우리 팀] https://luck-lounge-production-xxxx.up.railway.app/t/xxxxxxxx
```

이 링크를 단톡방 공지에 걸면 됩니다. 서버가 다시 시작할 때마다 같은 링크가 로그에 찍힙니다.

## 8. 첫 주에 확인할 것

| 확인 | 방법 |
|---|---|
| 잠들기 | 아무도 안 쓰고 15분쯤 지난 뒤 두 서비스가 `Sleeping`으로 바뀌는지 |
| 깨어나기 | 팀 링크를 열었을 때 30초 안에 대기실이 뜨는지 |
| 크레딧 | 프로젝트 → **Usage** 에서 하루 사용료. 하루 $0.03 아래면 한 달 $1 안에 들어감 |

## 문제가 생기면

| 증상 | 확인할 것 |
|---|---|
| 빌드 실패 | Build Logs 마지막 오류. `npm`이나 `gradlew` 단계면 로그를 그대로 알려 주세요 |
| `Connection refused` / DB 연결 오류 | 4번 변수 이름의 `Postgres`가 DB 서비스 이름과 같은지, DB가 같은 프로젝트에 있는지 |
| 링크가 안 열림 | 5번 Generate Domain을 했는지, 서비스 상태가 `Active`/`Sleeping`인지 |
| 서비스가 안 잠듦 | 접속해 둔 휴대폰 화면이 남아 있지 않은지(열린 화면은 연결을 유지함). 다 닫고 다시 기다려 보기 |
| 크레딧 초과로 멈춤 | Usage에서 어느 서비스가 많이 썼는지 확인. 다음 달에 다시 켜지며, 계속 모자라면 Oracle/Google Cloud로 옮기기 |
