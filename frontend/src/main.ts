import './style.css';
import { api, ApiError } from './api';
import { showEntry } from './entry';
import { showLobbyHud } from './lobbyHud';
import { attachLobbyInput } from './lobbyInput';
import { connectLounge } from './net/loungeSocket';
import { clearToken } from './storage';
import type { LoungeView } from './three/LoungeView';

const app = document.getElementById('app')!;
const stage = document.getElementById('stage')!;

function notice(title: string, body: string) {
  const main = document.createElement('main');
  main.className = 'notice';
  const h1 = document.createElement('h1');
  h1.textContent = title;
  const p = document.createElement('p');
  p.textContent = body;
  main.append(h1, p);
  app.replaceChildren(main);
}

async function createView(): Promise<LoungeView | null> {
  try {
    const { LoungeView } = await import('./three/LoungeView');
    return new LoungeView(stage);
  } catch {
    // WebGL을 못 쓰는 브라우저: 3D 없이 입장과 접속자 수만
    document.body.classList.add('no-3d');
    return null;
  }
}

async function boot() {
  const match = location.pathname.match(/^\/t\/([a-z0-9]+)\/?$/);
  if (!match) {
    notice('운빨 라운지', '팀 링크로 들어와 주세요. 링크는 단톡방 공지에 있어요.');
    return;
  }
  const slug = match[1];
  let team;
  try {
    team = await api.team(slug);
  } catch (e) {
    notice('들어갈 수 없어요', e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요.');
    return;
  }
  document.title = `${team.name} · 운빨 라운지`;

  const view = await createView();
  const me = await showEntry(app, team, {
    onPreview: (nickname, characterIndex) => view?.preview(nickname, characterIndex),
  });
  view?.enterLobby(me);

  let socket: ReturnType<typeof connectLounge> | null = null;
  const hud = showLobbyHud(app, team, me.playerId, {
    onChat: (text) => socket?.chat(text),
    onEmote: (emoji) => socket?.emote(emoji),
    onTransferHost: (id) => socket?.transferHost(id),
    onMoveMode: () => {},
  });

  socket = connectLounge(team.slug, me.token, {
    onPresence: (p) => {
      view?.setPresence(p.players, p.hostId);
      hud.setPresence(p.players, p.hostId);
    },
    onPositions: (list) => view?.setPositions(list),
    onEvent: (e) => {
      if (e.type === 'chat') view?.say(e.playerId, e.text, false);
      else if (e.type === 'emote') view?.say(e.playerId, e.text, true);
    },
    onState: (state) => {
      hud.setState(state);
      if (state === 'online') socket?.away(document.hidden);
      if (state === 'rejected') {
        clearToken(team.slug);
        setTimeout(() => location.reload(), 1500);
      }
    },
  });

  // 앱을 벗어나면 자리비움 (2단계 M3 결정)
  document.addEventListener('visibilitychange', () => socket?.away(document.hidden));

  if (view) attachLobbyInput(view, socket, () => hud.moveMode, () => hud.hideHint());
}

void boot();
