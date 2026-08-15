'use strict';

module.exports = {
	async up(queryInterface) {
		const sequelize = queryInterface.sequelize;
		await sequelize.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_fcm_connected_at TIMESTAMPTZ');
		await sequelize.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_fcm_message_at TIMESTAMPTZ');
		await sequelize.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_fcm_error_at TIMESTAMPTZ');
		await sequelize.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_fcm_error TEXT');
		await sequelize.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_sync_attempt_at TIMESTAMPTZ');
		await sequelize.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_sync_success_at TIMESTAMPTZ');
		await sequelize.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_sync_error TEXT');
		await sequelize.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS consecutive_sync_failures INTEGER NOT NULL DEFAULT 0');
	},

	async down(queryInterface) {
		const sequelize = queryInterface.sequelize;
		await sequelize.query('ALTER TABLE sessions DROP COLUMN IF EXISTS consecutive_sync_failures');
		await sequelize.query('ALTER TABLE sessions DROP COLUMN IF EXISTS last_sync_error');
		await sequelize.query('ALTER TABLE sessions DROP COLUMN IF EXISTS last_sync_success_at');
		await sequelize.query('ALTER TABLE sessions DROP COLUMN IF EXISTS last_sync_attempt_at');
		await sequelize.query('ALTER TABLE sessions DROP COLUMN IF EXISTS last_fcm_message_at');
		await sequelize.query('ALTER TABLE sessions DROP COLUMN IF EXISTS last_fcm_error');
		await sequelize.query('ALTER TABLE sessions DROP COLUMN IF EXISTS last_fcm_error_at');
		await sequelize.query('ALTER TABLE sessions DROP COLUMN IF EXISTS last_fcm_connected_at');
	},
};
