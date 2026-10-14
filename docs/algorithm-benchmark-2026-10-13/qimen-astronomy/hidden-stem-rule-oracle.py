"""Independent formula from a pre-existing published rule, not product source.

Rule source: Baidu Zhidao question 397640584, accepted answer dated 2014-03-05.
Its Jia-only center exception differs from ground-stem-repetition variants.
Inputs (hour, xun instrument, Yin/Yang and unhosted duty-door palace) come
from the separately executed atopx implementation, not the product output.
This checks implementation of that convention, not a universal school standard.
"""
import collections
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
BASE = HERE.parent/'qimen'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def save(name,obj):(HERE/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

sequence='戊己庚辛壬癸丁丙乙'

def rule_formula(hour_stem, instrument, unhosted_door_palace, yang):
    start_palace = 5 if hour_stem == '甲' else unhosted_door_palace
    start_stem = instrument if hour_stem == '甲' else hour_stem
    direction = 1 if yang else -1
    # Solve each palace directly, instead of marching a mutable palace counter.
    origin = sequence.index(start_stem)
    return {str(p):sequence[(origin+direction*(p-start_palace))%9] for p in range(1,10)}

product={r['id']:r['raw'] for r in read(BASE/'product-output.json')['rows']}
third={r['id']:r['raw'] for r in read(HERE/'third-extra-output.json')['rows']}
rows=[]
coverage=collections.Counter()
combinations=set()
for case_id, independent in third.items():
    pillar=independent['siZhu']['time']
    hour_stem=pillar[0]
    door_raw=independent['rawChiefPalaces']['zhiShi']
    instrument=independent['xunShou']
    yang=independent['juShu']['type']=='yang'
    expected=rule_formula(hour_stem,instrument,door_raw,yang)
    actual=product[case_id]['anGan']
    category='jia' if hour_stem=='甲' else ('nonJiaDoorCenter5' if door_raw==5 else 'nonJiaOuterDoor')
    coverage[category]+=1
    combinations.add((independent['juShu']['type'],independent['juShu']['number'],pillar))
    rows.append({'id':case_id,'independentInput':{'hourPillar':pillar,'xunInstrument':instrument,
                 'yang':yang,'juNumber':independent['juShu']['number'],'unhostedDutyDoorPalace':door_raw},
                 'category':category,'expected':expected,'actual':actual,'equal':expected==actual})

source={
    'title':'转盘奇门暗干排法',
    'url':'https://zhidao.baidu.com/question/397640584.html',
    'answerDate':'2014-03-05',
    'locator':'Accepted answer, paragraphs distinguishing 甲 versus non-甲; web extraction lines 87,104-109.',
    'shortQuote':'时辰非甲，跟非伏吟局一样排法。',
    'ruleParaphrase':'Non-Jia hours use the duty-door palace as the hour-stem anchor and fly the nine instruments through numbered palaces according to Yin/Yang. Jia alone uses its xun instrument anchored in center five.',
    'evidenceLevel':'Original dated public Q&A; anonymous author in current extraction. It is evidence that this particular convention predates the software, not a classical authority or proof of a universally correct convention.',
    'centerInterpretation':'The answer says duty-door palace but does not spell out hosted-vs-unhosted center behavior. This reference uses the unhosted numeric duty-door position from the separately run atopx engine; that convention is stated explicitly rather than attributed verbatim to the answer.',
    'independentInputSource':'atopx/qimen 8eb06d007d4a5fcc5352d9054f81469e5f023f45; rawChiefPalaces.zhiShi from unchanged actual execution.',
    'otherSourcesInvestigated':[
        {'source':'deminzhang/qimen-go','commit':'4d3f58fa0f401b5b3a337f119138e99e90685dda','path':'xuan/qimen.go:517-530',
         'finding':'Uses center when hour instrument repeats native earth stem; therefore a different rule for some non-Jia hours.'},
        {'source':'SpenserCai/qimen-rs','commit':'c4e7fb140402245a3dc3409b362d6ccaad60755b','path':'docs/extensions.md:167-179',
         'finding':'Explicitly cites the preceding Go implementation for the repeated-stem variant; not independent corroboration of the Jia-only exception.'},
    ],
}
summary={'cases':len(rows),'equal':sum(r['equal'] for r in rows),'coverage':dict(coverage),
         'uniqueYinYangJuHourCombinations':len(combinations),
         'all18YinYangJuCovered':len({(x[0],x[1]) for x in combinations})==18,
         'all60HourPillarsCovered':len({x[2] for x in combinations})==60,
         'status':'Verified against explicitly documented modern convention; center-hosting interpretation remains an explicit project convention, not ancient-source adjudication.',
         'source':source}
save('hidden-stem-rule-comparison.json',{'summary':summary,'rows':rows})
save('hidden-stem-rule-summary.json',summary)
print(json.dumps(summary,ensure_ascii=False,indent=2))
