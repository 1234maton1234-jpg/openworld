import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fetchAuthoring} from './compatibility.mjs';

try{
  const options={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--server','--config'].includes(key)||!process.argv[i+1])throw Error('Usage: context.mjs [--server URL] [--config PATH]');options[key]=process.argv[i+1];}
  const saved=JSON.parse(await readFile(options['--config']||process.env.OPENWORLD_CLI_CONFIG||join(homedir(),'.openworld','credentials.json'),'utf8'));
  const url=new URL(options['--server']||saved.server);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Use HTTPS, or a local HTTP server');
  if(url.origin!==saved.server)throw Error('Log in to the selected server first');
  const authoring=await fetchAuthoring(url.origin,{required:true});
  async function get(path){const response=await fetch(url.origin+path,{headers:{Cookie:saved.cookie},redirect:'error',signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Context request failed: HTTP '+response.status);return response.json();}
  const session=await get('/api/session');if(!session.user)throw Error('Session expired; run login');
  const mine=await get('/api/mine'),plot=mine.plot;
  const polygon=plot&&(plot.polygon||[[plot.cx-plot.width/2,plot.cz-plot.depth/2],[plot.cx+plot.width/2,plot.cz-plot.depth/2],[plot.cx+plot.width/2,plot.cz+plot.depth/2],[plot.cx-plot.width/2,plot.cz+plot.depth/2]]);
  console.log(JSON.stringify({server:url.origin,user:session.user,plot,localPolygon:polygon?.map(([x,z])=>[x-plot.cx,z-plot.cz])||null,rules:authoring.rules,authoring,submissions:mine.submissions.map(({id,status,title,note})=>({id,status,title,note}))},null,2));
}catch(error){console.error(error.code==='ENOENT'?'No CLI session. Run login first.':error.message);process.exitCode=1;}
