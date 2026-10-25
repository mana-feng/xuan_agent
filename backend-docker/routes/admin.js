/**
 * 管理员路由
 * 注意：所有管理员操作都是敏感操作，建议添加API签名验证
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../db');
const ConfigService = require('../config-service');
const { adminMiddleware } = require('../middleware/auth');
const { reloadEmailConfig } = require('../services/email');
const { reloadScheduler } = require('../services/scheduler');
const SecurityUtils = require('../security');
const { apiSignatureMiddleware } = require('../middleware/api-signature');

const db = getDatabase();
const ADMIN_RECORD_TYPE_TABLE_MAP = Object.freeze({
	bazi: 'bazi_records',
	liuyao: 'liuyao_records',
	ziwei: 'ziwei_records',
	qimen: 'qimen_records',
});
const ADMIN_RECORD_TYPES = Object.keys(ADMIN_RECORD_TYPE_TABLE_MAP);

function resolveLLMScope(req) {
	const queryScope = req.query && req.query.scope;
	const bodyScope = req.body && req.body.scope;
	const scopes = [queryScope, bodyScope].filter(value => value !== undefined);
	if (scopes.some(value => value !== 'chat' && value !== 'agent')) return null;
	if (queryScope !== undefined && bodyScope !== undefined && queryScope !== bodyScope) return null;
	return scopes[0] || 'chat';
}

function normalizeAdminRecordType(inputType, { allowAll = false, defaultType = 'bazi' } = {}) {
	const normalized = String(inputType || '').trim().toLowerCase();
	if (allowAll && normalized === 'all') {
		return 'all';
	}
	if (Object.prototype.hasOwnProperty.call(ADMIN_RECORD_TYPE_TABLE_MAP, normalized)) {
		return normalized;
	}
	return defaultType;
}

function buildAdminRecordSelectQuery(tableName, chartType, whereClause = '') {
	return `
		SELECT 
			r.id, 
			r.name, 
			r.gender, 
			r.birth_datetime AS birthDatetime, 
			r.calendar_type AS calendarType,
			r.created_at AS createdAt,
			u.id AS userId,
			u.email AS userEmail,
			u.username AS userUsername,
			'${chartType}' AS chartType
		FROM ${tableName} r
		LEFT JOIN users u ON r.user_id = u.id
		${whereClause}
	`;
}

function parseAdminRawPayload(rawPayload) {
	if (!rawPayload) {
		return null;
	}
	try {
		return typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
	} catch (e) {
		console.error('Admin route error');
		return rawPayload;
	}
}

/**
 * 公告管理
 */
router.get('/announcements', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	try {
		const rows = await db.all(
			'SELECT id, title, content, expires_at AS expiresAt, updated_at AS updatedAt, created_at AS createdAt FROM announcements ORDER BY updated_at DESC'
		);
		res.json(rows || []);
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '获取公告列表失败' });
	}
});

router.post('/announcements', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const { title, content, expiresAt } = req.body || {};
	if (!title || !content) {
		return res.status(400).json({ error: '请求失败' });
	}
	try {
		const result = await db.run(
			'INSERT INTO announcements (title, content, expires_at, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
			[title, content, expiresAt || null]
		);
		res.json({ success: true, id: result.lastID });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '创建公告失败' });
	}
});

router.put('/announcements/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (!id) {
		return res.status(400).json({ error: '无效的公告ID' });
	}
	const { title, content, expiresAt } = req.body || {};
	if (!title || !content) {
		return res.status(400).json({ error: '请求失败' });
	}
	try {
		await db.run(
			'UPDATE announcements SET title = ?, content = ?, expires_at = ?, updated_at = NOW() WHERE id = ?',
			[title, content, expiresAt || null, id]
		);
		res.json({ success: true });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '更新公告失败' });
	}
});

router.delete('/announcements/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (!id) {
		return res.status(400).json({ error: '无效的公告ID' });
	}
	try {
		await db.run('DELETE FROM announcements WHERE id = ?', [id]);
		res.json({ success: true });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '删除公告失败' });
	}
});

/**
 * 获取邮箱配置
 */
router.get('/email-config', adminMiddleware, async (req, res) => {
	try {
		const cfg = await ConfigService.getEmailConfig(db);
		const configured = await ConfigService.isEmailConfigValid(db);
		res.json({
			configured,
			host: cfg.host || '',
			port: cfg.port || 0,
			user: cfg.user || '',
			from: cfg.from || '',
			fromName: cfg.fromName || '',
		});
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '获取邮件配置失败' });
	}
});

/**
 * 更新邮箱配置
 */
router.put('/email-config', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const { host, port, user, pass, from, fromName } = req.body || {};

	try {
		// 清理和验证输入
		const sanitizedHost = SecurityUtils.sanitizeString(String(host || ''), {
			maxLength: 200,
		}).trim();
		const sanitizedUser = SecurityUtils.sanitizeString(String(user || ''), {
			maxLength: 200,
		}).trim();
		const sanitizedFrom = SecurityUtils.sanitizeString(String(from || ''), {
			maxLength: 200,
		}).trim();
		const sanitizedFromName = fromName
			? SecurityUtils.sanitizeString(String(fromName), {
					maxLength: 200,
					allowSpecialChars: true,
				}).trim()
			: '';
		const portNum = Number(port);

		// 验证必填项
		if (!sanitizedHost) {
			return res.status(400).json({ error: 'SMTP 服务器地址不能为空' });
		}
		if (!sanitizedUser) {
			return res.status(400).json({ error: '邮箱账号不能为空' });
		}
		if (Number.isNaN(portNum) || portNum <= 0 || portNum > 65535) {
			return res.status(400).json({ error: '请求失败' });
		}
		if (!sanitizedFrom || !SecurityUtils.isValidEmail(sanitizedFrom)) {
			return res.status(400).json({ error: '发件人邮箱格式不正确' });
		}

		// 密码处理：如果提供则更新，否则检查是否已有密码
		let finalPass = null;
		if (pass && String(pass).trim()) {
			finalPass = String(pass).trim();
		} else {
			const existingPass = await ConfigService.getConfig(db, 'EMAIL_PASS');
			if (!existingPass) {
				return res.status(400).json({ error: '请求失败' });
			}
			finalPass = existingPass;
		}

		// 使用新的批量设置方法
		await ConfigService.setEmailConfig(db, {
			host: sanitizedHost,
			port: portNum,
			user: sanitizedUser,
			pass: finalPass,
			from: sanitizedFrom,
			fromName: sanitizedFromName,
		});

		// 重新加载配置
		await reloadEmailConfig();

		res.json({ success: true, message: '操作成功' });
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '更新邮件配置失败' });
	}
});

/**
 * 获取邮箱配置历史
 */
router.get('/email-configs', adminMiddleware, async (req, res) => {
	try {
		const list = await ConfigService.getEmailConfigs(db);
		res.json({ success: true, data: list });
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '获取邮箱配置历史失败' });
	}
});

