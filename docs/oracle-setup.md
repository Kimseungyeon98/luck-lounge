# Oracle Cloud 무료 서버 준비 (한 번만)

운빨 라운지를 **운영비 0원**으로 띄우기 위한 준비 과정입니다. 30~60분 정도 걸립니다.
끝나면 `main` 브랜치에 머지할 때마다 GitHub Actions가 자동으로 배포합니다.

> 무료 정책은 바뀔 수 있습니다. 2026년 11월 기준으로 Always Free의 Ampere A1은 계정당 2 OCPU · 12GB까지 무료입니다.
> 진행 전에 [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)에서 현재 한도를 확인해 주세요.

## 1. 가입

1. <https://www.oracle.com/cloud/free/> 에서 **Start for free**
2. **홈 리전(Home Region)을 `Japan Central (Osaka)`로 선택**
   - 나중에 바꿀 수 없습니다. Always Free VM은 홈 리전에서만 만들 수 있습니다.
   - 한국 리전(춘천·서울)은 가입할 때 열려 있지 않아 오사카로 정했습니다. 국내 리전보다 왕복 지연이 수십 ms 늘지만,
     서버가 0.1초마다 위치를 보내고 판정도 서버가 하므로 게임에는 영향이 거의 없습니다.
   - 서버 시간대는 리전과 상관없이 `deploy/docker-compose.yml`의 `TZ: Asia/Seoul`로 한국 시간을 씁니다.
3. 카드 등록은 본인 확인용입니다. Always Free 자원만 쓰면 청구되지 않습니다.
4. 계정 종류는 **Free Tier 그대로** 둡니다 (종량제로 바꾸지 않음).

## 2. VM 만들기

**Compute → Instances → Create instance**

| 항목 | 값 |
|---|---|
| Name | `luck-lounge` |
| Image | **Canonical Ubuntu 24.04** (aarch64) |
| Shape | **Ampere → VM.Standard.A1.Flex**, OCPU **1**, Memory **4 GB** |
| Networking | 기본 VCN 생성, **Assign a public IPv4 address** 체크 |
| SSH keys | **Generate a key pair for me** → 개인 키(`.key`) 다운로드해서 보관 |

- "Out of capacity" 오류가 나면 무료 서버 자리가 잠시 모자란 것입니다. 오사카는 Availability Domain이 하나뿐이라 바꿀 곳이 없으니,
  몇 시간 뒤나 다른 시간대(새벽 등)에 다시 시도하세요. **Fault domain**을 바꿔 보는 것도 방법입니다.
- 1 OCPU · 4GB로 만드는 이유: 앱이 메모리 1GB 이상을 항상 쓰도록 설정되어 있어서, 사용률이 20%를 넘겨 **유휴 회수(idle reclamation) 대상에서 빠집니다.**

### 공인 IP 고정

Instance 상세 → **Attached VNICs → IPv4 Addresses → Edit → Reserved public IP** 로 바꿔 둡니다.
VM을 재시작해도 주소가 바뀌지 않습니다 (예약 IP 1개는 무료).

## 3. 포트 열기 (80, 443)

**① Oracle 방화벽(Security List)**
Networking → VCN → 기본 Subnet → Default Security List → **Add Ingress Rules**

| Source CIDR | Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |
| `0.0.0.0/0` | UDP | `443` |

**② VM 안의 방화벽** — Oracle Ubuntu 이미지는 SSH 외 포트를 막아 둡니다. SSH로 접속해서:

```bash
ssh -i 받은키.key ubuntu@<공인IP>
```

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 4. Docker 설치

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo usermod -aG docker ubuntu
```

로그아웃 후 다시 SSH 접속하면 `sudo` 없이 `docker`를 쓸 수 있습니다.

## 5. 무료 도메인 (DuckDNS)

1. <https://www.duckdns.org> 에 GitHub 계정으로 로그인
2. 서브도메인 `lucklounge` 추가 (이미 있으면 `lucklounge2` 등) → **current ip** 에 VM 공인 IP 입력 → update ip
3. 공인 IP를 고정했으니 다시 바꿀 일은 없습니다.

## 6. 서버 설정 파일

```bash
sudo mkdir -p /opt/luck-lounge && sudo chown ubuntu:ubuntu /opt/luck-lounge
```

```bash
cat > /opt/luck-lounge/.env <<EOF2
DOMAIN=lucklounge.duckdns.org
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
DEFAULT_TEAM_NAME=우리 팀
EOF2
```

`DOMAIN`과 `DEFAULT_TEAM_NAME`은 실제 값으로 고쳐 주세요. DB 비밀번호는 위 명령이 무작위로 만듭니다.

## 7. 배포용 SSH 키와 GitHub Secrets

VM에서 배포 전용 키를 만듭니다.

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/deploy -C github-actions
```

```bash
cat ~/.ssh/deploy.pub >> ~/.ssh/authorized_keys
```

```bash
cat ~/.ssh/deploy
```

마지막 명령이 출력한 개인 키 전체(`-----BEGIN` ~ `END-----`)를 복사해서
GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret** 에 등록합니다.

| Name | Value |
|---|---|
| `VM_HOST` | VM 공인 IP |
| `VM_USER` | `ubuntu` |
| `VM_SSH_KEY` | 위에서 복사한 개인 키 |

> 비밀값은 대화창이나 이슈에 붙이지 마세요. GitHub Secrets에만 넣습니다.

## 8. 첫 배포와 팀 링크 확인

GitHub → **Actions → Deploy → Run workflow** (또는 `main`에 머지).
끝나면 로그 마지막에 팀 링크가 찍힙니다. 서버에서 직접 확인하려면:

```bash
/opt/luck-lounge/teams.sh
```

`우리 팀 https://lucklounge.duckdns.org/t/xxxxxxxx` 형태로 나옵니다. 이 링크를 단톡방 공지에 걸면 됩니다.

## 9. 매일 백업

```bash
crontab -e
```

아래 한 줄을 추가합니다. VM 시계는 UTC라서 `30 19`가 한국 시간 새벽 4시 30분입니다. 최근 14개만 남깁니다.

```
30 19 * * * /opt/luck-lounge/backup.sh >> /opt/luck-lounge/backups/backup.log 2>&1
```

## 문제가 생기면

| 증상 | 확인할 것 |
|---|---|
| 링크가 안 열림 | `docker compose -f /opt/luck-lounge/docker-compose.yml ps` 로 세 컨테이너가 모두 `running`인지, 3번 포트 설정 |
| HTTPS 인증서 오류 | DuckDNS IP가 VM 공인 IP와 같은지, `docker compose logs caddy` |
| 앱 오류 | `docker compose logs app --tail 200` |
| VM이 사라짐 | 유휴 회수 가능성. 메일함에서 Oracle 안내 확인, `docker stats`로 앱 메모리가 1GB 이상인지 확인 |
