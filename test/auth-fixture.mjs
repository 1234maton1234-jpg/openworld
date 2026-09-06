import {randomBytes,createHash} from 'node:crypto';

export function testSession(store,id='1001'){
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
  store.upsertUser(id,'test-user-'+id);
  store.db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,csrf,Date.now()+60000);
  return {cookie:'town_session='+token,csrf};
}
