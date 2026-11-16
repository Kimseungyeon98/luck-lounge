import * as THREE from 'three';
import type { Member, Position } from '../net/loungeSocket';
import { createCharacter, type CharacterRig, type Face } from './characters3d';
import { chatBubble, disposeSprite, iconSprite, nameLabel } from './labels';
import { BOOTHS, COFFEE_SPOT, SEATS, SEAT_RANGE, blocked, boothAt, buildLounge, roomOf, walkBounds, type GameType, type Lounge, type RoomId, type Seat } from './lounge';

type Mode = 'preview' | 'lobby';

/** 투표 화면: 부스 6개의 가운데와 화면 가로 폭 (카메라가 오른쪽 앞 대각선이라 화면 가로 = (x - z)/√2) */
const VOTE_CENTER = { x: BOOTHS.reduce((a, b) => a + b.x, 0) / BOOTHS.length, z: BOOTHS.reduce((a, b) => a + b.z, 0) / BOOTHS.length + 0.2 };
const VOTE_SPAN = (() => {
  const sx = BOOTHS.map((b) => (b.x - b.z) / Math.SQRT2);
  // 부스 이름표가 받침보다 넓어서 양옆에 여유를 더 둔다 (M11 앞쪽 한 줄)
  return Math.max(...sx) - Math.min(...sx) + 2 * 1.45 + 3.0;
})();

interface BombState { order: string[]; holder: string | null; center: THREE.Vector3; loser: string | null }

const BUBBLE_SECONDS = 5;

/** 라운지의 한 사람 (캐릭터 + 이름표 + 왕관·말풍선·자리비움) */
class Person {
  readonly group = new THREE.Group();
  private rig!: CharacterRig;
  private label?: THREE.Sprite;
  private ring?: THREE.Mesh;
  private crown?: THREE.Sprite;
  private zz?: THREE.Sprite;
  private bubble?: THREE.Sprite;
  private bubbleLeft = 0;
  private walkPhase = 0;
  private readonly idlePhase = Math.random() * 10;
  characterIndex = -1;
  nickname = '';
  away = false;

  /** 폭탄을 들고 있으면 팔을 머리 위로, 이름표를 폭탄 위로 */
  holding = false;
  /** 풍선 펌프질 동작이 남은 시간 */
  pumpLeft = 0;
  private soot?: THREE.Group;
  private rubber?: THREE.Group;
  /** 판이 끝났을 때 당첨을 피함 → 웃는 얼굴 */
  private happy = false;

  /** 서버가 알려 준 위치·방향·걷는 중 */
  readonly server = { x: 0, z: 0, f: 0.67, m: false, known: false, s: null as number | null, r: false };
  /** 커피 마시는 남은 시간 (M11) */
  private drinkLeft = 0;
  private cup?: THREE.Mesh;

  constructor(readonly isMe: boolean) {}

