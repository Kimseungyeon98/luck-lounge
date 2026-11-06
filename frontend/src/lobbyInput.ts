import type { MoveMode } from './lobbyHud';
import type { LoungeSocket } from './net/loungeSocket';
import type { LoungeView } from './three/LoungeView';

/**
 * 대기실 조작.
 * - 탭 이동: 누른 바닥 지점을 서버에 목적지로 보낸다
 * - 조이스틱: 누른 자리에 조이스틱이 생기고, 끄는 방향·세기를 0.1초마다(바뀔 때만) 보낸다
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
