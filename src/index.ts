#!/usr/bin/env node

// aipaibox.com (API proxy) has TLS 1.3 renegotiation issues that cause
// all HTTPS POST requests to hang. Force TLS 1.2 max for this process
// AND all child processes (claude subprocess inherits this env var).
process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS ?? "") + " --tls-max-v1.2";

import { createProgram } from "./cli/commands.js";

const program = createProgram();
program.parse();
