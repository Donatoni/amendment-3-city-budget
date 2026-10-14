import { Resvg, initWasm } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import { readSharedPlan, resultURL } from '../../src/share-plan.js';
import { resultImageSVG } from '../../server/result-image.js';
import { loadPublishedConfig, handleCityMedia } from '../../server/city-content.js';

let initialized;
const base64 = bytes => {
  let value='';
  for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(value);
};
async function assets(env,origin,config) {
    const paths=[config.city.logo,config.city.shareImage,...['400','600','800'].map(w=>`/assets/fonts/inter-${w}.ttf`)];
    const buffers=await Promise.all(paths.map(async path=>{
      const url = new URL(path, origin);
      // Read only this installation's assets; do not turn content URLs into an
      // arbitrary server fetch. External images need a local upload for previews.
      if (url.origin !== origin) throw new Error('Upload share artwork to this site for social previews.');
      const r=url.pathname.startsWith('/api/media/') ? await handleCityMedia(new Request(url),env) : await env.ASSETS.fetch(new Request(url));
      if(!r.ok)throw new Error(`Missing rendering asset: ${path}`);
      return {bytes:new Uint8Array(await r.arrayBuffer()),type:r.headers.get('Content-Type')?.split(';')[0] || 'image/png'};
    }));
    return {seal:{href:`data:${buffers[0].type};base64,${base64(buffers[0].bytes)}`},illustration:{href:`data:${buffers[1].type};base64,${base64(buffers[1].bytes)}`,width:960,height:576},fonts:buffers.slice(2).map(item=>item.bytes)};
}
export async function onRequest({ request, env, waitUntil }) {
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const url=new URL(request.url);
  const config=await loadPublishedConfig(env);
  const plan=readSharedPlan(url,config);
  if(!plan)return new Response('Invalid budget image',{status:400,headers:{'Cache-Control':'no-store'}});
  const cacheURL=new URL(resultURL(url.origin,plan.values,plan,true,config));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(config)));
  cacheURL.searchParams.set('content',Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''));
  const cacheKey=new Request(cacheURL);
  const cached=await caches.default.match(cacheKey);
  if(cached)return request.method==='HEAD'?new Response(null,{headers:cached.headers}):cached;
  try {
    initialized ??= initWasm(wasm).catch(error=>{initialized=null;throw error;});
    const [,data]=await Promise.all([initialized,assets(env,url.origin,config)]);
    const renderer=new Resvg(resultImageSVG(plan,data,config),{font:{fontBuffers:data.fonts,defaultFontFamily:'Inter'}});
    let rendered;
    let png;
    try { rendered=renderer.render(); png=rendered.asPng().slice(); }
    finally { rendered?.free();renderer.free(); }
    const response=new Response(png,{headers:{'Content-Type':'image/png','Content-Length':String(png.length),'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
    waitUntil(caches.default.put(cacheKey,response.clone()));
    return request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
  } catch(error) {
    console.error('Budget image rendering failed',error);
    return new Response('Image temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});
  }
}
