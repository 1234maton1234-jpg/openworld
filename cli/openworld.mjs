#!/usr/bin/env node
import {readFile,writeFile,mkdir,chmod,unlink,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {pathToFileURL} from 'node:url';
import {fetchAuthoring,CLI_VERSION} from './compatibility.mjs';

export async function run(args=process.argv.slice(2)){
  if(args.length===1&&args[0]==='--version'){console.log(CLI_VERSION);return;}
  const options={};const words=[];for(let i=0;i<args.length;i++){if(args[i].startsWith('--')){const key=args[i].slice(2);if(!['server','title','plot','category','config','help','token','no-browser'].includes(key))throw new Error('未知参数 --'+key);options[key]=['help','token','no-browser'].includes(key)?true:args[++i];if(options[key]===undefined)throw new Error('参数缺少值');}else words.push(args[i]);}
  if(!words.length||options.help){console.log('openworld --version\nopenworld rules [--server URL]\nopenworld login [--server URL]\nopenworld whoami\nopenworld logout\nopenworld avatar set FILE.glb\nopenworld vehicle set FILE.glb [--category car|plane|boat]\nopenworld plot upload FILE.glb --title NAME [--plot X,Z]\nopenworld plot submit DRAFT_ID\nlogin 默认打开浏览器授权；--no-browser 仅显示链接；--token 使用环境变量或标准输入 Token。');return;}
  const configPath=options.config||process.env.OPENWORLD_CLI_CONFIG||join(homedir(),'.openworld','credentials.json');let saved;try{saved=JSON.parse(await readFile(configPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const url=new URL(options.server||(words[0]==='login'?'https://openworldcraft.com':saved?.server)||'https://openworldcraft.com');if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error('服务器须为 HTTPS 源地址；仅本机允许 HTTP');const server=url.origin;
  const login=words[0]==='login';
  const authoring=words[0]==='logout'?null:await fetchAuthoring(server,{required:words[0]==='rules'});
  if(words[0]==='rules'){console.log(JSON.stringify(authoring,null,2));return;}
  if(!authoring&&words[0]!=='logout')console.error('服务器尚未提供实时建模规则；本次未验证兼容性。');
  if(!login&&(!saved||saved.server!==server))throw new Error('请先对该服务器执行 login');
  async function request(path,{method='GET',json,body}={}){const headers={Origin:server};if(!login){headers.Cookie=saved.cookie;headers['X-CSRF-Token']=saved.csrf;}if(json){headers['Content-Type']='application/json';body=JSON.stringify(json);}else if(body)headers['Content-Type']='model/gltf-binary';const res=await fetch(server+path,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(60000)});const result=await res.json();if(!res.ok)throw new Error(result.error||'请求失败');return {result,cookie:res.headers.get('set-cookie')?.split(';')[0]};}
  if(login){
    let auth;
    if(!options.token&&!process.env.OPENWORLD_GITHUB_TOKEN){
      const {result:start}=await request('/api/cli/authorize/start',{method:'POST',json:{}});const link=new URL(start.url);if(link.origin!==server)throw Error('授权地址不匹配');
      console.log('授权码：'+start.code+'\n请在浏览器确认：'+link.href);
      if(!options['no-browser']){const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open',args=process.platform==='win32'?['url.dll,FileProtocolHandler',link.href]:[link.href];const child=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>console.log('无法自动打开浏览器，请手动打开上方链接。'));child.unref();}
      const deadline=Date.now()+Math.min(start.expiresIn,600)*1000;
      while(Date.now()<deadline){await new Promise(r=>setTimeout(r,2000));const response=await request('/api/cli/authorize/poll',{method:'POST',json:{secret:start.secret}});if(response.result.status==='denied')throw Error('用户拒绝了授权');if(response.result.status==='approved'){auth=response;break;}}
      if(!auth)throw Error('授权超时，请重新执行 login');
    }else{let token=process.env.OPENWORLD_GITHUB_TOKEN;if(!token){if(process.stdin.isTTY){const rl=createInterface({input:process.stdin,output:process.stdout});try{await rl.question('为避免回显 Token，请设置 OPENWORLD_GITHUB_TOKEN 或通过管道输入后重试。按 Enter 退出。');}finally{rl.close();}throw new Error('未提供 GitHub Token');}else{token='';for await(const chunk of process.stdin){token+=chunk;if(token.length>1024)throw new Error('Token 过长');}token=token.trim();}}const json={githubToken:token},path='/api/cli/login';
    auth=await request(path,{method:'POST',json});}
    const {result,cookie}=auth;if(!cookie||!result.csrf)throw new Error('服务器未返回有效会话');await mkdir(dirname(configPath),{recursive:true,mode:0o700});await writeFile(configPath,JSON.stringify({server,cookie,csrf:result.csrf}),{mode:0o600});await chmod(configPath,0o600);console.log('已登录 @'+result.user.login);return;
  }
  if(words[0]==='logout'){await request('/api/logout',{method:'POST'});await unlink(configPath);console.log('已退出');return;}
  if(words[0]==='whoami'){const {result}=await request('/api/session');if(!result.user)throw new Error('会话已过期，请重新登录');console.log(JSON.stringify(result.user,null,2));return;}
  if(words[0]==='plot'&&words[1]==='submit'){if(!/^[a-f0-9-]{36}$/.test(words[2]||''))throw new Error('请指定 upload 返回的模型 ID');console.log(JSON.stringify((await request('/api/cli/plots/'+words[2]+'/submit',{method:'POST'})).result,null,2));return;}
  const avatar=words[0]==='avatar'&&words[1]==='set',vehicle=words[0]==='vehicle'&&words[1]==='set',plot=words[0]==='plot'&&words[1]==='upload';if(!avatar&&!vehicle&&!plot)throw new Error('未知命令，使用 --help');if(!words[2])throw new Error('请指定 GLB 文件');if(plot&&!options.title)throw new Error('请指定 --title');if(options.plot&&!/^-?\d+,-?\d+$/.test(options.plot))throw new Error('--plot 格式须为 X,Z');const file=await stat(words[2]);if(!file.isFile()||file.size>12*1024*1024)throw new Error('模型须为不超过 12 MB 的文件');const body=await readFile(words[2]);const path=avatar?'/api/avatar':vehicle?'/api/vehicle?category='+encodeURIComponent(options.category||'car'):'/api/cli/plots/upload?title='+encodeURIComponent(options.title)+(options.plot?'&plot='+encodeURIComponent(options.plot):'');console.log(JSON.stringify((await request(path,{method:avatar||vehicle?'PUT':'POST',body})).result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)run().catch(e=>{console.error(e.message);process.exitCode=1;});
