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

boot();

async function boot() {
  await Promise.all([
    loadHealth(),
    loadExamples(),
    loadSemanticModel(),
    loadSemanticSourceFiles(),
    loadModelerDatabases(),
  ]);
  elements.plan.addEventListener("click", () => plan(false));
  elements.run.addEventListener("click", () => plan(true));
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
  elements.semanticSourceView.classList.toggle("active", view === "source");
  elements.semanticGeneratorView.classList.toggle(
    "active",
    view === "generate",
  );
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
  elements.examples.addEventListener("click", (event) => {
    const button = event.target.closest("[data-question]");
    if (button) elements.question.value = button.dataset.question;
  });
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
