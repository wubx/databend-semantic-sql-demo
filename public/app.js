const elements = Object.fromEntries(
  [
    "health",
    "question",
    "examples",
    "plan",
    "run",
    "error",
    "route",
    "interpretation",
    "cubeQuery",
    "validation",
    "explain",
    "executeSql",
    "sql",
    "explainResult",
    "result",
    "metrics",
    "summaryCard",
    "summary",
  ].map((id) => [id, document.getElementById(id)]),
);
let currentPlan;

boot();

async function boot() {
  await Promise.all([loadHealth(), loadExamples()]);
  elements.plan.addEventListener("click", () => plan(false));
  elements.run.addEventListener("click", () => plan(true));
  elements.explain.addEventListener("click", explain);
  elements.executeSql.addEventListener("click", executePlannedSql);
}

async function loadHealth() {
  try {
    const health = await api("/api/health");
    elements.health.textContent = health.ok
      ? `Cube 与 Databend 已连接${health.aiEnabled ? ` · AI ${health.aiModel}` : ""}`
      : "依赖服务异常";
    elements.health.className = `health ${health.ok ? "ok" : "bad"}`;
  } catch (error) {
    elements.health.textContent = "Demo API 未连接";
    elements.health.className = "health bad";
  }
}

async function loadExamples() {
  const { queries } = await api("/api/query/examples");
  elements.examples.innerHTML = queries
    .map(
      (query) =>
        `<button class="example" data-question="${escapeHtml(query.question)}">${query.id} · ${escapeHtml(query.title)}</button>`,
    )
    .join("");
  elements.examples.addEventListener("click", (event) => {
    const button = event.target.closest("[data-question]");
    if (button) elements.question.value = button.dataset.question;
  });
}

async function plan(execute) {
  setBusy(true);
  clearError();
  try {
    const payload = {
      question: elements.question.value,
      mode: document.querySelector('input[name="mode"]:checked').value,
      planner: document.querySelector('input[name="planner"]:checked').value,
    };
    const response = await api(
      execute ? "/api/query/execute" : "/api/query/plan",
      { method: "POST", body: JSON.stringify(payload) },
    );
    currentPlan = execute ? response.plan : response;
    renderPlan(currentPlan);
    if (execute) renderResult(response);
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

function renderPlan(plan) {
  if (!plan.supported) {
    elements.route.textContent = "不支持";
    elements.interpretation.textContent = plan.message;
    return;
  }
  elements.route.textContent =
    plan.route === "semantic" ? "Semantic" : "TPC-H SQL";
  elements.interpretation.innerHTML = [
    ["认证查询", `${plan.queryId} · ${plan.title}`],
    [
      "计划器",
      plan.fallback
        ? `${plan.planner}（AI 回退：${plan.fallback.reason}）`
        : plan.planner,
    ],
    [
      "查询理解",
      plan.queryUnderstanding?.llmUsed
        ? `使用 LLM（${plan.queryUnderstanding.method}）`
        : `未使用 LLM（${plan.queryUnderstanding?.method || "deterministic"}）`,
    ],
    ["可信度", `${Math.round(plan.confidence * 100)}%`],
    [
      "执行路径",
      plan.route === "semantic"
        ? "Cube Semantic Query → Databend"
        : "Certified SQL → Databend",
    ],
    ["参数", JSON.stringify(plan.parameters || {})],
    ["计划耗时", formatTimings(plan.timings)],
  ]
    .map(
      ([key, value]) =>
        `<div class="interpretation-row"><span>${key}</span><strong>${escapeHtml(value)}</strong></div>`,
    )
    .join("");
  elements.cubeQuery.textContent = plan.cubeQuery
    ? JSON.stringify(plan.cubeQuery, null, 2)
    : "此查询使用认证的 TPC-H SQL 模板。";
  elements.sql.textContent = plan.sql || "尚未生成";
  elements.validation.textContent = plan.validation?.valid
    ? "安全检查通过"
    : "安全检查失败";
  elements.validation.style.color = plan.validation?.valid
    ? "#55dfc5"
    : "#ff8da3";
  elements.explain.disabled = !plan.validation?.valid;
  elements.executeSql.disabled = !plan.validation?.valid;
  elements.explainResult.classList.add("hidden");
}

async function explain() {
  if (!currentPlan?.sql) return;
  setBusy(true);
  try {
    const response = await api("/api/query/explain", {
      method: "POST",
      body: JSON.stringify({ sql: currentPlan.sql }),
    });
    elements.explainResult.textContent = response.rows
      .map((row) => Object.values(row).join(" "))
      .join("\n");
    elements.explainResult.classList.remove("hidden");
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

async function executePlannedSql() {
  if (!currentPlan?.sql || !currentPlan?.validation?.valid) return;
  setBusy(true);
  clearError();
  try {
    const response = await api("/api/query/execute-sql", {
      method: "POST",
      body: JSON.stringify({
        question: elements.question.value,
        sql: currentPlan.sql,
        sqlValues: currentPlan.sqlValues || [],
        plan: {
          queryId: currentPlan.queryId,
          route: currentPlan.route,
          planner: currentPlan.planner,
          strategy: currentPlan.strategy,
          cubeQuery: currentPlan.cubeQuery,
          queryUnderstanding: currentPlan.queryUnderstanding,
          timings: currentPlan.timings,
        },
      }),
    });
    renderResult(response);
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

function renderResult(response) {
  const rows = response.data || [];
  elements.metrics.textContent = `${response.source} · ${response.durationMs} ms · ${rows.length} rows · ${formatTimings(response.timings)}`;
  if (response.summary) {
    elements.summary.textContent = response.summary;
    elements.summaryCard.classList.remove("hidden");
  } else {
    elements.summaryCard.classList.add("hidden");
  }
  if (!rows.length) {
    elements.result.innerHTML =
      '<div class="empty">查询成功，但没有返回数据。</div>';
    return;
  }
  const columns = [...new Set(rows.flatMap(Object.keys))];
  elements.result.innerHTML = `<div class="table-wrap"><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(format(row[column]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error ||
        body.message ||
        body.errors?.join("; ") ||
        `HTTP ${response.status}`,
    );
  return body;
}

function formatTimings(timings) {
  if (!timings) return "未记录";
  const labels = {
    llmMs: "LLM",
    exactMatchMs: "精确匹配",
    deterministicMs: "规则路由",
    fallbackMs: "回退",
    sqlGenerationMs: "Cube SQL",
    validationMs: "校验",
    planningMs: "计划",
    explainMs: "EXPLAIN",
    queryMs: "查询",
    summaryMs: "总结",
    totalMs: "总计",
  };
  return Object.entries(timings)
    .filter(([key, value]) => labels[key] && Number.isFinite(value))
    .map(([key, value]) => `${labels[key]} ${value} ms`)
    .join(" · ");
}
function setBusy(busy) {
  elements.plan.disabled = busy;
  elements.run.disabled = busy;
  elements.explain.disabled = busy || !currentPlan?.validation?.valid;
  elements.executeSql.disabled = busy || !currentPlan?.validation?.valid;
  elements.plan.textContent = busy ? "处理中…" : "生成计划";
}
function showError(message) {
  elements.error.textContent = message;
  elements.error.classList.remove("hidden");
}
function clearError() {
  elements.error.classList.add("hidden");
}
function format(value) {
  return value == null
    ? "null"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
}
