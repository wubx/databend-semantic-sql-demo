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
    "queryPage",
    "semanticPage",
    "evolutionPage",
    "evolutionStats",
    "refreshEvolution",
    "evolutionIssues",
    "evolutionHeading",
    "evolutionStatus",
    "evolutionDetail",
    "evolutionCollaboration",
    "evolutionReviewerContext",
    "evolutionOpenYaml",
    "evolutionReplay",
    "analyzeEvolution",
    "evolutionProposal",
    "observabilityPage",
    "logStats",
    "logSearch",
    "logOriginFilter",
    "logStatusFilter",
    "logLimit",
    "refreshLogs",
    "logMeta",
    "logList",
    "semanticDescription",
    "semanticStats",
    "semanticSearch",
    "kindFilters",
    "entityList",
    "relationshipCount",
    "relationshipGraph",
    "entityHeading",
    "memberCount",
    "memberGrid",
    "verifiedQueryList",
    "semanticCatalogView",
    "certifiedSqlView",
    "certifiedSqlList",
    "newCertifiedSql",
    "certifiedSqlHeading",
    "certifiedSqlMeta",
    "certifiedSqlId",
    "certifiedSqlTitle",
    "certifiedSqlDescription",
    "certifiedSqlStatus",
    "certifiedSqlEnabled",
    "certifiedSqlQuestion",
    "certifiedSqlExamples",
    "certifiedSqlParameters",
    "certifiedSqlEditor",
    "validateCertifiedSql",
    "explainCertifiedSql",
    "publishCertifiedSql",
    "deleteCertifiedSql",
    "certifiedSqlStatusMessage",
    "certifiedSqlExplainResult",
    "semanticSourceView",
    "semanticSource",
    "sourceMeta",
    "sourceFileCount",
    "sourceFileList",
    "sourceFilePath",
    "sourceFileDescription",
    "semanticSourceEditor",
    "sourceEditStatus",
    "editSource",
    "cancelSourceEdit",
    "validateSource",
    "saveSource",
    "deleteSource",
    "copySource",
    "downloadSource",
    "semanticGeneratorView",
    "databaseSelect",
    "businessContext",
    "enrichWithLlm",
    "generateModel",
    "selectedTableCount",
    "tableSelector",
    "generationStatus",
    "generatedDrafts",
  ].map((id) => [id, document.getElementById(id)]),
);
let currentPlan;
let semanticModel;
let selectedEntity = "all";
let selectedKind = "all";
let semanticSourceText = "";
let semanticSourceFiles = [];
let selectedSourceFile = "compiled";
let sourceEditing = false;
let modelerDatabases = [];
let generatedDraftState = new Map();
let certifiedSqlAssets = [];
let selectedCertifiedSqlId = null;
let certifiedSqlPublishEnabled = false;
let evolutionIssues = [];
let evolutionStatsData = null;
let selectedEvolutionIssueId = null;
let pendingEvolutionQuestion = null;
let evolutionFilter = "all";

boot();

async function boot() {
  await Promise.all([
    loadHealth(),
    loadExamples(),
    loadSemanticModel(),
    loadSemanticSourceFiles(),
    loadCertifiedSqlAssets(),
    loadModelerDatabases(),
  ]);
  elements.plan.addEventListener("click", () => startQuery(false));
  elements.run.addEventListener("click", () => startQuery(true));
  elements.explain.addEventListener("click", explain);
  elements.executeSql.addEventListener("click", executePlannedSql);
  elements.semanticSearch.addEventListener("input", renderMembers);
  elements.kindFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-kind]");
    if (!button) return;
    selectedKind = button.dataset.kind;
    renderKindFilters();
    renderMembers();
  });
  elements.entityList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-entity]");
    if (!button) return;
    selectedEntity = button.dataset.entity;
    renderEntities();
    renderMembers();
  });
  document
    .querySelectorAll("[data-semantic-view]")
    .forEach((tab) =>
      tab.addEventListener("click", () =>
        showSemanticView(tab.dataset.semanticView),
      ),
    );
  elements.copySource.addEventListener("click", copySemanticSource);
  elements.editSource.addEventListener("click", () => setSourceEditing(true));
  elements.cancelSourceEdit.addEventListener("click", () =>
    setSourceEditing(false),
  );
  elements.validateSource.addEventListener("click", () =>
    submitSemanticSource(false),
  );
  elements.saveSource.addEventListener("click", () =>
    submitSemanticSource(true),
  );
  elements.deleteSource.addEventListener("click", deleteCurrentSemanticSource);
  elements.downloadSource.addEventListener("click", downloadSemanticSource);
  elements.sourceFileList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-source-file]");
    if (button) loadSemanticSource(button.dataset.sourceFile);
  });
  elements.databaseSelect.addEventListener("change", loadModelerTables);
  elements.tableSelector.addEventListener("change", updateModelerSelection);
  elements.generateModel.addEventListener("click", generateModelDrafts);
  elements.generatedDrafts.addEventListener("click", handleDraftAction);
  elements.certifiedSqlList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-certified-sql]");
    if (button) selectCertifiedSql(button.dataset.certifiedSql);
  });
  elements.newCertifiedSql.addEventListener("click", newCertifiedSql);
  elements.validateCertifiedSql.addEventListener("click", () =>
    submitCertifiedSql("validate"),
  );
  elements.explainCertifiedSql.addEventListener("click", () =>
    submitCertifiedSql("explain"),
  );
  elements.publishCertifiedSql.addEventListener("click", () =>
    submitCertifiedSql("publish"),
  );
  elements.deleteCertifiedSql.addEventListener(
    "click",
    deleteCurrentCertifiedSql,
  );
  elements.refreshEvolution.addEventListener("click", loadEvolutionIssues);
  elements.evolutionStats.addEventListener("click", (event) => {
    const button = event.target.closest("[data-evolution-filter]");
    if (!button) return;
    evolutionFilter = button.dataset.evolutionFilter;
    renderEvolutionStats();
    renderEvolutionIssues();
  });
  elements.evolutionIssues.addEventListener("click", (event) => {
    const button = event.target.closest("[data-evolution-issue]");
    if (button) selectEvolutionIssue(button.dataset.evolutionIssue);
  });
  elements.analyzeEvolution.addEventListener("click", analyzeSelectedEvolution);
  elements.evolutionOpenYaml.addEventListener("click", openEvolutionYaml);
  elements.evolutionReplay.addEventListener("click", replayEvolutionQuestion);
  elements.refreshLogs.addEventListener("click", loadQueryLogs);
  elements.logOriginFilter.addEventListener("change", loadQueryLogs);
  elements.logStatusFilter.addEventListener("change", loadQueryLogs);
  elements.logLimit.addEventListener("change", loadQueryLogs);
  elements.logSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadQueryLogs();
  });
  elements.logList.addEventListener("click", (event) => {
    const improveButton = event.target.closest("[data-improve-question]");
    if (improveButton) {
      pendingEvolutionQuestion = improveButton.dataset.improveQuestion;
      showPage("evolution");
      return;
    }
    const button = event.target.closest("[data-reuse-question]");
    if (!button) return;
    elements.question.value = button.dataset.reuseQuestion;
    showPage("query");
    elements.question.focus();
  });
  document
    .querySelectorAll("[data-page]")
    .forEach((tab) =>
      tab.addEventListener("click", () => showPage(tab.dataset.page)),
    );
}

