'use strict';
const path=require('node:path'),{spawnSync}=require('node:child_process');
const {f}=require('./oracle.cjs');
const python=process.env.ZIWEI_PYTHON||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const cache=new Map();
function request(op,args){
 const key=JSON.stringify({op,args});if(cache.has(key))return cache.get(key);
 const result=spawnSync(python,['-X','utf8',path.join(__dirname,'sxtwl-calendar.py')],{input:key,encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr||result.error||'sxtwl subprocess failed');
 const value=JSON.parse(result.stdout);cache.set(key,value);return value;
}
function withGz(r){return {...r,yearSky:f.Sky.get(r.yearStem),yearGround:f.Ground.get(r.yearBranch),monthSky:f.Sky.get(r.monthStem),monthGround:f.Ground.get(r.monthBranch),daySky:f.Sky.get(r.dayStem),dayGround:f.Ground.get(r.dayBranch)};}
module.exports={
 solar2lunar:(...args)=>withGz(request('solar',args)),
 lunar2solar:(...args)=>request('lunar',args),
 lunarSkyGround:(...args)=>withGz(request('lunar',args)),
 lunarMonthDays:(...args)=>request('monthDays',args),
};
