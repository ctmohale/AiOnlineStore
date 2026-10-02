// One-time addition to the 11 products already saved for this request.
// Run inside the API deployment; never prints or persists authentication tokens.
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {pool} from '../api-dist/server/db/pool.js';
import {signAdminToken} from '../api-dist/server/auth.js';
const MARKER = '[october-2026-100-products-v1]';
const TARGET = 89;
const BASE = 'https://api-production-093e2.up.railway.app/api/admin';
const temporary = new URL('./.october-collector.mjs', import.meta.url);
let locked = false;
const connection = await pool.getConnection();
try {
  const [lock] = await connection.query('SELECT GET_LOCK(?,0) AS acquired', [MARKER]);
  if (!lock[0].acquired) throw new Error('Another copy of this import is already running');
  locked = true;
  const [admins] = await connection.query('SELECT id,email,role FROM admins WHERE role=? ORDER BY id LIMIT 1', ['admin']);
  if (!admins.length) throw new Error('No administrator account exists');
  const token = signAdminToken({sub:String(admins[0].id), email:admins[0].email, role:admins[0].role});
  async function request(path, payload) {
    const response = await fetch(BASE + path, {method:payload ? 'POST' : 'GET', headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}, ...(payload ? {body:JSON.stringify(payload)} : {}), signal:AbortSignal.timeout(30000)});
    const body = await response.json();
    return {status:response.status, ok:response.ok, body};
  }
  const initial = await request('/products');
  if (!initial.ok || !Array.isArray(initial.body)) throw new Error('Cannot read existing products');
  const existing = initial.body;
  const baseline = ['CKSHK4FZYGX9THZY','CKSH4U9U5RZ8DEBH','CKSH4TAKUHNTKE3S','CKSHKMA7KCUAHHYG','CKSH4YEXXVDCASEY','CKSHD8ADWHDYNR8N','CKSHCHV4G9Y9ZPHE','CKSH4YFFGREZ83VF','CKSH4ZZ8SV2VNENA','CKSH4YSNQ7NAQ2GD','CKSH39E9JYCGHQYR'];
  if (baseline.some(sku=>!existing.some(p=>p.retailer==='Makro' && p.supplier_sku===sku))) throw new Error('Previously imported baseline changed; review task count');
  const already = existing.filter(p => String(p.internal_review_notes || '').includes(MARKER));
  if (already.length >= TARGET) { console.log(JSON.stringify({batch:MARKER,createdPreviously:already.length,remaining:0})); }
  else {
    const original = await readFile(new URL('./import-public-retailer-catalogue.mjs', import.meta.url), 'utf8');
    const boundary = original.indexOf('async function main()');
    if (boundary < 0) throw new Error('Collector layout changed; review required');
    process.env.IMPORT_LIVE = 'false';
    await writeFile(temporary, original.slice(0,boundary)+'\nexport {gameRequest, gameCandidate, initialState, findMakroProducts, makroCandidate};\n');
    const helpers = await import(temporary.href);
    const canonical = value => {try {const u=new URL(value);return (u.hostname+u.pathname).toLowerCase();} catch {return String(value || '').toLowerCase();}};
    const identities = new Set(existing.map(p => [p.brand,p.model,p.pack_size].map(v=>String(v || '').trim().toLowerCase()).join('|')));
    const sources = new Set(existing.map(p => canonical(p.source_url)));
    const skus = new Set(existing.map(p => `${p.retailer}|${p.supplier_sku}`));
    const now = Date.now();
    const queue = new Map();
    function consider(p) {
      if (!p || p.supplier.currentCost <= 200 || p.sellingPrice <= 200 || p.supplier.stockStatus === 'out_of_stock') return;
      if (p.supplier.promotionEndAt && Date.parse(p.supplier.promotionEndAt) <= now) return;
      const key = `${p.supplier.retailer}|${p.supplier.supplierSku}`;
      if (skus.has(key) || sources.has(canonical(p.supplier.sourceUrl)) || identities.has([p.brand,p.model,p.packSize].map(v=>String(v || '').trim().toLowerCase()).join('|'))) return;
      const cost=Number(p.supplier.currentCost), regular=Number(p.supplier.originalDisplayedPrice);
      p.sellingPrice=regular>cost ? Math.min(Math.round(cost*115)/100, Math.round(regular*100-1)/100) : Math.round(cost*105)/100;
      if (p.imageUrl) p.imageUrl=new URL(p.imageUrl,p.supplier.sourceUrl).href;
      // Listing observations do not fulfil the application's checkout-verification requirement.
      p.status='pending_review'; p.supplier.supplierPriceVerified=false; p.supplier.sourceConfidence='medium';
      p.estimatedCustomerDeliveryCost=0; delete p.deliveryTime;
      p.reviewNotes=MARKER+' Public source listing only. Verify exact variant, checkout price, delivery costs, stock, promotion eligibility, gallery and specifications before publication.';
      queue.set(key,p);
    }
    for (let page=0;page<80;page++) {
      const result = await helpers.gameRequest(`/occ/v2/game/channel/web/zone/G205/products/search?fields=FULL&currentPage=${page}`, {method:'POST',body:JSON.stringify({query:'sale:price-desc'})});
      for (const p of result.products || []) consider(helpers.gameCandidate(p));
      if ([...queue.values()].filter(p=>p.supplier.retailer==='Game').length >= 100) break;
    }
    for (let page=1;page<=15;page++) {
      const url=`https://www.makro.co.za/kitchen-cookware-serveware/cookware/cookware-sets/pr?page=${page}&sid=upp%2Ctnx%2Cqvz`;
      const r=await fetch(url,{signal:AbortSignal.timeout(30000)});
      if (!r.ok) throw new Error('Makro catalogue fetch failed: '+r.status);
      for (const p of helpers.findMakroProducts(helpers.initialState(await r.text())).values()) consider(helpers.makroCandidate(p));
      if ([...queue.values()].filter(p=>p.supplier.retailer==='Makro').length >= 100) break;
    }
    // Catalogue offer is held for review: the exact nappy/pants size, membership
    // eligibility, resale restrictions and product gallery remain unconfirmed.
    const shoprite = {title:'Pampers Jumbo Pack Disposable Nappies/Pants',brand:'Pampers',model:'',packSize:'Jumbo pack; size and count require confirmation',category:'Baby nappies',description:'Pampers jumbo pack nappies or pants advertised in the Shoprite catalogue. Exact size and pack count require supplier confirmation.',specifications:{},sellingPrice:298.99,status:'pending_review',reviewNotes:MARKER+' Catalogue candidate only. Confirm exact variant, regional/member eligibility, resale restrictions, checkout price, stock, delivery costs and gallery before publication.',supplier:{retailer:'Shoprite',sourceUrl:'https://www.cataloguespecials.co.za/view/specials/shoprite-catalogue-3812063?offer=68089907',supplierSku:'catalogue-68089907',currentCost:259.99,originalDisplayedPrice:329.99,supplierDeliveryCost:0,promotionEndAt:'2026-10-11T21:59:59.000Z',promotionEndProvided:true,promotionTerms:'Catalogue promotion; membership, regional and resale eligibility require confirmation.',stockStatus:'unknown',sourceConfidence:'low',supplierPriceVerified:false}};
    if (now >= Date.parse(shoprite.supplier.promotionEndAt)) throw new Error('Shoprite catalogue expired; replace candidate before proceeding');
    const settings = await request('/pricing-settings');
    if (!settings.ok || Number(settings.body.standard_markup_percent)!==5) throw new Error('Pricing settings changed; review pricing before import');
    const taggedBy = retailer => already.filter(p=>p.retailer===retailer).length;
    const saleSort = (a,b) => Number(b.sale)-Number(a.sale) || b.sellingPrice-a.sellingPrice;
    const game=[...queue.values()].filter(p=>p.supplier.retailer==='Game').sort(saleSort).slice(0,44-taggedBy('Game'));
    const makro=[...queue.values()].filter(p=>p.supplier.retailer==='Makro').sort(saleSort).slice(0,44-taggedBy('Makro'));
    const shopriteQueue=taggedBy('Shoprite') ? [] : [shoprite];
    if (game.length+makro.length+shopriteQueue.length !== TARGET-already.length) throw new Error('Insufficient distinct qualifying products; no import started');
    let created=0;
    for (const candidate of [...shopriteQueue,...game,...makro]) {
      const {sale,...payload}=candidate;
      const result=await request('/products',payload);
      if (!result.ok) throw new Error(`Import stopped after ${created} additions: HTTP ${result.status} for ${candidate.title}. Rerun safely using the batch marker.`);
      created++;
      console.log(JSON.stringify({created,total:TARGET,retailer:candidate.supplier.retailer,title:candidate.title,status:'pending_review'}));
    }
    const final=await request('/products');
    const saved=final.body.filter(p=>String(p.internal_review_notes || '').includes(MARKER));
    if (!final.ok || saved.length!==TARGET || saved.some(p=>p.status!=='pending_review'||Number(p.selling_price)<=200||Number(p.current_cost)<=200)) throw new Error('Final batch verification failed');
    console.log(JSON.stringify({batch:MARKER,verified:saved.length,previousTaskAdditions:11,taskTotal:100,retailers:Object.fromEntries(['Makro','Game','Shoprite'].map(r=>[r,saved.filter(p=>p.retailer===r).length]))}));
  }
} finally {
  await unlink(temporary).catch(()=>{});
  if (locked) await connection.query('SELECT RELEASE_LOCK(?)',[MARKER]);
  connection.release();
  await pool.end();
}