function showSemanticView(view) {
  document
    .querySelectorAll("[data-semantic-view]")
    .forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.semanticView === view),
    );
  elements.semanticCatalogView.classList.toggle("active", view === "catalog");
  elements.certifiedSqlView.classList.toggle(
    "active",
    view === "certified-sql",
  );
  elements.semanticSourceView.classList.toggle("active", view === "source");
  elements.semanticGeneratorView.classList.toggle(
    "active",
    view === "generate",
  );
}

async function loadCertifiedSqlAssets(preferredId = selectedCertifiedSqlId) {
  try {
    const response = await api("/api/certified-sql");
    certifiedSqlAssets = response.queries;
    certifiedSqlPublishEnabled = response.publishEnabled;
    renderCertifiedSqlList();
    const selected =
      certifiedSqlAssets.find((item) => item.id === preferredId) ||
      certifiedSqlAssets[0];
    if (selected) selectCertifiedSql(selected.id);
    else newCertifiedSql();
  } catch (error) {
    elements.certifiedSqlList.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

function renderCertifiedSqlList() {
  elements.certifiedSqlList.innerHTML = certifiedSqlAssets.length
    ? certifiedSqlAssets
        .map(
          (item) =>
            `<button data-certified-sql="${escapeHtml(item.id)}" class="certified-sql-item${item.id === selectedCertifiedSqlId ? " active" : ""}"><span><strong>${escapeHtml(item.id)} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.question)}</small></span><em class="${item.enabled && item.status === "certified" ? "ok" : ""}">${escapeHtml(item.status)}${item.enabled ? "" : " · 停用"}</em></button>`,
        )
        .join("")
    : '<div class="empty">尚无认证 SQL。</div>';
}

function selectCertifiedSql(id) {
  const asset = certifiedSqlAssets.find((item) => item.id === id);
  if (!asset) return;
  selectedCertifiedSqlId = asset.id;
  elements.certifiedSqlHeading.textContent = `${asset.id} · ${asset.title}`;
  elements.certifiedSqlMeta.textContent = `${asset.templatePath} · ${Object.keys(asset.parameters || {}).length} 个参数`;
  elements.certifiedSqlId.value = asset.id;
  elements.certifiedSqlId.disabled = true;
  elements.certifiedSqlTitle.value = asset.title;
  elements.certifiedSqlDescription.value = asset.description;
  elements.certifiedSqlStatus.value = asset.status;
  elements.certifiedSqlEnabled.checked = asset.enabled !== false;
  elements.certifiedSqlQuestion.value = asset.question;
  elements.certifiedSqlExamples.value = (asset.examples || []).join("\n");
  elements.certifiedSqlParameters.value = stringifySimpleYaml(
    asset.parameters || {},
  );
  elements.certifiedSqlEditor.value = asset.sql;
  elements.deleteCertifiedSql.disabled = !certifiedSqlPublishEnabled;
  elements.publishCertifiedSql.disabled = !certifiedSqlPublishEnabled;
  clearCertifiedSqlStatus();
  renderCertifiedSqlList();
}

function newCertifiedSql() {
  selectedCertifiedSqlId = null;
  elements.certifiedSqlHeading.textContent = "新建认证 SQL";
  elements.certifiedSqlMeta.textContent =
    "先保存为 draft，验证完成后再切换为 certified";
  elements.certifiedSqlId.value = "";
  elements.certifiedSqlId.disabled = false;
  elements.certifiedSqlTitle.value = "";
  elements.certifiedSqlDescription.value = "";
  elements.certifiedSqlStatus.value = "draft";
  elements.certifiedSqlEnabled.checked = true;
  elements.certifiedSqlQuestion.value = "";
  elements.certifiedSqlExamples.value = "";
  elements.certifiedSqlParameters.value = "{}\n";
  elements.certifiedSqlEditor.value =
    "SELECT COUNT(*) AS result\nFROM tpch_100.orders\n";
  elements.deleteCertifiedSql.disabled = true;
  elements.publishCertifiedSql.disabled = !certifiedSqlPublishEnabled;
  clearCertifiedSqlStatus();
  renderCertifiedSqlList();
  elements.certifiedSqlId.focus();
}

async function submitCertifiedSql(action) {
  const payload = certifiedSqlFormPayload();
  const endpoints = {
    validate: "/api/certified-sql/validate",
    explain: "/api/certified-sql/explain",
    publish: "/api/certified-sql/publish",
  };
  const button = {
    validate: elements.validateCertifiedSql,
    explain: elements.explainCertifiedSql,
    publish: elements.publishCertifiedSql,
  }[action];
  button.disabled = true;
  elements.certifiedSqlStatusMessage.className = "source-edit-status pending";
  elements.certifiedSqlStatusMessage.textContent =
    action === "publish"
      ? "正在校验、备份并发布…"
      : action === "explain"
        ? "正在校验并执行 EXPLAIN…"
        : "正在执行参数和 SQL 安全校验…";
  try {
    const result = await api(endpoints[action], {
      method: "POST",
      body: JSON.stringify(payload),
    });
    elements.certifiedSqlStatusMessage.className = "source-edit-status ok";
    elements.certifiedSqlStatusMessage.textContent =
      action === "publish"
        ? `已发布 ${result.asset.id} · ${result.replacing ? "已备份旧版本" : "新建资产"} · 无需重启`
        : action === "explain"
          ? `EXPLAIN 通过 · ${result.durationMs} ms`
          : `校验通过 · ${result.placeholders.length} 个参数 · SQL Safety 通过`;
    if (action === "explain") {
      elements.certifiedSqlExplainResult.textContent = result.rows
        .map((row) => Object.values(row).join(" "))
        .join("\n");
      elements.certifiedSqlExplainResult.classList.remove("hidden");
    }
    if (action === "publish") {
      selectedCertifiedSqlId = result.asset.id;
      await Promise.all([
        loadCertifiedSqlAssets(result.asset.id),
        loadExamples(),
      ]);
    }
  } catch (error) {
    elements.certifiedSqlStatusMessage.className = "source-edit-status bad";
    elements.certifiedSqlStatusMessage.textContent = error.message;
  } finally {
    button.disabled = action === "publish" && !certifiedSqlPublishEnabled;
  }
}

async function deleteCurrentCertifiedSql() {
  if (!selectedCertifiedSqlId || !certifiedSqlPublishEnabled) return;
  if (
    !confirm(
      `确认永久删除认证 SQL ${selectedCertifiedSqlId}？\n\nCatalog 和 SQL Template 会先自动备份。日常下线建议将状态改成 disabled。`,
    )
  )
    return;
  elements.deleteCertifiedSql.disabled = true;
  try {
    const result = await api(
      `/api/certified-sql/${encodeURIComponent(selectedCertifiedSqlId)}`,
      { method: "DELETE" },
    );
    selectedCertifiedSqlId = null;
    await Promise.all([loadCertifiedSqlAssets(), loadExamples()]);
    elements.certifiedSqlStatusMessage.className = "source-edit-status ok";
    elements.certifiedSqlStatusMessage.textContent = `已删除 ${result.deleted} · 已保存 ${result.backupPaths.length} 个备份`;
  } catch (error) {
    elements.certifiedSqlStatusMessage.className = "source-edit-status bad";
    elements.certifiedSqlStatusMessage.textContent = error.message;
  } finally {
    elements.deleteCertifiedSql.disabled =
      !selectedCertifiedSqlId || !certifiedSqlPublishEnabled;
  }
}

function certifiedSqlFormPayload() {
  return {
    id: elements.certifiedSqlId.value,
    title: elements.certifiedSqlTitle.value,
    description: elements.certifiedSqlDescription.value,
    status: elements.certifiedSqlStatus.value,
    enabled: elements.certifiedSqlEnabled.checked,
    question: elements.certifiedSqlQuestion.value,
    examples: elements.certifiedSqlExamples.value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    parameters: parseSimpleYaml(elements.certifiedSqlParameters.value),
    sql: elements.certifiedSqlEditor.value,
  };
}

function parseSimpleYaml(value) {
  // Parameter YAML is converted client-side by a deliberately small parser through JSON when possible;
  // otherwise the server receives the raw object encoded by indentation below.
  const text = String(value || "").trim();
  if (!text || text === "{}") return {};
  try {
    return JSON.parse(text);
  } catch {
    const result = {};
    let current;
    for (const raw of text.split("\n")) {
      if (!raw.trim() || raw.trim().startsWith("#")) continue;
      const top = raw.match(/^([A-Za-z][A-Za-z0-9_]*):\s*$/);
      if (top) {
        current = top[1];
        result[current] = {};
        continue;
      }
      const field = raw.match(/^\s{2}([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/);
      if (!field || !current) throw new Error(`无法解析参数 YAML：${raw}`);
      result[current][field[1]] = parseYamlScalar(field[2]);
    }
    return result;
  }
}

function parseYamlScalar(value) {
  const text = value.trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text.replace(/^['"]|['"]$/g, "");
}

function stringifySimpleYaml(value) {
  const lines = [];
  for (const [name, schema] of Object.entries(value || {})) {
    lines.push(`${name}:`);
    for (const [key, item] of Object.entries(schema))
      lines.push(
        `  ${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`,
      );
  }
  return `${lines.join("\n")}${lines.length ? "\n" : "{}\n"}`;
}

function clearCertifiedSqlStatus() {
  elements.certifiedSqlStatusMessage.classList.add("hidden");
  elements.certifiedSqlExplainResult.classList.add("hidden");
}

async function loadModelerDatabases() {
  try {
    const response = await api("/api/modeler/databases");
    modelerDatabases = response.databases.filter((item) => item.name);
    elements.databaseSelect.innerHTML =
      '<option value="">选择数据库…</option>' +
      modelerDatabases
        .map(
          (item) =>
            `<option value="${escapeHtml(item.name)}">${escapeHtml(item.catalog)} · ${escapeHtml(item.name)}</option>`,
        )
        .join("");
  } catch (error) {
    elements.databaseSelect.innerHTML =
      '<option value="">目录加载失败</option>';
  }
}

async function loadModelerTables() {
  const database = elements.databaseSelect.value;
  elements.generateModel.disabled = true;
  if (!database) return;
  elements.tableSelector.innerHTML =
    '<div class="empty">正在读取 Databend 表…</div>';
  try {
    const response = await api(
      `/api/modeler/tables?database=${encodeURIComponent(database)}`,
    );
    elements.tableSelector.innerHTML = response.tables.length
      ? response.tables
          .map(
            (table) =>
              `<label class="table-choice"><input type="checkbox" value="${escapeHtml(table.name)}" /><span><strong>${escapeHtml(table.name)}</strong><small>${escapeHtml(table.type || "TABLE")}</small></span></label>`,
          )
          .join("")
      : '<div class="empty">该数据库没有可建模的表。</div>';
    updateModelerSelection();
  } catch (error) {
    elements.tableSelector.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

function updateModelerSelection() {
  const selected = [
    ...elements.tableSelector.querySelectorAll(
      'input[type="checkbox"]:checked',
    ),
  ];
  elements.selectedTableCount.textContent = `${selected.length} 个已选择`;
  elements.generateModel.disabled = !selected.length;
}

async function generateModelDrafts() {
  const tables = [
    ...elements.tableSelector.querySelectorAll(
      'input[type="checkbox"]:checked',
    ),
  ].map((input) => input.value);
  elements.generateModel.disabled = true;
  elements.generationStatus.textContent = elements.enrichWithLlm.checked
    ? "正在生成并由 LLM 增强…"
    : "正在生成技术草稿…";
  elements.generatedDrafts.innerHTML =
    '<div class="empty">读取字段和推断语义成员中…</div>';
  try {
    const response = await api("/api/modeler/generate", {
      method: "POST",
      body: JSON.stringify({
        database: elements.databaseSelect.value,
        tables,
        enrichWithLlm: elements.enrichWithLlm.checked,
        businessContext: { description: elements.businessContext.value },
      }),
    });
    elements.generationStatus.textContent = `${response.drafts.length} 个草稿 · ${response.llmFallback ? "LLM 超时，已回退规则草稿" : response.llmEnriched ? "LLM 已增强" : "规则生成"} · ${formatTimings(response.timings)}`;
    generatedDraftState = new Map(
      response.drafts.map((draft) => [draft.entity.name, draft.yaml]),
    );
    elements.generatedDrafts.innerHTML = response.drafts
      .map(renderGeneratedDraft)
      .join("");
  } catch (error) {
    elements.generationStatus.textContent = "生成失败";
    elements.generatedDrafts.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  } finally {
    updateModelerSelection();
  }
}

function renderGeneratedDraft(draft, open = false) {
  const warnings = [
    ...(draft.diagnostics.warnings || []),
    ...(draft.diagnostics.llmWarnings || []),
  ];
  return `<details class="draft-result" data-draft="${escapeHtml(draft.entity.name)}"${open ? " open" : ""}><summary><div class="draft-summary-name"><strong>${escapeHtml(draft.entity.title)}</strong><code>${escapeHtml(draft.entity.name)}</code></div><div class="draft-summary-actions"><span>${draft.diagnostics.llmEnriched ? "LLM 已增强" : draft.diagnostics.llmFallback ? "LLM 回退" : "规则生成"}</span><em class="draft-inline-status">待校验</em><button type="button" class="tiny secondary" data-draft-action="validate">校验</button><button type="button" class="tiny primary" data-draft-action="publish">发布</button></div></summary><div class="draft-body">${warnings.map((warning) => `<p class="draft-warning">${escapeHtml(warning)}</p>`).join("")}<textarea class="draft-editor" spellcheck="false">${escapeHtml(draft.yaml)}</textarea><div class="draft-validation" aria-live="polite">修改后请先校验。</div><div class="draft-actions"><button class="tiny" data-draft-action="copy">复制草稿</button></div></div></details>`;
}

async function handleDraftAction(event) {
  const button = event.target.closest("[data-draft-action]");
  if (!button) return;
  const card = button.closest("[data-draft]");
  const editor = card.querySelector(".draft-editor");
  const status = card.querySelector(".draft-validation");
  const action = button.dataset.draftAction;
  const inlineStatus = card.querySelector(".draft-inline-status");
  if (action === "copy") {
    await navigator.clipboard.writeText(editor.value);
    button.textContent = "已复制";
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  button.disabled = true;
  inlineStatus.className = "draft-inline-status pending";
  inlineStatus.textContent = action === "publish" ? "发布中…" : "校验中…";
  status.className = "draft-validation pending";
  status.textContent = action === "publish" ? "校验并发布中…" : "校验中…";
  try {
    const result = await api(
      action === "publish"
        ? "/api/modeler/publish"
        : "/api/modeler/validate-draft",
      { method: "POST", body: JSON.stringify({ yaml: editor.value }) },
    );
    status.className = "draft-validation ok";
    inlineStatus.className = "draft-inline-status ok";
    inlineStatus.textContent = action === "publish" ? "已发布" : "校验通过";
    status.textContent =
      action === "publish"
        ? `发布成功：${result.target || result.relativePath}${result.backupPath ? ` · 备份 ${result.backupPath}` : " · 新建文件"}`
        : `校验通过：${result.replacing ? "将覆盖现有实体" : "将新增实体"} ${result.target}`;
    generatedDraftState.set(card.dataset.draft, editor.value);
    if (action === "publish") {
      await Promise.all([loadSemanticModel(), loadSemanticSourceFiles()]);
    }
  } catch (error) {
    status.className = "draft-validation bad";
    inlineStatus.className = "draft-inline-status bad";
    inlineStatus.textContent = action === "publish" ? "发布失败" : "校验失败";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function loadSemanticSourceFiles() {
  const response = await api("/api/semantic-model/sources");
  semanticSourceFiles = response.files;
  elements.sourceFileCount.textContent = `${semanticSourceFiles.length} 个文件`;
  renderSemanticSourceFiles();
  await loadSemanticSource(selectedSourceFile);
}

function renderSemanticSourceFiles() {
  const groups = semanticSourceFiles.reduce((result, file) => {
    if (!result.has(file.group)) result.set(file.group, []);
    result.get(file.group).push(file);
    return result;
  }, new Map());
  elements.sourceFileList.innerHTML = [...groups.entries()]
    .map(
      ([group, files]) =>
        `<section><h4>${escapeHtml(group)}</h4>${files.map((file) => `<button class="source-file${file.id === selectedSourceFile ? " active" : ""}" data-source-file="${escapeHtml(file.id)}"><span>${file.generated ? "◆" : "◇"}</span><div><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(file.path)}</small></div></button>`).join("")}</section>`,
    )
    .join("");
}

async function loadSemanticSource(file = "compiled") {
  selectedSourceFile = file;
  sourceEditing = false;
  const source = await api(
    `/api/semantic-model/source?file=${encodeURIComponent(file)}`,
  );
  semanticSourceText = source.content;
  elements.semanticSource.innerHTML = highlightYaml(semanticSourceText);
  elements.semanticSourceEditor.value = semanticSourceText;
  elements.sourceFilePath.textContent = source.path;
  elements.sourceFileDescription.textContent = source.generated
    ? "由模块化语义源实时组装的完整运行时 Manifest · 只读"
    : source.id === "relationships.yaml"
      ? "实体关系维护源 · 支持编辑、完整 Manifest 校验、Cube 编译和备份发布"
      : "可维护的模块化语义源文件 · 当前只读";
  const lineCount = semanticSourceText.split("\n").length;
  elements.sourceMeta.textContent = `${lineCount} 行 · ${formatBytes(new Blob([semanticSourceText]).size)}`;
  renderSemanticSourceFiles();
  setSourceEditing(false);
}

function setSourceEditing(editing) {
  const editable = selectedSourceFile !== "compiled";
  const deletable = selectedSourceFile.startsWith("entities/");
  sourceEditing = editable && editing;
  elements.semanticSource.classList.toggle("hidden", sourceEditing);
  elements.semanticSourceEditor.classList.toggle("hidden", !sourceEditing);
  elements.editSource.classList.toggle("hidden", !editable || sourceEditing);
  elements.cancelSourceEdit.classList.toggle("hidden", !sourceEditing);
  elements.validateSource.classList.toggle("hidden", !sourceEditing);
  elements.saveSource.classList.toggle("hidden", !sourceEditing);
  elements.deleteSource.classList.toggle("hidden", !deletable || sourceEditing);
  elements.sourceEditStatus.classList.add("hidden");
}

async function deleteCurrentSemanticSource() {
  if (!selectedSourceFile.startsWith("entities/")) return;
  const entity = semanticSourceFiles.find(
    (file) => file.id === selectedSourceFile,
  );
  if (
    !confirm(
      `确认删除 ${entity?.path || selectedSourceFile}？\n\n系统会先做完整模型和 Cube 编译校验，并备份实体文件和 model.yaml。被关系或认证查询引用的实体不能删除。`,
    )
  )
    return;
  elements.deleteSource.disabled = true;
  elements.sourceEditStatus.className = "source-edit-status pending";
  elements.sourceEditStatus.textContent = "正在验证删除影响…";
  try {
    await api("/api/semantic-model/source/delete/validate", {
      method: "POST",
      body: JSON.stringify({ file: selectedSourceFile }),
    });
    const result = await api("/api/semantic-model/source/delete", {
      method: "POST",
      body: JSON.stringify({ file: selectedSourceFile }),
    });
    selectedSourceFile = "compiled";
    await Promise.all([loadSemanticModel(), loadSemanticSourceFiles()]);
    elements.sourceEditStatus.className = "source-edit-status ok";
    elements.sourceEditStatus.textContent = `已删除 ${result.deleted} · 实体备份 ${result.backupPath} · model 备份 ${result.modelBackupPath}`;
    elements.sourceEditStatus.classList.remove("hidden");
  } catch (error) {
    elements.sourceEditStatus.className = "source-edit-status bad";
    elements.sourceEditStatus.textContent = error.message;
  } finally {
    elements.deleteSource.disabled = false;
  }
}

async function submitSemanticSource(save) {
  const endpoint = save
    ? "/api/semantic-model/source/save"
    : "/api/semantic-model/source/validate";
  const buttons = [elements.validateSource, elements.saveSource];
  buttons.forEach((button) => {
    button.disabled = true;
  });
  elements.sourceEditStatus.className = "source-edit-status pending";
  elements.sourceEditStatus.textContent = save
    ? "正在执行完整校验、Cube 编译并保存…"
    : "正在执行完整 Manifest 校验和 Cube 编译…";
  try {
    const result = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({
        file: selectedSourceFile,
        content: elements.semanticSourceEditor.value,
      }),
    });
    elements.sourceEditStatus.className = "source-edit-status ok";
    elements.sourceEditStatus.textContent = save
      ? `发布成功：${result.path} · 备份 ${result.backupPath} · ${result.relationships} 条关系`
      : `校验通过：${result.relationships} 条关系 · ${result.cubes.length} 个 Cube 编译成功`;
    if (save) {
      await Promise.all([loadSemanticModel(), loadSemanticSourceFiles()]);
      selectedSourceFile = "relationships.yaml";
      await loadSemanticSource(selectedSourceFile);
      elements.sourceEditStatus.className = "source-edit-status ok";
      elements.sourceEditStatus.textContent = `发布成功并已备份：${result.backupPath}`;
      elements.sourceEditStatus.classList.remove("hidden");
    }
  } catch (error) {
    elements.sourceEditStatus.className = "source-edit-status bad";
    elements.sourceEditStatus.textContent = error.message;
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

async function copySemanticSource() {
  await navigator.clipboard.writeText(semanticSourceText);
  const previous = elements.copySource.textContent;
  elements.copySource.textContent = "已复制";
  setTimeout(() => {
    elements.copySource.textContent = previous;
  }, 1200);
}

function downloadSemanticSource() {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([semanticSourceText], { type: "text/yaml" }),
  );
  link.download =
    selectedSourceFile === "compiled"
      ? "semantic-manifest.yaml"
      : selectedSourceFile.split("/").pop();
  link.click();
  URL.revokeObjectURL(link.href);
}

function highlightYaml(source) {
  return source
    .split("\n")
    .map((line, index) => {
      const escaped = escapeHtml(line);
      const highlighted = escaped
        .replace(/^(\s*)([\w.-]+)(:)/, '$1<span class="yaml-key">$2</span>$3')
        .replace(
          /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g,
          '<span class="yaml-string">$1</span>',
        )
        .replace(
          /\b(true|false|null)\b/g,
          '<span class="yaml-value">$1</span>',
        );
      return `<span class="source-line"><i>${index + 1}</i><span>${highlighted || " "}</span></span>`;
    })
    .join("\n");
}

function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function showPage(page) {
  document
    .querySelectorAll("[data-page]")
    .forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.page === page),
    );
  elements.queryPage.classList.toggle("active", page === "query");
  elements.semanticPage.classList.toggle("active", page === "semantic");
  elements.evolutionPage.classList.toggle("active", page === "evolution");
  elements.observabilityPage.classList.toggle(
    "active",
    page === "observability",
  );
  if (page === "evolution") loadEvolutionIssues();
  if (page === "observability") loadQueryLogs();
}

async function loadEvolutionIssues() {
  elements.refreshEvolution.disabled = true;
  try {
    const response = await api("/api/semantic-evolution/issues");
    evolutionIssues = response.issues;
    evolutionStatsData = response.stats;
    renderEvolutionStats();
    renderEvolutionIssues();
    if (pendingEvolutionQuestion) {
      const issue = evolutionIssues.find((item) =>
        item.questions.includes(pendingEvolutionQuestion),
      );
      pendingEvolutionQuestion = null;
      if (issue) selectEvolutionIssue(issue.id);
    } else if (
      selectedEvolutionIssueId &&
      evolutionIssues.some((item) => item.id === selectedEvolutionIssueId)
    ) {
      selectEvolutionIssue(selectedEvolutionIssueId);
    }
  } catch (error) {
    elements.evolutionIssues.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  } finally {
    elements.refreshEvolution.disabled = false;
  }
}

function renderEvolutionStats() {
  if (!evolutionStatsData) return;
  const stats = evolutionStatsData;
  const cards = [
    ["all", stats.issueCount, "全部待办"],
    ["repeated", stats.repeatedIssues, "重复缺口"],
    ["semantic-gap", stats.categories["semantic-gap"] || 0, "缺少成员"],
    ["grain-mismatch", stats.categories["grain-mismatch"] || 0, "粒度冲突"],
    ["ambiguous", stats.categories.ambiguous || 0, "业务歧义"],
    ["unclassified", stats.categories.unclassified || 0, "未分类"],
  ];
  elements.evolutionStats.innerHTML = cards
    .map(
      ([filter, value, label]) =>
        `<button class="evolution-stat ${evolutionFilter === filter ? "active" : ""}" data-evolution-filter="${filter}"><strong>${value}</strong><span>${label}</span></button>`,
    )
    .join("");
}

function filteredEvolutionIssues() {
  if (evolutionFilter === "all") return evolutionIssues;
  if (evolutionFilter === "repeated")
    return evolutionIssues.filter((issue) => issue.count > 1);
  return evolutionIssues.filter((issue) => issue.category === evolutionFilter);
}

function renderEvolutionIssues() {
  const issues = filteredEvolutionIssues();
  elements.evolutionIssues.innerHTML = issues.length
    ? issues.map(renderEvolutionIssue).join("")
    : '<div class="empty">当前分类没有语义缺口待办。</div>';
}

function renderEvolutionIssue(issue) {
  return `<button class="evolution-issue ${issue.id === selectedEvolutionIssueId ? "active" : ""}" data-evolution-issue="${escapeHtml(issue.id)}"><span>${escapeHtml(evolutionCategoryLabel(issue.category))}</span><strong>${escapeHtml(issue.questions[0] || "无问题文本")}</strong><small>${issue.count} 次 · ${escapeHtml((issue.affectedEntities || []).join("、") || "未识别实体")}</small></button>`;
}

function selectEvolutionIssue(issueId) {
  const issue = evolutionIssues.find((item) => item.id === issueId);
  if (!issue) return;
  selectedEvolutionIssueId = issueId;
  elements.evolutionIssues.innerHTML = evolutionIssues
    .map(renderEvolutionIssue)
    .join("");
  elements.evolutionHeading.textContent = issue.questions[0] || "语义缺口";
  elements.evolutionStatus.textContent = `${evolutionCategoryLabel(issue.category)} · ${issue.count} 次`;
  elements.evolutionDetail.className = "";
  elements.evolutionDetail.innerHTML = `<div class="evolution-diagnostics"><div><span>代表问题</span><p>${issue.questions.map(escapeHtml).join("<br>")}</p></div><div><span>拒绝原因</span><p>${issue.reasons.map(escapeHtml).join("<br>")}</p></div><div><span>缺失成员</span><code>${escapeHtml(issue.missingMembers.join("、") || "-")}</code></div><div><span>涉及实体</span><code>${escapeHtml(issue.affectedEntities.join("、") || "-")}</code></div><div><span>候选 YAML</span><code>${escapeHtml(issue.yamlCandidates.join("\n") || "-")}</code></div><div><span>已有建议</span><p>${issue.suggestedActions.map(escapeHtml).join("<br>") || "-"}</p></div></div>`;
  elements.evolutionCollaboration.classList.remove("hidden");
  elements.evolutionReviewerContext.value = "";
  elements.analyzeEvolution.disabled = false;
  elements.evolutionProposal.classList.add("hidden");
  elements.evolutionProposal.innerHTML = "";
}

function openEvolutionYaml() {
  const issue = evolutionIssues.find(
    (item) => item.id === selectedEvolutionIssueId,
  );
  const candidate = issue?.yamlCandidates?.find((file) =>
    semanticSourceFiles.some((source) => source.path === file),
  );
  if (!candidate) return;
  const source = semanticSourceFiles.find((item) => item.path === candidate);
  showPage("semantic");
  showSemanticView("source");
  loadSemanticSource(source.id);
}

function replayEvolutionQuestion() {
  const issue = evolutionIssues.find(
    (item) => item.id === selectedEvolutionIssueId,
  );
  if (!issue?.questions?.[0]) return;
  elements.question.value = issue.questions[0];
  showPage("query");
  elements.question.focus();
}

async function analyzeSelectedEvolution() {
  if (!selectedEvolutionIssueId) return;
  elements.analyzeEvolution.disabled = true;
  elements.analyzeEvolution.textContent = "LLM 分析中…";
  elements.evolutionStatus.textContent = "Analyzing";
  try {
    const response = await api("/api/semantic-evolution/analyze", {
      method: "POST",
      body: JSON.stringify({
        issueId: selectedEvolutionIssueId,
        reviewerContext: elements.evolutionReviewerContext.value.trim(),
      }),
    });
    renderEvolutionProposal(response.proposal);
    elements.evolutionStatus.textContent = "Review required";
  } catch (error) {
    elements.evolutionProposal.className = "error";
    elements.evolutionProposal.textContent = error.message;
  } finally {
    elements.analyzeEvolution.disabled = false;
    elements.analyzeEvolution.textContent = "重新分析";
  }
}

function renderEvolutionProposal(proposal) {
  const list = (title, values) =>
    values?.length
      ? `<section><strong>${title}</strong><ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></section>`
      : "";
  const drafts = (proposal.yamlDrafts || [])
    .map(
      (draft) =>
        `<details><summary>${escapeHtml(draft.path)}</summary><pre class="code">${escapeHtml(draft.content)}</pre></details>`,
    )
    .join("");
  elements.evolutionProposal.className = "evolution-proposal";
  elements.evolutionProposal.innerHTML = `<div class="evolution-warning">LLM 维护建议，仅供人工审核，不会自动修改或发布语义模型。</div><h3>${escapeHtml(proposal.summary || "语义维护建议")}</h3><div class="log-detail-grid"><div><span>建议类型</span><code>${escapeHtml(proposal.proposalType || "-")}</code></div><div><span>分析粒度</span><code>${escapeHtml(proposal.grain || "-")}</code></div></div><section><strong>业务定义</strong><p>${escapeHtml(proposal.businessDefinition || "-")}</p></section>${list("建议新增成员", proposal.membersToAdd)}${list("建议新增关系", proposal.relationshipsToAdd)}${list("需要业务确认", proposal.reviewQuestions)}${list("风险", proposal.risks)}${list("校验计划", proposal.validationPlan)}${list("回放问题", proposal.replayQuestions)}${drafts ? `<section><strong>Draft YAML</strong>${drafts}</section>` : ""}`;
}

function evolutionCategoryLabel(value) {
  return (
    {
      "semantic-gap": "缺少语义成员",
      "grain-mismatch": "粒度冲突",
      "relationship-gap": "缺少关系",
      policy: "Policy",
      ambiguous: "业务歧义",
      "unsupported-domain": "未建模业务域",
      unclassified: "未分类",
    }[value] || value
  );
}

async function loadQueryLogs() {
  elements.refreshLogs.disabled = true;
  const parameters = new URLSearchParams({ limit: elements.logLimit.value });
  if (elements.logStatusFilter.value)
    parameters.set("status", elements.logStatusFilter.value);
  if (elements.logOriginFilter.value)
    parameters.set("sqlOrigin", elements.logOriginFilter.value);
  if (elements.logSearch.value.trim())
    parameters.set("search", elements.logSearch.value.trim());
  try {
    const response = await api(`/api/query-observability?${parameters}`);
    const stats = response.stats;
    elements.logStats.innerHTML = [
      [stats.total, "日志"],
      [stats.executed, "执行"],
      [stats.errors + stats.rejected, "异常/拒绝"],
      [stats.llmTimeouts, "LLM 超时"],
      [stats.freeSqlAllowed, "自由 SQL"],
      [stats.freeSqlDenied, "策略拒绝"],
    ]
      .map(
        ([value, label]) =>
          `<div><strong>${value}</strong><span>${label}</span></div>`,
      )
      .join("");
    elements.logMeta.textContent = `${response.matched} 条匹配 · 最近窗口 ${response.windowSize} 条`;
    elements.logList.innerHTML = response.observations.length
      ? response.observations.map(renderLogRecord).join("")
      : '<div class="empty">没有匹配的查询日志。</div>';
  } catch (error) {
    elements.logList.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  } finally {
    elements.refreshLogs.disabled = false;
  }
}

function renderRejectionMaintenance(rejection) {
  if (!rejection) return "";
  const categoryLabels = {
    "semantic-gap": "缺少语义成员",
    "grain-mismatch": "分析粒度不一致",
    "relationship-gap": "缺少实体关系",
    policy: "治理策略拒绝",
    ambiguous: "业务含义不明确",
    "unsupported-domain": "未建模业务域",
    unclassified: "尚未分类",
  };
  const rows = [
    ["分类", categoryLabels[rejection.category] || rejection.category],
    ["涉及实体", (rejection.affectedEntities || []).join("、")],
    ["缺失成员", (rejection.missingMembers || []).join("、")],
    ["建议检查 YAML", (rejection.yamlCandidates || []).join("、")],
    ["建议动作", (rejection.suggestedActions || []).join("；")],
  ].filter(([, value]) => value);
  return rows.length
    ? `<div class="maintenance-hints">${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><code>${escapeHtml(value)}</code></div>`).join("")}</div>`
    : "";
}

function renderLogRecord(item) {
  const originLabels = {
    "cube-generated": "Cube 生成",
    "certified-sql": "认证 SQL",
    "free-sql": "自由 SQL",
  };
  const policy = item.policy?.usedAllowFreeSql
    ? `<span class="log-policy ${item.policy.decision}">allow_free_sql · ${escapeHtml(item.policy.decision)}</span>`
    : "";
  const fallback = item.fallback?.reason
    ? `<span class="log-fallback ${isTimeoutFallback(item.fallback.reason) ? "timeout" : ""}">${escapeHtml(fallbackLabel(item.fallback.reason))}</span>`
    : "";
  const rejection = item.rejection?.reason || item.rejection?.message;
  const rejectionBadge = rejection
    ? '<span class="log-fallback rejected">不支持</span>'
    : "";
  const confidence = Number.isFinite(Number(item.confidence))
    ? `${Math.round(Number(item.confidence) * 100)}%`
    : null;
  const details = [
    item.operation,
    item.queryId,
    item.planner,
    confidence ? `可信度 ${confidence}` : null,
    item.result?.rowCount !== undefined ? `${item.result.rowCount} rows` : null,
    item.timings?.totalRequestMs !== undefined
      ? `${item.timings.totalRequestMs} ms`
      : item.timings?.totalMs !== undefined
        ? `${item.timings.totalMs} ms`
        : null,
  ].filter(Boolean);
  return `<details class="log-record ${escapeHtml(item.status)}"><summary><span class="log-status-dot"></span><div class="log-question"><strong>${escapeHtml(item.question || "无自然语言问题")}</strong><small>${escapeHtml(details.join(" · "))}</small></div><span class="log-origin">${escapeHtml(originLabels[item.sqlOrigin] || item.route || "未分类")}</span>${fallback}${rejectionBadge}${policy}<time>${escapeHtml(formatLogTime(item.timestamp))}</time></summary><div class="log-detail"><div class="log-detail-grid"><div><span>Request ID</span><code>${escapeHtml(item.requestId)}</code></div><div><span>查询理解</span><code>${escapeHtml(item.queryUnderstanding?.method || item.strategy || "-")}</code></div><div><span>状态</span><code>${escapeHtml(item.status)}</code></div><div><span>可信度</span><code>${escapeHtml(confidence || "-")}</code></div><div><span>SQL 来源</span><code>${escapeHtml(item.sqlOrigin || "-")}</code></div></div>${rejection ? `<section class="rejection-detail"><strong>不支持原因</strong><div class="fallback-message rejection-message"><b>查询无法映射到可信计划</b><span>来源：${escapeHtml(item.rejection?.source || item.planner || "planner")}</span><p>${escapeHtml(rejection)}</p>${renderRejectionMaintenance(item.rejection)}</div></section>` : ""}${item.fallback?.reason ? `<section class="fallback-detail"><strong>降级原因</strong><div class="fallback-message"><b>${escapeHtml(fallbackLabel(item.fallback.reason))}</b><span>来源：${escapeHtml(item.fallback.from || "未知")}</span><code>${escapeHtml(item.fallback.reason)}</code></div></section>` : ""}${item.cubeQuery ? `<section><strong>Cube Query</strong><pre class="code">${escapeHtml(JSON.stringify(item.cubeQuery, null, 2))}</pre></section>` : ""}${item.sql ? `<section><strong>SQL</strong><pre class="code">${escapeHtml(item.sql)}</pre></section>` : ""}${item.error ? `<p class="error">${escapeHtml(item.error)}</p>` : ""}<div class="log-record-actions">${item.question ? `<button class="tiny" data-reuse-question="${escapeHtml(item.question)}">再次提问</button>` : ""}${rejection && item.question ? `<button class="tiny primary" data-improve-question="${escapeHtml(item.question)}">Improve</button>` : ""}</div></div></details>`;
}

function isTimeoutFallback(reason) {
  return /timeout|timed out|aborted due to timeout/i.test(String(reason || ""));
}

function fallbackLabel(reason) {
  const message = String(reason || "");
  if (isTimeoutFallback(message)) return "LLM 调用超时";
  if (/valid json|json/i.test(message)) return "LLM 返回格式无效";
  if (/fetch failed|network|connect|socket/i.test(message))
    return "LLM 网络连接失败";
  if (/unknown.*member|unknown member/i.test(message))
    return "LLM 返回未知语义成员";
  return "LLM 规划失败并已降级";
}

function formatLogTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value || "")
    : date.toLocaleString("zh-CN", { hour12: false });
}

async function loadHealth() {
  try {
    const health = await api("/api/health");
    elements.health.textContent = health.ok
      ? `${health.semanticGateway === "embedded" ? "Embedded Cube Compiler" : "Cube"} 与 Databend 已连接${health.aiEnabled ? ` · AI ${health.aiModel}` : ""}`
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
  if (!elements.examples.dataset.bound) {
    elements.examples.dataset.bound = "true";
    elements.examples.addEventListener("click", (event) => {
      const button = event.target.closest("[data-question]");
      if (button) elements.question.value = button.dataset.question;
    });
  }
}

async function loadSemanticModel() {
  semanticModel = await api("/api/semantic-model");
  elements.semanticDescription.textContent = `${semanticModel.metadata.description} · Owner: ${semanticModel.metadata.owner}`;
  const stats = [
    [semanticModel.stats.entities, "实体"],
    [semanticModel.stats.publicMembers, "公开成员"],
    [semanticModel.stats.measures, "指标"],
    [semanticModel.stats.relationships, "关系"],
    [semanticModel.stats.verifiedQueries, "认证查询"],
  ];
  elements.semanticStats.innerHTML = stats
    .map(
      ([value, label]) =>
        `<div><strong>${value}</strong><span>${label}</span></div>`,
    )
    .join("");
  renderKindFilters();
  renderEntities();
  renderRelationships();
  renderMembers();
  renderVerifiedQueries();
}

const kindLabels = {
  all: "全部",
  measure: "指标",
  dimension: "维度",
  time_dimension: "时间",
  segment: "分组",
  fact: "事实字段",
};

function renderKindFilters() {
  elements.kindFilters.innerHTML = Object.entries(kindLabels)
    .map(
      ([kind, label]) =>
        `<button class="kind-filter${kind === selectedKind ? " active" : ""}" data-kind="${kind}">${label}</button>`,
    )
    .join("");
}

function renderEntities() {
  const entities = [
    {
      name: "all",
      title: "全部实体",
      members: semanticModel.entities.flatMap((entity) => entity.members),
    },
    ...semanticModel.entities,
  ];
  elements.entityList.innerHTML = entities
    .map((entity) => {
      const measures = entity.members.filter(
        (member) => member.kind === "measure",
      ).length;
      return `<button class="entity-item${entity.name === selectedEntity ? " active" : ""}" data-entity="${entity.name}"><span><strong>${escapeHtml(entity.title)}</strong><small>${escapeHtml(entity.name === "all" ? "完整语义模型" : entity.name)}</small></span><span class="entity-count">${entity.members.length}<small>${measures} 指标</small></span></button>`;
    })
    .join("");
}

function renderRelationships() {
  elements.relationshipCount.textContent = `${semanticModel.relationships.length} 条关系`;
  elements.relationshipGraph.innerHTML = semanticModel.relationships
    .map((relationship) => {
      const columns = relationship.columns
        .map((column) => `${column.from} = ${column.to}`)
        .join(" · ");
      return `<div class="relationship"><button data-open-entity="${relationship.from}">${escapeHtml(relationship.from)}</button><span class="relationship-line"><small>${formatCardinality(relationship.cardinality)}</small><i></i></span><button data-open-entity="${relationship.to}">${escapeHtml(relationship.to)}</button><code>${escapeHtml(columns || relationship.sql || "自定义关系")}</code></div>`;
    })
    .join("");
  elements.relationshipGraph.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-entity]");
    if (!button) return;
    selectedEntity = button.dataset.openEntity;
    renderEntities();
    renderMembers();
  });
}

function renderMembers() {
  if (!semanticModel) return;
  const entity =
    selectedEntity === "all"
      ? null
      : semanticModel.entities.find((item) => item.name === selectedEntity);
  const search = elements.semanticSearch.value.trim().toLowerCase();
  const members = (
    entity
      ? entity.members
      : semanticModel.entities.flatMap((item) => item.members)
  )
    .filter((member) => selectedKind === "all" || member.kind === selectedKind)
    .filter(
      (member) =>
        !search ||
        [member.id, member.title, member.description, ...member.synonyms]
          .join(" ")
          .toLowerCase()
          .includes(search),
    );
  elements.entityHeading.textContent = entity
    ? `${entity.title} · ${entity.name}`
    : "全部语义成员";
  elements.memberCount.textContent = `${members.length} 个成员`;
  elements.memberGrid.innerHTML = members.length
    ? members.map(renderMemberCard).join("")
    : '<div class="empty">没有找到匹配的语义成员。</div>';
}

function renderMemberCard(member) {
  const badges = [
    kindLabels[member.kind],
    member.type,
    member.primaryKey ? "主键" : null,
    member.public ? "公开" : "私有",
  ].filter(Boolean);
  const enumValues = member.enum.length
    ? `<div class="member-detail"><span>可选值</span><div>${member.enum.map((value) => `<code>${escapeHtml(value)}</code>`).join(" ")}</div></div>`
    : "";
  const synonyms = member.synonyms.length
    ? `<div class="member-detail"><span>业务说法</span><p>${member.synonyms.map(escapeHtml).join(" · ")}</p></div>`
    : "";
  const usage = member.usedBy.length
    ? `<div class="member-detail"><span>认证查询</span><p>${member.usedBy.map((query) => escapeHtml(`${query.id} ${query.title}`)).join(" · ")}</p></div>`
    : "";
  return `<article class="member-card ${member.public ? "" : "private"}"><div class="member-card-head"><div><h3>${escapeHtml(member.title)}</h3><code>${escapeHtml(member.id)}</code></div><div class="member-badges">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div></div><p>${escapeHtml(member.description || "暂无业务说明")}</p><div class="member-detail"><span>Databend 表达式</span><code>${escapeHtml(member.expression)}</code></div>${enumValues}${synonyms}${usage}</article>`;
}

function renderVerifiedQueries() {
  elements.verifiedQueryList.innerHTML = semanticModel.verifiedQueries
    .map(
      (query) =>
        `<article><div><span>${escapeHtml(query.id)}</span><strong>${escapeHtml(query.title)}</strong><p>${escapeHtml(query.question)}</p></div><button class="tiny" data-ask-question="${escapeHtml(query.question)}">去查询</button></article>`,
    )
    .join("");
  elements.verifiedQueryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ask-question]");
    if (!button) return;
    elements.question.value = button.dataset.askQuestion;
    showPage("query");
    elements.question.focus();
  });
}

function formatCardinality(value) {
  return (
    { many_to_one: "多对一", one_to_many: "一对多", one_to_one: "一对一" }[
      value
    ] || value
  );
}

function startQuery(execute) {
  resetQueryOutput();
  clearError();
  return plan(execute);
}

async function plan(execute) {
  setBusy(true);
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

function resetQueryOutput() {
  currentPlan = undefined;
  elements.route.textContent = "处理中";
  elements.interpretation.className = "empty";
  elements.interpretation.textContent = "正在理解问题并生成查询计划…";
  elements.cubeQuery.textContent = "正在生成…";
  elements.sql.textContent = "正在生成…";
  elements.validation.textContent = "未验证";
  elements.validation.style.color = "";
  elements.explain.disabled = true;
  elements.executeSql.disabled = true;
  elements.explainResult.textContent = "";
  elements.explainResult.classList.add("hidden");
  elements.summary.textContent = "";
  elements.summaryCard.classList.add("hidden");
  elements.metrics.textContent = "等待执行";
  elements.result.className = "empty";
  elements.result.textContent = "执行查询后显示结果。";
}

function renderPlan(plan) {
  if (!plan.supported) {
    elements.route.textContent = "不支持";
    elements.interpretation.className = "empty";
    elements.interpretation.textContent = plan.message;
    elements.cubeQuery.textContent = "未生成：当前问题没有可信的 Cube Query。";
    elements.sql.textContent = "未生成：查询计划被拒绝。";
    elements.validation.textContent = "未验证";
    elements.validation.style.color = "";
    return;
  }
  elements.interpretation.className = "";
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
        ? `${plan.semanticGateway === "embedded" ? "Embedded Cube Compiler" : "Cube Semantic Query"} → Databend`
        : "Certified SQL → Databend",
    ],
    ["查询参数", formatQueryParameters(plan)],
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
          sqlOrigin: currentPlan.sqlOrigin,
          cubeQuery: currentPlan.cubeQuery,
          confidence: currentPlan.confidence,
          queryParameters: currentPlan.queryParameters,
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
  elements.result.className = "";
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
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let body;
  if (contentType.includes("application/json")) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`API 返回了无效 JSON（HTTP ${response.status}）`);
    }
  } else {
    if (!response.ok) {
      const routeMissing =
        response.status === 404 && /Cannot (GET|POST|PUT|DELETE)/.test(text);
      throw new Error(
        routeMissing
          ? `API 路由尚未加载，请重启 4100 服务：${url}`
          : `API 返回非 JSON 响应（HTTP ${response.status}）：${text.slice(0, 160)}`,
      );
    }
    throw new Error(`API 返回了非 JSON 响应：${url}`);
  }
  if (!response.ok)
    throw new Error(
      body.error ||
        body.message ||
        body.errors?.join("; ") ||
        `HTTP ${response.status}`,
    );
  return body;
}

function formatQueryParameters(plan) {
  const parameters = plan.queryParameters || plan.parameters || {};
  return Object.keys(parameters).length ? JSON.stringify(parameters) : "无";
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
    catalogMs: "目录",
    generationMs: "规则生成",
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
