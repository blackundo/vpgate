import { Request, Response } from 'express';
import { getTemporalClient } from '../temporal/client';
import { vpbankService } from '../services/vpbank.service';
import { SessionRepository } from '../repositories/session.repository';
import { startWorkflowForSession } from '../services/workflow.service';
import { deleteSignal, pauseSignal, resumeSignal } from '../interfaces/temporal.interfaces';
import { AccountFCMService } from '../services/account-fcm.service';
import { FCMCredential } from '../models/fcm-credential.model';
import { WebhookRepository } from '../repositories/webhook.repository';
import { sequelize } from '../db/sequelize';

const sessionRepo = new SessionRepository();
const webhookRepo = new WebhookRepository();

const getHealthStatus = (session: any) => {
  if (session.status === 'paused') return 'paused';
  if (session.lastFcmErrorAt && (!session.lastFcmMessageAt || new Date(session.lastFcmErrorAt) > new Date(session.lastFcmMessageAt))) {
    return 'polling_fcm_error';
  }
  if ((session.consecutiveSyncFailures || 0) >= 3) return 'sync_error';
  if (!session.lastSyncSuccessAt) return 'initializing';
  return Date.now() - new Date(session.lastSyncSuccessAt).getTime() > 10 * 60 * 1000
    ? 'delayed'
    : 'healthy';
};

const healthFields = (session: any) => ({
  healthStatus: getHealthStatus(session),
  lastFcmConnectedAt: session.lastFcmConnectedAt,
  lastFcmMessageAt: session.lastFcmMessageAt,
  lastFcmErrorAt: session.lastFcmErrorAt,
  lastFcmError: session.lastFcmError,
  syncMode: session.lastFcmErrorAt && (!session.lastFcmMessageAt || new Date(session.lastFcmErrorAt) > new Date(session.lastFcmMessageAt))
    ? 'polling'
    : 'realtime',
  lastSyncAttemptAt: session.lastSyncAttemptAt,
  lastSyncSuccessAt: session.lastSyncSuccessAt,
  lastSyncError: session.lastSyncError,
  consecutiveSyncFailures: session.consecutiveSyncFailures || 0,
});

export const listWorkflows = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    const sessions = await vpbankService.getSessions(req.user.id);
    const { status } = req.query;

    let filtered = sessions;
    if (status) {
      filtered = sessions.filter(s => s.status === status as string);
    }

    const results = filtered.map(s => ({
      workflowId: `vpbank-account-${s.keyShare.replace(/[^a-z0-9]/gi, '-')}`,
      runId: s.runId,
      status: s.status,
      startTime: new Date(Number(s.createdAt) || Date.now()).toISOString(),
      executionTime: undefined,
      accountNumber: s.accountNumber,
      name: s.name,
      keyShare: s.keyShare,
      lastListenerActivity: s.lastListenerActivity,
      ...healthFields(s)
    }));

    return res.json({ workflows: results });
  } catch (error) {
    console.error('[WorkflowAPI] List error:', error);
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const getWorkflowDetails = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    const userId = req.user.id;
    const { workflowId } = req.params;

    const sessions = await vpbankService.getSessions(userId);
    const session = sessions.find(s => `vpbank-account-${s.keyShare.replace(/[^a-z0-9]/gi, '-')}` === workflowId);

    if (session) {
      return res.json({
        id: session.id,
        workflowId,
        runId: session.runId,
        status: session.status,
        executionStatus: undefined,
        startTime: new Date(Number(session.createdAt)).toISOString(),
        accountNumber: session.accountNumber,
        name: session.name,
        keyShare: session.keyShare,
        lastListenerActivity: session.lastListenerActivity,
        ...healthFields(session)
      });
    }

    return res.status(404).json({ error: 'Workflow/Session not found' });
  } catch (error) {
    console.error(`[WorkflowAPI] Get details error for ${req.params.workflowId}:`, error);
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const pauseWorkflow = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    const { workflowId } = req.params;
    console.log(`[WorkflowAPI] Request to pause workflow ${workflowId}`);

    const sessions = await vpbankService.getSessions(req.user.id);
    const session = sessions.find(s => `vpbank-account-${s.keyShare.replace(/[^a-z0-9]/gi, '-')}` === workflowId);

    if (!session) {
      return res.status(404).json({ error: 'Workflow/Account not found' });
    }

    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    await handle.signal(pauseSignal);

    // Persist the state only after Temporal accepted the signal. This prevents
    // the database from claiming the account is paused while its workflow is active.
    await sessionRepo.update(session.keyShare, {
      status: 'paused'
    }, { userId: req.user.id });
    console.log(`[WorkflowAPI] Sent pause signal to ${workflowId}`);

    return res.json({
      success: true,
      message: 'Workflow paused',
      status: 'paused'
    });
  } catch (error) {
    console.error(`[WorkflowAPI] Pause error for ${req.params.workflowId}:`, error);
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const resumeWorkflow = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    const { workflowId } = req.params;
    console.log(`[WorkflowAPI] Request to resume workflow ${workflowId}`);

    const sessions = await vpbankService.getSessions(req.user.id);
    const session = sessions.find(s => `vpbank-account-${s.keyShare.replace(/[^a-z0-9]/gi, '-')}` === workflowId);

    if (!session) {
      return res.status(404).json({ error: 'Account not found' });
    }
    try {

      const sessionForWorkflow = {
        keyShare: session.keyShare,
        pinShare: session.pinShare,
        jwt: session.jwt || '',
        accountNumber: session.accountNumber || '',
        name: session.name || '',
        fcmToken: '',
      };

      let runId: string;
      try {
        const client = await getTemporalClient();
        const handle = client.workflow.getHandle(workflowId);
        await handle.signal(resumeSignal);
        const description = await handle.describe();
        runId = description.runId;
        console.log(`[WorkflowAPI] Sent resume signal to ${workflowId}`);
      } catch (error: any) {
        const workflowNotFound = error?.name === 'WorkflowNotFoundError'
          || error?.message?.toLowerCase().includes('not found')
          || error?.message?.toLowerCase().includes('already completed');
        if (!workflowNotFound) throw error;

        runId = await startWorkflowForSession(sessionForWorkflow);
        console.log(`[WorkflowAPI] Started replacement workflow ${workflowId}`);
      }

      await sessionRepo.update(session.keyShare, {
        status: 'active',
        runId: runId
      }, { userId: req.user.id });

      return res.json({
        success: true,
        message: 'Workflow resumed (restarted)',
        status: 'active'
      });
    } catch (e: any) {
      throw e;
    }
  } catch (error) {
    console.error(`[WorkflowAPI] Resume error for ${req.params.workflowId}:`, error);
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const stopWorkflow = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    const { workflowId } = req.params;

    const sessions = await vpbankService.getSessions(req.user.id);
    const session = sessions.find(s => `vpbank-account-${s.keyShare.replace(/[^a-z0-9]/gi, '-')}` === workflowId);
    if (!session) {
      return res.status(404).json({ error: 'Workflow/Session not found or access denied' });
    }

    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    await handle.signal(pauseSignal);
    await sessionRepo.update(session.keyShare, { status: 'paused' }, { userId: req.user.id });

    return res.json({ success: true, message: 'Workflow paused', status: 'paused' });
  } catch (error) {
    console.error(`[WorkflowAPI] Stop error for ${req.params.workflowId}:`, error);
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const getWorkflowHistory = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    const { workflowId } = req.params;
    const { limit = '50' } = req.query;

    const sessions = await vpbankService.getSessions(req.user.id);
    const session = sessions.find(s => `vpbank-account-${s.keyShare.replace(/[^a-z0-9]/gi, '-')}` === workflowId);
    if (!session) {
      return res.status(404).json({ error: 'Workflow/Session not found or access denied' });
    }

    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();

    return res.json({
      workflowId,
      historyLength: description.historyLength,
      historyEvents: description.historyLength
    });
  } catch (error) {
    console.error(`[WorkflowAPI] History error for ${req.params.workflowId}:`, error);
    return res.status(500).json({ error: (error as Error).message });
  }
};

