import * as THREE from 'three';
import type { PlayerView } from '../api';
import { createCharacter, type CharacterRig } from './characters3d';
import { disposeSprite, nameLabel } from './labels';
import { buildLounge, type Lounge } from './lounge';

type Mode = 'preview' | 'lobby';

/** 라운지의 한 사람 (캐릭터 + 이름표) */
class Person {
  readonly group = new THREE.Group();
  private rig!: CharacterRig;
  private label?: THREE.Sprite;
  private ring?: THREE.Mesh;
  characterIndex = 0;
  nickname = '';
  private phase = Math.random() * 10;

  constructor(readonly isMe: boolean) {}

  set(nickname: string, characterIndex: number) {
    const facing = this.rig?.root.rotation.y ?? 0;
    if (characterIndex !== this.characterIndex || !this.rig) {
      if (this.rig) this.group.remove(this.rig.root);
      this.rig = createCharacter(characterIndex);
      this.rig.root.rotation.y = facing;
      this.group.add(this.rig.root);
      this.characterIndex = characterIndex;
    }
    if (nickname !== this.nickname || !this.label) {
      if (this.label) {
        this.group.remove(this.label);
        disposeSprite(this.label);
      }
      this.label = nameLabel(this.isMe ? `나 · ${nickname}` : nickname, this.isMe);
      this.label.position.y = this.rig.height + 0.3;
      this.group.add(this.label);
      this.nickname = nickname;
    }
    if (this.isMe && !this.ring) {
      this.ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.52, 32),
        new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: 0.8 }),
      );
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.02;
      this.group.add(this.ring);
    }
  }

  showLabel(v: boolean) {
    if (this.label) this.label.visible = v;
    if (this.ring) this.ring.visible = v;
  }

  get facing() {
    return this.rig.root;
  }

  idle(t: number) {
    this.rig.body.position.y = Math.sin(t * 2 + this.phase) * 0.012;
  }

  dispose() {
    if (this.label) disposeSprite(this.label);
  }
}

/**
 * 3D 라운지 화면 하나로 메인(입장) 화면과 대기실을 모두 그린다.
 * - preview: 라운지를 배경으로 내 캐릭터를 가까이서 돌려 보여 줌
 * - lobby: 카메라가 물러나 나를 따라가는 쿼터뷰
 * 캐릭터 이동과 위치 동기화는 M2에서 붙인다 (지금은 접속한 사람이 러그 둘레에 선다).
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
  private readonly others = new Map<string, Person>();
  private mode: Mode = 'preview';
  private running = true;
  private last = performance.now();
  private t = 0;
  private readonly reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private meId: string | null = null;

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

    this.me.set('', 0);
    this.me.group.position.set(1.4, 0, -2.2);
    this.scene.add(this.me.group);
    this.applyMode();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    document.addEventListener('visibilitychange', this.onVisibility);
    requestAnimationFrame(this.loop);
  }

  /** 입장 화면에서 고른 캐릭터·닉네임을 미리보기에 반영 */
  preview(nickname: string, characterIndex: number) {
    this.me.set(nickname || ' ', characterIndex);
    this.me.showLabel(this.mode === 'lobby');
  }

  /** 입장 완료: 카메라가 물러나며 대기실로 */
  enterLobby(me: PlayerView) {
    this.meId = me.playerId;
    this.me.set(me.nickname, me.characterIndex);
    this.mode = 'lobby';
    this.applyMode();
  }

  /** 서버가 보내 준 접속자 목록. 나는 목록 순서대로 자리 하나를 차지한다. */
  setPresence(players: PlayerView[]) {
    const seen = new Set<string>();
    players.forEach((p, i) => {
      const spot = this.spot(i);
      if (p.playerId === this.meId) {
        this.me.group.position.set(spot.x, 0, spot.z);
        this.me.facing.rotation.y = spot.face;
        return;
      }
      seen.add(p.playerId);
      let person = this.others.get(p.playerId);
      if (!person) {
        person = new Person(false);
        this.others.set(p.playerId, person);
        this.scene.add(person.group);
      }
      person.set(p.nickname, p.characterIndex);
      person.group.position.set(spot.x, 0, spot.z);
      person.facing.rotation.y = spot.face;
      person.group.visible = this.mode === 'lobby';
    });
    for (const [id, person] of this.others) {
      if (!seen.has(id)) {
        this.scene.remove(person.group);
        person.dispose();
        this.others.delete(id);
      }
    }
  }

  /**
   * 테이블 둘레 자리. 화면 기준(가로 sx, 앞뒤 sy) 좌표로 잡아서, 카메라에서 볼 때 이름표가 겹치지 않는 순서로 채운다.
   * 12명이 넘으면 바깥 원에 선다. M2부터는 각자 걸어다니므로 처음 들어올 때의 자리로만 쓴다.
   */
  private spot(i: number) {
    const SCREEN_SPOTS: [number, number][] = [
      [0, 1.8], [-1.9, 0.6], [1.9, 0.6], [-1.0, -1.3], [1.0, -1.3], [-1.3, 2.4],
      [1.3, 2.4], [-2.9, -0.6], [2.9, 0.4], [0, 3.4], [-2.6, 1.8], [2.6, 1.8],
    ];
    const cx = -0.4;
    const cz = -2.3;
    let sx: number;
    let sy: number;
    if (i < SCREEN_SPOTS.length) {
      [sx, sy] = SCREEN_SPOTS[i];
    } else {
      const a = ((i - SCREEN_SPOTS.length) / 10) * Math.PI * 2;
      sx = Math.cos(a) * 3.6;
      sy = 1.2 + Math.sin(a) * 2.4;
    }
    // 화면 오른쪽 = 월드 (1, 0, -1)/√2, 화면 아래(카메라 쪽) = 월드 (1, 0, 1)/√2
    const k = Math.SQRT1_2;
    const x = cx + (sx + sy) * k;
    const z = cz + (-sx + sy) * k;
    // SD 캐릭터는 얼굴이 보여야 하므로 카메라 쪽을 보되, 테이블 쪽으로 살짝 고개를 돌린다
    const toCamera = Math.atan2(this.camDir.x, this.camDir.z);
    const toTable = Math.atan2(cx - x, cz - z);
    const diff = Math.atan2(Math.sin(toTable - toCamera), Math.cos(toTable - toCamera));
    return { x, z, face: toCamera + diff * 0.25 };
  }

  private applyMode() {
    const lobby = this.mode === 'lobby';
    for (const p of this.others.values()) p.group.visible = lobby;
    for (const s of this.lounge.signs) s.visible = lobby;
    this.me.showLabel(lobby);
    this.zoomGoal = lobby ? 1.05 : 2.3;
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
    } else {
      this.camGoal.set(
        Math.max(-3.0, Math.min(2.6, mp.x - 0.5)),
        0.3,
        Math.max(-3.2, Math.min(1.6, mp.z - 0.3)),
      );
    }
    this.me.idle(this.t);
    for (const p of this.others.values()) p.idle(this.t);
    for (const b of this.lounge.booths) b.animate(this.t);

    const k = 1 - Math.exp(-dt * 4);
    this.camTarget.lerp(this.camGoal, k);
    this.zoom += (this.zoomGoal - this.zoom) * k;
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.camTarget).addScaledVector(this.camDir, 30);
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  };
}
