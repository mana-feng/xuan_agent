/**
 * 额度管理服务。扣减和使用记录必须在同一事务中提交。
 */
const { getDatabase } = require('../db');
const ConfigService = require('../config-service');

async function getDefaultDailyCount(db) {
	const config = await ConfigService.getQuotaResetConfig(db);
	const target = Number(config?.target);
	return Number.isFinite(target) && target > 0 ? target : 2;
}

async function ensureQuota(db, userId) {
	let quota = await db.get('SELECT * FROM user_llm_quotas WHERE user_id = ?', [userId]);
	if (!quota) {
		const defaultCount = await getDefaultDailyCount(db);
		await db.run(
			`INSERT INTO user_llm_quotas
			(user_id, per_minute_limit, remaining_daily_count, remaining_token, updated_at, daily_limit)
			VALUES (?, 1, ?, 0, NOW(), ?)
			ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
			[userId, defaultCount, defaultCount]
		);
		quota = await db.get('SELECT * FROM user_llm_quotas WHERE user_id = ?', [userId]);
	}
	return quota;
}

function quotaResult(quota, allowed = Number(quota?.remaining_daily_count) > 0) {
	return {
		allowed,
		...(!allowed ? { reason: '剩余次数已用完' } : {}),
		usage: {
			remainingCount: Number(quota?.remaining_daily_count) || 0,
			remainingToken: Number(quota?.remaining_token) || 0,
		},
	};
}

// Read-only availability for the quota endpoint. Database errors fail closed.
async function checkLLMQuota(userId) {
	return quotaResult(await ensureQuota(getDatabase(), userId));
}

/**
 * Reserve one request under a MySQL row lock. The decrement remains uncommitted
 * during generation, so rollback (including connection loss) restores the slot.
 * Callers must commit only a completed visible answer, and rollback in finally.
 * A request occupies one pool connection until completion/timeout/disconnect.
 */
async function reserveLLMQuota(userId) {
	const db = getDatabase();
	await ensureQuota(db, userId);
	const connection = await db.pool.getConnection();
	try {
		await connection.beginTransaction();
		const [result] = await connection.execute(
			`UPDATE user_llm_quotas
			SET remaining_daily_count = remaining_daily_count - 1, updated_at = NOW()
			WHERE user_id = ? AND remaining_daily_count > 0`,
			[userId]
		);
		if (result.affectedRows !== 1) {
			const [rows] = await connection.execute('SELECT * FROM user_llm_quotas WHERE user_id = ?', [userId]);
			await connection.rollback();
			connection.release();
			return quotaResult(rows[0], false);
		}
	} catch (err) {
		try { await connection.rollback(); } finally { connection.release(); }
		throw err;
	}

	let settlement;
	return {
		allowed: true,
		commit(tokensUsed = 0) {
			if (!settlement) {
				settlement = (async () => {
					try {
						await connection.execute(
							'INSERT INTO llm_usage_records (user_id, tokens_used, created_at) VALUES (?, ?, NOW())',
							[userId, tokensUsed]
						);
						await connection.commit();
					} catch (err) {
						await connection.rollback();
						throw err;
					} finally {
						connection.release();
					}
				})();
			}
			return settlement;
		},
		async rollback() {
			if (!settlement) {
				settlement = (async () => {
					try { await connection.rollback(); } finally { connection.release(); }
				})();
			}
			// A failed commit already rolled back and must not obscure the original error.
			await settlement.catch(() => {});
		},
	};
}

module.exports = { checkLLMQuota, reserveLLMQuota };

