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
 * 게임 부스 자리. 메인 대기실 왼쪽이 복불복 존, 오른쪽이 경쟁 존.
 * 서버 backend/.../lobby/Match.java 의 Booth 와 같은 값이어야 한다. (M11: 메인 앞쪽 한 줄)
 */
export const BOOTHS: { id: GameType; name: string; x: number; z: number; skill: boolean; rule: string }[] = [
  { id: 'LADDER', name: '사다리 타기', x: -9.0, z: 5.4, skill: false, rule: '줄 하나 고르면 사다리를 따라 내려가요 · ☕ 칸이 당첨' },
  { id: 'BOMB', name: '시한폭탄', x: -5.6, z: 5.4, skill: false, rule: '1~5초 안에 넘기기 · 터질 때 들고 있으면 당첨' },
  { id: 'BALLOON', name: '풍선 불기', x: -2.2, z: 5.4, skill: false, rule: '차례대로 1~3번 펌프 · 터뜨리면 당첨' },
  { id: 'TARGET', name: '과녁 멈추기', x: 2.2, z: 5.4, skill: true, rule: '움직이는 바늘을 가운데에 3번 · 가장 먼 사람이 당첨' },
  { id: 'STOP', name: '10초 멈추기', x: 5.6, z: 5.4, skill: true, rule: '사라진 시계를 딱 10.00초에 · 가장 먼 사람이 당첨' },
  { id: 'TOWER', name: '탑 쌓기', x: 9.0, z: 5.4, skill: true, rule: '블록을 눌러 쌓기 · 가장 낮은 사람이 당첨' },
];
export const BOOTH_RADIUS = 1.45;

// ---------- 방 세 개 (서버 backend/.../lobby/Obstacles.java 와 같은 값) ----------
export type RoomId = 'MAIN' | 'PANTRY' | 'MEETING';
type Rect = [number, number, number, number]; // minX, maxX, minZ, maxZ
export const MAIN: Rect = [-11.2, 11.2, -6.0, 7.6];
export const PANTRY: Rect = [-18.0, -11.6, -6.0, 1.2];
export const MEETING: Rect = [11.6, 18.8, 0.4, 7.6];
const PANTRY_DOOR = [-3.6, -1.4];
const MEETING_DOOR = [3.0, 5.2];
export const ROOM_NAMES: Record<RoomId, string> = { MAIN: '메인 대기실', PANTRY: '탕비실', MEETING: '회의실' };

const inset = (r: Rect, m: number): Rect => [r[0] + m, r[1] - m, r[2] + m, r[3] - m];
/** 걸을 수 있는 네모: 방 안쪽(벽에서 0.3m)과 문 */
const WALK: Rect[] = [
  inset(MAIN, 0.3), inset(PANTRY, 0.3), inset(MEETING, 0.3),
  [PANTRY[1] - 0.4, MAIN[0] + 0.4, PANTRY_DOOR[0] + 0.3, PANTRY_DOOR[1] - 0.3],
  [MAIN[1] - 0.4, MEETING[0] + 0.4, MEETING_DOOR[0] + 0.3, MEETING_DOOR[1] - 0.3],
];
/** 가구 {x, z, 반지름} */
const CIRCLES: [number, number, number][] = [
  ...BOOTHS.map((b) => [b.x, b.z - 0.2, 0.75] as [number, number, number]),
  [0.0, -3.2, 0.8], [-3.7, -3.5, 0.55], [3.7, -3.5, 0.55], [3.3, -5.4, 0.25],
  [-10.6, -5.4, 0.55], [10.6, -5.4, 0.55], [-10.6, 7.0, 0.55], [10.6, 7.0, 0.55],
  [-6.6, -3.2, 0.5], [-8.4, -2.4, 0.5],
  [-17.55, -4.3, 0.3], [-15.4, -1.9, 1.0], [-12.1, 0.7, 0.3], [-17.4, 0.6, 0.45],
  [12.1, 0.9, 0.45], [18.3, 7.1, 0.45],
];
/** 가구 {minX, maxX, minZ, maxZ} */
const BOXES: Rect[] = [
  [-2.4, 2.4, -6.0, -4.5], [-6.8, -4.6, -6.0, -5.35],
  [-17.9, -13.4, -6.0, -5.15], [-13.3, -12.2, -6.0, -5.0], [-18.0, -17.35, -2.6, -0.8],
  [13.0, 17.6, 2.5, 5.5], [16.8, 18.6, 0.4, 1.05], [13.0, 15.4, 0.4, 1.0],
];

