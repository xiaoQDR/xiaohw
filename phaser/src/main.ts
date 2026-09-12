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
import { installExplorerWorkPatch } from './ui/explorerWorkPatch';
import { installDebugResourcePatch } from './ui/debugResourcePatch';
import { installTradingPostPatch } from './ui/tradingPostPatch';
import { installBuildingWorkerPatch } from './ui/buildingWorkerPatch';
import { installWorkerIdentityPatch } from './ui/workerIdentityPatch';
import { installWorkerMovementSpeedPatch } from './ui/workerMovementSpeedPatch';

installWorldExpansionPatch();
installJobAppearancePatch();
installJobPanelPatch();
installTrapSystemPatch();
installEventSystemPatch();
installOriginalBalancePatch();
installDynamicBuildCostPatch();
installTestTimeScalePatch();
installHunterWorkPatch();
installExplorerWorkPatch();
installDebugResourcePatch();
installTradingPostPatch();
installBuildingWorkerPatch();
installWorkerIdentityPatch();
installWorkerMovementSpeedPatch();

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
