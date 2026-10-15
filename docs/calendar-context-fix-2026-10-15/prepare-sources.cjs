// Download exact reviewed baseline content. A changed upstream file is rejected.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const sources=require('./sources.json');
async function main(){
 const dir=path.resolve(__dirname,'../../.local-dev/algorithm-site-review');await fs.mkdir(dir,{recursive:true});
 for(const [name,source] of Object.entries(sources)){
  const file=path.join(dir,name);let bytes;try{bytes=await fs.readFile(file);}catch{}
  if(bytes&&crypto.createHash('sha256').update(bytes).digest('hex')===source.sha256)continue;
  const response=await fetch(source.url);if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
  bytes=Buffer.from(await response.arrayBuffer());
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw new Error(`${name}: upstream changed; retrieve the reviewed revision, do not replace the baseline hash`);
  await fs.writeFile(file,bytes);console.log(`Verified ${name}`);
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
