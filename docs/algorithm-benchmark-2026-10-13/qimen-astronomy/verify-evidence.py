"""Validate saved results and pin files actually used by this benchmark."""
import datetime as dt
import hashlib
import json
import pathlib
import subprocess

HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[2]
BASE=HERE.parent/'qimen'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def save(name,obj):(HERE/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def git(path,*args):return subprocess.check_output(['git','-C',str(path),*args],text=True).strip()

summary=read(HERE/'summary.json')
terms=read(HERE/'jpl-de440s-2026.json')
year_rows=read(HERE/'jpl-de440s-year-samples.json')['rows']
fixtures=read(HERE/'jpl-boundary-fixtures.json')['rows']
extras=read(HERE/'ui-extra-comparison.json')
hidden=read(HERE/'hidden-stem-rule-comparison.json')
checks={
    '24_unique_2026_terms':len(terms['rows'])==len({r['term'] for r in terms['rows']})==24,
    '144_unique_year_term_roots':len(year_rows)==len({(r['year'],r['term']) for r in year_rows})==144,
    '2026_product_utc_within_observed_2_seconds':max(abs(r['lunarMinusJplSeconds']) for r in terms['rows'])<2,
    'all_sampled_astronomy_tt_within_3_seconds':all(v['TTastronomyResidualSeconds']['maxAbs']<3 for v in summary['sampledYearResults'].values()),
    'official_hko_minute_agreement_24':summary['hkoMinuteAgreement']['jpl']==summary['hkoMinuteAgreement']['lunar']==24,
    'jpl_boundary_48_of_48':len(fixtures)==48 and all(r['equal'] for r in fixtures),
    '2026_constant_tt_minus_utc_69_184':all(r['ttMinusUtcSeconds']==69.184 for r in terms['rows']),
    'old_baseline_timescale_correction_within_2_seconds':summary['sxtwlAfterOnlyTimeScaleCorrectionSeconds']['maxAbs']<2,
    'ui_extras_707_unique_cases':len(extras['rows'])==len({r['id'] for r in extras['rows']})==707,
    'void_horse_all_707':all(extras['summary']['equalByField'][k]==707 for k in ['hourVoidBranches','hourVoidPalaces','hourHorseBranch','hourHorsePalace']),
    'raw_hidden_method_differences_preserved':extras['summary']['equalByField']['hiddenStemsRawDifferentMethods']==32,
    'selected_hidden_rule_707_of_707':len(hidden['rows'])==707 and all(r['equal'] for r in hidden['rows']),
    'selected_hidden_rule_includes_75_center_82_jia':hidden['summary']['coverage']['nonJiaDoorCenter5']==75 and hidden['summary']['coverage']['jia']==82,
    'pre_1960_and_future_utc_not_claimed_known':all(r['utcStatus']!='known-leap-seconds' for r in year_rows if r['year']<1960 or r['year']>2026),
}
assert all(checks.values()), {k:v for k,v in checks.items() if not v}

paths=[
    ROOT/'.local-dev/qimen-astronomy/de440s.bsp',
    ROOT/'.local-dev/qimen-astronomy/sxtwl-2.0.6.tar.gz',
    ROOT/'.local-dev/qimen-astronomy/sxtwl-2.0.6/src/eph.cpp',
    ROOT/'frontend-docker/vendor/qfdk-qimen/lib/qimen.js',
    ROOT/'frontend-docker/vendor/qfdk-qimen/lib/bamen.js',
    ROOT/'frontend-docker/src/utils/qimenCalculation.ts',
    ROOT/'frontend-docker/node_modules/lunar-javascript/lunar.js',
    ROOT/'frontend-docker/node_modules/lunar-javascript/package.json',
    ROOT/'.local-dev/qimen-benchmark/atopx-qimen/plate/builders.go',
    ROOT/'.local-dev/qimen-benchmark/atopx-qimen/qimen.go',
    ROOT/'.local-dev/qimen-astronomy/deminzhang-qimen-go/xuan/qimen.go',
    ROOT/'.local-dev/qimen-astronomy/deminzhang-qimen-go/xuan/qimen_defs.go',
    ROOT/'.local-dev/qimen-astronomy/qimen-rs/docs/extensions.md',
    BASE/'inputs.json',BASE/'product-output.json',BASE/'external-output.json',BASE/'third-output.json',
    HERE/'hko-24SolarTerms-2026.xml',HERE/'iers-bulletin-c72.txt',
]
sf=ROOT/'.local-dev/qimen-astronomy/python-deps/skyfield'
paths.extend(sf/p for p in ['almanac_east_asia.py','framelib.py','timelib.py','data/iers.npz','data/delta_t.npz','data/historic_deltat.npy','data/morrison_stephenson_deltat.npy','data/nutation.npz'])
hashes={p.relative_to(ROOT).as_posix():sha(p) for p in paths}
old=read(BASE/'provenance.json')['sha256']
unchanged={p:hashes[p]==old[p] for p in hashes if p in old}
repositories={}
for name,rel in {
    'atopx/qimen':'.local-dev/qimen-benchmark/atopx-qimen',
    'kentang2017/kinqimen':'.local-dev/qimen-benchmark/kinqimen',
    'deminzhang/qimen-go':'.local-dev/qimen-astronomy/deminzhang-qimen-go',
    'SpenserCai/qimen-rs':'.local-dev/qimen-astronomy/qimen-rs',
}.items():
    repo=ROOT/rel
    repositories[name]={'commit':git(repo,'rev-parse','HEAD'),'statusPorcelain':git(repo,'status','--porcelain')}
checks['external_sources_unmodified']=all(not r['statusPorcelain'] for r in repositories.values())
checks['product_algorithm_unchanged_since_707_capture']=all(unchanged.values())
assert all(checks.values()), {k:v for k,v in checks.items() if not v}

save('provenance.json',{'capturedAtUTC':dt.datetime.now(dt.timezone.utc).isoformat(),
    'jplAndLibraries':terms['provenance'],'externalRepositories':repositories,
    'sha256':hashes,'productAlgorithmUnchangedSince707Capture':unchanged,
    'hiddenRuleSource':hidden['summary']['source'],
    'scope':'Only benchmark scripts/data written; product algorithm and all checked third-party sources unchanged.'})
save('verification.json',{'checks':checks,'passed':sum(checks.values()),'total':len(checks),
    'cautions':['707 hidden-stem rule checks validate a selected modern convention, not an ancient universal standard.',
                'Year samples are not an exhaustive 1900-2099 audit; future UTC is not yet known.',
                'UI output field checks do not assert browser rendering.']})
save('artifact-manifest.json',{'sha256':{p.name:sha(p) for p in sorted(HERE.iterdir()) if p.is_file() and p.name!='artifact-manifest.json'}})
print(json.dumps({'checksPassed':sum(checks.values()),'checksTotal':len(checks),'artifactFiles':len(read(HERE/'artifact-manifest.json')['sha256']),
                  'jpl2026Terms':24,'yearTerms':144,'boundaryCases':48,'uiCases':707,'sameConventionHiddenCases':707},ensure_ascii=False))
