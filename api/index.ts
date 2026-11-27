import { createKairoServer } from '../server.js';

const server = await createKairoServer({ vercelFunction: true });

export default server;
