"""2026 solar terms from geocentric apparent Sun/JPL DE440s, independent of ShouXing."""
import datetime as dt
import hashlib
import importlib.metadata
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
LOCAL = ROOT / '.local-dev/qimen-astronomy'
sys.path.insert(0, str(LOCAL/'python-deps'))
from skyfield.api import Loader, load_file
from skyfield import almanac, almanac_east_asia
from skyfield.constants import tau


def save(name, obj):
    (HERE/name).write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


loader=Loader(str(LOCAL), verbose=False)
ts=loader.timescale(builtin=True)
eph=load_file(str(LOCAL/'de440s.bsp'))
t0,t1=ts.utc(2026,1,1),ts.utc(2027,1,1)
terms=almanac_east_asia.solar_terms(eph)
times,indices=almanac.find_discrete(t0,t1,terms,epsilon=1e-8)

# Independently invoke full default nutation instead of solar_terms()'s faster
# IAU2000B path, retaining the same JPL ephemeris and coordinate definition.
def full_nutation_term(t):
    _,longitude,_=eph['earth'].at(t).observe(eph['sun']).apparent().ecliptic_latlon('date')
    return (longitude.radians//(tau/24)%24).astype(int)
full_nutation_term.step_days=14.0
full_times,full_indices=almanac.find_discrete(t0,t1,full_nutation_term,epsilon=1e-8)
assert len(times)==len(full_times)==24
assert (indices==full_indices).all()
calendar=json.loads((HERE.parent/'qimen/calendar-term-differences.json').read_text(encoding='utf-8'))
existing={x['term']:x for x in calendar['rows']}
rows=[]
zone=dt.timezone(dt.timedelta(hours=8))
for time,full,index in zip(times,full_times,indices):
    term=almanac_east_asia.SOLAR_TERMS_ZHS[index]
    utc=full.utc_datetime()
    civil=utc.astimezone(zone)
    first=existing[term]
    lunar=dt.datetime.strptime(first['lunarJavascript'],'%Y-%m-%d %H:%M:%S').replace(tzinfo=zone)
    sxtwl=dt.datetime.strptime(first['civilSecond'],'%Y-%m-%d %H:%M:%S.%f').replace(tzinfo=zone)
    _,longitude,_=eph['earth'].at(full).observe(eph['sun']).apparent().ecliptic_latlon('date')
    residual=((float(longitude.degrees)-int(index)*15+180)%360-180)*3600
    row={'term':term,'longitudeDegrees':int(index)*15,'utc':utc.isoformat(timespec='microseconds'),
         'beijing':civil.isoformat(timespec='microseconds'),'jdTT':float(full.tt),'jdTDB':float(full.tdb),
         'deltaTSkyfield':float(full.delta_t),'dut1Skyfield':float(full.dut1),
         'ttMinusUtcSeconds':69.184,'taiMinusUtcSeconds':37,
         'rootResidualArcseconds':residual,'iau2000BMinusFullSeconds':float(time-full)*86400,
         'lunarJavascript':first['lunarJavascript'],'sxtwl':first['civilSecond'],
         'lunarMinusJplSeconds':(lunar-civil).total_seconds(),'sxtwlMinusJplSeconds':(sxtwl-civil).total_seconds(),
         'nearestMinuteBeijing':(civil+dt.timedelta(seconds=30)).strftime('%Y-%m-%d %H:%M')}
    rows.append(row)
provenance={'ephemeris':'NASA JPL DE440s','ephemerisUrl':'https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de440s.bsp',
            'ephemerisSha256':hashlib.sha256((LOCAL/'de440s.bsp').read_bytes()).hexdigest(),
            'definition':'Earth geocenter observes apparent Sun, light-time/aberration/deflection applied, true ecliptic and equinox of date, longitude multiple of 15 degrees.',
            'timeScale':'Search TT/TDB; output UTC via leap seconds. TT-UTC=69.184 s throughout 2026, IERS Bulletin C72.',
            'leapSecondAuthority':'https://hpiers.obspm.fr/iers/bul/bulc/bulletinc.72',
            'packages':{name:importlib.metadata.version(name) for name in ['skyfield','jplephem','numpy','sgp4','certifi']},
            'python':sys.version,'requestedRootBracketSeconds':86400e-8,
            'accuracyCaution':'Search precision is not absolute ephemeris/model accuracy. Full-vs-2000B is a sensitivity check, not an independent ephemeris.'}
save('jpl-de440s-2026.json',{'provenance':provenance,'rows':rows})
all_year_rows=[]
for year in [1900,1950,2000,2026,2050,2099]:
    year_times,year_indices=almanac.find_discrete(ts.utc(year,1,1),ts.utc(year+1,1,1),full_nutation_term,epsilon=1e-8)
    assert len(year_times)==24
    for instant,index in zip(year_times,year_indices):
        ut1=dt.datetime(2000,1,1,12,tzinfo=dt.timezone.utc)+dt.timedelta(days=float(instant.ut1)-2451545)
        # Skyfield assumes pre-1972 UTC and no future leap seconds. Such UTC
        # values are model scenarios, not historical facts or future promises.
        utc=instant.utc_datetime()
        tt_minus_utc=32.184+float(instant._leap_seconds())
        all_year_rows.append({'year':year,'term':almanac_east_asia.SOLAR_TERMS_ZHS[index],
                             'jdTT':float(instant.tt),'jdUT1':float(instant.ut1),'jdTDB':float(instant.tdb),
                             'utcOrAssumedUtc':utc.isoformat(timespec='microseconds'),
                             'beijingUtcOrAssumedUtc':utc.astimezone(zone).isoformat(timespec='microseconds'),
                             'ut1PlusEight':ut1.astimezone(zone).isoformat(timespec='microseconds'),
                             'skyfieldDeltaT':float(instant.delta_t),'ttMinusUtcSeconds':tt_minus_utc,
                             'utcStatus':'not-defined-in-this-era' if year<1960 else ('known-leap-seconds' if year<=2026 else 'assumes-no-future-leap-seconds'),
                             'ut1Status':'historical-deltaT-model' if year<1972 else ('IERS-or-model' if year<=2026 else 'future-deltaT-prediction')})
save('jpl-de440s-year-samples.json',{'provenance':provenance,'rows':all_year_rows})
print(json.dumps({'terms':len(rows),'lunarErrorRangeSeconds':[min(x['lunarMinusJplSeconds'] for x in rows),max(x['lunarMinusJplSeconds'] for x in rows)],
                  'sxtwlErrorRangeSeconds':[min(x['sxtwlMinusJplSeconds'] for x in rows),max(x['sxtwlMinusJplSeconds'] for x in rows)],
                  'maxNutationSensitivitySeconds':max(abs(x['iau2000BMinusFullSeconds']) for x in rows)},ensure_ascii=False,indent=2))
