(function () {
  const catsEl = document.getElementById("cats");
  const findingsEl = document.getElementById("findings");
  const emptyEl = document.getElementById("findings-empty");
  const tick = document.getElementById("tick");
  const tickState = document.getElementById("tick-state");
  const runBtn = document.getElementById("run-scan");

  OrbitData.CATEGORIES.forEach((c, i) => {
    const id = "cat-" + c.id;
    const row = document.createElement("label");
    row.innerHTML =
      '<input type="checkbox" id="' +
      id +
      '" value="' +
      c.id +
      '"' +
      (c.id === "secret" || c.id === "sqli" ? " checked" : "") +
      " /> " +
      c.label;
    catsEl.appendChild(row);
  });

  function selectedCats() {
    return Array.from(catsEl.querySelectorAll("input:checked")).map((el) => el.value);
  }

  function setCats(cats) {
    catsEl.querySelectorAll("input").forEach(function (el) {
      el.checked = cats.indexOf(el.value) !== -1;
    });
  }

  function hitsFor(cats, findingIds) {
    if (findingIds && findingIds.length) {
      return OrbitData.FINDINGS.filter((f) => findingIds.indexOf(f.id) !== -1);
    }
    return OrbitData.FINDINGS.filter((f) => cats.indexOf(f.attackCategory) !== -1);
  }

  function renderFindings(list) {
    const state = OrbitData.loadState();
    findingsEl.innerHTML = "";
    if (!list.length) {
      emptyEl.textContent = "No issues in this check.";
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    list.forEach((f) => {
      const st = state[f.id] || { status: "open" };
      const prLink = st.prId
        ? '<p class="status">PR ' + st.prId + " · simulated</p>"
        : "";
      const card = document.createElement("article");
      card.className = "finding";
      card.innerHTML =
        '<div class="sev ' +
        f.severity +
        '">' +
        f.severity +
        " · " +
        f.attackCategory +
        "</div>" +
        "<h3>" +
        f.title +
        "</h3>" +
        '<p class="status">' +
        st.status +
        "</p>" +
        prLink +
        '<div class="actions"><a class="nav hazard" href="orbit.html?finding=' +
        encodeURIComponent(f.id) +
        '">Open map</a></div>';
      findingsEl.appendChild(card);
    });
  }

  function playScan(cats, findingIds, done) {
    if (!cats.length && !(findingIds && findingIds.length)) {
      tick.textContent = "SELECT AT LEAST ONE CATEGORY";
      tickState.textContent = "BLOCKED";
      return;
    }
    setCats(cats);
    runBtn.disabled = true;
    tickState.textContent = "SCAN";
    tick.textContent = "RUNNING CHECK";
    const hits = hitsFor(cats, findingIds);
    const label = (cats[0] || "check").replace(/_/g, " ");
    if (CrewUI.testNote) CrewUI.testNote("Running " + label, "Checking files…");
    function afterRadar() {
      localStorage.setItem("orbit-last-scan-cats", JSON.stringify(cats));
      renderFindings(hits);
      tick.textContent = "DONE · " + hits.length + " ISSUE(S)";
      tickState.textContent = "READY";
      runBtn.disabled = false;
      if (CrewUI.testNote) {
        CrewUI.testNote(
          "Test #1 finished",
          "Done in 0.6s — found " + hits.length + " mistake" + (hits.length === 1 ? "" : "s")
        );
      }
      if (done) done(hits);
    }
    const useRadar = localStorage.getItem("orbit-radar") === "1";
    if (useRadar && window.RadarUI) RadarUI.run(hits, cats, afterRadar);
    else afterRadar();
  }

  runBtn.addEventListener("click", function () {
    const cats = selectedCats();
    if (cats.indexOf("sqli") !== -1 && window.SqlLoop) {
      SqlLoop.start();
      return;
    }
    playScan(cats, null, null);
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
        CrewUI.setActivity("Security is filling the Findings panel (simulated scan)…", true);
        playScan(
          scan.categories || [],
          (scan.findings || []).map(function (f) {
            return f.id;
          }),
          function () {
            CrewUI.setActivity("Scan finished. Review the file in the center.", false);
          }
        );
      },
      onGraph: function (graph) {
        CrewUI.setActivity("Opening GraphDev…", true);
        location.href = graph.href || "orbit.html";
      },
    });
  }

  const params = new URLSearchParams(location.search);
  if (params.get("compat")) {
    const safeFix = OrbitData.FIXES && OrbitData.FIXES["F-SQL-1-SAFE"];
    if (safeFix && CrewUI.showFixReview) {
      setCats(["sqli"]);
      renderFindings(OrbitData.FINDINGS.filter((f) => f.id === "F-SQL-1"));
      tick.textContent = "SECURITY REWRITE · KEEP LOOKUP(ID) · BIND INSIDE";
      tickState.textContent = "FIX";
      CrewUI.setActivity("Security drafted a graph-safe lookup so callers do not implode.", false);
      CrewUI.showFixReview(safeFix, {
        onTest: function (fix) {
          location.href =
            "orbit.html?finding=" +
            encodeURIComponent(fix.findingId) +
            "&patched=1&safe=1";
        },
      });
    }
  } else if (params.get("sqlloop") && window.SqlLoop) {
    SqlLoop.start();
  } else if (params.get("crew")) {
    try {
      const job = JSON.parse(sessionStorage.getItem("orbit-agent-scan") || "null");
      if (job) {
        sessionStorage.removeItem("orbit-agent-scan");
        CrewUI.setActivity("You allowed this scan. Filling Findings (simulated)…", true);
        playScan(job.categories || [], job.findingIds || [], function () {
          CrewUI.setActivity("Scan finished. Review the file in the center.", false);
        });
      }
    } catch (e) {}
  } else if (params.get("restored")) {
    tick.textContent = "RETURNED FROM ORBIT · STATUSES REFRESHED";
    let cats = [];
    try {
      cats = JSON.parse(localStorage.getItem("orbit-last-scan-cats") || "[]");
    } catch (e) {
      cats = [];
    }
    const hits = cats.length
      ? OrbitData.FINDINGS.filter((f) => cats.indexOf(f.attackCategory) !== -1)
      : OrbitData.FINDINGS.filter((f) => {
          const st = OrbitData.loadState()[f.id];
          return st && st.status !== "open";
        });
    renderFindings(hits);
  }

  OrbitAgent.bindPrompt({
    room: "security",
    sendId: "agent-send",
    inputId: "agent-prompt",
    logId: "agent-log",
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
})();
