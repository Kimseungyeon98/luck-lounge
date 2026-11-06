import type { Team } from './api';
import type { ConnectionState, Member } from './net/loungeSocket';
import { setSoundEnabled, soundEnabled } from './sound';

export type MoveMode = 'tap' | 'stick';

const MODE_KEY = 'luck-lounge:move-mode';
const EMOTES = ['👋', '😂', '🔥'];

export function loadMoveMode(): MoveMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'stick' ? 'stick' : 'tap';
  } catch {
    return 'tap';
  }
}

function saveMoveMode(m: MoveMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    // 저장이 안 되면 이번 접속에서만 적용
  }
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

export interface HudActions {
  onChat(text: string): void;
  onEmote(emoji: string): void;
  onTransferHost(playerId: string): void;
  onMoveMode(mode: MoveMode): void;
  onStartBomb(): void;
}

/** 대기실 위에 올라가는 표시줄: 팀 이름·인원, 설정, 방장 메뉴, 말풍선 입력, 이모티콘 */
export function showLobbyHud(root: HTMLElement, team: Team, myId: string, actions: HudActions) {
  let moveMode = loadMoveMode();
  let members: Member[] = [];

  const count = h('span');
  const status = h('span', { className: 'hud-status', role: 'status', hidden: true });
  const hostBtn = h('button', { type: 'button', className: 'icon-btn', ariaLabel: '방장 메뉴', hidden: true }, ['👑']);
  const settingsBtn = h('button', { type: 'button', className: 'icon-btn', ariaLabel: '설정' }, ['⚙️']);
  const toast = h('div', { className: 'hud-toast', role: 'status', hidden: true });

  const hint = h('p', { className: 'hud-hint' });
  const chatOpen = h('button', { type: 'button', className: 'pill wide' }, ['💬 말하기']);
  const emoteBtns = EMOTES.map((e) => {
    const b = h('button', { type: 'button', className: 'pill', ariaLabel: `${e} 보내기` }, [e]);
    b.addEventListener('click', () => actions.onEmote(e));
    return b;
  });
  const actionRow = h('div', { className: 'hud-actions' }, [chatOpen, ...emoteBtns]);

  const input = h('input', { type: 'text', id: 'chat-input', maxLength: 40, placeholder: '40자까지', enterKeyHint: 'send', autocomplete: 'off', ariaLabel: '말풍선 내용' });
  const counter = h('span', { className: 'chat-count' }, ['0/40']);
  const closeChat = h('button', { type: 'button', className: 'chat-x', ariaLabel: '닫기' }, ['✕']);
  const chatBar = h('form', { className: 'chatbar', hidden: true }, [closeChat, input, counter, h('button', { type: 'submit', className: 'chat-send' }, ['보내기'])]);

  // 설정
  const tapBtn = h('button', { type: 'button' }, ['탭 이동']);
  const stickBtn = h('button', { type: 'button' }, ['조이스틱']);
  const soundOn = h('button', { type: 'button' }, ['켜기']);
  const soundOff = h('button', { type: 'button' }, ['끄기']);
  const settings = h('div', { className: 'sheet', hidden: true, role: 'dialog', ariaLabel: '설정' }, [
    h('h2', {}, ['설정']),
    h('div', { className: 'sheet-row' }, [h('span', {}, ['이동 방식']), h('span', { className: 'seg' }, [tapBtn, stickBtn])]),
    h('div', { className: 'sheet-row' }, [h('span', {}, ['효과음']), h('span', { className: 'seg' }, [soundOn, soundOff])]),
    h('button', { type: 'button', className: 'sheet-close' }, ['닫기']),
  ]);

  // 방장 넘기기
  const memberList = h('div', { className: 'member-list' });
  const startBomb = h('button', { type: 'button', className: 'sheet-start' }, ['💣 시한폭탄 시작']);
  const hostSheet = h('div', { className: 'sheet', hidden: true, role: 'dialog', ariaLabel: '방장 메뉴' }, [
    h('h2', {}, ['방장 메뉴']),
    startBomb,
    h('p', { className: 'sheet-note' }, ['대기실에 있는 사람 모두가 참가해요. 자리비움인 사람은 빠져요.']),
    h('h2', {}, ['방장 넘기기']),
    h('p', { className: 'sheet-note' }, ['방장은 게임 고르기를 시작하고 당첨자 수를 정해요.']),
    memberList,
    h('button', { type: 'button', className: 'sheet-close' }, ['닫기']),
  ]);

  const teamBox = h('div', { className: 'hud-team' }, [h('b', {}, [team.name]), count]);
  const hud = h('div', { className: 'hud' }, [
    h('div', { className: 'hud-top' }, [teamBox, h('div', { className: 'hud-buttons' }, [status, hostBtn, settingsBtn])]),
    toast,
    h('div', { className: 'hud-bottom' }, [hint, actionRow, chatBar]),
    settings,
    hostSheet,
  ]);
  root.replaceChildren(hud);

  // ---------- 동작 ----------
  const setMode = (m: MoveMode) => {
    moveMode = m;
    tapBtn.setAttribute('aria-pressed', String(m === 'tap'));
    stickBtn.setAttribute('aria-pressed', String(m === 'stick'));
    hint.textContent = m === 'tap' ? '바닥을 누르면 그쪽으로 걸어가요' : '화면을 누른 채 끌면 그 방향으로 걸어요';
    hint.hidden = false;
    saveMoveMode(m);
    actions.onMoveMode(m);
  };
  const setSound = (v: boolean) => {
    setSoundEnabled(v);
    soundOn.setAttribute('aria-pressed', String(v));
    soundOff.setAttribute('aria-pressed', String(!v));
  };
  soundOn.addEventListener('click', () => setSound(true));
  soundOff.addEventListener('click', () => setSound(false));
  setSound(soundEnabled());
  startBomb.addEventListener('click', () => {
    hostSheet.hidden = true;
    actions.onStartBomb();
  });
  tapBtn.addEventListener('click', () => setMode('tap'));
  stickBtn.addEventListener('click', () => setMode('stick'));
  setMode(moveMode);

  settingsBtn.addEventListener('click', () => { settings.hidden = false; });
  for (const sheet of [settings, hostSheet]) {
    sheet.querySelector('.sheet-close')!.addEventListener('click', () => { sheet.hidden = true; });
  }

  hostBtn.addEventListener('click', () => {
    memberList.replaceChildren(...members.filter((m) => m.playerId !== myId).map((m) => {
      const b = h('button', { type: 'button' }, [m.nickname, h('span', {}, ['넘기기'])]);
      b.addEventListener('click', () => { actions.onTransferHost(m.playerId); hostSheet.hidden = true; });
      return b;
    }));
    if (memberList.childElementCount === 0) memberList.append(h('p', { className: 'sheet-note' }, ['넘겨받을 사람이 아직 없어요.']));
    hostSheet.hidden = false;
  });

  const closeChatBar = () => {
    chatBar.hidden = true;
    actionRow.hidden = false;
    input.value = '';
    counter.textContent = '0/40';
    input.blur();
  };
  chatOpen.addEventListener('click', () => {
    actionRow.hidden = true;
    chatBar.hidden = false;
    input.focus();
  });
  closeChat.addEventListener('click', closeChatBar);
  input.addEventListener('input', () => { counter.textContent = `${Array.from(input.value).length}/40`; });
  chatBar.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text) actions.onChat(text);
    closeChatBar();
  });

  let toastTimer = 0;
  const showToast = (text: string) => {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3000);
  };

  const labels: Record<ConnectionState, string> = {
    connecting: '연결 중…',
    online: '',
    reconnecting: '다시 연결하는 중…',
    rejected: '다시 입장해 주세요',
  };

  let hostId: string | null = null;
  return {
    get moveMode() {
      return moveMode;
    },
    setPresence(list: Member[], newHost: string | null) {
      members = list;
      count.textContent = `접속 ${list.length}명`;
      const onlineHost = list.some((m) => m.playerId === newHost) ? newHost : null;
      hostBtn.hidden = onlineHost !== myId;
      if (hostId !== null && onlineHost !== null && onlineHost !== hostId) {
        const who = list.find((m) => m.playerId === onlineHost);
        showToast(onlineHost === myId ? '내가 방장이 됐어요' : `${who?.nickname ?? '누군가'}님이 방장이 됐어요`);
      }
      if (onlineHost !== null) hostId = onlineHost;
    },
    setState(state: ConnectionState) {
      status.textContent = labels[state];
      status.hidden = state === 'online';
    },
    hideHint() {
      hint.hidden = true;
    },
    /** 게임 중에는 말하기·이모티콘·방장 메뉴를 숨긴다 */
    setGameRunning(running: boolean) {
      actionRow.hidden = running;
      chatBar.hidden = true;
      hint.hidden = running || hint.hidden;
      hostBtn.style.visibility = running ? 'hidden' : '';
    },
    toast: showToast,
  };
}
