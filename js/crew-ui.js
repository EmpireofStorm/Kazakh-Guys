(function (root) {
  const CAT = {
    sqli: "SQL injection",
    xss: "cross-site scripting",
    idor: "broken access control",
    authz: "authentication bypass",
    ssrf: "SSRF",
    deser: "insecure deserialization",
    cve: "CVE dependency",
    secret: "hardcoded-secret",
  };
  const WAIT = [
    "reading your prompt…",
    "deciding which crew to dispatch…",
    "waiting on the model (this can take ~10s)…",
    "collecting mocked scan results…",
    "drafting what to show you…",
  ];
  const PENDING_KEY = "orbit-crew-pending";

  function ensure() {
    if (!document.getElementById("crew-activity")) {
      const a = document.createElement("div");
      a.id = "crew-activity";
      a.className = "crew-activity hidden";
      a.setAttribute("role", "status");
      document.body.appendChild(a);
    }
    if (!document.getElementById("crew-toasts")) {
      const t = document.createElement("div");
      t.id = "crew-toasts";
      t.className = "crew-toasts";
      document.body.appendChild(t);
    }
  }

  function setActivity(text, busy) {
    ensure();
    const el = document.getElementById("crew-activity");
    if (!text) {
      el.classList.add("hidden");
      el.innerHTML = "";
      return;
    }
    el.classList.remove("hidden");
    el.innerHTML =
      (busy ? '<span class="crew-spin"></span>' : "") +
      "<span>" +
      text.replace(/</g, "&lt;") +
      "</span>";
  }

  let waitTimer = null;
  function startWait(who) {
    let i = 0;
    const label = who || "Crew";
    setActivity(label + " is " + WAIT[0], true);
    clearInterval(waitTimer);
    waitTimer = setInterval(function () {
      i += 1;
      setActivity(label + " is " + WAIT[i % WAIT.length], true);
    }, 2200);
  }
  function stopWait(doneText) {
    clearInterval(waitTimer);
    waitTimer = null;
    if (doneText) setActivity(doneText, false);
    else setActivity("", false);
  }

  function clearToasts() {
    const box = document.getElementById("crew-toasts");
    if (box) box.innerHTML = "";
  }

  function centerWait(title, detail, ms) {
    ensure();
    const old = document.getElementById("center-wait");
    if (old) old.remove();
    const back = document.createElement("div");
    back.id = "center-wait";
    back.className = "center-wait-back";
    back.innerHTML =
      '<div class="center-wait" role="status">' +
      "<h2>" +
      String(title || "").replace(/</g, "&lt;") +
      "</h2>" +
      (detail ? "<p>" + String(detail).replace(/</g, "&lt;") + "</p>" : "") +
      "</div>";
    document.body.appendChild(back);
    return new Promise(function (resolve) {
      setTimeout(function () {
        back.classList.add("out");
        setTimeout(function () {
          back.remove();
          resolve();
        }, 280);
      }, ms || 3000);
    });
  }

  function testNote(title, detail) {
    ensure();
    let box = document.getElementById("test-notes");
    if (!box) {
      box = document.createElement("div");
      box.id = "test-notes";
      box.className = "test-notes";
      document.body.appendChild(box);
    }
    const card = document.createElement("article");
    card.className = "test-note";
    card.innerHTML =
      "<strong>" +
      String(title || "").replace(/</g, "&lt;") +
      "</strong>" +
      (detail ? "<p>" + String(detail).replace(/</g, "&lt;") + "</p>" : "");
    box.prepend(card);
    while (box.children.length > 5) box.removeChild(box.lastChild);
    setTimeout(function () {
      card.classList.add("fade");
    }, 8000);
  }

  function toast(opts) {
    ensure();
    const card = document.createElement("article");
    card.className = "crew-toast";
    card.innerHTML =
      '<div class="crew-toast-bot">' +
      (opts.bot || "Crew") +
      " wants to</div>" +
      '<p class="crew-toast-want">' +
      (opts.wants || "").replace(/</g, "&lt;") +
      "</p>" +
      (opts.detail
        ? '<p class="crew-toast-detail">' + opts.detail.replace(/</g, "&lt;") + "</p>"
        : "") +
      '<div class="crew-toast-actions"></div>';
    const actions = card.querySelector(".crew-toast-actions");
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "ok";
    yes.textContent = "Allow";
    const no = document.createElement("button");
    no.type = "button";
    no.textContent = "Not now";
    yes.addEventListener("click", function () {
      card.remove();
      if (opts.onAllow) opts.onAllow();
    });
    no.addEventListener("click", function () {
      card.remove();
      if (opts.onDeny) opts.onDeny();
    });
    actions.appendChild(yes);
    actions.appendChild(no);
    document.getElementById("crew-toasts").appendChild(card);
    return card;
  }

  function catLabel(id) {
    return CAT[id] || id;
  }

  function proposeActions(actions, handlers) {
    const reviewing = !!document.getElementById("fix-review");
    const list = (actions || []).filter(function (a) {
      if (reviewing && a.type === "open_graphdev") return false;
      return true;
    });
    const queue = [];
    list.forEach(function (a) {
      if (a.type === "security_scan") {
        const cats = (a.categories || []).map(catLabel).join(", ");
        const n = (a.findings || []).length;
        queue.push({
          bot: "Security",
          wants: "run a simulated scan (" + (cats || "selected categories") + ")",
          detail: n + " mocked finding(s). No live attack. GraphDev will not be asked until you finish this.",
          run: function () {
            if (handlers && handlers.onScan) handlers.onScan(a);
          },
        });
      }
      if (a.type === "open_graphdev") {
        queue.push({
          bot: "GraphDev",
          wants:
            "simulate the change on " +
            (a.moduleId || "a module") +
            " (code + blast radius)",
          detail: a.findingId ? "Finding " + a.findingId : "",
          run: function () {
            if (handlers && handlers.onGraph) handlers.onGraph(a);
          },
        });
      }
    });
    if (!queue.length) {
      setActivity("Crew finished. No page changes requested.", false);
      setTimeout(function () {
        setActivity("", false);
      }, 4000);
      return;
    }
    const item = queue[0];
    setActivity(
      item.bot + " is waiting for Allow. The next bot is not started yet.",
      false
    );
    toast({
      bot: item.bot,
      wants: item.wants,
      detail: item.detail,
      onAllow: item.run,
      onDeny: function () {
        setActivity("Request declined. Crew is idle.", false);
      },
    });
  }

  function showFixReview(fix, handlers) {
    ensure();
    const old = document.getElementById("fix-review");
    if (old) old.remove();
    const back = document.createElement("div");
    back.id = "fix-review";
    back.className = "fix-review-back";
    back.innerHTML =
      '<div class="fix-review modal" role="dialog">' +
      '<p class="sev high">' +
      (fix.title || "Scan complete") +
      "</p>" +
      "<h2>" +
      (fix.file || "") +
      "</h2>" +
      '<p class="muted">' +
      (fix.why || "") +
      "</p>" +
      '<div class="fix-grid">' +
      '<div><div class="fix-kicker">Before</div><pre class="fix-flagged"></pre></div>' +
      '<div><div class="fix-kicker">After</div><pre class="fix-next"></pre></div>' +
      "</div>" +
      '<div class="actions">' +
      '<button type="button" class="ok" id="fix-approve">Approve</button>' +
      '<button type="button" id="fix-deny">Not approve</button>' +
      (handlers && handlers.final
        ? ""
        : '<button type="button" class="hazard" id="fix-test">Test in GraphDev</button>') +
      "</div>" +
      '<div id="fix-reason-wrap" class="hidden">' +
      '<p class="muted">Tell the agent what to change.</p>' +
      '<textarea id="fix-reason" rows="3" placeholder="e.g. keep the same function name"></textarea>' +
      '<button type="button" class="ok" id="fix-reason-send">Send</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(back);
    clearToasts();
    back.querySelector(".fix-flagged").textContent = fix.flagged || "";
    back.querySelector(".fix-next").textContent = fix.replacement || "";
    function approveFile() {
      sessionStorage.setItem("orbit-approved-patch", JSON.stringify(fix));
      testNote("Approved", "Queued as a pull request. Nothing was merged.");
      back.remove();
      if (handlers && handlers.onApprove) handlers.onApprove(fix);
    }
    function goGraphDev() {
      sessionStorage.setItem("orbit-approved-patch", JSON.stringify(fix));
      back.remove();
      clearToasts();
      setActivity("Opening GraphDev with the approved patch…", true);
      if (handlers && handlers.onTest) handlers.onTest(fix);
    }
    back.addEventListener("click", function (ev) {
      const id = ev.target && ev.target.id;
      if (id === "fix-approve") {
        ev.preventDefault();
        approveFile();
      } else if (id === "fix-deny") {
        ev.preventDefault();
        if (handlers && handlers.final) {
          back.remove();
          if (handlers.onDeny) handlers.onDeny(fix);
          return;
        }
        const wrap = back.querySelector("#fix-reason-wrap");
        if (wrap) wrap.classList.remove("hidden");
        if (handlers && handlers.onDeny) handlers.onDeny(fix);
      } else if (id === "fix-reason-send") {
        ev.preventDefault();
        const reason = (back.querySelector("#fix-reason") || {}).value || "";
        const lessons = JSON.parse(sessionStorage.getItem("orbit-lessons") || "[]");
        lessons.push({ at: Date.now(), file: fix.file, reason: reason.trim() });
        sessionStorage.setItem("orbit-lessons", JSON.stringify(lessons));
        back.remove();
        testNote("Noted", "The agent will use your reason on the next try.");
        if (handlers && handlers.onLearn) handlers.onLearn(reason.trim(), fix);
      } else if (id === "fix-test") {
        ev.preventDefault();
        goGraphDev();
      }
    });
  }

  root.CrewUI = {
    setActivity: setActivity,
    startWait: startWait,
    stopWait: stopWait,
    toast: toast,
    testNote: testNote,
    centerWait: centerWait,
    clearToasts: clearToasts,
    proposeActions: proposeActions,
    showFixReview: showFixReview,
    catLabel: catLabel,
  };
})(window);
