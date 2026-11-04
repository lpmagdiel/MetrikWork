import { startOfflineQueueSync } from './offlineQueue.js';
import { executeAddTeamTask, executeUpdateTeamTask } from './tasks.js';
import { executeRegisterWorkday, executeUpdateWorkdayShiftVariation } from './works.js';

let started = false;

export function startOfflineActionsSync() {
    if (started) return;
    started = true;

    startOfflineQueueSync({
        registerWorkday: executeRegisterWorkday,
        updateWorkdayShiftVariation: executeUpdateWorkdayShiftVariation,
        addTeamTask: executeAddTeamTask,
        updateTeamTask: executeUpdateTeamTask
    });
}
