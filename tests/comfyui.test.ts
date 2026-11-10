import test from 'node:test';import assert from 'node:assert/strict';import {ComfyUiLocalProvider} from '../src/providers/comfyui-local.js';
test('ComfyUI provider accepts a local HTTP endpoint',()=>{const p=new ComfyUiLocalProvider('http://127.0.0.1:8188','/tmp/openvibes-test');assert.equal(p.id,'comfyui-local');assert.equal(p.baseUrl,'http://127.0.0.1:8188');});
test('ComfyUI provider rejects unsupported URL schemes',()=>{assert.throws(()=>new ComfyUiLocalProvider('file:///tmp/comfy'),/INVALID_COMFYUI_URL/);});
test('ComfyUI provider rejects embedded credentials in URL',()=>{assert.throws(()=>new ComfyUiLocalProvider('http://user:pass@127.0.0.1:8188'),/INVALID_COMFYUI_URL/);});
test('ComfyUI provider refuses an empty workflow before network access',async()=>{const p=new ComfyUiLocalProvider('http://127.0.0.1:8188','/tmp/openvibes-test');await assert.rejects(()=>p.submit({}),/INVALID_WORKFLOW_OBJECT/);});