/**
 * 切换激活的邮箱配置
 */
router.post('/email-configs/:id/activate', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	try {
		const configId = parseInt(req.params.id, 10);
		if (!configId || isNaN(configId)) {
			return res.status(400).json({ error: '无效的配置ID' });
		}
		await ConfigService.activateEmailConfig(db, configId);
		await reloadEmailConfig();
		res.json({ success: true, message: '操作成功' });
	} catch (e) {
		console.error('Admin route error');
		const status = /不存在|not found/i.test(String(e?.message || '')) ? 404 : 400;
		res.status(status).json({ error: '切换失败' });
	}
});

/**
 * 删除邮箱配置历史
 */
router.delete('/email-configs/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	try {
		const configId = parseInt(req.params.id, 10);
		if (!configId || isNaN(configId)) {
			return res.status(400).json({ error: '无效的配置ID' });
		}
		await ConfigService.deleteEmailConfig(db, configId);
		res.json({ success: true, message: '操作成功' });
	} catch (e) {
		console.error('Admin route error');
		const status = /不存在|not found/i.test(String(e?.message || '')) ? 404 : 400;
		res.status(status).json({ error: '删除失败' });
	}
});

/**
 * 获取统计代码
 */
router.get('/analytics-snippet', adminMiddleware, async (req, res) => {
	try {
		const snippet = await ConfigService.getAnalyticsSnippet(db);
		res.json({ success: true, data: { snippet } });
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '获取统计代码失败' });
	}
});

/**
 * 更新统计代码
 */
router.put('/analytics-snippet', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const { snippet } = req.body || {};
	try {
		await ConfigService.setAnalyticsSnippet(
			db,
			snippet !== undefined && snippet !== null ? String(snippet) : ''
		);
		res.json({ success: true });
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '更新统计代码失败' });
	}
});

/**
 * 获取 LLM 配置
 */
router.get('/llm-config', adminMiddleware, async (req, res) => {
	const scope = resolveLLMScope(req);
	if (!scope) return res.status(400).json({ error: '无效或冲突的模型配置场景' });
	try {
		const cfg = await ConfigService.getLLMConfig(db, scope);
		// 尝试从历史记录中获取当前激活的模型名称
		try {
			const models = await ConfigService.getLLMModels(db, scope);
			const activeModel = models.find(m => m.is_active === 1);
			if (activeModel) {
				cfg.name = activeModel.name;
			}
		} catch (e) {
			console.warn('获取模型名称失败:', e.message);
		}
		res.json(cfg);
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '获取配置失败' });
	}
});

/**
 * 保存 LLM 配置
 */
router.put('/llm-config', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const scope = resolveLLMScope(req);
	if (!scope) return res.status(400).json({ error: '无效或冲突的模型配置场景' });
	const { provider, baseUrl, apiKey, model, extra, name } = req.body || {};
	try {
		await ConfigService.setLLMConfig(db, {
			provider,
			baseUrl,
			apiKey,
			model,
			extra: extra !== undefined && extra !== null ? String(extra) : '',
			name,
		}, scope);
		res.json({ success: true });
	} catch (e) {
		console.error('Admin route error');
		res.status(400).json({ error: '保存失败' });
	}
});

/**
 * 获取所有历史模型配置
 */
router.get('/llm-models', adminMiddleware, async (req, res) => {
	const scope = resolveLLMScope(req);
	if (!scope) return res.status(400).json({ error: '无效或冲突的模型配置场景' });
	try {
		const models = await ConfigService.getLLMModels(db, scope);
		res.json({ success: true, data: models });
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '获取模型历史失败' });
	}
});

/**
 * 切换激活的模型配置
 */
router.post('/llm-models/:id/activate', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const scope = resolveLLMScope(req);
	if (!scope) return res.status(400).json({ error: '无效或冲突的模型配置场景' });
	try {
		const modelId = parseInt(req.params.id, 10);
		if (!modelId || isNaN(modelId)) {
			return res.status(400).json({ error: '无效的模型 ID' });
		}
		await ConfigService.activateLLMModel(db, modelId, scope);
		res.json({ success: true, message: '操作成功' });
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '切换模型失败' });
	}
});

/**
 * 删除模型配置
 */
router.delete('/llm-models/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const scope = resolveLLMScope(req);
	if (!scope) return res.status(400).json({ error: '无效或冲突的模型配置场景' });
	try {
		const modelId = parseInt(req.params.id, 10);
		if (!modelId || isNaN(modelId)) {
			return res.status(400).json({ error: '无效的模型 ID' });
		}
		await ConfigService.deleteLLMModel(db, modelId, scope);
		res.json({ success: true, message: '操作成功' });
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '删除模型失败' });
	}
});

/**
 * 获取额度重置配置
 */
router.get('/quota-reset-config', adminMiddleware, async (req, res) => {
	try {
		const config = await ConfigService.getQuotaResetConfig(db);
		res.json(config);
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '获取配置失败' });
	}
});

/**
 * 保存额度重置配置
 */
router.put('/quota-reset-config', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	try {
		const { enabled, time, timezone, target } = req.body;
		await ConfigService.setQuotaResetConfig(db, {
			enabled,
			time,
			timezone,
			target
		});
		
		// 重新加载调度器
		await reloadScheduler();
		
		res.json({ success: true });
	} catch (e) {
		console.error('Admin route error');
		res.status(400).json({ error: '保存失败' });
	}
});

/**
 * 获取统计数据
 */
router.get('/stats', adminMiddleware, async (req, res) => {
	const queries = {
		totalUsers: 'SELECT COUNT(*) as count FROM users',
		totalRecords:
			'SELECT (SELECT COUNT(*) FROM bazi_records) + (SELECT COUNT(*) FROM liuyao_records) + (SELECT COUNT(*) FROM ziwei_records) + (SELECT COUNT(*) FROM qimen_records) as count',
		todayUsers: `SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = CURDATE()`,
		todayRecords: `SELECT (SELECT COUNT(*) FROM bazi_records WHERE DATE(created_at) = CURDATE()) + (SELECT COUNT(*) FROM liuyao_records WHERE DATE(created_at) = CURDATE()) + (SELECT COUNT(*) FROM ziwei_records WHERE DATE(created_at) = CURDATE()) + (SELECT COUNT(*) FROM qimen_records WHERE DATE(created_at) = CURDATE()) as count`,
		adminUsers: "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
	};

	try {
		const results = {};
		const promises = Object.keys(queries).map(async (key) => {
			try {
				const row = await db.get(queries[key], []);
				results[key] = row?.count || 0;
			} catch (err) {
				console.error('Admin route error');
				results[key] = 0;
			}
		});

		await Promise.all(promises);
		res.json(results);
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '获取统计数据失败' });
	}
});

/**
 * 获取访客统计数据
 */
