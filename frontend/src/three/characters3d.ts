import * as THREE from 'three';
import { mat, mesh } from './materials';

/**
 * 사람 모양 로우폴리 캐릭터 10종 (코드로 만든 임시 모델).
 *
 * 나중에 glTF 모델로 바꿀 때는 {@link setCharacterFactory} 로 공장 함수만 갈아 끼우면 된다.
 * 공장 함수는 번호(0~9)를 받아 {@link CharacterRig} 를 돌려주면 되고,
 * 걷기 동작은 rig 의 팔·다리 관절(없으면 생략)을 흔드는 방식이라 glTF 쪽은 AnimationMixer 로 대신해도 된다.
 */
export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Object3D;
  legL?: THREE.Object3D;
  legR?: THREE.Object3D;
  armL?: THREE.Object3D;
  armR?: THREE.Object3D;
}

export type CharacterFactory = (index: number) => CharacterRig;

const SKINS = [0xf2c9a0, 0xe3b08a, 0xc98e66, 0xf5d3b3, 0xb97c55];
const HAIRS = [0x2a2320, 0x4a3426, 0x1b1b1f, 0x7a4e2d, 0x8c8c8c];
const SHIRTS = [0x4c7bf4, 0xe8833a, 0x3fa97c, 0xc455a8, 0xd9b53f, 0x5bb8d6, 0x8a6fe0, 0xe05a6a, 0x6e8b3d, 0xa0785a];
const PANTS = 0x3b4250;

const capGeo = new THREE.SphereGeometry(0.3, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e1e22 });
const mouthMat = new THREE.MeshBasicMaterial({ color: 0x7a4a3a });

function limb(radius: number, length: number, color: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.add(mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), color, 0, -length / 2 - radius * 0.3, 0));
  return pivot;
}

function codeCharacter(index: number): CharacterRig {
  const i = ((index % 10) + 10) % 10;
  const skin = SKINS[i % 5];
  const hair = HAIRS[(i * 3) % 5];
  const shirt = SHIRTS[i];

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const legL = limb(0.1, 0.36, PANTS);
  legL.position.set(-0.12, 0.52, 0);
  const legR = limb(0.1, 0.36, PANTS);
  legR.position.set(0.12, 0.52, 0);
  body.add(legL, legR);

  body.add(mesh(new THREE.CapsuleGeometry(0.27, 0.32, 6, 14), shirt, 0, 0.86, 0));

  const armL = limb(0.075, 0.36, shirt);
  armL.position.set(-0.34, 1.04, 0);
  armL.rotation.z = -0.12;
  const armR = limb(0.075, 0.36, shirt);
  armR.position.set(0.34, 1.04, 0);
  armR.rotation.z = 0.12;
  body.add(armL, armR);

  const head = new THREE.Group();
  head.position.set(0, 1.44, 0);
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.28, 20, 16), skin));
  for (const x of [-0.095, 0.095]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), eyeMat);
    eye.position.set(x, 0.02, 0.262);
    head.add(eye);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), mouthMat);
  smile.position.set(0, -0.08, 0.262);
  smile.rotation.z = Math.PI;
  head.add(smile);

  const cap = (color: number, y = 0.03, s = 1) => {
    const c = new THREE.Mesh(capGeo, mat(color));
    c.position.y = y;
    c.scale.set(s, 1, s);
    c.castShadow = true;
    head.add(c);
  };
  const backHair = (y: number, h: number) =>
    head.add(mesh(new THREE.CylinderGeometry(0.31, 0.31, h, 18, 1, true, Math.PI * 0.75, Math.PI * 1.5), hair, 0, y, 0));

  switch (i) {
    case 0: cap(hair, 0.05, 0.98); break; // 짧은 머리
    case 1: cap(hair); backHair(-0.08, 0.3); break; // 단발
    case 2: cap(hair); head.add(mesh(new THREE.BoxGeometry(0.56, 0.62, 0.18), hair, 0, -0.24, -0.16)); break; // 긴 머리
    case 3: cap(hair); head.add(mesh(new THREE.SphereGeometry(0.13, 12, 10), hair, 0, 0.32, -0.12)); break; // 묶은 머리
    case 4: cap(0x333a44, 0.06, 1.04); head.add(mesh(new THREE.BoxGeometry(0.34, 0.04, 0.24), 0x333a44, 0, 0.12, 0.3)); break; // 모자
    case 5: // 곱슬
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        head.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), hair, Math.cos(a) * 0.22, 0.2 + Math.sin(k) * 0.03, Math.sin(a) * 0.22 - 0.03));
      }
      head.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), hair, 0, 0.3, 0));
      break;
    case 6: cap(hair); head.add(mesh(new THREE.BoxGeometry(0.46, 0.1, 0.12), hair, 0, 0.14, 0.22)); break; // 앞머리
    case 7: // 안경
      cap(hair, 0.05, 0.98);
      for (const x of [-0.095, 0.095]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.013, 6, 16), eyeMat);
        ring.position.set(x, 0.02, 0.275);
        head.add(ring);
      }
      break;
    case 8: break; // 민머리
    default: { // 헤어밴드
      cap(hair);
      backHair(-0.1, 0.26);
      const band = mesh(new THREE.TorusGeometry(0.285, 0.03, 6, 24), 0xe05a6a, 0, 0.1, 0);
      band.rotation.x = Math.PI / 2 - 0.25;
      head.add(band);
    }
  }
  return { root, body, legL, legR, armL, armR };
}

let factory: CharacterFactory = codeCharacter;

/** glTF 모델로 바꿀 때 호출. 예: setCharacterFactory(i => rigFromGltf(loadedModels[i])) */
export function setCharacterFactory(f: CharacterFactory) {
  factory = f;
}

export function createCharacter(index: number): CharacterRig {
  return factory(index);
}
