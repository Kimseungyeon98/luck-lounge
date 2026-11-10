# 운빨 라운지

> 운으로 정하거나, 실력으로 겨루거나.

매일 아침 회사 동료들과 커피 내기를 하는 모바일 웹 게임입니다.
고정 주소에서 방 코드를 넣거나 새 방을 만들어 3D 사무실 라운지에 들어와 걸어다니다가, 게임 부스로 걸어가 투표하고, 오늘 쏠 사람을 정합니다.
라운지 왼쪽은 **복불복 존**(운), 오른쪽은 **경쟁 존**(실력)입니다.

- **사다리 타기** (복불복): 10초 안에 줄 하나를 고르면 사다리를 따라 내려가요. ☕ 칸에 닿은 사람이 당첨
- **시한폭탄 돌리기** (복불복): 폭탄을 1~5초 안에 넘기다가, 숨은 시간이 끝날 때 들고 있으면 당첨
- **풍선 불기** (복불복): 차례대로 펌프를 1~3번 누르다가, 풍선을 터뜨리면 당첨
- **10초 멈추기** (경쟁): 3초 뒤 사라지는 시계를 딱 10.00초에 멈추기. 가장 먼 사람이 당첨
- **탑 쌓기** (경쟁): 움직이는 블록을 눌러 쌓기. 가장 낮게 쌓은 사람이 당첨
- **과녁 멈추기** (경쟁): 좌우로 움직이는 바늘을 가운데에 3번 멈추기. 평균 거리가 가장 먼 사람이 당첨
- 경쟁 게임은 모두 동시에 각자 휴대폰에서 한 번만 하고, 꼴찌부터 당첨자 수만큼 커피. 부스 위에서 혼자 연습할 수 있고 최고 기록이 남습니다

## 진행 상황

| 단계 | 내용 | 상태 |
|---|---|---|
| M1 | 뼈대, 팀 링크, 닉네임 입장, 3D 메인 화면·대기실, 배포 구성 | 완료 |
| M2 | 대기실 캐릭터 이동(탭·조이스틱), 위치 동기화, 말풍선 채팅, 방장, 자리비움 | 완료 |
| M3 | 시한폭탄 돌리기 (서버 판정, 효과음·진동) | 완료 |
| M4 | 걸어서 투표, 당첨자 수, 연속 판, 결과 저장·요약 | 완료 |
| M5 | 풍선 불기, 통계 게시판(이번 달·지난달·전체) | 완료 |
| M6 | 캐릭터 v2 (그려 넣은 얼굴·상황별 표정·눈 깜빡임) | 완료 |
| M7 | 경쟁 존: 10초 멈추기, 탑 쌓기, 혼자 연습, 개인·팀 최고 기록 | 완료 |
| M8 | 사다리 타기·과녁 멈추기, 라운지 넓히기(부스 6개), 이동 1.25배, 투표 중 규칙 카드 | 완료 |
| M9 | 고정 주소 + 방 코드(6자리) 입장, 새 방 만들기(기기당 하루 3개), 최근 방 바로 입장 | 진행 중 |

## 구조

```
휴대폰 브라우저 (Three.js 3D + TypeScript)
   │  HTTPS / WebSocket(STOMP)
Caddy ── Spring Boot 4 (Java 25) ── PostgreSQL
```

- 서버 한 대, 팀마다 방 하나. 게임 상태는 메모리, 결과만 DB에 저장
- 프론트엔드는 빌드해서 jar 안의 정적 파일로 들어감 → 배포 파일은 jar 하나
- 운영: Railway 무료 요금제 (App Sleeping, 월 $1 크레딧 안에서 0원). Oracle Cloud Always Free VM 구성도 `deploy/`에 남아 있음

| 경로 | 내용 |
|---|---|
| `backend/` | Spring Boot. `team`, `player`, `lobby`(위치·말풍선·방장·투표·시한폭탄·풍선 불기·경쟁 게임), `record`(내기 기록·통계 `GET /api/teams/{t}/stats`·최고 기록 `GET /api/teams/{t}/bests`) 패키지 |
| `frontend/` | Three.js + Vite. 3D 라운지 위에 입장 카드(DOM)와 대기실 표시줄 |
| `deploy/` | Dockerfile, docker-compose, Caddyfile, 방 코드·백업 스크립트 |
| `Dockerfile` | Railway 배포용 이미지 (프론트 + 백엔드를 한 번에 빌드) |
| `docs/railway-setup.md` | Railway 무료 배포 안내 |
| `docs/oracle-setup.md` | Oracle 무료 VM 배포 안내 (대안) |

## 로컬에서 실행

필요한 것: JDK 25, Node 22, PostgreSQL (또는 Docker)

```bash
docker run -d --name ll-db -e POSTGRES_DB=lucklounge -e POSTGRES_USER=lucklounge -e POSTGRES_PASSWORD=lucklounge -p 5432:5432 postgres:17-alpine
```

```bash
./gradlew :backend:bootRun
```

`http://localhost:8080/` 을 열고 로그에 찍힌 `방 [우리 팀] 코드 XXXXXX` 의 코드를 넣거나 새 방을 만듭니다.
같은 와이파이의 휴대폰에서 보려면 `localhost` 대신 PC의 IP를 씁니다.

화면 코드를 고치면서 보려면 백엔드를 띄운 채로:

```bash
cd frontend && npm install && npm run dev
```

`http://localhost:5173/` 에서 저장할 때마다 바로 반영됩니다.

## 테스트

```bash
./gradlew build
```

테스트는 Testcontainers로 PostgreSQL을 띄웁니다. Docker 없이 이미 떠 있는 DB로 돌리려면:

```bash
LUCKLOUNGE_TEST_EXTERNAL_DB=true SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/lltest SPRING_DATASOURCE_USERNAME=lltest SPRING_DATASOURCE_PASSWORD=lltest ./gradlew build
```

## 배포

**Railway (지금 쓰는 방식):** `main`에 머지하면 Railway가 저장소의 `Dockerfile`로 직접 빌드해 배포합니다.
처음 한 번은 [docs/railway-setup.md](docs/railway-setup.md) 대로 준비해 주세요. 테스트는 GitHub Actions(CI)가 PR마다 돌립니다.

**Oracle VM (대안):** VM Secrets를 등록하면 GitHub Actions가 테스트 → 빌드 → VM 배포까지 합니다. [docs/oracle-setup.md](docs/oracle-setup.md) 참고.