router.get('/stats/analytics', adminMiddleware, async (req, res) => {
	try {
		const { getAnalyticsSummary } = require('../services/analytics-summary');
		const data = await getAnalyticsSummary(db, { page: req.query?.page, pageSize: req.query?.pageSize, now: new Date() });
		res.json({ success: true, data });
	} catch (error) {
		console.error('Get analytics error:', error.message);
		res.status(503).json({ success: false, error: '访问统计暂时不可用，请稍后重试' });
	}
});

/**
 * 获取用户列表
 */
router.get('/users', adminMiddleware, async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page) || 1);
	const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 20));
	const offset = (page - 1) * pageSize;
	const search = req.query.search || '';

	let query = `
		SELECT 
			u.id, 
			u.email, 
			u.username, 
			u.role, 
			u.created_at,
			((SELECT COUNT(*) FROM bazi_records WHERE user_id = u.id)
			 + (SELECT COUNT(*) FROM liuyao_records WHERE user_id = u.id)
			 + (SELECT COUNT(*) FROM ziwei_records WHERE user_id = u.id)
			 + (SELECT COUNT(*) FROM qimen_records WHERE user_id = u.id)) as recordCount
		FROM users u
	`;
	let countQuery = 'SELECT COUNT(*) as count FROM users';
	const params = [];
	const groupBy = ' GROUP BY u.id';

	if (search) {
		query += ' WHERE u.email LIKE ? OR u.username LIKE ?';
		countQuery += ' WHERE email LIKE ? OR username LIKE ?';
		const searchPattern = `%${search}%`;
		params.push(searchPattern, searchPattern);
	}

	query += groupBy + ` ORDER BY u.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
	const countParams = params;

	try {
		const countRow = await db.get(countQuery, countParams);
		const total = countRow?.count || 0;

		const rows = await db.all(query, params);

		res.json({
			list: rows || [],
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '查询失败' });
	}
});

/**
 * 获取用户AI额度列表
 */
router.get('/users-quotas', adminMiddleware, async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page) || 1);
	const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 20));
	const offset = (page - 1) * pageSize;
	const search = req.query.search || '';

	let query = `
		SELECT 
			u.id as userId,
			u.email,
			u.username,
			COALESCE(q.remaining_daily_count, 0) as remainingCount,
			q.updated_at as updatedAt
		FROM users u
		LEFT JOIN user_llm_quotas q ON u.id = q.user_id
	`;
	let countQuery = 'SELECT COUNT(*) as count FROM users';
	const params = [];

	if (search) {
		query += ' WHERE u.email LIKE ? OR u.username LIKE ?';
		countQuery += ' WHERE email LIKE ? OR username LIKE ?';
		const searchPattern = `%${search}%`;
		params.push(searchPattern, searchPattern);
	}

	query += ` ORDER BY u.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
	const countParams = params;

	try {
		const countRow = await db.get(countQuery, countParams);
		const total = countRow?.count || 0;

		const rows = await db.all(query, params);

		res.json({
			list: rows || [],
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '查询失败' });
	}
});

/**
 * 获取指定用户AI额度
 */
router.get('/users/:id/quota', adminMiddleware, async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	if (!id) {
		return res.status(400).json({ error: '无效的用户ID' });
	}

	try {
		const user = await db.get('SELECT id, email, username FROM users WHERE id = ?', [id]);
		if (!user) {
			return res.status(404).json({ error: '请求失败' });
		}

		const quota = await db.get('SELECT * FROM user_llm_quotas WHERE user_id = ?', [id]);

		res.json({
			userId: user.id,
			email: user.email,
			username: user.username,
			remainingCount: quota?.remaining_daily_count || 0,
			updatedAt: quota?.updated_at || null,
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '查询失败' });
	}
});

/**
 * 设置指定用户AI额度
 */
router.put('/users/:id/quota', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	if (!id) {
		return res.status(400).json({ error: '无效的用户ID' });
	}

	const { remainingCount } = req.body || {};

	try {
		const user = await db.get('SELECT id FROM users WHERE id = ?', [id]);
		if (!user) {
			return res.status(404).json({ error: '请求失败' });
		}

		// 检查是否已存在额度记录
		const existing = await db.get('SELECT user_id FROM user_llm_quotas WHERE user_id = ?', [id]);

		if (existing) {
			// 更新现有记录
			const updateFields = [];
			const updateValues = [];

			if (remainingCount !== undefined) {
				updateFields.push('remaining_daily_count = ?');
				updateValues.push(remainingCount);
			}

			updateFields.push('per_minute_limit = 1');
			updateFields.push('updated_at = NOW()');
			updateValues.push(id);

			await db.run(
				`UPDATE user_llm_quotas 
				SET ${updateFields.join(', ')} 
				WHERE user_id = ?`,
				updateValues
			);
		} else {
			// 创建新记录
			await db.run(
				`INSERT INTO user_llm_quotas 
				(user_id, per_minute_limit, remaining_daily_count, remaining_token, updated_at) 
				VALUES (?, 1, ?, 0, NOW())`,
				[
					id,
					remainingCount !== undefined ? remainingCount : 0
				]
			);
		}

		res.json({ success: true, message: '额度更新成功' });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '更新失败' });
	}
});

/**
 * 创建用户
 */
router.post('/users', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const { email, username, password, role = 'user' } = req.body || {};

	if (!email || !password) {
		return res.status(400).json({ error: '缺少 email 或 password' });
	}

	// 使用安全工具验证和清理输入
	const trimmedEmail = SecurityUtils.sanitizeString(String(email), {
		maxLength: 255,
	}).toLowerCase();

	if (!SecurityUtils.isValidEmail(trimmedEmail)) {
		return res.status(400).json({ error: '请求失败' });
	}

	// 验证用户名（如果提供）
	let trimmedUsername = null;
	if (username) {
		const usernameValidation = SecurityUtils.validateUsername(username);
		if (!usernameValidation.valid) {
			return res.status(400).json({ error: usernameValidation.error });
		}
		trimmedUsername = usernameValidation.sanitized;
	}

	// 验证密码
	const passwordValidation = SecurityUtils.validatePassword(password);
	if (!passwordValidation.valid) {
		return res.status(400).json({ error: passwordValidation.error });
	}

	// 验证角色
	if (role !== 'user' && role !== 'admin') {
		return res.status(400).json({ error: '无效的角色，必须是 user 或 admin' });
	}

	// 检查邮箱或用户名是否已存在
	const checkQuery = trimmedUsername
		? 'SELECT id FROM users WHERE email = ? OR username = ?'
		: 'SELECT id FROM users WHERE email = ?';
	const checkParams = trimmedUsername ? [trimmedEmail, trimmedUsername] : [trimmedEmail];

	try {
		const row = await db.get(checkQuery, checkParams);

		if (row) {
			return res.status(409).json({ error: '请求失败' });
		}

		const passwordHash = bcrypt.hashSync(String(password), 10);

		const insertQuery = trimmedUsername
			? 'INSERT INTO users (email, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, NOW())'
			: 'INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, NOW())';
		const insertParams = trimmedUsername
			? [trimmedEmail, trimmedUsername, passwordHash, role]
			: [trimmedEmail, passwordHash, role];

		const result = await db.run(insertQuery, insertParams);

		res.json({
			success: true,
			user: {
				id: result.lastID,
				email: trimmedEmail,
				username: trimmedUsername,
				role: role,
			},
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '创建失败' });
	}
});

