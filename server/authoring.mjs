import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {RULES} from './store.mjs';
import {VEHICLE_TYPES} from '../shared/vehicle-types.mjs';
import {CLI_VERSION} from '../cli/compatibility.mjs';

export async function authoringContract(){
  const modelRules=await readFile(new URL('../skills/openworld-builder/references/model-rules.md',import.meta.url),'utf8');
  const contract={schemaVersion:1,cli:{latestVersion:CLI_VERSION,minimumVersion:'1.0.0',protocolVersion:1},rules:RULES,vehicles:VEHICLE_TYPES,modelRules};
  return {...contract,revision:createHash('sha256').update(JSON.stringify(contract)).digest('hex')};
}
