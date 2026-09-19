(function (root) {
  function plainText(text) {
    return String(text || "")
      .replace(/\*\*/g, "")
      .replace(/^#+\s+/gm, "")
      .replace(/`/g, "")
      .trim();
  }

  function appendLog(el, who, text) {
    if (!el) return;
    const row = document.createElement("div");
    row.className = "agent-row " + who;
    row.innerHTML = "<b>" + who + "</b><pre></pre>";
    row.querySelector("pre").textContent = text;
    el.appendChild(row);
    el.scrollTop = el.scrollHeight;
  }

  async function health() {
    try {
      const r = await fetch("/api/health");
      return r.json();
    } catch (e) {
      return { ok: false, openai: false, error: "server offline" };
    }
  }

  async function runAgent(room, prompt, context) {
    const r = await fetch("/api/agent/" + room, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, context: context || {} }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || r.statusText);
    return data;
  }

  function bindPrompt(opts) {
    const send = document.getElementById(opts.sendId);
    const input = document.getElementById(opts.inputId);
    const log = document.getElementById(opts.logId);
    const status = document.getElementById(opts.statusId);
    const inField = opts.replyInField === true || opts.room === "mission";
    if (!send || !input) return;

    health().then((h) => {
      if (status) {
        status.textContent = h.openai
          ? "AGENT ONLINE"
          : "AGENT OFFLINE · ADD OPENAI_API_KEY";
      }
    });

    input.addEventListener("focus", function () {
      if (input.dataset.reply === "1") input.select();
    });
    input.addEventListener("input", function () {
      input.dataset.reply = "";
    });

    async function go() {
      if (input.dataset.reply === "1") return;
      const prompt = input.value.trim();
      if (!prompt) return;
      if (opts.intercept && opts.intercept(prompt)) return;
      send.disabled = true;
      const who =
        opts.room === "mission"
          ? "Mission Control"
          : opts.room === "security"
            ? "Security"
            : opts.room === "graphdev"
              ? "GraphDev"
              : "Crew";
      if (inField) {
        input.value = who + " is thinking…";
        input.dataset.reply = "1";
      } else if (log) {
        log.classList.remove("hidden");
        appendLog(log, "you", prompt);
        input.value = "";
      }
      if (root.CrewUI) CrewUI.startWait(who);
      try {
        const ctx = typeof opts.context === "function" ? opts.context() : {};
        const data = await runAgent(opts.room, prompt, ctx);
        if (root.CrewUI) {
          CrewUI.stopWait(who + " replied. Allow is above the prompt.");
        }
        const out = plainText(data.output || "");
        if (inField) {
          input.value = out;
          input.dataset.reply = "1";
        } else if (log) {
          appendLog(log, opts.room, out);
        }
        if (opts.onResult) opts.onResult(data);
      } catch (err) {
        if (root.CrewUI) CrewUI.stopWait("");
        if (inField) {
          input.value = err.message;
          input.dataset.reply = "1";
        } else if (log) {
          appendLog(log, "error", err.message);
        }
      }
      send.disabled = false;
    }

    send.addEventListener("click", go);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        go();
      }
    });
  }

  root.OrbitAgent = { health, runAgent, bindPrompt, plainText };
})(window);
