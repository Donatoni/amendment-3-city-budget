import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSharedPlan, resultURL, resultDescription } from '../src/share-plan.js';
import { resultImageSVG } from '../server/result-image.js';
import { SERVICES, fmtM } from '../src/budget.js';
import { nativeShare } from '../src/share.js';
import { onRequest as homepage } from '../functions/index.js';

const origin='https://amendment-3.delandfl.gov/';
const values=[10,14,4,4,1];

test('result links preserve every budget and design choice and use unique image URLs',()=>{
  const seen=new Set();
  for(const theme of ['daylight','bluehour','citrus'])for(const headline of [0,1,2])for(const side of ['front','back']){
    const options={theme,headline,side};
    const url=resultURL(origin,values,options);
    const image=resultURL(origin,values,options,true);
    assert.equal(new URL(url).pathname,'/share/');
    assert.equal(new URL(url).hash,'#builder');
    assert.equal(new URL(image).hash,'');
    assert.equal(new URL(image).searchParams.get('v'),'8');
    assert.deepEqual(readSharedPlan(url),{values,...options});
    assert.deepEqual(readSharedPlan(image),{values,...options});
    seen.add(image);
  }
  assert.equal(seen.size,18);
  assert.notEqual(resultURL(origin,values),resultURL(origin,[9,14,4,4,1]));
});

test('legacy links work and invalid or injected rendering inputs are rejected',()=>{
  assert.deepEqual(readSharedPlan(origin+'?b=10_14_4_4_1').values,values);
  for(const query of ['','b=','b=10_14_4_4_1_6','b=10__4_4_1_6','b=100_14_4_4_1_6','b=-1_14_4_4_1_6','b=1e1_14_4_4_1_6','b=NaN_14_4_4_1_6','b=10_14_4_4_1_6&theme=__proto__','b=10_14_4_4_1_6&h=99','b=10_14_4_4_1_6&side=<script>'])assert.equal(readSharedPlan(origin+'?'+query),null,query);
});

test('legacy homepage budget links redirect crawlers to the complete personalized plan',async()=>{
  for (const method of ['GET', 'HEAD']) {
    const response = await homepage({ request: new Request(`${origin}?b=10_14_4_4_1&theme=citrus&h=2&side=back`, { method }) });
    assert.equal(response.status,302);
    assert.equal(response.headers.get('Location'),resultURL(origin,values,{theme:'citrus',headline:2,side:'back'}));
    assert.equal(response.headers.get('X-Robots-Tag'),'noindex, follow');
    assert.equal(await response.text(),'');
  }
});

test('ordinary and invalid homepage links keep the original static response',async()=>{
  for (const suffix of ['', '?utm_source=x', '?b=invalid']) {
    const request = new Request(origin + suffix);
    const response = new Response('Main site', { headers: { ETag: 'home' } });
    const env = { ASSETS: { fetch: async input => { assert.equal(input,request);return response; } } };
    assert.equal(await homepage({request,env}),response);
  }
});

test('preview SVG includes the real postcard, complete funding, and correct totals',()=>{
  const assets={seal:{href:'data:image/png;base64,AA=='},illustration:{href:'data:image/jpeg;base64,AA==',width:960,height:576}};
  const plan={values,theme:'citrus',headline:1,side:'front'};
  const svg=resultImageSVG(plan,assets);
  assert.ok(svg.includes('viewBox="0 0 1080 1350"'));
  assert.ok(svg.includes('data:image/jpeg'));
  assert.ok(svg.includes('$33.0M')&&svg.includes('$8.99M')&&svg.includes('Small city.'));
  const back=resultImageSVG({...plan,side:'back'},assets);
  assert.ok(back.includes('behind my city.'));
  assert.ok(!back.includes('data:image/jpeg'));
  assert.equal(resultDescription(plan).total,33);
  assert.ok(resultDescription(plan).description.includes('$8.99M gap closed'));
});

test('department changes show exact deductions, increases, and unchanged funding',()=>{
  const assets={};
  const plan={values,theme:'daylight',headline:0,side:'back'};
  const svg=resultImageSVG(plan,assets);
  for (const [i, service] of SERVICES.entries()) assert.ok(svg.includes(`${fmtM(service.proposed - values[i])} deducted`));
  const mixed = resultImageSVG({...plan, values: SERVICES.map((s, i) => i === 0 ? s.proposed + 1 : i === 1 ? 0 : s.proposed)}, assets);
  assert.ok(mixed.includes('$1.0M added'));
  assert.ok(mixed.includes('$17.01M deducted'));
  assert.ok(mixed.includes('No change'));
  assert.ok(!mixed.includes('$0.0M deducted'));
});

test('native share receives the prebuilt postcard synchronously, with personalized URL',async()=>{
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const originalWindow=globalThis.window;
  let call;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{canShare:()=>true,share:args=>{call=args;return Promise.resolve();}}});
  globalThis.window={location:{origin}};
  try{
    const file=new File(['png'],'my-deland-postcard.png',{type:'image/png'});
    const result=nativeShare(file,values,{theme:'citrus',headline:1,side:'back'});
    assert.equal(call.files[0],file,'share is invoked before yielding user activation');
    assert.equal(readSharedPlan(call.url).side,'back');
    assert.equal(await result,'shared-image');
    navigator.canShare=()=>false;
    assert.equal(await nativeShare(file,values),'shared-link');
    navigator.share=()=>Promise.reject(new DOMException('Cancelled','AbortError'));
    assert.equal(await nativeShare(file,values),'cancelled');
  }finally{
    if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;
    if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
  }
});

test('Cloudflare routes run the reviewer gate for every path, including shared HTML and PNG',()=>{
  const routes=JSON.parse(readFileSync(new URL('../public/_routes.json',import.meta.url)));
  assert.ok(routes.include.includes('/*'));
  assert.deepEqual(routes.exclude, []);
});
