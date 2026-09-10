export const CLI_VERSION='1.1.0';
const UPDATE_URL='https://github.com/Mirako-Official/openworld-builder';
function version(value){if(typeof value!=='string'||!/^\d+\.\d+\.\d+$/.test(value))throw Error('Invalid CLI version in server contract');const parts=value.split('.').map(Number);if(!parts.every(Number.isSafeInteger))throw Error('Invalid CLI version in server contract');return parts;}
function older(a,b){const left=version(a),right=version(b);for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]<right[i];return false;}
export async function fetchAuthoring(server,{required=false}={}){
  const response=await fetch(server+'/api/cli/authoring',{headers:{Accept:'application/json'},credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(response.status===404){if(required)throw Error('Server does not provide live modeling rules yet; retry after the server is upgraded.');return null;}
  if(!response.ok)throw Error('Compatibility check failed: HTTP '+response.status);
  const data=await response.json();
  if(!data||!data.cli||!Number.isInteger(data.schemaVersion)||!Number.isInteger(data.cli.protocolVersion)||typeof data.revision!=='string'||typeof data.modelRules!=='string'||!data.modelRules.trim()||!data.rules||typeof data.rules!=='object')throw Error('Invalid server authoring contract');
  version(data.cli.latestVersion);version(data.cli.minimumVersion);
  if(data.schemaVersion!==1||data.cli.protocolVersion!==1||older(CLI_VERSION,data.cli.minimumVersion))throw Error('CLI '+CLI_VERSION+' is incompatible with this server. Update the complete skill from '+UPDATE_URL);
  return data;
}
