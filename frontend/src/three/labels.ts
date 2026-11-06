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
