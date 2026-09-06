import {createApp} from './app.mjs';
const production=process.env.NODE_ENV==='production',port=Number(process.env.PORT||8787);
const config={production,databaseUrl:process.env.DATABASE_URL,url:process.env.PUBLIC_URL||`http://127.0.0.1:${port}`,dataDir:process.env.DATA_DIR||'./data',clientId:process.env.GITHUB_CLIENT_ID||'',clientSecret:process.env.GITHUB_CLIENT_SECRET||'',adminIds:(process.env.ADMIN_GITHUB_IDS||'').split(',').map(s=>s.trim()).filter(Boolean)};
const host=process.env.HOST||'127.0.0.1';
const {app,store}=(await createApp(config));const server=app.listen(port,host,()=>console.log(`openworld: ${config.url}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async ()=>{(await store.close());process.exit(0);}));
