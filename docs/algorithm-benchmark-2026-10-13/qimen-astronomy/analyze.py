import collections
import datetime as dt
import hashlib
import json
import pathlib
import xml.etree.ElementTree as ET

HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def read(name):return json.loads((HERE/name).read_text(encoding='utf-8'))
def save(name,data):(HERE/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
zone=dt.timezone(dt.timedelta(hours=8))
rows=read('jpl-de440s-2026.json')['rows']
clock=read('time-scale-comparison.json')['rows']
clock2026={r['term']:r for r in clock if r['year']==2026}

# Exact polynomial copied as a diagnostic from the fixed sxtwl 2.0.6 source
# eph.cpp:124-138. It is not patched into or used to rerun the baseline engine.
def sxtwl_old_delta_t(year):
    extension=lambda y:-20+31*((y-1820)/100)**2
    return extension(year)-(extension(2015)-69)*(2115-year)/100

for r in rows:
    decimal_year=(r['jdTT']-2451545)/365.2425+2000
    old=sxtwl_old_delta_t(decimal_year)
    clock_r=clock2026[r['term']]
    r['sxtwlOldDeltaTSeconds']=old
    r['productDeltaTSeconds']=clock_r['productDeltaTSeconds']
    r['deltaTModelDifferenceSeconds']=old-clock_r['productDeltaTSeconds']
    r['sxtwlAfterOnlyTTtoUtcCorrectionErrorSeconds']=r['sxtwlMinusJplSeconds']+old-r['ttMinusUtcSeconds']
    r['productAstronomyTTErrorSeconds']=clock_r['productAstronomyTTErrorSeconds']
save('delta-t-diagnosis.json',{'source':'sxtwl-2.0.6/src/eph.cpp:100-153; product ShouXingUtil.dtT; JPL+IERS TT-UTC',
                            'counterfactual':'Only reverse the old sxtwl DeltaT subtraction and subtract the known 2026 TT-UTC=69.184 seconds. No astronomical model or baseline outputs modified.',
                            'rows':rows})

hko=[]
for i,node in enumerate(ET.parse(HERE/'hko-24SolarTerms-2026.xml').getroot().findall('Data')):
    official=f"2026-{node.findtext('M')}-{node.findtext('D')} {node.findtext('hm')}"
    row=rows[i]
    assert row['beijing'][:10]==official[:10]
    lunar=dt.datetime.strptime(row['lunarJavascript'],'%Y-%m-%d %H:%M:%S')
    sxtwl=dt.datetime.strptime(row['sxtwl'],'%Y-%m-%d %H:%M:%S.%f')
    round_minute=lambda t:(t+dt.timedelta(seconds=30)).strftime('%Y-%m-%d %H:%M')
    hko.append({'term':row['term'],'hkoMinute':official,'jplRoundedMinute':row['nearestMinuteBeijing'],
                'lunarRoundedMinute':round_minute(lunar),'sxtwlRoundedMinute':round_minute(sxtwl),
                'jplEqual':row['nearestMinuteBeijing']==official,'lunarEqual':round_minute(lunar)==official,'sxtwlEqual':round_minute(sxtwl)==official})
save('hko-minute-comparison.json',{'source':'https://www.hko.gov.hk/en/gts/astronomy/data/files/24SolarTerms_2026.xml',
                                 'precision':'Official table only supports nearest-minute comparison; it is not a second-resolution oracle.', 'rows':hko})
def extent(values):return {'min':min(values),'max':max(values),'maxAbs':max(abs(x) for x in values)}
byyear={}
for year in sorted({r['year'] for r in clock}):
    group=[r for r in clock if r['year']==year]
    byyear[year]={'terms':len(group),'utcStatus':group[0]['utcStatus'],'ut1Status':group[0]['ut1Status'],
      'TTastronomyResidualSeconds':extent([r['productAstronomyTTErrorSeconds'] for r in group]),
      'UT1modelResidualSeconds':extent([r['productVsUt1ModelSeconds'] for r in group]),
      'UTC_or_scenario_roundedResidualSeconds':extent([r['productVsUtcOrAssumedUtcRoundedSeconds'] for r in group]),
      'productDeltaTRangeSeconds':extent([r['productDeltaTSeconds'] for r in group]),
      'skyfieldDeltaTRangeSeconds':extent([r['skyfieldDeltaT'] for r in group])}
summary={'jplTerms2026':24,'product2026UtcErrorSeconds':extent([r['lunarMinusJplSeconds'] for r in rows]),
         'sxtwl2026UtcErrorSeconds':extent([r['sxtwlMinusJplSeconds'] for r in rows]),
         'sxtwlAfterOnlyTimeScaleCorrectionSeconds':extent([r['sxtwlAfterOnlyTTtoUtcCorrectionErrorSeconds'] for r in rows]),
         'sxtwlOldDeltaTRangeSeconds':extent([r['sxtwlOldDeltaTSeconds'] for r in rows]),
         'hkoMinuteAgreement':{key:sum(r[key+'Equal'] for r in hko) for key in ['jpl','lunar','sxtwl']},
         'boundaryFixtures':{'total':len(read('jpl-boundary-fixtures.json')['rows']),'equal':sum(r['equal'] for r in read('jpl-boundary-fixtures.json')['rows'])},
         'sampledYearResults':byyear,
         'recommendation2026':'Do not shift production terms by -17 seconds. Independent JPL confirms product within 2 seconds for all 2026 terms; regression guard band 3 seconds. Correct the old baseline attribution.',
         'scopeCaution':'2-second observed 2026 agreement is not a global 1900-2099 guarantee. Future UTC and pre-1960 UTC are not known quantities.'}
save('summary.json',summary)
print(json.dumps(summary,ensure_ascii=False,indent=2))
