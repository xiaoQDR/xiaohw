import Phaser from 'phaser';
import './style.css';
import { BuildScene } from './scenes/BuildScene';
import { installWorldExpansionPatch } from './ui/worldExpansionPatch';
import { installJobAppearancePatch } from './ui/jobAppearancePatch';
import { installJobPanelPatch } from './ui/jobPanelPatch';
import { installTrapSystemPatch } from './ui/trapSystemPatch';
import { installEventSystemPatch } from './ui/eventSystemPatch';
import { installOriginalBalancePatch } from './ui/originalBalancePatch';
import { installDynamicBuildCostPatch } from './ui/dynamicBuildCostPatch';
import { installTestTimeScalePatch } from './ui/testTimeScalePatch';
import { installHunterWorkPatch } from './ui/hunterWorkPatch';
import { installDebugResourcePatch } from './ui/debugResourcePatch';
import { installTradingPostPatch } from './ui/tradingPostPatch';
import { installBuildingWorkerPatch } from './ui/buildingWorkerPatch';
import { installWorkerIdentityPatch } from './ui/workerIdentityPatch';

installWorldExpansionPatch();
installJobAppearancePatch();
installJobPanelPatch();
installTrapSystemPatch();
installEventSystemPatch();
installOriginalBalancePatch();
installDynamicBuildCostPatch();
installTestTimeScalePatch();
installHunterWorkPatch();
installDebugResourcePatch();
installTradingPostPatch();
installBuildingWorkerPatch();
installWorkerIdentityPatch();

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
