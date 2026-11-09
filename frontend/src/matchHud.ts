import type { GameType, MatchMessage } from './net/loungeSocket';
import { REVEAL_EACH_MS, REVEAL_TAIL_MS } from './skillHud';
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
  const GAME_NAME: Record<GameType, string> = { BOMB: '시한폭탄', BALLOON: '풍선', STOP: '10초 멈추기', TOWER: '탑 쌓기' };
  const GAMES: GameType[] = ['BOMB', 'BALLOON', 'STOP', 'TOWER'];
  const isSkill = (g?: GameType) => g === 'STOP' || g === 'TOWER';
  const count = h('div', { className: 'vote-count' });
  const SHORT: Record<GameType, string> = { BOMB: '폭탄', BALLOON: '풍선', STOP: '10초', TOWER: '탑' };
  const tGames = GAMES.map((g) => h('span', { className: `g-${g.toLowerCase()}` }));
  const tNone = h('span', { className: 'n' });
  const voteBar = h('div', { className: 'vote-bar', hidden: true, role: 'status' }, [
    h('p', { className: 'vote-title' }, ['원하는 게임 부스로 걸어가세요']), count, h('div', { className: 'tally' }, [...tGames, tNone]),
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
  // 투표 중 내가 어느 부스에 서 있는지
  const myVote = h('div', { className: 'my-vote', hidden: true, role: 'status' });
  root.append(voteBar, myVote, banner, summary);

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
    myVote.hidden = true;
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
          myVote.hidden = false;
          const render = () => {
            const left = Math.max(0, Math.ceil((voteEndsAt - performance.now()) / 1000));
            count.textContent = String(left);
            const c = view?.voteCounts() ?? { BOMB: 0, BALLOON: 0, STOP: 0, TOWER: 0, abstain: 0 };
            GAMES.forEach((g, i) => { tGames[i].textContent = `${SHORT[g]} ${c[g]}`; });
            const mine = view?.myBooth() ?? null;
            myVote.textContent = mine ? `내 표: ${GAME_NAME[mine]}` : '부스 밖 · 투표는 기권, 게임엔 참가해요';
            myVote.classList.toggle('on', !!mine);
            tNone.textContent = `기권 ${c.abstain}`;
          };
          render();
          clearInterval(voteTimer);
          voteTimer = window.setInterval(render, 200);
          break;
        }
        case 'voteResult': {
          stopVote();
          const votes = m.votes ?? { BOMB: 0, BALLOON: 0, STOP: 0, TOWER: 0 };
          const tally = [...GAMES.filter((g) => votes[g] > 0).map((g) => `${GAME_NAME[g]} ${votes[g]}`), `기권 ${m.abstain}`].join(' · ');
          const top = Math.max(...GAMES.map((g) => votes[g]));
          const tie = GAMES.filter((g) => votes[g] === top).length > 1;
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
          const skill = isSkill(m.gameType);
          const place = (r: number) => (r === 1 ? '꼴찌' : `뒤에서 ${r}등`);
          sumList.replaceChildren(...winners.map((w) => h('li', {}, [`${w.playerId === myId ? '나' : nameOf(w.playerId)} (${skill ? place(w.round) : `${w.round}판`})`])));
          const game = GAME_NAME[m.gameType ?? 'BOMB'];
          sumMeta.textContent = `${game} · ${m.participants}명 참가 · ${m.practice ? '연습판 (통계에서 빠져요)' : '기록에 저장했어요'}`;
          const d = new Date();
          copyText = `[운빨 라운지] ${d.getMonth() + 1}월 ${d.getDate()}일 ${teamName} 커피 담당: ${winners.map((w) => nameOf(w.playerId)).join(', ')} (${game}, ${m.participants}명 참가)`;
          copy.textContent = '결과 복사';
          // 경쟁 게임은 순위 발표가 끝난 뒤에
          const delay = skill ? (m.participants ?? 2) * REVEAL_EACH_MS + REVEAL_TAIL_MS : 2900;
          window.setTimeout(() => { summary.hidden = false; }, delay);
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
