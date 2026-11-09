import { Client, type IMessage } from '@stomp/stompjs';

export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'rejected';

export interface Member { playerId: string; nickname: string; characterIndex: number; away: boolean }
export interface Presence { players: Member[]; hostId: string | null }
export interface Position { id: string; x: number; z: number; f: number; m: boolean }
export interface LobbyEvent { type: 'chat' | 'emote' | 'host'; playerId: string; text: string }
export interface BombMessage {
  type: 'start' | 'holder' | 'explode' | 'finish';
  order: string[] | null;
  holder: string | null;
  centerX: number | null;
  centerZ: number | null;
  auto: boolean | null;
  loser: string | null;
  heldMs: number | null;
}
export interface Best { playerId: string; nickname: string; characterIndex: number; score: number; extra: number | null }
/** 나에게만 오는 안내. type 'practice' 면 연습 기록 결과 */
export interface Notice {
  type: string;
  message?: string;
  gameType?: SkillType;
  score?: number;
  myBest?: Best | null;
  teamBest?: Best | null;
  newMyBest?: boolean;
  newTeamBest?: boolean;
}
export type SkillType = 'STOP' | 'TOWER';
export type GameType = 'BOMB' | 'BALLOON' | SkillType;
export interface SkillEntry { player: string; score: number | null; extra: number | null }
export interface SkillMessage {
  type: 'start' | 'progress' | 'result';
  gameType?: SkillType;
  startsInMs?: number;
  playMs?: number;
  players?: string[];
  lowerBetter?: boolean;
  done?: number;
  total?: number;
  ranking?: SkillEntry[];
}
export interface BalloonMessage {
  type: 'start' | 'turn' | 'pump' | 'pop';
  order?: string[];
  turn?: string;
  player?: string;
  count?: number;
  pumps?: number;
  auto?: boolean;
  limitMin?: number;
  limitMax?: number;
  centerX?: number;
  centerZ?: number;
  loser?: string;
  limit?: number;
}
export interface MatchMessage {
  type: 'vote' | 'voteResult' | 'cancel' | 'round' | 'roundEnd' | 'summary' | 'finish';
  endsInMs?: number;
  winnersTarget?: number;
  practice?: boolean;
  votes?: Record<GameType, number>;
  abstain?: number;
  won?: GameType;
  participants?: number;
  message?: string;
  round?: number;
  loser?: string;
  heldMs?: number;
  gameType?: GameType;
  pumpCount?: number;
  pumpLimit?: number;
  remaining?: number;
  more?: boolean;
  winners?: { playerId: string; round: number; heldMs: number }[];
}

export interface LoungeSocketHandlers {
  onPresence(p: Presence): void;
  onPositions(list: Position[]): void;
  onEvent(e: LobbyEvent): void;
  onBomb(m: BombMessage): void;
  onNotice(n: Notice): void;
  onMatch(m: MatchMessage): void;
  onBalloon(m: BalloonMessage): void;
  onSkill(m: SkillMessage): void;
  onState(state: ConnectionState): void;
}

export interface LoungeSocket {
  moveTo(x: number, z: number): void;
  steer(dx: number, dz: number): void;
  chat(text: string): void;
  emote(emoji: string): void;
  away(away: boolean): void;
  transferHost(playerId: string): void;
  startMatch(winnersTarget: number, practice: boolean): void;
  passBomb(): void;
  pump(n: number): void;
  skillScore(score: number, extra: number | null): void;
  practice(gameType: SkillType, score: number, extra: number | null): void;
  close(): void;
}

/**
 * 대기실 WebSocket(STOMP) 연결. 끊기면 2초 간격으로 자동 재접속한다.
 * 토큰이 거절되면 'rejected' 상태를 알리고 재접속을 멈춘다.
 */
export function connectLounge(slug: string, token: string, h: LoungeSocketHandlers): LoungeSocket {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  let everConnected = false;

  const client = new Client({
    brokerURL: `${scheme}://${location.host}/ws`,
    connectHeaders: { team: slug, token },
    reconnectDelay: 2000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
  });

  const json = <T>(fn: (body: T) => void) => (msg: IMessage) => fn(JSON.parse(msg.body) as T);

  client.onConnect = () => {
    everConnected = true;
    h.onState('online');
    client.subscribe(`/topic/t/${slug}/presence`, json<Presence>(h.onPresence));
    client.subscribe(`/topic/t/${slug}/lobby`, json<{ players: Position[] }>((b) => h.onPositions(b.players)));
    client.subscribe(`/topic/t/${slug}/events`, json<LobbyEvent>(h.onEvent));
    client.subscribe(`/topic/t/${slug}/bomb`, json<BombMessage>(h.onBomb));
    client.subscribe('/user/queue/me', json<Notice>(h.onNotice));
    client.subscribe(`/topic/t/${slug}/match`, json<MatchMessage>(h.onMatch));
    client.subscribe(`/topic/t/${slug}/balloon`, json<BalloonMessage>(h.onBalloon));
    client.subscribe(`/topic/t/${slug}/skill`, json<SkillMessage>(h.onSkill));
    client.publish({ destination: `/app/t/${slug}/presence/sync`, body: '' });
  };

  client.onStompError = (frame) => {
    if ((frame.headers['message'] ?? '').includes('입장 정보')) {
      h.onState('rejected');
      void client.deactivate();
    }
  };

  client.onWebSocketClose = () => {
    if (client.active) h.onState(everConnected ? 'reconnecting' : 'connecting');
  };

  const send = (path: string, body: unknown) => {
    if (client.connected) client.publish({ destination: `/app/t/${slug}/${path}`, body: JSON.stringify(body) });
  };

  h.onState('connecting');
  client.activate();

  return {
    moveTo: (x, z) => send('move', { tx: x, tz: z }),
    steer: (dx, dz) => send('move', { dx, dz }),
    chat: (text) => send('chat', { text }),
    emote: (emoji) => send('emote', { emoji }),
    away: (away) => send('away', { away }),
    transferHost: (playerId) => send('host/transfer', { playerId }),
    startMatch: (winnersTarget, practice) => send('match/start', { winnersTarget, practice }),
    passBomb: () => send('bomb/pass', {}),
    pump: (n) => send('balloon/pump', { pumps: n }),
    skillScore: (score, extra) => send('skill/score', { score, extra }),
    practice: (gameType, score, extra) => send('skill/practice', { gameType, score, extra }),
    close: () => void client.deactivate(),
  };
}
