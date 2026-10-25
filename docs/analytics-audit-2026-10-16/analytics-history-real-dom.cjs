const fs=require('fs'),vm=require('vm'),ts=require('F:/github/xuan_agent/frontend-docker/node_modules/typescript');
const {JSDOM}=require('F:/github/xuan_agent/frontend-docker/node_modules/jsdom');
const source=ts.transpileModule(fs.readFileSync('F:/github/xuan_agent/frontend-docker/src/composables/usePageAnalytics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const dom=new JSDOM('<!doctype html><html></html>',{url:'https://xuan.example/#/home'}); const seen=[];const events=[];
for(const name of ['popstate','hashchange'])dom.window.addEventListener(name,()=>events.push(name));
const context={exports:{},window:dom.window,history:dom.window.history,setTimeout,require(name){if(name==='vue')return{watch(){},onUnmounted(){}};if(name.includes('appConfig'))return{useAppConfigStore:()=>({loaded:true})};if(name.includes('analytics'))return{trackPageView:()=>seen.push(dom.window.location.href)};throw Error(name)}};
vm.runInNewContext(source,context);
(async()=>{context.exports.usePageAnalytics();dom.window.history.pushState({},'','#/one');await new Promise(resolve=>setTimeout(resolve,5));dom.window.history.pushState({},'','#/two');await new Promise(resolve=>setTimeout(resolve,5));const before=seen.length;dom.window.history.back();await new Promise(resolve=>setTimeout(resolve,50));console.log(JSON.stringify({events,pvForSingleBack:seen.length-before,lastUrls:seen.slice(before)},null,2));dom.window.close()})()
