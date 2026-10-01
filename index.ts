import { spawn, ChildProcessWithoutNullStreams, execFile } from "node:child_process"
import { promisify } from "node:util"
import * as path from "node:path"

const exec = promisify(execFile)

class TyLspClient {
  private proc: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private pending = new Map<number, (res: any) => void>()
  private buffer = ""

  async start(projectRoot: string) {
    if (this.proc) return

    this.proc = spawn("uvx", ["ty", "server"], {
      cwd: projectRoot,
      shell: true,
      windowsHide: true,
      env: process.env,
    })

    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8")
      while (true) {
        const headerEnd = this.buffer.indexOf("\r\n\r\n")
        if (headerEnd === -1) break

        const header = this.buffer.slice(0, headerEnd)
        const match = header.match(/Content-Length:\s*(\d+)/i)
        if (!match) break

        const length = parseInt(match[1], 10)
        const bodyStart = headerEnd + 4
        if (this.buffer.length < bodyStart + length) break

        const body = this.buffer.slice(bodyStart, bodyStart + length)
        this.buffer = this.buffer.slice(bodyStart + length)

        try {
          const msg = JSON.parse(body)
          if (msg.id && this.pending.has(msg.id)) {
            this.pending.get(msg.id)!(msg.result)
            this.pending.delete(msg.id)
          }
        } catch {
          // Игнорируем неполные пакеты
        }
      }
    })

    await this.request("initialize", {
      processId: process.pid,
      rootUri: `file:///${projectRoot.replace(/\\/g, "/")}`,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { dynamicRegistration: false },
        },
      },
    })
    this.notify("initialized", {})
  }

  request(method: string, params: any): Promise<any> {
    const id = this.nextId++
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params })
    const message = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.proc?.stdin.write(message)
    })
  }

  notify(method: string, params: any) {
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params })
    const message = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`
    this.proc?.stdin.write(message)
  }
}

export default {
  id: "ty",
  async setup(ctx: any) {
    const cwd = ctx.location.directory
    const lsp = new TyLspClient()

    const ensureLsp = async () => {
      await lsp.start(cwd)
    }

    await ctx.tool.transform((editor: any) => {
      editor.add({
        name: "ty_check",
        description:
          "Run ultra-fast static type check on Python files using Astral `ty`. Returns concise type diagnostics.",
        input: {
          type: "object",
          properties: {
            target: {
              type: "string",
              description: "Optional file or directory path (defaults to current project)",
            },
          },
          additionalProperties: false,
        },
        execute: async (input: any) => {
          const { target = "." } = input || {}
          try {
            const { stdout } = await exec("uvx", ["ty", "check", target, "--output-format", "concise"], {
              cwd,
              shell: true,
              windowsHide: true,
            })
            return { content: stdout || "✓ ty: No type errors found." }
          } catch (err: any) {
            return {
              content: `✗ ty Type Diagnostics:\n${err.stdout || err.stderr || err.message}`,
            }
          }
        },
      })

      editor.add({
        name: "ty_hover",
        description:
          "Query the exact type signature and docstring of a Python symbol at line/character using ty LSP. Very token-efficient.",
        input: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Relative path to the Python file" },
            line: { type: "number", description: "1-based line number" },
            character: { type: "number", description: "1-based column index" },
          },
          required: ["filePath", "line", "character"],
          additionalProperties: false,
        },
        execute: async (input: any) => {
          const { filePath, line, character } = input
          await ensureLsp()

          const absolutePath = path.resolve(cwd, filePath).replace(/\\/g, "/")
          const result = await lsp.request("textDocument/hover", {
            textDocument: { uri: `file:///${absolutePath}` },
            position: { line: line - 1, character: character - 1 },
          })

          if (!result || !result.contents) {
            return { content: "No type information found at this position." }
          }

          const hoverText =
            typeof result.contents === "string"
              ? result.contents
              : Array.isArray(result.contents)
              ? result.contents.map((c: any) => c.value || c).join("\n")
              : result.contents.value || JSON.stringify(result.contents)

          return { content: hoverText }
        },
      })
    })

    await ctx.session.hook("context", (event: any) => {
      event.system.push({
        type: "text",
        text: [
          "TYPE INTELLIGENCE (ASTRAL TY):",
          "- To inspect a function signature or symbol type, use `ty_hover`.",
          "- Before finishing modifications in Python code, verify correctness with `ty_check`.",
        ].join("\n"),
      })
    })
  },
}