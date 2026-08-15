import { proxyActivities, setHandler, condition, patched } from '@temporalio/workflow';
import {
    AccountSession,
    AccountActivities,
    FCMActivities,
    AccountWorkflowStatus,
    BalanceChangeEventPayload,
    fcmEventSignal,
    pauseSignal,
    resumeSignal,
    deleteSignal,
    lastHeartbeatQuery,
    workflowStatusQuery,
    KeyShare
} from '../../interfaces/temporal.interfaces';

// --- Proxy Activities ---
const { fetchAndSaveTransactions, dispatchWebhooks } = proxyActivities<AccountActivities>({
    startToCloseTimeout: '1 minute',
    retry: {
        initialInterval: '1s',
        backoffCoefficient: 2.0,
        maximumInterval: '60s',
        maximumAttempts: 5,
        nonRetryableErrorTypes: ['AccountNotFoundError', 'InvalidCredentialsError']
    }
});

const {
    startFCMListener,
    stopFCMListener,
    checkListenerHealth,
} = proxyActivities<FCMActivities>({
    startToCloseTimeout: '5 minutes',
    retry: {
        initialInterval: '1s',
        backoffCoefficient: 2.0,
        maximumInterval: '60s',
        maximumAttempts: 5,
        nonRetryableErrorTypes: ['AccountNotFoundError', 'InvalidCredentialsError']
    }
});


const ensureFCMListenerRunning = async (keyShare: KeyShare): Promise<'CONNECTED' | 'DISCONNECTED' | 'ERROR'> => {
    const health: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' = await checkListenerHealth(keyShare);
    console.log(`[Workflow] FCM listener health check for ${keyShare}: ${health}`);
    if (health === 'DISCONNECTED' || health === 'ERROR') {
        console.warn(`[Workflow] Listener health check failed (${health}). Restarting...`);
        await stopFCMListener(keyShare);
        await startFCMListener(keyShare);
    }
    return health;
}

/**
 * VPBank Account Workflow
 * Orchestrates FCM listener lifecycle and transaction processing for a single bank account
 * 
 * Lifecycle States:
 * - active: FCM listener active, processing events
 * - paused: FCM listener stopped, workflow waiting
 * - deleted: Cleanup and terminate
 */
export default async function VPBankAccountWorkflow(initialSession: AccountSession) {
    let session = initialSession;

    let status: AccountWorkflowStatus = 'active';
    let lastPollTime = 0;
    let eventProcessedCount = 0;

    const isRunning = () => status === 'active';
    const getStatus = (): AccountWorkflowStatus => status as AccountWorkflowStatus;
    let signalQueues: BalanceChangeEventPayload[] = [];
    const keyShare = session.keyShare;
    const reconciliationInterval = '2 minutes';
    console.log(`[Workflow] Workflow started for ${keyShare}`);
    try {
        await startFCMListener(keyShare);
    } catch (error) {
        // FCM is an acceleration signal, not a requirement for transaction sync.
        // Periodic reconciliation below keeps the account up to date when the
        // reverse-engineered FCM transport is unavailable.
        console.warn(`[Workflow] FCM listener failed for ${keyShare}; continuing with periodic sync`, error);
    }

    setHandler(fcmEventSignal, (payload: BalanceChangeEventPayload) => {
        console.log(`[Workflow] FCM event received for ${keyShare}`, payload);
        if (isRunning()) {
            signalQueues.push(payload);
        }
    });

    setHandler(deleteSignal, () => {
        console.log(`[Workflow] Delete signal received for ${keyShare}`);
        status = 'deleted';
    });

    setHandler(pauseSignal, () => {
        console.log(`[Workflow] Pause signal received for ${keyShare}`);
        status = 'paused';
        signalQueues.length = 0;
    });

    setHandler(resumeSignal, () => {
        console.log(`[Workflow] Resume signal received for ${keyShare}`);
        if (status !== 'deleted') status = 'active';
    });

    setHandler(lastHeartbeatQuery, () => lastPollTime);
    setHandler(workflowStatusQuery, () => getStatus());

    const syncTransactions = async (reason: 'startup' | 'fcm' | 'periodic') => {
        console.log(`[Workflow] Synchronizing transactions for ${keyShare}; reason=${reason}`);
        const result = await fetchAndSaveTransactions(session);
        console.log(
            `[Workflow] Sync completed for ${keyShare}; reason=${reason}, newTransactions=${result.newTransactions.length}, status=${result.status}`,
        );

        if (result.status === 'SUCCESS') {
            lastPollTime = Date.now();
            eventProcessedCount += result.newTransactions.length;
            if (result.newTransactions.length > 0) {
                await dispatchWebhooks(result.newTransactions, keyShare);
            }
        }
    };

    // Temporal patching keeps replay deterministic for workflows that were
    // already running before periodic reconciliation was introduced.
    const periodicReconciliationEnabled = patched('periodic-reconciliation-v1');

    if (periodicReconciliationEnabled) {
        // Catch up transactions that arrived while the worker was unavailable.
        await syncTransactions('startup');
    }

    while (getStatus() !== 'deleted') {
        const receivedSignal = periodicReconciliationEnabled
            ? await condition(
                () => (isRunning() && signalQueues.length > 0) || getStatus() === 'deleted',
                reconciliationInterval,
            )
            : await condition(() => (isRunning() && signalQueues.length > 0) || getStatus() === 'deleted');

        if (getStatus() === 'deleted') {
            break;
        }

        if (!isRunning()) {
            console.log(`[Workflow] Reconciliation skipped while paused for ${keyShare}`);
            continue;
        }

        const reason = receivedSignal && signalQueues.length > 0 ? 'fcm' : 'periodic';
        console.log(`[Workflow] Processing sync trigger for ${keyShare}; reason=${reason}, queuedSignals=${signalQueues.length}`);
        // Coalesce all queued FCM signals into one idempotent reconciliation.
        signalQueues.length = 0;
        await syncTransactions(reason);
    }

    console.log(`[Workflow] Stopping FCM listener for ${keyShare}`);
    await stopFCMListener(keyShare);
    console.log(`[Workflow] Workflow terminated for ${keyShare}`);
}
