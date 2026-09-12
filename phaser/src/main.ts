import Phaser from 'phaser';
import './style.css';
import { BuildScene } from './scenes/BuildScene';
import { ExpeditionScene } from './scenes/ExpeditionScene';
import { installWorldExpansionPatch } from './ui/worldExpansionPatch';
import { installExpeditionCampPatch } from './ui/expeditionCampPatch';
import { installInventoryPanelPatch } from './ui/inventoryPanelPatch';
import { installBuildMenuPatch } from './ui/buildMenuPatch';
import { installResponsiveChromePatch } from './ui/responsiveChromePatch';
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
import { installWorkshopPatch } from './ui/workshopPatch';
import { installWorkerIdentityPatch } from './ui/workerIdentityPatch';
import { installWorkerMovementSpeedPatch } from './ui/workerMovementSpeedPatch';
import { installBottomNavPatch } from './ui/bottomNavPatch';

installWorldExpansionPatch();
installExpeditionCampPatch();
installInventoryPanelPatch();
installBuildMenuPatch();
installResponsiveChromePatch();
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
installWorkshopPatch();
installWorkerIdentityPatch();
installWorkerMovementSpeedPatch();
installBottomNavPatch();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#a9c783',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  scene: [BuildScene, ExpeditionScene],
});
