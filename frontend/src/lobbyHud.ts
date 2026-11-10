import type { Team } from './api';
import { copyText, inviteText } from './home';
import { saveCurrentRoom } from './storage';
import type { ConnectionState, Member } from './net/loungeSocket';
import { setSoundEnabled, soundEnabled } from './sound';
import { closeSheet, openSheet } from './sheets';

export type MoveMode = 'tap' | 'stick';

// 기본은 조이스틱 (UX 개선 1단계 결정). 예전 키에는 자동으로 '탭'이 저장돼 있어 새 키를 쓴다
const MODE_KEY = 'luck-lounge:move-mode-v2';
const EMOTES = ['👋', '😂', '🔥'];

export function loadMoveMode(): MoveMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'tap' ? 'tap' : 'stick';
  } catch {
    return 'stick';
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
  onStartMatch(winnersTarget: number, practice: boolean): void;
  onOpenStats(): void;
}

/** 대기실 위에 올라가는 표시줄: 팀 이름·인원, 방장·통계·도움말·설정, 상태줄, 게임 시작, 말풍선 입력, 이모티콘 */
export function showLobbyHud(root: HTMLElement, team: Team, myId: string, actions: HudActions) {
  let moveMode = loadMoveMode();
  let members: Member[] = [];
  let hostId: string | null = null;
  let running = false;

  // ---------- 위쪽: 팀·인원(누르면 명단), 글자가 붙은 아이콘 버튼 ----------
  const count = h('span');
  const labeled = (icon: string, label: string) => h('button', { type: 'button', className: 'label-btn' }, [h('span', { ariaHidden: 'true' }, [icon]), label]);
  const hostBtn = labeled('👑', '방장');
  hostBtn.hidden = true;
  const statsBtn = labeled('📊', '통계');
  const helpBtn = labeled('❔', '도움말');
  const settingsBtn = labeled('⚙️', '설정');
  statsBtn.addEventListener('click', () => actions.onOpenStats());
  const toast = h('div', { className: 'hud-toast', role: 'status', hidden: true });
  const conn = h('div', { className: 'conn-banner', role: 'status', hidden: true });

  // ---------- 아래쪽: 안내, 상태줄, 게임 시작(방장), 말하기·이모티콘 ----------
  const hint = h('p', { className: 'hud-hint' });
  const status = h('p', { className: 'hud-status', role: 'status' });
  const slot = h('div', { className: 'hud-slot' });
  const startBtn = h('button', { type: 'button', className: 'start-btn', hidden: true }, ['🎲 게임 시작']);
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

  // 게임 시작 창: 당첨자 수, 연습판, 시작
  let winnersTarget = 1;
  const winnersOut = h('b', { className: 'stepper-value', ariaLive: 'polite' }, ['1']);
  const minus = h('button', { type: 'button', ariaLabel: '당첨자 줄이기' }, ['−']);
  const plus = h('button', { type: 'button', ariaLabel: '당첨자 늘리기' }, ['+']);
  const winnersNote = h('p', { className: 'sheet-note' });
  const startReason = h('p', { className: 'sheet-warn', hidden: true }, ['2명 이상 모여야 시작할 수 있어요. 자리비움인 사람은 세지 않아요.']);
  const practice = h('input', { type: 'checkbox', id: 'practice' });
  const startMatch = h('button', { type: 'button', className: 'sheet-start' }, ['10초 투표 시작']);
  const startSheet = h('div', { className: 'sheet', hidden: true, role: 'dialog', ariaLabel: '게임 시작' }, [
    h('h2', {}, ['게임 시작']),
    h('div', { className: 'sheet-row' }, [h('span', {}, ['오늘 당첨자 수']), h('span', { className: 'stepper' }, [minus, winnersOut, plus])]),
    winnersNote,
    h('label', { className: 'check', htmlFor: 'practice' }, [practice, '연습판 (통계에서 빼요)']),
    startReason,
    startMatch,
    h('p', { className: 'sheet-note' }, ['시작하면 모두 10초 동안 원하는 부스로 걸어가요. 부스 밖이면 투표만 기권이고 게임엔 참가해요.']),
    h('button', { type: 'button', className: 'sheet-close' }, ['닫기']),
  ]);

  // 방장 메뉴: 게임 시작, 방장 넘기기
  const memberList = h('div', { className: 'member-list' });
  const hostStart = h('button', { type: 'button', className: 'sheet-start' }, ['🎲 게임 시작']);
  const hostSheet = h('div', { className: 'sheet', hidden: true, role: 'dialog', ariaLabel: '방장 메뉴' }, [
    h('h2', {}, ['방장 메뉴']),
    hostStart,
    h('h2', {}, ['방장 넘기기']),
    h('p', { className: 'sheet-note' }, ['방장은 게임을 시작하고 당첨자 수를 정해요.']),
    memberList,
    h('button', { type: 'button', className: 'sheet-close' }, ['닫기']),
  ]);

  // 지금 라운지에 있는 사람
  const peopleList = h('ul', { className: 'people-list' });
  // 방 코드: 고정 주소에서 이 코드를 넣으면 들어온다 (M9)
  const copyStatus = h('p', { className: 'copy-status', role: 'status' });
  const copyCode = h('button', { type: 'button', className: 'secondary' }, ['코드 복사']);
  const copyInvite = h('button', { type: 'button', className: 'secondary' }, ['초대 문구 복사']);
  const leaveRoom = h('button', { type: 'button', className: 'link' }, ['다른 방으로 가기']);
  copyCode.addEventListener('click', async () => { copyStatus.textContent = (await copyText(team.code)) ? '방 코드를 복사했어요' : `복사가 안 돼요. ${team.code} 를 직접 알려 주세요`; });
  copyInvite.addEventListener('click', async () => { copyStatus.textContent = (await copyText(inviteText(team))) ? '초대 문구를 복사했어요. 단톡방에 붙여 주세요' : '복사가 안 돼요. 코드를 직접 알려 주세요'; });
  leaveRoom.addEventListener('click', () => { saveCurrentRoom(null); location.reload(); });
  const peopleSheet = h('div', { className: 'sheet', hidden: true, role: 'dialog', ariaLabel: '방 정보와 접속한 사람' }, [
    h('h2', {}, [`${team.name} · 방 코드 `, h('span', { className: 'room-code' }, [team.code])]),
    h('p', { className: 'sheet-note' }, [`${location.host} 에서 이 코드를 넣으면 들어와요.`]),
    h('div', { className: 'two-btns' }, [copyCode, copyInvite]),
    copyStatus,
    h('h2', {}, ['지금 라운지에 있는 사람']),
    peopleList,
    leaveRoom,
    h('button', { type: 'button', className: 'sheet-close' }, ['닫기']),
  ]);

  // 도움말: 존과 게임 4개
  const rule = (name: string, text: string) => h('p', {}, [h('b', {}, [name]), ` ${text}`]);
  const helpSheet = h('div', { className: 'sheet', hidden: true, role: 'dialog', ariaLabel: '도움말' }, [
    h('h2', {}, ['도움말']),
    h('div', { className: 'help-zone luck' }, [h('b', {}, ['복불복 존 · 운으로']),
      rule('사다리 타기', '10초 안에 줄 하나를 고르면 사다리를 따라 내려가요. ☕ 칸에 닿은 사람이 당첨'),
      rule('시한폭탄', '1~5초 안에 넘기다가, 터질 때 들고 있으면 당첨'),
      rule('풍선 불기', '차례대로 1~3번 펌프질, 풍선을 터뜨리면 당첨')]),
    h('div', { className: 'help-zone skill' }, [h('b', {}, ['경쟁 존 · 실력으로']),
      rule('10초 멈추기', '3초 뒤 사라지는 시계를 딱 10.00초에 멈추기. 가장 먼 사람이 당첨'),
      rule('탑 쌓기', '움직이는 블록을 눌러 쌓기. 가장 낮게 쌓은 사람이 당첨'),
      rule('과녁 멈추기', '좌우로 움직이는 바늘을 가운데에 3번 멈추기. 평균 거리가 가장 먼 사람이 당첨'),
      h('p', { className: 'sheet-note' }, ['경쟁 존 부스 위에 서면 혼자 연습할 수 있어요.'])]),
    h('p', { className: 'sheet-note' }, ['방장이 게임을 시작하면 10초 동안 하고 싶은 게임 부스 위에 서세요. 가장 많이 선 게임을 해요.']),
    h('button', { type: 'button', className: 'sheet-close guide-again' }, ['처음 안내 다시 보기']),
    h('button', { type: 'button', className: 'sheet-close' }, ['닫기']),
  ]);

  // 처음 온 사람 안내 3장 (한 번만)
  const guideN = h('span', { className: 'guide-n' });
  const guideT = h('h2', {});
  const guideD = h('p', {});
  const guideSkip = h('button', { type: 'button', className: 'guide-skip' }, ['건너뛰기']);
  const guideNext = h('button', { type: 'button', className: 'guide-next' }, ['다음']);
  const guide = h('div', { className: 'guide', hidden: true, role: 'dialog', ariaLabel: '처음 온 사람 안내', ariaModal: 'true' }, [
    h('div', { className: 'guide-card' }, [guideN, guideT, guideD, h('div', { className: 'guide-btns' }, [guideSkip, guideNext])]),
  ]);

  const teamBox = h('button', { type: 'button', className: 'hud-team', ariaLabel: '방 코드와 접속한 사람 보기' }, [h('b', {}, [team.name]), count]);
  const hud = h('div', { className: 'hud' }, [
    h('div', { className: 'hud-top' }, [teamBox, h('div', { className: 'hud-buttons' }, [hostBtn, statsBtn, helpBtn, settingsBtn])]),
    conn,
    toast,
    h('div', { className: 'hud-bottom' }, [hint, slot, status, startBtn, actionRow, chatBar]),
    settings,
    startSheet,
    hostSheet,
    peopleSheet,
    helpSheet,
    guide,
  ]);
  root.replaceChildren(hud);

  // ---------- 동작 ----------
  const setMode = (m: MoveMode, save = true) => {
    moveMode = m;
    tapBtn.setAttribute('aria-pressed', String(m === 'tap'));
    stickBtn.setAttribute('aria-pressed', String(m === 'stick'));
    hint.textContent = m === 'tap' ? '바닥을 누르면 그쪽으로 걸어가요' : '화면을 누른 채 끌면 그 방향으로 걸어요';
    hint.hidden = false;
    if (save) saveMoveMode(m);
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
  const eligibleCount = () => Math.max(1, members.filter((m) => !m.away).length);
  const renderWinners = () => {
    const n = eligibleCount();
    winnersTarget = Math.max(1, Math.min(winnersTarget, Math.max(1, n - 1)));
    winnersOut.textContent = String(winnersTarget);
    winnersNote.textContent = n >= 2
      ? `${n}명 중 ${winnersTarget}명 · 1명당 약 ${Math.round(n / winnersTarget)}잔. 당첨자를 빼고 남은 사람끼리 연속으로 해요.`
      : '2명 이상 모여야 시작할 수 있어요.';
    startMatch.disabled = n < 2;
    startReason.hidden = n >= 2;
  };
  minus.addEventListener('click', () => { winnersTarget--; renderWinners(); });
  plus.addEventListener('click', () => { winnersTarget++; renderWinners(); });
  startMatch.addEventListener('click', () => {
    closeSheet(startSheet);
    actions.onStartMatch(winnersTarget, practice.checked);
  });
  tapBtn.addEventListener('click', () => setMode('tap'));
  stickBtn.addEventListener('click', () => setMode('stick'));
  setMode(moveMode, false);

  settingsBtn.addEventListener('click', () => openSheet(settings));
  helpBtn.addEventListener('click', () => openSheet(helpSheet));
  for (const sheet of [settings, startSheet, hostSheet, peopleSheet, helpSheet]) {
    sheet.querySelectorAll('.sheet-close:not(.guide-again)').forEach((b) => b.addEventListener('click', () => closeSheet(sheet)));
  }

  const openStart = () => {
    // 인원 비례 제안: 6명당 1명, 최소 1명 (매번 열 때 다시 계산)
    winnersTarget = Math.max(1, Math.floor(eligibleCount() / 6));
    practice.checked = false;
    renderWinners();
    openSheet(startSheet);
  };
  startBtn.addEventListener('click', openStart);
  hostStart.addEventListener('click', openStart);

  const renderPeople = () => {
    peopleList.replaceChildren(...members.map((m) => h('li', {}, [
      h('span', {}, [m.playerId === myId ? `나 · ${m.nickname}` : m.nickname]),
      h('span', { className: 'people-tags' }, [m.playerId === hostId ? '👑 방장' : '', m.away ? ' 💤 자리비움' : '']),
    ])));
  };
  teamBox.addEventListener('click', () => { renderPeople(); openSheet(peopleSheet); });

  hostBtn.addEventListener('click', () => {
    memberList.replaceChildren(...members.filter((m) => m.playerId !== myId).map((m) => {
      const b = h('button', { type: 'button' }, [m.nickname, h('span', {}, ['넘기기'])]);
      b.addEventListener('click', () => { actions.onTransferHost(m.playerId); closeSheet(hostSheet); });
      return b;
    }));
    if (memberList.childElementCount === 0) memberList.append(h('p', { className: 'sheet-note' }, ['넘겨받을 사람이 아직 없어요.']));
    openSheet(hostSheet);
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
    connecting: '라운지에 연결하는 중…',
    online: '',
    reconnecting: '연결이 끊겼어요 · 다시 연결하는 중…',
    rejected: '입장 정보가 바뀌었어요 · 다시 입장해 주세요',
  };
  let connTimer = 0;
  let wasOffline = false;

  /** 상태줄: 지금 무엇을 기다리는지. 방장에게는 게임 시작 버튼 */
  const renderStatus = () => {
    const isHost = hostId === myId;
    startBtn.hidden = running || !isHost;
    hostBtn.hidden = !isHost;
    status.hidden = running;
    const n = members.filter((m) => !m.away).length;
    if (isHost) {
      status.textContent = n >= 2 ? `${n}명 모였어요 · 시작하면 10초 동안 투표` : '혼자 있어요 · 2명부터 시작할 수 있어요';
    } else {
      const host = members.find((m) => m.playerId === hostId);
      status.textContent = host ? `${host.nickname}님(방장)이 시작하면 부스로 가요` : '방장을 기다리는 중이에요';
    }
  };

  const GUIDE_KEY = 'luck-lounge:guide-seen';
  const steps = () => [
    [moveMode === 'stick' ? '화면을 누른 채 끌면 걸어요' : '바닥을 누르면 걸어가요',
      moveMode === 'stick' ? '내 캐릭터는 주황색 원이 있는 캐릭터예요. 화면 아무 곳이나 누른 채 가고 싶은 쪽으로 끌어 보세요.' : '내 캐릭터는 주황색 원이 있는 캐릭터예요. 가고 싶은 바닥을 눌러 보세요.'],
    ['왼쪽은 복불복, 오른쪽은 실력', '복불복 존(파랑)은 운으로, 경쟁 존(초록)은 짧은 게임 실력으로 커피 당첨자를 정해요.'],
    ['방장이 시작하면 부스로 걸어가 투표', '10초 안에 하고 싶은 게임 부스 위에 서세요. 규칙은 위쪽 ❔ 도움말에서 다시 볼 수 있어요.'],
  ];
  let guideStep = 0;
  const showGuide = (i: number) => {
    const list = steps();
    guideStep = i;
    guideN.textContent = `${i + 1} / ${list.length}`;
    guideT.textContent = list[i][0];
    guideD.textContent = list[i][1];
    guideNext.textContent = i === list.length - 1 ? '시작하기' : '다음';
    guide.hidden = false;
    guideNext.focus({ preventScroll: true });
  };
  const closeGuide = () => {
    guide.hidden = true;
    try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* 저장이 안 되면 다음에 또 보임 */ }
  };
  guideNext.addEventListener('click', () => { if (guideStep < steps().length - 1) showGuide(guideStep + 1); else closeGuide(); });
  guideSkip.addEventListener('click', closeGuide);
  helpSheet.querySelector('.guide-again')!.addEventListener('click', () => { closeSheet(helpSheet); showGuide(0); });
  let seen = false;
  try { seen = localStorage.getItem(GUIDE_KEY) === '1'; } catch { seen = false; }
  if (!seen) showGuide(0);

  return {
    get moveMode() {
      return moveMode;
    },
    setPresence(list: Member[], newHost: string | null) {
      members = list;
      count.textContent = `${team.code} · 접속 ${list.length}명 ▾`;
      const onlineHost = list.some((m) => m.playerId === newHost) ? newHost : null;
      if (hostId !== null && onlineHost !== null && onlineHost !== hostId) {
        const who = list.find((m) => m.playerId === onlineHost);
        showToast(onlineHost === myId ? '내가 방장이 됐어요' : `${who?.nickname ?? '누군가'}님이 방장이 됐어요`);
      }
      if (onlineHost !== null) hostId = onlineHost;
      renderStatus();
      if (!peopleSheet.hidden) renderPeople();
    },
    /** 연결 상태를 화면 위 띠로. 처음 연결은 0.8초 넘게 걸릴 때만, 다시 연결되면 2초 동안 알림 */
    setState(state: ConnectionState) {
      clearTimeout(connTimer);
      if (state === 'online') {
        if (wasOffline) {
          conn.textContent = '다시 연결됐어요';
          conn.className = 'conn-banner ok';
          conn.hidden = false;
          connTimer = window.setTimeout(() => { conn.hidden = true; }, 2000);
        } else {
          conn.hidden = true;
        }
        wasOffline = false;
        return;
      }
      wasOffline = state !== 'connecting' || wasOffline;
      conn.textContent = labels[state];
      conn.className = 'conn-banner';
      if (state === 'connecting') connTimer = window.setTimeout(() => { conn.hidden = false; wasOffline = true; }, 800);
      else conn.hidden = false;
    },
    hideHint() {
      hint.hidden = true;
    },
    /** 게임 중에는 상태줄·게임 시작·말하기·이모티콘·방장 메뉴를 숨긴다 */
    setGameRunning(v: boolean) {
      running = v;
      actionRow.hidden = v;
      chatBar.hidden = true;
      hint.hidden = v || hint.hidden;
      renderStatus();
    },
    /** 아래쪽 줄에 다른 버튼(경쟁 존 연습하기)을 넣는 자리 */
    slot,
    toast: showToast,
  };
}
