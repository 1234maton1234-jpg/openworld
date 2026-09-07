import {spawn} from 'node:child_process';
import {readdir,readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import * as zlib from 'node:zlib';

const root=fileURLToPath(new URL('../../',import.meta.url)),source=join(root,'scripts/ysm/java');
const MAX=64*1024*1024;
let compilation;
async function files(dir){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())result.push(...await files(p));else if(p.endsWith('.java'))result.push(p);}return result.sort();}
function processBytes(command,args,input,timeout=30000){return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{windowsHide:true,stdio:['pipe','pipe','pipe']}),out=[],err=[];let size=0,errSize=0,failure;
  const timer=setTimeout(()=>{failure=new Error('YSM parser timed out');child.kill();},timeout);
  child.on('error',error=>{clearTimeout(timer);reject(new Error(command+' failed: '+error.message+' (requires JDK 21+)'));});
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>MAX){failure=new Error('YSM parser output exceeds 64 MB');child.kill();}else out.push(chunk);});
  child.stderr.on('data',chunk=>{if(errSize<8192){err.push(chunk);errSize+=chunk.length;}});
  child.on('close',code=>{clearTimeout(timer);if(failure)reject(failure);else if(code!==0)reject(new Error(Buffer.concat(err).toString('utf8').slice(0,8192)||'YSM parser failed'));else resolve(Buffer.concat(out));});
  child.stdin.on('error',()=>{});child.stdin.end(input);
});}
async function compile(){
  const paths=await files(source),hash=createHash('sha256');
  for(const path of paths)hash.update(await readFile(path));
  const dir=join(root,'work/ysm-classes',hash.digest('hex').slice(0,16));await mkdir(dir,{recursive:true});
  try{await readFile(join(dir,'Codec.class'));}catch{await processBytes('javac',['-encoding','UTF-8','-d',dir,...paths],Buffer.alloc(0),60000);}
  return dir;
}
export async function runCodec(mode,bytes){
  compilation??=compile().catch(error=>{compilation=null;throw error;});
  return processBytes('java',['-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8','-Xmx256m','-XX:MaxDirectMemorySize=64m','-cp',await compilation,'Codec',mode],bytes);
}
export function washZstd(input){
  const data=Buffer.from(input);
  if(data.length<6||data.readUInt32LE(0)!==0xfd2fb528)throw Error('Invalid YSM Zstandard frame');
  const descriptor=data[4],single=!!(descriptor&32),dict=[0,1,2,4][descriptor&3],fcs=[single?1:0,2,4,8][descriptor>>>6];
  let offset=5+(single?0:1)+dict+fcs;data[4]&=0xfb;
  while(offset+3<=data.length){
    const b=data[offset],last=b>>>7,type=[2,1,3,0][(b>>>5)&3],size=(((b&31)<<16)|data[offset+1]|(data[offset+2]<<8))^0xd4e9;
    if(type===3||size>131072)throw Error('Invalid YSM Zstandard block');
    const end=offset+3+(type===1?1:size);if(end>data.length)throw Error('Truncated YSM Zstandard block');
    data.writeUIntLE(last|(type<<1)|(size<<3),offset,3);offset=end;
    if(last){if(offset!==data.length&&offset+4!==data.length)throw Error('Unexpected YSM Zstandard trailing data');return data.subarray(0,offset);}
  }
  throw Error('Truncated YSM Zstandard block');
}
export async function parseYsmBinary(bytes){
  if(bytes.length>MAX)throw Error('YSM decompressed data exceeds 64 MB');
  return JSON.parse((await runCodec('parse',bytes)).toString('utf8'));
}
export async function decodeYsm(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<80)throw Error('Invalid or truncated YSM file');
  if(bytes.length>12*1024*1024)throw Error('YSM file exceeds 12 MB');
  if(!zlib.zstdDecompressSync)throw Error('YSM preview requires Node.js 22.15+ with Zstandard support');
  const compressed=washZstd(await runCodec('unpack',bytes));
  return parseYsmBinary(zlib.zstdDecompressSync(compressed,{maxOutputLength:MAX}));
}
