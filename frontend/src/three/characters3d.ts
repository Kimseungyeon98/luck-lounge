import * as THREE from 'three';
import { mat, matDouble } from './materials';

/**
 * SD 캐주얼 캐릭터 10종 (약 2.2등신, 코드로 만든 로우폴리).
 * 큰 머리에 큰 눈·반짝이·볼터치, 후드티와 운동화.
 *
 * 나중에 glTF 모델로 바꿀 때는 {@link setCharacterFactory} 로 공장 함수만 갈아 끼우면 된다.
 * 공장 함수는 번호(0~9)를 받아 {@link CharacterRig} 를 돌려주면 되고,
 * 걷기 동작은 rig 의 팔·다리 관절을 흔드는 방식이라 glTF 쪽은 AnimationMixer 로 대신해도 된다.
 */
export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Object3D;
  legL?: THREE.Object3D;
  legR?: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
  /** 바닥에서 머리 꼭대기까지 높이 (이름표 위치 계산용) */
  height: number;
}

export type CharacterFactory = (index: number) => CharacterRig;

const SKINS = [0xf6d2b4, 0xedc09a, 0xd9a27a, 0xf8dcc4, 0xc98e66];
const HAIRS = [0x2a2320, 0x5a3a26, 0x1b1b1f, 0x8a5a32, 0xb9b2a8, 0x3a2a55, 0x6b3a2a, 0x232323, 0xd9a55b, 0x4a3426];
const TOPS = [0x4c7bf4, 0xf08a4b, 0x3fa97c, 0xd565b0, 0xf2c94c, 0x5bb8d6, 0x8a6fe0, 0xe85d6e, 0x7fa04a, 0xb08a6a];
const PANTS = 0x4a5878;
const SHOES = 0xffffff;

const eyeMat = new THREE.MeshBasicMaterial({ color: 0x221c20 });
const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const blushMat = new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.45 });
const mouthMat = new THREE.MeshBasicMaterial({ color: 0x8a4a3a });
const glassesMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });

