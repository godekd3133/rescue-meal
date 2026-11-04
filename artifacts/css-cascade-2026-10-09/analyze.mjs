import fs from 'node:fs';
import postcss from '../../apps/web/node_modules/postcss/lib/postcss.mjs';
const path='apps/web/src/prototype.css';
const css=fs.readFileSync(path,'utf8');
const root=postcss.parse(css);
function expand(selector){
 const match=selector.match(/:is\((\.[\w-]+(?:,\.[\w-]+)+)\)/);
 if(!match)return [selector.replace(/\s+/g,' ').trim()];
 return match[1].split(',').flatMap(s=>expand(selector.replace(match[0],s)));
}
function context(rule){const chain=[];for(let p=rule.parent;p?.type!=='root';p=p.parent){if(p.type!=='atrule'||!['media','supports'].includes(p.name))return null;chain.unshift('@'+p.name+' '+p.params);}return chain.join(' / ');}
const rules=[];root.walkRules(r=>{const ctx=context(r);if(ctx!==null)rules.push({rule:r,ctx,selectors:r.selectors.flatMap(expand)});});
const files=fs.readdirSync('apps/web/src',{recursive:true}).filter(x=>/\.tsx?$/.test(x));
const sheetFiles=files.filter(x=>/(?:Sheet|History|ReviewPanel|DateAssertionEditor)\.tsx$/.test(x));
const sheetSource=sheetFiles.map(x=>fs.readFileSync('apps/web/src/'+x,'utf8')).join('\n');
const otherSource=files.filter(x=>!sheetFiles.includes(x)).map(x=>fs.readFileSync('apps/web/src/'+x,'utf8')).join('\n');
const isSheetOnly=s=>{const name=s.match(/^\.([\w-]+)(?:[\s.:#>+~[]|$)/)?.[1];return name&&sheetSource.includes(name)&&!otherSource.includes(name);};
const future=new Map(),removed=[];
for(const {rule,ctx,selectors} of rules.reverse()){
 const declarations=rule.nodes.filter(n=>n.type==='decl');
 for(const d of declarations){
  const matches=selectors.map(s=>future.get(ctx+'|'+s+'|'+d.prop)??future.get('|'+s+'|'+d.prop)??(isSheetOnly(s)?future.get(ctx+'|.bottom-sheet '+s+'|'+d.prop)??future.get('|.bottom-sheet '+s+'|'+d.prop):null));
  const advancedSyntax=/(?:color-mix|oklch|oklab|light-dark|anchor|anchor-size)\(/;
  if(matches.every(m=>m&&(!d.important||m.important)&&(!advancedSyntax.test(m.value)||advancedSyntax.test(d.value)))){
   removed.push({line:d.source.start.line,selector:rule.selector,property:d.prop,value:d.value,laterLines:matches.map(m=>m.line),sameValue:matches.every(m=>m.value===d.value)});
   if(process.argv.includes('--apply'))d.remove();
  }
 }
 // Register after comparing the whole block to preserve fallback declaration order.
 for(const d of declarations){for(const selector of selectors){const key=ctx+'|'+selector+'|'+d.prop;const existing=future.get(key);if(!existing||(!existing.important&&d.important))future.set(key,{value:d.value,important:d.important,line:d.source.start.line});}}
 if(process.argv.includes('--apply')&&!rule.nodes.some(n=>n.type==='decl'))rule.remove();
}
console.log({coveredDeclarations:removed.length,identicalValues:removed.filter(x=>x.sameValue).length});
if(process.argv.includes('--apply')){fs.writeFileSync('artifacts/css-cascade-2026-10-09/before.css',css);fs.writeFileSync(path,root.toString());fs.writeFileSync('artifacts/css-cascade-2026-10-09/removals.json',JSON.stringify(removed,null,2)+'\n');console.log({savedSourceBytes:Buffer.byteLength(css)-Buffer.byteLength(root.toString())});}
