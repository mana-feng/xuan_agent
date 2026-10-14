"""Compare fields actually shown by the draft Qimen UI; preserve rule differences."""
import collections
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
BASE = HERE.parent / 'qimen'

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def save(name, value):
    (HERE/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

product = {r['id']:r['raw'] for r in read(BASE/'product-output.json')['rows']}
python = {r['id']:r['raw'] for r in read(BASE/'external-output.json')['rows']}
go = {r['id']:r['raw'] for r in read(HERE/'third-extra-output.json')['rows']}
assert product.keys() == python.keys() == go.keys()
branch_palace = dict(zip('子丑寅卯辰巳午未申酉戌亥', '188344922766'))
counts = collections.Counter()
rows = []
for case_id, p in product.items():
    b, t = python[case_id], go[case_id]
    empty_branches = list(b['旬空']['時空'])
    # Product array is one palace per void branch, so two branches in one
    # palace legitimately repeat a number. UI uses includes(), not array length.
    empty_palaces = sorted(branch_palace[x] for x in empty_branches)
    horse_branch = b['馬星']['驛馬']
    comparisons = {
        'hourVoidBranches': {'product':p['kongWangZhi'], 'external':empty_branches},
        'hourVoidPalaces': {'product':sorted(p['kongWangGong']), 'external':empty_palaces},
        'hourHorseBranch': {'product':p['maStar']['zhi'], 'external':horse_branch},
        'hourHorsePalace': {'product':p['maStar']['gong'], 'external':branch_palace[horse_branch]},
        'hiddenStemsRawDifferentMethods': {'product':p['anGan'], 'external':t['anGan']},
    }
    for key, pair in comparisons.items():
        pair['equal'] = pair['product'] == pair['external']
        counts[key] += int(pair['equal'])
    rows.append({'id':case_id, 'hourPillar':p['siZhu']['time'], 'juShu':p['juShu'], 'fields':comparisons})

summary = {
    'cases':len(rows),
    'equalByField':dict(counts),
    'sources':{
        'product':'qfdk/qimen 1d0d1c5b39755e67525a11e68bab9b73baae1937 + xuan-1',
        'voidAndHorse':'kentang2017/kinqimen 127ead87aa24a74d40c893a5351e22a1a89d0945 unchanged .pan(1)',
        'hiddenStems':'atopx/qimen 8eb06d007d4a5fcc5352d9054f81469e5f023f45 unchanged MethodTime/StyleRotate/JuRuleChaiBu',
    },
    'normalization':'Void/horse branch-to-palace mapping only: 子1 丑寅8 卯3 辰巳4 午9 未申2 酉7 戌亥6. Void palace order ignored; repeated palace per branch preserved. No names or palaces swapped.',
    'voidRepeatedPalaceArrays':sum(len(set(p['kongWangGong'])) < len(p['kongWangGong']) for p in product.values()),
    'voidRepeatedPalaceMeaning':'Each branch maps separately, so 辰巳 returns [4,4] and 戌亥 returns [6,6]. Actual UI uses includes() and shows only one marker per palace; this is not a wrong palace.',
    'hiddenStemConclusion':{
        'productRule':'时干加值使真实落宫，三奇六仪按宫数阳顺阴逆；甲时以旬首六仪入中5。',
        'goRule':'地盘干随值使门在外八宫整体转动，中心干保持不变（门下藏干）。',
        'classification':'Different declared algorithms; raw equality is descriptive, not a product failure rate. The separate hidden-stem-rule-comparison.json checks the Jia-only convention through an independent formula based on a dated original public answer and third-engine inputs, with explicit limits on source authority.',
        'sourceProduct':'frontend-docker/vendor/qfdk-qimen/lib/qimen.js:721-759',
        'sourceGo':'atopx-qimen/plate/builders.go:20-44 and qimen.go:226',
        'uiInitialGap':'At the initial audit, draft UI displayed 暗干 without identifying its method. Parent has now added the exact rule to index.html:107; source text was re-read. Browser validation remains with parent. Do not replace the calculation with Go results merely to make the raw benchmark agree.',
    },
    'coverageCaution':'These are engine-output comparisons for fields read by the actual draft page, not a browser rendering assertion. Parent owns browser validation. Carried TianQin stem uses ground center5 and QinRui location, already covered by main baseline ground/star comparisons.',
}
save('ui-extra-comparison.json', {'summary':summary, 'rows':rows})
save('ui-extra-summary.json', summary)
print(json.dumps(summary, ensure_ascii=False, indent=2))
