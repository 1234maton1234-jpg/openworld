import {build} from 'esbuild';
await build({entryPoints:['src/main.mjs'],bundle:true,minify:true,format:'esm',outfile:'public/app.js',target:'es2022'});
await build({entryPoints:['src/road-markings-worker.mjs'],bundle:true,minify:true,format:'esm',outfile:'public/road-markings-worker.js',target:'es2022'});
console.log('Built public/app.js');