/**
 * 获取用户详情
 */
router.get('/users/:id', adminMiddleware, async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	if (!id) {
		return res.status(400).json({ error: '无效的用户ID' });
	}

	try {
		const row = await db.get(
			'SELECT id, email, username, role, created_at FROM users WHERE id = ?',
			[id]
		);

		if (!row) {
			return res.status(404).json({ error: '请求失败' });
		}

		try {
			const countRow = await db.get(
				`SELECT (SELECT COUNT(*) FROM bazi_records WHERE user_id = ?)
				 + (SELECT COUNT(*) FROM liuyao_records WHERE user_id = ?)
				 + (SELECT COUNT(*) FROM ziwei_records WHERE user_id = ?)
				 + (SELECT COUNT(*) FROM qimen_records WHERE user_id = ?) as count`,
				[id, id, id, id]
			);
			res.json({
				...row,
				recordCount: countRow?.count || 0,
			});
		} catch (countErr) {
			console.error('Admin route error');
			res.json({
				...row,
				recordCount: 0,
			});
		}
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '查询失败' });
	}
});

/**
 * 更新用户信息
 */
router.put('/users/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	const { email, username, password, role } = req.body || {};

	if (!id) {
		return res.status(400).json({ error: '无效的用户ID' });
	}

	// 不能修改自己的角色
	if (role && req.user.id === id && role !== 'admin') {
		return res.status(400).json({ error: '请求失败' });
	}

	try {
		// 先查询用户是否存在
		const userRow = await db.get('SELECT id, email, username, role FROM users WHERE id = ?', [id]);

		if (!userRow) {
			return res.status(404).json({ error: '请求失败' });
		}

		// 验证和准备更新数据
		const updates = [];
		const params = [];

		// 更新邮箱
		if (email !== undefined) {
			const trimmedEmail = SecurityUtils.sanitizeString(String(email), {
				maxLength: 255,
			}).toLowerCase();
			if (!SecurityUtils.isValidEmail(trimmedEmail)) {
				return res.status(400).json({ error: '请求失败' });
			}
			updates.push('email = ?');
			params.push(trimmedEmail);
		}

		// 更新用户名
		if (username !== undefined) {
			if (username === null || username === '') {
				updates.push('username = NULL');
			} else {
				const usernameValidation = SecurityUtils.validateUsername(username);
				if (!usernameValidation.valid) {
					return res.status(400).json({ error: usernameValidation.error });
				}
				updates.push('username = ?');
				params.push(usernameValidation.sanitized);
			}
		}

		// 更新密码
		if (password !== undefined && password !== null && password !== '') {
			const passwordValidation = SecurityUtils.validatePassword(password);
			if (!passwordValidation.valid) {
				return res.status(400).json({ error: passwordValidation.error });
			}
			const passwordHash = bcrypt.hashSync(String(password), 10);
			updates.push('password_hash = ?');
			params.push(passwordHash);
		}

		// 更新角色
		if (role !== undefined) {
			if (role !== 'user' && role !== 'admin') {
				return res.status(400).json({ error: '无效的角色，必须是 user 或 admin' });
			}
			updates.push('role = ?');
			params.push(role);
		}

		if (updates.length === 0) {
			return res.status(400).json({ error: '没有要更新的字段' });
		}

		// 检查邮箱和用户名是否冲突
		const checkConditions = [];
		const checkParams = [];

		if (email !== undefined) {
			checkConditions.push('email = ?');
			checkParams.push(
				SecurityUtils.sanitizeString(String(email), { maxLength: 255 }).toLowerCase()
			);
		}
		if (username !== undefined && username !== null && username !== '') {
			const usernameValidation = SecurityUtils.validateUsername(username);
			if (usernameValidation.valid) {
				checkConditions.push('username = ?');
				checkParams.push(usernameValidation.sanitized);
			}
		}

		if (checkConditions.length > 0) {
			checkParams.push(id);
			const checkQuery = `SELECT id FROM users WHERE (${checkConditions.join(' OR ')}) AND id != ?`;
			const checkRow = await db.get(checkQuery, checkParams);

			if (checkRow) {
				return res.status(409).json({ error: '请求失败' });
			}
		}

		params.push(id);
		const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
		const result = await db.run(updateQuery, params);

		if (result.changes === 0) {
			return res.status(404).json({ error: '请求失败' });
		}

		res.json({ success: true });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '更新失败' });
	}
});

/**
 * 更新用户角色
 */
router.put('/users/:id/role', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	const { role } = req.body || {};

	if (!id) {
		return res.status(400).json({ error: '无效的用户ID' });
	}

	if (!role || (role !== 'user' && role !== 'admin')) {
		return res.status(400).json({ error: '无效的角色，必须是 user 或 admin' });
	}

	// 不能修改自己的角色
	if (req.user.id === id) {
		return res.status(400).json({ error: '请求失败' });
	}

	try {
		const result = await db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);

		if (result.changes === 0) {
			return res.status(404).json({ error: '请求失败' });
		}

		res.json({ success: true });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '更新失败' });
	}
});

/**
 * 删除用户
 */
router.delete('/users/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	if (!id) {
		return res.status(400).json({ error: '无效的用户ID' });
	}

	// 不能删除自己
	if (req.user.id === id) {
		return res.status(400).json({ error: '不能删除自己' });
	}

	try {
		// 先删除该用户的所有八字记录
		await db.run('DELETE FROM bazi_records WHERE user_id = ?', [id]);
		await db.run('DELETE FROM qimen_records WHERE user_id = ?', [id]);

		// 再删除用户
		const result = await db.run('DELETE FROM users WHERE id = ?', [id]);

		if (result.changes === 0) {
			return res.status(404).json({ error: '请求失败' });
		}

		res.json({ success: true });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '删除失败' });
	}
});

/**
 * 获取八字记录列表
 */
/**
 * 获取统一排盘记录列表（八字/六爻/紫微/奇门）
 */