  set(nickname: string, characterIndex: number) {
    if (characterIndex !== this.characterIndex) {
      const facing = this.rig?.root.rotation.y ?? 0.67;
      if (this.rig) this.group.remove(this.rig.root);
      this.rig = createCharacter(characterIndex);
      this.rig.root.rotation.y = facing;
      this.group.add(this.rig.root);
      this.characterIndex = characterIndex;
      this.applyAway();
      this.refreshFace();
      this.placeOverlays();
    }
    if (nickname !== this.nickname || !this.label) {
      if (this.label) {
        this.group.remove(this.label);
        disposeSprite(this.label);
      }
      this.label = nameLabel(this.isMe ? `나 · ${nickname}` : nickname, this.isMe);
      this.group.add(this.label);
      this.nickname = nickname;
      this.placeOverlays();
    }
    if (this.isMe && !this.ring) {
      this.ring = new THREE.Mesh(
        new THREE.RingGeometry(0.38, 0.47, 32),
        new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: 0.8 }),
      );
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.02;
      this.group.add(this.ring);
    }
  }

  private placeOverlays() {
    const top = this.rig?.height ?? 1.55;
    if (this.label) this.label.position.y = top + (this.holding ? 1.45 : 0.3);
    if (this.crown) this.crown.position.y = top + 0.67;
    if (this.zz) this.zz.position.set(0.45, top + 0.05, 0);
    if (this.bubble) this.bubble.position.y = top + (this.crown ? 1.0 : 0.62) + this.bubble.scale.y / 2;
  }

  showLabel(v: boolean) {
    if (this.label) this.label.visible = v;
    if (this.ring) this.ring.visible = v;
    if (this.crown) this.crown.visible = v;
  }

  setHost(v: boolean) {
    if (v && !this.crown) {
      this.crown = iconSprite('👑', 0.55);
      this.group.add(this.crown);
    } else if (!v && this.crown) {
      this.group.remove(this.crown);
      disposeSprite(this.crown);
      this.crown = undefined;
    }
    this.placeOverlays();
  }

  setAway(v: boolean) {
    if (v === this.away) return;
    this.away = v;
    this.applyAway();
  }

  private applyAway() {
    if (!this.rig) return;
    this.rig.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.Material & { userData: { own?: boolean } };
      if (this.away) {
        if (!material.userData.own) {
          const own = material.clone();
          own.userData.own = true;
          mesh.material = own;
        }
        (mesh.material as THREE.Material).transparent = true;
        (mesh.material as THREE.Material).opacity = 0.45;
      } else if (material.userData.own) {
        material.opacity = 1;
        material.transparent = false;
      }
    });
    this.refreshFace();
    if (this.away && !this.zz) {
      this.zz = iconSprite('💤', 0.6);
      this.group.add(this.zz);
    } else if (!this.away && this.zz) {
      this.group.remove(this.zz);
      disposeSprite(this.zz);
      this.zz = undefined;
    }
    this.placeOverlays();
  }

  /** 커피 3초: 손에 컵을 들고 홀짝 (M11) */
  drink() {
    this.drinkLeft = 3;
    if (!this.cup && this.rig?.armR) {
      this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.13, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
      this.cup.position.set(0, -0.27, 0.07);
      this.rig.armR.add(this.cup);
    }
    this.say('☕', true);
  }

  say(text: string, emoji: boolean) {
    if (this.bubble) {
      this.group.remove(this.bubble);
      disposeSprite(this.bubble);
    }
    this.bubble = emoji ? iconSprite(text, 0.7) : chatBubble(text);
    this.bubbleLeft = BUBBLE_SECONDS;
    this.group.add(this.bubble);
    this.placeOverlays();
  }

  setHolding(v: boolean) {
    if (v === this.holding) return;
    this.holding = v;
    this.placeOverlays();
  }

  /** 당첨 연출: 얼굴에 검댕, 부스스한 머리 */
  setSoot(v: boolean) {
    if (v && !this.soot) {
      const g = new THREE.Group();
      if (!this.rig.setFace) {
        // 표정을 못 바꾸는 모델이면 얼굴 위에 검은 막을 씌운다
        const blot = new THREE.Mesh(new THREE.SphereGeometry(0.43, 24, 18), new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.55 }));
        blot.scale.set(1.01, 0.95, 0.97);
        g.add(blot);
      }
      const fuzz = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), fuzz);
        puff.position.set(Math.cos(a) * 0.25, 0.42 + Math.sin(k) * 0.04, Math.sin(a) * 0.22);
        g.add(puff);
      }
      g.position.y = (this.rig.height ?? 1.55) - 0.47;
      this.rig.body.add(g);
      this.soot = g;
    } else if (!v && this.soot) {
      this.rig.body.remove(this.soot);
      this.soot = undefined;
    }
    this.refreshFace();
  }

  /** 풍선 당첨 연출: 머리에 고무 조각, 놀란 입 */
  setRubber(v: boolean) {
    if (v && !this.rubber) {
      const g = new THREE.Group();
      const red = new THREE.MeshBasicMaterial({ color: 0xe84b5f, side: THREE.DoubleSide });
      for (let k = 0; k < 6; k++) {
        const piece = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), red);
        const a = (k / 6) * Math.PI * 2;
        piece.position.set(Math.cos(a) * 0.3, 0.38 + (k % 2) * 0.06, Math.sin(a) * 0.28);
        piece.rotation.set(Math.random(), a, Math.random());
        g.add(piece);
      }
      if (!this.rig.setFace) {
        const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0x5a2a2a }));
        mouth.position.set(0, -0.13, 0.4);
        g.add(mouth);
      }
      g.position.y = (this.rig.height ?? 1.55) - 0.47;
      this.rig.body.add(g);
      this.rubber = g;
    } else if (!v && this.rubber) {
      this.rig.body.remove(this.rubber);
      this.rubber = undefined;
    }
    this.refreshFace();
  }

  setHappy(v: boolean) {
    if (v === this.happy) return;
    this.happy = v;
    this.refreshFace();
  }

  /** 당첨 연출 > 자리비움 > 웃음 > 기본 순으로 표정을 고른다 */
  private refreshFace() {
    const face: Face = this.soot ? 'soot' : this.rubber ? 'surprised' : this.away ? 'sleepy' : this.happy ? 'happy' : 'normal';
    this.rig?.setFace?.(face);
  }

  get position() {
    return this.group.position;
  }

  get facing() {
    return this.rig.root;
  }

  /** 서버 위치 쪽으로 부드럽게 따라가며 걷기 동작 */
  update(dt: number, t: number) {
    const p = this.group.position;
    if (this.server.known) {
      const k = 1 - Math.exp(-dt * 12);
      p.x += (this.server.x - p.x) * k;
      p.z += (this.server.z - p.z) * k;
      const cur = this.rig.root.rotation.y;
      const diff = Math.atan2(Math.sin(this.server.f - cur), Math.cos(this.server.f - cur));
      this.rig.root.rotation.y = cur + diff * Math.min(1, dt * 12);
    }
    const moving = this.server.m;
    const running = moving && this.server.r;
    this.walkPhase += dt * (moving ? (running ? 15 : 10) : 0);
    const swing = moving ? Math.sin(this.walkPhase) * (running ? 0.95 : 0.7) : 0;
    const seat: Seat | undefined = this.server.s != null ? SEATS[this.server.s] : undefined;
    // 앉으면 엉덩이를 자리 높이에, 다리는 앞으로 (M11)
    const legX = seat ? -1.45 : swing;
    if (this.rig.legL) this.rig.legL.rotation.x = legX;
    if (this.rig.legR) this.rig.legR.rotation.x = seat ? -1.45 : -swing;
    if (this.pumpLeft > 0) this.pumpLeft -= dt;
    const pumpArm = this.pumpLeft > 0 ? -1.2 - Math.sin(this.pumpLeft * 18) * 0.5 : null;
    if (this.drinkLeft > 0) {
      this.drinkLeft -= dt;
      if (this.drinkLeft <= 0 && this.cup) {
        this.cup.removeFromParent();
        this.cup.geometry.dispose();
        this.cup = undefined;
      }
    }
    const sip = this.drinkLeft > 0 ? -1.75 + Math.sin(t * 4) * 0.25 : null;
    const rest = seat ? -0.35 : null;
    if (this.rig.armL) this.rig.armL.rotation.x = this.holding ? -2.7 : pumpArm ?? rest ?? -swing * 0.8;
    if (this.rig.armR) this.rig.armR.rotation.x = this.holding ? -2.7 : pumpArm ?? sip ?? rest ?? swing * 0.8;
    this.rig.body.position.y = seat ? seat.h - 0.3 : moving ? Math.abs(Math.sin(this.walkPhase)) * (running ? 0.11 : 0.08) : Math.sin(t * 2.2 + this.idlePhase) * 0.012;
    // 달릴 때는 몸을 앞으로 살짝 기울인다
    this.rig.body.rotation.x = running ? 0.18 : 0;
    this.rig.tick?.(dt);
    if (this.zz) this.zz.position.y = (this.rig.height ?? 1.55) + 0.05 + Math.sin(t * 2) * 0.06;
    if (this.bubble) {
      this.bubbleLeft -= dt;
      if (this.bubbleLeft <= 0) {
        this.group.remove(this.bubble);
        disposeSprite(this.bubble);
        this.bubble = undefined;
      }
    }
  }

  dispose() {
    for (const s of [this.label, this.crown, this.zz, this.bubble]) if (s) disposeSprite(s);
  }
}

