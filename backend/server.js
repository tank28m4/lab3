import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function createApp({dbPath='data/shop.sqlite', token=process.env.TELEGRAM_BOT_TOKEN, apiKey=process.env.BACKEND_API_KEY, demo=false}={}) {
  if (dbPath !== ':memory:') mkdirSync(fileURLToPath(new URL('./data/', import.meta.url)), {recursive:true});
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL CHECK(stock>=0));
    CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, product_id INTEGER REFERENCES products(id), quantity INTEGER NOT NULL, total INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT OR IGNORE INTO products VALUES(1,'Notebook',500,20),(2,'Pen set',300,30),(3,'Backpack',2500,10);`);
  function identity(req, body) {
    if (apiKey && req.headers['x-api-key'] === apiKey && /^\d+$/.test(String(body.user_id))) return String(body.user_id);
    const raw=req.headers['x-telegram-init-data'];
    if(raw && token) {
      const p=new URLSearchParams(raw), hash=p.get('hash'); p.delete('hash');
      const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
      const secret=createHmac('sha256','WebAppData').update(token).digest();
      const expected=createHmac('sha256',secret).update(check).digest();
      if(!hash || !/^[a-f0-9]{64}$/.test(hash) || !timingSafeEqual(expected,Buffer.from(hash,'hex'))) throw Error('Unauthorized');
      const age=Math.floor(Date.now()/1000)-Number(p.get('auth_date'));
      if(!Number.isFinite(age) || age<0 || age>3600) throw Error('Unauthorized');
      const user=JSON.parse(p.get('user')||'{}');
      if(!Number.isSafeInteger(user.id) || user.id<=0) throw Error('Unauthorized');
      return String(user.id);
    }
    if(demo) return '1';
    throw Error('Unauthorized');
  }
  const server=http.createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET' && path==='/') {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(readFileSync(new URL('./index.html',import.meta.url)));return;}
      if(req.method==='GET' && path==='/health') return send(200,{status:'ok'});
      if(req.method==='GET' && path==='/api/products') return send(200,db.prepare('SELECT * FROM products ORDER BY id').all());
      let body={};
      if(req.method==='POST') {
        let raw=''; for await(const chunk of req) {raw+=chunk; if(Buffer.byteLength(raw)>16384) return send(413,{error:'Request too large'});}
        try {body=JSON.parse(raw);} catch {return send(400,{error:'Invalid JSON'});}
        if(!body || typeof body!=='object' || Array.isArray(body)) return send(400,{error:'Invalid body'});
      }
      if(path==='/api/orders' && ['GET','POST'].includes(req.method)) {
        if(req.method==='GET') body.user_id=new URL(req.url,'http://localhost').searchParams.get('user_id');
        const user=identity(req,body);
        if(req.method==='GET') return send(200,db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(user));
        const {product_id,quantity}=body;
        if(!Number.isSafeInteger(product_id)||!Number.isSafeInteger(quantity)||quantity<1||quantity>100) return send(400,{error:'Choose a valid product and quantity (1–100)'});
        db.exec('BEGIN IMMEDIATE');
        try {
          const p=db.prepare('SELECT * FROM products WHERE id=?').get(product_id);
          if(!p) {db.exec('ROLLBACK');return send(404,{error:'Product not found'});}
          if(p.stock<quantity) {db.exec('ROLLBACK');return send(409,{error:'Not enough stock'});}
          db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(quantity,product_id);
          const result=db.prepare('INSERT INTO orders(user_id,product_id,quantity,total) VALUES(?,?,?,?)').run(user,product_id,quantity,p.price*quantity);
          db.exec('COMMIT');return send(201,db.prepare('SELECT * FROM orders WHERE id=?').get(result.lastInsertRowid));
        } catch(e) {db.exec('ROLLBACK');throw e;}
      }
      send(404,{error:'Not found'});
    } catch(e) {send(e.message==='Unauthorized'?401:500,{error:e.message==='Unauthorized'?'Unauthorized':'Internal server error'});}
  });
  server.on('close',()=>db.close());return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const demo=process.env.DEMO_MODE==='1';
  if(!demo && (!process.env.TELEGRAM_BOT_TOKEN || !process.env.BACKEND_API_KEY)) throw Error('Set TELEGRAM_BOT_TOKEN and BACKEND_API_KEY, or DEMO_MODE=1 for local testing');
  createApp({demo,dbPath:process.env.DB_PATH||fileURLToPath(new URL('./data/shop.sqlite',import.meta.url))}).listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log('Shop backend started'));
}
