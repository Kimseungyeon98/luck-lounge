import './style.css';
import { api, ApiError } from './api';
import { showEntry } from './entry';
import { showLobbyHud } from './lobbyHud';
import { attachLobbyInput } from './lobbyInput';
import { createBombHud } from './bombHud';
import { createMatchHud } from './matchHud';
import { connectLounge } from './net/loungeSocket';
import { unlockAudio } from './sound';
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

  // 효과음은 사용자가 화면을 누른 뒤부터 재생할 수 있다 (입장 버튼을 누른 지금이 그 순간)
  unlockAudio();
  document.addEventListener('pointerdown', unlockAudio);

  let socket: ReturnType<typeof connectLounge> | null = null;
  const names = new Map<string, string>([[me.playerId, me.nickname]]);
  const hud = showLobbyHud(app, team, me.playerId, {
    onChat: (text) => socket?.chat(text),
    onEmote: (emoji) => socket?.emote(emoji),
    onTransferHost: (id) => socket?.transferHost(id),
    onMoveMode: () => {},
    onStartMatch: (winners, practice) => socket?.startMatch(winners, practice),
  });
  const nameOf = (id: string) => names.get(id) ?? '누군가';
  const bombHud = createBombHud(app, me.playerId, nameOf, () => socket?.passBomb());
  const matchHud = createMatchHud(app, view, team.name, me.playerId, nameOf, hud.toast);

  socket = connectLounge(team.slug, me.token, {
    onPresence: (p) => {
      for (const m of p.players) names.set(m.playerId, m.nickname);
      view?.setPresence(p.players, p.hostId);
      hud.setPresence(p.players, p.hostId);
    },
    onPositions: (list) => view?.setPositions(list),
    onEvent: (e) => {
      if (e.type === 'chat') view?.say(e.playerId, e.text, false);
      else if (e.type === 'emote') view?.say(e.playerId, e.text, true);
    },
    onBomb: (b) => {
      if (b.type === 'start' && b.order && b.holder) {
        view?.bombStart(b.order, b.holder, b.centerX ?? 0, b.centerZ ?? 0);
        bombHud.start(b.order, b.holder);
      } else if (b.type === 'holder' && b.holder) {
        view?.bombHolder(b.holder);
        bombHud.holder(b.holder, b.auto ?? false);
      } else if (b.type === 'explode' && b.loser) {
        view?.bombExplode(b.loser);
        bombHud.explode(b.loser, b.heldMs ?? 0);
      } else if (b.type === 'finish') {
        view?.bombFinish();
        bombHud.finish();
        hud.setGameRunning(false);
      }
    },
    onMatch: (m) => {
      matchHud.handle(m, (running) => hud.setGameRunning(running));
      if (m.type === 'roundEnd') {
        bombHud.roundEnd(2800);
        window.setTimeout(() => view?.bombRoundEnd(), 300);
      }
      if (m.type === 'finish') {
        bombHud.finish();
        view?.bombFinish();
      }
    },
    onNotice: (n) => {
      if (n.type === 'too-early') bombHud.tooEarly();
      else hud.toast(n.message);
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
