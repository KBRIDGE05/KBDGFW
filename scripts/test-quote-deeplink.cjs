/* Verify the real homepage quote-entry.js opens the correct dialog for CTA URLs. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/quote-entry.js','utf8');
function run(mode, expectedDialog, expectedMode) {
  const dialogs={formalDialog:{open:false,showModal(){this.open=true;}},seaDialog:{open:false,showModal(){this.open=true;}},expressDialog:{open:false,showModal(){this.open=true;}}};
  const state={selectedMode:null,locked:false,path:null};
  const context={
    URLSearchParams, location:{search:`?quote=${mode}`,hash:'#services',pathname:'/index.html'},
    history:{replaceState(a,b,path){state.path=path;}},
    document:{readyState:'complete',body:{classList:{add(c){if(c==='lock')state.locked=true;}}},getElementById(id){return dialogs[id]||null;}},
    window:{setQuoteMode(v){state.selectedMode=v;}},
    setTimeout(callback){callback();}, console,
  };
  vm.runInNewContext(source,context,{timeout:1000});
  assert.equal(dialogs[expectedDialog].open,true,`${mode}: dialog not opened`);
  for(const [name,dlg] of Object.entries(dialogs))if(name!==expectedDialog)assert.equal(dlg.open,false,`${mode}: incorrect dialog ${name}`);
  if(expectedMode)assert.equal(state.selectedMode,expectedMode,`${mode}: mode not selected`);
  assert.equal(state.locked,true,`${mode}: background not locked`);
  assert.equal(state.path,'/index.html#services',`${mode}: navigation cleanup incorrect`);
}
run('sea','seaDialog','ocean');
run('formal','formalDialog',null);
run('lcl','seaDialog','lcl');
run('air','seaDialog','air');
run('express','expressDialog',null);
console.log('PASS quote deep-link runtime: sea, formal, lcl, air, express dialogs');
