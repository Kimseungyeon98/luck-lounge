import { api, ApiError, type Team } from './api';
import { clearLastRoom, deviceKey, loadLastRoom } from './storage';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

/** 방 코드에 쓰는 글자 (서버 TeamSlugs.CODE_ALPHABET 과 같게). 헷갈리는 I·O·0·1 은 없다 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
const NAME_MAX = 20;

/** 초대 문구: 고정 주소 + 방 코드 */
export function inviteText(team: Team): string {
  return `운빨 라운지에서 커피 내기해요 ☕\n${location.origin}\n방 코드: ${team.code}`;
}

/** 복사. 카톡 안 브라우저처럼 clipboard API 가 막힌 곳은 예전 방식으로 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea', { value: text, readOnly: true });
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * 첫 화면 (고정 주소). 방 코드를 넣어 들어가거나 새 방을 만든다. 주소는 바뀌지 않는다.
 * @param error 처음부터 보여 줄 안내 (예: 들어가 있던 방이 없어짐)
 */
export function showHome(root: HTMLElement, error = ''): Promise<Team> {
  return new Promise<Team>((resolve) => {
    const head = el('header', { className: 'entry-head' }, [
      el('p', { className: 'brand' }, ['운빨 라운지']),
      el('h1', {}, ['오늘의', el('br'), '커피 내기']),
      el('p', { className: 'sub' }, ['운으로, 실력으로']),
    ]);
    const main = el('main', { className: 'entry home' }, [head]);
    root.replaceChildren(main);

    // ---------- 1. 코드 입력 ----------
    const homeCard = () => {
      const card = el('form', { className: 'card', noValidate: true });
      const recent = loadLastRoom();
      if (recent) {
        const or = el('div', { className: 'divider' }, ['또는']);
        const btn = el('button', { type: 'button', className: 'recent-room' }, [
          el('span', {}, [el('b', {}, [recent.name]), el('small', {}, [`방 코드 ${recent.code}`])]),
          el('span', { className: 'recent-go' }, ['바로 입장 ›']),
        ]);
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            resolve(await api.team(recent.slug));
          } catch (e) {
            btn.disabled = false;
            if (e instanceof ApiError && e.status === 404) {
              clearLastRoom();
              btn.remove();
              or.remove();
            }
            err.textContent = e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요.';
          }
        });
        card.append(btn, or);
      }
      const label = el('label', { htmlFor: 'room-code' }, ['방 코드 6자리']);
      const code = el('input', {
        type: 'text', id: 'room-code', className: 'code-input', maxLength: CODE_LENGTH, autocomplete: 'off',
        spellcheck: false, enterKeyHint: 'go', placeholder: '······',
      });
      code.setAttribute('autocapitalize', 'characters');
      code.setAttribute('aria-describedby', 'room-code-hint');
      const hint = el('p', { className: 'hint', id: 'room-code-hint' }, ['방을 만든 사람에게 코드를 받아 주세요']);
      const err = el('p', { className: 'error', role: 'alert' }, [error]);
      error = '';
      const go = el('button', { type: 'submit', className: 'primary dark', disabled: true }, ['입장']);
      const make = el('button', { type: 'button', className: 'secondary' }, ['＋ 새 방 만들기']);
      code.addEventListener('input', () => {
        const raw = code.value.toUpperCase().replace(/[\s-]/g, '');
        const clean = [...raw].filter((c) => CODE_ALPHABET.includes(c)).join('').slice(0, CODE_LENGTH);
        if (clean !== code.value) code.value = clean;
        hint.textContent = /[IO01]/.test(raw) ? '방 코드에는 I·O·0·1 이 없어요' : '방을 만든 사람에게 코드를 받아 주세요';
        go.disabled = clean.length !== CODE_LENGTH;
        err.textContent = '';
        code.classList.remove('bad');
      });
      card.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (code.value.length !== CODE_LENGTH) return;
        go.disabled = true;
        go.textContent = '찾는 중…';
        try {
          const team = await api.findRoom(code.value);
          code.blur();
          resolve(team);
        } catch (ex) {
          err.textContent = ex instanceof ApiError ? ex.message : '잠시 후 다시 시도해 주세요.';
          code.classList.add('bad');
          go.disabled = false;
          go.textContent = '입장';
          code.focus();
          code.select();
        }
      });
      make.addEventListener('click', createCard);
      card.append(label, code, hint, err, go, el('div', { className: 'divider' }, ['처음이면']), make);
      show(card);
      if (!recent) code.focus({ preventScroll: true });
    };

    // ---------- 2. 새 방 만들기 ----------
    const createCard = () => {
      const card = el('form', { className: 'card', noValidate: true });
      const name = el('input', { type: 'text', id: 'room-name', maxLength: NAME_MAX, autocomplete: 'off', enterKeyHint: 'done', placeholder: '예: 개발2팀' });
      const err = el('p', { className: 'error', role: 'alert' });
      const submit = el('button', { type: 'submit', className: 'primary' }, ['방 만들기']);
      const back = el('button', { type: 'button', className: 'link' }, ['뒤로']);
      back.addEventListener('click', homeCard);
      card.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!name.value.trim()) {
          err.textContent = '방 이름을 입력해 주세요.';
          name.focus();
          return;
        }
        submit.disabled = true;
        submit.textContent = '만드는 중…';
        try {
          madeCard(await api.createRoom(name.value, deviceKey()));
        } catch (ex) {
          err.textContent = ex instanceof ApiError ? ex.message : '잠시 후 다시 시도해 주세요.';
          submit.disabled = false;
          submit.textContent = '방 만들기';
        }
      });
      card.append(
        el('label', { htmlFor: 'room-name' }, ['방 이름 (팀 이름)']), name,
        el('p', { className: 'hint' }, ['방을 만들면 6자리 방 코드가 나와요. 기록과 통계는 방마다 따로 쌓여요.']),
        err, submit, back,
      );
      show(card);
      name.focus({ preventScroll: true });
    };

    // ---------- 3. 방 코드 발급 ----------
    const madeCard = (team: Team) => {
      const status = el('p', { className: 'copy-status', role: 'status' });
      const copyCode = el('button', { type: 'button', className: 'secondary' }, ['코드 복사']);
      const copyInvite = el('button', { type: 'button', className: 'secondary' }, ['초대 문구 복사']);
      const enter = el('button', { type: 'button', className: 'primary' }, ['방으로 들어가기']);
      copyCode.addEventListener('click', async () => { status.textContent = (await copyText(team.code)) ? '방 코드를 복사했어요' : `복사가 안 돼요. ${team.code} 를 직접 적어 주세요`; });
      copyInvite.addEventListener('click', async () => { status.textContent = (await copyText(inviteText(team))) ? '초대 문구를 복사했어요. 단톡방에 붙여 주세요' : '복사가 안 돼요. 코드를 직접 알려 주세요'; });
      enter.addEventListener('click', () => resolve(team));
      const card = el('div', { className: 'card' }, [
        el('p', { className: 'made-title' }, [el('b', {}, [team.name]), ' 방을 만들었어요']),
        el('span', { className: 'picker-label' }, ['방 코드']),
        el('div', { className: 'code-big', ariaLabel: `방 코드 ${[...team.code].join(' ')}` }, [team.code]),
        el('p', { className: 'hint' }, ['동료에게 이 주소와 코드를 알려 주세요. 대기실 위쪽 방 이름을 눌러도 다시 볼 수 있어요.']),
        el('div', { className: 'two-btns' }, [copyCode, copyInvite]),
        status,
        enter,
      ]);
      show(card);
      enter.focus({ preventScroll: true });
    };

    let current: HTMLElement | null = null;
    const show = (card: HTMLElement) => {
      if (current) current.replaceWith(card);
      else main.append(card);
      current = card;
    };
    homeCard();
  });
}
