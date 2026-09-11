import Phaser from 'phaser';
import './style.css';
import { BuildScene } from './scenes/BuildScene';
import { installJobPanelPatch } from './ui/jobPanelPatch';
import { installTrapSystemPatch } from './ui/trapSystemPatch';
import { installEventSystemPatch } from './ui/eventSystemPatch';

installJobPanelPatch();
installTrapSystemPatch();
installEventSystemPatch();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#a9c783',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [BuildScene],
});
