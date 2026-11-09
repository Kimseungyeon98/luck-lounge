import { sfx } from '../sound';
import type { SkillType } from '../net/loungeSocket';

/** 한 판 진행 중인 게임. forceEnd 는 시간이 다 됐을 때 호출 */
export interface SkillPlay {
  forceEnd(): void;
  destroy(): void;
}

/** 끝나면 점수를 알려 준다. 시간 안에 못 끝내면 score 가 null */
export type OnDone = (score: number | null, extra: number | null) => void;

export const SKILL_NAME: Record<SkillType, string> = { STOP: '10초 멈추기', TOWER: '탑 쌓기', TARGET: '과녁 멈추기' };
export const SKILL_HOW: Record<SkillType, string> = {
  STOP: '3초가 지나면 시계가 사라져요. 딱 10.00초에 멈추세요',
  TOWER: '움직이는 블록을 눌러 쌓으세요. 삐져나온 부분은 잘려요',
  TARGET: '좌우로 움직이는 바늘을 가운데에 멈추세요. 3번, 갈수록 빨라져요',
};

/** 점수 표시: 10초 멈추기는 10초와의 차이, 탑 쌓기는 층 수 */
export function formatScore(type: SkillType, score: number | null | undefined): string {
  if (score == null) return '기록 없음';
  if (type === 'TARGET') return `${score.toFixed(1)}%`;
  return type === 'STOP' ? `±${(score / 1000).toFixed(2)}초` : `${score}층`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

export function startSkill(type: SkillType, stage: HTMLElement, onDone: OnDone): SkillPlay {
  if (type === 'TARGET') return playTarget(stage, onDone);
  return type === 'STOP' ? playStop(stage, onDone) : playTower(stage, onDone);
}

/* ---------- 10초 멈추기 ---------- */

/** 각자 휴대폰 안에서 시간을 재므로 인터넷 속도와 상관없다. 점수 = 10초와의 차이(ms) */
function playStop(stage: HTMLElement, onDone: OnDone): SkillPlay {
  const big = el('div', 'skill-big', '0.00');
  const note = el('p', 'skill-note', '머릿속으로 세어 보세요');
  const btn = el('button', 'skill-btn', '멈춤');
  btn.type = 'button';
  const box = el('div', 'skill-stop');
  box.append(big, note, btn);
  stage.replaceChildren(box);
  btn.focus({ preventScroll: true });

  const t0 = performance.now();
  let raf = 0;
  let done = false;
  const tick = () => {
    const e = (performance.now() - t0) / 1000;
    big.textContent = e < 3 ? e.toFixed(2) : '?.??';
    raf = requestAnimationFrame(tick);
  };
  tick();

  const stop = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    const elapsed = performance.now() - t0;
    const diff = Math.round(Math.abs(elapsed - 10000));
    big.textContent = (elapsed / 1000).toFixed(2);
    note.textContent = diff < 50 ? '거의 완벽!' : elapsed < 10000 ? '조금 빨랐어요' : '조금 늦었어요';
    btn.disabled = true;
    sfx.pass();
    onDone(diff, null);
  };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); stop(); });
  btn.addEventListener('click', stop);

  return {
    forceEnd() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      big.textContent = '시간 초과';
      btn.disabled = true;
      onDone(null, null);
    },
    destroy() {
      done = true;
      cancelAnimationFrame(raf);
    },
  };
}

/* ---------- 탑 쌓기 ---------- */

const BLOCK_COLORS = ['#4C7BF4', '#F08A4B', '#3FA97C', '#D565B0', '#F2C94C', '#5BB8D6', '#8A6FE0', '#E85D6E'];

/**
 * 좌우로 움직이는 블록을 눌러 떨어뜨린다. 아래 블록과 겹친 만큼만 남고, 한 층마다 7% 빨라진다.
 * 점수 = 층 수, extra = 마지막 블록 폭(처음 폭 대비, 같은 층일 때 순위 결정용)
 */
