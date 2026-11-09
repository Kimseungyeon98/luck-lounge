import * as THREE from 'three';
import { mat } from './materials';

/**
 * SD 캐주얼 캐릭터 10종 v2 (약 2.2등신, 코드로 만든 모델).
 * 그려 넣은 얼굴(표정 5가지·눈 깜빡임), 갈래 앞머리, 후드티 실루엣.
 *
 * 다른 모델(glTF 등)로 바꿀 때는 {@link setCharacterFactory} 로 공장 함수만 갈아 끼우면 된다.
 * 공장 함수는 번호(0~9)를 받아 {@link CharacterRig} 를 돌려주면 되고,
 * 걷기 동작은 rig 의 팔·다리 관절을 흔드는 방식이라 glTF 쪽은 AnimationMixer 로 대신해도 된다.
 * 표정(setFace)과 깜빡임(tick)은 없어도 된다.
 */
export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Object3D;
  head?: THREE.Object3D;
  legL?: THREE.Object3D;
  legR?: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
  /** 바닥에서 머리 꼭대기까지 높이 (이름표 위치 계산용) */
  height: number;
  setFace?(face: Face): void;
  tick?(dt: number): void;
}

/** 기본 · 검댕(폭탄 당첨) · 놀람(풍선 당첨) · 웃음(당첨 피함) · 졸림(자리비움) */
export type Face = 'normal' | 'soot' | 'surprised' | 'happy' | 'sleepy';

export type CharacterFactory = (index: number) => CharacterRig;

const SKINS = [0xf6d2b4, 0xedc09a, 0xd9a27a, 0xf8dcc4, 0xc98e66];
const HAIRS = [0x2a2320, 0x5a3a26, 0x1b1b1f, 0x8a5a32, 0xb9b2a8, 0x3a2a55, 0x6b3a2a, 0x232323, 0xd9a55b, 0x4a3426];
const TOPS = [0x4c7bf4, 0xf08a4b, 0x3fa97c, 0xd565b0, 0xf2c94c, 0x5bb8d6, 0x8a6fe0, 0xe85d6e, 0x7fa04a, 0xb08a6a];
const PANTS = 0x4a5878;
const SHOES = 0xffffff;

const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const glassesMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });

function part(geo: THREE.BufferGeometry, material: THREE.Material | number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, typeof material === 'number' ? mat(material) : material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const sphere = (r: number, w = 20, h = 16) => new THREE.SphereGeometry(r, w, h);
const cylinder = (rt: number, rb: number, h: number, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);

const capsules = new Map<string, THREE.LatheGeometry>();
/** 둥근 팔다리 */
function capsule(r: number, len: number): THREE.LatheGeometry {
  const key = `${r}:${len}`;
  let g = capsules.get(key);
  if (!g) {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * r), Math.sin(a) * r - len / 2));
    }
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * r), Math.sin(a) * r + len / 2));
    }
    g = new THREE.LatheGeometry(pts, 16);
    capsules.set(key, g);
  }
  return g;
}

/** 후드티 몸통 (아래가 살짝 퍼지는 종 모양) */
const TORSO = new THREE.LatheGeometry(
  [[0.0001, 0], [0.2, 0], [0.245, 0.03], [0.255, 0.1], [0.235, 0.22], [0.195, 0.31], [0.12, 0.37], [0.0001, 0.38]]
    .map(([x, y]) => new THREE.Vector2(x, y)),
  24,
);

/* ---------- 얼굴 그림 ---------- */

const faces = new Map<string, THREE.CanvasTexture>();

