import fs from 'node:fs';
import postcss from '../../apps/web/node_modules/postcss/lib/postcss.mjs';
const file='apps/web/src/prototype.css';const before=fs.readFileSync(file,'utf8');const root=postcss.parse(before);
function specificity(s){
 if(/[\[\]()\\#*|]/.test(s)||s.includes("::"))return null;
 const pseudos=[...s.matchAll(/:([\w-]+)/g)].map(x=>x[1]);
 if(pseudos.some(x=>!["hover","active","focus","disabled","checked","first-child","last-child","only-child","empty","root"].includes(x)))return null;
 let tags=0,classes=0;
 s=s.replace(/::[\w-]+/g,()=>{tags++;return '';});
 s=s.replace(/:[\w-]+/g,()=>{classes++;return '';});
 s=s.replace(/\.[\w-]+/g,()=>{classes++;return '';});
 if(/[^a-zA-Z\s>+~-]/.test(s))return null;
 const names=s.split(/[\s>+~]+/).filter(Boolean);if(names.some(x=>!/^[-a-zA-Z]+$/.test(x)))return null;
 return `${classes},${tags+names.length}`;
}
const changes=[];
root.walkRules(rule=>{
 if(rule.selectors.length<2)return;
 const groups=new Map(),remaining=[];
 for(const selector of rule.selectors){
  const match=selector.match(/^(.*?\.bottom-sheet\s+)(.+)$/);
  const tail=match&&match[2].match(/^([^\s>+~]+)(.*)$/s);
  const sp=tail&&specificity(tail[1]);
  if(!sp){remaining.push(selector);continue;}
  const key=match[1]+'|'+tail[2]+'|'+sp;const group=groups.get(key)??{prefix:match[1],suffix:tail[2],selectors:[],tails:[]};group.selectors.push(selector);group.tails.push(tail[1]);groups.set(key,group);
 }
 const output=[...remaining];let modified=false;
 for(const group of groups.values()){
  const factored=group.prefix+':is('+group.tails.join(',')+')'+group.suffix;
  if(group.selectors.length>1&&factored.length<group.selectors.join(',').length){output.push(factored);modified=true;}else output.push(...group.selectors);
 }
 if(modified){changes.push({line:rule.source.start.line,before:rule.selector,after:output.join(',\n')});rule.selectors=output;}
});
console.log({groups:changes.length,savedSourceBytes:Buffer.byteLength(before)-Buffer.byteLength(root.toString())});
if(process.argv.includes('--apply')){fs.writeFileSync('artifacts/css-selectors-2026-10-10/before.css',before);fs.writeFileSync(file,root.toString());fs.writeFileSync('artifacts/css-selectors-2026-10-10/changes.json',JSON.stringify(changes,null,2)+'\n');}
