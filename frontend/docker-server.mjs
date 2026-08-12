import { spawn } from "node:child_process";

function safeMessage(value) {
  return value
    .replace(
      /(authorization|cookie|signature|idempotency-key)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .slice(0, 4000);
}

function emit(level, message) {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      logger: "nextjs",
      event: "frontend.runtime",
      message: safeMessage(message),
    })}\n`,
  );
}

const child = spawn(process.execPath, ["server.js"], {
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

function forward(stream, level) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) if (line) emit(level, line);
  });
  stream.on("end", () => {
    if (pending) emit(level, pending);
  });
}

forward(child.stdout, "INFO");
forward(child.stderr, "ERROR");

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  emit(
    code === 0 ? "INFO" : "ERROR",
    `Next.js exited (${signal ?? code ?? "unknown"})`,
  );
  process.exitCode = code ?? (signal ? 1 : 0);
});
