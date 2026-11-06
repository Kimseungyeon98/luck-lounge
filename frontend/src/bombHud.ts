import { sfx, vibrate } from './sound';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

const MIN_HOLD_MS = 1000;
const MAX_HOLD_MS = 5000;

/**
 * 시한폭탄 화면 표시: 상태 안내, 내 차례일 때 넘기기 버튼과 5초 게이지, 받을 때 깜빡임·진동·효과음, 결과 카드.
 * 판정은 모두 서버가 하고, 여기서는 서버가 알려 준 대로 보여 준다.
 */
export function createBombHud(root: HTMLElement, myId: string, nameOf: (id: string) => string, onPass: () => void) {
  const flash = h('div', { className: 'bomb-flash' });
  const status = h('div', { className: 'bomb-status', role: 'status' });
  const holdFill = h('i');
  const holdText = h('p', { className: 'bomb-hold-text' });
  const hold = h('div', { className: 'bomb-hold' }, [h('div', { className: 'bomb-holdbar' }, [holdFill]), holdText]);
  const pass = h('button', { type: 'button', className: 'bomb-pass' }, ['넘기기']);
  const who = h('div', { className: 'bomb-who' });
  const note = h('p', { className: 'bomb-note' });
  const result = h('div', { className: 'bomb-result', role: 'dialog', ariaLabel: '시한폭탄 결과' }, [
    h('div', { className: 'bomb-boom' }, ['펑!']), who, note,
  ]);
  const layer = h('div', { className: 'bomb-layer', hidden: true }, [flash, status, h('div', { className: 'bomb-bottom' }, [hold, pass]), result]);
  root.append(layer);

  let order: string[] = [];
  let holder: string | null = null;
  let receivedAt = 0;
  let timer = 0;
  let tickTimer = 0;
  let passSent = false;

  const setStatus = (main: string, sub = '') => {
    status.replaceChildren(main, ...(sub ? [h('small', {}, [sub])] : []));
    status.hidden = false;
  };

  const stepsToMe = () => {
    if (!holder) return -1;
    const n = order.length;
    const mine = order.indexOf(myId);
    if (mine < 0) return -1;
    return (mine - order.indexOf(holder) + n) % n;
  };

  const render = () => {
    if (holder !== myId) return;
    const held = performance.now() - receivedAt;
    holdFill.style.width = `${Math.min(100, (held / MAX_HOLD_MS) * 100)}%`;
    holdText.textContent = `${Math.max(0, (MAX_HOLD_MS - held) / 1000).toFixed(1)}초 뒤 자동으로 넘어가요`;
    const ready = held >= MIN_HOLD_MS;
    if (ready && pass.disabled && !passSent) {
      pass.disabled = false;
      const next = order[(order.indexOf(myId) + 1) % order.length];
      pass.textContent = `${nameOf(next)}님에게 넘기기`;
    }
  };

  pass.addEventListener('click', () => {
    if (pass.disabled) return;
    passSent = true;
    pass.disabled = true;
    pass.textContent = '넘기는 중…';
    onPass();
  });

  const showHolder = (id: string, auto: boolean) => {
    holder = id;
    receivedAt = performance.now();
    passSent = false;
    if (id === myId) {
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
      sfx.receive();
      vibrate(150);
      pass.hidden = false;
      hold.hidden = false;
      pass.disabled = true;
      pass.textContent = '1초 뒤에 넘길 수 있어요';
      setStatus('폭탄이 왔어요!', '언제 터질지 아무도 몰라요');
    } else {
      sfx.pass();
      pass.hidden = true;
      hold.hidden = true;
      const steps = stepsToMe();
      const sub = steps > 0 ? `내 차례까지 ${steps}칸` : order.includes(myId) ? '' : '구경 중이에요';
      setStatus(auto ? `시간이 지나 ${nameOf(id)}님에게 넘어갔어요` : `${nameOf(id)}님이 들고 있어요`, sub);
    }
  };

  return {
    start(newOrder: string[], firstHolder: string) {
      order = newOrder;
      layer.hidden = false;
      result.hidden = true;
      clearInterval(timer);
      clearInterval(tickTimer);
      timer = window.setInterval(render, 100);
      tickTimer = window.setInterval(() => sfx.tick(), 500);
      showHolder(firstHolder, false);
    },
    holder(id: string, auto: boolean) {
      showHolder(id, auto);
    },
    explode(loser: string, heldMs: number) {
      clearInterval(timer);
      clearInterval(tickTimer);
      holder = null;
      pass.hidden = true;
      hold.hidden = true;
      status.hidden = true;
      sfx.boom();
      vibrate([200, 80, 200]);
      setTimeout(() => {
        who.textContent = loser === myId ? '내가 당첨!' : `${nameOf(loser)}님 당첨!`;
        note.textContent = `폭탄을 ${(heldMs / 1000).toFixed(1)}초 들고 있었어요 · 오늘의 커피 담당`;
        result.hidden = false;
      }, 1100);
    },
    /** 판이 끝나 대기실로 */
    finish() {
      clearInterval(timer);
      clearInterval(tickTimer);
      layer.hidden = true;
      holder = null;
    },
    /** 서버가 "아직 못 넘김"이라고 알려 줌 */
    tooEarly() {
      passSent = false;
      pass.disabled = true;
      pass.textContent = '1초 뒤에 넘길 수 있어요';
    },
    get running() {
      return !layer.hidden;
    },
  };
}
