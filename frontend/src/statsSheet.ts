import { characterDataUrl } from './characters';
import type { Best, SkillType } from './net/loungeSocket';
import { SKILL_NAME, formatScore } from './skill/games';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

interface Row { playerId: string; nickname: string; characterIndex: number; wins: number; days: number }
interface Stats { period: string; label: string; days: number; totalWins: number; rows: Row[] }
type Period = 'this' | 'last' | 'all';
interface GameBest { gameType: SkillType; lowerBetter: boolean; team: Best | null; mine: Best | null }

/** 통계 게시판: 이번 달 · 지난달 · 전체, 당첨 많은 순 (연습판 제외, 참여는 하루 1번) */
export function createStatsSheet(root: HTMLElement, slug: string, teamName: string, myId: string) {
  const tabs = (['this', 'last', 'all'] as Period[]).map((p) => {
    const b = h('button', { type: 'button', role: 'tab' }, [p === 'this' ? '이번 달' : p === 'last' ? '지난달' : '전체']);
    b.addEventListener('click', () => void load(p));
    return { p, b };
  });
  const summary = h('p', { className: 'stats-sum' });
  const bests = h('div', { className: 'stats-bests', role: 'list', ariaLabel: '경쟁 존 최고 기록' });
  const rows = h('div', { className: 'stats-rows' });
  const close = h('button', { type: 'button', className: 'sheet-close' }, ['닫기']);
  const sheet = h('div', { className: 'sheet stats-sheet', hidden: true, role: 'dialog', ariaLabel: '통계' }, [
    h('h2', {}, [`${teamName} 통계`]),
    h('div', { className: 'stats-tabs', role: 'tablist' }, tabs.map((t) => t.b)),
    summary,
    h('div', { className: 'stats-table', role: 'table', ariaLabel: '당첨·참여 횟수' }, [
      h('div', { className: 'stats-row head', role: 'row' }, [h('span', { role: 'columnheader' }, ['이름']), h('span', { role: 'columnheader' }, ['당첨']), h('span', { role: 'columnheader' }, ['참여'])]),
      rows,
    ]),
    h('p', { className: 'sheet-note' }, ['연습판은 빠져 있어요 · 참여는 하루 한 번으로 세요']),
    h('h3', { className: 'stats-sub' }, ['경쟁 존 최고 기록']),
    bests,
    close,
  ]);
  root.append(sheet);
  close.addEventListener('click', () => { sheet.hidden = true; });

  async function load(period: Period) {
    tabs.forEach((t) => t.b.setAttribute('aria-selected', String(t.p === period)));
    summary.textContent = '불러오는 중…';
    try {
      const res = await fetch(`/api/teams/${encodeURIComponent(slug)}/stats?period=${period}`);
      if (!res.ok) throw new Error();
      const s = (await res.json()) as Stats;
      summary.textContent = s.days === 0 ? `${s.label}에는 아직 기록이 없어요` : `${s.label} · 내기 ${s.days}일 · 커피 당첨 ${s.totalWins}번`;
      rows.replaceChildren(...s.rows.map((r) => h('div', { className: `stats-row${r.playerId === myId ? ' me' : ''}`, role: 'row' }, [
        h('span', { role: 'cell', className: 'stats-name' }, [h('img', { src: characterDataUrl(r.characterIndex, 1), alt: '' }), r.nickname]),
        h('span', { role: 'cell' }, [`${r.wins}번`]),
        h('span', { role: 'cell' }, [`${r.days}일`]),
      ])));
    } catch {
      summary.textContent = '통계를 불러오지 못했어요. 잠시 후 다시 열어 주세요.';
      rows.replaceChildren();
    }
  }

  async function loadBests() {
    try {
      const res = await fetch(`/api/teams/${encodeURIComponent(slug)}/bests?player=${encodeURIComponent(myId)}`);
      if (!res.ok) throw new Error();
      const list = (await res.json()) as GameBest[];
      bests.replaceChildren(...list.map((g) => h('div', { className: 'best-card', role: 'listitem' }, [
        h('b', {}, [SKILL_NAME[g.gameType]]),
        h('span', { className: 'best-team' }, [g.team ? `🏆 ${g.team.playerId === myId ? '나' : g.team.nickname} · ${formatScore(g.gameType, g.team.score)}` : '아직 기록이 없어요']),
        h('span', { className: 'best-mine' }, [`내 최고 ${formatScore(g.gameType, g.mine?.score)}`]),
      ])));
    } catch {
      bests.replaceChildren(h('p', { className: 'sheet-note' }, ['최고 기록을 불러오지 못했어요.']));
    }
  }

  return {
    open() {
      sheet.hidden = false;
      void load('this');
      void loadBests();
    },
  };
}
