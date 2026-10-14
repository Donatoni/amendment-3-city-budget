import { loadPublishedConfig } from '../../server/city-content.js';
import { configuredHTMLResponse } from '../../server/site-html.js';
import { readSharedPlan, resultURL, resultDescription } from '../../src/share-plan.js';

export async function onRequest({ request, env }) {
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const config = await loadPublishedConfig(env);
  const plan = readSharedPlan(new URL(request.url), config);
  if (!plan) return new Response(`This budget link is invalid or uses an older catalog. Return to ${config.city.url} to build a plan.`,{status:400,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
  const response = await configuredHTMLResponse(await env.ASSETS.fetch(new Request(new URL('/',request.url),{method:'GET'})), config);
  if (!response.ok) return response;
  const {title,description} = resultDescription(plan, config);
  const url = resultURL(config.city.url,plan.values,plan,false,config).split('#')[0];
  const image = resultURL(config.city.url,plan.values,plan,true,config);
  const metadata = {
    description, robots:'noindex, follow',
    'og:title':title,'og:description':description,'og:url':url,
    'og:image':image,'og:image:width':'1200','og:image:height':'630',
    'og:image:alt':`${title}. Personalized ${plan.theme} ${plan.side === 'front' ? 'postcard' : 'budget breakdown'} and service funding.`,
    'twitter:title':title,'twitter:description':description,'twitter:image':image,
    'twitter:image:alt':`${title}. Personalized postcard and budget results.`,
  };
  const rewritten = new HTMLRewriter()
    .on('title',{element(el){el.setInnerContent(title);}})
    .on('link[rel="canonical"]',{element(el){el.setAttribute('href',url);}})
    .on('meta',{element(el){const key=el.getAttribute('property')||el.getAttribute('name');if(Object.hasOwn(metadata,key))el.setAttribute('content',metadata[key]);}})
    .on('script[type="application/ld+json"]',{element(el){el.remove();}})
    .transform(response);
  const headers = new Headers(rewritten.headers);
  for (const key of ['Content-Length','Content-Encoding','ETag']) headers.delete(key);
  headers.set('Cache-Control','public, max-age=300');
  headers.set('X-Robots-Tag','noindex, follow');
  return new Response(request.method==='HEAD'?null:rewritten.body,{status:200,headers});
}
