import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateResult } from '../result-schema.js';

const valid = () => ({ schemaVersion:1, modelId:'potts', ids:[1,2], positions:[[0,0,0],[1,0,0]], bounds:[[0,2],[0,2],[0,2]], spacing:1,
  frames:[{time:0,states:[1,2],energy:2},{time:1,states:[2,2],energy:0}] });

test('accepts fixed lattice results and missing energy',()=>{const data=valid();data.frames[1].energy=null;assert.equal(validateResult(data),data);});
test('rejects malformed imports before replacing current data',()=>{
  const mutations=[d=>d.ids[1]=1,d=>d.positions[0][0]=NaN,d=>d.positions[0][0]=10,d=>d.frames[1].time=0,
    d=>d.frames[0].states.pop(),d=>d.frames[0].energy=-2,d=>d.spacing=0,d=>d.modelId='unknown',d=>d.parameters={seed:'abc'},d=>d.ids=null];
  for(const mutate of mutations){const data=valid();mutate(data);assert.throws(()=>validateResult(data));}
});
