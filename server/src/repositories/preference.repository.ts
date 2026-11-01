import { Preference } from '../models/preference.model';
import { Transaction } from 'sequelize';
import { Op } from 'sequelize';

const USER_KEY_PREFIX = 'user:';

export class PreferenceRepository {
  async get(sessionId: string | null, key: string, options?: { transaction?: Transaction }): Promise<any> {
    const pref = await Preference.findOne({
      where: { sessionId, key },
      transaction: options?.transaction
    });
    return pref ? pref.value : null;
  }

  async set(sessionId: string | null, key: string, value: any, options?: { transaction?: Transaction }): Promise<void> {
    // PostgreSQL treats NULL values as distinct in unique indexes, so upsert
    // cannot detect a conflict for user-scoped preferences (session_id=NULL).
    if (sessionId === null) {
      const existing = await Preference.findOne({ where: { sessionId: null, key }, transaction: options?.transaction });
      if (existing) {
        await existing.update({ value }, { transaction: options?.transaction });
      } else {
        await Preference.create({ sessionId: null, key, value }, { transaction: options?.transaction });
      }
      return;
    }
    await Preference.upsert({
      sessionId,
      key,
      value
    }, { transaction: options?.transaction });
  }

  async getAll(sessionId: string | null, options?: { transaction?: Transaction }): Promise<Record<string, any>> {
    const prefs = await Preference.findAll({
      where: { sessionId },
      transaction: options?.transaction
    });
    const result: Record<string, any> = {};
    for (const p of prefs) {
      result[p.key] = p.value;
    }
    return result;
  }

  /** Get all preferences for a user (keys stored with prefix user:userId:). */
  async getAllByUserId(userId: string, options?: { transaction?: Transaction }): Promise<Record<string, any>> {
    const prefix = `${USER_KEY_PREFIX}${userId}:`;
    const prefs = await Preference.findAll({
      where: {
        sessionId: null,
        key: { [Op.like]: `${prefix}%` }
      },
      transaction: options?.transaction
    });
    const result: Record<string, any> = {};
    for (const p of prefs) {
      const shortKey = p.key.startsWith(prefix) ? p.key.slice(prefix.length) : p.key;
      result[shortKey] = p.value;
    }
    return result;
  }
}