router.get('/chart-records', adminMiddleware, async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
	const offset = (page - 1) * pageSize;
	const userId = req.query.userId ? SecurityUtils.validateId(req.query.userId) : null;
	const searchKeyword = req.query.search
		? SecurityUtils.sanitizeSearchKeyword(String(req.query.search))
		: '';
	const typeFilter = normalizeAdminRecordType(req.query.type, {
		allowAll: true,
		defaultType: 'all',
	});

	const conditions = [];
	const params = [];
	if (userId) {
		conditions.push('r.user_id = ?');
		params.push(userId);
	}
	if (searchKeyword) {
		conditions.push('(r.name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)');
		const searchPattern = `%${searchKeyword}%`;
		params.push(searchPattern, searchPattern, searchPattern);
	}
	const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

	try {
		let rows = [];
		let total = 0;

		if (typeFilter === 'all') {
			const unionSelects = ADMIN_RECORD_TYPES.map((chartType) =>
				buildAdminRecordSelectQuery(ADMIN_RECORD_TYPE_TABLE_MAP[chartType], chartType, whereClause)
			);
			const unionParams = [];
			ADMIN_RECORD_TYPES.forEach(() => {
				unionParams.push(...params);
			});

			const countQuery = `SELECT COUNT(*) as count FROM (${unionSelects.join(
				' UNION ALL '
			)}) all_records`;
			const listQuery = `SELECT * FROM (${unionSelects.join(
				' UNION ALL '
			)}) all_records ORDER BY createdAt DESC LIMIT ${pageSize} OFFSET ${offset}`;

			const countRow = await db.get(countQuery, unionParams);
			total = countRow?.count || 0;
			rows = await db.all(listQuery, unionParams);
		} else {
			const tableName = ADMIN_RECORD_TYPE_TABLE_MAP[typeFilter];
			const listQuery =
				buildAdminRecordSelectQuery(tableName, typeFilter, whereClause) +
				` ORDER BY r.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
			const countQuery = `SELECT COUNT(*) as count FROM ${tableName} r LEFT JOIN users u ON r.user_id = u.id${whereClause}`;

			const countRow = await db.get(countQuery, params);
			total = countRow?.count || 0;
			rows = await db.all(listQuery, params);
		}

		res.json({
			list: rows || [],
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '查询失败' });
	}
});

/**
 * 获取统一排盘记录详情
 */
router.get('/chart-records/:id', adminMiddleware, async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	const rawType = String(req.query.type || '').trim().toLowerCase();
	if (!id) {
		return res.status(400).json({ error: '无效的记录ID' });
	}
	if (rawType === 'all') {
		return res.status(400).json({ error: '请求失败' });
	}

	const chartType = normalizeAdminRecordType(rawType, { defaultType: 'bazi' });
	const tableName = ADMIN_RECORD_TYPE_TABLE_MAP[chartType];

	try {
		const row = await db.get(
			`SELECT
				r.id,
				r.name,
				r.gender,
				r.birth_datetime AS birthDatetime,
				r.calendar_type AS calendarType,
				r.raw_payload AS rawPayload,
				r.created_at AS createdAt,
				u.id AS userId,
				u.email AS userEmail,
				u.username AS userUsername,
				'${chartType}' AS chartType
			FROM ${tableName} r
			LEFT JOIN users u ON r.user_id = u.id
			WHERE r.id = ?`,
			[id]
		);

		if (!row) {
			return res.status(404).json({ error: '请求失败' });
		}

		res.json({
			id: row.id,
			name: row.name,
			gender: row.gender,
			birthDatetime: row.birthDatetime,
			calendarType: row.calendarType,
			createdAt: row.createdAt,
			userId: row.userId,
			userEmail: row.userEmail,
			userUsername: row.userUsername,
			chartType: row.chartType,
			rawPayload: parseAdminRawPayload(row.rawPayload),
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '查询失败' });
	}
});

/**
 * 创建统一排盘记录
 */
router.post('/chart-records', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const { type, userId, name, gender, birthDatetime, calendarType, rawPayload } = req.body || {};
	const chartType = normalizeAdminRecordType(type || req.query.type, { defaultType: 'bazi' });
	const tableName = ADMIN_RECORD_TYPE_TABLE_MAP[chartType];

	if (!userId || birthDatetime === null || birthDatetime === undefined || birthDatetime === '') {
		return res.status(400).json({ error: '缺少 userId 或 birthDatetime' });
	}

	try {
		const userRow = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
		if (!userRow) {
			return res.status(404).json({ error: '请求失败' });
		}

		const sanitizedName = name
			? SecurityUtils.sanitizeString(String(name), { maxLength: 100 })
			: null;
		const validatedGender = SecurityUtils.validateGender(gender);
		const validatedDateTime = SecurityUtils.validateDateTime(birthDatetime);
		if (!validatedDateTime) {
			return res.status(400).json({ error: '请求失败' });
		}

		const sanitizedCalendarType = calendarType
			? SecurityUtils.sanitizeString(String(calendarType), { maxLength: 20 })
			: null;

		let rawPayloadJson = null;
		if (rawPayload) {
			try {
				const payloadStr = JSON.stringify(rawPayload);
				if (payloadStr.length > 1000000) {
					return res.status(400).json({ error: '请求失败' });
				}
				rawPayloadJson = payloadStr;
			} catch (e) {
				return res.status(400).json({ error: '数据格式错误，无法保存' });
			}
		}

		const insertSql = `INSERT INTO ${tableName} (user_id, name, gender, birth_datetime, calendar_type, raw_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
		const result = await db.run(insertSql, [
			userId,
			sanitizedName,
			validatedGender,
			validatedDateTime,
			sanitizedCalendarType,
			rawPayloadJson,
		]);

		res.json({
			success: true,
			record: {
				id: result.lastID,
				userId,
				name: sanitizedName,
				gender: validatedGender,
				birthDatetime: validatedDateTime,
				calendarType: sanitizedCalendarType,
				chartType,
			},
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '创建失败' });
	}
});

/**
 * 更新统一排盘记录
 */
router.put('/chart-records/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	const rawType = String(req.body?.type || req.query.type || '').trim().toLowerCase();
	if (!id) {
		return res.status(400).json({ error: '无效的记录ID' });
	}
	if (rawType === 'all') {
		return res.status(400).json({ error: '请求失败' });
	}

	const chartType = normalizeAdminRecordType(rawType, { defaultType: 'bazi' });
	const tableName = ADMIN_RECORD_TYPE_TABLE_MAP[chartType];
	const { userId, name, gender, birthDatetime, calendarType, rawPayload } = req.body || {};

	try {
		const recordRow = await db.get(`SELECT id, user_id FROM ${tableName} WHERE id = ?`, [id]);
		if (!recordRow) {
			return res.status(404).json({ error: '请求失败' });
		}

		if (userId !== undefined && userId !== recordRow.user_id) {
			const userRow = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
			if (!userRow) {
				return res.status(404).json({ error: '请求失败' });
			}
		}

		const updates = [];
		const params = [];

		if (userId !== undefined) {
			updates.push('user_id = ?');
			params.push(userId);
		}

		if (name !== undefined) {
			if (name === null || name === '') {
				updates.push('name = NULL');
			} else {
				updates.push('name = ?');
				params.push(SecurityUtils.sanitizeString(String(name), { maxLength: 100 }));
			}
		}

		if (gender !== undefined) {
			updates.push('gender = ?');
			params.push(SecurityUtils.validateGender(gender));
		}

		if (birthDatetime !== undefined) {
			const validatedDateTime = SecurityUtils.validateDateTime(birthDatetime);
			if (!validatedDateTime) {
				return res.status(400).json({ error: '请求失败' });
			}
			updates.push('birth_datetime = ?');
			params.push(validatedDateTime);
		}

		if (calendarType !== undefined) {
			if (calendarType === null || calendarType === '') {
				updates.push('calendar_type = NULL');
			} else {
				updates.push('calendar_type = ?');
				params.push(SecurityUtils.sanitizeString(String(calendarType), { maxLength: 20 }));
			}
		}

		if (rawPayload !== undefined) {
			if (rawPayload === null) {
				updates.push('raw_payload = NULL');
			} else {
				try {
					const payloadStr = JSON.stringify(rawPayload);
					if (payloadStr.length > 1000000) {
						return res.status(400).json({ error: '请求失败' });
					}
					updates.push('raw_payload = ?');
					params.push(payloadStr);
				} catch (e) {
					return res.status(400).json({ error: '数据格式错误: ' });
				}
			}
		}

		if (updates.length === 0) {
			return res.status(400).json({ error: '没有要更新的字段' });
		}

		params.push(id);
		const updateQuery = `UPDATE ${tableName} SET ${updates.join(', ')} WHERE id = ?`;
		const result = await db.run(updateQuery, params);
		if (result.changes === 0) {
			return res.status(404).json({ error: '请求失败' });
		}

		res.json({ success: true, chartType });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '更新失败' });
	}
});

