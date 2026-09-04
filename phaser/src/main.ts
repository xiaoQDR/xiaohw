import Phaser from 'phaser';
import './style.css';
import { GameScene } from './scenes/GameScene';
import { installLegacyScenePatch } from './ui/legacyScenePatch';

installLegacyScenePatch();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#ffffff',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [GameScene],
});
