import type { DraftRecord } from './useDraft';
export const types = {
      bazi:{label:'八字排盘',short:'八字',symbol:'八',english:'FOUR PILLARS · 八字',title:'从出生时刻，认识自己',description:'填写基本信息，开启你的命盘探索。',result:'八字命盘'},
      liuyao:{label:'六爻问事',short:'六爻',symbol:'爻',english:'SIX LINES · 六爻',title:'一事一问，静观其变',description:'写下一个具体问题，以时间起卦的方式探索当下。',result:'六爻卦象'},
      ziwei:{label:'紫微斗数',short:'紫微',symbol:'紫',english:'PURPLE STAR · 紫微',title:'十二宫位，人生的不同面向',description:'从出生信息出发，探索命盘中的关系与结构。',result:'紫微命盘'}
    };
export const initialRecords: DraftRecord[] = [
      {id:1,type:'bazi',title:'小林的八字命盘',name:'小林',gender:'女',date:'1996-08-18',time:'09:30',calendar:'阳历',created:'2026-10-12',subtitle:'性格特质与人生节奏',saved:true},
      {id:2,type:'liuyao',title:'近期合作的推进情况',name:'',question:'近期合作的推进情况如何？',date:'2026-10-11',time:'14:20',calendar:'阳历',created:'2026-10-11',subtitle:'一事一问 · 时间起卦',saved:true},
      {id:3,type:'ziwei',title:'小林的紫微命盘',name:'小林',gender:'女',date:'1996-08-18',time:'09:30',calendar:'阳历',created:'2026-10-10',subtitle:'十二宫位与人生主题',saved:true},
      {id:4,type:'bazi',title:'阿远的八字命盘',name:'阿远',gender:'男',date:'1993-03-22',time:'16:00',calendar:'阳历',created:'2026-10-09',subtitle:'命盘结构与大运节奏',saved:true}
    ];
