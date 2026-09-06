import {AsyncLocalStorage} from 'node:async_hooks';
import pg from 'pg';

// The shared SQL uses SQLite placeholders; only unquoted tokens are translated.
function postgresSql(sql){
  let parameter=0;const statements=[''],words={INTEGER:'BIGINT',REAL:'DOUBLE PRECISION',USER:'"user"'};
  for(const token of sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|\w+|./gs)||[]){
    if(token===';')statements.push('');
    else statements[statements.length-1]+=token==='?'?'$'+(++parameter):words[token.toUpperCase()]||token;
  }
  return statements.map(statement=>{
    if(!/^\s*INSERT OR IGNORE\b/i.test(statement))return statement;
    return statement.replace(/INSERT OR IGNORE/i,'INSERT')+' ON CONFLICT DO NOTHING';
  }).join(';');
}

export async function openDatabase(source){
  const postgres=/^postgres(?:ql)?:\/\//.test(source),context=new AsyncLocalStorage();
  let pool,sqlite,tail=Promise.resolve(),savepoint=0;
  if(postgres){
    pool=new pg.Pool({connectionString:source,max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,
      types:{getTypeParser:(oid,format)=>oid===20?value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('Database integer exceeds safe range');return n;}:pg.types.getTypeParser(oid,format)}});
    pool.on('error',()=>console.error('PostgreSQL idle connection failed'));
    try{await pool.query('SELECT 1');}catch(error){await pool.end();throw error;}
  }else{
    const {DatabaseSync}=await import('node:sqlite');sqlite=new DatabaseSync(source);
    sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  }
  function exclusive(fn){const pending=tail.then(fn);tail=pending.catch(()=>{});return pending;}
  async function execute(sql,args=[],kind='all'){
    const active=context.getStore();
    if(postgres){
      const result=await (active?.client||pool).query(postgresSql(sql),args);
      return kind==='run'?{changes:result.rowCount}:kind==='get'?result.rows[0]:result.rows;
    }
    const run=()=>kind==='exec'?sqlite.exec(sql):sqlite.prepare(sql)[kind](...args);
    return active?run():exclusive(run);
  }
  async function transaction(fn){
    const active=context.getStore();
    if(active){
      const name='nested_'+(++savepoint);await execute('SAVEPOINT '+name,[],'exec');
      try{const result=await fn();await execute('RELEASE SAVEPOINT '+name,[],'exec');return result;}
      catch(error){await execute('ROLLBACK TO SAVEPOINT '+name,[],'exec');await execute('RELEASE SAVEPOINT '+name,[],'exec');throw error;}
    }
    const run=async()=>{
      const client=postgres?await pool.connect():null;
      try{return await context.run({client},async()=>{
        await execute(postgres?'BEGIN':'BEGIN IMMEDIATE',[],'exec');
        try{
          // Serialize world writes across connections: polygon clearance has no unique index.
          if(postgres)await execute('SELECT pg_advisory_xact_lock(73920481)');
          const result=await fn();await execute('COMMIT',[],'exec');return result;
        }catch(error){await execute('ROLLBACK',[],'exec');throw error;}
      });}finally{client?.release();}
    };
    return postgres?run():exclusive(run);
  }
  return {postgres,transaction,
    exec:sql=>execute(sql,[],'exec'),
    prepare:sql=>Object.fromEntries(['all','get','run'].map(kind=>[kind,(...args)=>execute(sql,args,kind)])),
    columns:table=>postgres?execute('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=?',[table]):execute('PRAGMA table_info('+table+')'),
    close:async()=>{await tail;if(pool)await pool.end();else sqlite.close();}
  };
}
