/** 奇门盘由前端计算；后端保存可恢复的输入与快照，不重新推算盘面。 */
const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db');
const { safeJsonParse } = require('../utils/helpers');
const { authMiddleware } = require('../middleware/auth');
const { apiSignatureMiddleware } = require('../middleware/api-signature');
const { sanitizeErrorForLog } = require('../utils/error-sanitizer');
const SecurityUtils = require('../security');

const db = getDatabase();
const selectFields = 'id, name, gender, birth_datetime AS birthDatetime, calendar_type AS calendarType, raw_payload AS rawPayload, created_at AS createdAt';

function serializeInput(body) {
	const { name, gender, birthDatetime, calendarType, rawPayload } = body || {};
	const date = SecurityUtils.validateDateTime(birthDatetime);
	if (birthDatetime === null || birthDatetime === undefined || birthDatetime === '' || !date) {
		throw new Error('起局时间格式不正确');
	}
	if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload) ||
		rawPayload.module !== 'qimen' || rawPayload.version !== 1 ||
		rawPayload.input?.ruleVersion !== 'qimen-chai-bu-v1' ||
		typeof rawPayload.input?.question !== 'string' ||
		!Number.isFinite(rawPayload.input?.timestamp) || rawPayload.input.timestamp !== Date.parse(date) ||
		typeof rawPayload.input?.timeZone !== 'string' || !rawPayload.input.timeZone ||
		!rawPayload.snapshot || typeof rawPayload.snapshot !== 'object' || Array.isArray(rawPayload.snapshot)) {
		throw new Error('缺少有效的奇门输入或排盘快照');
	}
	try { new Intl.DateTimeFormat('en', { timeZone: rawPayload.input.timeZone }); }
	catch { throw new Error('起局时区无效'); }
	let json;
	try { json = JSON.stringify(rawPayload); }
	catch { throw new Error('数据格式错误，无法保存'); }
	if (Buffer.byteLength(json, 'utf8') > 1000000) throw new Error('数据过大，无法保存');
	return {
		name: name ? SecurityUtils.sanitizeString(String(name), { maxLength: 100 }) : null,
		gender: SecurityUtils.validateGender(gender),
		birthDatetime: date,
		calendarType: calendarType ? SecurityUtils.sanitizeString(String(calendarType), { maxLength: 20 }) : 'solar',
		rawPayload: json,
	};
}

function chartItem(row) {
	return {
		id: row.id, type: 'qimen', title: row.name || '未命名奇门时盘',
		gender: row.gender, birthDatetime: row.birthDatetime, calendarType: row.calendarType,
		rawPayload: row.rawPayload ? safeJsonParse(row.rawPayload) : null, createdAt: row.createdAt,
	};
}

async function saveRecord(req, res, update) {
	const userId = req.user.id;
	const recordId = update ? SecurityUtils.validateId(req.params.id) : null;
	if (update && !recordId) return res.status(400).json({ error: '无效的记录ID' });
	let input;
	try { input = serializeInput(req.body); }
	catch (error) { return res.status(400).json({ error: error.message }); }
	const values = [input.name, input.gender, input.birthDatetime, input.calendarType, input.rawPayload];
	try {
		let id = recordId;
		if (update) {
			const owned = await db.get('SELECT id, user_id FROM qimen_records WHERE id = ? AND user_id = ?', [recordId, userId]);
			if (!owned) return res.status(404).json({ error: '记录不存在或无权访问' });
			const result = await db.run('UPDATE qimen_records SET name = ?, gender = ?, birth_datetime = ?, calendar_type = ?, raw_payload = ? WHERE id = ? AND user_id = ?', [...values, recordId, userId]);
			if (result.changes === 0) return res.status(404).json({ error: '记录不存在或无权访问' });
		} else {
			const result = await db.run('INSERT INTO qimen_records (user_id, name, gender, birth_datetime, calendar_type, raw_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())', [userId, ...values]);
			id = result.lastID;
		}
		return res.json({ id, user_id: userId, name: input.name, gender: input.gender, birthDatetime: input.birthDatetime, calendarType: input.calendarType, updated: update });
	} catch (error) {
		console.error('保存奇门记录失败:', sanitizeErrorForLog(error));
		return res.status(500).json({ error: '保存失败，请稍后重试' });
	}
}

router.post('/', authMiddleware, apiSignatureMiddleware(), (req, res) => saveRecord(req, res, false));
router.put('/:id', authMiddleware, apiSignatureMiddleware(), (req, res) => saveRecord(req, res, true));

router.get('/', authMiddleware, async (req, res) => {
	try {
		const rows = await db.all(`SELECT ${selectFields} FROM qimen_records WHERE user_id = ? ORDER BY created_at DESC`, [req.user.id]);
		return res.json({ list: (rows || []).map(chartItem) });
	} catch (error) {
		console.error('查询奇门记录失败:', sanitizeErrorForLog(error));
		return res.status(500).json({ error: '查询失败' });
	}
});

router.get('/:id', authMiddleware, async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	if (!id) return res.status(400).json({ error: '无效的记录ID' });
	try {
		const row = await db.get(`SELECT ${selectFields} FROM qimen_records WHERE id = ? AND user_id = ?`, [id, req.user.id]);
		if (!row) return res.status(404).json({ error: '记录不存在或无权访问' });
		return res.json(chartItem(row));
	} catch (error) {
		console.error('查询奇门记录失败:', sanitizeErrorForLog(error));
		return res.status(500).json({ error: '查询失败' });
	}
});

router.delete('/:id', authMiddleware, apiSignatureMiddleware(), async (req, res) => {
	const id = SecurityUtils.validateId(req.params.id);
	if (!id) return res.status(400).json({ error: '无效的记录ID' });
	try {
		const result = await db.run('DELETE FROM qimen_records WHERE id = ? AND user_id = ?', [id, req.user.id]);
		if (result.changes === 0) return res.status(404).json({ error: '记录不存在或无权访问' });
		return res.json({ success: true });
	} catch (error) {
		console.error('删除奇门记录失败:', sanitizeErrorForLog(error));
		return res.status(500).json({ error: '删除失败' });
	}
});

module.exports = router;
