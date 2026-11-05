import Phaser from 'phaser';
import type { PlayerView } from '../api';
import { CHARACTER_COUNT } from '../characters';
import type { ConnectionState } from '../net/loungeSocket';

export const WIDTH = 720;
export const HEIGHT = 1280;

export interface LobbyData {
  teamName: string;
  me: PlayerView;
  characterImages: HTMLImageElement[];
}

const COLORS = {
  floor: 0xe9e4dc,
  floorLine: 0xdcd5ca,
  wall: 0x2b3442,
  wallText: '#ffffff',
  sofa: 0x5a6f8f,
  sofaShade: 0x4a5d7a,
  plant: 0x4f9a68,
  pot: 0xb7774e,
  rug: 0xd8cdbd,
  boothBomb: 0xff6a3d,
  boothBalloon: 0x2f6bff,
  ink: '#18202b',
  muted: '#5d6877',
  me: 0xff6a3d,
};

const FONT = "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

/**
 * M1 대기실: 사무실 라운지 배경 위에 지금 접속한 사람들이 서 있는 화면.
 * 캐릭터 이동(탭·조이스틱)과 위치 동기화는 M2에서 붙인다.
 */
export class LobbyScene extends Phaser.Scene {
  private lobby!: LobbyData;
  private people = new Map<string, Phaser.GameObjects.Container>();
  private countText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor(lobby: LobbyData, private readonly onReady: (scene: LobbyScene) => void) {
    super('lobby');
    this.lobby = lobby;
  }

  create() {
    for (let i = 0; i < CHARACTER_COUNT; i++) {
      if (!this.textures.exists(`char${i}`)) this.textures.addImage(`char${i}`, this.lobby.characterImages[i]);
    }
    this.drawRoom();
    this.onReady(this);
  }

  private drawRoom() {
    const g = this.add.graphics();
    // 바닥 타일
    g.fillStyle(COLORS.floor).fillRect(0, 0, WIDTH, HEIGHT);
    g.lineStyle(2, COLORS.floorLine);
    for (let x = 0; x <= WIDTH; x += 80) g.lineBetween(x, 160, x, HEIGHT);
    for (let y = 160; y <= HEIGHT; y += 80) g.lineBetween(0, y, WIDTH, y);

    // 위쪽 벽과 이름
    g.fillStyle(COLORS.wall).fillRect(0, 0, WIDTH, 160);
    this.add.text(36, 44, '운빨 라운지', { fontFamily: FONT, fontSize: '22px', color: '#ff9b78', fontStyle: 'bold' });
    this.add.text(36, 76, this.lobby.teamName, { fontFamily: FONT, fontSize: '40px', color: COLORS.wallText, fontStyle: 'bold' });
    this.countText = this.add.text(WIDTH - 36, 60, '', { fontFamily: FONT, fontSize: '26px', color: COLORS.wallText }).setOrigin(1, 0);
    this.statusText = this.add.text(WIDTH - 36, 100, '', { fontFamily: FONT, fontSize: '22px', color: '#c7cfdb' }).setOrigin(1, 0);

    // 러그와 소파
    g.fillStyle(COLORS.rug).fillRoundedRect(110, 330, 500, 380, 40);
    g.fillStyle(COLORS.sofaShade).fillRoundedRect(150, 210, 420, 90, 26);
    g.fillStyle(COLORS.sofa).fillRoundedRect(150, 230, 420, 70, 22);
    // 화분
    for (const [x, y] of [[60, 220], [660, 220], [60, 760], [660, 760]] as const) {
      g.fillStyle(COLORS.pot).fillRoundedRect(x - 22, y + 8, 44, 40, 8);
      g.fillStyle(COLORS.plant).fillCircle(x, y, 32);
    }

    // 게임 부스 두 개 (M3, M5에서 열림)
    this.booth(40, 900, COLORS.boothBomb, '시한폭탄 부스');
    this.booth(380, 900, COLORS.boothBalloon, '풍선 부스');
  }

  private booth(x: number, y: number, color: number, name: string) {
    const w = 300;
    const h = 300;
    const g = this.add.graphics();
    g.fillStyle(color, 0.12).fillRoundedRect(x, y, w, h, 28);
    g.lineStyle(4, color, 0.6).strokeRoundedRect(x, y, w, h, 28);
    this.add.text(x + w / 2, y + 40, name, { fontFamily: FONT, fontSize: '28px', color: Phaser.Display.Color.IntegerToColor(color).rgba, fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(x + w / 2, y + h / 2 + 20, '준비 중', { fontFamily: FONT, fontSize: '24px', color: COLORS.muted }).setOrigin(0.5);
  }

  setPresence(players: PlayerView[]) {
    this.countText.setText(`접속 ${players.length}명`);
    const ids = new Set(players.map((p) => p.playerId));
    for (const [id, obj] of this.people) {
      if (!ids.has(id)) {
        obj.destroy();
        this.people.delete(id);
      }
    }
    players.forEach((p, i) => {
      const { x, y } = this.slot(i, players.length);
      let person = this.people.get(p.playerId);
      if (!person) {
        person = this.makePerson(p);
        person.setPosition(x, y + 30).setAlpha(0);
        this.people.set(p.playerId, person);
      }
      this.tweens.add({ targets: person, x, y, alpha: 1, duration: 350, ease: 'Cubic.out' });
    });
  }

  setConnection(state: ConnectionState) {
    const label: Record<ConnectionState, string> = {
      connecting: '연결 중…',
      online: '',
      reconnecting: '다시 연결하는 중…',
      rejected: '다시 입장해 주세요',
    };
    this.statusText.setText(label[state]);
  }

  /** 러그 위에 최대 4명씩 줄 세우기 */
  private slot(i: number, n: number) {
    const perRow = Math.min(4, Math.max(1, n));
    const row = Math.floor(i / 4);
    const inRow = Math.min(perRow, n - row * 4);
    const col = i % 4;
    const gap = 120;
    const x = WIDTH / 2 + (col - (inRow - 1) / 2) * gap;
    const y = 470 + row * 190;
    return { x, y };
  }

  private makePerson(p: PlayerView) {
    const isMe = p.playerId === this.lobby.me.playerId;
    const c = this.add.container(0, 0);
    if (isMe) {
      const ring = this.add.ellipse(0, 78, 96, 26, COLORS.me, 0.35);
      c.add(ring);
    }
    const body = this.add.image(0, 0, `char${p.characterIndex % CHARACTER_COUNT}`).setScale(0.9);
    const label = this.add.text(0, 96, isMe ? `나 · ${p.nickname}` : p.nickname, {
      fontFamily: FONT, fontSize: '24px', color: COLORS.ink, fontStyle: isMe ? 'bold' : 'normal',
      backgroundColor: '#ffffffcc', padding: { x: 10, y: 4 },
    }).setOrigin(0.5, 0);
    c.add([body, label]);
    return c;
  }
}
