import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from './server.js';

test('catalog, authenticated orders, stock, history and Mini App signature',async()=>{
 const app=createApp({dbPath:':memory:',apiKey:'test-key',token:'test-token'});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.address().port}`;
 const headers={'Content-Type':'application/json','X-Api-Key':'test-key'};
 const order=(data,h=headers)=>fetch(base+'/api/orders',{method:'POST',headers:h,body:JSON.stringify(data)});
 try {
  assert.equal((await fetch(base+'/health')).status,200);
  assert.match(await (await fetch(base+'/')).text(),/Campus Shop/);
  assert.equal((await (await fetch(base+'/api/products')).json()).length,3);
  assert.equal((await order({user_id:123,product_id:1,quantity:2},{})).status,401);
  const first=await order({user_id:123,product_id:1,quantity:2});assert.equal(first.status,201);assert.equal((await first.json()).total,1000);
  assert.equal((await order({user_id:123,product_id:1,quantity:0})).status,400);
  assert.equal((await order({user_id:123,product_id:999,quantity:1})).status,404);
  assert.equal((await order({user_id:123,product_id:1,quantity:19})).status,409);
  assert.equal((await (await fetch(base+'/api/products')).json())[0].stock,18);
  assert.equal((await (await fetch(base+'/api/orders?user_id=123',{headers})).json()).length,1);
  assert.equal((await (await fetch(base+'/api/orders?user_id=456',{headers})).json()).length,0);
  const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:456})});
  const secret=createHmac('sha256','WebAppData').update('test-token').digest();
  const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  p.set('hash',createHmac('sha256',secret).update(check).digest('hex'));
  const signed={'Content-Type':'application/json','X-Telegram-Init-Data':p.toString()};
  assert.equal((await order({user_id:999,product_id:2,quantity:1},signed)).status,201);
  const history=await (await fetch(base+'/api/orders',{headers:signed})).json();assert.equal(history[0].user_id,'456');
  signed['X-Telegram-Init-Data']+='tampered';assert.equal((await fetch(base+'/api/orders',{headers:signed})).status,401);
 }finally{await new Promise(r=>app.close(r));}
});