/**
 * 删除统一排盘记录
 */
router.delete('/chart-records/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	const rawType = String(req.query.type || '').trim().toLowerCase();
	if (!id) {
		return res.status(400).json({ error: '无效的记录ID' });
	}
	if (rawType === 'all') {
		return res.status(400).json({ error: '请求失败' });
	}

	const chartType = normalizeAdminRecordType(rawType, { defaultType: 'bazi' });
	const tableName = ADMIN_RECORD_TYPE_TABLE_MAP[chartType];

	try {
		const result = await db.run(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
		if (result.changes === 0) {
			return res.status(404).json({ error: '请求失败' });
		}
		res.json({ success: true });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '删除失败' });
	}
});

router.get('/records', adminMiddleware, async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page) || 1);
	const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 20));
	const offset = (page - 1) * pageSize;
	const userId = req.query.userId ? parseInt(req.query.userId) : null;
	const search = req.query.search || '';

	let query = `
		SELECT 
			r.id, 
			r.name, 
			r.gender, 
			r.birth_datetime AS birthDatetime, 
			r.calendar_type AS calendarType,
			r.created_at AS createdAt,
			u.id AS userId,
			u.email AS userEmail,
			u.username AS userUsername
		FROM bazi_records r
		LEFT JOIN users u ON r.user_id = u.id
	`;
	let countQuery = 'SELECT COUNT(*) as count FROM bazi_records r';
	const params = [];
	const conditions = [];

	if (userId) {
		conditions.push('r.user_id = ?');
		params.push(userId);
	}

	if (search) {
		conditions.push('(r.name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)');
		const searchPattern = `%${search}%`;
		params.push(searchPattern, searchPattern, searchPattern);
	}

	if (conditions.length > 0) {
		const whereClause = ' WHERE ' + conditions.join(' AND ');
		query += whereClause;
		countQuery += whereClause;
	}

	query += ` ORDER BY r.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
	const countParams = params;

	try {
		const countRow = await db.get(countQuery, countParams);
		const total = countRow?.count || 0;

		const rows = await db.all(query, params);

		res.json({
			list: rows || [],
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '查询失败' });
	}
});

/**
 * 获取八字记录详情
 */
router.get('/records/:id', adminMiddleware, async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	if (!id) {
		return res.status(400).json({ error: '无效的记录ID' });
	}

	try {
		const row = await db.get(
			`SELECT 
				r.id, 
				r.name, 
				r.gender, 
				r.birth_datetime AS birthDatetime,
				r.calendar_type AS calendarType,
				r.raw_payload AS rawPayload,
				r.created_at AS createdAt,
				u.id AS userId,
				u.email AS userEmail,
				u.username AS userUsername
			FROM bazi_records r
			LEFT JOIN users u ON r.user_id = u.id
			WHERE r.id = ?`,
			[id]
		);

		if (!row) {
			return res.status(404).json({ error: '请求失败' });
		}

		let parsedPayload = null;
		if (row.rawPayload) {
			try {
				if (typeof row.rawPayload === 'string') {
					parsedPayload = JSON.parse(row.rawPayload);
				} else {
					parsedPayload = row.rawPayload;
				}
			} catch (e) {
				console.error('Admin route error');
				parsedPayload = row.rawPayload;
			}
		}

		res.json({
			id: row.id,
			name: row.name,
			gender: row.gender,
			birthDatetime: row.birthDatetime,
			calendarType: row.calendarType,
			createdAt: row.createdAt,
			userId: row.userId,
			userEmail: row.userEmail,
			userUsername: row.userUsername,
			rawPayload: parsedPayload,
		});
	} catch (err) {
		console.error('Admin route error');
		if (err.code === 'ER_MALFORMED_PACKET') {
			console.error('数据包错误，可能是查询结果过大或连接问题');
			return res.status(500).json({
				error: '查询失败：数据包错误，请检查数据库连接或联系管理员',
			});
		}
		return res.status(500).json({ error: '查询失败' });
	}
});

/**
 * 创建八字记录
 */
router.post('/records', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const { userId, name, gender, birthDatetime, calendarType, rawPayload } = req.body || {};

	if (!userId || birthDatetime === null || birthDatetime === undefined || birthDatetime === '') {
		return res.status(400).json({ error: '缺少 userId 或 birthDatetime' });
	}

	try {
		// 验证用户是否存在
		const userRow = await db.get('SELECT id FROM users WHERE id = ?', [userId]);

		if (!userRow) {
			return res.status(404).json({ error: '请求失败' });
		}

		// 使用安全工具验证和清理输入
		const sanitizedName = name
			? SecurityUtils.sanitizeString(String(name), { maxLength: 100 })
			: null;
		const validatedGender = SecurityUtils.validateGender(gender);
		const validatedDateTime = SecurityUtils.validateDateTime(birthDatetime);

		if (!validatedDateTime) {
			return res.status(400).json({ error: '请求失败' });
		}

		const sanitizedCalendarType = calendarType
			? SecurityUtils.sanitizeString(String(calendarType), { maxLength: 20 })
			: null;

		// 安全地序列化 rawPayload
		let rawPayloadJson = null;
		if (rawPayload) {
			try {
				const payloadStr = JSON.stringify(rawPayload);
				if (payloadStr.length > 1000000) {
					return res.status(400).json({ error: '请求失败' });
				}
				rawPayloadJson = payloadStr;
			} catch (e) {
				console.error('Admin route error');
				return res.status(400).json({ error: '数据格式错误，无法保存' });
			}
		}

		const insertSql =
			'INSERT INTO bazi_records (user_id, name, gender, birth_datetime, calendar_type, raw_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())';

		const result = await db.run(insertSql, [
			userId,
			sanitizedName,
			validatedGender,
			validatedDateTime,
			sanitizedCalendarType,
			rawPayloadJson,
		]);

		res.json({
			success: true,
			record: {
				id: result.lastID,
				userId,
				name: sanitizedName,
				gender: validatedGender,
				birthDatetime: validatedDateTime,
				calendarType: sanitizedCalendarType,
			},
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '创建失败' });
	}
});

/**
 * 更新八字记录
 */
router.put('/records/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	const { userId, name, gender, birthDatetime, calendarType, rawPayload } = req.body || {};

	if (!id) {
		return res.status(400).json({ error: '无效的记录ID' });
	}

	try {
		const recordRow = await db.get('SELECT id, user_id FROM bazi_records WHERE id = ?', [id]);

		if (!recordRow) {
			return res.status(404).json({ error: '请求失败' });
		}

		if (userId !== undefined && userId !== recordRow.user_id) {
			const userRow = await db.get('SELECT id FROM users WHERE id = ?', [userId]);

			if (!userRow) {
				return res.status(404).json({ error: '请求失败' });
			}
		}

		const updates = [];
		const params = [];

		if (userId !== undefined) {
			updates.push('user_id = ?');
			params.push(userId);
		}

		if (name !== undefined) {
			if (name === null || name === '') {
				updates.push('name = NULL');
			} else {
				updates.push('name = ?');
				params.push(SecurityUtils.sanitizeString(String(name), { maxLength: 100 }));
			}
		}

		if (gender !== undefined) {
			const validatedGender = SecurityUtils.validateGender(gender);
			updates.push('gender = ?');
			params.push(validatedGender);
		}

		if (birthDatetime !== undefined) {
			const validatedDateTime = SecurityUtils.validateDateTime(birthDatetime);
			if (!validatedDateTime) {
				return res.status(400).json({ error: '请求失败' });
			}
			updates.push('birth_datetime = ?');
			params.push(validatedDateTime);
		}

		if (calendarType !== undefined) {
			if (calendarType === null || calendarType === '') {
				updates.push('calendar_type = NULL');
			} else {
				updates.push('calendar_type = ?');
				params.push(SecurityUtils.sanitizeString(String(calendarType), { maxLength: 20 }));
			}
		}

		if (rawPayload !== undefined) {
			if (rawPayload === null) {
				updates.push('raw_payload = NULL');
			} else {
				try {
					const payloadStr = JSON.stringify(rawPayload);
					if (payloadStr.length > 1000000) {
						return res.status(400).json({ error: '请求失败' });
					}
					updates.push('raw_payload = ?');
					params.push(payloadStr);
				} catch (e) {
					return res.status(400).json({ error: '数据格式错误: ' });
				}
			}
		}

		if (updates.length === 0) {
			return res.status(400).json({ error: '没有要更新的字段' });
		}

		params.push(id);
		const updateQuery = `UPDATE bazi_records SET ${updates.join(', ')} WHERE id = ?`;
		const result = await db.run(updateQuery, params);

		if (result.changes === 0) {
			return res.status(404).json({ error: '请求失败' });
		}

		res.json({ success: true });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '更新失败' });
	}
});

/**
 * 删除八字记录
 */
router.delete('/records/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	if (!id) {
		return res.status(400).json({ error: '无效的记录ID' });
	}

	try {
		const result = await db.run('DELETE FROM bazi_records WHERE id = ?', [id]);
		if (result.changes === 0) {
			return res.status(404).json({ error: '请求失败' });
		}
		res.json({ success: true });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '删除失败' });
	}
});

/**
 * 获取六爻记录列表
 */
router.get('/liuyao-records', adminMiddleware, async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page) || 1);
	const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 20));
	const offset = (page - 1) * pageSize;
	const userId = req.query.userId ? parseInt(req.query.userId) : null;
	const search = req.query.search || '';

	let query = `
		SELECT 
			r.id, 
			r.name, 
			r.gender, 
			r.birth_datetime AS birthDatetime, 
			r.calendar_type AS calendarType,
			r.created_at AS createdAt,
			u.id AS userId,
			u.email AS userEmail,
			u.username AS userUsername
		FROM liuyao_records r
		LEFT JOIN users u ON r.user_id = u.id
	`;
	let countQuery = 'SELECT COUNT(*) as count FROM liuyao_records r';
	const params = [];
	const conditions = [];

	if (userId) {
		conditions.push('r.user_id = ?');
		params.push(userId);
	}

	if (search) {
		conditions.push('(r.name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)');
		const searchPattern = `%${search}%`;
		params.push(searchPattern, searchPattern, searchPattern);
	}

	if (conditions.length > 0) {
		const whereClause = ' WHERE ' + conditions.join(' AND ');
		query += whereClause;
		countQuery += whereClause;
	}

	query += ` ORDER BY r.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
	const countParams = params;

	try {
		const countRow = await db.get(countQuery, countParams);
		const total = countRow?.count || 0;

		const rows = await db.all(query, params);

		res.json({
			list: rows || [],
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '查询失败' });
	}
});

