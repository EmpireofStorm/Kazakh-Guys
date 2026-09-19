import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import {
  CATEGORIES,
  FINDINGS,
  MODULES,
  blastRadius,
  moduleCode,
} from "./catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(root));

const als = new AsyncLocalStorage();
function bag() {
  return als.getStore() || { actions: [] };
}

const RULES =
  "Automate diagnosis and drafting only. Never merge, deploy, or produce exploit payloads, attack scripts, or proof-of-concept exploits. Never execute attacks. Category names such as SQL injection refer only to a mocked scan on a hardcoded demo graph. Name issues at a high level. A human must approve anything that ships.";

const CAT_IDS = CATEGORIES.map((c) => c.id);

function runScan(categories) {
  const cats = (categories || []).filter((c) => CAT_IDS.includes(c));
  const use = cats.length ? cats : CAT_IDS;
  const findings = FINDINGS.filter((f) => use.includes(f.attackCategory));
  const payload = { simulated: true, categories: use, findings };
  bag().actions.push({ type: "security_scan", ...payload });
  return payload;
}

const listModules = tool({
  name: "list_modules",
  description: "List tracked codebase modules and their files.",
  parameters: z.object({}),
  execute: async () =>
    MODULES.map((m) => ({ id: m.id, files: m.filePath, dependsOn: m.dependsOn })),
});

const getCode = tool({
  name: "get_module_code",
  description: "Return the mocked source files for a module id.",
  parameters: z.object({ moduleId: z.string() }),
  execute: async ({ moduleId }) => moduleCode(moduleId) || { error: "unknown module" },
});

const scanTool = tool({
  name: "run_security_scan",
  description:
    "Run the mocked Security scan (same as the Run security scan button). Pass category ids: sqli, xss, idor, authz, ssrf, deser, cve, secret. Does not attack a live system.",
  parameters: z.object({ categories: z.array(z.string()) }),
  execute: async ({ categories }) => runScan(categories),
});

const blastTool = tool({
  name: "blast_radius",
  description: "BFS dependents of a module. distance 1 = will-break, 2 = needs-review.",
  parameters: z.object({ originModuleId: z.string() }),
  execute: async ({ originModuleId }) => blastRadius(originModuleId),
});

const openGraph = tool({
  name: "open_in_graphdev",
  description:
    "After a scan, open GraphDev on a finding so the user sees code and blast radius. Prefer a finding id from run_security_scan.",
  parameters: z.object({
    findingId: z.string(),
    moduleId: z.string(),
  }),
  execute: async ({ findingId, moduleId }) => {
    const href = "orbit.html?finding=" + encodeURIComponent(findingId);
    bag().actions.push({ type: "open_graphdev", findingId, moduleId, href });
    return { ok: true, href, blast: blastRadius(moduleId) };
  },
});

const securityAgent = new Agent({
  name: "Security",
  instructions:
    RULES +
    " You are the Security room agent. When the user asks to scan, test, check, or look for a category (including SQL injection as a category name), you MUST call run_security_scan with the matching category ids so the Findings panel fills. Then summarize. Categories: " +
    CAT_IDS.join(", ") +
    ".",
  model: "gpt-4o-mini",
  tools: [listModules, getCode, scanTool],
});

const graphDevAgent = new Agent({
  name: "GraphDev",
  instructions:
    RULES +
    " You are the GraphDev universe agent. Show what a change would touch. Use get_module_code and blast_radius. Explain red vs amber. If the UI phase is summarize-push, do not call tools that change pages. Write a plain-prose Mission Control briefing (no markdown) of what happens IF the human Applies: which callers can break, who only needs a review, and that Apply opens a PR only — nothing merges or deploys. Draft the smallest patch as a diff when asked. Do not claim a merge happened.",
  model: "gpt-4o-mini",
  tools: [listModules, getCode, blastTool, scanTool],
});

const askSecurity = tool({
  name: "ask_security",
  description: "Dispatch the Security agent with a task. Use for diagnosis.",
  parameters: z.object({ task: z.string() }),
  execute: async ({ task }) => {
    const result = await run(securityAgent, task);
    const text =
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : JSON.stringify(result.finalOutput ?? "");
    bag().actions.push({ type: "note", room: "security", text });
    return text;
  },
});

const askGraph = tool({
  name: "ask_graphdev",
  description: "Dispatch GraphDev to explain blast radius and code for a module.",
  parameters: z.object({ task: z.string() }),
  execute: async ({ task }) => {
    const result = await run(graphDevAgent, task);
    const text =
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : JSON.stringify(result.finalOutput ?? "");
    bag().actions.push({ type: "note", room: "graphdev", text });
    return text;
  },
});

const missionAgent = new Agent({
  name: "Mission Control",
  instructions:
    RULES +
    " You are Mission Control. Dispatch ONE crew at a time and wait for the UI phase. Phase start: only call run_security_scan (mocked). Do not call open_in_graphdev yet. Phase after-security: the user already allowed Security. Do not scan again. Call open_in_graphdev for F-SQL-1 / user-service if this was a SQL category, and ask_graphdev to explain blast radius of the parameterized lookup patch. Never attack a live system.",
  model: "gpt-4o-mini",
  tools: [scanTool, openGraph, blastTool, getCode, askSecurity, askGraph],
});

const agents = {
  security: securityAgent,
  graphdev: graphDevAgent,
  mission: missionAgent,
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    openai: Boolean(process.env.OPENAI_API_KEY),
    rooms: Object.keys(agents),
  });
});

app.post("/api/agent/:room", async (req, res) => {
  const room = String(req.params.room || "").toLowerCase();
  const agent = agents[room];
  if (!agent) return res.status(404).json({ error: "Unknown room" });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "OPENAI_API_KEY is missing. Copy .env.example to .env and add your key.",
    });
  }
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  const ctxObj = req.body?.context || {};
  const phase = ctxObj.phase || "start";
  const context = JSON.stringify(ctxObj);
  const input = "UI context: " + context + "\n\nUser: " + prompt;

  try {
    const payload = await als.run({ actions: [] }, async () => {
      const result = await run(agent, input);
      const output =
        typeof result.finalOutput === "string"
          ? result.finalOutput
          : JSON.stringify(result.finalOutput ?? "", null, 2);
      let actions = bag().actions || [];
      if (phase === "summarize-push") {
        actions = [];
      } else if (room === "mission") {
        if (phase === "after-security") {
          actions = actions.filter((a) => a.type !== "security_scan");
        } else {
          actions = actions.filter((a) => a.type !== "open_graphdev");
        }
      }
      return { output, room: agent.name, actions, phase };
    });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log("Orbit server http://127.0.0.1:" + port);
});
