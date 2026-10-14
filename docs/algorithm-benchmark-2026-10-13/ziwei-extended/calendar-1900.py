"""Independent astronomical calendar for Fortel's pre-1900-01-31 gap."""
import sys, json
from pathlib import Path
here = Path(__file__).resolve().parent
sys.path.insert(0, str(here.parents[2] / '.local-dev/qimen-benchmark/python-deps'))
import sxtwl
result = {}
for date in ['1900-01-01', '1900-01-02', '1900-01-30']:
    d = sxtwl.fromSolar(*map(int, date.split('-')))
    result[date] = dict(lunarYear=d.getLunarYear(False), lunarMonth=d.getLunarMonth(),
        lunarDay=d.getLunarDay(), isLeap=d.isLunarLeap(), monthSky=d.getMonthGZ().tg,
        monthGround=d.getMonthGZ().dz, daySky=d.getDayGZ().tg, dayGround=d.getDayGZ().dz)
(here / 'calendar-1900.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
print(json.dumps({'engine':'sxtwl 2.0.6','results':result},ensure_ascii=False,indent=2))