/** 이 자리가 어느 부스 위인지 (없으면 null) */
export function boothAt(x: number, z: number): GameType | null {
  for (const b of BOOTHS) if (Math.hypot(x - b.x, z - b.z) < BOOTH_RADIUS) return b.id;
  return null;
}

/** 걸을 수 없는 곳 */
export function blocked(x: number, z: number): boolean {
  if (!WALK.some((w) => x >= w[0] && x <= w[1] && z >= w[2] && z <= w[3])) return true;
  for (const [cx, cz, r] of CIRCLES) if (Math.hypot(x - cx, z - cz) < r) return true;
  return BOXES.some((b) => x > b[0] && x < b[1] && z > b[2] && z < b[3]);
}

/** 어느 방인지 (방 사이 벽 한가운데로 나눈다) */
export function roomOf(x: number, z: number): RoomId {
  void z;
  if (x < (PANTRY[1] + MAIN[0]) / 2) return 'PANTRY';
  if (x > (MAIN[1] + MEETING[0]) / 2) return 'MEETING';
  return 'MAIN';
}

/** 방 안에서 걸을 수 있는 범위 (카메라가 방 밖을 너무 많이 비추지 않게) */
export function walkBounds(room: RoomId): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const r = inset(room === 'MAIN' ? MAIN : room === 'PANTRY' ? PANTRY : MEETING, 0.3);
  return { minX: r[0], maxX: r[1], minZ: r[2], maxZ: r[3] };
}

/** 탕비실 커피 머신 앞 (여기 서면 "커피 마시기" 버튼) */
export const COFFEE_SPOT = { x: -15.9, z: -4.5, r: 1.5 };

/** 앉을 자리 (서버 Obstacles.SEATS 와 같은 순서·값). face: 0 = +z 를 바라봄, h: 앉는 높이 */
export interface Seat { id: number; x: number; z: number; face: number; h: number; kind: string }
const stoolAt = (a: number) => [-15.4 + Math.sin(a) * 0.78, -1.9 + Math.cos(a) * 0.78, a + Math.PI, 0.66, '카페 의자'] as const;
export const SEATS: Seat[] = ([
  [-1.5, -5.05, 0, 0.62, '소파'], [0.0, -5.05, 0, 0.62, '소파'], [1.5, -5.05, 0, 0.62, '소파'],
  [-3.7, -3.5, Math.PI * 0.62, 0.52, '1인 소파'], [3.7, -3.5, -Math.PI * 0.62, 0.52, '1인 소파'],
  [-6.6, -3.2, 1.12, 0.42, '빈백'], [-8.4, -2.4, 1.29, 0.42, '빈백'],
  stoolAt(0.4), stoolAt(2.5), stoolAt(4.5),
  [14.0, 2.8, 0, 0.5, '회의 의자'], [15.3, 2.8, 0, 0.5, '회의 의자'], [16.6, 2.8, 0, 0.5, '회의 의자'],
  [14.0, 5.2, Math.PI, 0.5, '회의 의자'], [15.3, 5.2, Math.PI, 0.5, '회의 의자'], [16.6, 5.2, Math.PI, 0.5, '회의 의자'],
  [13.1, 4.0, Math.PI / 2, 0.5, '회의 의자'], [17.5, 4.0, -Math.PI / 2, 0.5, '회의 의자'],
] as const).map(([x, z, face, h, kind], id) => ({ id, x, z, face, h, kind }));
/** 앉을 수 있는 거리 (서버 SEAT_RANGE 보다 조금 짧게: 화면에 버튼이 떴는데 서버가 거절하지 않게) */
export const SEAT_RANGE = 1.6;

