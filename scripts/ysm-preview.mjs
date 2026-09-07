import {createServer} from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {loadSource,loadYsm} from './ysm/assets.mjs';

const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原生模型预览 · Openworld</title><style>
*{box-sizing:border-box}body{margin:0;background:#edf0f4;color:#263244;font:15px/1.6 system-ui}main{display:grid;grid-template-columns:310px 1fr;height:100vh}aside{padding:28px 24px;background:#fff;border-right:1px solid #dce1e8;overflow:auto}h1{font-size:23px;margin:0 0 8px}small{color:#66758b}label{display:block;margin-top:24px;font-weight:600}select,input{width:100%;margin-top:8px;padding:8px;border:1px solid #cbd3df;border-radius:7px;background:white;color:inherit}#info{white-space:pre-line;margin-top:24px}#warnings{font-size:13px;color:#795c2c}#status{margin-top:24px;font-size:13px;color:#51627c}#stage{min-width:0;min-height:0}canvas{display:block} @media(max-width:700px){main{grid-template-columns:1fr;grid-template-rows:280px 1fr}aside{padding:15px;overflow:auto}label{margin-top:8px}}
input[type=checkbox]{width:auto;margin-right:8px}details{margin-top:20px}#parts{max-height:160px;overflow:auto}#parts label{margin-top:3px;font-size:13px}
</style><main><aside><small>OPENWORLD · 本地试验</small><h1>原生模型预览</h1><p>直接读取模型资源，无需转换 GLB。</p><label>角色<select id="model"></select></label><label>动作<select id="animation"></select></label><label>贴图<select id="texture"></select></label><details><summary>部件显示</summary><div id="parts"></div></details><label>试读 .ysm 文件<input id="file" type="file" accept=".ysm"></label><div id="info"></div><div id="warnings"></div><div id="status">正在加载…</div></aside><section id="stage"></section></main><script type="module" src="/viewer.js"></script></html>`;
export async function startPreview(input,{model,port=0}={}){
  const initial=await loadSource(input,model),result=await build({entryPoints:[fileURLToPath(new URL('./ysm/viewer.mjs',import.meta.url))],bundle:true,format:'esm',write:false,target:'es2022'}),js=result.outputFiles[0].contents;
  let busy=false;
  const server=createServer(async(req,res)=>{
    const origin='http://127.0.0.1:'+server.address().port;
    const reply=(code,data,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(type==='application/json'?JSON.stringify(data):data);};
    if(req.headers.host!==origin.slice(7))return reply(403,{error:'Invalid host'});
    if(req.method==='GET'&&req.url==='/')return reply(200,html,'text/html; charset=utf-8');
    if(req.method==='GET'&&req.url==='/viewer.js')return reply(200,js,'text/javascript');
    if(req.method==='GET'&&req.url==='/model')return reply(200,initial);
    if(req.method!=='POST'||req.url!=='/model')return reply(404,{error:'Not found'});
    if(req.headers.origin!==origin)return reply(403,{error:'Invalid origin'});
    if(busy)return reply(503,{error:'另一个模型正在解析'});
    busy=true;
    try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024){reply(413,{error:'YSM 文件不能超过 12 MB'});req.resume();return;}chunks.push(chunk);}reply(200,{models:[await loadYsm(Buffer.concat(chunks))]});}
    catch(error){reply(400,{error:error.message.slice(0,1200)});}finally{busy=false;}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2),input=args.shift();
  if(!input||input==='--help')console.log('Usage: node scripts/ysm-preview.mjs FILE.ysm|ASSETS_DIRECTORY [--model NAME] [--port PORT]\nYSM files require JDK 21+ and Node.js 22.15+. GeckoLib assets require only Node.js.');
  else{const options={};for(let i=0;i<args.length;i+=2){if(!['--model','--port'].includes(args[i])||!args[i+1])throw Error('Invalid option');options[args[i].slice(2)]=args[i]==='--port'?Number(args[i+1]):args[i+1];}startPreview(input,options).then(s=>console.log('Native model preview: http://127.0.0.1:'+s.address().port)).catch(e=>{console.error(e.message);process.exitCode=1;});}
}
