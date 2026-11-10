# Installation

## Requirements

- Node.js 22.13+ and npm
- For free local media generation: a working ComfyUI installation, compatible models and adequate hardware

## From source

~~~bash
git clone https://github.com/itzmoksh01/Openvibes.git
cd Openvibes
npm install
npm run typecheck
npm test
npm link
openvibes setup --client auto
openvibes doctor
~~~

## Configure the free local provider

Set COMFYUI_URL=http://127.0.0.1:8188 and OPENVIBES_OUTPUT_DIR=./generated in the environment used to launch the MCP server. Install and start ComfyUI separately, then export an API-format workflow from its UI. See COMFYUI-LOCAL.md.

## MCP launch

The package exposes an openvibes executable. Configure your MCP host to launch it with the mcp argument using that host's documented STDIO configuration format.

## Official Comfy MCP companion

For a ready-made local workflow experience, install comfy-mcp and comfy-cli as documented at https://github.com/Comfy-Org/comfy-mcp. Comfy Cloud is a separate paid service; Openvibes' local route does not require it.
