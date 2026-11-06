import * as THREE from 'three';
import { canvasTexture, roundRect } from './materials';

const FONT = "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

/** 머리 위 이름표. 크기는 화면 확대와 상관없이 월드 단위로 고정. */
export function nameLabel(text: string, highlight: boolean): THREE.Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = `${highlight ? 'bold ' : ''}44px ${FONT}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 44;
  c.width = w;
  c.height = 72;
  ctx.font = font;
  ctx.fillStyle = highlight ? '#FF6A3D' : 'rgba(255,255,255,0.94)';
  roundRect(ctx, 0, 0, w, 72, 36);
  ctx.fill();
  ctx.fillStyle = highlight ? '#FFFFFF' : '#18202B';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 38);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), depthTest: false }));
  sprite.scale.set(w / 150, 72 / 150, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** 부스 표지판 */
export function signLabel(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  roundRect(ctx, 0, 0, 320, 96, 30);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 44px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 50);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), depthTest: false }));
  sprite.scale.set(1.9, 0.57, 1);
  sprite.renderOrder = 5;
  return sprite;
}

export function disposeSprite(s: THREE.Sprite) {
  s.material.map?.dispose();
  s.material.dispose();
}

/** 말풍선 (40자까지, 줄바꿈) */
export function chatBubble(text: string): THREE.Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = `40px ${FONT}`;
  ctx.font = font;
  const lines: string[] = [];
  let line = '';
  for (const ch of Array.from(text)) {
    if (ctx.measureText(line + ch).width > 420) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  const w = Math.min(470, Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 48);
  const h = lines.length * 50 + 34;
  c.width = w;
  c.height = h + 22;
  ctx.font = font;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = 'rgba(24,32,43,0.15)';
  ctx.lineWidth = 3;
  roundRect(ctx, 2, 2, w - 4, h - 4, 26);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w / 2 - 14, h - 4);
  ctx.lineTo(w / 2, h + 18);
  ctx.lineTo(w / 2 + 14, h - 4);
  ctx.fill();
  ctx.fillStyle = '#18202B';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, 46 + i * 50));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), depthTest: false }));
  sprite.scale.set(w / 170, c.height / 170, 1);
  sprite.renderOrder = 12;
  return sprite;
}

/** 이모지 하나짜리 아이콘 (왕관, 💤, 이모티콘) */
export function iconSprite(emoji: string, size: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = '96px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 70);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), depthTest: false }));
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 11;
  return sprite;
}
