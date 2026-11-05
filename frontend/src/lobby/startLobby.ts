import Phaser from 'phaser';
import type { Joined, Team } from '../api';
import { loadCharacterImages } from '../characters';
import { connectLounge } from '../net/loungeSocket';
import { clearToken } from '../storage';
import { HEIGHT, LobbyScene, WIDTH } from './LobbyScene';

export async function startLobby(container: HTMLElement, team: Team, me: Joined) {
  const characterImages = await loadCharacterImages(2);
  container.hidden = false;

  const scene = new LobbyScene({ teamName: team.name, me, characterImages }, (ready) => {
    connectLounge(team.slug, me.token, {
      onPresence: (players) => ready.setPresence(players),
      onState: (state) => {
        ready.setConnection(state);
        if (state === 'rejected') {
          clearToken(team.slug);
          setTimeout(() => location.reload(), 1500);
        }
      },
    });
  });

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: '#e9e4dc',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: WIDTH, height: HEIGHT },
    scene: [scene],
  });
}
