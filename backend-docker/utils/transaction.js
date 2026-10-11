/** Run related authentication writes on one MySQL connection. */
async function withTransaction(db, callback) {
	const connection = await db.pool.getConnection();
	try {
		await connection.beginTransaction();
		const transaction = {
			async get(sql, params) {
				const [rows] = await connection.execute(sql, params || []);
				return rows[0] || null;
			},
			async run(sql, params) {
				const [result] = await connection.execute(sql, params || []);
				return { lastID: result.insertId, changes: result.affectedRows };
			},
		};
		const result = await callback(transaction);
		await connection.commit();
		return result;
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

module.exports = { withTransaction };
