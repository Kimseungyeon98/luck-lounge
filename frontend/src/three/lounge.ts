import * as THREE from 'three';
import { canvasTexture, mat, mesh } from './materials';
import { signLabel } from './labels';

export interface Booth {
  name: string;
  x: number;
  z: number;
  radius: number;
  animate(t: number): void;
}

/** 걸을 수 없는 곳. 서버 backend/.../lobby/Obstacles.java 와 같은 값이어야 한다. */
export function blocked(x: number, z: number): boolean {
  if (x < -5.4 || x > 5.4 || z < -3.6 || z > 5.2) return true;
  const circles = [[-0.4, -2.4, 0.95], [-5.2, -4.4, 0.6], [5.1, -4.4, 0.6], [-5.2, 4.7, 0.6], [5.1, 4.7, 0.6], [-3.0, 2.4, 0.75], [3.0, 2.4, 0.75]];
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
  tex.repeat.set(6, 5.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 11), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0.3);
  floor.receiveShadow = true;
  group.add(floor);

  // 벽
  const wall = mat(0xf7f4ef);
  const back = new THREE.Mesh(new THREE.BoxGeometry(12, 3.2, 0.2), wall);
  back.position.set(0, 1.6, -5.2);
  back.receiveShadow = true;
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 11), wall);
  left.position.set(-6, 1.6, 0.3);
  left.receiveShadow = true;
  group.add(back, left);
  group.add(mesh(new THREE.BoxGeometry(12, 0.25, 0.24), 0x2b3442, 0, 0.12, -5.08));
  group.add(mesh(new THREE.BoxGeometry(0.24, 0.25, 11), 0x2b3442, -5.88, 0.12, 0.3));

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
  bg.fillText('이번 달 통계', 128, 70);
  bg.fillStyle = '#FF9B78';
  bg.font = '24px sans-serif';
  bg.fillText('눌러서 보기', 128, 116);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.25), new THREE.MeshStandardMaterial({ map: canvasTexture(bc), roughness: 0.9 }));
  board.position.set(-5.88, 1.8, -1.6);
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
  for (const [x, z] of [[-5.2, -4.4], [5.1, -4.4], [-5.2, 4.7], [5.1, 4.7]]) {
    group.add(mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.5, 14), 0xb7774e, x, 0.25, z));
    const leaf = mesh(new THREE.IcosahedronGeometry(0.6, 0), 0x4f9a68, x, 0.95, z);
    leaf.scale.set(1, 1.25, 1);
    group.add(leaf);
  }

  // 게임 부스
  const booths: Booth[] = [];
  const signs: THREE.Sprite[] = [];
  const boothGroups: THREE.Group[] = [];
  const booth = (name: string, x: number, z: number, color: number, prop: THREE.Group, animate: (t: number) => void) => {
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
    booths.push({ name, x, z, radius: 1.4, animate });
  };

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
  booth('시한폭탄', -3.0, 2.6, 0xff6a3d, bomb, (t) => spark.scale.setScalar(0.8 + Math.sin(t * 18) * 0.3));

  const balloonProp = new THREE.Group();
  balloonProp.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), 0x8c7a66, 0, 0.4, 0));
  balloonProp.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.4, 10), 0x5a6472, 0.25, 1.0, 0.15));
  const balloon = mesh(new THREE.SphereGeometry(0.55, 20, 16), 0xe84b5f, -0.05, 1.75, 0);
  balloonProp.add(balloon);
  balloonProp.add(mesh(new THREE.ConeGeometry(0.09, 0.14, 8), 0xe84b5f, -0.05, 1.08, 0));
  booth('풍선', 3.0, 2.6, 0x2f6bff, balloonProp, (t) => {
    const s = 1 + Math.sin(t * 1.6) * 0.06;
    balloon.scale.set(s, s * 1.15, s);
  });

  return { group, booths, signs, boothGroups, board, bounds: { minX: -5.4, maxX: 5.4, minZ: -3.6, maxZ: 5.2 } };
}
