import { sfx, vibrate } from './sound';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

const TURN_MS = 7000;

/**
 * 풍선 불기 화면 표시: 누구 차례인지, 펌프질 횟수와 한계 범위, 내 차례의 1·2·3번 버튼과 7초 게이지, 결과 카드.
 * 판정은 서버가 하고 여기서는 보여 주기만 한다.
 */
export function createBalloonHud(root: HTMLElement, myId: string, nameOf: (id: string) => string, onPump: (n: number) => void) {
  const flash = h('div', { className: 'bomb-flash' });
  const status = h('div', { className: 'bomb-status', role: 'status' });
  const countNum = h('b');
  const range = h('small');
  const counter = h('div', { className: 'pump-counter' }, [countNum, h('span', {}, ['번 펌프질했어요']), range]);
  const timerFill = h('i');
  const timerText = h('p', { className: 'bomb-hold-text' });
  const buttons = [1, 2, 3].map((n) => {
    const b = h('button', { type: 'button' }, [`${n}번`]);
    b.addEventListener('click', () => {
      if (!myTurn || sent) return;
      sent = true;
      setButtons(false);
      onPump(n);
    });
    return b;
  });
  const turnBox = h('div', { className: 'pump-turn' }, [h('div', { className: 'bomb-holdbar' }, [timerFill]), timerText, h('div', { className: 'pump-buttons' }, buttons)]);
  const who = h('div', { className: 'bomb-who' });
  const note = h('p', { className: 'bomb-note' });
  const result = h('div', { className: 'bomb-result', role: 'dialog', ariaLabel: '풍선 불기 결과' }, [h('div', { className: 'bomb-boom balloon' }, ['팡!']), who, note]);
  const layer = h('div', { className: 'bomb-layer', hidden: true }, [flash, status, counter, h('div', { className: 'bomb-bottom' }, [turnBox]), result]);
  root.append(layer);

  let order: string[] = [];
  let myTurn = false;
  let sent = false;
  let turnAt = 0;
  let timer = 0;

  const setButtons = (on: boolean) => buttons.forEach((b) => { b.disabled = !on; });
  const setStatus = (main: string, sub = '') => {
    status.replaceChildren(main, ...(sub ? [h('small', {}, [sub])] : []));
    status.hidden = false;
  };
  const render = () => {
    if (!myTurn) return;
    const left = Math.max(0, TURN_MS - (performance.now() - turnAt));
    timerFill.style.width = `${(left / TURN_MS) * 100}%`;
    timerText.textContent = `${(left / 1000).toFixed(1)}초 안에 안 고르면 1번 자동`;
  };

  const showTurn = (id: string) => {
    myTurn = id === myId;
    sent = false;
    turnAt = performance.now();
    if (myTurn) {
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
      sfx.receive();
      vibrate(150);
      turnBox.hidden = false;
      setButtons(true);
      setStatus('내 차례!', '몇 번 펌프질할까요?');
    } else {
      turnBox.hidden = true;
      const n = order.length;
      const mine = order.indexOf(myId);
      const steps = mine < 0 ? -1 : (mine - order.indexOf(id) + n) % n;
      setStatus(`${nameOf(id)}님 차례`, steps > 0 ? `내 차례까지 ${steps}명` : mine < 0 ? '구경 중이에요' : '');
    }
  };

  return {
    start(newOrder: string[], turn: string, count: number, min: number, max: number, showRange: boolean) {
      order = newOrder;
      layer.hidden = false;
      result.hidden = true;
      counter.hidden = false;
      countNum.textContent = String(count);
      range.textContent = showRange ? `한계는 ${min}~${max}번 사이 어딘가` : '';
      clearInterval(timer);
      timer = window.setInterval(render, 100);
      showTurn(turn);
    },
    turn(id: string) {
      showTurn(id);
    },
    pump(player: string, pumps: number, count: number, auto: boolean) {
      countNum.textContent = String(count);
      sfx.pump();
      if (player === myId) {
        myTurn = false;
        turnBox.hidden = true;
      }
      setStatus(`${player === myId ? '내가' : `${nameOf(player)}님이`} ${pumps}번${auto ? ' (시간이 지나 자동)' : ''}`);
    },
    pop(loser: string, count: number, limit: number) {
      clearInterval(timer);
      myTurn = false;
      turnBox.hidden = true;
      status.hidden = true;
      counter.hidden = true;
      sfx.pop();
      vibrate([200, 80, 200]);
      window.setTimeout(() => {
        who.textContent = loser === myId ? '내가 당첨!' : `${nameOf(loser)}님 당첨!`;
        note.textContent = `${count}번째 펌프질에 터졌어요 · 한계는 ${limit}번이었어요`;
        result.hidden = false;
      }, 900);
    },
    roundEnd(delayMs: number) {
      clearInterval(timer);
      window.setTimeout(() => { layer.hidden = true; result.hidden = true; }, delayMs);
    },
    finish() {
      clearInterval(timer);
      layer.hidden = true;
      myTurn = false;
    },
    notYourTurn() {
      sent = false;
      setButtons(myTurn);
    },
  };
}