function playTower(stage: HTMLElement, onDone: OnDone): SkillPlay {
  const canvas = el('canvas', 'skill-canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-label', '탑 쌓기. 누르면 블록이 떨어집니다');
  const hud = el('div', 'tower-hud');
  const floorsEl = el('div', 'skill-big', '0');
  const msg = el('div', 'skill-note', '눌러서 쌓기');
  const left = el('div');
  left.append(floorsEl, el('div', 'skill-note', '층'));
  hud.append(left, msg);
  const box = el('div', 'skill-tower');
  box.append(canvas, hud);
  stage.replaceChildren(box);
  canvas.focus({ preventScroll: true });

  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  const size = () => {
    W = box.clientWidth;
    H = box.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const startW = W * 0.6;
  const BH = Math.max(18, Math.round(H / 26));
  const stack = [{ x: (W - startW) / 2, w: startW }];
  let cur = { x: 0, w: startW, dir: 1 };
  let speed = W * 0.42;
  let floors = 0;
  let perfect = 0;
  let over = false;
  let cam = 0;
  let falling: { x: number; w: number; y: number; vy: number }[] = [];
  let raf = 0;

  const finish = (sendScore: boolean) => {
    if (over) return;
    over = true;
    msg.textContent = '끝!';
    const top = stack[stack.length - 1];
    onDone(sendScore ? floors : null, sendScore ? Math.round((top.w / startW) * 1000) / 1000 : null);
  };

  const drop = () => {
    if (over) return;
    const top = stack[stack.length - 1];
    let l = Math.max(cur.x, top.x);
    let r = Math.min(cur.x + cur.w, top.x + top.w);
    if (r - l <= 0) {
      falling.push({ x: cur.x, w: cur.w, y: stack.length, vy: 0 });
      sfx.pop();
      finish(true);
      return;
    }
    if (Math.abs(cur.x - top.x) < Math.max(3, W * 0.012)) {
      l = top.x;
      r = top.x + top.w;
      perfect++;
      msg.textContent = perfect > 1 ? `퍼펙트 x${perfect}` : '퍼펙트!';
      sfx.receive();
    } else {
      perfect = 0;
      msg.textContent = '';
      falling.push({ x: cur.x < top.x ? cur.x : r, w: cur.w - (r - l), y: stack.length, vy: 0 });
      sfx.tick();
    }
    stack.push({ x: l, w: r - l });
    floors++;
    floorsEl.textContent = String(floors);
    speed *= 1.07;
    cur = { x: floors % 2 ? W - (r - l) : 0, w: r - l, dir: floors % 2 ? -1 : 1 };
  };

  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); drop(); });
  canvas.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      drop();
    }
  });
  window.addEventListener('resize', size);

  let last = performance.now();
  const yOf = (i: number) => H - BH * 4 - (i - cam) * BH;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!over) {
      cur.x += cur.dir * speed * dt;
      if (cur.x < 0) { cur.x = 0; cur.dir = 1; }
      if (cur.x + cur.w > W) { cur.x = W - cur.w; cur.dir = -1; }
    }
    const goal = Math.max(0, stack.length - Math.floor(H / BH / 2.2));
    cam += (goal - cam) * (reduceMotion ? 1 : Math.min(1, dt * 6));
    ctx.fillStyle = '#F2EEE8';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#E3DDD3';
    ctx.fillRect(0, yOf(0) + BH, W, H);
    stack.forEach((b, i) => {
      ctx.fillStyle = BLOCK_COLORS[i % BLOCK_COLORS.length];
      ctx.fillRect(b.x, yOf(i), b.w, BH - 2);
    });
    if (!over) {
      ctx.fillStyle = BLOCK_COLORS[stack.length % BLOCK_COLORS.length];
      ctx.fillRect(cur.x, yOf(stack.length), cur.w, BH - 2);
    }
    for (const f of falling) {
      f.vy += 900 * dt;
      f.y -= (f.vy * dt) / BH;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#9AA3AE';
      ctx.fillRect(f.x, yOf(f.y), f.w, BH - 2);
      ctx.globalAlpha = 1;
    }
    falling = falling.filter((f) => yOf(f.y) < H + 40);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    /** 시간이 다 되면 지금까지 쌓은 층으로 끝낸다 */
    forceEnd() { finish(true); },
    destroy() {
      over = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    },
  };
}

