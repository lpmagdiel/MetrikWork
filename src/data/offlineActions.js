import { startOfflineQueueSync } from './offlineQueue.js';
import { executeAddTeamTask, executeUpdateTeamTask } from './tasks.js';
import { executeRegisterWorkday } from './works.js';

let started = false;

export function startOfflineActionsSync() {
    if (started) return;
    started = true;

    startOfflineQueueSync({
        registerWorkday: executeRegisterWorkday,
        addTeamTask: executeAddTeamTask,
        updateTeamTask: executeUpdateTeamTask
    });
}
