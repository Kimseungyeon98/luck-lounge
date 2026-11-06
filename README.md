# 운빨 라운지

> 실력은 필요 없어요.

매일 아침 회사 동료들과 커피 내기를 하는 모바일 웹 게임입니다.
팀 링크로 들어와 3D 사무실 라운지를 걸어다니다가, 게임 부스로 걸어가 투표하고, 운으로 오늘 쏠 사람을 정합니다.

- **시한폭탄 돌리기**: 폭탄을 1~5초 안에 넘기다가, 숨은 시간이 끝날 때 들고 있으면 당첨
- **풍선 불기**: 차례대로 펌프를 1~3번 누르다가, 풍선을 터뜨리면 당첨

## 진행 상황

| 단계 | 내용 | 상태 |
|---|---|---|
| M1 | 뼈대, 팀 링크, 닉네임 입장, 3D 메인 화면·대기실, 배포 구성 | 완료 |
| M2 | 대기실 캐릭터 이동(탭·조이스틱), 위치 동기화, 말풍선 채팅, 방장, 자리비움 | 진행 중 |
| M3 | 시한폭탄 돌리기 | |
| M4 | 걸어서 투표, 연속 판, 결과 저장 | |
| M5 | 풍선 불기, 통계 | |
| M6 | 캐릭터·라운지 3D 모델 교체 (glTF) | |

## 구조

```
휴대폰 브라우저 (Three.js 3D + TypeScript)
   │  HTTPS / WebSocket(STOMP)
Caddy ── Spring Boot 4 (Java 25) ── PostgreSQL
```

- 서버 한 대, 팀마다 방 하나. 게임 상태는 메모리, 결과만 DB에 저장
- 프론트엔드는 빌드해서 jar 안의 정적 파일로 들어감 → 배포 파일은 jar 하나
- 운영: Oracle Cloud Always Free VM + Docker Compose + DuckDNS (운영비 0원)

| 경로 | 내용 |
|---|---|
| `backend/` | Spring Boot. `team`, `player`, `lobby`(위치 계산·말풍선·방장) 패키지 |
| `frontend/` | Three.js + Vite. 3D 라운지 위에 입장 카드(DOM)와 대기실 표시줄 |
| `deploy/` | Dockerfile, docker-compose, Caddyfile, 팀 링크·백업 스크립트 |
| `docs/oracle-setup.md` | 무료 서버 준비 안내 |

## 로컬에서 실행

필요한 것: JDK 25, Node 22, PostgreSQL (또는 Docker)

```bash
docker run -d --name ll-db -e POSTGRES_DB=lucklounge -e POSTGRES_USER=lucklounge -e POSTGRES_PASSWORD=lucklounge -p 5432:5432 postgres:17-alpine
```

```bash
./gradlew :backend:bootRun
```

로그에 `팀 링크 [우리 팀] http://localhost:8080/t/xxxxxxxx` 가 찍히면 그 주소를 엽니다.
같은 와이파이의 휴대폰에서 보려면 `localhost` 대신 PC의 IP를 씁니다.

화면 코드를 고치면서 보려면 백엔드를 띄운 채로:

```bash
cd frontend && npm install && npm run dev
```

`http://localhost:5173/t/xxxxxxxx` 에서 저장할 때마다 바로 반영됩니다.

## 테스트

```bash
./gradlew build
```

테스트는 Testcontainers로 PostgreSQL을 띄웁니다. Docker 없이 이미 떠 있는 DB로 돌리려면:

```bash
LUCKLOUNGE_TEST_EXTERNAL_DB=true SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/lltest SPRING_DATASOURCE_USERNAME=lltest SPRING_DATASOURCE_PASSWORD=lltest ./gradlew build
```

## 배포

`main`에 머지하면 GitHub Actions가 테스트 → 빌드 → Oracle VM 배포까지 합니다.
처음 한 번은 [docs/oracle-setup.md](docs/oracle-setup.md) 대로 서버를 준비해 주세요.
