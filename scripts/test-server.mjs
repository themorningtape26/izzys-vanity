// Static test fixture only. Production uses Vercel's authenticated API functions.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const root=new URL('../dist/',import.meta.url);
http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=new URL(path==='/'?'index.html':path.slice(1),root);if(!file.href.startsWith(root.href))throw Error();const body=await readFile(file);res.setHeader('Content-Type',file.pathname.endsWith('.js')?'text/javascript':file.pathname.endsWith('.css')?'text/css':'text/html');res.end(body);}catch{res.writeHead(404);res.end();}}).listen(4189,'127.0.0.1');