export interface Lounge {
  group: THREE.Group;
  booths: Booth[];
  signs: THREE.Sprite[];
  /** 부스 전체 (시한폭탄 중에는 숨김) */
  boothGroups: THREE.Group[];
  /** 통계 화이트보드 (회의실, 누르면 통계 화면) */
  board: THREE.Mesh;
  /** 탕비실 "오늘의 커피 당첨자" 보드에 이름 쓰기 */
  setWinners(lines: string[]): void;
}

// ---------- 그리기 도우미 ----------
const B = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, shadow = true) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, shadow);
const C = (rt: number, rb: number, h: number, color: number, x: number, y: number, z: number, seg = 16, shadow = true) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, shadow);

function tileTexture(a: string, b: string, line: string, repeatX: number, repeatZ: number, small = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = a;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = b;
  if (small) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) g.fillRect(i * 64, j * 64, 64, 64);
  } else {
    g.fillRect(0, 0, 128, 128);
    g.fillRect(128, 128, 128, 128);
  }
  g.strokeStyle = line;
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const tex = canvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatZ);
  return tex;
}

function carpetTexture(repeatX: number, repeatZ: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#AFBCCD';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(40,55,80,0.08)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = canvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatZ);
  return tex;
}

function floorOf(r: Rect, material: THREE.Material) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(r[1] - r[0], r[3] - r[2]), material);
  f.rotation.x = -Math.PI / 2;
  f.position.set((r[0] + r[1]) / 2, 0, (r[2] + r[3]) / 2);
  f.receiveShadow = true;
  return f;
}

function plant(x: number, z: number, big = true) {
  const g = new THREE.Group();
  g.add(C(0.32, 0.26, 0.5, 0xb7774e, 0, 0.25, 0, 14));
  const leaf = mesh(new THREE.IcosahedronGeometry(big ? 0.6 : 0.45, 0), 0x4f9a68, 0, big ? 0.95 : 0.8, 0);
  leaf.scale.set(1, 1.25, 1);
  g.add(leaf);
  g.position.set(x, 0, z);
  return g;
}

/** 등받이 있는 의자. face: 바라보는 방향(라디안, 0 = +z) */
function chair(x: number, z: number, face: number, color = 0x5a6f8f) {
  const g = new THREE.Group();
  g.add(B(0.48, 0.08, 0.48, color, 0, 0.46, 0));
  g.add(B(0.48, 0.5, 0.07, color, 0, 0.74, -0.21));
  for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) g.add(B(0.04, 0.44, 0.04, 0x39424f, lx, 0.22, lz, false));
  g.position.set(x, 0, z);
  g.rotation.y = face;
  return g;
}

function stool(x: number, z: number, color: number) {
  const g = new THREE.Group();
  g.add(C(0.2, 0.2, 0.07, color, 0, 0.62, 0, 14));
  g.add(C(0.03, 0.03, 0.6, 0x39424f, 0, 0.3, 0, 6, false));
  g.add(C(0.16, 0.18, 0.03, 0x39424f, 0, 0.02, 0, 12, false));
  g.position.set(x, 0, z);
  return g;
}

function textPanel(w: number, h: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void, px = 256) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.round((px * h) / w);
  const g = c.getContext('2d')!;
  draw(g, c.width, c.height);
  const tex = canvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  return { mesh: m, canvas: c, ctx: g, tex };
}

