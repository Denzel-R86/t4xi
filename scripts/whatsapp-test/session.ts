import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
export class Session {
  child; buffer = ""; errors = ""; pending: { resolve: (s: string) => void; reject: (e: Error) => void; marker: string } | null = null;
  constructor(database: string, container: string = "t4xi-whatsapp-gate2") {
    this.child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { stdio: "pipe" });
    this.child.stdout.on("data", chunk => { this.buffer += chunk.toString(); const p = this.pending; if (p && this.buffer.includes(p.marker+"\n")) { const s=this.buffer.slice(0,this.buffer.indexOf(p.marker)); this.buffer=""; this.pending=null; p.resolve(s.trim()); } });
    this.child.stderr.on("data", c => { this.errors += c.toString(); });
    this.child.on("close", () => { if(this.pending) { this.pending.reject(new Error(this.errors || "session closed")); this.pending=null; } });
  }
  query(sql: string): Promise<string> { assert.equal(this.pending,null); const marker="END_"+randomUUID(); return new Promise((resolve,reject)=> {this.pending={resolve,reject,marker}; this.child.stdin.write(sql+"\n\\echo "+marker+"\n");}); }
  close() { this.child.stdin.end(); }
}
