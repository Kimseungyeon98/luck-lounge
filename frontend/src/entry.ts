import { api, ApiError, type Joined, type PlayerView, type Team } from './api';
import { CHARACTER_COUNT, CHARACTER_NAMES, characterDataUrl } from './characters';
import { loadToken, saveToken } from './storage';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

/**
 * 입장 화면. 매 접속마다 닉네임 입력란을 보여 주고, 이 기기로 들어온 적 있으면 지난 닉네임·캐릭터를 채워 둔다.
 * 입장이 끝나면 resolve 된다.
 */
export async function showEntry(root: HTMLElement, team: Team): Promise<Joined> {
  const token = loadToken(team.slug);
  const [me, members] = await Promise.all([
    api.me(team.slug, token).catch(() => null),
    token ? Promise.resolve([] as PlayerView[]) : api.players(team.slug).catch(() => [] as PlayerView[]),
  ]);

  let resumePlayerId: string | null = null;

  const nickname = el('input', {
    type: 'text', id: 'nickname', name: 'nickname', maxLength: 12, required: true,
    autocomplete: 'off', enterKeyHint: 'go', value: me?.nickname ?? '', placeholder: '예: 김대리',
  });
  const hint = el('p', { className: 'hint', id: 'nickname-hint' },
    [me ? '지난번 닉네임이에요. 바꿔도 기록은 그대로 이어져요.' : '12글자까지. 언제든 바꿀 수 있어요.']);
  nickname.setAttribute('aria-describedby', 'nickname-hint');

  const cast = el('div', { className: 'cast' });
  const initialCharacter = me?.characterIndex ?? Math.floor(Math.random() * CHARACTER_COUNT);
  for (let i = 0; i < CHARACTER_COUNT; i++) {
    const radio = el('input', { type: 'radio', name: 'character', value: String(i), id: `character-${i}` });
    radio.checked = i === initialCharacter;
    const img = el('img', { src: characterDataUrl(i), alt: `${i + 1}번 ${CHARACTER_NAMES[i]}` });
    cast.append(el('label', { htmlFor: `character-${i}` }, [radio, el('span', { className: 'tile' }, [img])]));
  }

  const resumeChip = el('div', { className: 'resume-chip', hidden: true });
  const error = el('p', { className: 'error', role: 'alert' });
  const submit = el('button', { type: 'submit', className: 'primary' }, ['라운지 입장']);

  const form = el('form', { noValidate: true }, [
    el('div', { className: 'field' }, [el('label', { htmlFor: 'nickname' }, ['닉네임']), nickname, hint]),
    el('fieldset', {}, [el('legend', {}, ['캐릭터']), cast]),
    resumeChip,
    error,
    submit,
  ]);

  const selected = () => Number((form.querySelector('input[name="character"]:checked') as HTMLInputElement | null)?.value ?? 0);
  const setCharacter = (i: number) => {
    const radio = form.querySelector<HTMLInputElement>(`#character-${i}`);
    if (radio) radio.checked = true;
  };

  const setResume = (p: PlayerView | null) => {
    resumePlayerId = p?.playerId ?? null;
    resumeChip.replaceChildren();
    resumeChip.hidden = !p;
    if (p) {
      nickname.value = p.nickname;
      setCharacter(p.characterIndex);
      const cancel = el('button', { type: 'button' }, ['취소']);
      cancel.addEventListener('click', () => { setResume(null); nickname.value = ''; nickname.focus(); });
      resumeChip.append(el('span', {}, [`${p.nickname}(으)로 이어서 들어가요`]), cancel);
    }
  };

  const children: Node[] = [
    el('header', {}, [
      el('p', { className: 'brand' }, ['운빨 라운지']),
      el('h1', {}, [team.name]),
      el('p', { className: 'sub' }, ['실력은 필요 없어요. 오늘의 운을 시험해 보세요.']),
    ]),
    form,
  ];

  if (!me && members.length > 0) {
    const list = el('div', { className: 'members' });
    for (const m of members) {
      const b = el('button', { type: 'button', className: 'member' }, [
        el('img', { src: characterDataUrl(m.characterIndex, 1), alt: '' }), m.nickname,
      ]);
      b.addEventListener('click', () => { setResume(m); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      list.append(b);
    }
    children.push(el('section', { className: 'resume' }, [
      el('h2', {}, ['이미 들어온 적 있나요?']),
      el('p', {}, ['다른 브라우저로 열었다면 내 이름을 눌러 이어하세요. 기록이 그대로 이어져요.']),
      list,
    ]));
  }

  root.replaceChildren(el('main', { className: 'entry' }, children));
  if (!me) nickname.focus();

  return new Promise<Joined>((resolve) => {
    form.addEventListener('submit', async (e) => {
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
        const joined = await api.join(team.slug, token, {
          nickname: nickname.value, characterIndex: selected(), resumePlayerId,
        });
        saveToken(team.slug, joined.token);
        resolve(joined);
      } catch (err) {
        error.textContent = err instanceof ApiError ? err.message : '잠시 후 다시 시도해 주세요.';
        submit.disabled = false;
        submit.textContent = '라운지 입장';
      }
    });
  });
}
