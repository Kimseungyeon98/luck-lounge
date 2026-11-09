import * as THREE from 'three';
import { canvasTexture, mat, mesh } from './materials';
import { signLabel } from './labels';

export type GameType = 'LADDER' | 'BOMB' | 'BALLOON' | 'TARGET' | 'STOP' | 'TOWER';

export interface Booth {
  id: GameType;
  name: string;
  x: number;
  z: number;
  radius: number;
  animate(t: number): void;
}

/**
 * 게임 부스 자리. 왼쪽이 복불복 존, 오른쪽이 경쟁 존.
 * 서버 backend/.../lobby/Match.java 의 Booth 와 같은 값이어야 한다.
 */
export const BOOTHS: { id: GameType; name: string; x: number; z: number; skill: boolean; rule: string }[] = [
  { id: 'LADDER', name: '사다리 타기', x: -4.8, z: -2.1, skill: false, rule: '줄 하나 고르면 사다리를 따라 내려가요 · ☕ 칸이 당첨' },
  { id: 'BOMB', name: '시한폭탄', x: -4.8, z: 0.9, skill: false, rule: '1~5초 안에 넘기기 · 터질 때 들고 있으면 당첨' },
  { id: 'BALLOON', name: '풍선 불기', x: -4.8, z: 3.9, skill: false, rule: '차례대로 1~3번 펌프 · 터뜨리면 당첨' },
  { id: 'TARGET', name: '과녁 멈추기', x: 4.8, z: -2.1, skill: true, rule: '움직이는 바늘을 가운데에 3번 · 가장 먼 사람이 당첨' },
  { id: 'STOP', name: '10초 멈추기', x: 4.8, z: 0.9, skill: true, rule: '사라진 시계를 딱 10.00초에 · 가장 먼 사람이 당첨' },
  { id: 'TOWER', name: '탑 쌓기', x: 4.8, z: 3.9, skill: true, rule: '블록을 눌러 쌓기 · 가장 낮은 사람이 당첨' },
];
/** 걸을 수 있는 범위 (서버 Obstacles 와 같게). M8 에서 가로 10.8m → 14m */
export const ROOM = { minX: -7, maxX: 7, minZ: -3.6, maxZ: 5.2 };
export const BOOTH_RADIUS = 1.45;

/** 이 자리가 어느 부스 위인지 (없으면 null) */
export function boothAt(x: number, z: number): GameType | null {
  for (const b of BOOTHS) if (Math.hypot(x - b.x, z - b.z) < BOOTH_RADIUS) return b.id;
  return null;
}

/** 걸을 수 없는 곳. 서버 backend/.../lobby/Obstacles.java 와 같은 값이어야 한다. */
export function blocked(x: number, z: number): boolean {
  if (x < ROOM.minX || x > ROOM.maxX || z < ROOM.minZ || z > ROOM.maxZ) return true;
  const circles = [[-0.4, -2.4, 0.95], [-7.0, -4.4, 0.6], [6.9, -4.4, 0.6], [-7.0, 4.7, 0.6], [6.9, 4.7, 0.6],
    ...BOOTHS.map((b) => [b.x, b.z - 0.2, 0.75])];
  for (const [cx, cz, r] of circles) if (Math.hypot(x - cx, z - cz) < r) return true;
  return x > -2.6 && x < 1.8 && z > -5.0 && z < -3.75;
}

export interface Lounge {
  group: THREE.Group;
  booths: Booth[];
  signs: THREE.Sprite[];
  /** 부스 전체 (시한폭탄 중에는 숨김) */
  boothGroups: THREE.Group[];
  /** 통계 게시판 (누르면 통계 화면) */
  board: THREE.Mesh;
  /** 걸어다닐 수 있는 범위 (M2) */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** 사무실 라운지: 바닥, 벽 두 면, 창문, 통계 게시판, 소파, 러그, 화분, 게임 부스 2개 */
export function buildLounge(): Lounge {
  const group = new THREE.Group();

  const outside = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 1 }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.02;
  outside.receiveShadow = true;
  group.add(outside);

