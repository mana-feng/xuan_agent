/** Analytics dates are business-zone labels; stored DATETIME values are UTC. */
function getAnalyticsTimeZone() {
	return String(process.env.ANALYTICS_TIMEZONE || 'Asia/Shanghai').trim() || 'Asia/Shanghai';
}

function zonedParts(value) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) throw new RangeError('Invalid analytics date');
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: getAnalyticsTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
	}).formatToParts(date);
	return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}

function getAnalyticsParts(date) {
	const p = zonedParts(date);
	const label = `${p.year}-${p.month}-${p.day}`;
	return { date: label, hour: Number(p.hour), dayOfWeek: new Date(`${label}T00:00:00Z`).getUTCDay() };
}

function shiftDate(label, days) {
	const date = new Date(`${label}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function midnightUtc(label) {
	const target = Date.parse(`${label}T00:00:00Z`);
	let guess = target;
	// Offset comes from each candidate's zone, so 23/25 hour DST days work.
	for (let i = 0; i < 6; i++) {
		const p = zonedParts(new Date(guess));
		const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
		const next = guess + target - local;
		if (next === guess) return new Date(guess);
		guess = next;
	}
	throw new RangeError(`Cannot resolve analytics midnight ${label}`);
}

function getAnalyticsWindow(now = new Date(), days = 7) {
	const count = Number(days);
	if (!Number.isInteger(count) || count < 1 || count > 3660) throw new RangeError('Invalid analytics day count');
	const today = getAnalyticsParts(now).date;
	const yesterday = shiftDate(today, -1);
	const startDate = shiftDate(today, 1 - count);
	const endExclusiveDate = shiftDate(today, 1);
	return { today, yesterday, startDate, endExclusiveDate, startUtc: midnightUtc(startDate), endUtc: midnightUtc(endExclusiveDate) };
}

module.exports = { getAnalyticsTimeZone, getAnalyticsParts, getAnalyticsWindow };
