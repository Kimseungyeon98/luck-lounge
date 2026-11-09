import type { LadderMessage } from './net/loungeSocket';
import { sfx } from './sound';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

const COLORS = ['#FF6A3D', '#2F6BFF', '#12A37A', '#D565B0', '#F2C94C', '#5BB8D6', '#8A6FE0', '#E85D6E', '#7FA04A', '#B08A6A'];

/**
 * 사다리 타기 화면.
 * 1) 위쪽 동그라미 중 하나를 눌러 줄 고르기 (10초, 남은 시간 표시)
 * 2) 모두 고르면 서버가 사다리와 ☕ 칸을 공개 → 모든 줄이 동시에 따라 내려감
 * 3) ☕ 칸에 닿은 사람 발표. 판이 끝나면 닫힌다 (다음 판·요약은 matchHud)
 */
export function createLadderHud(root: HTMLElement, myId: string, nameOf: (id: string) => string, pick: (column: number) => void) {
  const title = h('h2', {}, ['사다리 타기']);
  const sub = h('p', { role: 'status' });
  const canvas = h('canvas', { ariaHidden: 'true' });
  const tops = h('div', { className: 'ladder-tops', role: 'group', ariaLabel: '줄 고르기' });
  const stage = h('div', { className: 'ladder-stage' }, [canvas, tops]);
  const layer = h('div', { className: 'ladder-layer', hidden: true, role: 'dialog', ariaModal: 'true', ariaLabel: '사다리 타기' }, [
    h('div', { className: 'ladder-head' }, [title, sub]), stage,
  ]);
  root.append(layer);

  const ctx = canvas.getContext('2d')!;
  let n = 0;
  let players: string[] = [];
  let picks = new Map<number, string>();
  let rungs: [number, number][] = [];
  let rows = 9;
  let coffee = -1;
  let loser: string | null = null;
  let progress = 0;
  let phase: 'pick' | 'reveal' | 'done' = 'pick';
  let pickEndsAt = 0;
  let timer = 0;
  let raf = 0;
  const buttons: HTMLButtonElement[] = [];

  const dims = () => {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const xs = Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * W);
    return { W, H, xs, top: 66, bottom: H - 64 };
  };
  const step = (r: number, c: number) => {
    for (const [rr, k] of rungs) {
      if (rr === r && k === c) return c + 1;
      if (rr === r && k === c - 1) return c - 1;
    }
    return c;
  };
  const pathOf = (start: number, d: ReturnType<typeof dims>) => {
    const rowY = (r: number) => d.top + ((d.bottom - d.top) * (r + 1)) / (rows + 1);
    let c = start;
    const pts: [number, number][] = [[d.xs[c], d.top]];
    for (let r = 0; r < rows; r++) {
      pts.push([d.xs[c], rowY(r)]);
      c = step(r, c);
      pts.push([d.xs[c], rowY(r)]);
    }
    pts.push([d.xs[c], d.bottom]);
    return pts;
  };

  const draw = () => {
    const d = dims();
    const rowY = (r: number) => d.top + ((d.bottom - d.top) * (r + 1)) / (rows + 1);
    ctx.clearRect(0, 0, d.W, d.H);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#9AA3AE';
    ctx.lineWidth = 4;
    for (const x of d.xs) { ctx.beginPath(); ctx.moveTo(x, d.top); ctx.lineTo(x, d.bottom); ctx.stroke(); }
    if (phase === 'pick') {
      ctx.fillStyle = '#E3DDD3';
      ctx.fillRect(d.xs[0] - 10, d.top + 24, d.xs[n - 1] - d.xs[0] + 20, d.bottom - d.top - 48);
      ctx.fillStyle = '#5A6472';
      ctx.font = '700 15px -apple-system, "Apple SD Gothic Neo", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('사다리는 모두 고른 뒤 공개돼요', d.W / 2, (d.top + d.bottom) / 2);
    } else {
      for (const [r, k] of rungs) { ctx.beginPath(); ctx.moveTo(d.xs[k], rowY(r)); ctx.lineTo(d.xs[k + 1], rowY(r)); ctx.stroke(); }
      for (const [col, who] of picks) {
        const pts = pathOf(col, d);
        const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
        const want = segs.reduce((a, b) => a + b, 0) * Math.min(1, progress);
        let acc = 0;
        ctx.strokeStyle = COLORS[col % COLORS.length];
        ctx.lineWidth = phase === 'done' && who === loser ? 9 : 6;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const seg = segs[i - 1];
          if (acc + seg <= want) ctx.lineTo(pts[i][0], pts[i][1]);
          else { const f = (want - acc) / seg; ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); break; }
          acc += seg;
        }
        ctx.stroke();
      }
    }
    // 아래 칸: 공개 전에는 ?, 다 내려가면 ☕
    for (let i = 0; i < n; i++) {
      const isCoffee = phase === 'done' && i === coffee;
      const w = Math.min(48, (d.W / n) * 0.8);
      ctx.fillStyle = isCoffee ? '#FFF2DA' : '#FFFFFF';
      ctx.strokeStyle = isCoffee ? '#FF6A3D' : '#D5DCE4';
      ctx.lineWidth = isCoffee ? 3 : 1.5;
      ctx.beginPath();
      // 오래된 iOS(16 미만)에는 roundRect 가 없다
      if (ctx.roundRect) ctx.roundRect(d.xs[i] - w / 2, d.bottom + 10, w, 42, 10);
      else ctx.rect(d.xs[i] - w / 2, d.bottom + 10, w, 42);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#18202B';
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(phase === 'done' ? (isCoffee ? '☕' : '·') : '?', d.xs[i], d.bottom + 31);
    }
  };

  const renderTops = () => {
    buttons.forEach((b, i) => {
      const who = picks.get(i);
      b.classList.toggle('taken', !!who);
      b.classList.toggle('mine', who === myId);
      b.textContent = who ? (who === myId ? '나' : nameOf(who).slice(0, 2)) : String(i + 1);
      b.setAttribute('aria-label', who ? `${i + 1}번 줄 · ${who === myId ? '나' : nameOf(who)}` : `${i + 1}번 줄 고르기`);
      b.disabled = phase !== 'pick' || !!who || [...picks.values()].includes(myId) || !players.includes(myId);
    });
  };
  const tick = () => {
    if (phase !== 'pick') return;
    const left = Math.max(0, Math.ceil((pickEndsAt - performance.now()) / 1000));
    const mine = [...picks.values()].includes(myId);
    if (!players.includes(myId)) sub.textContent = `이번 판은 구경해요 · ${left}초`;
    else sub.textContent = mine ? `다른 사람이 고르는 중… ${left}초` : `줄 하나를 골라 주세요 · ${left}초 뒤 남은 줄에서 무작위`;
  };
  const stopAll = () => {
    clearInterval(timer);
    cancelAnimationFrame(raf);
  };
  const onResize = () => { if (!layer.hidden) draw(); };
  window.addEventListener('resize', onResize);

  return {
    handle(m: LadderMessage) {
      if (m.type === 'start') {
        stopAll();
        players = m.players ?? [];
        n = m.columns ?? players.length;
        picks = new Map(Object.entries(m.picks ?? {}).map(([k, v]) => [Number(k), v]));
        phase = 'pick';
        progress = 0;
        loser = null;
        coffee = -1;
        rungs = [];
        pickEndsAt = performance.now() + (m.pickMs ?? 10000);
        buttons.length = 0;
        tops.replaceChildren(...Array.from({ length: n }, (_, i) => {
          const b = h('button', { type: 'button' }) as HTMLButtonElement;
          b.style.setProperty('--c', COLORS[i % COLORS.length]);
          b.addEventListener('click', () => { if (!b.disabled) pick(i); });
          buttons.push(b);
          return b;
        }));
        layer.hidden = false;
        renderTops();
        tick();
        timer = window.setInterval(tick, 250);
        requestAnimationFrame(draw);
        buttons.find((b) => !b.disabled)?.focus({ preventScroll: true });
      } else if (m.type === 'pick' && m.column != null && m.player) {
        picks.set(m.column, m.player);
        sfx.pass();
        renderTops();
        tick();
      } else if (m.type === 'reveal') {
        stopAll();
        rungs = m.rungs ?? [];
        rows = m.rows ?? 9;
        coffee = m.coffee ?? -1;
        loser = m.loser ?? null;
        picks = new Map(Object.entries(m.picks ?? {}).map(([k, v]) => [Number(k), v]));
        phase = 'reveal';
        renderTops();
        sub.textContent = '사다리를 따라 내려가요…';
        const dur = (m.revealMs ?? 4500) * 0.8;
        const t0 = performance.now();
        const anim = (now: number) => {
          progress = (now - t0) / dur;
          draw();
          if (progress < 1) raf = requestAnimationFrame(anim);
          else {
            phase = 'done';
            draw();
            sfx.boom();
            sub.textContent = loser === myId ? '내가 커피 당첨!' : `${loser ? nameOf(loser) : '누군가'}님 당첨!`;
          }
        };
        raf = requestAnimationFrame(anim);
      }
    },
    /** 다른 사람이 먼저 고른 줄 */
    taken() {
      sub.textContent = '다른 사람이 먼저 고른 줄이에요. 다른 줄을 골라 주세요';
    },
    /** 판이 끝남: 결과를 잠깐 보여 주고 닫는다 */
    roundEnd() {
      window.setTimeout(() => { if (phase === 'done') layer.hidden = true; }, 2500);
    },
    finish() {
      stopAll();
      layer.hidden = true;
    },
  };
}
