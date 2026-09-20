(function (root) {
  const candidatesByModule = {
    "task-service": [
      {
        name: "Agent Gamma",
        strategy: "Rewrite as stored procedure",
        affected: [{ id: "tasks-db", level: "red" }, { id: "admin-dashboard", level: "red" }],
        verdict: "rejected",
        secondary: {
          resolves: false,
          furtherRipple: "analytics-service",
          note: "Moving the query into tasks-db still leaves analytics-service reading the old row shape for reporting — would need a third change there.",
        },
      },
      {
        name: "Agent Beta",
        strategy: "Switch to an ORM query builder",
        affected: [{ id: "search-service", level: "amber" }],
        verdict: "review",
        secondary: {
          resolves: true,
          note: "search-service’s indexer updated to read the ORM’s result shape instead of the raw rows.",
        },
      },
      {
        name: "Agent Alpha",
        strategy: "Parameterized query",
        affected: [],
        verdict: "safe",
        patch:
          'def search_tasks(project_id, query):\n    sql = "SELECT * FROM tasks WHERE project_id = %s AND title LIKE %s"\n    return db.execute(sql, (project_id, f"%{query}%"))',
      },
    ],
    "web-app": [
      {
        name: "Agent Gamma",
        strategy: "Strip all HTML client-side with a blocklist",
        affected: [{ id: "api-gateway", level: "red" }],
        verdict: "rejected",
        secondary: {
          resolves: false,
          furtherRipple: "mobile-bff",
          note: "Blocking tags client-side breaks the markdown api-gateway already renders server-side — mobile-bff would need the same blocklist duplicated, and they’d drift.",
        },
      },
      {
        name: "Agent Alpha",
        strategy: "Escape on render with a sanitizer, no contract change",
        affected: [],
        verdict: "safe",
        patch:
          "function CommentThread({ comments }) {\n  return (\n    <div className=\"comment-thread\">\n      {comments.map(c => (\n        <div key={c.id}>{sanitize(c.body)}</div>\n      ))}\n    </div>\n  );\n}",
      },
      {
        name: "Agent Beta",
        strategy: "Server-side render with a sanitizer library",
        affected: [{ id: "api-gateway", level: "amber" }],
        verdict: "review",
        secondary: {
          resolves: true,
          note: "api-gateway’s response payload size increases slightly — within its existing limits after a config bump.",
        },
      },
    ],
    "file-upload-service": [
      {
        name: "Agent Beta",
        strategy: "Add a project-membership check via task-service",
        affected: [{ id: "task-service", level: "amber" }],
        verdict: "review",
        secondary: {
          resolves: true,
          note: "task-service exposes a lightweight membership-check endpoint file-upload-service now calls before streaming.",
        },
      },
      {
        name: "Agent Alpha",
        strategy: "Add ownership check using data already on the record",
        affected: [],
        verdict: "safe",
        patch:
          '@app.get("/attachments/{file_id}")\ndef download_attachment(file_id, current_user):\n    file = db.get_file(file_id)\n    if file.project_id not in current_user.project_ids:\n        raise Forbidden()\n    return stream_from_s3(file.s3_key)',
      },
      {
        name: "Agent Gamma",
        strategy: "Move file access behind a new permissions microservice",
        affected: [{ id: "task-service", level: "red" }, { id: "background-worker", level: "red" }],
        verdict: "rejected",
        secondary: {
          resolves: false,
          furtherRipple: "admin-dashboard",
          note: "task-service would need to call the new permissions service too, and admin-dashboard’s bulk-export feature reads files directly — same problem, third place.",
        },
      },
    ],
    "auth-service": [
      {
        name: "Agent Alpha",
        strategy: "Add expiry + move secret to env var, no interface change",
        affected: [],
        verdict: "safe",
        patch:
          'REFRESH_SECRET = os.environ["REFRESH_TOKEN_SECRET"]\n\ndef issue_refresh_token(user_id):\n    return jwt.encode({"sub": user_id, "exp": time.time() + 86400}, REFRESH_SECRET, algorithm="HS256")',
      },
      {
        name: "Agent Beta",
        strategy: "Rotate secret and shorten expiry, keep JWT",
        affected: [{ id: "ci-cd-pipeline", level: "amber" }],
        verdict: "review",
        secondary: {
          resolves: true,
          note: "ci-cd-pipeline’s deploy step updated to provision the new rotated secret at release time.",
        },
      },
      {
        name: "Agent Gamma",
        strategy: "Replace JWT with server-side session tokens entirely",
        affected: [{ id: "api-gateway", level: "red" }, { id: "redis-cache", level: "red" }],
        verdict: "rejected",
        secondary: {
          resolves: false,
          furtherRipple: "web-app",
          note: "api-gateway’s auth middleware would need a full rewrite, and web-app still expects a stateless bearer token — same conflict, client side.",
        },
      },
    ],
    "webhook-service": [
      {
        name: "Agent Gamma",
        strategy: "Proxy all outbound calls through a new egress-filtering service",
        affected: [{ id: "task-service", level: "red" }, { id: "background-worker", level: "red" }],
        verdict: "rejected",
        secondary: {
          resolves: false,
          furtherRipple: "notification-service",
          note: "background-worker would need the new proxy wired in for every job type, and notification-service’s retry path routes through the same queue — same conflict, one hop over.",
        },
      },
      {
        name: "Agent Beta",
        strategy: "Add an allowlist check with DNS-rebind protection",
        affected: [{ id: "background-worker", level: "amber" }],
        verdict: "review",
        secondary: {
          resolves: true,
          note: "background-worker’s retry backoff adjusted slightly for the extra resolution step.",
        },
      },
      {
        name: "Agent Alpha",
        strategy: "Validate destination IP against private ranges before each request",
        affected: [],
        verdict: "safe",
        patch:
          "def send_webhook(url, payload):\n    if is_private_or_internal(resolve_host(url)):\n        raise BlockedDestination(url)\n    response = requests.post(url, json=payload, timeout=5)\n    return response.status_code",
      },
    ],
    "background-worker": [
      {
        name: "Agent Beta",
        strategy: "Add HMAC signature verification before deserializing",
        affected: [{ id: "webhook-service", level: "amber" }],
        verdict: "review",
        secondary: {
          resolves: true,
          note: "webhook-service now signs its queued payloads before enqueueing them.",
        },
      },
      {
        name: "Agent Gamma",
        strategy: "Switch queue payload format to a custom binary protocol",
        affected: [{ id: "notification-service", level: "red" }, { id: "file-upload-service", level: "red" }],
        verdict: "rejected",
        secondary: {
          resolves: false,
          furtherRipple: "billing-service",
          note: "notification-service would need a full encoder rewrite, and billing-service’s receipt-email job shares the same queue — same conflict, one hop further.",
        },
      },
      {
        name: "Agent Alpha",
        strategy: "Switch from pickle to JSON for job payloads",
        affected: [],
        verdict: "safe",
        patch:
          'import json\n\ndef process_job(raw_message):\n    job = json.loads(raw_message.body)\n    return JOB_HANDLERS[job["type"]](job["payload"])',
      },
    ],
    "search-service": [
      {
        name: "Agent Alpha",
        strategy: "Bump the client library to the patched version",
        affected: [],
        verdict: "safe",
        patch: "elasticsearch==8.11.0",
      },
      {
        name: "Agent Gamma",
        strategy: "Self-host a patched Elasticsearch fork",
        affected: [{ id: "api-gateway", level: "red" }, { id: "task-service", level: "red" }],
        verdict: "rejected",
        secondary: {
          resolves: false,
          furtherRipple: "file-upload-service",
          note: "task-service’s query syntax would need to target the fork’s API, and file-upload-service’s attachment-name indexing shares the same client — same conflict, one hop over.",
        },
      },
      {
        name: "Agent Beta",
        strategy: "Swap to a managed search provider",
        affected: [{ id: "task-service", level: "amber" }],
        verdict: "review",
        secondary: {
          resolves: true,
          note: "task-service’s query builder updated for the managed provider’s syntax.",
        },
      },
    ],
    "billing-service": [
      {
        name: "Agent Gamma",
        strategy: "Replace Stripe client with a self-hosted payment abstraction",
        affected: [{ id: "users-db", level: "red" }, { id: "admin-dashboard", level: "red" }],
        verdict: "rejected",
        secondary: {
          resolves: false,
          furtherRipple: "task-service",
          note: "admin-dashboard’s billing-status view would need a rewrite, and task-service’s plan-limit checks read the same subscription fields — same conflict, one hop further.",
        },
      },
      {
        name: "Agent Alpha",
        strategy: "Move key to environment variable, no interface change",
        affected: [],
        verdict: "safe",
        patch:
          'import stripe\n\nstripe.api_key = os.environ["STRIPE_SECRET_KEY"]\n\ndef create_subscription(customer_id, price_id):\n    return stripe.Subscription.create(customer=customer_id, items=[{"price": price_id}])',
      },
      {
        name: "Agent Beta",
        strategy: "Fetch key at runtime from a secrets manager",
        affected: [{ id: "notification-service", level: "amber" }],
        verdict: "review",
        secondary: {
          resolves: true,
          note: "notification-service’s receipt-email trigger timing shifts slightly for the extra secrets-manager round trip — absorbed with a short retry.",
        },
      },
    ],
  };

  const testsByModule = {
    "task-service": [
      "test_search_returns_matching_tasks",
      "test_search_blocks_sql_injection",
      "test_search_pagination_unaffected",
    ],
    "web-app": [
      "test_comment_renders_plain_text",
      "test_comment_blocks_script_injection",
      "test_markdown_formatting_preserved",
    ],
    "file-upload-service": [
      "test_owner_can_download",
      "test_non_owner_gets_403",
      "test_signed_url_still_expires",
    ],
    "auth-service": [
      "test_login_issues_valid_token",
      "test_expired_token_rejected",
      "test_secret_loaded_from_env",
    ],
    "webhook-service": [
      "test_webhook_delivers_to_public_url",
      "test_internal_ip_blocked",
      "test_retry_backoff_unaffected",
    ],
    "background-worker": [
      "test_job_processes_valid_payload",
      "test_malformed_payload_rejected",
      "test_queue_throughput_unaffected",
    ],
    "search-service": [
      "test_search_index_builds",
      "test_client_library_patched_version",
      "test_query_latency_unaffected",
    ],
    "billing-service": [
      "test_subscription_created",
      "test_api_key_not_in_source",
      "test_webhook_signature_still_verifies",
    ],
  };

  const flakyTest = {
    module: "task-service",
    testIndex: 2,
    failNote: "pagination offset calculation changed under the parameterized query",
  };

  let currentFinding = null;
  let adoptedPatch = null;

  function viz() {
    return root.OrbitViz;
  }

  function setFeStatus(text) {
    const el = document.getElementById("feStatus");
    if (el) el.textContent = text;
  }

  function logFe(text, cls) {
    const log = document.getElementById("feLog");
    if (!log) return;
    const d = document.createElement("div");
    d.className = "fe-log-item" + (cls ? " " + cls : "");
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function term(text, cls) {
    const box = document.getElementById("feTerminalBody");
    if (!box) return;
    const d = document.createElement("div");
    d.className = "fe-term-line" + (cls ? " " + cls : "");
    d.textContent = text;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
  }

  function openFixExplorer(moduleId, finding) {
    const candidates = candidatesByModule[moduleId];
    if (!candidates || !viz()) return;
    currentFinding = finding || null;
    adoptedPatch = null;
    const title = (finding && (finding.title || finding.description)) || "Finding";
    document.getElementById("feTitle").textContent = title + " — " + moduleId;
    document.getElementById("feLog").innerHTML = "";
    document.getElementById("feTerminalBody").innerHTML = "";
    document.getElementById("feTerminal").classList.remove("active");
    document.getElementById("feActions").style.display = "none";
    setFeStatus("Identifying source module...");
    term("$ resolving: " + title + " (" + moduleId + ")", "cmd");
    document.getElementById("fixExplorer").classList.add("active");
    document.body.classList.add("fix-mode");
    viz().setControlsEnabled(false);
    setTimeout(function () {
      viz().resize();
    }, 60);
    setTimeout(function () {
      viz().resize();
    }, 340);

    if (finding && root.OrbitData) {
      OrbitData.setFinding(finding.id, { status: "fix-drafted" });
    }

    setTimeout(function () {
      viz().flyCameraTo(moduleId, 900);
      runAttempt(candidates, moduleId, 0, null);
    }, 500);
  }

  function runAttempt(candidates, moduleId, i, fallback) {
    const v = viz();
    v.clearTrail();
    if (i >= candidates.length) {
      finishFixExplorer(moduleId, null, fallback);
      return;
    }
    const c = candidates[i];
    v.flyCameraTo(moduleId, 800);
    setFeStatus("Attempt " + (i + 1) + " of " + candidates.length + " — " + c.strategy);
    term("$ testing strategy: " + c.strategy, "cmd");

    setTimeout(function () {
      v.ping(moduleId);
      term("  → checking dependency graph for side effects...");
      if (c.affected.length === 0) {
        setTimeout(function () {
          setFeStatus("Verified safe — 0 modules affected. Adopting this fix.");
          logFe("Attempt " + (i + 1) + ": " + c.strategy + " — verified safe.", "ok");
          term("  ✓ 0 modules affected — VERIFIED SAFE", "pass");
          finishFixExplorer(moduleId, c, fallback);
        }, 900);
        return;
      }

      const target = c.affected[0].id;
      const targetHex = c.affected[0].level === "red" ? 0xff4b4b : 0xffb84d;
      v.setNodeColor(target, targetHex, 0.34);
      v.drawTrail(moduleId, target, targetHex);
      term("  ✗ conflict: " + target + " (" + c.affected[0].level + ")", "fail");

      setTimeout(function () {
        setFeStatus("Conflict detected in " + target + " — checking a compensating change there");
        v.flyCameraTo(target, 800);
        const sec = c.secondary;
        term("  → attempting compensating patch in " + target + "...", "cmd");

        setTimeout(function () {
          if (sec && sec.furtherRipple) {
            v.setNodeColor(sec.furtherRipple, 0xffb84d, 0.28);
            v.drawTrail(target, sec.furtherRipple, 0xffb84d);
            term("    ✗ ripple: " + sec.furtherRipple, "fail");
          }
          setTimeout(function () {
            if (sec && sec.resolves) {
              setFeStatus(
                "Resolved via a coordinated change in " +
                  target +
                  " — keeping as a fallback, still searching for cleaner"
              );
              logFe(
                "Attempt " + (i + 1) + ": " + c.strategy + " — viable fallback (2 files). " + sec.note,
                "review"
              );
              term("  ✓ resolved (2 files) — " + sec.note, "pass");
              term("  → keeping as fallback, continuing search for a single-file fix", "cmd");
              const newFallback = fallback || { candidate: c, secondaryTarget: target };
              setTimeout(function () {
                v.setNodeColor(target, 0x4fd6ff, 0.18);
                runAttempt(candidates, moduleId, i + 1, newFallback);
              }, 900);
            } else {
              setFeStatus("Still conflicts two files deep — backtracking to try a different approach");
              logFe(
                "Attempt " +
                  (i + 1) +
                  ": " +
                  c.strategy +
                  " — rejected. " +
                  (sec ? sec.note : "Would break " + c.affected.length + " module(s)."),
                "bad"
              );
              term("  ✗ " + (sec ? sec.note : "still breaks " + c.affected.length + " module(s)"), "fail");
              term("  ✗ ABANDONED — backtracking", "fail");
              setTimeout(function () {
                v.setNodeColor(target, 0x4fd6ff, 0.18);
                if (sec && sec.furtherRipple) v.setNodeColor(sec.furtherRipple, 0x4fd6ff, 0.18);
                runAttempt(candidates, moduleId, i + 1, fallback);
              }, 900);
            }
          }, 1000);
        }, 850);
      }, 500);
    }, 700);
  }

  function finishFixExplorer(moduleId, winner, fallback) {
    const v = viz();
    const adopted = winner || (fallback ? fallback.candidate : null);
    v.flyCameraTo(moduleId, 800);
    v.clearTrail();
    if (adopted) {
      setFeStatus(
        winner
          ? "Verified safe with zero modules affected — confirming with tests next."
          : "Adopting the best verified fallback — confirming with tests next."
      );
      adoptedPatch = adopted;
      term("$ graph search complete — adopting: " + adopted.strategy, "cmd");
      setTimeout(function () {
        runVerification(moduleId, adopted);
      }, 900);
    } else {
      setFeStatus("No verified fix found across any explored path — this needs a person.");
      term("✗ no candidate verified safe — escalating to a person", "fail");
      document.getElementById("feActions").style.display = "block";
      document.getElementById("feViewFixBtn").onclick = closeFixExplorer;
    }
  }

  function runVerification(moduleId, adopted) {
    const tests = testsByModule[moduleId] || [];
    setFeStatus("Running verification tests against the fix...");
    logFe("Running " + tests.length + " verification tests...", null);
    term("$ running verification suite for " + moduleId, "cmd");
    runTestSequence(moduleId, adopted, tests, 0, false);
  }

  function runTestSequence(moduleId, adopted, tests, i, isRetry) {
    if (i >= tests.length) {
      setFeStatus("All tests passed — fix confirmed.");
      logFe("Verification: all " + tests.length + " tests passed.", "ok");
      term("✓ all tests passed — fix confirmed", "pass");
      completeFixExplorer(moduleId, adopted);
      return;
    }
    const testName = tests[i];
    setTimeout(function () {
      const isFlaky = flakyTest.module === moduleId && flakyTest.testIndex === i && !isRetry;
      if (isFlaky) {
        term("  " + testName + " ... FAIL", "fail");
        term("    ✗ " + flakyTest.failNote, "fail");
        setFeStatus("Test failed — adjusting the fix and retesting...");
        logFe("Verification: " + testName + " failed — refining the patch.", "bad");
        setTimeout(function () {
          term("$ adjusting patch: casting invoice_id explicitly before binding", "cmd");
          setTimeout(function () {
            term("  " + testName + " ... PASS (after fix)", "pass");
            logFe("Verification: " + testName + " passes after a small adjustment.", "ok");
            runTestSequence(moduleId, adopted, tests, i + 1, false);
          }, 900);
        }, 900);
      } else {
        term("  " + testName + " ... PASS", "pass");
        runTestSequence(moduleId, adopted, tests, i + 1, isRetry);
      }
    }, 550);
  }

  function completeFixExplorer(moduleId, adopted) {
    if (currentFinding && root.OrbitData) {
      OrbitData.setFinding(currentFinding.id, { status: "verified-safe" });
    }
    if (adopted && adopted.patch && currentFinding) {
      try {
        sessionStorage.setItem(
          "orbit-approved-patch",
          JSON.stringify({
            findingId: currentFinding.id,
            file: (currentFinding.moduleId || moduleId) + "/fix",
            patchedFile: adopted.patch,
            safe: true,
          })
        );
      } catch (e) {}
    }
    document.getElementById("feActions").style.display = "none";
    setFeStatus("Checking impact of the verified fix...");
    logFe("Running blast-radius scan on the adopted patch...", null);
    function readyToApprove() {
      setFeStatus("Impact check complete — fix confirmed.");
      logFe("Impact: no other files would break.", "ok");
      document.getElementById("feActions").style.display = "flex";
      document.getElementById("feViewFixBtn").onclick = function () {
        closeFixExplorer();
        if (viz().showVerifiedFix) viz().showVerifiedFix(moduleId, currentFinding, adopted);
      };
    }
    if (viz() && viz().runScan) {
      viz().runScan(readyToApprove);
    } else {
      readyToApprove();
    }
  }

  function closeFixExplorer() {
    document.getElementById("fixExplorer").classList.remove("active");
    document.getElementById("feTerminal").classList.remove("active");
    document.body.classList.remove("fix-mode");
    if (viz()) {
      viz().setControlsEnabled(true);
      viz().clearTrail();
      setTimeout(function () {
        viz().resize();
      }, 60);
      setTimeout(function () {
        viz().resize();
      }, 340);
    }
  }

  function bindChrome() {
    const toggle = document.getElementById("feTerminalToggle");
    const termEl = document.getElementById("feTerminal");
    const closeTerm = document.getElementById("feTerminalClose");
    const close = document.getElementById("feClose");
    if (toggle) {
      toggle.addEventListener("click", function () {
        termEl.classList.toggle("active");
      });
    }
    if (closeTerm) {
      closeTerm.addEventListener("click", function () {
        termEl.classList.remove("active");
      });
    }
    if (close) close.addEventListener("click", closeFixExplorer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindChrome);
  } else {
    bindChrome();
  }

  root.FixExplorer = {
    open: openFixExplorer,
    close: closeFixExplorer,
  };
})(window);
