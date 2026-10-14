"""Independent, pinned Qimen implementation benchmark; no production modifications.

Run with Python 3.12: benchmark.py prepare|baseline|compare
See README.txt for source acquisition, dependencies, and invocation.
"""
import collections
import datetime as dt
import hashlib
import importlib.metadata
import json
import pathlib
import re
import subprocess
import sys
import time
import traceback

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EXTERNAL = ROOT / '.local-dev/qimen-benchmark/kinqimen'
DEPS = ROOT / '.local-dev/qimen-benchmark/python-deps'
PIN = '127ead87aa24a74d40c893a5351e22a1a89d0945'
sys.path[:0] = [str(DEPS), str(EXTERNAL)]


def read(name):
    return json.loads((HERE / name).read_text(encoding='utf-8'))


def save(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def verify_external():
    head = subprocess.check_output(['git', '-C', str(EXTERNAL), 'rev-parse', 'HEAD'], text=True).strip()
    dirty = subprocess.check_output(['git', '-C', str(EXTERNAL), 'status', '--porcelain', '--untracked-files=no'], text=True).strip()
    if head != PIN or dirty:
        raise RuntimeError(f'Expected unchanged external commit {PIN}; got {head}, dirty={dirty!r}')


def prepare():
    import sxtwl
    verify_external()
    cases = {}

    def add(civil, category, detail=None):
        if civil not in cases:
            cases[civil] = {'id': 'qm-' + civil.replace('-', '').replace(':', '').replace(' ', '-'), 'civil': civil, 'categories': []}
        cases[civil]['categories'].append(category)
        if detail:
            cases[civil].setdefault('notes', []).append(detail)

    # Fixed ordinary grid, selected before inspecting any baseline output.
    for month in range(1, 13):
        for day in [1, 8, 15, 22]:
            for hour in range(0, 24, 2):
                add(f'2026-{month:02}-{day:02} {hour:02}:00', 'ordinary-grid')

    # Independent sxtwl term anchors. Baseline API has minute precision: include
    # the minute containing the event and one minute either side, preserving seconds.
    anchors = []
    day = dt.date(2026, 1, 1)
    while day.year == 2026:
        solar = sxtwl.fromSolar(day.year, day.month, day.day)
        if solar.hasJieQi():
            term = sxtwl.JD2DD(solar.getJieQiJD())
            floor = dt.datetime(term.Y, term.M, term.D, int(term.h), int(term.m))
            anchor = {'sxtwlIndex':solar.getJieQi(), 'civilSecond':f'{floor:%Y-%m-%d %H:%M}:{term.s:09.6f}'}
            anchors.append(anchor)
            for offset in [-1, 0, 1]:
                add(f'{floor + dt.timedelta(minutes=offset):%Y-%m-%d %H:%M}', 'solar-term', {**anchor, 'minuteOffset':offset})
        day += dt.timedelta(days=1)

    for date in ['2023-01-21', '2026-01-31', '2026-02-03', '2026-02-28', '2026-06-05', '2026-06-21', '2026-12-31']:
        day = dt.date.fromisoformat(date)
        for time_string in ['22:59', '23:00', '23:59']:
            add(f'{day} {time_string}', 'late-zi')
        add(f'{day + dt.timedelta(days=1)} 00:00', 'late-zi')

    for year in [1900, 1984, 2000, 2024, 2099]:
        for month in [1, 7]:
            for hour in [0, 12, 23]:
                add(f'{year}-{month:02}-15 {hour:02}:00', 'range-sample')
    for civil in ['2024-02-28 23:00', '2024-02-29 12:00', '2024-02-29 23:00', '2024-03-01 00:00']:
        add(civil, 'leap-day')
    save('inputs.json', list(cases.values()))
    save('solar-term-anchors.json', anchors)
    print(json.dumps({'cases':len(cases), 'categoryCounts':dict(collections.Counter(c for x in cases.values() for c in x['categories']))}))


def baseline():
    import kinqimen
    verify_external()
    rows = []
    started = time.monotonic()
    for i, c in enumerate(read('inputs.json')):
        t = dt.datetime.strptime(c['civil'], '%Y-%m-%d %H:%M')
        try:
            raw = kinqimen.Qimen(t.year, t.month, t.day, t.hour, t.minute).pan(1)
            rows.append({'id':c['id'], 'raw':raw})
        except Exception as exc:
            rows.append({'id':c['id'], 'error':type(exc).__name__ + ': ' + str(exc), 'traceback':traceback.format_exc()})
        if (i + 1) % 100 == 0:
            print(json.dumps({'done':i+1, 'seconds':round(time.monotonic()-started, 2)}), flush=True)
    save('external-output.json', {'sourceCommit':PIN, 'entrypoint':'kinqimen.Qimen(y,m,d,h,m).pan(1)', 'rows':rows})
    print(json.dumps({'externalCases':len(rows), 'errors':sum('error' in x for x in rows), 'seconds':round(time.monotonic()-started,2)}))


GONG = dict(zip('坎坤震巽中乾兌艮離', '123456789'))
TRAD = str.maketrans('陽陰遁滿種穀驚蟄處傷開沖輔兌離門', '阳阴遁满种谷惊蛰处伤开冲辅兑离门')
STAR = {'蓬':'天蓬','任':'天任','沖':'天冲','輔':'天辅','英':'天英','禽':'禽芮','芮':'禽芮','柱':'天柱','心':'天心'}
GOD = {'符':'值符','蛇':'腾蛇','陰':'太阴','合':'六合','勾':'勾陈','雀':'朱雀','虎':'白虎','玄':'玄武','地':'九地','天':'九天'}
NUM = dict(zip('一二三四五六七八九', '123456789'))


def normalize_external(raw):
    # Only representation normalization. Do not alias 勾陈/朱雀 to 白虎/玄武.
    # 外盘禽 denotes the carried 芮/禽 pair; middle raw palace5 is never fabricated.
    pillars = re.fullmatch(r'(..)年(..)月(..)日(..)時', raw['干支']).groups()
    ju = raw['排局']
    chiefs = raw['值符值使']
    def plate(key, mapper=lambda x:x, outer=False):
        value = raw[key]
        if not isinstance(value, dict):
            return {'__unexpected_raw_type__':value}
        return {GONG[g]:mapper(x) for g,x in value.items() if not outer or g != '中'}
    def lodge(g):
        return '2' if g == '中' else GONG[g]
    return {
        'siZhu':dict(zip(['year','month','day','time'],pillars)),
        'juShu':{'type':'yang' if ju[0]=='陽' else 'yin', 'number':NUM[ju[2]], 'yuan':ju[-1]+'元', 'jieQiName':raw['節氣'].translate(TRAD)},
        'xunShou':chiefs['值符天干'][1],
        'diPan':plate('地盤'), 'tianPanOuter':plate('天盤', outer=True),
        'jiuXing':plate('星', lambda x:STAR.get(x,x), True),
        'baMen':plate('門',lambda x:x.translate(TRAD)+'门',True),
        'baShen':plate('神',lambda x:GOD.get(x,x),True),
        'zhiFuGong':lodge(chiefs['值符星宮'][1]),
        'zhiFuXing':STAR.get(chiefs['值符星宮'][0]),
        'zhiShiGong':lodge(chiefs['值使門宮'][1]),
        'zhiShiMen':chiefs['值使門宮'][0].translate(TRAD)+'门',
    }


def normalize_product(raw):
    outer = lambda plate:{k:v for k,v in plate.items() if k!='5'}
    return {
        'siZhu':{k:raw['siZhu'][k] for k in ['year','month','day','time']},
        'juShu':{k:raw['juShu'][k] for k in ['type','number','yuan','jieQiName']},
        'xunShou':raw['xunShou'], 'diPan':raw['diPan'], 'tianPanOuter':outer(raw['tianPan']),
        'jiuXing':outer(raw['jiuXing']), 'baMen':outer(raw['baMen']), 'baShen':outer(raw['baShen']),
        'zhiFuGong':raw['zhiFuGong'],
        'zhiFuXing':'禽芮' if raw['zhiFuXing'] in ['天芮','天禽'] else raw['zhiFuXing'],
        'zhiShiGong':raw['zhiShiGong'], 'zhiShiMen':raw['zhiShiMen'],
    }


def compare():
    inputs = read('inputs.json')
    product = {x['id']:x for x in read('product-output.json')['rows']}
    external = {x['id']:x for x in read('external-output.json')['rows']}
    stats = collections.defaultdict(collections.Counter)
    comparisons = []
    fields = collections.defaultdict(collections.Counter)
    core = ['siZhu','juShu','xunShou','diPan','zhiFuGong','zhiShiGong','zhiShiMen']
    for c in inputs:
        a,b = product[c['id']], external[c['id']]
        categories = ['all'] + c['categories']
        if 'raw' in a:
            if a['raw']['diPan']['5'] == a['raw']['xunShou']: categories.append('center-five-xunshou')
            if a['raw']['diPan']['5'] == a['raw']['siZhu']['time'][0]: categories.append('center-five-hour-stem')
            categories.append(a['raw']['juShu']['type'])
        row = {'id':c['id'], 'civil':c['civil'], 'categories':categories}
        for group in categories: stats[group]['total'] += 1
        if 'error' in a or 'error' in b:
            row['status'] = 'execution-error'
            row['productError'] = a.get('error')
            row['externalError'] = b.get('error')
            for group in categories: stats[group]['executionErrors'] += 1
        else:
            na,nb = normalize_product(a['raw']), normalize_external(b['raw'])
            delta = {k:{'product':na[k],'external':nb[k]} for k in na if na[k]!=nb[k]}
            row.update(status='different' if delta else 'equal', differences=delta, productNormalized=na, externalNormalized=nb)
            corematch = not any(k in delta for k in core)
            no_gods_match = not any(k!='baShen' for k in delta)
            for group in categories:
                stats[group]['compared'] += 1
                stats[group]['equalAllFields'] += not delta
                stats[group]['equalCoreFields'] += corematch
                stats[group]['equalExcludingGodPlate'] += no_gods_match
                for field in na:
                    fields[group][field+'__equal'] += field not in delta
                    fields[group][field+'__different'] += field in delta
        comparisons.append(row)
    save('comparison.json', comparisons)
    # An independent astronomical boundary check uses sxtwl seconds directly,
    # bypassing kinqimen's intentional/accidental minute truncation.
    term_names = ['冬至','小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪']
    term_checks = []
    for c in inputs:
        if 'solar-term' not in c['categories']:
            continue
        anchor = c['notes'][0]
        index = anchor['sxtwlIndex']
        t = dt.datetime.strptime(c['civil'], '%Y-%m-%d %H:%M')
        instant = dt.datetime.strptime(anchor['civilSecond'], '%Y-%m-%d %H:%M:%S.%f')
        expected = term_names[index if t >= instant else (index-1)%24]
        actual = product[c['id']]['raw']['juShu']['jieQiName']
        term_checks.append({'id':c['id'],'civil':c['civil'],'sxtwlAnchor':anchor['civilSecond'],'expectedTerm':expected,'productTerm':actual,'equal':actual==expected})
    save('independent-solar-term-check.json', term_checks)
    isolated_sky = [x for x in comparisons if x.get('differences',{}).get('tianPanOuter') and not any(k in x['differences'] for k in core)]
    year_deltas = [x for x in comparisons if x.get('differences',{}).get('siZhu') and x['productNormalized']['siZhu']['year']!=x['externalNormalized']['siZhu']['year']]
    term_deltas = [x for x in comparisons if 'juShu' in x.get('differences',{})]
    save('diagnostic-cases.json', {
        'skyDifferencesWithCoreAgreement':isolated_sky,
        'yearPillarDifferences':year_deltas,
        'termJuDifferences':[{'id':x['id'],'civil':x['civil'],'juShu':x['differences']['juShu']} for x in term_deltas],
        'attributionCaution':'A baseline mismatch is not by itself a product defect. No baseline algorithm was patched to improve the match rate.'})
    summary = {'caseCount':len(inputs),'coreFields':core,'groupCounts':dict(stats),'fieldCounts':dict(fields),
               'independentSxtwlTermChecks':{'total':len(term_checks),'equal':sum(x['equal'] for x in term_checks)},
               'productJuCodes':sorted({x['raw']['juShu']['formatCode'] for x in product.values() if 'raw' in x}),
               'notice':'Cross-implementation agreement is not historical or predictive validity; differences are not automatically product defects.'}
    save('summary.json', summary)
    sourcefiles = [EXTERNAL/name for name in ['kinqimen.py','config.py','jieqi.py','angan.py','requirements.txt','README.md']]
    sourcefiles += list((ROOT/'frontend-docker/vendor/qfdk-qimen').rglob('*.js'))
    sourcefiles += [ROOT/'frontend-docker/src/utils/qimenCalculation.ts', ROOT/'frontend-docker/src/utils/chartTime.ts']
    sourcefiles += [ROOT/'frontend-docker/node_modules/lunar-javascript/lunar.js', ROOT/'frontend-docker/node_modules/lunar-javascript/package.json']
    provenance = {'capturedAtUTC':dt.datetime.now(dt.timezone.utc).isoformat(), 'externalRepository':'https://github.com/kentang2017/kinqimen',
                  'externalCommit':PIN, 'externalSourceUnmodified':True, 'externalPrecision':'civil minute, UTC+8 implicit',
                  'independence':'Separately maintained Qimen implementations and different calendar packages; sxtwl and lunar-javascript have shared ShouXing astronomical algorithm lineage. Not a wholly independent astronomical oracle.',
                  'pythonVersion':sys.version,'dependencies':{x:importlib.metadata.version(x) for x in ['sxtwl','ephem','bidict']},
                  'sha256':{str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sourcefiles},
                  'inputSha256':hashlib.sha256((HERE/'inputs.json').read_bytes()).hexdigest()}
    verify_external()
    save('provenance.json', provenance)
    print(json.dumps(summary,ensure_ascii=False,indent=2))


def third_compare():
    thirdroot = ROOT/'.local-dev/qimen-benchmark/atopx-qimen'
    pin = '8eb06d007d4a5fcc5352d9054f81469e5f023f45'
    actual = subprocess.check_output(['git','-C',str(thirdroot),'rev-parse','HEAD'],text=True).strip()
    dirty = subprocess.check_output(['git','-C',str(thirdroot),'status','--porcelain','--untracked-files=no'],text=True).strip()
    if actual != pin or dirty:
        raise RuntimeError('Third-party source pin or cleanliness verification failed')
    product = {x['id']:x for x in read('product-output.json')['rows']}
    third = {x['id']:x for x in read('third-output.json')['rows']}
    group_counts = collections.defaultdict(collections.Counter)
    field_counts = collections.defaultdict(collections.Counter)
    rows = []
    for c in read('inputs.json'):
        a,b = normalize_product(product[c['id']]['raw']),normalize_product(third[c['id']]['raw'])
        # Go enums emit 上/中/下 and 休/生/... without their display suffixes.
        b['juShu']['yuan'] += '元'
        b['baMen'] = {k:v+'门' for k,v in b['baMen'].items()}
        b['zhiShiMen'] += '门'
        delta = {k:{'product':a[k],'third':b[k]} for k in a if a[k]!=b[k]}
        categories=['all']+c['categories']+[a['juShu']['type']]
        if a['diPan']['5']==a['xunShou']: categories.append('center-five-xunshou')
        if a['diPan']['5']==a['siZhu']['time'][0]: categories.append('center-five-hour-stem')
        for g in categories:
            group_counts[g]['total']+=1
            group_counts[g]['equalAllFields']+=not delta
            for k in a:
                field_counts[g][k+'__equal']+=k not in delta
                field_counts[g][k+'__different']+=k in delta
        rows.append({'id':c['id'],'civil':c['civil'],'categories':categories,'differences':delta,'productNormalized':a,'thirdNormalized':b})
    save('third-comparison.json',rows)
    summary={'source':'https://github.com/atopx/qimen','commit':pin,'caseCount':len(rows),'groupCounts':dict(group_counts),'fieldCounts':dict(field_counts),
             'sourceUnmodified':True,'scope':'12 normalized output fields; no interpretation or hidden-stem comparison',
             'independence':'Separately maintained Go Qimen library; astronomical tables also derive from ShouXing. Source is corroboration, not unquestioned authority.',
             'sourceSha256':{str(p.relative_to(thirdroot)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in thirdroot.rglob('*.go')}}
    save('third-summary.json',summary)
    print(json.dumps({'groupCounts':dict(group_counts),'fieldCounts':dict(field_counts)['all']},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    {'prepare':prepare,'baseline':baseline,'compare':compare,'third-compare':third_compare}[sys.argv[1]]()
