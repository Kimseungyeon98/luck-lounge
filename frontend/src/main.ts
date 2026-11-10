import './style.css';
import { api, ApiError, type Team } from './api';
import { showEntry } from './entry';
import { showLobbyHud } from './lobbyHud';
import { attachLobbyInput } from './lobbyInput';
import { createBombHud } from './bombHud';
import { createMatchHud } from './matchHud';
import { createBalloonHud } from './balloonHud';
import { createStatsSheet } from './statsSheet';
import { createSkillHud } from './skillHud';
import { createLadderHud } from './ladderHud';
import { formatScore } from './skill/games';
import { closeSheet } from './sheets';
import { boothAt } from './three/lounge';
import { connectLounge } from './net/loungeSocket';
import { unlockAudio } from './sound';
import { clearToken, loadCurrentRoom, saveCurrentRoom, saveLastRoom } from './storage';
import { showHome } from './home';
import type { LoungeView } from './three/LoungeView';

const app = document.getElementById('app')!;
const stage = document.getElementById('stage')!;

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

/** 고정 주소(/) 하나로 들어온다. 주소에 방 정보가 없고, 방은 첫 화면에서 코드로 고른다 (M9) */
async function pickRoom(): Promise<Team> {
  // 예전 링크·잘못된 주소로 왔으면 주소만 첫 화면으로 정리 (서버도 /t/... 는 / 로 보낸다)
  if (location.pathname !== '/') history.replaceState(null, '', '/');
  // 같은 탭에서 새로고침: 들어가 있던 방으로 바로
  const current = loadCurrentRoom();
  let message = '';
  if (current) {
    try {
      return await api.team(current);
    } catch (e) {
      saveCurrentRoom(null);
      if (e instanceof ApiError && e.status === 404) message = e.message;
    }
  }
  return showHome(app, message);
}

async function boot() {
  const viewReady = createView();
  const team = await pickRoom();
  saveCurrentRoom(team.slug);
  saveLastRoom(team);
  document.title = `${team.name} · 운빨 라운지`;

  const view = await viewReady;
  const me = await showEntry(app, team, {
    onPreview: (nickname, characterIndex) => view?.preview(nickname, characterIndex),
    onPreviewArea: (area) => view?.setPreviewArea(area),
  });
  view?.enterLobby(me);

  // 효과음은 사용자가 화면을 누른 뒤부터 재생할 수 있다 (입장 버튼을 누른 지금이 그 순간)
  unlockAudio();
  document.addEventListener('pointerdown', unlockAudio);

  let socket: ReturnType<typeof connectLounge> | null = null;
  const names = new Map<string, string>([[me.playerId, me.nickname]]);
  const chars = new Map<string, number>([[me.playerId, me.characterIndex]]);
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
  const matchHud = createMatchHud(app, view, team.name, me.playerId, nameOf, hud.toast, () => statsSheet.open(), (id) => chars.get(id) ?? 0);
  const skillHud = createSkillHud(app, me.playerId, nameOf, {
    submit: (score, extra) => socket?.skillScore(score, extra),
    practice: (type, score, extra) => socket?.practice(type, score, extra),
  });
  hud.slot.append(skillHud.practiceButton);
  const ladderHud = createLadderHud(app, me.playerId, nameOf, (c) => socket?.pickLadder(c));

  socket = connectLounge(team.slug, me.token, {
    onPresence: (p) => {
      for (const m of p.players) {
        names.set(m.playerId, m.nickname);
        chars.set(m.playerId, m.characterIndex);
      }
      view?.setPresence(p.players, p.hostId);
      hud.setPresence(p.players, p.hostId);
    },
    onPositions: (list) => {
      view?.setPositions(list);
      // 경쟁 존 부스 위에 서 있으면 연습하기 버튼
      const mine = list.find((p) => p.id === me.playerId);
      if (mine) {
        const b = boothAt(mine.x, mine.z);
        skillHud.setBooth(b === 'STOP' || b === 'TOWER' || b === 'TARGET' ? b : null);
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
      if (m.type === 'roundEnd' && m.gameType === 'LADDER') ladderHud.roundEnd();
      else if (m.type === 'roundEnd' && m.gameType !== 'STOP' && m.gameType !== 'TOWER' && m.gameType !== 'TARGET') {
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
        ladderHud.finish();
        view?.bombFinish();
      }
    },
    onLadder: (l) => ladderHud.handle(l),
    onSkill: (k) => {
      if (k.type === 'start') skillHud.start(k);
      else if (k.type === 'progress') skillHud.progress(k);
      else if (k.type === 'result') {
        skillHud.result(k);
        const first = k.ranking?.[0];
        matchHud.setSkillTop(first && first.score != null && k.gameType ? { name: nameOf(first.player), score: formatScore(k.gameType, first.score) } : null);
      }
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
      else if (n.type === 'ladder-taken') ladderHud.taken();
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
