import test from 'node:test';import assert from 'node:assert/strict';
import {createElement as h,Fragment} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';import react from '@vitejs/plugin-react';
const server=await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true},appType:'custom',logLevel:'error'});
const {Metadata,MetadataText}=await server.ssrLoadModule('/src/Metadata.tsx');
const render=text=>renderToStaticMarkup(h(MetadataText,{text}));const plain=html=>html.replace(/<[^>]*>/g,'');
test.after(async()=>{await server.close();});
test('food name and quantity preserve their JSX space when another separator is split',()=>assert.equal(plain(render(h(Fragment,null,'두부',' ',1,'모',' · ','냉장'))),'두부 1모 냉장'));
test('nested fragments preserve meaningful spaces',()=>assert.equal(plain(render(h(Fragment,null,h(Fragment,null,'선택한 날짜',' ','2026.10.10'),' · ','직접 확인'))),'선택한 날짜 2026.10.10 직접 확인'));
test('bullet separators are removed without joining adjacent words',()=>assert.equal(plain(render(h(Fragment,null,'상품',' ',2,'개',' • ','구매 완료'))),'상품 2개 구매 완료'));
test('whitespace-only optional groups do not create empty metadata fields',()=>{const html=render(h(Fragment,null,' · ',' ',null,' · ','1모'));assert.equal((html.match(/class="metadata-part"/g)||[]).length,1);assert.equal(plain(html),'1모');});
test('zero remains meaningful content',()=>assert.equal(plain(render(h(Fragment,null,'수량',' ',0,'개',' · ','기록'))),'수량 0개 기록'));
test('plain content without separators keeps existing spacing',()=>assert.equal(plain(render(h(Fragment,null,'두부',' ','1모'))),'두부 1모'));

test('metadata arrays split provider-joined strings into distinct fields',()=>{
 const html=renderToStaticMarkup(h(Metadata,{parts:['분류 확인 필요 • 모든 기간','냉장 · 1팩']}));
 assert.equal(plain(html),'분류 확인 필요 모든 기간 냉장 1팩');
 assert.equal((html.match(/class="metadata-part"/g)||[]).length,4);
});
test('metadata arrays preserve fragment spacing, numeric zero and formatted children',()=>{
 const html=renderToStaticMarkup(h(Metadata,{parts:[h(Fragment,null,'남은',' ',0,'개',' · ','냉장'),h('strong',null,'포장지 날짜')]}));
 assert.equal(plain(html),'남은 0개 냉장 포장지 날짜');
 assert.ok(html.includes('<strong>포장지 날짜</strong>'));
});
test('blank and boolean array entries do not leave empty fields',()=>{
 const html=renderToStaticMarkup(h(Metadata,{parts:[null,true,false,' ',' • ',0,'1.5kg','세척·손질']}));
 assert.equal(plain(html),'0 1.5kg 세척·손질');
 assert.equal((html.match(/class="metadata-part"/g)||[]).length,3);
});