/**
 * 3D 라운지 화면 하나로 메인(입장) 화면과 대기실을 모두 그린다.
 * - preview: 라운지를 배경으로 내 캐릭터를 가까이서 돌려 보여 줌
 * - lobby: 내 캐릭터를 따라가는 쿼터뷰. 위치는 서버가 계산하고 여기서는 부드럽게 이어서 그린다.
 */
export class LoungeView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly camDir = new THREE.Vector3(1, 1.15, 1.25).normalize();
  private readonly camTarget = new THREE.Vector3(1.4, -0.35, -2.2);
  private readonly camGoal = this.camTarget.clone();
  private zoom = 2.3;
  private zoomGoal = 2.3;
  private readonly viewHeight = 9.5;
  private readonly lounge: Lounge;
  private readonly me = new Person(true);
  private readonly people = new Map<string, Person>();
  private mode: Mode = 'preview';
  private running = true;
  private last = performance.now();
  private t = 0;
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private meId: string | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly marker: THREE.Mesh;
  private markerLeft = 0;
  private bombState: BombState | null = null;
  private voting = false;
  private balloonState: { center: THREE.Vector3; count: number; order: string[] } | null = null;
  private readonly balloon: THREE.Group;
  private readonly balloonStand: THREE.Group;
  private readonly bits: { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; life: number }[] = [];
  private balloonShown = 0.8;
  private readonly bomb: THREE.Group;
  private readonly spark: THREE.Mesh;
  private readonly puffs: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private shake = 0;
  private readonly sun = new THREE.DirectionalLight(0xfff4e6, 1.9);

  /** 화면 오른쪽·아래 방향이 바닥에서 어느 쪽인지 (조이스틱 방향 변환용) */
  readonly screenRight = new THREE.Vector3(1, 0, -1).normalize();
  readonly screenDown = new THREE.Vector3(1, 0, 1).normalize();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xf2eee8);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc9bba8, 1.6));
    const sun = this.sun;
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    // 라운지가 넓어져서(M10) 그림자는 카메라가 보는 곳 주변만 그린다 (매 프레임 따라감)
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun, sun.target);

    this.lounge = buildLounge();
    this.scene.add(this.lounge.group);

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.24, 24),
      new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0 }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.03;
    this.scene.add(this.marker);

    // 시한폭탄과 폭발 연기
    this.bomb = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.6 });
    this.bomb.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), dark));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x555b66 }));
    cap.position.y = 0.31;
    this.bomb.add(cap);
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xc9a66b }));
    fuse.position.set(0.05, 0.43, 0);
    fuse.rotation.z = -0.4;
    this.bomb.add(fuse);
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc233 }));
    this.spark.position.set(0.1, 0.55, 0);
    this.bomb.add(this.spark);
    const glow = new THREE.PointLight(0xffaa33, 0.8, 2.5);
    glow.position.copy(this.spark.position);
    this.bomb.add(glow);
    this.bomb.scale.setScalar(1.6);
    this.bomb.visible = false;
    this.scene.add(this.bomb);
    for (let i = 0; i < 14; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 10, 8),
        new THREE.MeshBasicMaterial({ color: i % 3 ? 0xeeeeee : 0xffb347, transparent: true, opacity: 0.9 }),
      );
      puff.visible = false;
      this.scene.add(puff);
      this.puffs.push({ mesh: puff, v: new THREE.Vector3(), life: 0 });
    }

    // 풍선과 받침, 터질 때 조각
    this.balloonStand = new THREE.Group();
    const standMat = new THREE.MeshStandardMaterial({ color: 0x8c7a66, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.5, 18), standMat);
    base.position.y = 0.25;
    base.castShadow = true;
    const pumpBody = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x5a6472 }));
    pumpBody.position.y = 0.67;
    this.balloonStand.add(base, pumpBody);
    this.balloonStand.visible = false;
    this.scene.add(this.balloonStand);
    this.balloon = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe84b5f, roughness: 0.35 });
    const skin = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 22), skinMat);
    skin.castShadow = true;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 10), skinMat);
    knot.position.y = -0.52;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    shine.position.set(-0.18, 0.22, 0.38);
    this.balloon.add(skin, knot, shine);
    this.balloon.visible = false;
    this.scene.add(this.balloon);
    for (let i = 0; i < 18; i++) {
      const bit = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ color: 0xe84b5f, side: THREE.DoubleSide, transparent: true }));
      bit.visible = false;
      this.scene.add(bit);
      this.bits.push({ mesh: bit, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }

    this.me.set('', 0);
    this.me.group.position.set(1.4, 0, -2.2);
    this.scene.add(this.me.group);
    this.applyMode();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
    requestAnimationFrame(this.loop);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** 입장 화면에서 카드에 가리지 않는 영역 (화면 px). 미리보기 캐릭터를 이 안 가운데에 맞춘다 */
  private previewArea: { x: number; y: number; w: number; h: number } | null = null;
  setPreviewArea(a: { x: number; y: number; w: number; h: number }) {
    this.previewArea = a.w > 40 && a.h > 40 ? a : null;
  }

  /** 입장 화면에서 고른 캐릭터·닉네임을 미리보기에 반영 */
  preview(nickname: string, characterIndex: number) {
    this.me.set(nickname || ' ', characterIndex);
    this.me.showLabel(this.mode === 'lobby');
  }

  /** 입장 완료: 카메라가 물러나며 대기실로 */
  enterLobby(me: { playerId: string; nickname: string; characterIndex: number }) {
    this.meId = me.playerId;
    this.me.set(me.nickname, me.characterIndex);
    this.people.set(me.playerId, this.me);
    this.mode = 'lobby';
    this.applyMode();
  }

  /** 접속자·방장·자리비움 */
  setPresence(players: Member[], hostId: string | null) {
    const seen = new Set<string>();
    for (const m of players) {
      seen.add(m.playerId);
      let person = this.people.get(m.playerId);
      if (!person) {
        person = new Person(false);
        person.group.visible = this.mode === 'lobby';
        this.people.set(m.playerId, person);
        this.scene.add(person.group);
      }
      if (person !== this.me) person.set(m.nickname, m.characterIndex);
      person.setHost(m.playerId === hostId);
      person.setAway(m.away);
    }
    for (const [id, person] of this.people) {
      if (!seen.has(id) && person !== this.me) {
        this.scene.remove(person.group);
        person.dispose();
        this.people.delete(id);
      }
    }
  }

  /** 서버가 계산한 위치 (0.1초마다) */
  setPositions(list: Position[]) {
    for (const pos of list) {
      const person = this.people.get(pos.id);
      if (!person) continue;
      // 처음 보거나 멀리 순간이동했으면(투표 때 메인으로 모임 등) 걸어가지 않고 바로 그 자리에
      const far = Math.hypot(person.group.position.x - pos.x, person.group.position.z - pos.z) > 3;
      if (!person.server.known || far) person.group.position.set(pos.x, 0, pos.z);
      Object.assign(person.server, { x: pos.x, z: pos.z, f: pos.f, m: pos.m, known: true, s: pos.s ?? null, r: !!pos.r });
    }
  }

  say(playerId: string, text: string, emoji: boolean) {
    this.people.get(playerId)?.say(text, emoji);
  }

  // ---------- 시한폭탄 ----------

  bombStart(order: string[], holder: string, centerX: number, centerZ: number) {
    this.voting = false;
    this.bombState = { order, holder: null, center: new THREE.Vector3(centerX, 0, centerZ), loser: null };
    for (const p of this.people.values()) p.setHappy(false);
    this.bombHolder(holder);
    this.bomb.visible = true;
    const h = this.people.get(holder);
    if (h) this.bomb.position.set(h.position.x, 2.05, h.position.z);
    for (const g of this.lounge.boothGroups) g.visible = false;
  }

  bombHolder(id: string) {
    if (!this.bombState) return;
    for (const p of this.people.values()) p.setHolding(false);
    this.bombState.holder = id;
    this.people.get(id)?.setHolding(true);
  }

  bombExplode(loser: string) {
    if (!this.bombState) return;
    this.bombState.loser = loser;
    this.bombState.holder = null;
    for (const p of this.people.values()) p.setHolding(false);
    this.bomb.visible = false;
    this.cheerSurvivors(this.bombState.order, loser);
    const victim = this.people.get(loser);
    if (victim) {
      victim.setSoot(true);
      for (const puff of this.puffs) {
        puff.mesh.visible = true;
        puff.mesh.position.set(victim.position.x, 1.6, victim.position.z);
        puff.v.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3);
        puff.life = 0.9 + Math.random() * 0.4;
        puff.mesh.scale.setScalar(0.4);
      }
    }
    if (!this.reduceMotion) this.shake = 0.5;
  }

  /** 판 사이: 폭탄만 치우고 당첨자 검댕은 내기가 끝날 때까지 남겨 둔다 */
  bombRoundEnd() {
    this.bomb.visible = false;
    for (const p of this.people.values()) p.setHolding(false);
  }

  /** 투표 중에는 두 부스가 다 보이게 카메라를 넓힌다 */
  setVoting(v: boolean) {
    this.voting = v;
    for (const p of this.people.values()) {
      p.setSoot(false);
      p.setRubber(false);
      p.setHappy(false);
    }
  }

  /** 지금 부스 위에 서 있는 인원 (화면 표시용. 실제 집계는 서버가 한다) */
  /** 내가 서 있는 부스 (없으면 null) */
  /** 누군가 커피를 마심 */
  drink(playerId: string) {
    this.people.get(playerId)?.drink();
  }

  /**
   * Space·버튼으로 할 수 있는 일 (M11): 앉아 있으면 일어나기, 커피 머신 앞이면 커피, 가까운 빈자리에 앉기.
   * @return 없으면 null
   */
  interaction(): { kind: 'stand' } | { kind: 'coffee' } | { kind: 'sit'; seat: Seat } | null {
    const mine = this.people.get(this.meId ?? '');
    if (!mine) return null;
    if (mine.server.s != null) return { kind: 'stand' };
    const { x, z } = mine.server;
    if (Math.hypot(x - COFFEE_SPOT.x, z - COFFEE_SPOT.z) <= COFFEE_SPOT.r - 0.1) return { kind: 'coffee' };
    const taken = new Set([...this.people.values()].map((p) => p.server.s).filter((v): v is number => v != null));
    let best: Seat | null = null;
    let bd = SEAT_RANGE;
    for (const seat of SEATS) {
      const d = Math.hypot(x - seat.x, z - seat.z);
      if (d < bd && !taken.has(seat.id)) {
        bd = d;
        best = seat;
      }
    }
    return best ? { kind: 'sit', seat: best } : null;
  }

  /** 내가 있는 방 */
  myRoom(): RoomId {
    return roomOf(this.me.position.x, this.me.position.z);
  }

  /** 내 위치 (커피 머신 앞인지 등) */
  myPosition(): { x: number; z: number } {
    return { x: this.me.position.x, z: this.me.position.z };
  }

  /** 탕비실 보드에 오늘의 커피 당첨자 */
  setWinners(lines: string[]) {
    this.lounge.setWinners(lines);
  }

  myBooth(): GameType | null {
    return boothAt(this.me.position.x, this.me.position.z);
  }

  voteCounts(): Record<GameType, number> & { abstain: number } {
    const c = { LADDER: 0, BOMB: 0, BALLOON: 0, TARGET: 0, STOP: 0, TOWER: 0, abstain: 0 };
    for (const p of this.people.values()) {
      const b = boothAt(p.position.x, p.position.z);
      if (b) c[b]++;
      else c.abstain++;
    }
    return c;
  }


  // ---------- 풍선 불기 ----------

  balloonStart(count: number, centerX: number, centerZ: number, order: string[] = []) {
    this.voting = false;
    this.balloonState = { center: new THREE.Vector3(centerX, 0, centerZ), count, order };
    for (const p of this.people.values()) p.setHappy(false);
    this.balloonShown = this.balloonSize(count);
    this.balloonStand.position.set(centerX, 0, centerZ);
    this.balloon.position.set(centerX, 1.4, centerZ);
    this.balloonStand.visible = true;
    this.balloon.visible = true;
    for (const g of this.lounge.boothGroups) g.visible = false;
  }

  balloonPump(playerId: string, count: number) {
    if (!this.balloonState) return;
    this.balloonState.count = count;
    const p = this.people.get(playerId);
    if (p) p.pumpLeft = 0.5;
  }

  balloonPop(loser: string) {
    if (!this.balloonState) return;
    this.balloon.visible = false;
    const at = this.balloon.position;
    for (const b of this.bits) {
      b.mesh.visible = true;
      b.mesh.position.copy(at);
      b.v.set((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5);
      b.spin.set(Math.random() * 8, Math.random() * 8, 0);
      b.life = 1.2;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    }
    this.cheerSurvivors(this.balloonState.order, loser);
    this.people.get(loser)?.setRubber(true);
    if (!this.reduceMotion) this.shake = 0.3;
  }

  /** 이번 판에서 당첨을 피한 사람은 다음 판(또는 내기 끝)까지 웃는 얼굴 */
  private cheerSurvivors(order: string[], loser: string) {
    for (const id of order) if (id !== loser) this.people.get(id)?.setHappy(true);
  }

  /** 판 사이: 다음 판에서 새 풍선이 나온다 */
  balloonRoundEnd() {
    this.balloon.visible = false;
  }

  private balloonSize(count: number) {
    return 0.8 + count * 0.06;
  }

  /** 화면의 이 지점이 통계 게시판인지 */
  hitsBoard(clientX: number, clientY: number): boolean {
    if (this.mode !== 'lobby') return false;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(this.lounge.board).length > 0;
  }

  bombFinish() {
    this.balloonState = null;
    this.balloon.visible = false;
    this.balloonStand.visible = false;
    for (const p of this.people.values()) p.setRubber(false);
    this.bombState = null;
    this.bomb.visible = false;
    for (const p of this.people.values()) {
      p.setHolding(false);
      p.setSoot(false);
      p.setHappy(false);
    }
    for (const g of this.lounge.boothGroups) g.visible = true;
    for (const s of this.lounge.signs) s.visible = this.mode === 'lobby';
  }

  /** 화면 좌표 → 바닥 좌표. 걸을 수 없는 곳이면 null */
  floorAt(clientX: number, clientY: number): { x: number; z: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit) || blocked(hit.x, hit.z)) return null;
    return { x: hit.x, z: hit.z };
  }

  showTapMarker(x: number, z: number) {
    this.marker.position.x = x;
    this.marker.position.z = z;
    this.markerLeft = 0.8;
  }

  private applyMode() {
    const lobby = this.mode === 'lobby';
    for (const p of this.people.values()) if (p !== this.me) p.group.visible = lobby;
    for (const s of this.lounge.signs) s.visible = lobby;
    this.me.showLabel(lobby);
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const vh = aspect > 1 ? this.viewHeight * 0.8 : this.viewHeight;
    Object.assign(this.camera, { left: (-vh * aspect) / 2, right: (vh * aspect) / 2, top: vh / 2, bottom: -vh / 2 });
    this.camera.updateProjectionMatrix();
  }

  private onVisibility = () => {
    this.running = !document.hidden;
    if (this.running) {
      this.last = performance.now();
      requestAnimationFrame(this.loop);
    }
  };

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;

    const mp = this.me.group.position;
    let previewZoom = 2.3;
    if (this.mode === 'preview') {
      if (!this.reduceMotion) this.me.facing.rotation.y += dt * 0.7;
      const W = this.container.clientWidth;
      const H = this.container.clientHeight;
      const a = this.previewArea;
      if (a && W && H) {
        // 캐릭터(이름표 포함 약 1.3 화면 단위)가 보이는 영역 높이의 70%가 되게
        const vh = W / H > 1 ? this.viewHeight * 0.8 : this.viewHeight;
        previewZoom = Math.max(0.8, Math.min(3, (0.7 * a.h * vh) / (1.3 * H)));
        const offUp = (0.5 - (a.y + a.h / 2) / H) * (vh / previewZoom);
        const offRight = ((a.x + a.w / 2) / W - 0.5) * ((vh * W) / H / previewZoom);
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
        this.camGoal.set(mp.x, 0.75, mp.z).addScaledVector(up, -offUp).addScaledVector(right, -offRight);
      } else {
        this.camGoal.set(mp.x, -0.35, mp.z);
      }
    } else if (this.voting) {
      // 세로 화면은 위쪽에 투표 현황이 있어 부스를 조금 아래로 내린다 (화면 위쪽 = 바닥의 -x -z 방향)
      const up = (this.container.clientWidth || 1) < (this.container.clientHeight || 1) ? 2.4 : 0.3;
      this.camGoal.set(VOTE_CENTER.x - up, 0.3, VOTE_CENTER.z - up);
    } else if (this.bombState || this.balloonState) {
      // 게임 중에는 둥글게 선 사람들 전체가 보이게
      const c = (this.bombState ?? this.balloonState)!.center;
      this.camGoal.set(c.x, 0.2, c.z + 0.3);
    } else {
      // 지금 있는 방 안에서만 따라간다 (방 밖 빈 바닥이 화면 반을 차지하지 않게)
      const b = walkBounds(roomOf(mp.x, mp.z));
      const clampTo = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
      this.camGoal.set(clampTo(mp.x - 0.5, b.minX + 2.3, b.maxX - 2.7), 0.3, clampTo(mp.z - 0.3, b.minZ + 0.4, b.maxZ - 2.5));
    }
    // 대기실은 넓게 (M8): 예전보다 가로로 약 1.4배. 세로로 긴 휴대폰은 가로 9m는 보이게
    const cw = this.container.clientWidth || 1;
    const ch = this.container.clientHeight || 1;
    const lobbyZoom = Math.min(0.76, (this.viewHeight * (cw / ch > 1 ? 0.8 : 1) * (cw / ch)) / 9);
    // 투표 중에는 부스 6개가 모두 보이게 (M10: 메인 1.6배라 화면 가로로 약 20m)
    const voteZoom = Math.min(0.5, (this.viewHeight * (cw / ch > 1 ? 0.8 : 1) * (cw / ch)) / VOTE_SPAN, (this.viewHeight * (cw / ch > 1 ? 0.8 : 1)) / 13);
    this.zoomGoal = this.mode === 'preview' ? previewZoom : this.voting ? voteZoom : this.bombState || this.balloonState ? 0.95 : lobbyZoom;
    if (this.bombState?.holder) {
      const h = this.people.get(this.bombState.holder);
      if (h) {
        const goal = new THREE.Vector3(h.position.x, 2.05 + Math.abs(Math.sin(this.t * 10)) * 0.06, h.position.z);
        this.bomb.position.lerp(goal, 1 - Math.exp(-dt * 14));
        this.bomb.rotation.y += dt * 2;
        this.spark.scale.setScalar(0.8 + Math.sin(this.t * 25) * 0.35);
      }
    }
    if (this.balloonState) {
      this.balloonShown += (this.balloonSize(this.balloonState.count) - this.balloonShown) * (1 - Math.exp(-dt * 10));
      const pumping = [...this.people.values()].some((p) => p.pumpLeft > 0);
      const wobble = 1 + Math.sin(this.t * 3) * 0.015 + (pumping ? Math.sin(this.t * 40) * 0.025 : 0);
      const sz = this.balloonShown;
      this.balloon.scale.set(sz * wobble, sz * 1.15 * wobble, sz * wobble);
      this.balloon.position.y = 0.95 + sz * 0.58;
    }
    for (const b of this.bits) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.v.y -= 6 * dt;
      b.mesh.position.addScaledVector(b.v, dt);
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, b.life);
      if (b.life <= 0) b.mesh.visible = false;
    }
    for (const puff of this.puffs) {
      if (puff.life <= 0) continue;
      puff.life -= dt;
      puff.mesh.position.addScaledVector(puff.v, dt);
      puff.v.multiplyScalar(0.92);
      puff.mesh.scale.multiplyScalar(1 + dt * 1.8);
      (puff.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, puff.life);
      if (puff.life <= 0) puff.mesh.visible = false;
    }
    for (const p of this.people.values()) p.update(dt, this.t);
    if (!this.people.has(this.meId ?? '')) this.me.update(dt, this.t);
    for (const b of this.lounge.booths) b.animate(this.t);

    if (this.markerLeft > 0) {
      this.markerLeft -= dt;
      const m = this.marker.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, this.markerLeft);
      this.marker.scale.setScalar(1 + (0.8 - this.markerLeft));
    }

    const k = 1 - Math.exp(-dt * 4);
    this.camTarget.lerp(this.camGoal, k);
    this.zoom += (this.zoomGoal - this.zoom) * k;
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
    let sx = 0;
    let sz = 0;
    if (this.shake > 0) {
      this.shake -= dt;
      sx = (Math.random() - 0.5) * this.shake * 0.6;
      sz = (Math.random() - 0.5) * this.shake * 0.6;
    }
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);
    this.sun.position.set(this.camTarget.x + 6, 12, this.camTarget.z + 8);
    this.sun.target.updateMatrixWorld();
    this.camera.position.copy(this.camTarget).add(new THREE.Vector3(sx, 0, sz)).addScaledVector(this.camDir, 30);
    this.camera.lookAt(this.camTarget.x + sx, this.camTarget.y, this.camTarget.z + sz);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };
}