function part(geo: THREE.BufferGeometry, material: THREE.Material | number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, typeof material === 'number' ? mat(material) : material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const sphere = (r: number, w = 20, h = 16) => new THREE.SphereGeometry(r, w, h);
const cylinder = (rt: number, rb: number, h: number, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);

function buildHead(i: number, skin: number, hair: number): THREE.Group {
  const head = new THREE.Group();
  const face = part(sphere(0.42, 28, 22), skin);
  face.scale.set(1, 0.94, 0.96);
  head.add(face);
  for (const x of [-0.41, 0.41]) head.add(part(sphere(0.08, 10, 8), skin, x, -0.02, 0));

  // 큰 눈 + 반짝이
  for (const x of [-0.15, 0.15]) {
    const eye = part(sphere(0.072, 16, 12), eyeMat, x, -0.02, 0.37);
    eye.scale.set(1, 1.35, 0.5);
    head.add(eye);
    head.add(part(sphere(0.024, 8, 6), whiteMat, x + 0.025, 0.03, 0.405));
    head.add(part(sphere(0.012, 6, 4), whiteMat, x - 0.02, -0.05, 0.405));
  }
  // 볼터치, 입
  for (const x of [-0.25, 0.25]) {
    const blush = part(sphere(0.06, 12, 8), blushMat, x, -0.13, 0.33);
    blush.scale.set(1.3, 0.7, 0.3);
    blush.castShadow = false;
    head.add(blush);
  }
  const mouth = part(new THREE.TorusGeometry(0.035, 0.01, 6, 12, Math.PI), mouthMat, 0, -0.15, 0.395);
  mouth.rotation.z = Math.PI;
  head.add(mouth);

  // 머리 모양
  const cap = (color: number, s = 1.04, y = 0.02) => {
    const c = part(new THREE.SphereGeometry(0.45, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.5), color, 0, y, 0);
    c.scale.set(s, 1, s);
    head.add(c);
  };
  const bangs = (color: number, y = 0.2) =>
    head.add(part(new THREE.CylinderGeometry(0.44, 0.44, 0.16, 28, 1, true, -Math.PI * 0.45, Math.PI * 0.9), matDouble(color), 0, y, 0));
  const back = (color: number, h: number, y: number) =>
    head.add(part(new THREE.CylinderGeometry(0.45, 0.4, h, 28, 1, true, Math.PI * 0.6, Math.PI * 0.8), matDouble(color), 0, y, 0));

  switch (i) {
    case 0: cap(hair, 1.03); bangs(hair); break; // 짧은 머리
    case 1: cap(hair, 1.05); bangs(hair); back(hair, 0.45, -0.1); break; // 단발
    case 2: cap(hair, 1.05); bangs(hair); back(hair, 0.9, -0.32); break; // 긴 생머리
    case 3: cap(hair); bangs(hair); head.add(part(sphere(0.17, 16, 12), hair, 0, 0.5, -0.08)); break; // 똥머리
    case 4: { // 야구모자
      cap(0x2f6bff, 1.08, 0.05);
      const brim = part(cylinder(0.3, 0.3, 0.03, 24), 0x2f6bff, 0, 0.2, 0.3);
      brim.rotation.x = 0.25;
      head.add(brim);
      back(hair, 0.2, -0.02);
      break;
    }
    case 5: // 곱슬
      cap(hair);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        head.add(part(sphere(0.13, 10, 8), hair, Math.cos(a) * 0.36, 0.22 + Math.sin(k * 1.7) * 0.05, Math.sin(a) * 0.34 - 0.04));
      }
      break;
    case 6: { // 앞머리
      cap(hair);
      const fringe = part(new THREE.BoxGeometry(0.62, 0.14, 0.18), hair, 0, 0.2, 0.33);
      fringe.rotation.x = 0.3;
      head.add(fringe);
      break;
    }
    case 7: { // 안경
      cap(hair, 1.03);
      bangs(hair, 0.22);
      for (const x of [-0.15, 0.15]) head.add(part(new THREE.TorusGeometry(0.1, 0.016, 8, 20), glassesMat, x, -0.02, 0.4));
      const bridge = part(cylinder(0.01, 0.01, 0.1, 6), glassesMat, 0, -0.02, 0.41);
      bridge.rotation.z = Math.PI / 2;
      head.add(bridge);
      break;
    }
    case 8: // 비니
      cap(0xe85d6e, 1.06, 0.06);
      head.add(part(cylinder(0.46, 0.46, 0.1, 28), 0xc94b5b, 0, 0.1, 0));
      head.add(part(sphere(0.08, 10, 8), 0xffffff, 0, 0.52, 0));
      break;
    default: // 양갈래
      cap(hair);
      bangs(hair);
      for (const x of [-0.4, 0.4]) {
        head.add(part(sphere(0.15, 14, 10), hair, x, 0.1, -0.08));
        const tail = part(new THREE.ConeGeometry(0.1, 0.4, 10), hair, x * 1.08, -0.18, -0.08);
        tail.rotation.z = Math.PI + (x > 0 ? -0.2 : 0.2);
        head.add(tail);
      }
  }
  return head;
}

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
    p.add(part(cylinder(0.085, 0.08, 0.2, 12), PANTS, 0, -0.1, 0));
    const shoe = part(sphere(0.1, 14, 10), SHOES, 0, -0.24, 0.03);
    shoe.scale.set(1, 0.6, 1.35);
    p.add(shoe);
    body.add(p);
    return p;
  };
  const legL = leg(-0.11);
  const legR = leg(0.11);

  // 후드티
  body.add(part(cylinder(0.19, 0.25, 0.34, 18), top, 0, 0.46, 0));
  body.add(part(sphere(0.19, 16, 10), top, 0, 0.62, 0));
  const hood = part(new THREE.TorusGeometry(0.16, 0.06, 8, 20), top, 0, 0.66, -0.08);
  hood.rotation.x = Math.PI / 2 + 0.5;
  body.add(hood);
  body.add(part(new THREE.BoxGeometry(0.18, 0.07, 0.02), 0xffffff, 0, 0.4, 0.245));
  for (const x of [-0.05, 0.05]) body.add(part(cylinder(0.008, 0.008, 0.12, 6), whiteMat, x, 0.58, 0.2));

  const arm = (x: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0.62, 0);
    p.rotation.z = x < 0 ? -0.35 : 0.35;
    p.add(part(cylinder(0.065, 0.06, 0.2, 10), top, 0, -0.1, 0));
    p.add(part(sphere(0.07, 12, 10), skin, 0, -0.23, 0));
    body.add(p);
    return p;
  };
  const armL = arm(-0.21);
  const armR = arm(0.21);

  const head = buildHead(i, skin, hair);
  head.position.y = 1.08;
  body.add(head);

  return { root, body, legL, legR, armL, armR, height: 1.55 };
}

let factory: CharacterFactory = sdCasual;

/** glTF 모델로 바꿀 때 호출. 예: setCharacterFactory(i => rigFromGltf(loadedModels[i])) */
export function setCharacterFactory(f: CharacterFactory) {
  factory = f;
}

export function createCharacter(index: number): CharacterRig {
  return factory(index);
}
