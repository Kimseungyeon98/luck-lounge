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
  charLabel.setAttribute('aria-live', 'polite');
  const prev = el('button', { type: 'button', className: 'round', ariaLabel: '이전 캐릭터' }, ['◀']);
  const next = el('button', { type: 'button', className: 'round', ariaLabel: '다음 캐릭터' }, ['▶']);

  const resumeChip = el('div', { className: 'resume-chip', hidden: true });
  const error = el('p', { className: 'error', role: 'alert' });
  const submit = el('button', { type: 'submit', className: 'primary' }, ['라운지 입장']);

  const update = () => {
    charLabel.textContent = `${character + 1} / ${CHARACTER_COUNT} · ${CHARACTER_NAMES[character]}`;
    hooks.onPreview(nickname.value.trim(), character);
  };
  prev.addEventListener('click', () => { character = (character + CHARACTER_COUNT - 1) % CHARACTER_COUNT; update(); });
  next.addEventListener('click', () => { character = (character + 1) % CHARACTER_COUNT; update(); });
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
    el('div', { className: 'picker', role: 'group', ariaLabel: '캐릭터 고르기' }, [prev, charLabel, next]),
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

  root.replaceChildren(el('main', { className: 'entry' }, [
    el('header', { className: 'entry-head' }, [
      el('p', { className: 'brand' }, ['운빨 라운지']),
      el('h1', {}, [team.name]),
      el('p', { className: 'sub' }, ['운으로, 실력으로, 오늘의 커피 내기']),
    ]),
    card,
  ]));
  update();

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