  // 바닥 타일
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#E6DED2';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#DDD3C5';
  g.fillRect(0, 0, 128, 128);
  g.fillRect(128, 128, 128, 128);
  g.strokeStyle = '#D2C7B8';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const tex = canvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7.8, 5.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(15.6, 11), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0.3);
  floor.receiveShadow = true;
  group.add(floor);

  // 벽
  const wall = mat(0xf7f4ef);
  const back = new THREE.Mesh(new THREE.BoxGeometry(15.6, 3.2, 0.2), wall);
  back.position.set(0, 1.6, -5.2);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 11), wall);
  left.position.set(-7.8, 1.6, 0.3);
  left.receiveShadow = true;
  group.add(back, left);
  group.add(mesh(new THREE.BoxGeometry(15.6, 0.25, 0.24), 0x2b3442, 0, 0.12, -5.08));
  group.add(mesh(new THREE.BoxGeometry(0.24, 0.25, 11), 0x2b3442, -7.68, 0.12, 0.3));

  // 창문
  group.add(mesh(new THREE.BoxGeometry(3.6, 1.5, 0.06), 0xbfd8f0, 2.4, 1.9, -5.08, false));
  group.add(mesh(new THREE.BoxGeometry(3.8, 0.1, 0.12), 0xffffff, 2.4, 1.1, -5.04));
  group.add(mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), 0xffffff, 2.4, 1.9, -5.03));

  // 통계 게시판 (M5에서 누르면 열림)
  const bc = document.createElement('canvas');
  bc.width = 256;
  bc.height = 160;
  const bg = bc.getContext('2d')!;
  bg.fillStyle = '#2B3442';
  bg.fillRect(0, 0, 256, 160);
  bg.fillStyle = '#FFFFFF';
  bg.font = 'bold 34px sans-serif';
  bg.textAlign = 'center';
  bg.fillText('통계 · 최고 기록', 128, 70);
  bg.fillStyle = '#FF9B78';
  bg.font = '24px sans-serif';
  bg.fillText('눌러서 보기', 128, 116);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.25), new THREE.MeshStandardMaterial({ map: canvasTexture(bc), roughness: 0.9 }));
  board.position.set(-7.68, 1.8, -1.6);
  board.rotation.y = Math.PI / 2;
  group.add(board);

  // 러그, 소파, 테이블
  const rug = mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.03, 40), 0xc9d6e8, -0.4, 0.015, -2.2, false);
  rug.receiveShadow = true;
  group.add(rug);
  const sofa = new THREE.Group();
  sofa.add(mesh(new THREE.BoxGeometry(4, 0.45, 1.1), 0x5a6f8f, 0, 0.32, 0));
  sofa.add(mesh(new THREE.BoxGeometry(4, 0.9, 0.3), 0x4a5d7a, 0, 0.75, -0.42));
  sofa.add(mesh(new THREE.BoxGeometry(0.32, 0.7, 1.1), 0x4a5d7a, -2.0, 0.55, 0));
  sofa.add(mesh(new THREE.BoxGeometry(0.32, 0.7, 1.1), 0x4a5d7a, 2.0, 0.55, 0));
  sofa.position.set(-0.4, 0, -4.4);
  group.add(sofa);
  group.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 32), 0xffffff, -0.4, 0.5, -2.4));
  group.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.48, 12), 0x8c7a66, -0.4, 0.25, -2.4));

  // 화분
  for (const [x, z] of [[-7.0, -4.4], [6.9, -4.4], [-7.0, 4.7], [6.9, 4.7]]) {
    group.add(mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.5, 14), 0xb7774e, x, 0.25, z));
    const leaf = mesh(new THREE.IcosahedronGeometry(0.6, 0), 0x4f9a68, x, 0.95, z);
    leaf.scale.set(1, 1.25, 1);
    group.add(leaf);
  }

  // 게임 부스
  const booths: Booth[] = [];
  const signs: THREE.Sprite[] = [];
  const boothGroups: THREE.Group[] = [];
  const booth = (id: GameType, color: number, prop: THREE.Group, animate: (t: number) => void) => {
    const { name, x, z } = BOOTHS.find((bt) => bt.id === id)!;
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.add(mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.12, 40), color, 0, 0.06, 0));
    b.add(mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.13, 40), 0xffffff, 0, 0.07, 0, false));
    prop.position.set(0, 0.13, -0.2);
    b.add(prop);
    const sign = signLabel(name, '#' + color.toString(16).padStart(6, '0'));
    sign.position.set(0, 2.5, 0);
    b.add(sign);
    signs.push(sign);
    group.add(b);
    boothGroups.push(b);
    booths.push({ id, name, x, z, radius: 1.4, animate });
  };

  // 구역 바닥: 왼쪽 복불복 존(파랑), 오른쪽 경쟁 존(초록)
  for (const [x, color, label, labelColor] of [[-4.75, 0x2f6bff, '복불복 존', '#2F6BFF'], [4.75, 0x12a37a, '경쟁 존', '#12A37A']] as const) {
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 9.2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(x, 0.005, 0.7);
    group.add(zone);
    const sign = signLabel(label, labelColor);
    sign.position.set(x, 3.0, -4.3);
    sign.scale.multiplyScalar(1.15);
    group.add(sign);
    signs.push(sign);
  }

  const bomb = new THREE.Group();
  bomb.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), 0x8c7a66, 0, 0.4, 0));
  bomb.add(mesh(new THREE.SphereGeometry(0.42, 18, 14), 0x23272e, 0, 1.22, 0));
  bomb.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 12), 0x555b66, 0, 1.66, 0));
  const fuse = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), 0xc9a66b, 0.06, 1.85, 0);
  fuse.rotation.z = -0.4;
  bomb.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc233 }));
  spark.position.set(0.13, 2.0, 0);
  bomb.add(spark);
  booth('BOMB', 0xff6a3d, bomb, (t) => spark.scale.setScalar(0.8 + Math.sin(t * 18) * 0.3));

  const balloonProp = new THREE.Group();
  balloonProp.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), 0x8c7a66, 0, 0.4, 0));
  balloonProp.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.4, 10), 0x5a6472, 0.25, 1.0, 0.15));
  const balloon = mesh(new THREE.SphereGeometry(0.55, 20, 16), 0xe84b5f, -0.05, 1.75, 0);
  balloonProp.add(balloon);
  balloonProp.add(mesh(new THREE.ConeGeometry(0.09, 0.14, 8), 0xe84b5f, -0.05, 1.08, 0));
  booth('BALLOON', 0x2f6bff, balloonProp, (t) => {
    const s = 1 + Math.sin(t * 1.6) * 0.06;
    balloon.scale.set(s, s * 1.15, s);
  });

  // 경쟁 존: 큰 스톱워치
  const stopProp = new THREE.Group();
  stopProp.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), 0x8c7a66, 0, 0.4, 0));
  const watch = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 32), 0xe8edf2, 0, 0, 0);
  body.rotation.x = Math.PI / 2;
  watch.add(body);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.47, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  face.position.z = 0.1;
  watch.add(face);
  const hand = mesh(new THREE.BoxGeometry(0.04, 0.4, 0.02), 0xe0482a, 0, 0, 0.12, false);
  hand.geometry.translate(0, 0.17, 0);
  watch.add(hand);
  watch.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12), 0x12a37a, 0, 0.64, 0));
  watch.position.set(0, 1.45, 0);
  stopProp.add(watch);
  booth('STOP', 0x12a37a, stopProp, (t) => { hand.rotation.z = -t * 2.2; });

  // 경쟁 존: 쌓은 블록
  const towerProp = new THREE.Group();
  towerProp.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), 0x8c7a66, 0, 0.4, 0));
  const blockColors = [0x4c7bf4, 0xf08a4b, 0x3fa97c, 0xd565b0, 0xf2c94c];
  const blocks: THREE.Mesh[] = [];
  blockColors.forEach((c, i) => {
    const w = 0.85 - i * 0.1;
    const blk = mesh(new THREE.BoxGeometry(w, 0.2, w), c, (i % 2 ? 0.05 : -0.04), 0.9 + i * 0.21, 0);
    towerProp.add(blk);
    blocks.push(blk);
  });
  booth('TOWER', 0x0e8a66, towerProp, (t) => {
    const top = blocks[blocks.length - 1];
    top.position.x = Math.sin(t * 2.4) * 0.25;
  });

  // M8 복불복: 사다리
  const ladderProp = new THREE.Group();
  ladderProp.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), 0x8c7a66, 0, 0.4, 0));
  for (const x of [-0.32, 0.32]) ladderProp.add(mesh(new THREE.BoxGeometry(0.07, 1.4, 0.07), 0xd9a55b, x, 1.5, 0));
  for (let k = 0; k < 5; k++) ladderProp.add(mesh(new THREE.BoxGeometry(0.64, 0.05, 0.05), 0xd9a55b, 0, 0.95 + k * 0.28, 0));
  const cup = mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.2, 12), 0xffffff, 0, 2.35, 0);
  ladderProp.add(cup);
  booth('LADDER', 0xc2410c, ladderProp, (t) => { cup.position.y = 2.35 + Math.abs(Math.sin(t * 3)) * 0.08; });

  // M8 경쟁: 과녁
  const targetProp = new THREE.Group();
  targetProp.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), 0x8c7a66, 0, 0.4, 0));
  const rings = new THREE.Group();
  ([[0.55, 0xffffff], [0.42, 0xe84b5f], [0.29, 0xffffff], [0.15, 0xe84b5f]] as const).forEach(([r, c], i) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: c }));
    d.position.z = 0.01 * i;
    rings.add(d);
  });
  rings.position.set(0, 1.5, 0);
  targetProp.add(rings);
  const needle = mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), 0x18202b, 0, 1.5, 0.08, false);
  targetProp.add(needle);
  booth('TARGET', 0x0f766e, targetProp, (t) => { needle.position.x = Math.sin(t * 2.2) * 0.45; });

  return { group, booths, signs, boothGroups, board, bounds: { ...ROOM } };
}
