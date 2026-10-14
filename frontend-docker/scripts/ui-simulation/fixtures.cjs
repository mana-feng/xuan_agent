// Synthetic, deterministic records. Real chart engines reconstruct every chart in the browser.
const TYPES = ['bazi', 'ziwei', 'liuyao', 'qimen'];
const DEMO_USER = { id: 1, username: '本地演示用户', email: 'demo@example.test', role: 'user' };
const DEMO_PASSWORD = 'Demo123!';
const VERIFICATION_CODE = '123456';

function createRecords() {
  return Object.fromEntries(TYPES.map(type => [type, Array.from({ length: 14 }, (_, index) => {
    const id = index + 1;
    const gender = type === 'qimen' ? null : String(index % 2);
    const title = `【模拟】${{ bazi: '八字', ziwei: '紫微', liuyao: '事件占问', qimen: '奇门时盘' }[type]} ${String(id).padStart(2, '0')}`;
    const birthDatetime = type === 'liuyao' || type === 'qimen'
      ? `2026-10-${String(id).padStart(2, '0')}T01:30:00.000Z`
      : `${1990 + index}-03-21T10:30:00.000Z`;
    const timestamp = new Date(birthDatetime).getTime();
    const rawPayload = type === 'qimen'
      ? { module: 'qimen', version: 1, input: { question: title, timestamp, timeZone: 'Asia/Shanghai', recordId: id, ruleVersion: 'qimen-chai-bu-v1' } }
      : type === 'liuyao'
      ? {
        lite: true, params: [1, 0, 3, 0, 1, 4],
        options: { title, gender: gender === '0' ? '男' : '女', date: birthDatetime },
        profile: { title, gender: gender === '0' ? '男' : '女', method: '手工起卦', timeLabel: `2026-10-${String(id).padStart(2, '0')} 09:30` },
        ts: timestamp,
      }
      : { lite: true, module: type, user: { realname: title, gender: Number(gender), timestamp } };
    return { id, type, title, gender, birthDatetime, calendarType: 'solar', rawPayload, createdAt: `2026-10-${String(id).padStart(2, '0')}T02:00:00.000Z`, updatedAt: `2026-10-${String(id).padStart(2, '0')}T02:00:00.000Z` };
  })]));
}

function createState() {
  return {
    scenario: 'success', delayMs: 1800, agentAction: 'auto', remainingCount: 30,
    records: createRecords(), nextIds: Object.fromEntries(TYPES.map(type => [type, 101])),
    accounts: new Map([[DEMO_USER.email, { ...DEMO_USER, password: DEMO_PASSWORD }]]),
    codes: new Set(), accessTokens: new Map(), refreshTokens: new Map(), requests: [], chatRequests: [],
  };
}

module.exports = { TYPES, DEMO_USER, DEMO_PASSWORD, VERIFICATION_CODE, createState };
