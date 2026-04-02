#!/usr/bin/env node

// TLS 1.2 override: only needed when using certain API proxies that have
// TLS 1.3 renegotiation issues. Set CONTRIBOT_TLS12=1 to enable.
// This was previously unconditional, which could break Linux/Mac users
// connecting directly to the Anthropic API over TLS 1.3.
if (process.env.CONTRIBOT_TLS12 === "1") {
  process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS ?? "") + " --tls-max-v1.2";
}

import { createProgram } from "./cli/commands.js";

const program = createProgram();
program.parse();
