(function (root) {
  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function radarOn() {
    return localStorage.getItem("orbit-radar") === "1";
  }

  function lessons() {
    try {
      return JSON.parse(sessionStorage.getItem("orbit-lessons") || "[]");
    } catch (e) {
      return [];
    }
  }

  function note(title, detail) {
    if (root.CrewUI && CrewUI.testNote) CrewUI.testNote(title, detail);
  }

  function askApprove() {
    const fix = root.OrbitData && OrbitData.FIXES && OrbitData.FIXES["F-SQL-1-SAFE"];
    if (!fix || !root.CrewUI || !CrewUI.showFixReview) return;
    CrewUI.showFixReview(fix, {
      final: true,
      onApprove: function () {
        sessionStorage.removeItem("orbit-loop-notes");
        note("Done", "You approved the change. It is a draft only.");
      },
      onLearn: function (reason) {
        note("Trying again", reason || "Using your note.");
        setTimeout(function () {
          start();
        }, 900);
      },
    });
  }

  function onSecurity() {
    return String(location.pathname || "").indexOf("security") !== -1;
  }

  async function spamSqlTests() {
    const old = document.getElementById("center-wait");
    if (old) old.remove();
    const back = document.createElement("div");
    back.id = "center-wait";
    back.className = "center-wait-back";
    back.innerHTML =
      '<div class="center-wait" role="status">' +
      "<h2>Running consecutive SQL tests</h2>" +
      '<pre class="sql-spam" id="sql-spam-log"></pre>' +
      "</div>";
    document.body.appendChild(back);
    const log = back.querySelector("#sql-spam-log");
    function add(line) {
      log.textContent += line + "\n";
      log.scrollTop = log.scrollHeight;
    }
    const count = 12;
    for (let i = 1; i <= count; i++) {
      const secs = (Math.random() * 180000 + 0.2).toFixed(1);
      if (i === 1) add("sql test 1");
      else add("sql test " + i + " run " + secs + " seconds continue further");
      await sleep(240 + Math.floor(Math.random() * 80));
    }
    add("sql tests complete — 1 issue found");
    await sleep(500);
    back.classList.add("out");
    await sleep(280);
    back.remove();
  }

  async function start() {
    if (!onSecurity()) {
      location.href = "security.html?sqlloop=1";
      return;
    }
    await spamSqlTests();
    const last = lessons();
    const tip = last.length ? last[last.length - 1].reason : "";
    if (sessionStorage.getItem("orbit-loop-notes") !== "1") {
      note("Running SQL check", "Looking for unsafe database queries.");
      await sleep(400);
      note("Test #1 finished", "Done in 0.8s — 1 issue found in lookup.ts");
      await sleep(300);
      sessionStorage.setItem("orbit-loop-notes", "1");
    }
    if (tip) note("Using your note", tip);
    if (radarOn() && root.RadarUI) {
      const hit = (root.OrbitData.FINDINGS || []).filter(function (f) {
        return f.id === "F-SQL-1";
      });
      await new Promise(function (resolve) {
        RadarUI.run(hit, ["sqli"], resolve);
      });
    }
    note("Writing a fix", "Trying a safer query…");
    await sleep(600);
    try {
      sessionStorage.setItem("orbit-approved-patch", JSON.stringify(OrbitData.FIXES["F-SQL-1"]));
    } catch (e) {}
    location.href = "orbit.html?finding=F-SQL-1&patched=1&loop=1&pass=1";
  }

  function afterGraphFail() {
    note("GraphDev check", "2 files would break. Writing another fix…");
    try {
      sessionStorage.setItem("orbit-approved-patch", JSON.stringify(OrbitData.FIXES["F-SQL-1-SAFE"]));
    } catch (e) {}
    setTimeout(function () {
      location.href = "orbit.html?finding=F-SQL-1&patched=1&safe=1&loop=1&pass=2";
    }, 1200);
  }

  function afterGraphOk() {
    note("GraphDev check", "Looks good — 0 breaks. Your turn to approve.");
    setTimeout(askApprove, 700);
  }

  root.SqlLoop = {
    start: start,
    askApprove: askApprove,
    afterGraphFail: afterGraphFail,
    afterGraphOk: afterGraphOk,
    radarOn: radarOn,
  };
})(window);