/** 사무실 라운지: 메인 대기실(부스 6개), 왼쪽 뒤 탕비실, 오른쪽 앞 회의실 */
export function buildLounge(): Lounge {
  const group = new THREE.Group();

  const outside = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 1 }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.set(0, -0.02, 1);
  outside.receiveShadow = true;
  group.add(outside);

  // ---------- 바닥 ----------
  group.add(floorOf(MAIN, new THREE.MeshStandardMaterial({ map: tileTexture('#E6DED2', '#DDD3C5', '#D2C7B8', 11.2, 6.8), roughness: 0.95 })));
  group.add(floorOf(PANTRY, new THREE.MeshStandardMaterial({ map: tileTexture('#EEF3EF', '#DCE8DF', '#CBDACF', 3.2, 3.6, true), roughness: 0.9 })));
  group.add(floorOf(MEETING, new THREE.MeshStandardMaterial({ map: carpetTexture(3.6, 3.6), roughness: 1 })));
  // 문턱
  const sill = mat(0xd8cdbd);
  for (const [x, z0, z1] of [[-11.4, PANTRY_DOOR[0], PANTRY_DOOR[1]], [11.4, MEETING_DOOR[0], MEETING_DOOR[1]]]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, z1 - z0), sill);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, 0.004, (z0 + z1) / 2);
    s.receiveShadow = true;
    group.add(s);
  }

  // ---------- 벽 ----------
  // 카메라가 오른쪽 앞에서 보므로 뒤·왼쪽 바깥벽만 높게, 방 사이 벽과 회의실 뒤 벽은 허리 높이(가리지 않게)
  const wall = 0xf7f4ef;
  const trim = 0x2b3442;
  const tall = (w: number, d: number, x: number, z: number) => {
    const m = B(w, 3.2, d, wall, x, 1.6, z);
    m.castShadow = false;
    group.add(m);
  };
  tall(29.4, 0.2, (PANTRY[0] + MAIN[1]) / 2, -6.1);          // 뒤 벽 (탕비실 + 메인)
  tall(0.2, 7.4, PANTRY[0] - 0.1, (PANTRY[2] + PANTRY[3]) / 2 - 0.1); // 탕비실 왼쪽 벽
  tall(0.2, MAIN[3] - PANTRY[3], MAIN[0] - 0.1, (PANTRY[3] + MAIN[3]) / 2); // 메인 왼쪽 벽 (탕비실 앞부분)
  group.add(B(29.4, 0.25, 0.24, trim, (PANTRY[0] + MAIN[1]) / 2, 0.12, -5.98));
  group.add(B(0.24, 0.25, 7.2, trim, PANTRY[0] + 0.02, 0.12, (PANTRY[2] + PANTRY[3]) / 2));
  group.add(B(0.24, 0.25, MAIN[3] - PANTRY[3], trim, MAIN[0] + 0.02, 0.12, (PANTRY[3] + MAIN[3]) / 2));
  const low = (x0: number, x1: number, z0: number, z1: number) => {
    const w = x1 - x0;
    const d = z1 - z0;
    group.add(B(w, 1.0, d, 0xefe9e0, (x0 + x1) / 2, 0.5, (z0 + z1) / 2));
    group.add(B(w + 0.06, 0.06, d + 0.06, 0xb98f62, (x0 + x1) / 2, 1.03, (z0 + z1) / 2));
  };
  low(-11.6, -11.2, PANTRY[2], PANTRY_DOOR[0]);
  low(-11.6, -11.2, PANTRY_DOOR[1], PANTRY[3]);
  low(11.2, 11.6, MEETING[2] - 0.2, MEETING_DOOR[0]);
  low(11.2, 11.6, MEETING_DOOR[1], MEETING[3]);
  low(11.6, MEETING[1], MEETING[2] - 0.2, MEETING[2]);

  // ---------- 메인 대기실 ----------
  // 창문 (소파 위, 경쟁 존 뒤)
  for (const [x, w] of [[0, 4.2], [7.6, 3.2], [-8.6, 2.4]] as const) {
    group.add(B(w, 1.5, 0.06, 0xbfd8f0, x, 1.95, -5.98, false));
    group.add(B(w + 0.2, 0.1, 0.12, 0xffffff, x, 1.15, -5.95));
    group.add(B(0.08, 1.5, 0.08, 0xffffff, x, 1.95, -5.94, false));
  }
  // 벽시계
  const clock = C(0.36, 0.36, 0.06, 0xffffff, -2.9, 2.55, -5.96, 24);
  clock.rotation.x = Math.PI / 2;
  group.add(clock);
  group.add(B(0.03, 0.26, 0.02, trim, -2.9, 2.6, -5.92, false));
  group.add(B(0.2, 0.03, 0.02, trim, -2.83, 2.55, -5.92, false));
  // 포스터
  const poster = textPanel(1.1, 1.5, (g, W, H) => {
    g.fillStyle = '#FF6A3D'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#FFFFFF'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center';
    g.fillText('오늘도', W / 2, H * 0.38); g.fillText('운빨!', W / 2, H * 0.55);
    g.font = '70px sans-serif'; g.fillText('🍀', W / 2, H * 0.82);
  }, 200);
  poster.mesh.position.set(4.6, 1.95, -5.98);
  group.add(poster.mesh);

  // 러그, 소파, 커피 테이블, 1인용 소파 둘
  const rug = C(2.7, 2.7, 0.03, 0xc9d6e8, 0, 0.015, -3.6, 40, false);
  rug.receiveShadow = true;
  group.add(rug);
  const sofa = new THREE.Group();
  sofa.add(B(4.6, 0.45, 1.1, 0x5a6f8f, 0, 0.32, 0));
  sofa.add(B(4.6, 0.9, 0.3, 0x4a5d7a, 0, 0.75, -0.42));
  sofa.add(B(0.32, 0.7, 1.1, 0x4a5d7a, -2.3, 0.55, 0));
  sofa.add(B(0.32, 0.7, 1.1, 0x4a5d7a, 2.3, 0.55, 0));
  for (const x of [-1.5, 0, 1.5]) sofa.add(B(1.3, 0.12, 0.9, 0x6a7fa0, x, 0.6, 0.05));
  sofa.add(B(0.5, 0.4, 0.14, 0xf2c94c, -1.6, 0.85, -0.2));
  sofa.add(B(0.5, 0.4, 0.14, 0xff9b78, 1.7, 0.85, -0.2));
  sofa.position.set(0, 0, -5.2);
  group.add(sofa);
  group.add(C(0.75, 0.75, 0.08, 0xffffff, 0, 0.5, -3.2, 32));
  group.add(C(0.08, 0.08, 0.48, 0x8c7a66, 0, 0.25, -3.2, 12));
  group.add(C(0.12, 0.1, 0.16, 0xffffff, 0.25, 0.62, -3.1, 12));
  group.add(B(0.4, 0.03, 0.3, 0xe85d6e, -0.25, 0.55, -3.3));
  for (const [x, face] of [[-3.7, Math.PI * 0.62], [3.7, -Math.PI * 0.62]] as const) {
    const a = new THREE.Group();
    a.add(B(0.95, 0.42, 0.85, 0xb36a4f, 0, 0.3, 0));
    a.add(B(0.95, 0.65, 0.22, 0x9e5b43, 0, 0.62, -0.32));
    a.add(B(0.18, 0.55, 0.85, 0x9e5b43, -0.43, 0.45, 0));
    a.add(B(0.18, 0.55, 0.85, 0x9e5b43, 0.43, 0.45, 0));
    a.position.set(x, 0, -3.5);
    a.rotation.y = face;
    group.add(a);
  }
  // 스탠드
  group.add(C(0.18, 0.22, 0.05, 0x39424f, 3.3, 0.03, -5.4, 16));
  group.add(C(0.025, 0.025, 1.6, 0x39424f, 3.3, 0.82, -5.4, 6));
  group.add(C(0.18, 0.28, 0.32, 0xfff2da, 3.3, 1.68, -5.4, 16));
  // 책장
  const shelf = new THREE.Group();
  shelf.add(B(2.2, 2.0, 0.6, 0x9c7a58, 0, 1.0, 0));
  const bookColors = [0x2f6bff, 0xe85d6e, 0x12a37a, 0xf2c94c, 0x8a6fe0, 0xff9b78];
  for (let row = 0; row < 4; row++) {
    shelf.add(B(2.04, 0.04, 0.5, 0x7d6045, 0, 0.12 + row * 0.47, 0.06));
    for (let k = 0; k < 7; k++) {
      if ((row * 7 + k) % 5 === 3) continue;
      shelf.add(B(0.18, 0.32 + ((k * 7 + row) % 3) * 0.04, 0.34, bookColors[(row * 3 + k) % bookColors.length], -0.85 + k * 0.28, 0.3 + row * 0.47, 0.1, false));
    }
  }
  shelf.position.set(-5.7, 0, -5.68);
  group.add(shelf);
  // 화분, 빈백
  for (const [x, z] of [[-10.6, -5.4], [10.6, -5.4], [-10.6, 7.0], [10.6, 7.0]]) group.add(plant(x, z));
  for (const [x, z, c] of [[-6.6, -3.2, 0xf2c94c], [-8.4, -2.4, 0x5bb8d6]] as const) {
    const bag = mesh(new THREE.SphereGeometry(0.55, 18, 12), c, x, 0.32, z);
    bag.scale.set(1, 0.62, 1);
    group.add(bag);
  }

  // ---------- 탕비실 (왼쪽 뒤) ----------
  // 조리대: 싱크대, 커피 머신, 전자레인지 + 위쪽 수납장
  group.add(B(4.5, 0.9, 0.85, 0xe8edf2, -15.65, 0.45, -5.575));
  group.add(B(4.6, 0.06, 0.92, 0x9c8873, -15.65, 0.93, -5.56));
  group.add(B(0.7, 0.03, 0.5, 0x8e99a6, -17.0, 0.965, -5.55, false));
  group.add(C(0.03, 0.03, 0.32, 0xc7cfda, -17.0, 1.12, -5.85, 8));
  const machine = new THREE.Group();
  machine.add(B(0.55, 0.65, 0.5, 0x2b3442, 0, 0.32, 0));
  machine.add(B(0.4, 0.06, 0.2, 0x8e99a6, 0, 0.1, 0.18));
  machine.add(C(0.07, 0.06, 0.12, 0xffffff, 0, 0.19, 0.18, 10));
  machine.add(B(0.18, 0.08, 0.02, 0xff6a3d, 0.12, 0.52, 0.26, false));
  machine.position.set(-15.9, 0.96, -5.55);
  group.add(machine);
  group.add(B(0.65, 0.4, 0.45, 0xd7dde4, -14.2, 1.16, -5.55));
  group.add(B(0.36, 0.26, 0.02, 0x39424f, -14.28, 1.16, -5.32, false));
  group.add(B(2.6, 0.75, 0.42, 0xe8edf2, -16.6, 2.35, -5.8));
  group.add(B(0.02, 0.6, 0.02, 0x8e99a6, -16.6, 2.35, -5.58, false));
  // 냉장고
  group.add(B(1.05, 1.9, 0.95, 0xdfe5eb, -12.75, 0.95, -5.5));
  group.add(B(1.07, 0.02, 0.97, 0xb8c1cc, -12.75, 1.25, -5.5, false));
  group.add(B(0.04, 0.4, 0.04, 0x8e99a6, -12.35, 1.5, -5.0, false));
  // 오늘의 커피 당첨자 보드
  const winners = textPanel(2.2, 1.35, () => {}, 320);
  winners.mesh.position.set(-14.4, 2.25, -5.94);
  group.add(winners.mesh);
  group.add(B(2.32, 1.47, 0.04, 0x9c7a58, -14.4, 2.25, -5.98, false));
  const setWinners = (lines: string[]) => {
    const g = winners.ctx;
    const W = winners.canvas.width;
    const H = winners.canvas.height;
    g.fillStyle = '#2B3442';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#FF9B78';
    g.font = 'bold 30px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('☕ 오늘의 커피 당첨자', W / 2, 34);
    g.fillStyle = '#FFFFFF';
    g.font = 'bold 26px sans-serif';
    if (!lines.length) {
      g.fillStyle = '#C7CFDB';
      g.font = '24px sans-serif';
      g.fillText('아직 없어요', W / 2, H / 2 + 18);
    }
    lines.slice(0, 5).forEach((l, i) => g.fillText(l, W / 2, 84 + i * 36));
    if (lines.length > 5) { g.font = '20px sans-serif'; g.fillStyle = '#C7CFDB'; g.fillText(`외 ${lines.length - 5}명`, W / 2, H - 16); }
    winners.tex.needsUpdate = true;
  };
  setWinners([]);
  // 정수기
  group.add(B(0.45, 1.05, 0.45, 0xe8edf2, -17.55, 0.53, -4.3));
  group.add(C(0.17, 0.17, 0.42, 0x8fc3ea, -17.55, 1.27, -4.3, 14));
  group.add(B(0.12, 0.06, 0.06, 0x2f6bff, -17.4, 0.8, -4.08, false));
  // 카페 테이블 + 스툴 셋
  group.add(C(0.55, 0.55, 0.05, 0xffffff, -15.4, 0.75, -1.9, 28));
  group.add(C(0.04, 0.04, 0.72, 0x39424f, -15.4, 0.37, -1.9, 8));
  group.add(C(0.28, 0.3, 0.03, 0x39424f, -15.4, 0.02, -1.9, 16));
  group.add(C(0.08, 0.07, 0.11, 0xffffff, -15.25, 0.83, -1.8, 10));
  group.add(C(0.08, 0.07, 0.11, 0xff6a3d, -15.6, 0.83, -2.05, 10));
  for (const [a, c] of [[0.4, 0xff9b78], [2.5, 0x5bb8d6], [4.5, 0xf2c94c]] as const) group.add(stool(-15.4 + Math.sin(a) * 0.78, -1.9 + Math.cos(a) * 0.78, c));
  // 간식 선반
  const snack = new THREE.Group();
  snack.add(B(0.6, 1.6, 1.8, 0xc9a77f, 0, 0.8, 0));
  const snackColors = [0xe85d6e, 0xf2c94c, 0x2f6bff, 0x12a37a, 0xff9b78, 0x8a6fe0];
  for (let row = 0; row < 3; row++) {
    snack.add(B(0.56, 0.04, 1.72, 0x9c7a58, 0.02, 0.35 + row * 0.45, 0));
    for (let k = 0; k < 5; k++) snack.add(B(0.3, 0.22, 0.26, snackColors[(row * 2 + k) % snackColors.length], 0.12, 0.49 + row * 0.45, -0.66 + k * 0.33, false));
  }
  snack.position.set(-17.68, 0, -1.7);
  group.add(snack);
  // 휴지통, 화분
  group.add(C(0.17, 0.14, 0.5, 0x5a6472, -12.3, 0.25, 0.7, 12));
  group.add(C(0.17, 0.14, 0.5, 0x2f6bff, -11.92, 0.25, 0.7, 12));
  group.add(plant(-17.4, 0.6, false));

  // ---------- 회의실 (오른쪽 앞) ----------
  const mrug = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.8), mat(0x8e9db2));
  mrug.rotation.x = -Math.PI / 2;
  mrug.position.set(15.3, 0.006, 4.0);
  mrug.receiveShadow = true;
  group.add(mrug);
  // 회의 테이블과 의자 8개
  group.add(B(3.8, 0.07, 1.8, 0xe9e3da, 15.3, 0.75, 4.0));
  group.add(B(3.84, 0.03, 1.84, 0x9c7a58, 15.3, 0.71, 4.0, false));
  for (const [x, z] of [[13.6, 3.3], [17.0, 3.3], [13.6, 4.7], [17.0, 4.7]]) group.add(B(0.07, 0.7, 0.07, 0x39424f, x, 0.35, z, false));
  for (const x of [14.0, 15.3, 16.6]) {
    group.add(chair(x, 2.8, 0));
    group.add(chair(x, 5.2, Math.PI));
  }
  group.add(chair(13.1, 4.0, Math.PI / 2, 0x4a5d7a));
  group.add(chair(17.5, 4.0, -Math.PI / 2, 0x4a5d7a));
  // 테이블 위: 노트북, 서류, 물병
  group.add(B(0.5, 0.03, 0.35, 0x8e99a6, 14.4, 0.8, 3.6));
  const lid = B(0.5, 0.32, 0.02, 0x39424f, 14.4, 0.96, 3.43);
  lid.rotation.x = -0.25;
  group.add(lid);
  group.add(B(0.42, 0.01, 0.3, 0xffffff, 16.0, 0.79, 4.4, false));
  group.add(B(0.42, 0.01, 0.3, 0xffffff, 16.08, 0.8, 4.36, false));
  for (const [x, z] of [[15.2, 3.7], [15.5, 4.5], [16.7, 3.6]]) group.add(C(0.05, 0.05, 0.22, 0x8fc3ea, x, 0.89, z, 8));
  // 수납장 + TV
  group.add(B(1.8, 0.8, 0.6, 0x9c7a58, 17.7, 0.4, 0.72));
  group.add(B(1.6, 0.9, 0.06, 0x18202b, 17.7, 1.35, 0.6));
  group.add(B(0.1, 0.18, 0.1, 0x39424f, 17.7, 0.88, 0.6, false));
  group.add(B(1.5, 0.82, 0.01, 0x30435f, 17.7, 1.35, 0.635, false));
  // 이동식 화이트보드 (통계·최고 기록, 누르면 열림)
  const wb = textPanel(2.1, 1.3, (g, W, H) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#D5DCE4'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = '#2B3442'; g.font = 'bold 38px sans-serif'; g.textAlign = 'center';
    g.fillText('📊 통계 · 최고 기록', W / 2, H * 0.36);
    g.strokeStyle = '#2F6BFF'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(W * 0.18, H * 0.7); g.lineTo(W * 0.38, H * 0.55); g.lineTo(W * 0.55, H * 0.64); g.lineTo(W * 0.8, H * 0.47); g.stroke();
    g.fillStyle = '#FF6A3D'; g.font = 'bold 26px sans-serif'; g.fillText('눌러서 보기', W / 2, H * 0.9);
  }, 360);
  wb.mesh.position.set(14.2, 1.55, 0.72);
  group.add(wb.mesh);
  group.add(B(2.2, 1.4, 0.05, 0xc7cfda, 14.2, 1.55, 0.68, false));
  group.add(B(0.06, 0.9, 0.06, 0x8e99a6, 13.2, 0.45, 0.7, false));
  group.add(B(0.06, 0.9, 0.06, 0x8e99a6, 15.2, 0.45, 0.7, false));
  group.add(B(0.6, 0.04, 0.5, 0x8e99a6, 13.2, 0.04, 0.7, false));
  group.add(B(0.6, 0.04, 0.5, 0x8e99a6, 15.2, 0.04, 0.7, false));
  group.add(B(1.9, 0.04, 0.08, 0x8e99a6, 14.2, 0.85, 0.78, false));
  for (const [x, c] of [[13.7, 0xe85d6e], [13.85, 0x2f6bff], [14.0, 0x12a37a]] as const) group.add(B(0.1, 0.03, 0.03, c, x, 0.88, 0.8, false));
  const board = wb.mesh;
  group.add(plant(12.1, 0.9, false), plant(18.3, 7.1));

  // 방 이름 (바닥 앞쪽, 은은하게)
  const signs: THREE.Sprite[] = [];
  for (const [text, x, z] of [['☕ 탕비실', -14.8, 0.4], ['📋 회의실', 15.2, 7.0]] as const) {
    const s = signLabel(text, '#5A6472');
    s.position.set(x, 2.9, z - 2.0);
    s.scale.multiplyScalar(0.9);
    group.add(s);
    signs.push(s);
  }

  // 게임 부스
  const booths: Booth[] = [];
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
  // M11: 앞쪽 한 줄이라 존도 앞쪽 가로 띠
  for (const [x, color, label, labelColor] of [[-5.6, 0x2f6bff, '복불복 존', '#2F6BFF'], [5.6, 0x12a37a, '경쟁 존', '#12A37A']] as const) {
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 3.8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false }));
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(x, 0.005, 5.5);
    group.add(zone);
    const sign = signLabel(label, labelColor);
    sign.position.set(x, 3.3, 2.6);
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

  return { group, booths, signs, boothGroups, board, setWinners };
}