export const updateCredentials = async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    const userId = req.user.id;
    const { workflowId } = req.params;
    const { keyShare, pinShare } = req.body;

    if (!keyShare || !pinShare) {
      return res.status(400).json({ error: 'Missing keyShare or pinShare' });
    }

    const sessions = await vpbankService.getSessions(userId);
    const session = sessions.find(s => `vpbank-account-${s.keyShare.replace(/[^a-z0-9]/gi, '-')}` === workflowId);
    if (!session) {
      return res.status(404).json({ error: 'Workflow/Session not found or access denied' });
    }

    const conflictingSession = await sessionRepo.findByKeyShare(keyShare);
    if (conflictingSession && conflictingSession.id !== session.id) {
      return res.status(409).json({ error: 'Key Share is already used by another account' });
    }

    // Validate before mutating the existing account. A new key gets a fresh FCM
    // registration, which also replaces stale encryption material.
    const fcm = new AccountFCMService(keyShare);
    const credentials = await fcm.getCredentials();
    const validation = await vpbankService.validateShare(keyShare, pinShare, credentials.fcm.token);
    if (validation.status !== '1' || !validation.jwt) {
      return res.status(400).json({ error: 'VPBank rejected the new Key Share or PIN Share' });
    }

    const client = await getTemporalClient();
    try {
      const handle = client.workflow.getHandle(workflowId);
      await handle.signal(deleteSignal);
      await Promise.race([
        handle.result().catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, 15_000)),
      ]);
    } catch (error: any) {
      const notFound = error?.name === 'WorkflowNotFoundError' || error?.message?.toLowerCase().includes('not found');
      if (!notFound) throw error;
    }

    const oldKeyShare = session.keyShare;
    await sequelize.transaction(async transaction => {
      const webhooks = await webhookRepo.findAll(session.id, { transaction });
      for (const webhook of webhooks) {
        await webhookRepo.update({
          config: { ...(webhook.config || {}), filterAccount: [keyShare] },
        }, { where: { id: webhook.id }, transaction });
      }

      await sessionRepo.update(oldKeyShare, {
        keyShare,
        pinShare,
        jwt: validation.jwt,
        status: 'active',
        runId: null,
        lastFcmConnectedAt: null,
        lastFcmMessageAt: null,
        lastFcmErrorAt: null,
        lastFcmError: null,
        lastSyncAttemptAt: null,
        lastSyncSuccessAt: null,
        lastSyncError: null,
        consecutiveSyncFailures: 0,
      }, { userId, transaction });
    });

    if (oldKeyShare !== keyShare) {
      await FCMCredential.destroy({ where: { keyShare: oldKeyShare } });
    }

    const runId = await startWorkflowForSession({
      keyShare,
      pinShare,
      jwt: validation.jwt,
      accountNumber: session.accountNumber || '',
      name: session.name || '',
      fcmToken: credentials.fcm.token,
    });
    await sessionRepo.updateRunId(keyShare, runId, { userId });

    return res.json({
      success: true,
      message: 'Credentials updated and listener restarted',
      workflowId: `vpbank-account-${keyShare.replace(/[^a-z0-9]/gi, '-')}`,
      runId,
    });
  } catch (error) {
    console.error(`[WorkflowAPI] Update Creds error for ${req.params.workflowId}:`, error);
    return res.status(500).json({ error: (error as Error).message });
  }
};
