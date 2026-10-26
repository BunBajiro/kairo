/**
 * Normal launcher entrypoint; importing this module starts and owns the supervisor
 * until its runtime exits. --open requests one browser launch. Keep this entry lean:
 * only the child imports Core/static indexes after generation selection. Embedding
 * and test callers use explicit factories instead. See docs/ARCHITECTURE.md.
 */
import {runKairoSupervisor} from './runtime-supervisor.mjs';

try {
    const supervisor = await runKairoSupervisor({openBrowser: process.argv.includes('--open')});
    process.exitCode = await supervisor.done;
} catch (error) {
    console.error(error.code === 'EADDRINUSE' ? 'Kairo is already running, or its local port is occupied. Open the existing dashboard.' : error.message);
    process.exitCode = 1;
}
