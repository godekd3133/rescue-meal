import fs from 'node:fs';
const files=['AddFoodSheet','MealPlanSheet','AccountSheet'];
function bodyEnd(text,start){let depth=1,quote=null,escape=false;for(let i=start;i<text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}if('"\'`'.includes(c)){quote=c;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0)return i;if(c!=='}'){} }throw Error('unbalanced handler');}
// The quote-aware scanner is intentionally restricted to these explicit JSX arrows.
const down='onPointerDown={(event) => {';const click='onClick={(event) => {';
const audit=[];
for(const file of files){const path=`apps/web/src/${file}.tsx`;let text=fs.readFileSync(path,'utf8');const edits=[];let pos=0;
 while((pos=text.indexOf(down,pos))>=0){const a=pos+down.length,b=bodyEnd(text,a),next=b+2;let c=next;while(/\s/.test(text[c]??'')&&c<text.length)c++;if(!text.startsWith(click,c)){pos=next;continue;}const d=c+click.length,e=bodyEnd(text,d);const downBody=text.slice(a,b).trim(),clickBody=text.slice(d,e).trim();if(!clickBody.startsWith('if (event.detail === 0)')||!downBody.startsWith('event.preventDefault();')){pos=e+2;continue;}
 const action=downBody.slice('event.preventDefault();'.length).trim();if(!action){pos=e+2;continue;}
 audit.push({file,line:text.slice(0,pos).split('\n').length,action});edits.push({start:pos,end:e+2,value:`onPointerDown={(event) => event.preventDefault()} onClick={() => { ${action} }}`});pos=e+2;
 }
 for(const edit of edits.reverse())text=text.slice(0,edit.start)+edit.value+text.slice(edit.end);fs.writeFileSync(path,text);
}
fs.writeFileSync('artifacts/button-activation-2026-10-09/rewrites.json',JSON.stringify(audit,null,2)+'\n');console.log({buttons:audit.length});
