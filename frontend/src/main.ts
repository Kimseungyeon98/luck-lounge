import './style.css';
import { api, ApiError } from './api';
import { showEntry } from './entry';
import { showLobbyHud } from './lobbyHud';
import { attachLobbyInput } from './lobbyInput';
import { createBombHud } from './bombHud';
import { createMatchHud } from './matchHud';
import { createBalloonHud } from './balloonHud';
import { createStatsSheet } from './statsSheet';
import { createSkillHud } from './skillHud';
import { closeSheet } from './sheets';
import { boothAt } from './three/lounge';
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
    onOpenStats: () => statsSheet.open(),
  });
  const nameOf = (id: string) => names.get(id) ?? '누군가';
  const bombHud = createBombHud(app, me.playerId, nameOf, () => socket?.passBomb());
  const statsSheet = createStatsSheet(app, team.slug, team.name, me.playerId);
  const balloonHud = createBalloonHud(app, me.playerId, nameOf, (n) => socket?.pump(n));
  const matchHud = createMatchHud(app, view, team.name, me.playerId, nameOf, hud.toast, () => statsSheet.open());
  const skillHud = createSkillHud(app, me.playerId, nameOf, {
    submit: (score, extra) => socket?.skillScore(score, extra),
    practice: (type, score, extra) => socket?.practice(type, score, extra),
  });
  hud.slot.append(skillHud.practiceButton);

  socket = connectLounge(team.slug, me.token, {
    onPresence: (p) => {
      for (const m of p.players) names.set(m.playerId, m.nickname);
      view?.setPresence(p.players, p.hostId);
      hud.setPresence(p.players, p.hostId);
    },
    onPositions: (list) => {
      view?.setPositions(list);
      // 경쟁 존 부스 위에 서 있으면 연습하기 버튼
      const mine = list.find((p) => p.id === me.playerId);
      if (mine) {
        const b = boothAt(mine.x, mine.z);
        skillHud.setBooth(b === 'STOP' || b === 'TOWER' ? b : null);
      }
    },
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
      if (m.type === 'vote') closeSheet();
      matchHud.handle(m, (running) => { hud.setGameRunning(running); skillHud.setRunning(running); });
      if (m.type === 'voteResult') skillHud.setWinnersTarget(m.winnersTarget ?? 1);
      if (m.type === 'roundEnd' && m.gameType !== 'STOP' && m.gameType !== 'TOWER') {
        if (m.gameType === 'BALLOON') {
          balloonHud.roundEnd(2800);
          window.setTimeout(() => view?.balloonRoundEnd(), 300);
        } else {
          bombHud.roundEnd(2800);
          window.setTimeout(() => view?.bombRoundEnd(), 300);
        }
      }
      if (m.type === 'finish') {
        bombHud.finish();
        balloonHud.finish();
        skillHud.finish();
        view?.bombFinish();
      }
    },
    onSkill: (k) => {
      if (k.type === 'start') skillHud.start(k);
      else if (k.type === 'progress') skillHud.progress(k);
      else if (k.type === 'result') skillHud.result(k);
    },
    onBalloon: (b) => {
      if (b.type === 'start' && b.order && b.turn) {
        view?.balloonStart(b.count ?? 0, b.centerX ?? 0, b.centerZ ?? 0, b.order);
        balloonHud.start(b.order, b.turn, b.count ?? 0, b.limitMin ?? 12, b.limitMax ?? 30, true);
      } else if (b.type === 'turn' && b.player) {
        balloonHud.turn(b.player);
      } else if (b.type === 'pump' && b.player) {
        view?.balloonPump(b.player, b.count ?? 0);
        balloonHud.pump(b.player, b.pumps ?? 1, b.count ?? 0, b.auto ?? false);
      } else if (b.type === 'pop' && b.loser) {
        view?.balloonPop(b.loser);
        balloonHud.pop(b.loser, b.count ?? 0, b.limit ?? 0);
      }
    },
    onNotice: (n) => {
      if (n.type === 'too-early') bombHud.tooEarly();
      else if (n.type === 'not-your-turn') balloonHud.notYourTurn();
      else if (n.type === 'practice') skillHud.practiceResult(n);
      else if (n.message) hud.toast(n.message);
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

  if (view) attachLobbyInput(view, socket, () => hud.moveMode, () => hud.hideHint(), () => statsSheet.open());
}

void boot();
