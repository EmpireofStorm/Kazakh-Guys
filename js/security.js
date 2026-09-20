(function () {
  const catsEl = document.getElementById("cats");
  const findingsEl = document.getElementById("findings");
  const emptyEl = document.getElementById("findings-empty");
  const tick = document.getElementById("tick");
  const tickState = document.getElementById("tick-state");
  const runBtn = document.getElementById("run-scan");
  const runArea = document.getElementById("scan-run-area");
  const runNote = document.getElementById("scan-run-note");
  const countEl = document.getElementById("findings-count");

  const catLabel = {};
  OrbitData.CATEGORIES.forEach(function (c) {
    catLabel[c.id] = c.label;
    const id = "cat-" + c.id;
    const row = document.createElement("label");
    row.innerHTML =
      '<input type="checkbox" id="' + id + '" value="' + c.id + '" checked /> ' + c.label;
    catsEl.appendChild(row);
  });

  function selectedCats() {
    return Array.from(catsEl.querySelectorAll("input:checked")).map(function (el) {
      return el.value;
    });
  }

  function setCats(cats) {
    catsEl.querySelectorAll("input").forEach(function (el) {
      el.checked = cats.indexOf(el.value) !== -1;
    });
  }

  function hitsFor(cats, findingIds) {
    if (findingIds && findingIds.length) {
      return OrbitData.FINDINGS.filter(function (f) {
        return findingIds.indexOf(f.id) !== -1;
      });
    }
    return OrbitData.FINDINGS.filter(function (f) {
      return cats.indexOf(f.attackCategory) !== -1;
    });
  }

  function testsFor(finding) {
    return (OrbitData.TESTS && OrbitData.TESTS[finding.moduleId]) || [
      "test_" + finding.attackCategory + "_baseline",
      "test_" + finding.attackCategory + "_blocked",
      "test_" + finding.attackCategory + "_unaffected",
    ];
  }

  function autoResolveHref(finding) {
    return "orbit.html?finding=" + encodeURIComponent(finding.id) + "&patched=1";
  }

  function bindAutoResolve(btn, finding) {
    btn.addEventListener("click", function () {
      OrbitData.setFinding(finding.id, { status: "fix-drafted" });
      try {
        sessionStorage.setItem("orbit-loop-finding", finding.id);
      } catch (e) {}
      location.href =
        "orbit.html?finding=" + encodeURIComponent(finding.id) + "&fix=1";
    });
  }

  function resolveRow(finding) {
    const path = (OrbitData.BY_ID[finding.moduleId] && OrbitData.BY_ID[finding.moduleId].filePath[0]) || "";
    const wrap = document.createElement("div");
    wrap.className = "finding-resolve";
    wrap.innerHTML =
      "<div>" +
      '<div class="sev ' +
      finding.severity +
      '">' +
      finding.severity +
      " · " +
      (catLabel[finding.attackCategory] || finding.attackCategory) +
      "</div>" +
      "<h3>" +
      finding.title +
      "</h3>" +
      '<p class="muted">' +
      finding.moduleId +
      (path ? " · " + path : "") +
      "</p>" +
      "<p>" +
      (finding.description || "") +
      "</p>" +
      '<p class="status">Status: verified-safe (ready to apply)</p>' +
      "</div>" +
      '<button class="auto-resolve" type="button">Auto-resolve →</button>';
    bindAutoResolve(wrap.querySelector(".auto-resolve"), finding);
    return wrap;
  }

  function renderFindings(list) {
    const state = OrbitData.loadState();
    findingsEl.innerHTML = "";
    if (countEl) countEl.textContent = list.length + " results";
    if (!list.length) {
      emptyEl.textContent = "No issues in this check.";
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    list.forEach(function (f) {
      const st = state[f.id] || { status: "open" };
      const path = (OrbitData.BY_ID[f.moduleId] && OrbitData.BY_ID[f.moduleId].filePath[0]) || "";
      const card = document.createElement("article");
      card.className = "finding";
      card.innerHTML =
        '<div class="sev ' +
        f.severity +
        '">' +
        f.severity +
        " · " +
        (catLabel[f.attackCategory] || f.attackCategory) +
        "</div>" +
        "<h3>" +
        f.title +
        "</h3>" +
        '<p class="muted">' +
        f.moduleId +
        (path ? " · " + path : "") +
        "</p>" +
        "<p>" +
        (f.description || "") +
        "</p>" +
        '<p class="status">Status: ' +
        (st.status === "verified-safe" ? "verified-safe (ready to apply)" : st.status) +
        "</p>";
      const btn = document.createElement("button");
      btn.className = "auto-resolve";
      btn.type = "button";
      btn.textContent = "Auto-resolve →";
      card.appendChild(btn);
      bindAutoResolve(btn, f);
      findingsEl.appendChild(card);
    });
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function runOnePipeline(finding, pos) {
    const tests = testsFor(finding);
    const card = document.createElement("div");
    card.className = "pipeline-card";
    card.innerHTML =
      "<div><span class=\"pipeline-cat\">" +
      (catLabel[finding.attackCategory] || finding.attackCategory) +
      '</span><span class="pipeline-module">' +
      finding.moduleId +
      "</span></div><div class=\"pipeline-track\"></div>";
    const track = card.querySelector(".pipeline-track");
    tests.forEach(function (name, ti) {
      const node = document.createElement("div");
      node.className = "pipeline-node";
      node.dataset.status = "queued";
      node.id = "scannode-" + pos + "-" + ti;
      node.innerHTML =
        '<span class="node-dot"></span><span class="node-name">' +
        name +
        '</span><span class="node-status">queued</span>';
      track.appendChild(node);
    });
    runArea.appendChild(card);
    runArea.scrollTop = runArea.scrollHeight;

    for (let ti = 0; ti < tests.length; ti++) {
      const node = document.getElementById("scannode-" + pos + "-" + ti);
      const statusEl = node.querySelector(".node-status");
      node.dataset.status = "running";
      statusEl.textContent = "running";
      await sleep(620);
      if (ti === 1) {
        node.dataset.status = "fail";
        statusEl.textContent = "vulnerable";
      } else {
        node.dataset.status = "pass";
        statusEl.textContent = "passed";
      }
      await sleep(280);
    }
    OrbitData.setFinding(finding.id, { status: "verified-safe" });
    card.appendChild(resolveRow(finding));
  }

  async function runLive(cats, findingIds) {
    const hits = hitsFor(cats, findingIds);
    setCats(cats);
    runBtn.disabled = true;
    tickState.textContent = "SCAN";
    tick.textContent = "RUNNING CHECKS";
    findingsEl.innerHTML = "";
    emptyEl.classList.add("hidden");
    runArea.innerHTML = "";
    runArea.classList.remove("hidden");
    if (runNote) runNote.classList.remove("hidden");
    if (countEl) countEl.textContent = "scanning…";

    for (let i = 0; i < hits.length; i++) {
      await runOnePipeline(hits[i], i);
    }

    localStorage.setItem("orbit-last-scan-cats", JSON.stringify(cats));
    try {
      sessionStorage.setItem(
        "orbit-scan-queue",
        JSON.stringify(hits.map(function (h) {
          return h.id;
        }))
      );
    } catch (e) {}
    if (countEl) countEl.textContent = hits.length + " results";
    if (!hits.length) {
      emptyEl.textContent = "No issues in this check.";
      emptyEl.classList.remove("hidden");
    }
    if (runNote) {
      runNote.textContent = hits.length
        ? "Scan finished. Auto-resolve stages a draft fix in Graph Dev."
        : "Scan finished. Nothing to open in Graph Dev.";
    }
    tick.textContent = "DONE · " + hits.length + " ISSUE(S)";
    tickState.textContent = "READY";
    runBtn.disabled = false;
    return hits;
  }

  function playScan(cats, findingIds, done) {
    if (!cats.length && !(findingIds && findingIds.length)) {
      tick.textContent = "SELECT AT LEAST ONE CATEGORY";
      tickState.textContent = "BLOCKED";
      return;
    }
    const useRadar = localStorage.getItem("orbit-radar") === "1";
    const go = function () {
      runLive(cats, findingIds).then(function (hits) {
        if (done) done(hits);
      });
    };
    if (useRadar && window.RadarUI) {
      RadarUI.run(hitsFor(cats, findingIds), cats, go);
    } else {
      go();
    }
  }

  runBtn.addEventListener("click", function () {
    playScan(selectedCats(), null, null);
  });

  const radarToggle = document.getElementById("radar-toggle");
  if (radarToggle) {
    radarToggle.checked = localStorage.getItem("orbit-radar") === "1";
    radarToggle.addEventListener("change", function () {
      localStorage.setItem("orbit-radar", radarToggle.checked ? "1" : "0");
    });
  }

  function applyAgentActions(data) {
    CrewUI.proposeActions(data.actions || [], {
      onScan: function (scan) {
        playScan(
          scan.categories || [],
          (scan.findings || []).map(function (f) {
            return f.id;
          })
        );
      },
      onGraph: function (graph) {
        location.href = graph.href || "orbit.html";
      },
    });
  }

  const params = new URLSearchParams(location.search);
  if (params.get("sqlloop") && window.SqlLoop) {
    SqlLoop.start();
  } else if (params.get("compat") && window.SqlLoop) {
    SqlLoop.afterGraphFail();
  } else if (params.get("crew")) {
    try {
      const job = JSON.parse(sessionStorage.getItem("orbit-agent-scan") || "null");
      if (job) {
        sessionStorage.removeItem("orbit-agent-scan");
        playScan(job.categories || [], job.findingIds || []);
      }
    } catch (e) {}
  } else if (params.get("restored")) {
    tick.textContent = "BACK FROM GRAPH DEV";
    let cats = [];
    try {
      cats = JSON.parse(localStorage.getItem("orbit-last-scan-cats") || "[]");
    } catch (e) {
      cats = [];
    }
    const hits = cats.length
      ? OrbitData.FINDINGS.filter(function (f) {
          return cats.indexOf(f.attackCategory) !== -1;
        })
      : [];
    renderFindings(hits);
  }

  OrbitAgent.bindPrompt({
    room: "security",
    sendId: "agent-send",
    inputId: "agent-prompt",
    logId: "agent-log",
    replyInField: true,
    statusId: "tick-state",
    intercept: function (prompt) {
      if (/sql/i.test(prompt) && window.SqlLoop) {
        SqlLoop.start();
        return true;
      }
      return false;
    },
    context: function () {
      return { selectedCategories: selectedCats() };
    },
    onResult: applyAgentActions,
  });

  window.SecurityScan = { runLive: runLive, playScan: playScan };
})();
