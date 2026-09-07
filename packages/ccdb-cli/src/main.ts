import { runCli } from './runner.js';
process.exitCode = await runCli(process.argv.slice(2));
