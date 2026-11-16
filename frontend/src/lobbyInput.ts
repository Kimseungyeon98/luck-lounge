import type { MoveMode } from './lobbyHud';
import type { LoungeSocket } from './net/loungeSocket';
import type { LoungeView } from './three/LoungeView';

/**
 * 대기실 조작.
 * - 탭 이동: 누른 바닥 지점을 서버에 목적지로 보낸다
 * - 조이스틱: 누른 자리에 조이스틱이 생기고, 끄는 방향·세기를 0.1초마다(바뀔 때만) 보낸다
 * - 키보드(M10): W A S D 또는 방향키. 어느 이동 방식을 골라 두어도 된다. 말풍선 입력 중에는 무시
 */
export function attachLobbyInput(view: LoungeView, socket: LoungeSocket, getMode: () => MoveMode, onFirstMove: () => void, onBoard: () => void) {
  const canvas = view.canvas;
  const stick = document.createElement('div');
  stick.className = 'stick';
  stick.hidden = true;
  const knob = document.createElement('i');
  stick.append(knob);
  document.body.append(stick);

  let active: { id: number; x: number; y: number } | null = null;
  let pending: { dx: number; dz: number } | null = null;
  let lastSent = { dx: 0, dz: 0 };
  let moved = false;
  const RADIUS = 40;

  const first = () => {
    if (!moved) {
      moved = true;
      onFirstMove();
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (view.hitsBoard(e.clientX, e.clientY)) {
      onBoard();
      return;
    }
    if (getMode() === 'tap') {
      const p = view.floorAt(e.clientX, e.clientY);
      if (p) {
        socket.moveTo(p.x, p.z);
        view.showTapMarker(p.x, p.z);
        first();
      }
      return;
    }
    active = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stick.style.left = `${e.clientX}px`;
    stick.style.top = `${e.clientY}px`;
    knob.style.transform = '';
    stick.hidden = false;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // 일부 브라우저는 캡처를 지원하지 않음
    }
    first();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== active.id) return;
    const dx = e.clientX - active.x;
    const dy = e.clientY - active.y;
    const d = Math.hypot(dx, dy);
    const k = d > RADIUS ? RADIUS / d : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    if (d < 6) {
      pending = { dx: 0, dz: 0 };
      return;
    }
    const s = Math.min(1, d / RADIUS);
    const r = view.screenRight;
    const down = view.screenDown;
    pending = { dx: ((r.x * dx + down.x * dy) / d) * s, dz: ((r.z * dx + down.z * dy) / d) * s };
  });

  const end = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.id) return;
    active = null;
    stick.hidden = true;
    pending = { dx: 0, dz: 0 };
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // ---------- 키보드 ----------
  // e.code 는 자판 위치라 한글 자판(ㅈㅁㄴㅇ)이어도 W A S D 로 들어온다
  const KEYS: Record<string, 'u' | 'd' | 'l' | 'r'> = {
    KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
  };
  const held = new Set<string>();
  const keyDir = () => {
    const sx = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0);
    const sy = (held.has('d') ? 1 : 0) - (held.has('u') ? 1 : 0);
    const len = Math.hypot(sx, sy);
    if (!len) return { dx: 0, dz: 0 };
    const r = view.screenRight;
    const down = view.screenDown;
    return { dx: (r.x * sx + down.x * sy) / len, dz: (r.z * sx + down.z * sy) / len };
  };
  const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  window.addEventListener('keydown', (e) => {
    const k = KEYS[e.code];
    if (!k || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    // 열린 시트·게임 화면(대화상자) 안에서 누른 키는 그 화면 몫
    if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]:not([hidden])')) return;
    e.preventDefault();
    if (held.has(k)) return;
    held.add(k);
    pending = keyDir();
    first();
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYS[e.code];
    if (!k || !held.has(k)) return;
    held.delete(k);
    pending = keyDir();
  });
  const releaseKeys = () => {
    if (!held.size) return;
    held.clear();
    pending = { dx: 0, dz: 0 };
  };
  window.addEventListener('blur', releaseKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys(); });
  // 말풍선 입력칸에 들어가면 걷던 것을 멈춘다
  document.addEventListener('focusin', (e) => { if (typing(e.target)) releaseKeys(); });

  // 조이스틱 방향은 0.1초마다, 바뀌었을 때만 보낸다
  setInterval(() => {
    if (!pending) return;
    const changed = Math.abs(pending.dx - lastSent.dx) > 0.05 || Math.abs(pending.dz - lastSent.dz) > 0.05
      || (pending.dx === 0 && pending.dz === 0 && (lastSent.dx !== 0 || lastSent.dz !== 0));
    if (changed) {
      socket.steer(pending.dx, pending.dz);
      lastSent = pending;
    }
    pending = null;
  }, 100);
}
