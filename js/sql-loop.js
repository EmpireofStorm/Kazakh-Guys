(function (root) {
  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function findingId() {
    try {
      return sessionStorage.getItem("orbit-loop-finding") || "F-SQL-1";
    } catch (e) {
      return "F-SQL-1";
    }
  }

  function currentFix(safe) {
    const id = findingId();
    const fixes = (root.OrbitData && OrbitData.FIXES) || {};
    if (safe && fixes[id + "-SAFE"]) return fixes[id + "-SAFE"];
    if (fixes[id]) return fixes[id];
    try {
      const stored = JSON.parse(sessionStorage.getItem("orbit-approved-patch") || "null");
      if (stored) return stored;
    } catch (e) {}
    const f = (root.OrbitData.FINDINGS || []).find(function (x) {
      return x.id === id;
    });
    if (!f) return null;
    const mod = root.OrbitData.BY_ID && OrbitData.BY_ID[f.moduleId];
    return {
      title: f.title,
      file: mod && mod.filePath ? mod.filePath[0] : f.moduleId,
      why: "Impact is clear. Approve opens a draft only.",
      flagged: f.description || "",
      replacement: "Safer rewrite staged in Graph Dev.",
      findingId: f.id,
      moduleId: f.moduleId,
    };
  }

  function askApprove() {
    const fix = currentFix(true) || currentFix(false);
    if (!fix || !root.CrewUI || !CrewUI.showFixReview) return;
    CrewUI.showFixReview(fix, {
      final: true,
      onApprove: function () {
        sessionStorage.removeItem("orbit-loop-notes");
        if (root.CrewUI.testNote) CrewUI.testNote("Done", "Draft only. Nothing was merged.");
      },
      onLearn: function () {
        setTimeout(function () {
          start();
        }, 700);
      },
    });
  }

  function onSecurity() {
    return String(location.pathname || "").indexOf("security") !== -1;
  }

  function onOrbit() {
    return String(location.pathname || "").indexOf("orbit") !== -1;
  }

  async function start() {
    const id = findingId();
    const first = currentFix(false);
    if (first) {
      try {
        sessionStorage.setItem("orbit-approved-patch", JSON.stringify(first));
      } catch (e) {}
    }
    if (!onOrbit()) {
      location.href =
        "orbit.html?finding=" + encodeURIComponent(id) + "&patched=1&loop=1&pass=1";
      return;
    }
  }

  function afterGraphFail() {
    const id = findingId();
    const next = currentFix(true) || currentFix(false);
    if (next) {
      try {
        sessionStorage.setItem("orbit-approved-patch", JSON.stringify(next));
      } catch (e) {}
    }
    if (root.CrewUI && CrewUI.setActivity) {
      CrewUI.setActivity("Callers would break. Rewriting the fix…", true);
    }
    setTimeout(function () {
      location.href =
        "orbit.html?finding=" + encodeURIComponent(id) + "&patched=1&safe=1&loop=1&pass=2";
    }, 900);
  }

  function afterGraphOk() {
    if (root.CrewUI && CrewUI.setActivity) CrewUI.setActivity("", false);
    setTimeout(askApprove, 500);
  }

  root.SqlLoop = {
    start: start,
    askApprove: askApprove,
    afterGraphFail: afterGraphFail,
    afterGraphOk: afterGraphOk,
    findingId: findingId,
  };
})(window);
