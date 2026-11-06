import type { MatchMessage } from './net/loungeSocket';
import type { LoungeView } from './three/LoungeView';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K];
  node.append(...children);
  return node;
}

/**
 * 내기 진행 표시: 투표 카운트다운과 부스별 인원, 결과 발표, 판 사이 안내, 오늘의 결과 요약.
 * 시한폭탄 한 판 안의 표시는 bombHud 가 맡는다.
 */
export function createMatchHud(root: HTMLElement, view: LoungeView | null, teamName: string, myId: string, nameOf: (id: string) => string, toast: (t: string) => void, openStats: () => void) {
  const GAME_NAME = { BOMB: '시한폭탄', BALLOON: '풍선 불기' } as const;
  const count = h('div', { className: 'vote-count' });
  const tBomb = h('span', { className: 'b' });
  const tBalloon = h('span', { className: 'p' });
  const tNone = h('span', { className: 'n' });
  const voteBar = h('div', { className: 'vote-bar', hidden: true, role: 'status' }, [
    h('p', { className: 'vote-title' }, ['원하는 게임 부스로 걸어가세요']), count, h('div', { className: 'tally' }, [tBomb, tBalloon, tNone]),
  ]);
  const banner = h('div', { className: 'match-banner', hidden: true, role: 'status' });
  const sumList = h('ol');
  const sumMeta = h('p', { className: 'sum-meta' });
  const copy = h('button', { type: 'button' }, ['결과 복사']);
  const stats = h('button', { type: 'button' }, ['통계 보기']);
  const close = h('button', { type: 'button', className: 'primary2' }, ['닫기']);
  const summary = h('div', { className: 'match-summary', hidden: true, role: 'dialog', ariaLabel: '오늘의 결과' }, [
    h('h2', {}, ['오늘의 커피 담당']), sumList, sumMeta, h('div', { className: 'sum-btns three' }, [copy, stats, close]),
  ]);
  stats.addEventListener('click', () => { summary.hidden = true; openStats(); });
  root.append(voteBar, banner, summary);

  let voteTimer = 0;
  let voteEndsAt = 0;
  let bannerTimer = 0;
  let copyText = '';

  const showBanner = (title: string, sub: string, ms: number) => {
    banner.replaceChildren(h('b', {}, [title]), h('span', {}, [sub]));
    banner.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => { banner.hidden = true; }, ms);
  };

  const stopVote = () => {
    clearInterval(voteTimer);
    voteBar.hidden = true;
    view?.setVoting(false);
  };

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      copy.textContent = '복사됨';
    } catch {
      copy.textContent = '복사가 안 돼요';
    }
  });
  close.addEventListener('click', () => { summary.hidden = true; });

  return {
    handle(m: MatchMessage, onRunning: (running: boolean) => void) {
      switch (m.type) {
        case 'vote': {
          summary.hidden = true;
          onRunning(true);
          view?.setVoting(true);
          voteEndsAt = performance.now() + (m.endsInMs ?? 10000);
          voteBar.hidden = false;
          const render = () => {
            const left = Math.max(0, Math.ceil((voteEndsAt - performance.now()) / 1000));
            count.textContent = String(left);
            const c = view?.voteCounts() ?? { bomb: 0, balloon: 0, abstain: 0 };
            tBomb.textContent = `시한폭탄 ${c.bomb}`;
            tBalloon.textContent = `풍선 ${c.balloon}`;
            tNone.textContent = `기권 ${c.abstain}`;
          };
          render();
          clearInterval(voteTimer);
          voteTimer = window.setInterval(render, 200);
          break;
        }
        case 'voteResult': {
          stopVote();
          const tally = `시한폭탄 ${m.bomb} · 풍선 ${m.balloon} · 기권 ${m.abstain}`;
          const tie = m.bomb === m.balloon;
          const game = GAME_NAME[m.gameType ?? 'BOMB'];
          showBanner(`${tie ? '동률이라 무작위로 ' : ''}${game} 결정!`, `${tally} · ${m.participants}명 참가 · 당첨 ${m.winnersTarget}명`, 3000);
          break;
        }
        case 'cancel':
          stopVote();
          onRunning(false);
          toast(m.message ?? '취소됐어요');
          break;
        case 'round':
          banner.hidden = true;
          break;
        case 'roundEnd':
          if (m.more && m.loser) {
            window.setTimeout(() => {
              showBanner(`${m.round}판 당첨: ${m.loser === myId ? '나' : nameOf(m.loser!)}`, `남은 ${m.remaining}명으로 곧 ${(m.round ?? 0) + 1}판을 시작해요`, 1300);
            }, 2850);
          }
          break;
        case 'summary': {
          const winners = m.winners ?? [];
          sumList.replaceChildren(...winners.map((w) => h('li', {}, [`${w.playerId === myId ? '나' : nameOf(w.playerId)} (${w.round}판)`])));
          const game = GAME_NAME[m.gameType ?? 'BOMB'];
          sumMeta.textContent = `${game} · ${m.participants}명 참가 · ${m.practice ? '연습판 (통계에서 빠져요)' : '기록에 저장했어요'}`;
          const d = new Date();
          copyText = `[운빨 라운지] ${d.getMonth() + 1}월 ${d.getDate()}일 ${teamName} 커피 담당: ${winners.map((w) => nameOf(w.playerId)).join(', ')} (${game}, ${m.participants}명 참가)`;
          copy.textContent = '결과 복사';
          window.setTimeout(() => { summary.hidden = false; }, 2900);
          break;
        }
        case 'finish':
          stopVote();
          banner.hidden = true;
          onRunning(false);
          break;
      }
    },
  };
}
