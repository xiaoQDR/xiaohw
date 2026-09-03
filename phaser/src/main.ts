import Phaser from 'phaser';
import './style.css';
import { ClassicScene } from './scenes/ClassicScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1080,
  height: 1920,
  backgroundColor: '#0c0d0f',
  render: { antialias: true, pixelArt: false },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [ClassicScene],
});
