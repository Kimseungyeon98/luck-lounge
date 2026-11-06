import { Client, type IMessage } from '@stomp/stompjs';
import type { PlayerView } from '../api';

export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'rejected';

export interface LoungeSocketHandlers {
  onPresence(players: PlayerView[]): void;
  onState(state: ConnectionState): void;
}

/**
 * 대기실 WebSocket(STOMP) 연결. 끊기면 2초 간격으로 자동 재접속한다.
 * 토큰이 거절되면 'rejected' 상태를 알리고 재접속을 멈춘다.
 */
export function connectLounge(slug: string, token: string, handlers: LoungeSocketHandlers): () => void {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  let everConnected = false;

  const client = new Client({
    brokerURL: `${scheme}://${location.host}/ws`,
    connectHeaders: { team: slug, token },
    reconnectDelay: 2000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
  });

  client.onConnect = () => {
    everConnected = true;
    handlers.onState('online');
    client.subscribe(`/topic/t/${slug}/presence`, (msg: IMessage) => {
      const body = JSON.parse(msg.body) as { players: PlayerView[] };
      handlers.onPresence(body.players);
    });
    client.publish({ destination: `/app/t/${slug}/presence/sync`, body: '' });
  };

  client.onStompError = (frame) => {
    const message = frame.headers['message'] ?? '';
    if (message.includes('입장 정보')) {
      handlers.onState('rejected');
      void client.deactivate();
    }
  };

  client.onWebSocketClose = () => {
    if (client.active) handlers.onState(everConnected ? 'reconnecting' : 'connecting');
  };

  handlers.onState('connecting');
  client.activate();
  return () => void client.deactivate();
}
