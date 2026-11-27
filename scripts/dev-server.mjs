import http from 'node:http';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const {default:config}=await import('../api/config.js');
const {default:identify}=await import('../api/identify.js');
const root=new URL('../dist/',import.meta.url);
http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/api/config')return config(req,res);
    if(path==='/api/identify'){
      let text='';for await(const chunk of req){text+=chunk;if(text.length>3_100_000){res.statusCode=413;return res.end();}}
      try{req.body=JSON.parse(text||'{}');}catch{return res.status(400).json({error:'Invalid request.'});}
      return identify(req,res);
    }
    const file=new URL(path==='/'?'index.html':path.slice(1),root);if(!file.href.startsWith(root.href))throw Error();
    const body=await readFile(file);res.setHeader('Content-Type',file.pathname.endsWith('.js')?'text/javascript':file.pathname.endsWith('.css')?'text/css':'text/html');res.end(body);
  }catch{res.statusCode=404;res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.log('Local review: http://127.0.0.1:4173 (not deployed)'));
