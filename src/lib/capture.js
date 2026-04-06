import { Writable } from "node:stream";

export function createCapturedStreams() {
  const stdoutChunks = [];
  const stderrChunks = [];

  return {
    stdout: createWritable(stdoutChunks),
    stderr: createWritable(stderrChunks),
    readStdout() {
      return stdoutChunks.join("");
    },
    readStderr() {
      return stderrChunks.join("");
    }
  };
}

function createWritable(chunks) {
  return new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      callback();
    }
  });
}
