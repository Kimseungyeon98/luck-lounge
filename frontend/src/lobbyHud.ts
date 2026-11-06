import type { PlayerView, Team } from './api';
import type { ConnectionState } from './net/loungeSocket';

/** 대기실 위에 올라가는 정보 표시줄 */
export function showLobbyHud(root: HTMLElement, team: Team) {
  const count = document.createElement('span');
  const status = document.createElement('span');
  status.className = 'hud-status';
  status.setAttribute('role', 'status');
  const fallbackList = document.createElement('ul');
  fallbackList.className = 'fallback-list';
  fallbackList.hidden = true;

  const teamBox = document.createElement('div');
  teamBox.className = 'hud-team';
  const name = document.createElement('b');
  name.textContent = team.name;
  teamBox.append(name, count);

  const top = document.createElement('div');
  top.className = 'hud-top';
  top.append(teamBox, status);

  const hint = document.createElement('p');
  hint.className = 'hud-hint';
  hint.textContent = '시한폭탄 · 풍선 부스는 곧 열려요';

  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.append(top, fallbackList, hint);
  root.replaceChildren(hud);

  const labels: Record<ConnectionState, string> = {
    connecting: '연결 중…',
    online: '',
    reconnecting: '다시 연결하는 중…',
    rejected: '다시 입장해 주세요',
  };

  return {
    setPresence(players: PlayerView[]) {
      count.textContent = `접속 ${players.length}명`;
      fallbackList.replaceChildren(...players.map((p) => {
        const li = document.createElement('li');
        li.textContent = p.nickname;
        return li;
      }));
    },
    setState(state: ConnectionState) {
      status.textContent = labels[state];
      status.hidden = state === 'online';
    },
    /** 3D를 쓸 수 없는 브라우저: 접속자 이름만 목록으로 */
    showFallbackList() {
      fallbackList.hidden = false;
    },
  };
}