/* ---------- 과녁 멈추기 ---------- */

/**
 * 좌우로 움직이는 바늘을 가운데에 멈추기 3번. 한 번 멈출 때마다 1.35배 빨라진다.
 * 점수 = 가운데와의 평균 거리 (막대 반쪽 길이를 100% 로)
 */
function playTarget(stage: HTMLElement, onDone: OnDone): SkillPlay {
  const canvas = el('canvas', 'skill-canvas');
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-label', '과녁 멈추기. 누르면 바늘이 멈춥니다');
  const hud = el('div', 'tower-hud');
  const tryEl = el('div', 'skill-big', '1 / 3');
  const msg = el('div', 'skill-note', '눌러서 멈추기');
  hud.append(tryEl, msg);
  const box = el('div', 'skill-tower');
  box.append(canvas, hud);
  stage.replaceChildren(box);
  canvas.focus({ preventScroll: true });

  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  const size = () => {
    W = box.clientWidth;
    H = box.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  const barL = () => W * 0.08;
  const barW = () => W * 0.84;
  let x = 0;
  let dir = 1;
  let speed = 0.9;
  let stopped = false;
  let over = false;
  const tries: { x: number; d: number }[] = [];
  let raf = 0;
  let last = performance.now();

  const draw = () => {
    const y = H * 0.5;
    const l = barL();
    const w = barW();
    const mid = l + w / 2;
    ctx.fillStyle = '#F2EEE8';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(l, 0, l + w, 0);
    g.addColorStop(0, '#F8D7D5'); g.addColorStop(0.42, '#FFF2DA'); g.addColorStop(0.5, '#DDF3EB'); g.addColorStop(0.58, '#FFF2DA'); g.addColorStop(1, '#F8D7D5');
    ctx.fillStyle = g;
    ctx.fillRect(l, y - 30, w, 60);
    ctx.fillStyle = '#12A37A';
    ctx.fillRect(mid - 3, y - 40, 6, 80);
    for (const t of tries) { ctx.fillStyle = 'rgba(24,32,43,0.35)'; ctx.fillRect(l + t.x * w - 2, y - 34, 4, 68); }
    const nx = l + x * w;
    ctx.fillStyle = '#18202B';
    ctx.beginPath(); ctx.moveTo(nx, y - 46); ctx.lineTo(nx - 10, y - 64); ctx.lineTo(nx + 10, y - 64); ctx.closePath(); ctx.fill();
    ctx.fillRect(nx - 2, y - 46, 4, 92);
  };
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!stopped) {
      x += dir * speed * dt;
      if (x < 0) { x = 0; dir = 1; }
      if (x > 1) { x = 1; dir = -1; }
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const hit = () => {
    if (stopped || over) return;
    stopped = true;
    const d = Math.abs(x - 0.5) * 200;
    tries.push({ x, d });
    msg.textContent = d < 3 ? '정중앙!' : `가운데에서 ${d.toFixed(1)}%`;
    sfx.pass();
    if (tries.length < 3) {
      window.setTimeout(() => {
        if (over) return;
        stopped = false;
        speed *= 1.35;
        tryEl.textContent = `${tries.length + 1} / 3`;
        msg.textContent = '더 빨라져요';
      }, 700);
    } else {
      over = true;
      const avg = Math.round((tries.reduce((a, t) => a + t.d, 0) / 3) * 10) / 10;
      onDone(avg, null);
    }
  };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); hit(); });
  canvas.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hit(); } });
  window.addEventListener('resize', size);

  return {
    /** 시간이 다 되면 기록 없음 (3번을 다 못 멈춘 것) */
    forceEnd() {
      if (over) return;
      over = true;
      onDone(null, null);
    },
    destroy() {
      over = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    },
  };
}
