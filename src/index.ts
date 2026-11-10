#!/usr/bin/env node
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {runCli} from './cli/index.js';
const args=process.argv.slice(2);
if(args.length>0&&args[0]!=='mcp'){await runCli(args);}else{const {server}=await import('./server.js');await serveStdio(()=>server);}
