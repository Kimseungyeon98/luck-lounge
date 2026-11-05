import './style.css';
import { api, ApiError } from './api';
import { showEntry } from './entry';

const app = document.getElementById('app')!;
const gameRoot = document.getElementById('game')!;

function notice(title: string, body: string) {
  const main = document.createElement('main');
  main.className = 'notice';
  const h1 = document.createElement('h1');
  h1.textContent = title;
  const p = document.createElement('p');
  p.textContent = body;
  main.append(h1, p);
  app.replaceChildren(main);
}

async function boot() {
  const match = location.pathname.match(/^\/t\/([a-z0-9]+)\/?$/);
  if (!match) {
    notice('운빨 라운지', '팀 링크로 들어와 주세요. 링크는 단톡방 공지에 있어요.');
    return;
  }
  const slug = match[1];
  let team;
  try {
    team = await api.team(slug);
  } catch (e) {
    notice('들어갈 수 없어요', e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요.');
    return;
  }
  document.title = `${team.name} · 운빨 라운지`;
  const me = await showEntry(app, team);
  app.replaceChildren();
  const { startLobby } = await import('./lobby/startLobby');
  await startLobby(gameRoot, team, me);
}

void boot();
