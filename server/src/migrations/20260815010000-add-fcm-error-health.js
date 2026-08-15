'use strict';

module.exports = {
	async up(queryInterface) {
		await queryInterface.sequelize.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_fcm_error_at TIMESTAMPTZ');
		await queryInterface.sequelize.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_fcm_error TEXT');
	},

	async down(queryInterface) {
		await queryInterface.sequelize.query('ALTER TABLE sessions DROP COLUMN IF EXISTS last_fcm_error');
		await queryInterface.sequelize.query('ALTER TABLE sessions DROP COLUMN IF EXISTS last_fcm_error_at');
	},
};
