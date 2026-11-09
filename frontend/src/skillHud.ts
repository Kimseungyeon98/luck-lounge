import type { Notice, SkillMessage, SkillType } from './net/loungeSocket';
import { SKILL_HOW, SKILL_NAME, formatScore, startSkill, type SkillPlay } from './skill/games';
import { sfx } from './sound';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

/** 순위를 한 명씩 보여 주는 간격. 서버 Match.REVEAL_EACH 와 같게 */
export const REVEAL_EACH_MS = 600;
export const REVEAL_TAIL_MS = 2500;

export interface SkillActions {
  submit(score: number, extra: number | null): void;
  practice(type: SkillType, score: number, extra: number | null): void;
}

/**
 * 경쟁 존 게임 화면.
 * - 내기: 3·2·1 → 각자 한 판 → 다른 사람 기다림 → 1등부터 순위 발표, 마지막에 커피 당첨
 * - 연습: 경쟁 존 부스 위에서 "연습하기" → 한 판 → 내 기록·내 최고·팀 최고
 */
export function createSkillHud(root: HTMLElement, myId: string, nameOf: (id: string) => string, actions: SkillActions) {
  const practiceBtn = h('button', { type: 'button', className: 'practice-btn', hidden: true });
  const title = h('h2', { className: 'skill-title' });
  const sub = h('p', { className: 'skill-sub' });
  const stage = h('div', { className: 'skill-stage' });
  const layer = h('div', { className: 'skill-layer', hidden: true, role: 'dialog', ariaModal: 'true' }, [
    h('div', { className: 'skill-head' }, [title, sub]), stage,
  ]);
  root.append(practiceBtn, layer);

  let play: SkillPlay | null = null;
  let timers: number[] = [];
  let running = false;
  let booth: SkillType | null = null;
  let winnersTarget = 1;
  /** 이번 내기에서 내가 이미 점수를 냈는지 (재접속해도 두 번 하지 않게) */
  let submitted = false;
  let matchType: SkillType = 'STOP';
  let practiceType: SkillType | null = null;
  let practiceTimer = 0;

  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
  const clearAll = () => {
    for (const t of timers) clearTimeout(t);
    timers = [];
    play?.destroy();
    play = null;
    clearTimeout(practiceTimer);
  };
  const close = () => {
    clearAll();
    layer.hidden = true;
    practiceType = null;
    refreshPracticeBtn();
  };
  const refreshPracticeBtn = () => {
    practiceBtn.hidden = running || !booth || !layer.hidden;
    if (booth) practiceBtn.textContent = `🏁 ${SKILL_NAME[booth]} 연습하기`;
  };

  /** 3, 2, 1 을 보여 준 뒤 시작 */
  const countdown = (ms: number, then: () => void) => {
    const big = h('div', { className: 'skill-count' });
    stage.replaceChildren(big);
    const endAt = performance.now() + ms;
    let shown = -1;
    const step = () => {
      const left = Math.ceil((endAt - performance.now()) / 1000);
      if (left <= 0) { then(); return; }
      if (left !== shown) { shown = left; big.textContent = String(left); sfx.tick(); }
      later(step, 50);
    };
    step();
  };

  const waiting = (line: string) => {
    stage.replaceChildren(h('div', { className: 'skill-wait' }, [h('p', { className: 'skill-mine' }, [line]), h('p', { className: 'skill-progress', id: 'skill-progress' }, ['다른 사람을 기다리는 중'])]));
  };

  practiceBtn.addEventListener('click', () => {
    if (!booth || running) return;
    const type = booth;
    practiceType = type;
    title.textContent = `연습 · ${SKILL_NAME[type]}`;
    sub.textContent = '연습 기록은 최고 기록에만 들어가고 내기·통계에는 들어가지 않아요';
    layer.hidden = false;
    refreshPracticeBtn();
    const startBtn = h('button', { type: 'button', className: 'skill-btn' }, ['시작']);
    const closeBtn = h('button', { type: 'button', className: 'skill-btn ghost' }, ['닫기']);
    stage.replaceChildren(h('div', { className: 'skill-wait' }, [h('p', { className: 'skill-mine' }, [SKILL_HOW[type]]), startBtn, closeBtn]));
    startBtn.focus({ preventScroll: true });
    closeBtn.addEventListener('click', close);
    startBtn.addEventListener('click', () => runPractice(type));
  });

  const runPractice = (type: SkillType) => {
    clearAll();
    countdown(3000, () => {
      play = startSkill(type, stage, (score, extra) => {
        later(() => {
          play?.destroy();
          play = null;
          if (score == null) { showPracticeResult(type, null, null); return; }
          waiting(`내 기록 ${formatScore(type, score)}`);
          actions.practice(type, score, extra);
          // 서버 응답이 없으면(부스를 벗어남 등) 기록만 보여 준다
          practiceTimer = window.setTimeout(() => showPracticeResult(type, score, null), 4000);
        }, 900);
      });
    });
  };

  const showPracticeResult = (type: SkillType, score: number | null, n: Notice | null) => {
    clearTimeout(practiceTimer);
    const rows: Node[] = [h('div', { className: 'skill-big small' }, [formatScore(type, score)])];
    if (n) {
      if (n.newTeamBest) rows.push(h('p', { className: 'skill-record team' }, ['🏆 팀 신기록!']));
      else if (n.newMyBest) rows.push(h('p', { className: 'skill-record' }, ['내 최고 기록 갱신!']));
      rows.push(h('dl', { className: 'skill-bests' }, [
        h('dt', {}, ['내 최고']), h('dd', {}, [formatScore(type, n.myBest?.score)]),
        h('dt', {}, ['팀 최고']), h('dd', {}, [n.teamBest ? `${n.teamBest.playerId === myId ? '나' : n.teamBest.nickname} · ${formatScore(type, n.teamBest.score)}` : '기록 없음']),
      ]));
    }
    const again = h('button', { type: 'button', className: 'skill-btn' }, ['한 판 더']);
    const closeBtn = h('button', { type: 'button', className: 'skill-btn ghost' }, ['닫기']);
    again.addEventListener('click', () => runPractice(type));
    closeBtn.addEventListener('click', close);
    stage.replaceChildren(h('div', { className: 'skill-wait' }, [...rows, again, closeBtn]));
    again.focus({ preventScroll: true });
  };

  return {
    /** 내가 서 있는 경쟁 존 부스 (없으면 null) */
    setBooth(type: SkillType | null) {
      if (type === booth) return;
      booth = type;
      refreshPracticeBtn();
    },
    setRunning(v: boolean) {
      running = v;
      if (v && practiceType) close();
      refreshPracticeBtn();
    },
    setWinnersTarget(n: number) {
      winnersTarget = n;
      submitted = false;
    },
    practiceResult(n: Notice) {
      if (practiceType && n.gameType === practiceType) showPracticeResult(practiceType, n.score ?? null, n);
    },

    start(m: SkillMessage) {
      clearAll();
      matchType = m.gameType ?? 'STOP';
      const players = m.players ?? [];
      layer.hidden = false;
      refreshPracticeBtn();
      title.textContent = SKILL_NAME[matchType];
      if (!players.includes(myId)) {
        sub.textContent = '이번 판은 구경해요';
        waiting('다른 사람들이 하고 있어요');
        return;
      }
      sub.textContent = `한 번뿐이에요 · 꼴찌${winnersTarget > 1 ? `부터 ${winnersTarget}명` : ''}가 커피`;
      if (submitted) { waiting('기록을 냈어요'); return; }
      const startsIn = m.startsInMs ?? 3000;
      const playMs = m.playMs ?? 25000;
      const begin = () => {
        play = startSkill(matchType, stage, (score, extra) => {
          submitted = true;
          if (score != null) actions.submit(score, extra);
          later(() => {
            play?.destroy();
            play = null;
            waiting(score == null ? '시간이 지나 기록이 없어요' : `내 기록 ${formatScore(matchType, score)}`);
          }, 900);
        });
        // 남은 플레이 시간이 지나면 끝 (탑 쌓기는 지금까지 쌓은 층으로)
        later(() => play?.forceEnd(), Math.max(0, playMs + Math.min(0, startsIn)));
      };
      if (startsIn > 0) countdown(startsIn, begin);
      else begin();
    },

    progress(m: SkillMessage) {
      const p = layer.querySelector('#skill-progress');
      if (p) p.textContent = `${m.done}/${m.total}명 끝났어요`;
    },

    /** 1등부터 한 명씩, 마지막에 커피 당첨. @return 발표가 끝날 때까지 걸리는 시간(ms) */
    result(m: SkillMessage): number {
      clearAll();
      const type = m.gameType ?? matchType;
      const ranking = m.ranking ?? [];
      layer.hidden = false;
      title.textContent = `${SKILL_NAME[type]} 순위`;
      sub.textContent = '1등부터 발표해요';
      const list = h('ol', { className: 'skill-rank' });
      stage.replaceChildren(list);
      const coffeeFrom = ranking.length - winnersTarget;
      ranking.forEach((e, i) => {
        later(() => {
          const coffee = i >= coffeeFrom;
          const li = h('li', { className: `${e.player === myId ? 'me' : ''} ${coffee ? 'coffee' : ''}` }, [
            h('span', { className: 'rk' }, [String(i + 1)]),
            h('span', { className: 'nm' }, [e.player === myId ? '나' : nameOf(e.player), ...(coffee ? [h('b', {}, [' ☕ 커피'])] : [])]),
            h('span', { className: 'sc' }, [formatScore(type, e.score)]),
          ]);
          list.append(li);
          if (coffee) sfx.boom(); else sfx.tick();
          if (i === ranking.length - 1) {
            const me = ranking.findIndex((r) => r.player === myId);
            sub.textContent = me < 0 ? '' : me >= coffeeFrom ? '내가 커피 당첨!' : me === 0 ? '내가 1등!' : `나는 ${me + 1}등`;
          }
        }, (i + 1) * REVEAL_EACH_MS);
      });
      const total = ranking.length * REVEAL_EACH_MS + REVEAL_TAIL_MS;
      later(() => { layer.hidden = true; refreshPracticeBtn(); }, total + 400);
      return total;
    },

    finish() {
      if (!practiceType) close();
      submitted = false;
    },
  };
}
