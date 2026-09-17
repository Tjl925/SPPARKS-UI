import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDraft,explainError} from '../guidance.js';

const film={id:'thin_film',parameters:[
  {id:'size',label:'尺寸',min:16,max:48,type:'integer'},
  {id:'flux',label:'沉积率',min:5e-10,max:5e-9,step:1e-10,type:'number'},
  {id:'duration',label:'终止时间',min:1e10,max:3e11,step:1e10,type:'number'}
]};
test('decimal steps and coupled deposition limit are validated before submission',()=>{
  assert.equal(validateDraft(film,{size:'32',flux:'2e-9',duration:'2e11'}),null);
  assert.equal(validateDraft(film,{size:'32',flux:'2.05e-9',duration:'2e11'}).field,'flux');
  assert.equal(validateDraft(film,{size:'16',flux:'5e-9',duration:'3e11'}).field,'flux');
  assert.equal(validateDraft(film,{size:'',flux:'2e-9',duration:'2e11'}).field,'size');
});
test('uncertain submission is never described as a definite failed start',()=>{
  assert.match(explainError(new TypeError('Failed to fetch'),'submit').message,/可能已被服务接收/);
  assert.match(explainError(Object.assign(new Error('unavailable'),{status:503}),'submit').title,/引擎/);
  assert.match(explainError(Object.assign(new Error('busy'),{status:409}),'submit').message,/等待/);
});
test('failed loads and imports tell users how to recover without losing the result',()=>{
  assert.match(explainError(new Error('invalid'),'import').message,/没有被替换/);
  assert.match(explainError(new Error('timeout'),'job').title,/超过时限/);
  assert.match(explainError(new Error('offline')).message,/start.cmd/);
});
