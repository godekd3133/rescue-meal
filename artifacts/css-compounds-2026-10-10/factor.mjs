import fs from 'node:fs';import postcss from '../../apps/web/node_modules/postcss/lib/postcss.mjs';
const path=new URL('../../apps/web/src/prototype.css',import.meta.url);const before=fs.readFileSync(path,'utf8'),root=postcss.parse(before),changes=[];
root.walkRules(rule=>{
 let selectors=rule.selectors;
 while(true){
  const groups=new Map();
  for(const [i,s]of selectors.entries())for(const m of s.matchAll(/(^|[\s>+~])((?:\.[\w-]+)+)(?=[\s>+~]|$)/g)){
   const start=m.index+m[1].length,prefix=s.slice(0,start),suffix=s.slice(start+m[2].length),key=prefix+'|'+suffix+'|'+m[2].split('.').length;
   const g=groups.get(key)??{prefix,suffix,indices:[],compounds:[]};g.indices.push(i);g.compounds.push(m[2]);groups.set(key,g);
  }
  const candidates=[...groups.values()].filter(g=>g.indices.length>1).map(g=>({...g,replacement:g.prefix+':is('+g.compounds.join(',')+')'+g.suffix})).map(g=>({...g,saved:g.indices.reduce((n,i)=>n+selectors[i].length,0)+g.indices.length-1-g.replacement.length})).filter(g=>g.saved>0).sort((a,b)=>b.saved-a.saved);
  const g=candidates[0];if(!g)break;
  selectors=selectors.flatMap((s,i)=>i===g.indices[0]?[g.replacement]:g.indices.includes(i)?[]:[s]);
 }
 if(selectors.join(',')!==rule.selectors.join(',')){changes.push({line:rule.source.start.line,before:rule.selector,after:selectors.join(',\n')});rule.selectors=selectors;}
});
console.log({groups:changes.length,savedBytes:Buffer.byteLength(before)-Buffer.byteLength(root.toString())});
if(process.argv.includes('--apply')){fs.writeFileSync(new URL('before.css',import.meta.url),before);fs.writeFileSync(path,root.toString());fs.writeFileSync(new URL('changes.json',import.meta.url),JSON.stringify(changes,null,2));}
