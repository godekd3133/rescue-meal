import fs from 'node:fs';
import postcss from '../../apps/web/node_modules/postcss/lib/postcss.mjs';
const path=new URL('../../apps/web/src/prototype.css',import.meta.url),before=fs.readFileSync(path,'utf8'),root=postcss.parse(before);
const sides=['top','right','bottom','left'];
const expands={margin:sides.map(s=>'margin-'+s),padding:sides.map(s=>'padding-'+s),inset:sides,border:sides.flatMap(s=>['width','style','color'].map(p=>`border-${s}-${p}`)), 'border-width':sides.map(s=>`border-${s}-width`),'border-style':sides.map(s=>`border-${s}-style`),'border-color':sides.map(s=>`border-${s}-color`),'border-radius':['top-left','top-right','bottom-right','bottom-left'].map(s=>`border-${s}-radius`),background:['background-image','background-position-x','background-position-y','background-size','background-repeat-x','background-repeat-y','background-origin','background-clip','background-attachment','background-color'],flex:['flex-grow','flex-shrink','flex-basis'],'flex-flow':['flex-direction','flex-wrap'],overflow:['overflow-x','overflow-y'],gap:['row-gap','column-gap'],'place-items':['align-items','justify-items'],'place-content':['align-content','justify-content'],'place-self':['align-self','justify-self']};
for(const side of sides)expands['border-'+side]=['width','style','color'].map(p=>`border-${side}-${p}`);
expands.border.push(...['source','slice','width','outset','repeat'].map(p=>'border-image-'+p));
const coverage=p=>expands[p]??[p];
const sheetFiles = new Set(['AccountSheet.tsx','AddFoodSheet.tsx','FoodDetailSheet.tsx','MealPlanSheet.tsx','NotificationSheet.tsx','ShoppingListSheet.tsx','GuidanceSheet.tsx','FoodHistory.tsx','ProductInfoHistory.tsx','ProductProvenanceHistory.tsx','HistoryReadError.tsx','DateAssertionEditor.tsx']);
const sources=fs.readdirSync(new URL('../../apps/web/src/',import.meta.url)).filter(f=>f.endsWith('.tsx')).map(file=>({file,text:fs.readFileSync(new URL('../../apps/web/src/'+file,import.meta.url),'utf8')}));
const ownerCache=new Map();
function owners(name){if(ownerCache.has(name))return ownerCache.get(name);const re=new RegExp('(^|[^a-zA-Z0-9_-])'+name+'(?![a-zA-Z0-9_-])');const result=sources.filter(s=>re.test(s.text)).map(s=>s.file);ownerCache.set(name,result);return result;}
function sheetOnly(selector){if(selector.includes('.bottom-sheet')||selector.includes('('))return false;const classes=[...selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m=>m[1]);return classes.length>0&&classes.every(c=>{const os=owners(c);return os.length>0&&os.every(f=>sheetFiles.has(f));});}
function expand(selector){const m=selector.match(/:is\(([^()]+)\)/);if(!m)return[selector];const branches=m[1].split(',').map(v=>v.trim());if(!branches.every(b=>/^\.[\w-]+(?::[a-z-]+)?$/.test(b))||!branches.every(b=>b.includes(':')===branches[0].includes(':')))return[selector];return branches.flatMap(b=>expand(selector.slice(0,m.index)+b+selector.slice(m.index+m[0].length)));}
function context(rule){const a=[];for(let p=rule.parent;p&&p.type!=='root';p=p.parent){if(p.type!=='atrule')return null;a.unshift('@'+p.name+' '+p.params);}if(a.some(v=>/keyframes|layer/.test(v)))return null;return a.join('|');}
const seen=new Map(),changes=[],rules=[];root.walkRules(r=>rules.push(r));
for(const rule of rules.reverse()){
 const ctx=context(rule);if(ctx===null)continue;
 const selectors=rule.selectors.flatMap(expand);
 for(const decl of [...rule.nodes].reverse()){
  if(decl.type!=='decl'||decl.prop.startsWith('--'))continue;
  const properties=coverage(decl.prop.toLowerCase()),importance=decl.important?2:1;
  const covered=selectors.every(sel=>sheetOnly(sel)&&properties.every(p=>(seen.get(ctx+'\0'+sel)?.get(p)??0)>=importance));
  if(covered){changes.push({line:decl.source.start.line,selector:rule.selector,property:decl.prop,value:decl.value,owners:Object.fromEntries([...new Set(selectors.flatMap(s=>[...s.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m=>m[1])))].map(c=>[c,owners(c)]))});decl.remove();}
  for(const sel of selectors){if(!sel.includes('.bottom-sheet '))continue;const target=sel.replace('.bottom-sheet ','');if(!sheetOnly(target))continue;const key=ctx+'\0'+target,m=seen.get(key)??new Map();for(const p of properties)m.set(p,Math.max(m.get(p)??0,importance));seen.set(key,m);}
 }
 if(!rule.nodes.some(n=>n.type==='decl'||n.type==='rule'))rule.remove();
}
const after=root.toString();console.log(JSON.stringify({removed:changes.length,saved:Buffer.byteLength(before)-Buffer.byteLength(after)}));
fs.writeFileSync(new URL('candidate.css',import.meta.url),after);fs.writeFileSync(new URL('changes.json',import.meta.url),JSON.stringify(changes,null,2));
if(process.argv.includes('--apply')){fs.writeFileSync(new URL('before.css',import.meta.url),before);fs.writeFileSync(path,after);}
