"""Independent calendar bridge; never imports product calendar libraries."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / '.local-dev/qimen-benchmark/python-deps'))
import sxtwl

request = json.load(sys.stdin)
args = request['args']
if request['op'] == 'monthDays':
    print(json.dumps(sxtwl.getLunarMonthNum(*args)))
else:
    day = sxtwl.fromSolar(*args) if request['op'] == 'solar' else sxtwl.fromLunar(*args)
    year = day.getLunarYear(True)
    month_gz, day_gz = day.getMonthGZ(), day.getDayGZ()
    print(json.dumps({
        'solarYear': day.getSolarYear(), 'solarMonth': day.getSolarMonth(), 'solarDay': day.getSolarDay(),
        'lunarYear': year, 'lunarMonth': day.getLunarMonth(), 'lunarDay': day.getLunarDay(),
        'isLeapMonth': day.isLunarLeap(), 'yearStem': (year - 4) % 10, 'yearBranch': (year - 4) % 12,
        'monthStem': month_gz.tg, 'monthBranch': month_gz.dz, 'dayStem': day_gz.tg, 'dayBranch': day_gz.dz,
    }))
