import fs from 'node:fs';
import postcss from '../../apps/web/node_modules/postcss/lib/postcss.mjs';
const path=new URL('../../apps/web/src/prototype.css',import.meta.url),before=fs.readFileSync(path,'utf8'),root=postcss.parse(before);
const sides=['top','right','bottom','left'];
const expands={margin:sides.map(s=>'margin-'+s),padding:sides.map(s=>'padding-'+s),inset:sides,border:sides.flatMap(s=>['width','style','color'].map(p=>`border-${s}-${p}`)), 'border-width':sides.map(s=>`border-${s}-width`),'border-style':sides.map(s=>`border-${s}-style`),'border-color':sides.map(s=>`border-${s}-color`),'border-radius':['top-left','top-right','bottom-right','bottom-left'].map(s=>`border-${s}-radius`),background:['background-image','background-position-x','background-position-y','background-size','background-repeat-x','background-repeat-y','background-origin','background-clip','background-attachment','background-color'],flex:['flex-grow','flex-shrink','flex-basis'],'flex-flow':['flex-direction','flex-wrap'],overflow:['overflow-x','overflow-y'],gap:['row-gap','column-gap'],'place-items':['align-items','justify-items'],'place-content':['align-content','justify-content'],'place-self':['align-self','justify-self']};
for(const side of sides)expands['border-'+side]=['width','style','color'].map(p=>`border-${side}-${p}`);
expands.border.push(...['source','slice','width','outset','repeat'].map(p=>'border-image-'+p));
const coverage=p=>expands[p]??[p];
const seen=new Map(),changes=[];
const rules=[];root.walkRules(r=>rules.push(r));
function context(rule){const a=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent){if(p.type!=='atrule')return null;a.unshift('@'+p.name+' '+p.params);}if(a.some(v=>/keyframes|layer/.test(v)))return null;return a.join('|');}
for(const rule of rules.reverse()){
 const ctx=context(rule);if(ctx===null)continue;
 const keys=rule.selectors.map(s=>ctx+'\0'+s.trim());
 const globalKeys=rule.selectors.map(s=>'\0'+s.trim());
 for(const decl of [...rule.nodes].reverse()){
  if(decl.type!=='decl'||decl.prop.startsWith('--')||/(?:color-mix|oklch|oklab|light-dark|anchor|anchor-size)\(/.test(decl.value))continue;
  const properties=coverage(decl.prop.toLowerCase()),importance=decl.important?2:1;
  const covered=keys.every((key,i)=>properties.every(p=>Math.max(seen.get(key)?.get(p)??0,seen.get(globalKeys[i])?.get(p)??0)>=importance));
  if(covered){changes.push({line:decl.source.start.line,selector:rule.selector,property:decl.prop,value:decl.value,important:Boolean(decl.important)});decl.remove();}
  for(const key of keys){const m=seen.get(key)??new Map();for(const p of properties)m.set(p,Math.max(m.get(p)??0,importance));seen.set(key,m);}
 }
 if(!rule.nodes.some(n=>n.type==='decl'||n.type==='rule'))rule.remove();
}
const after=root.toString();console.log(JSON.stringify({removed:changes.length,saved:Buffer.byteLength(before)-Buffer.byteLength(after)}));
fs.writeFileSync(new URL('candidate.css',import.meta.url),after);fs.writeFileSync(new URL('changes.json',import.meta.url),JSON.stringify(changes,null,2));
if(process.argv.includes('--apply')){fs.writeFileSync(new URL('before.css',import.meta.url),before);fs.writeFileSync(path,after);}
