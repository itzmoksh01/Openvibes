import test from 'node:test';import assert from 'node:assert/strict';import os from 'node:os';import path from 'node:path';import {safeAssetPath} from '../src/services/assets.js';
test('asset path rejects traversal',()=>{assert.throws(()=>safeAssetPath(path.join(os.tmpdir(),'ov-test'),'images','../escape.png'),/INVALID_FILENAME/);});
test('asset path accepts safe PNG path',()=>{assert.match(safeAssetPath(path.join(os.tmpdir(),'ov-test'),'images','portrait.png'),/images/);});
