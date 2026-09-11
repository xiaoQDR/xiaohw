import Phaser from 'phaser';
import './style.css';
import { BuildScene } from './scenes/BuildScene';
import { installJobPanelPatch } from './ui/jobPanelPatch';
import { installTrapSystemPatch } from './ui/trapSystemPatch';
import { installEventSystemPatch } from './ui/eventSystemPatch';
import { installOriginalBalancePatch } from './ui/originalBalancePatch';
import { installDynamicBuildCostPatch } from './ui/dynamicBuildCostPatch';
import { installTestTimeScalePatch } from './ui/testTimeScalePatch';

installJobPanelPatch();
installTrapSystemPatch();
installEventSystemPatch();
installOriginalBalancePatch();
installDynamicBuildCostPatch();
installTestTimeScalePatch();

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
