import * as THREE from 'three';
import type { Member, Position } from '../net/loungeSocket';
import { createCharacter, type CharacterRig } from './characters3d';
import { chatBubble, disposeSprite, iconSprite, nameLabel } from './labels';
import { blocked, buildLounge, type Lounge } from './lounge';

type Mode = 'preview' | 'lobby';

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
  private soot?: THREE.Group;

  /** 서버가 알려 준 위치·방향·걷는 중 */
  readonly server = { x: 0, z: 0, f: 0.67, m: false, known: false };

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
      const blot = new THREE.Mesh(new THREE.SphereGeometry(0.43, 24, 18), new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.55 }));
      blot.scale.set(1.01, 0.95, 0.97);
      g.add(blot);
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
    this.walkPhase += dt * (moving ? 10 : 0);
    const swing = moving ? Math.sin(this.walkPhase) * 0.7 : 0;
    if (this.rig.legL) this.rig.legL.rotation.x = swing;
    if (this.rig.legR) this.rig.legR.rotation.x = -swing;
    if (this.rig.armL) this.rig.armL.rotation.x = this.holding ? -2.7 : -swing * 0.8;
    if (this.rig.armR) this.rig.armR.rotation.x = this.holding ? -2.7 : swing * 0.8;
    this.rig.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.08 : Math.sin(t * 2.2 + this.idlePhase) * 0.012;
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
  private readonly bomb: THREE.Group;
  private readonly spark: THREE.Mesh;
  private readonly puffs: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private shake = 0;

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
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.9);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);

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
      if (!person.server.known) person.group.position.set(pos.x, 0, pos.z);
      Object.assign(person.server, { x: pos.x, z: pos.z, f: pos.f, m: pos.m, known: true });
    }
  }

  say(playerId: string, text: string, emoji: boolean) {
    this.people.get(playerId)?.say(text, emoji);
  }

  // ---------- 시한폭탄 ----------

  bombStart(order: string[], holder: string, centerX: number, centerZ: number) {
    this.voting = false;
    this.bombState = { order, holder: null, center: new THREE.Vector3(centerX, 0, centerZ), loser: null };
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
    for (const p of this.people.values()) p.setSoot(false);
  }

  /** 지금 부스 위에 서 있는 인원 (화면 표시용. 실제 집계는 서버가 한다) */
  voteCounts(): { bomb: number; balloon: number; abstain: number } {
    const c = { bomb: 0, balloon: 0, abstain: 0 };
    for (const p of this.people.values()) {
      const pos = p.position;
      if (Math.hypot(pos.x + 3.0, pos.z - 2.6) < 1.45) c.bomb++;
      else if (Math.hypot(pos.x - 3.0, pos.z - 2.6) < 1.45) c.balloon++;
      else c.abstain++;
    }
    return c;
  }

  bombFinish() {
    this.bombState = null;
    this.bomb.visible = false;
    for (const p of this.people.values()) {
      p.setHolding(false);
      p.setSoot(false);
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
    if (this.mode === 'preview') {
      if (!this.reduceMotion) this.me.facing.rotation.y += dt * 0.7;
      this.camGoal.set(mp.x, -0.35, mp.z);
    } else if (this.voting) {
      this.camGoal.set(0, 0.3, 2.3);
    } else if (this.bombState) {
      // 게임 중에는 둥글게 선 사람들 전체가 보이게
      this.camGoal.set(this.bombState.center.x, 0.2, this.bombState.center.z + 0.3);
    } else {
      this.camGoal.set(Math.max(-3.0, Math.min(2.6, mp.x - 0.5)), 0.3, Math.max(-3.2, Math.min(2.4, mp.z - 0.3)));
    }
    this.zoomGoal = this.mode === 'preview' ? 2.3 : this.voting ? 0.64 : this.bombState ? 0.95 : 1.05;
    if (this.bombState?.holder) {
      const h = this.people.get(this.bombState.holder);
      if (h) {
        const goal = new THREE.Vector3(h.position.x, 2.05 + Math.abs(Math.sin(this.t * 10)) * 0.06, h.position.z);
        this.bomb.position.lerp(goal, 1 - Math.exp(-dt * 14));
        this.bomb.rotation.y += dt * 2;
        this.spark.scale.setScalar(0.8 + Math.sin(this.t * 25) * 0.35);
      }
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
    this.camera.position.copy(this.camTarget).add(new THREE.Vector3(sx, 0, sz)).addScaledVector(this.camDir, 30);
    this.camera.lookAt(this.camTarget.x + sx, this.camTarget.y, this.camTarget.z + sz);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };
}
