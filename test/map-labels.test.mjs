import test from 'node:test';
import assert from 'node:assert/strict';
import {mapBounds,bridgeLabels,plotLabel,riverLabel} from '../src/map-labels.mjs';
test('map water coverage includes bridges outside planner region bounds',()=>{const bounds=mapBounds({regions:[{bounds:[0,0,100,100]}],roads:[{points:[[90,4,50],[900,4,-300]]}]},{x:0,z:0});assert.ok(bounds.x<=0&&bounds.z<-300&&bounds.x+bounds.size>900&&bounds.z+bounds.size>100);});
test('labels use registered names and stable unnamed feature identifiers',()=>{assert.equal(plotLabel({title:'教堂',login:'owner'}).text,'教堂');assert.equal(plotLabel({login:'owner'}).text,'owner 的领地');const r={bridge:true,points:[[0,4,0],[100,4,0]]};assert.equal(bridgeLabels([r])[0].text,bridgeLabels([{...r,points:[...r.points].reverse()}])[0].text);const a={riverId:'coastal:2:0:main',a:[0,0],b:[1,1]};assert.equal(riverLabel(a).id,riverLabel({...a,riverId:'coastal:2:1:main'}).id);});
