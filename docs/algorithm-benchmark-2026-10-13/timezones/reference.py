"""Independent Python zoneinfo oracle for the UI's ten zones plus offset edge cases."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
import hashlib, json, sys, tzdata

DEST = Path(__file__).resolve().parent
ZONES = ['Asia/Shanghai', 'Asia/Singapore', 'Asia/Taipei', 'Asia/Hong_Kong',
         'Asia/Tokyo', 'America/New_York', 'America/Los_Angeles', 'Europe/London',
         'Australia/Sydney', 'UTC', 'Australia/Lord_Howe', 'Asia/Kathmandu', 'Pacific/Apia']
UTC = timezone.utc
start = datetime(1900, 1, 1, tzinfo=UTC)
stop = datetime(2100, 1, 1, tzinfo=UTC)
rows = {}
transitions = []

def add(local, zone, category):
    if not 1900 <= local.year <= 2099: return
    local = local.replace(tzinfo=None, microsecond=0)
    civil = local.strftime('%Y-%m-%d %H:%M:%S')
    key = zone.key + '/' + civil
    if key in rows:
        if category not in rows[key]['categories']: rows[key]['categories'].append(category)
        return
    candidates = set()
    for fold in (0, 1):
        instant = local.replace(tzinfo=zone, fold=fold).astimezone(UTC)
        if instant.astimezone(zone).replace(tzinfo=None) == local:
            candidates.add(round(instant.timestamp() * 1000))
    rows[key] = dict(id=key, civil=civil, timeZone=zone.key,
                     candidates=sorted(candidates), categories=[category])

for name in ZONES:
    zone = ZoneInfo(name)
    for year in range(1900, 2100):
        for month in (1, 4, 7, 10): add(datetime(year, month, 1, 12, 34, 56), zone, 'quarter-year')
    cursor = start
    offset = cursor.astimezone(zone).utcoffset()
    while cursor < stop:
        following = min(cursor + timedelta(days=1), stop)
        next_offset = following.astimezone(zone).utcoffset()
        if next_offset != offset:
            lo, hi = int(cursor.timestamp()), int(following.timestamp())
            while hi - lo > 1:
                mid = (lo + hi) // 2
                if (datetime(1970, 1, 1, tzinfo=UTC) + timedelta(seconds=mid)).astimezone(zone).utcoffset() == offset: lo = mid
                else: hi = mid
            instant = datetime(1970, 1, 1, tzinfo=UTC) + timedelta(seconds=hi)
            before = (instant - timedelta(seconds=1)).astimezone(zone).replace(tzinfo=None)
            after = instant.astimezone(zone).replace(tzinfo=None)
            transitions.append(dict(timeZone=name, utc=instant.isoformat(), before=before.isoformat(), after=after.isoformat()))
            for local in (before, after):
                for seconds in (-1, 0, 1, -1800, 1800): add(local + timedelta(seconds=seconds), zone, 'transition-edge')
            add(min(before, after) + abs(after-before)/2, zone, 'transition-middle')
        offset = next_offset
        cursor = following
    print(name, len(rows), flush=True)

# Whole-day gaps and unusual folds are retained by the same oracle, not hard-coded expected UTCs.
for value, zone in [('2011-12-30 12:00:00','Pacific/Apia'), ('2024-04-07 01:45:00','Australia/Lord_Howe'),
                    ('2024-10-06 02:15:00','Australia/Lord_Howe'), ('1991-09-15 01:30:00','Asia/Shanghai')]:
    add(datetime.fromisoformat(value), ZoneInfo(zone), 'named-regression')
ordered = list(rows.values())
(DEST/'inputs.json').write_text(json.dumps(ordered, ensure_ascii=False, indent=2), encoding='utf-8')
(DEST/'transitions.json').write_text(json.dumps(transitions, ensure_ascii=False, indent=2), encoding='utf-8')
meta = dict(implementation='Python zoneinfo (independent conversion implementation; common IANA authority)',
            python=sys.version, tzdata=tzdata.__version__, ianaVersion=tzdata.IANA_VERSION,
            zones=ZONES, fromYear=1900, toYear=2099, transitions=len(transitions), cases=len(ordered),
            unique=sum(len(r['candidates'])==1 for r in ordered), gaps=sum(not r['candidates'] for r in ordered),
            folds=sum(len(r['candidates'])==2 for r in ordered), source='https://docs.python.org/3/library/zoneinfo.html',
            inputSha256=hashlib.sha256((DEST/'inputs.json').read_bytes()).hexdigest())
(DEST/'reference.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(meta, ensure_ascii=False))
