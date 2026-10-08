import assert from 'node:assert/strict';
import {chromeProcess} from '../../../../../rc16/historical/tests/performance/chrome.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const chrome=await chromeProcess(),result={complete:false,chrome:chrome.version,harnessSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),cases:[]};
try{
 const page=await chrome.page();await page.call('Page.enable');await page.call('Runtime.enable');await page.call('Page.navigate',{url:'data:text/html,<html><body><button>Keyboard control button</button></body></html>'});await page.waitFor('!!document.querySelector("button")');await page.call('Page.bringToFront');
 await page.evaluate(`window.__clicks=0;window.__events=[];document.querySelector('button').addEventListener('click',()=>window.__clicks++);for(const type of ['keydown','keypress','keyup','click'])document.addEventListener(type,event=>window.__events.push({type:event.type,key:event.key,code:event.code,keyCode:event.keyCode,charCode:event.charCode,trusted:event.isTrusted,defaultPrevented:event.defaultPrevented}));`);
 const cases=[['original-without-text',[{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}]],['keydown-with-enter-text',[{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'},{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}]],['explicit-character-event',[{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},{type:'char',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'},{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13}]]];
 for(const [name,events] of cases){await page.evaluate(`window.__clicks=0;window.__events=[];document.querySelector('button').focus()`);for(const event of events)await page.call('Input.dispatchKeyEvent',event);const state=await page.evaluate(`({clicks:window.__clicks,events:window.__events,hasFocus:document.hasFocus(),focusedButton:document.activeElement===document.querySelector('button')})`);result.cases.push({name,input:events,...state});}
 result.complete=true;
}finally{await chrome.close();await writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));}
