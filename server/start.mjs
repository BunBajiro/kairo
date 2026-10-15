// Keep the supervisor lean: only the child imports Core and its static indexes.
import {runKairoSupervisor} from './runtime-supervisor.mjs';

try {
    const supervisor = await runKairoSupervisor({openBrowser: process.argv.includes('--open')});
    process.exitCode = await supervisor.done;
} catch (error) {
    console.error(error.code === 'EADDRINUSE' ? 'Kairo is already running, or its local port is occupied. Open the existing dashboard.' : error.message);
    process.exitCode = 1;
}
