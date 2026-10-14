'use strict';
// Literal transcription from the BRANCH-ORDERED table at the end of 安身命例,
// 紫微斗数全书 卷二, Wikisource oldid=1963110 (2020-09-04).
// This file never imports production tables or libraries.
const branches='子丑寅卯辰巳午未申酉戌亥';
const names={紫:'紫微',机:'天机',日:'太阳',武:'武曲',同:'天同',廉:'廉贞',府:'天府',月:'太阴',贪:'贪狼',巨:'巨门',相:'天相',梁:'天梁',杀:'七杀',破:'破军',昌:'文昌',曲:'文曲',羊:'擎羊',陀:'陀罗',火:'火星',铃:'铃星',禄:'禄存'};
const levels=['庙','旺','得','利','平','不','陷'];
const rows=[
 ['机府月相梁破禄','武同贪巨杀','昌曲','','紫廉','','日羊火铃'],
 ['紫武府月贪相杀昌曲羊陀','梁破','火铃','廉','','日同巨','机'],
 ['廉府巨相梁杀禄火铃','紫日月','机武破','同','贪曲','','昌陀'],
 ['日巨梁禄','紫机杀曲','府','武贪昌火铃','同廉','','月相破羊'],
 ['武府贪梁杀羊陀','日破','紫相昌曲','机廉','同','','月巨火铃'],
 ['同昌曲禄','紫日巨','府相火铃','','机武杀破','','廉月贪梁陀'],
 ['紫机相梁破禄火铃','日武府贪巨杀','','','廉','月','同昌曲羊'],
 ['紫武府贪杀羊陀','梁破曲','日相','廉昌火铃','','同月巨','机'],
 ['廉巨相杀禄','紫同','机日武府破昌曲','月','贪','','梁陀火铃'],
 ['巨昌曲禄','紫机府月杀','梁火铃','武贪','日同廉','','相破羊'],
 ['武府贪梁杀羊陀火铃','月破','紫相','机廉','同','日','巨昌曲'],
 ['同月禄','紫巨曲','府相','昌火铃','机武杀破','','日廉贪梁陀'],
];
const brightness={};
rows.forEach((row,i)=>row.forEach((letters,j)=>{for(const c of letters){const key=`${names[c]}.${branches[i]}`;if(brightness[key])throw Error('duplicate '+key);brightness[key]=levels[j];}}));
const source='https://zh.wikisource.org/w/index.php?oldid=1963110&title=紫微斗數全書/卷二';
// Original table explicitly maps 命主 by 命宫, not by birth-year branch.
const soul=['贪狼','巨门','禄存','文曲','廉贞','武曲','破军','武曲','廉贞','文曲','禄存','巨门'];
// 安小限: 寅午戌辰 / 申子辰戌 / 巳酉丑未 / 亥卯未丑;
// 男顺女逆, independent of year yin/yang. Store the displayed ten ages per palace.
function ages(yearBranch,gender){
 const start=[10,7,4,1][yearBranch%4],result=Object.fromEntries([...branches].map(b=>[b,[]]));
 for(let age=1;age<=120;age++)result[branches[(start+(gender===1?-1:1)*(age-1)%12+12)%12]].push(age);
 return result;
}
module.exports={branches,brightness,rows,names,levels,source,soul,ages};
