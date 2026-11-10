# Installation

## From source

Requires Node.js 22.13+ and npm.

```bash
git clone https://github.com/itzmoksh01/Openvibes.git
cd Openvibes
npm install
npm run build
npm link
openvibes setup --client auto
openvibes doctor
```

Do not assume an npm release exists until package publication is verified.

## MCP launch

The package exposes an `openvibes` executable. Configure your MCP host to launch it with the `mcp` argument using that host's documented STDIO configuration format. Client-specific setup is documented separately as verified.