/** 얼굴을 캔버스에 그려 머리 앞쪽 곡면에 붙인다. 모든 캐릭터가 같은 그림을 같이 쓴다. */
export function faceTexture(kind: Face | 'blink'): THREE.CanvasTexture {
  const cached = faces.get(kind);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const L = 84, R = 172, EY = 122, ink = '#2B2026', lip = '#7A3A30';
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const blush = (alpha: number) => {
    x.fillStyle = `rgba(255,120,120,${alpha})`;
    for (const bx of [L - 24, R + 24]) { x.beginPath(); x.ellipse(bx, EY + 32, 18, 9, 0, 0, Math.PI * 2); x.fill(); }
  };
  const eyes = (rx: number, ry: number) => {
    for (const ex of [L, R]) {
      x.fillStyle = ink; x.beginPath(); x.ellipse(ex, EY, rx, ry, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#6B4A5A'; x.beginPath(); x.ellipse(ex, EY + ry * 0.45, rx * 0.7, ry * 0.35, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(ex + rx * 0.35, EY - ry * 0.4, rx * 0.42, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(ex - rx * 0.35, EY + ry * 0.35, rx * 0.18, 0, Math.PI * 2); x.fill();
    }
  };
  const strokes = (draw: (ex: number) => void, w = 6) => {
    x.strokeStyle = ink; x.lineWidth = w;
    for (const ex of [L, R]) { x.beginPath(); draw(ex); x.stroke(); }
  };
  const smile = () => { x.strokeStyle = lip; x.lineWidth = 5; x.beginPath(); x.arc(128, 160, 12, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke(); };
  const closed = (dy: number) => strokes((ex) => { x.moveTo(ex - 15, EY + dy); x.quadraticCurveTo(ex, EY + dy + 7, ex + 15, EY + dy); });

  switch (kind) {
    case 'blink':
      closed(2); blush(0.45); smile();
      break;
    case 'happy':
      strokes((ex) => { x.moveTo(ex - 15, EY + 7); x.quadraticCurveTo(ex, EY - 16, ex + 15, EY + 7); }, 7);
      blush(0.6);
      x.fillStyle = lip; x.beginPath(); x.moveTo(110, 156); x.quadraticCurveTo(128, 194, 146, 156); x.closePath(); x.fill();
      x.fillStyle = '#E88A8A'; x.beginPath(); x.ellipse(128, 172, 9, 5, 0, 0, Math.PI * 2); x.fill();
      break;
    case 'surprised':
      for (const ex of [L, R]) {
        x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(ex, EY, 19, 0, Math.PI * 2); x.fill();
        x.strokeStyle = ink; x.lineWidth = 4; x.stroke();
        x.fillStyle = ink; x.beginPath(); x.arc(ex, EY + 2, 8, 0, Math.PI * 2); x.fill();
      }
      strokes((ex) => { x.moveTo(ex - 14, EY - 38); x.quadraticCurveTo(ex, EY - 48, ex + 14, EY - 40); }, 5);
      blush(0.35);
      x.fillStyle = lip; x.beginPath(); x.ellipse(128, 176, 10, 13, 0, 0, Math.PI * 2); x.fill();
      break;
    case 'soot':
      x.fillStyle = 'rgba(46,38,40,0.62)';
      for (const [bx, by, br] of [[70, 92, 34], [150, 100, 28], [196, 150, 26], [100, 170, 30], [140, 196, 22], [52, 150, 20]]) {
        x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill();
      }
      strokes((ex) => {
        for (let a = 0; a < Math.PI * 5; a += 0.2) {
          const rr = 2 + a * 1.1;
          const px = ex + Math.cos(a) * rr, py = EY + Math.sin(a) * rr;
          if (a === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
      }, 3.5);
      x.strokeStyle = '#F2E8DC'; x.lineWidth = 4; x.beginPath();
      x.moveTo(110, 170); x.quadraticCurveTo(119, 162, 128, 170); x.quadraticCurveTo(137, 178, 146, 170); x.stroke();
      break;
    case 'sleepy':
      closed(4); blush(0.4);
      x.fillStyle = lip; x.beginPath(); x.ellipse(128, 166, 5, 6, 0, 0, Math.PI * 2); x.fill();
      break;
    default:
      eyes(18, 25); blush(0.45); smile();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  faces.set(kind, t);
  return t;
}

/** 머리 앞쪽 곡면 (얼굴 그림을 붙이는 자리) */
const FACE_GEO = new THREE.SphereGeometry(0.424, 36, 28, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.75, 1.5);

/* ---------- 머리 ---------- */

interface Head { head: THREE.Group; facePatch: THREE.Mesh }

function buildHead(i: number, skin: number, hair: number): Head {
  const head = new THREE.Group();
  const face = part(sphere(0.42, 32, 24), skin);
  face.scale.set(1, 0.94, 0.96);
  head.add(face);
  const facePatch = new THREE.Mesh(FACE_GEO, new THREE.MeshBasicMaterial({
    map: faceTexture('normal'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  facePatch.renderOrder = 2;
  face.add(facePatch);

  // 옆머리가 귀를 덮는 머리 모양은 귀를 만들지 않는다 (머리카락을 뚫고 나오지 않게)
  const sideHair = i === 1 || i === 2;
  if (!sideHair) for (const x of [-0.41, 0.41]) head.add(part(sphere(0.075, 12, 10), skin, x, -0.02, 0));

  /** 정수리: 이마는 드러나도록 위쪽만 */
  const cap = (color: number, s = 1.04, y = 0.02) => {
    const c = part(new THREE.SphereGeometry(0.45, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.46), color, 0, y, 0);
    c.scale.set(s, 1, s);
    head.add(c);
  };
  /** 뒤통수: 뒤쪽 반구를 목덜미까지 덮어 살이 비치지 않게 */
  const back = (color: number, s = 1.04, down = 0.68) => {
    const b = part(new THREE.SphereGeometry(0.45, 32, 18, Math.PI, Math.PI, 0, Math.PI * down), color, 0, 0.02, 0);
    b.scale.set(s, 1, s);
    head.add(b);
  };
  /** 여러 갈래로 나눈 앞머리 */
  const tufts = (color: number, n: number, y: number, spread: number) => {
    for (let k = 0; k < n; k++) {
      const a = (k - (n - 1) / 2) * spread;
      const t = part(sphere(0.15, 16, 12), color, Math.sin(a) * 0.37, y, Math.cos(a) * 0.37);
      t.scale.set(1.05, 0.78, 0.55);
      t.rotation.set(-0.35, a, 0);
      head.add(t);
    }
  };

  switch (i) {
    case 0: cap(hair, 1.03); back(hair, 1.03); tufts(hair, 5, 0.2, 0.36); break; // 짧은 머리
    case 1: // 단발: 옆머리가 귀를 덮음
      cap(hair, 1.05); back(hair, 1.05, 0.72); tufts(hair, 5, 0.2, 0.36);
      for (const s of [-1, 1]) {
        const side = part(sphere(0.22, 18, 14), hair, s * 0.4, -0.08, -0.02);
        side.scale.set(0.62, 1.2, 1.0);
        head.add(side);
      }
      break;
    case 2: { // 긴 생머리: 뒤통수 전체 + 등까지 내려오는 머리
      cap(hair, 1.05); back(hair, 1.06, 0.8); tufts(hair, 5, 0.2, 0.36);
      const long = part(sphere(0.42, 24, 18), hair, 0, -0.3, -0.2);
      long.scale.set(1.08, 1.35, 0.62);
      head.add(long);
      for (const s of [-1, 1]) {
        const side = part(sphere(0.2, 16, 12), hair, s * 0.4, -0.18, -0.02);
        side.scale.set(0.55, 1.6, 0.95);
        head.add(side);
      }
      break;
    }
    case 3: cap(hair); back(hair); tufts(hair, 5, 0.2, 0.36); head.add(part(sphere(0.17, 16, 12), hair, 0, 0.5, -0.1)); break; // 똥머리
    case 4: { // 야구모자
      back(hair, 1.03, 0.62);
      cap(0x2f6bff, 1.08, 0.05);
      const brim = part(cylinder(0.3, 0.3, 0.035, 28), 0x2f6bff, 0, 0.2, 0.3);
      brim.rotation.x = 0.25;
      brim.scale.set(1, 1, 0.8);
      head.add(brim);
      head.add(part(sphere(0.05, 10, 8), 0x2f6bff, 0, 0.52, 0));
      tufts(hair, 3, 0.02, 0.9);
      break;
    }
    case 5: // 곱슬
      cap(hair); back(hair);
      for (let k = 0; k < 13; k++) {
        const a = (k / 13) * Math.PI * 2;
        head.add(part(sphere(0.13, 12, 10), hair, Math.cos(a) * 0.36, 0.22 + Math.sin(k * 1.7) * 0.05, Math.sin(a) * 0.34 - 0.04));
      }
      break;
    case 6: { // 올린 앞머리
      cap(hair); back(hair);
      const puff = part(sphere(0.2, 20, 14), hair, 0, 0.34, 0.24);
      puff.scale.set(1.6, 0.7, 0.9);
      head.add(puff);
      break;
    }
    case 7: { // 안경
      cap(hair, 1.03); back(hair, 1.03); tufts(hair, 5, 0.22, 0.36);
      for (const x of [-0.15, 0.15]) head.add(part(new THREE.TorusGeometry(0.1, 0.016, 8, 24), glassesMat, x, -0.02, 0.405));
      const bridge = part(cylinder(0.01, 0.01, 0.1, 6), glassesMat, 0, -0.02, 0.415);
      bridge.rotation.z = Math.PI / 2;
      head.add(bridge);
      break;
    }
    case 8: // 비니
      back(hair, 1.03, 0.62);
      cap(0xe85d6e, 1.07, 0.06);
      head.add(part(cylinder(0.465, 0.465, 0.11, 32), 0xc94b5b, 0, 0.1, 0));
      head.add(part(sphere(0.09, 12, 10), 0xffffff, 0, 0.53, 0));
      tufts(hair, 3, 0, 0.9);
      break;
    default: // 양갈래
      cap(hair); back(hair); tufts(hair, 5, 0.2, 0.36);
      for (const x of [-0.4, 0.4]) {
        head.add(part(sphere(0.14, 14, 10), hair, x, 0.12, -0.08));
        const tail = part(sphere(0.13, 14, 10), hair, x * 1.12, -0.2, -0.1);
        tail.scale.set(0.8, 1.7, 0.8);
        tail.rotation.z = x > 0 ? -0.25 : 0.25;
        head.add(tail);
      }
  }
  return { head, facePatch };
}

/* ---------- 몸 ---------- */

function sdCasual(index: number): CharacterRig {
  const i = ((index % 10) + 10) % 10;
  const skin = SKINS[i % 5];
  const hair = HAIRS[i];
  const top = TOPS[i];

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const leg = (x: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0.3, 0);
    p.add(part(capsule(0.082, 0.1), PANTS, 0, -0.09, 0));
    const shoe = part(sphere(0.1, 16, 12), SHOES, 0, -0.235, 0.035);
    shoe.scale.set(1, 0.62, 1.38);
    p.add(shoe);
    body.add(p);
    return p;
  };
  const legL = leg(-0.11);
  const legR = leg(0.11);

  // 후드티
  body.add(part(TORSO, top, 0, 0.28, 0));
  const hood = part(new THREE.TorusGeometry(0.16, 0.065, 10, 24), top, 0, 0.64, -0.09);
  hood.rotation.x = Math.PI / 2 + 0.5;
  body.add(hood);
  body.add(part(new THREE.BoxGeometry(0.2, 0.08, 0.03), new THREE.Color(top).offsetHSL(0, 0, 0.07).getHex(), 0, 0.38, 0.238));
  for (const x of [-0.05, 0.05]) body.add(part(cylinder(0.009, 0.009, 0.12, 6), whiteMat, x, 0.56, 0.2));

  const arm = (x: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0.6, 0);
    p.rotation.z = x < 0 ? -0.3 : 0.3;
    p.add(part(capsule(0.066, 0.1), top, 0, -0.09, 0));
    p.add(part(sphere(0.072, 14, 10), skin, 0, -0.22, 0));
    body.add(p);
    return p;
  };
  const armL = arm(-0.22);
  const armR = arm(0.22);

  const { head, facePatch } = buildHead(i, skin, hair);
  head.position.y = 1.08;
  body.add(head);

  // 표정과 깜빡임. 자리비움 때 재질이 복제될 수 있어 지금 붙어 있는 재질의 그림을 바꾼다.
  let face: Face = 'normal';
  let blinkIn = 2 + Math.random() * 3;
  let blinking = 0;
  const show = (kind: Face | 'blink') => {
    const m = facePatch.material as THREE.MeshBasicMaterial;
    m.map = faceTexture(kind);
  };

  return {
    root, body, head, legL, legR, armL, armR, height: 1.55,
    setFace(kind) {
      if (kind === face) return;
      face = kind;
      blinking = 0;
      show(kind);
    },
    tick(dt) {
      if (face !== 'normal') return;
      if (blinking > 0) {
        blinking -= dt;
        if (blinking <= 0) { show('normal'); blinkIn = 3 + Math.random() * 2; }
      } else {
        blinkIn -= dt;
        if (blinkIn <= 0) { show('blink'); blinking = 0.13; }
      }
    },
  };
}

let factory: CharacterFactory = sdCasual;

/** 다른 모델로 바꿀 때 호출. 예: setCharacterFactory(i => rigFromGltf(loadedModels[i])) */
export function setCharacterFactory(f: CharacterFactory) {
  factory = f;
}

export function createCharacter(index: number): CharacterRig {
  return factory(index);
}
