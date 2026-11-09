import { api, ApiError, type Joined, type PlayerView, type Team } from './api';
import { CHARACTER_COUNT, CHARACTER_NAMES, characterDataUrl } from './characters';
import { loadToken, saveToken } from './storage';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

export interface EntryHooks {
  /** 닉네임이나 캐릭터가 바뀔 때마다 (3D 미리보기 갱신) */
  onPreview(nickname: string, characterIndex: number): void;
  /** 카드에 가리지 않아 미리보기 캐릭터가 보이는 영역 (화면 px) */
  onPreviewArea(area: { x: number; y: number; w: number; h: number }): void;
}

/**
 * 메인(입장) 화면: 3D 라운지 위에 올라가는 입력 카드.
 * 매 접속마다 닉네임 입력란을 보여 주고, 이 기기로 들어온 적 있으면 지난 닉네임·캐릭터를 채워 둔다.
 */
export async function showEntry(root: HTMLElement, team: Team, hooks: EntryHooks): Promise<Joined> {
  const token = loadToken(team.slug);
  const [me, members] = await Promise.all([
    api.me(team.slug, token).catch(() => null),
    token ? Promise.resolve([] as PlayerView[]) : api.players(team.slug).catch(() => [] as PlayerView[]),
  ]);

  let resumePlayerId: string | null = null;
  let character = me?.characterIndex ?? Math.floor(Math.random() * CHARACTER_COUNT);

  const nickname = el('input', {
    type: 'text', id: 'nickname', name: 'nickname', maxLength: 12, required: true,
    autocomplete: 'off', enterKeyHint: 'go', value: me?.nickname ?? '', placeholder: '예: 김대리',
  });
  nickname.setAttribute('aria-describedby', 'nickname-hint');
  const hint = el('p', { className: 'hint', id: 'nickname-hint' },
    [me ? '지난번 닉네임이에요. 바꿔도 기록은 이어져요.' : '12글자까지 쓸 수 있어요.']);

  const charLabel = el('span', { className: 'picker-label', id: 'character-label' });
  // 캐릭터 10종을 한눈에 (5×2)
  const grid = el('div', { className: 'char-grid', role: 'radiogroup' });
  grid.setAttribute('aria-labelledby', 'character-label');
  const cells = Array.from({ length: CHARACTER_COUNT }, (_, i) => {
    const b = el('button', { type: 'button', className: 'char-cell', role: 'radio', ariaLabel: CHARACTER_NAMES[i] }, [
      el('img', { src: characterDataUrl(i, 1), alt: '' }),
    ]);
    b.addEventListener('click', () => { character = i; update(); });
    grid.append(b);
    return b;
  });

  const resumeChip = el('div', { className: 'resume-chip', hidden: true });
  const error = el('p', { className: 'error', role: 'alert' });
  const submit = el('button', { type: 'submit', className: 'primary' }, ['라운지 입장']);

  const update = () => {
    charLabel.textContent = `캐릭터 · ${CHARACTER_NAMES[character]}`;
    cells.forEach((c, i) => {
      c.setAttribute('aria-checked', String(i === character));
      c.tabIndex = i === character ? 0 : -1;
    });
    hooks.onPreview(nickname.value.trim(), character);
  };
  // 방향키로도 고르기
  grid.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    character = (character + step + CHARACTER_COUNT) % CHARACTER_COUNT;
    update();
    cells[character].focus();
  });
  nickname.addEventListener('input', update);

  const setResume = (p: PlayerView | null) => {
    resumePlayerId = p?.playerId ?? null;
    resumeChip.replaceChildren();
    resumeChip.hidden = !p;
    if (p) {
      nickname.value = p.nickname;
      character = p.characterIndex;
      const cancel = el('button', { type: 'button' }, ['취소']);
      cancel.addEventListener('click', () => { setResume(null); nickname.value = ''; update(); nickname.focus(); });
      resumeChip.append(el('span', {}, [`${p.nickname}(으)로 이어서 들어가요`]), cancel);
    }
    update();
  };

  const card = el('form', { className: 'card', noValidate: true }, [
    el('label', { htmlFor: 'nickname' }, ['닉네임']),
    nickname,
    hint,
    charLabel,
    grid,
    resumeChip,
    error,
    submit,
  ]);

  if (!me && members.length > 0) {
    const list = el('div', { className: 'members', hidden: true, id: 'members' });
    for (const m of members) {
      const b = el('button', { type: 'button', className: 'member' }, [
        el('img', { src: characterDataUrl(m.characterIndex, 1), alt: '' }), m.nickname,
      ]);
      b.addEventListener('click', () => { setResume(m); list.hidden = true; toggle.setAttribute('aria-expanded', 'false'); });
      list.append(b);
    }
    const toggle = el('button', { type: 'button', className: 'secondary' }, ['다른 휴대폰에서 왔어요 · 내 이름 찾기']);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'members');
    toggle.addEventListener('click', () => {
      list.hidden = !list.hidden;
      toggle.setAttribute('aria-expanded', String(!list.hidden));
    });
    card.append(toggle, list);
  }

  const head = el('header', { className: 'entry-head' }, [
      el('p', { className: 'brand' }, ['운빨 라운지']),
      el('h1', {}, [team.name]),
      el('p', { className: 'sub' }, ['운으로, 실력으로, 오늘의 커피 내기']),
  ]);
  const main = el('main', { className: 'entry' }, [head, card]);
  root.replaceChildren(main);
  update();

  // 미리보기 캐릭터는 카드에 가리지 않는 곳에: 세로 화면은 제목과 카드 사이, 가로 화면은 카드 왼쪽
  const reportArea = () => {
    if (!main.isConnected) return;
    const c = card.getBoundingClientRect();
    const hd = head.getBoundingClientRect();
    if (innerWidth > innerHeight && c.left > innerWidth * 0.35) hooks.onPreviewArea({ x: 0, y: hd.bottom, w: c.left, h: innerHeight - hd.bottom });
    // 제목과 카드 사이가 좁으면(작은 휴대폰) 제목 뒤까지 써서 캐릭터를 보여 준다
    else if (c.top - hd.bottom < 150) hooks.onPreviewArea({ x: 0, y: hd.top + 8, w: innerWidth, h: c.top - hd.top - 8 });
    else hooks.onPreviewArea({ x: 0, y: hd.bottom, w: innerWidth, h: c.top - hd.bottom });
  };
  reportArea();
  new ResizeObserver(reportArea).observe(main);
  window.addEventListener('resize', reportArea);
  void document.fonts?.ready.then(reportArea);

  return new Promise<Joined>((resolve) => {
    card.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.textContent = '';
      if (!nickname.value.trim()) {
        error.textContent = '닉네임을 입력해 주세요.';
        nickname.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = '들어가는 중…';
      try {
        const joined = await api.join(team.slug, token, { nickname: nickname.value, characterIndex: character, resumePlayerId });
        saveToken(team.slug, joined.token);
        nickname.blur();
        resolve(joined);
      } catch (err) {
        error.textContent = err instanceof ApiError ? err.message : '잠시 후 다시 시도해 주세요.';
        submit.disabled = false;
        submit.textContent = '라운지 입장';
      }
    });
  });
}