/**
 * 获取六爻记录详情
 */
router.get('/liuyao-records/:id', adminMiddleware, async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	if (!id) {
		return res.status(400).json({ error: '无效的记录ID' });
	}

	try {
		const row = await db.get(
			`SELECT 
				r.id, 
				r.name, 
				r.gender, 
				r.birth_datetime AS birthDatetime,
				r.calendar_type AS calendarType,
				r.raw_payload AS rawPayload,
				r.created_at AS createdAt,
				u.id AS userId,
				u.email AS userEmail,
				u.username AS userUsername
			FROM liuyao_records r
			LEFT JOIN users u ON r.user_id = u.id
			WHERE r.id = ?`,
			[id]
		);

		if (!row) {
			return res.status(404).json({ error: '请求失败' });
		}

		let parsedPayload = null;
		if (row.rawPayload) {
			try {
				if (typeof row.rawPayload === 'string') {
					parsedPayload = JSON.parse(row.rawPayload);
				} else {
					parsedPayload = row.rawPayload;
				}
			} catch (e) {
				console.error('Admin route error');
				parsedPayload = row.rawPayload;
			}
		}

		res.json({
			id: row.id,
			name: row.name,
			gender: row.gender,
			birthDatetime: row.birthDatetime,
			calendarType: row.calendarType,
			createdAt: row.createdAt,
			userId: row.userId,
			userEmail: row.userEmail,
			userUsername: row.userUsername,
			rawPayload: parsedPayload,
		});
	} catch (err) {
		console.error('Admin route error');
		if (err.code === 'ER_MALFORMED_PACKET') {
			console.error('数据包错误，可能是查询结果过大或连接问题');
			return res.status(500).json({
				error: '查询失败：数据包错误，请检查数据库连接或联系管理员',
			});
		}
		return res.status(500).json({ error: '查询失败' });
	}
});

/**
 * 创建六爻记录
 */
router.post('/liuyao-records', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const { userId, name, gender, birthDatetime, calendarType, rawPayload } = req.body || {};

	if (!userId || birthDatetime === null || birthDatetime === undefined || birthDatetime === '') {
		return res.status(400).json({ error: '缺少 userId 或 birthDatetime' });
	}

	try {
		// 验证用户是否存在
		const userRow = await db.get('SELECT id FROM users WHERE id = ?', [userId]);

		if (!userRow) {
			return res.status(404).json({ error: '请求失败' });
		}

		// 使用安全工具验证和清理输入
		const sanitizedName = name
			? SecurityUtils.sanitizeString(String(name), { maxLength: 100 })
			: null;
		const validatedGender = SecurityUtils.validateGender(gender);
		const validatedDateTime = SecurityUtils.validateDateTime(birthDatetime);

		if (!validatedDateTime) {
			return res.status(400).json({ error: '请求失败' });
		}

		const sanitizedCalendarType = calendarType
			? SecurityUtils.sanitizeString(String(calendarType), { maxLength: 20 })
			: null;

		// 安全地序列化 rawPayload
		let rawPayloadJson = null;
		if (rawPayload) {
			try {
				const payloadStr = JSON.stringify(rawPayload);
				if (payloadStr.length > 1000000) {
					return res.status(400).json({ error: '请求失败' });
				}
				rawPayloadJson = payloadStr;
			} catch (e) {
				console.error('Admin route error');
				return res.status(400).json({ error: '数据格式错误，无法保存' });
			}
		}

		const insertSql =
			'INSERT INTO liuyao_records (user_id, name, gender, birth_datetime, calendar_type, raw_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())';

		const result = await db.run(insertSql, [
			userId,
			sanitizedName,
			validatedGender,
			validatedDateTime,
			sanitizedCalendarType,
			rawPayloadJson,
		]);

		res.json({
			success: true,
			record: {
				id: result.lastID,
				userId,
				name: sanitizedName,
				gender: validatedGender,
				birthDatetime: validatedDateTime,
				calendarType: sanitizedCalendarType,
			},
		});
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '创建失败' });
	}
});

/**
 * 更新六爻记录
 */
router.put('/liuyao-records/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	const { userId, name, gender, birthDatetime, calendarType, rawPayload } = req.body || {};

	if (!id) {
		return res.status(400).json({ error: '无效的记录ID' });
	}

	try {
		const recordRow = await db.get('SELECT id, user_id FROM liuyao_records WHERE id = ?', [id]);

		if (!recordRow) {
			return res.status(404).json({ error: '请求失败' });
		}

		if (userId !== undefined && userId !== recordRow.user_id) {
			const userRow = await db.get('SELECT id FROM users WHERE id = ?', [userId]);

			if (!userRow) {
				return res.status(404).json({ error: '请求失败' });
			}
		}

		const updates = [];
		const params = [];

		if (userId !== undefined) {
			updates.push('user_id = ?');
			params.push(userId);
		}

		if (name !== undefined) {
			if (name === null || name === '') {
				updates.push('name = NULL');
			} else {
				updates.push('name = ?');
				params.push(SecurityUtils.sanitizeString(String(name), { maxLength: 100 }));
			}
		}

		if (gender !== undefined) {
			const validatedGender = SecurityUtils.validateGender(gender);
			updates.push('gender = ?');
			params.push(validatedGender);
		}

		if (birthDatetime !== undefined) {
			const validatedDateTime = SecurityUtils.validateDateTime(birthDatetime);
			if (!validatedDateTime) {
				return res.status(400).json({ error: '请求失败' });
			}
			updates.push('birth_datetime = ?');
			params.push(validatedDateTime);
		}

		if (calendarType !== undefined) {
			if (calendarType === null || calendarType === '') {
				updates.push('calendar_type = NULL');
			} else {
				updates.push('calendar_type = ?');
				params.push(SecurityUtils.sanitizeString(String(calendarType), { maxLength: 20 }));
			}
		}

		if (rawPayload !== undefined) {
			if (rawPayload === null) {
				updates.push('raw_payload = NULL');
			} else {
				try {
					const payloadStr = JSON.stringify(rawPayload);
					if (payloadStr.length > 1000000) {
						return res.status(400).json({ error: '请求失败' });
					}
					updates.push('raw_payload = ?');
					params.push(payloadStr);
				} catch (e) {
					return res.status(400).json({ error: '数据格式错误: ' });
				}
			}
		}

		if (updates.length === 0) {
			return res.status(400).json({ error: '没有要更新的字段' });
		}

		params.push(id);
		const updateQuery = `UPDATE liuyao_records SET ${updates.join(', ')} WHERE id = ?`;
		const result = await db.run(updateQuery, params);

		if (result.changes === 0) {
			return res.status(404).json({ error: '请求失败' });
		}

		res.json({ success: true });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '更新失败' });
	}
});

/**
 * 删除六爻记录
 */
router.delete('/liuyao-records/:id', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	if (!id) {
		return res.status(400).json({ error: '无效的记录ID' });
	}

	try {
		const result = await db.run('DELETE FROM liuyao_records WHERE id = ?', [id]);
		if (result.changes === 0) {
			return res.status(404).json({ error: '请求失败' });
		}
		res.json({ success: true });
	} catch (err) {
		console.error('Admin route error');
		return res.status(500).json({ error: '删除失败' });
	}
});

/**
 * 获取额度重置配置
 */
router.get('/quota-reset-config', adminMiddleware, async (req, res) => {
	try {
		const config = await ConfigService.getQuotaResetConfig(db);
		res.json(config);
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '获取配置失败' });
	}
});

/**
 * 更新额度重置配置
 */
router.post('/quota-reset-config', adminMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const { enabled, time, timezone, target } = req.body || {};

	try {
		const enabledNormalized =
			enabled === undefined ? true : enabled === true || enabled === 'true' || enabled === 1 || enabled === '1';

		await ConfigService.setQuotaResetConfig(db, {
			enabled: enabledNormalized,
			time: time,
			timezone: timezone,
			target: target
		});

		// 重新加载定时任务
		await reloadScheduler();

		res.json({ success: true, message: '配置已保存并生效' });
	} catch (e) {
		console.error('Admin route error');
		res.status(500).json({ error: '更新配置失败' });
	}
});

module.exports = router;






