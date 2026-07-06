const STORAGE_KEY = "xhs-ledger-v2";
const UI_STORAGE_KEY = "xhs-ledger-ui-v1";
const API_BASE = "";

let state = { clients: [], notes: [], calendars: [], calendarTasks: [], taskActions: {}, taskOverrides: {}, customTasks: [], dayPlans: [], weekPlans: [], brandRefs: [], toolRefs: [], reportTemplates: {}, progressOverrides: {}, plannedOverrides: {}, dashboardMetricOverrides: {}, mailTemplate: "" };
let backendOnline = false;
let backendMode = "local";
let selectedClientId = "";
let selectedNoteId = "";
let selectedTag = "all";
let selectedCalendarDate = "";
let selectedDayCalendarDate = "";
let selectedDayPlanDate = "";
let selectedWeekPlanWeek = "";
let draggingDayPlanId = "";
let draggingWeekPlanId = "";
let previousView = "dashboard";
let draggingTaskId = "";
let editingDetailNoteId = "";
let lastClientImport = null;
let progressEditMode = false;
let editingTaskId = "";
let uiState = { sidebarCollapsed: false, navGroups: { content: true, client: true, report: true } };

const $ = (id) => document.getElementById(id);
const today = startOfDay(new Date());
selectedCalendarDate = dateValue(today);
selectedDayCalendarDate = dateValue(today);
selectedDayPlanDate = dateValue(today);
selectedWeekPlanWeek = weekKey(today);

function emptyState() {
  return { clients: [], notes: [], calendars: [], calendarTasks: [], taskActions: {}, taskOverrides: {}, customTasks: [], dayPlans: [], weekPlans: [], brandRefs: [], toolRefs: [], reportTemplates: {}, progressOverrides: {}, plannedOverrides: {}, dashboardMetricOverrides: {}, mailTemplate: defaultMailTemplate() };
}

function bootstrapState() {
  return window.__LEDGER_BOOTSTRAP__ && typeof window.__LEDGER_BOOTSTRAP__ === "object"
    ? normalizeState(window.__LEDGER_BOOTSTRAP__)
    : emptyState();
}

function loadUiState() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || "{}");
    uiState = {
      sidebarCollapsed: Boolean(saved.sidebarCollapsed),
      navGroups: {
        content: saved.navGroups?.content !== false,
        client: saved.navGroups?.client !== false,
        report: saved.navGroups?.report !== false,
      },
    };
  } catch {
    uiState = { sidebarCollapsed: false, navGroups: { content: true, client: true, report: true } };
  }
}

function saveUiState() {
  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(uiState));
}

function applyUiState() {
  document.body.classList.toggle("sidebar-collapsed", uiState.sidebarCollapsed);
  document.querySelectorAll("[data-nav-group]").forEach((group) => {
    const key = group.dataset.navGroup;
    group.classList.toggle("collapsed", uiState.navGroups[key] === false);
  });
  const edge = $("sidebarEdgeToggle");
  if (edge) edge.textContent = uiState.sidebarCollapsed ? "›" : "‹";
}

function toggleSidebar() {
  uiState.sidebarCollapsed = !uiState.sidebarCollapsed;
  saveUiState();
  applyUiState();
}

function preferNonEmptyData(primary, fallback) {
  const normalizedPrimary = normalizeState(primary || {});
  const normalizedFallback = normalizeState(fallback || {});
  if (!normalizedPrimary.clients.length && normalizedFallback.clients.length) {
    return {
      ...normalizedFallback,
      dayPlans: normalizedPrimary.dayPlans.length ? normalizedPrimary.dayPlans : normalizedFallback.dayPlans,
      weekPlans: normalizedPrimary.weekPlans.length ? normalizedPrimary.weekPlans : normalizedFallback.weekPlans,
      brandRefs: normalizedPrimary.brandRefs.length ? normalizedPrimary.brandRefs : normalizedFallback.brandRefs,
      toolRefs: normalizedPrimary.toolRefs.length ? normalizedPrimary.toolRefs : normalizedFallback.toolRefs,
      calendarTasks: normalizedPrimary.calendarTasks.length ? normalizedPrimary.calendarTasks : normalizedFallback.calendarTasks,
      taskActions: Object.keys(normalizedPrimary.taskActions).length ? normalizedPrimary.taskActions : normalizedFallback.taskActions,
      taskOverrides: Object.keys(normalizedPrimary.taskOverrides).length ? normalizedPrimary.taskOverrides : normalizedFallback.taskOverrides,
      reportTemplates: Object.keys(normalizedPrimary.reportTemplates).length ? normalizedPrimary.reportTemplates : normalizedFallback.reportTemplates,
      progressOverrides: Object.keys(normalizedPrimary.progressOverrides).length ? normalizedPrimary.progressOverrides : normalizedFallback.progressOverrides,
      plannedOverrides: Object.keys(normalizedPrimary.plannedOverrides).length ? normalizedPrimary.plannedOverrides : normalizedFallback.plannedOverrides,
      dashboardMetricOverrides: Object.keys(normalizedPrimary.dashboardMetricOverrides).length ? normalizedPrimary.dashboardMetricOverrides : normalizedFallback.dashboardMetricOverrides,
      mailTemplate: normalizedPrimary.mailTemplate || normalizedFallback.mailTemplate,
    };
  }
  return normalizedPrimary;
}

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return emptyState();
  try {
    const parsed = JSON.parse(saved);
    return {
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      calendars: Array.isArray(parsed.calendars) ? parsed.calendars : [],
      calendarTasks: Array.isArray(parsed.calendarTasks) ? parsed.calendarTasks : [],
      taskActions: parsed.taskActions && typeof parsed.taskActions === "object" ? parsed.taskActions : {},
      taskOverrides: parsed.taskOverrides && typeof parsed.taskOverrides === "object" ? parsed.taskOverrides : {},
      customTasks: Array.isArray(parsed.customTasks) ? parsed.customTasks : [],
      dayPlans: Array.isArray(parsed.dayPlans) ? parsed.dayPlans : [],
      weekPlans: Array.isArray(parsed.weekPlans) ? parsed.weekPlans : [],
      brandRefs: Array.isArray(parsed.brandRefs) ? parsed.brandRefs.map(normalizeBrand) : [],
      toolRefs: Array.isArray(parsed.toolRefs) ? parsed.toolRefs.map(normalizeTool) : [],
      reportTemplates: parsed.reportTemplates && typeof parsed.reportTemplates === "object" ? parsed.reportTemplates : {},
      progressOverrides: parsed.progressOverrides && typeof parsed.progressOverrides === "object" ? parsed.progressOverrides : {},
      plannedOverrides: parsed.plannedOverrides && typeof parsed.plannedOverrides === "object" ? parsed.plannedOverrides : {},
      dashboardMetricOverrides: parsed.dashboardMetricOverrides && typeof parsed.dashboardMetricOverrides === "object" ? parsed.dashboardMetricOverrides : {},
      mailTemplate: parsed.mailTemplate || defaultMailTemplate(),
    };
  } catch {
    return emptyState();
  }
}

async function loadState() {
  try {
    const response = await fetch(`${API_BASE}/api/ledger`);
    if (!response.ok) throw new Error("api unavailable");
    const data = await response.json();
    const local = loadLocalState();
    if (!Object.prototype.hasOwnProperty.call(data, "weekPlans")) data.weekPlans = local.weekPlans;
    if (!Object.prototype.hasOwnProperty.call(data, "brandRefs")) data.brandRefs = local.brandRefs;
    if (!Object.prototype.hasOwnProperty.call(data, "toolRefs")) data.toolRefs = local.toolRefs;
    if (!Object.prototype.hasOwnProperty.call(data, "progressOverrides")) data.progressOverrides = local.progressOverrides;
    if (!Object.prototype.hasOwnProperty.call(data, "mailTemplate")) data.mailTemplate = local.mailTemplate;
    backendOnline = true;
    await loadBackendMode();
    return preferNonEmptyData(data, window.__LEDGER_BOOTSTRAP__);
  } catch {
    backendOnline = false;
    backendMode = "local";
    try {
      const staticResponse = await fetch("./data/ledger.json", { cache: "no-store" });
      if (staticResponse.ok) {
        const staticData = await staticResponse.json();
        const local = loadLocalState();
        if (!Object.prototype.hasOwnProperty.call(staticData, "weekPlans")) staticData.weekPlans = local.weekPlans;
        if (!Object.prototype.hasOwnProperty.call(staticData, "brandRefs")) staticData.brandRefs = local.brandRefs;
        if (!Object.prototype.hasOwnProperty.call(staticData, "toolRefs")) staticData.toolRefs = local.toolRefs;
        if (!Object.prototype.hasOwnProperty.call(staticData, "progressOverrides")) staticData.progressOverrides = local.progressOverrides;
        if (!Object.prototype.hasOwnProperty.call(staticData, "mailTemplate")) staticData.mailTemplate = local.mailTemplate;
        return preferNonEmptyData(staticData, window.__LEDGER_BOOTSTRAP__);
      }
    } catch {
      // Keep falling back to browser cache.
    }
    const local = loadLocalState();
    return preferNonEmptyData(local, window.__LEDGER_BOOTSTRAP__);
  }
}

async function loadBackendMode() {
  try {
    const response = await fetch(`${API_BASE}/api/health`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    backendMode = data?.mode === "cloud" ? "cloud" : "local";
  } catch {
    backendMode = "local";
  }
}

async function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
  if (!backendOnline) return;

  try {
    const response = await fetch(`${API_BASE}/api/ledger`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!response.ok) throw new Error("save failed");
    const saved = await response.json();
    if (!Object.prototype.hasOwnProperty.call(saved, "weekPlans") || !Object.prototype.hasOwnProperty.call(saved, "brandRefs")) {
      backendOnline = false;
      updateStorageStatus();
      showToast("后端需重启，新数据已先保存在浏览器");
    }
  } catch {
    backendOnline = false;
    updateStorageStatus();
    showToast("后端保存失败，已临时保存在浏览器");
  }
}

function normalizeState(data) {
  return {
    clients: Array.isArray(data?.clients) ? data.clients.map(normalizeClient) : [],
    notes: Array.isArray(data?.notes) ? data.notes.map(normalizeNote) : [],
    calendars: Array.isArray(data?.calendars) ? data.calendars : [],
    calendarTasks: Array.isArray(data?.calendarTasks) ? data.calendarTasks : [],
    taskActions: data?.taskActions && typeof data.taskActions === "object" ? data.taskActions : {},
    taskOverrides: data?.taskOverrides && typeof data.taskOverrides === "object" ? data.taskOverrides : {},
    customTasks: Array.isArray(data?.customTasks) ? data.customTasks : [],
    dayPlans: Array.isArray(data?.dayPlans) ? data.dayPlans : [],
    weekPlans: Array.isArray(data?.weekPlans) ? data.weekPlans.map(normalizeWeekPlan) : [],
    brandRefs: Array.isArray(data?.brandRefs) ? data.brandRefs.map(normalizeBrand) : [],
    toolRefs: Array.isArray(data?.toolRefs) ? data.toolRefs.map(normalizeTool) : [],
    reportTemplates: data?.reportTemplates && typeof data.reportTemplates === "object" ? data.reportTemplates : {},
    progressOverrides: data?.progressOverrides && typeof data.progressOverrides === "object" ? data.progressOverrides : {},
    plannedOverrides: data?.plannedOverrides && typeof data.plannedOverrides === "object" ? data.plannedOverrides : {},
    dashboardMetricOverrides: data?.dashboardMetricOverrides && typeof data.dashboardMetricOverrides === "object" ? data.dashboardMetricOverrides : {},
    mailTemplate: data?.mailTemplate || defaultMailTemplate(),
  };
}

function normalizeClient(client) {
  return {
    ...client,
    contractMonths: client.contractMonths || "",
    attention: client.attention || "",
    profileUrl: client.profileUrl || "",
    bio: client.bio || "",
  };
}

function normalizeNote(note) {
  const publishDate = note.publishDate || "";
  return {
    ...note,
    planMonth: note.planMonth || planMonthFromDate(publishDate),
    planKind: note.planKind || "monthly",
    tags: normalizeTags(note.tags?.length ? note.tags : inferTags(note)),
    image: note.image || "",
    imageOwner: note.imageOwner || "design",
    copywriting: note.copywriting || "",
    link: note.link || note.url || "",
  };
}

function normalizeBrand(brand) {
  return {
    ...brand,
    logo: "",
    logoUrl: "",
  };
}

function normalizeTool(tool) {
  return {
    id: tool.id || uid("tool"),
    title: tool.title || tool.name || "",
    url: tool.url || "",
    updatedAt: tool.updatedAt || "",
  };
}

function normalizeWeekPlan(plan) {
  return {
    ...plan,
    weekKey: plan.weekKey || weekKey(plan.createdAt ? new Date(plan.createdAt) : today),
    text: plan.text || "",
    done: Boolean(plan.done),
  };
}

function updateStorageStatus() {
  const el = $("storageStatus");
  if (!el) return;
  el.classList.toggle("online", backendOnline);
  el.classList.toggle("offline", !backendOnline);
  const clientCount = state?.clients?.length || 0;
  const storageName = backendMode === "cloud" ? "云端数据库" : "本地文件数据库";
  el.textContent = backendOnline
    ? `后端已连接：${storageName}｜已加载 ${clientCount} 位客户`
    : `兜底/本地模式｜已加载 ${clientCount} 位客户`;
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toDate(value) {
  if (!value) return null;
  return startOfDay(new Date(`${value}T00:00:00`));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateValue(date) {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultMailTemplate() {
  return `今日重点
最紧急的发布、提需、审核和周报。

今日必须完成
到期任务和逾期任务。

今日需催客户
待审核、待活动信息、待确认方案。

本周风险
月中 5 篇、本月 10 篇、复盘和下月规划。`;
}

function formatDate(value) {
  const date = typeof value === "string" ? toDate(value) : value;
  if (!date) return "未填写";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function weekStart(date) {
  const base = startOfDay(date || today);
  const day = base.getDay() || 7;
  return addDays(base, 1 - day);
}

function weekEnd(date) {
  return addDays(weekStart(date), 6);
}

function weekKey(date) {
  return dateValue(weekStart(date || today));
}

function weekLabel(key) {
  const start = toDate(key) || weekStart(today);
  const end = weekEnd(start);
  return `${String(start.getDate()).padStart(2, "0")}号-${String(end.getDate()).padStart(2, "0")}号`;
}

function diffDays(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
}

function isSameDay(a, b) {
  return diffDays(a, b) === 0;
}

function currentMonthRange() {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start, end };
}

function inCurrentMonth(dateValueText) {
  const date = toDate(dateValueText);
  if (!date) return false;
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

function currentPlanMonth() {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function planMonthFromDate(dateValueText) {
  const date = toDate(dateValueText);
  if (!date) return currentPlanMonth();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value) {
  if (!value) return "未分月";
  const [year, month] = value.split("-");
  return `${year}年${Number(month)}月`;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 2);
  }
  return String(tags || "")
    .split(/[,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function inferTags(note) {
  const text = `${note.title || ""}\n${note.angle || ""}`;
  const rules = [
    ["探店", "探店招募"],
    ["招募", "探店招募"],
    ["到店", "到店活动"],
    ["福利", "福利活动"],
    ["官宣", "官宣入驻"],
    ["入驻", "官宣入驻"],
    ["场景", "场景营销"],
    ["毕业", "场景营销"],
    ["宴", "宴请场景"],
    ["菜品", "菜品品宣"],
    ["项目", "项目品宣"],
    ["仪器", "项目品宣"],
    ["环境", "环境氛围"],
    ["空间", "环境氛围"],
    ["科普", "科普干货"],
    ["避坑", "科普干货"],
    ["旅游", "旅游攻略"],
    ["热点", "热点互动"],
    ["互动", "热点互动"],
    ["视频", "视频内容"],
  ];
  const found = [];
  for (const [keyword, tag] of rules) {
    if (text.includes(keyword) && !found.includes(tag)) found.push(tag);
    if (found.length >= 2) break;
  }
  return found.length ? found : ["内容规划"];
}

function allPlanMonths() {
  const months = new Set(state.notes.map((note) => note.planMonth || planMonthFromDate(note.publishDate)));
  months.add(currentPlanMonth());
  return [...months].filter(Boolean).sort().reverse();
}

function allTags() {
  const tags = new Set();
  state.notes.forEach((note) => normalizeTags(note.tags).forEach((tag) => tags.add(tag)));
  return [...tags].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function clientById(id) {
  return state.clients.find((client) => client.id === id);
}

function clientName(id) {
  return clientById(id)?.name || "未选择客户";
}

function notesForClient(clientId) {
  return state.notes.filter((note) => note.clientId === clientId);
}

function monthNotes(clientId) {
  return notesForClient(clientId).filter((note) => inCurrentMonth(note.publishDate) && note.planKind !== "backup");
}

function publishedThisMonth(clientId) {
  const key = currentPlanMonth();
  const override = state.progressOverrides?.[key]?.[clientId];
  if (override !== undefined && override !== "" && !Number.isNaN(Number(override))) return Number(override);
  return actualPublishedThisMonth(clientId);
}

function actualPublishedThisMonth(clientId) {
  return monthNotes(clientId).filter((note) => note.status === "published").length;
}

function plannedThisMonth(clientId) {
  const key = currentPlanMonth();
  const override = state.plannedOverrides?.[key]?.[clientId];
  if (override !== undefined && override !== "" && !Number.isNaN(Number(override))) return Number(override);
  return actualPlannedThisMonth(clientId);
}

function actualPlannedThisMonth(clientId) {
  return monthNotes(clientId).length;
}

function nonNegativeInteger(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

function requireNonNegativeInteger(value, message = "只能输入非负整数") {
  const parsed = nonNegativeInteger(value);
  if (parsed === null) {
    alert(message);
    return null;
  }
  return parsed;
}

function dashboardMetricValue(key, autoValue) {
  const month = currentPlanMonth();
  const override = state.dashboardMetricOverrides?.[month]?.[key];
  if (override !== undefined && override !== "" && !Number.isNaN(Number(override))) return Number(override);
  return autoValue;
}

function nextCycleDate(client) {
  const start = toDate(client.startDate);
  if (!start) return null;
  let candidate = new Date(today.getFullYear(), today.getMonth(), start.getDate());
  if (candidate < today) candidate = new Date(today.getFullYear(), today.getMonth() + 1, start.getDate());
  return startOfDay(candidate);
}

function taskId(task) {
  if (task.manualId) return task.manualId;
  return btoa(unescape(encodeURIComponent(`${task.title}|${task.detail}`))).replace(/=+$/g, "");
}

function bucketText(bucket) {
  const map = { ui: "紧急重要", un: "紧急不重要", ni: "不紧急重要", nn: "不紧急不重要" };
  return map[bucket] || "手动任务";
}

function splitTaskTitle(title) {
  const parts = String(title || "").split(/[：:]/);
  if (parts.length <= 1) return { client: "手动任务", action: title || "未命名事项" };
  return { client: parts.shift().trim(), action: parts.join("：").trim() };
}

function taskAction(task) {
  return state.taskActions[taskId(task)] || "active";
}

function applyTaskOverride(task) {
  const override = state.taskOverrides[taskId(task)];
  return override ? { ...task, ...override } : task;
}

function taskMatchesVisibility(task, visibility) {
  const action = taskAction(task);
  if (visibility === "all") return true;
  if (visibility === "read") return action === "read";
  if (visibility === "done") return action === "done";
  return action !== "read" && action !== "done";
}

function taskActionSelectHtml(task) {
  const id = taskId(task);
  const value = taskAction(task);
  return `
    <select class="status-select task-action-select" data-task-id="${id}">
      <option value="active" ${value === "active" ? "selected" : ""}>未读</option>
      <option value="read" ${value === "read" ? "selected" : ""}>已读</option>
      <option value="done" ${value === "done" ? "selected" : ""}>已完成</option>
    </select>
  `;
}

function buildTasks() {
  const tasks = [];
  const risks = [];
  const weekday = today.getDay();

  state.clients
    .filter((client) => client.status !== "paused")
    .forEach((client) => {
      const start = toDate(client.startDate);
      const cycle = nextCycleDate(client);

      if (weekday === 1 || weekday === 2) {
        tasks.push({
          level: "high",
          title: `${client.name}：写小红书运营周报`,
          detail: "企业微信内容需要包含“小红书运营周报”，周一/周二优先处理。",
          tags: ["周报", "企业微信"],
          date: dateValue(today),
        });
      }

      if (client.type === "new" && start) {
        const day = diffDays(today, start);
        if (day >= 0 && day <= 3) {
          const steps = [
            "收集客户基础信息、账号状态、活动和审核规则",
            "完成账号定位方向和内容人设判断",
            "完成首月 10 篇内容规划初稿",
            "和老板开会对接账号定位及首月规划",
          ];
          tasks.push({
            level: "high",
            title: `${client.name}：新客户第 ${day + 1} 天`,
            detail: steps[day],
            tags: ["新客户", "3天内"],
            date: client.startDate,
          });
        }
        if (day > 3 && plannedThisMonth(client.id) === 0) {
          risks.push({
            level: "medium",
            title: `${client.name}：首月规划还没有排期`,
            detail: "新客户接手 3 天内通常要输出账号定位和首月规划。",
            tags: ["规划"],
          });
        }
      }

      if (cycle) {
        const daysToCycle = diffDays(cycle, today);
        if (daysToCycle >= 0 && daysToCycle <= 3) {
          tasks.push({
            level: "medium",
            title: `${client.name}：准备复盘和下月规划`,
            detail: `${formatDate(cycle)}是客户周期节点，建议提前整理已发内容、数据表现和下月 10 篇方向。`,
            tags: ["复盘", "月度规划"],
            date: dateValue(cycle),
          });
        }
      }

      const target = Number(client.target || 10);
      const planned = plannedThisMonth(client.id);
      const published = publishedThisMonth(client.id);
      if (today.getDate() >= 12 && published < 5) {
        risks.push({
          level: "high",
          title: `${client.name}：月中前 5 篇压力`,
          detail: `本月已发 ${published} 篇，月中前尽量完成 5 篇。`,
          tags: ["月中进度"],
        });
      }
      if (planned < target) {
        risks.push({
          level: "medium",
          title: `${client.name}：本月排期不足`,
          detail: `已排 ${planned} 篇，目标 ${target} 篇。`,
          tags: ["排期"],
        });
      }
    });

  state.notes.filter((note) => note.planKind !== "backup").forEach((note) => {
    const client = clientById(note.clientId);
    if (!client || client.status === "paused") return;
    const publishDate = toDate(note.publishDate);
    if (!publishDate || note.status === "published") return;

    const daysToPublish = diffDays(publishDate, today);
    const designDate = addDays(publishDate, -2);
    const copyDate = addDays(publishDate, -1);

    if (note.needDesign === "yes" && isSameDay(today, designDate) && note.status !== "design") {
      tasks.push({
        level: "high",
        title: `${client.name}：给设计提需`,
        detail: `《${note.title}》计划 ${formatDate(publishDate)} 发布，今天要明确封面、图片张数、卖点和截止时间。`,
        tags: ["设计提需", note.type],
        date: note.publishDate,
      });
    }

    if (isSameDay(today, copyDate) && ["idea", "design", "copy"].includes(note.status)) {
      tasks.push({
        level: "high",
        title: `${client.name}：完成文案并送审`,
        detail: `《${note.title}》明天发布，今天要完成标题、正文、话题和审核版本。`,
        tags: ["文案", "审核"],
        date: note.publishDate,
      });
    }

    if (note.status === "review") {
      tasks.push({
        level: daysToPublish <= 0 ? "high" : "medium",
        title: `${client.name}：催客户审核`,
        detail:
          daysToPublish <= 0
            ? `《${note.title}》已到发布时间，可按规则先发，发布后同步客户可修改。`
            : `《${note.title}》距离发布还有 ${daysToPublish} 天，今天适合催确认。`,
        tags: ["客户审核", client.reviewMode === "optional" ? "到点可先发" : "需确认"],
        date: note.publishDate,
      });
    }

    if (daysToPublish === 0 && note.status !== "published") {
      tasks.push({
        level: "high",
        title: `${client.name}：发布笔记`,
        detail: `《${note.title}》今天发布。发布人：${publisherText(client.publisher)}。`,
        tags: ["发布", note.type],
        date: note.publishDate,
      });
    }

    if (daysToPublish < 0) {
      risks.push({
        level: "high",
        title: `${client.name}：笔记已逾期`,
        detail: `《${note.title}》原计划 ${formatDate(publishDate)} 发布，当前状态：${statusText(note.status)}。`,
        tags: ["逾期"],
        date: note.publishDate,
      });
    }
  });

  const manualTasks = state.customTasks.map((task) => ({
    level: task.bucket === "ui" ? "high" : task.bucket === "un" ? "medium" : "low",
    title: task.title,
    detail: task.detail || `${task.scope === "week" ? "周计划" : task.scope === "risk" ? "风险提醒" : "日计划"}｜手动添加`,
    tags: task.tags?.length ? task.tags : [bucketText(task.bucket), task.scope === "week" ? "周计划" : task.scope === "risk" ? "风险提醒" : "日计划"],
    manualId: task.id,
    bucket: task.bucket,
    scope: task.scope,
    date: task.createdAt?.slice(0, 10) || dateValue(today),
    order: task.order ?? 0,
  }));

  return {
    tasks: sortTasks([...tasks, ...manualTasks.filter((task) => task.scope !== "risk")].map(applyTaskOverride)),
    risks: sortTasks([...risks, ...manualTasks.filter((task) => task.scope === "risk")].map(applyTaskOverride)),
  };
}

function sortTasks(tasks) {
  const rank = { high: 1, medium: 2, low: 3 };
  return tasks.sort((a, b) => rank[a.level] - rank[b.level] || (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title, "zh-CN"));
}

function sortNotesForWork(a, b) {
  const statusRank = (note) => (note.status === "published" ? 2 : 1);
  return statusRank(a) - statusRank(b) || (a.publishDate || "").localeCompare(b.publishDate || "");
}

function statusText(value) {
  const map = {
    idea: "待选题",
    design: "待设计",
    copy: "待文案",
    production: "待制作",
    review: "待客户审核",
    scheduled: "待发布",
    published: "已发布",
  };
  return map[value] || value;
}

function publisherText(value) {
  const map = { me: "我发布", client: "客户发布", mixed: "双方都有" };
  return map[value] || "未设置";
}

function typeText(value) {
  return value === "new" ? "新客户" : "老客户";
}

function reviewText(value) {
  const map = { required: "需要审核", optional: "到点未审可先发", none: "无需审核" };
  return map[value] || "未设置";
}

function render() {
  updateStorageStatus();
  $("todayText").textContent = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  renderSelects();
  renderDashboard();
  renderDayPlans();
  renderClients();
  renderClientDetail();
  renderPlans();
  renderNotes();
  renderTypes();
  renderBrands();
  renderTools();
  renderReport();
  renderReportQueue();
  renderDayMonthBoard();
  renderSettings();
}

function renderDayPlans() {
  if (!$("dayPlanList")) return;
  const todayKey = dateValue(today);
  renderDayPlanDateSelect();
  const items = state.dayPlans.filter((item) => item.date === selectedDayPlanDate).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const todayItems = state.dayPlans.filter((item) => item.date === todayKey).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const html = items.length ? items.map(dayPlanHtml).join("") : emptyHtml("今天还没有手动日计划。");
  $("dayPlanList").innerHTML = html;
  $("todayPlanPreview").innerHTML = todayItems.length ? todayItems.map(dayPlanHtml).join("") : emptyHtml("今天还没有手动日计划。");
  if ($("weekPlanList")) {
    renderWeekPlanWeekSelect();
    const weekItems = state.weekPlans
      .filter((item) => (item.weekKey || weekKey(today)) === selectedWeekPlanWeek)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    $("weekPlanList").innerHTML = weekItems.length ? weekItems.map(weekPlanHtml).join("") : emptyHtml("暂无手动周计划。");
    renderDayWeekSummary(items, weekItems);
  }
}

function renderDayWeekSummary(dayItems = [], weekItems = []) {
  if (!$("dayWeekSummary")) return;
  const dayDone = dayItems.filter((item) => item.done).length;
  const weekDone = weekItems.filter((item) => item.done).length;
  $("dayWeekSummary").innerHTML = `
    <article>
      <span>${formatDate(selectedDayPlanDate)}</span>
      <strong>${dayDone}/${dayItems.length}</strong>
      <p>今日清单完成进度</p>
    </article>
    <article>
      <span>${weekLabel(selectedWeekPlanWeek)}</span>
      <strong>${weekDone}/${weekItems.length}</strong>
      <p>周计划完成进度</p>
    </article>
  `;
}

function dayPlanDates() {
  const dates = new Set(state.dayPlans.map((item) => item.date).filter(Boolean));
  dates.add(dateValue(today));
  dates.add(dateValue(addDays(today, 1)));
  if (selectedDayPlanDate) dates.add(selectedDayPlanDate);
  return [...dates].sort().reverse();
}

function renderDayPlanDateSelect() {
  const select = $("dayPlanDateSelect");
  if (!select) return;
  if (!selectedDayPlanDate) selectedDayPlanDate = dateValue(today);
  const options = dayPlanDates()
    .map((date) => `<option value="${date}" ${date === selectedDayPlanDate ? "selected" : ""}>${date === dateValue(today) ? "今天 " : date === dateValue(addDays(today, 1)) ? "明天 " : ""}${formatDate(date)}</option>`)
    .join("");
  select.innerHTML = options;
}

function weekPlanWeeks() {
  const weeks = new Set(state.weekPlans.map((item) => item.weekKey || weekKey(today)).filter(Boolean));
  weeks.add(weekKey(today));
  if (selectedWeekPlanWeek) weeks.add(selectedWeekPlanWeek);
  return [...weeks].sort().reverse();
}

function renderWeekPlanWeekSelect() {
  const select = $("weekPlanWeekSelect");
  if (!select) return;
  if (!selectedWeekPlanWeek) selectedWeekPlanWeek = weekKey(today);
  select.innerHTML = weekPlanWeeks()
    .map((key) => `<option value="${key}" ${key === selectedWeekPlanWeek ? "selected" : ""}>${key === weekKey(today) ? "本周 " : ""}${weekLabel(key)}</option>`)
    .join("");
}

function dayPlanHtml(item, index = 0) {
  return `
    <article class="day-plan-item ${item.done ? "done" : ""}" data-day-plan="${item.id}" draggable="true">
      <button class="check-square ${item.done ? "done" : ""}" data-day-plan-toggle="${item.id}" type="button" aria-label="完成"></button>
      <span class="day-plan-no">${index + 1}</span>
      <textarea data-day-plan-text="${item.id}" rows="1">${escapeHtml(item.text)}</textarea>
      <span class="drag-handle" title="拖拽排序">⋮⋮</span>
      <button class="ghost-btn mini-action" data-day-plan-edit="${item.id}" type="button">编辑</button>
      <button class="danger-btn" data-day-plan-delete="${item.id}" type="button">删除</button>
    </article>
  `;
}

function weekPlanHtml(item, index = 0) {
  return `
    <article class="day-plan-item week-item ${item.done ? "done" : ""}" data-week-plan="${item.id}" draggable="true">
      <button class="check-square ${item.done ? "done" : ""}" data-week-plan-toggle="${item.id}" type="button" aria-label="完成"></button>
      <span class="day-plan-no">${index + 1}</span>
      <textarea data-week-plan-text="${item.id}" rows="1">${escapeHtml(item.text)}</textarea>
      <span class="drag-handle" title="拖拽排序">⋮⋮</span>
      <button class="ghost-btn mini-action" data-week-plan-edit="${item.id}" type="button">编辑</button>
      <button class="danger-btn" data-week-plan-delete="${item.id}" type="button">删除</button>
    </article>
  `;
}

function renderDashboard() {
  const activeClients = state.clients.filter((client) => client.status !== "paused");
  const { start, end } = currentMonthRange();
  const monthPublished = state.notes.filter((note) => {
    const date = toDate(note.publishDate);
    return date && date >= start && date <= end && note.status === "published" && note.planKind !== "backup";
  }).length;
  const reviewCount = state.notes.filter((note) => note.status === "review" && note.planKind !== "backup").length;
  const weekEnd = addDays(today, 6);
  const weekCount = state.notes.filter((note) => {
    const date = toDate(note.publishDate);
    return date && date >= today && date <= weekEnd && note.status !== "published" && note.planKind !== "backup";
  }).length;

  $("metricClients").textContent = dashboardMetricValue("clients", activeClients.length);
  $("metricPublished").textContent = dashboardMetricValue("published", monthPublished);
  $("metricReview").textContent = dashboardMetricValue("review", reviewCount);
  $("metricWeek").textContent = dashboardMetricValue("week", weekCount);

  const { tasks, risks } = buildTasks();
  const visibility = $("taskVisibilityFilter").value || "active";
  const visibleTasks = tasks.filter((task) => taskMatchesVisibility(task, visibility));
  const visibleRisks = risks.filter((task) => taskMatchesVisibility(task, visibility));
  $("urgentCount").textContent = `${visibleTasks.length} 项`;
  $("riskCount").textContent = `${visibleRisks.length} 项`;
  $("urgentList").innerHTML = visibleTasks.length ? visibleTasks.map(taskHtml).join("") : emptyHtml("当前筛选下没有必须处理项。");
  $("riskList").innerHTML = visibleRisks.length ? visibleRisks.map(taskHtml).join("") : emptyHtml("当前筛选下没有风险提醒。");
  $("quadrantBoard").innerHTML = quadrantHtml(visibleTasks, visibleRisks);

  $("clientProgress").innerHTML = activeClients.length
    ? activeClients.map(progressHtml).join("")
    : emptyHtml("先在客户页新增客户。");
}

function quadrantHtml(tasks, risks) {
  const buckets = {
    ui: { key: "ui", title: "紧急重要", items: [] },
    un: { key: "un", title: "紧急不重要", items: [] },
    ni: { key: "ni", title: "不紧急重要", items: [] },
    nn: { key: "nn", title: "不紧急不重要", items: [] },
  };
  [...tasks, ...risks].forEach((task) => {
    const text = `${task.title}${task.detail}${task.tags.join("")}`;
    if (task.bucket && buckets[task.bucket]) buckets[task.bucket].items.push(task);
    else if (task.level === "high" && /发布|逾期|提需|文案|新客户/.test(text)) buckets.ui.items.push(task);
    else if (/催|审核|确认/.test(text)) buckets.un.items.push(task);
    else if (/复盘|规划|月中|排期|周报/.test(text)) buckets.ni.items.push(task);
    else buckets.nn.items.push(task);
  });
  const nav = `
    <div class="quadrant-jumpbar">
      ${Object.values(buckets).map((bucket) => `<button class="quadrant-jump" type="button" data-quadrant-jump="${bucket.key}">${bucket.title}</button>`).join("")}
    </div>
  `;
  const cards = Object.values(buckets)
    .map(
      (bucket) => `
        <section class="quadrant" data-quadrant="${bucket.key}">
          <div class="quadrant-head">
            <h4>${bucket.title} <span class="tag">${bucket.items.length} 项</span></h4>
            <button class="ghost-btn mini-action" type="button" data-quadrant-edit="${escapeHtml(bucket.title)}">新增</button>
          </div>
          ${bucket.items.length ? bucket.items.slice(0, 8).map((task, index) => taskHtml(task, index)).join("") : emptyHtml("暂无")}
        </section>
      `
    )
    .join("");
  return nav + cards;
}

function taskHtml(task, index = 0) {
  const titleParts = splitTaskTitle(task.title);
  return `
    <article class="task ${task.level}" draggable="true" data-task-card="${taskId(task)}" data-manual-id="${task.manualId || ""}" data-bucket="${task.bucket || ""}">
      <span class="task-no">${index + 1}</span>
      <div class="task-title">
        <div class="task-title-lines">
          <strong>${escapeHtml(titleParts.client)}</strong>
          <span>${escapeHtml(titleParts.action)}</span>
        </div>
        <div class="task-actions">
          <span class="tag ${task.level === "high" ? "red" : task.level === "medium" ? "yellow" : "blue"}">${levelText(task.level)}</span>
          ${taskActionSelectHtml(task)}
          <button class="ghost-btn mini-action" type="button" data-task-edit="${taskId(task)}">编辑</button>
          <button class="danger-btn mini-action" type="button" data-task-delete="${task.manualId || ""}" data-task-delete-id="${taskId(task)}">删除</button>
          <span class="drag-handle" title="拖拽排序">⋮⋮</span>
        </div>
      </div>
      <p>${escapeHtml(task.detail)}</p>
      <div class="tag-row">${task.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      ${task.date ? `<div class="task-date">${formatDate(task.date)}</div>` : ""}
    </article>
  `;
}

function levelText(level) {
  return level === "high" ? "紧急" : level === "medium" ? "注意" : "普通";
}

function progressHtml(client) {
  const target = Number(client.target || 10);
  const planned = plannedThisMonth(client.id);
  const published = publishedThisMonth(client.id);
  const actualPublished = actualPublishedThisMonth(client.id);
  const actualPlanned = actualPlannedThisMonth(client.id);
  const percent = Math.min(100, Math.round((published / target) * 100));
  return `
    <article class="progress-item">
      <div class="item-head">
        <strong>${escapeHtml(client.name)}</strong>
        <span class="tag ${published >= 5 ? "green" : "yellow"}">已发 ${published}/${target}</span>
      </div>
      ${progressEditMode ? `
        <div class="progress-edit-row">
          <label>手动已发
            <input type="number" min="0" max="99" data-progress-client="${client.id}" value="${published}" />
          </label>
          <label>本月已排
            <input type="number" min="0" max="99" data-planned-client="${client.id}" value="${planned}" />
          </label>
          <button class="ghost-btn mini-action" type="button" data-progress-reset="${client.id}">恢复自动 ${actualPublished}</button>
          <button class="ghost-btn mini-action" type="button" data-planned-reset="${client.id}">恢复已排 ${actualPlanned}</button>
        </div>
      ` : ""}
      <div class="bar green-bar"><span style="width:${percent}%"></span></div>
      <p>本月已排 ${planned} 篇。${monthSummary(client.id, currentPlanMonth())}</p>
    </article>
  `;
}

function monthSummary(clientId, month) {
  const rows = notesForClient(clientId)
    .filter((note) => note.planMonth === month && note.planKind !== "backup")
    .sort(sortNotesForWork);
  if (!rows.length) return "暂无当月规划。";
  return rows
    .slice(0, 3)
    .map((note) => `${formatDate(note.publishDate)}《${note.title}》`)
    .join("；");
}

function renderClients() {
  $("clientCount").textContent = `${state.clients.length} 位`;
  if ($("clientQuickCards")) {
    $("clientQuickCards").innerHTML = state.clients.length
      ? state.clients.map(clientQuickCardHtml).join("")
      : emptyHtml("暂无客户。");
  }
  $("clientList").innerHTML = state.clients.length
    ? state.clients.map(clientHtml).join("")
    : emptyHtml("还没有客户，先新增你手里的 4 个客户。");
}

function clientQuickCardHtml(client) {
  return `
    <button class="client-quick-card" type="button" data-client-jump="${client.id}">
      <strong>${escapeHtml(client.name)}</strong>
      <span>${publishedThisMonth(client.id)}/${client.target || 10} 已发</span>
    </button>
  `;
}

function clientHtml(client) {
  return `
    <article id="client-row-${client.id}" class="client-item" data-client-id="${client.id}">
      <div class="item-head">
        <strong class="client-name-main">${escapeHtml(client.name)}</strong>
        <div class="task-actions">
          <span class="tag ${client.type === "new" ? "blue" : "green"}">${typeText(client.type)}</span>
          <button class="ghost-btn mini-action" data-edit-client="${client.id}" type="button">编辑</button>
        </div>
      </div>
      <div class="tag-row">
        <span class="tag">${formatDate(client.startDate)}接手</span>
        <span class="tag">${client.contractMonths ? `签约${client.contractMonths}个月` : "签约时长未填"}</span>
        <span class="tag">${reviewText(client.reviewMode)}</span>
        <span class="tag">${publisherText(client.publisher)}</span>
      </div>
      <p><span class="client-field-title">发布偏好：</span>${client.publishDays ? escapeHtml(client.publishDays) : "未设置固定发布日。"}</p>
      ${client.profileUrl ? `<p><span class="client-field-title">主页链接：</span>${escapeHtml(client.profileUrl)}</p>` : ""}
      ${client.bio ? `<p><span class="client-field-title">账号简介：</span>${escapeHtml(client.bio)}</p>` : ""}
      ${client.attention ? `<p><span class="client-field-title">注意点：</span>${escapeHtml(client.attention)}</p>` : ""}
    </article>
  `;
}

function renderClientDetail(clientId = selectedClientId) {
  if (!$("clientDetailContent")) return;
  const client = clientById(clientId) || state.clients[0];
  if (!client) {
    $("clientDetailContent").innerHTML = emptyHtml("暂无客户资料。");
    return;
  }
  const month = $("planMonthFilter")?.value || currentPlanMonth();
  const notes = notesForClient(client.id)
    .filter((note) => (note.planMonth || planMonthFromDate(note.publishDate)) === month)
    .sort(sortNotesForWork);
  const publishedNotes = notes.filter((note) => note.status === "published");
  $("clientDetailContent").innerHTML = `
    <div class="detail-jump-cards">
      <button type="button" data-detail-jump="detailPlanSection">笔记规划</button>
      <button type="button" data-detail-jump="detailDesignSection">设计提需</button>
      <button type="button" data-detail-jump="detailPublishedSection">已发布笔记</button>
    </div>
    <div class="detail-grid">
      <article>
        <h3>${escapeHtml(client.name)}</h3>
        <div class="tag-row">
          <span class="tag">${typeText(client.type)}</span>
          <span class="tag">${formatDate(client.startDate)}接手</span>
          <span class="tag">${client.contractMonths ? `签约${client.contractMonths}个月` : "签约时长未填"}</span>
          <span class="tag">${publisherText(client.publisher)}</span>
          <span class="tag">${reviewText(client.reviewMode)}</span>
        </div>
      </article>
      <article><strong>主页链接</strong><p class="text-ellipsis" title="${escapeHtml(client.profileUrl || "")}">${client.profileUrl ? escapeHtml(client.profileUrl) : "未填写"}</p></article>
      <article><strong>账号简介</strong><p>${client.bio ? escapeHtml(client.bio) : "未填写"}</p></article>
      <article><strong>发布偏好</strong><p>${client.publishDays ? escapeHtml(client.publishDays) : "未填写"}</p></article>
      <article><strong>客户注意点</strong><p>${client.attention ? escapeHtml(client.attention) : "未填写"}</p></article>
      <article><strong>资料备注</strong><p>${client.notes ? escapeHtml(client.notes) : "未填写"}</p></article>
    </div>
    <section id="detailPlanSection" class="plan-section">
      <div class="section-head">
        <h4>${monthLabel(month)}笔记规划 <span class="tag">${notes.length} 篇</span></h4>
      </div>
      <div class="mini-note-list detail-note-list">${notes.length ? notes.map((note) => (editingDetailNoteId === note.id ? detailNoteEditHtml(note) : miniNoteHtml(note))).join("") : emptyHtml("暂无该月规划。")}</div>
    </section>
    ${clientDesignSectionHtml(client, month)}
    <section id="detailPublishedSection" class="plan-section">
      <div class="section-head">
        <h4>已发布笔记 <span class="tag">${publishedNotes.length} 篇</span></h4>
      </div>
      <div class="mini-note-list">${publishedNotes.length ? publishedNotes.map(miniNoteHtml).join("") : emptyHtml("暂无已发布笔记。")}</div>
    </section>
  `;
}

function clientDesignSectionHtml(client, month) {
  const rows = notesForClient(client.id)
    .filter((note) => (note.planMonth || planMonthFromDate(note.publishDate)) === month)
    .sort(sortNotesForWork);
  const pending = rows.filter((note) => note.status !== "published" && note.needDesign === "yes");
  const published = rows.filter((note) => note.status === "published");
  return `
    <section id="detailDesignSection" class="plan-section client-design-section">
      <div class="section-head">
        <h4>设计提需 <span class="tag">${pending.length} 条待处理</span></h4>
      </div>
      ${clientDesignProgressHtml(rows)}
      <div class="design-subsection">
        <h5>待处理设计提需</h5>
        <div class="mini-note-list">${pending.length ? pending.map(clientDesignNoteHtml).join("") : emptyHtml("当前没有待处理设计提需。")}</div>
      </div>
      <div class="design-subsection published-area">
        <h5>已发布笔记</h5>
        <div class="mini-note-list">${published.length ? published.map(clientDesignNoteHtml).join("") : emptyHtml("暂无已发布笔记。")}</div>
      </div>
    </section>
  `;
}

function clientDesignProgressHtml(notes) {
  const total = notes.length;
  const submitted = notes.filter((note) => note.needDesign === "yes" && note.status !== "idea").length;
  const published = notes.filter((note) => note.status === "published").length;
  const submittedPercent = total ? Math.round((submitted / total) * 100) : 0;
  const publishedPercent = total ? Math.round((published / total) * 100) : 0;
  return `
    <div class="client-design-progress">
      <article>
        <span>总发布笔记条数</span>
        <strong>${total}</strong>
        <div class="bar"><span style="width:${total ? 100 : 0}%"></span></div>
      </article>
      <article>
        <span>已提交设计提需</span>
        <strong>${submitted}</strong>
        <div class="bar"><span style="width:${submittedPercent}%"></span></div>
      </article>
      <article>
        <span>已完成发布</span>
        <strong>${published}</strong>
        <div class="bar"><span style="width:${publishedPercent}%"></span></div>
      </article>
    </div>
  `;
}

function clientDesignNoteHtml(note) {
  return `
    <article class="mini-note design-preview-note ${note.status === "published" ? "published" : ""}" data-note-id="${note.id}">
      ${note.status === "published" ? `<span class="design-published-check">✓</span>` : ""}
      <div class="item-head">
        <strong>${escapeHtml(note.title)}</strong>
        ${statusSelectHtml(note)}
      </div>
      <div class="plan-meta">
        <span class="plan-date-inline">${formatDate(note.publishDate)}</span>
        <span>${statusText(note.status)}</span>
        <span>${note.needDesign === "yes" ? "需设计" : "不需设计"}</span>
      </div>
      ${note.image ? `<img class="note-thumb" src="${escapeHtml(note.image)}" alt="参考图片" />` : ""}
      <p>${note.copywriting || note.angle ? escapeHtml(note.copywriting || note.angle) : "暂无文案/提需内容。"}</p>
    </article>
  `;
}

function detailNoteEditHtml(note) {
  const copyRows = Math.min(12, Math.max(4, String(note.copywriting || "").split("\n").length + 2));
  const angleRows = Math.min(12, Math.max(3, String(note.angle || "").split("\n").length + 2));
  return `
    <article class="mini-note detail-note-edit" data-note-id="${note.id}">
      <div class="item-head">
        <strong>${escapeHtml(note.title)}</strong>
        ${statusSelectHtml(note)}
      </div>
      <div class="plan-meta">
        <span>${escapeHtml(clientName(note.clientId))}</span>
        <span class="plan-date-inline">${formatDate(note.publishDate)}</span>
      </div>
      <label>
        笔记主题
        <input data-note-field="title" data-note-id="${note.id}" value="${escapeHtml(note.title)}" />
      </label>
      <label>
        内容概述
        <textarea data-note-field="angle" data-note-id="${note.id}" rows="${angleRows}">${escapeHtml(note.angle || "")}</textarea>
      </label>
      <label>
        历史/发布文案
        <textarea data-note-field="copywriting" data-note-id="${note.id}" rows="${copyRows}">${escapeHtml(note.copywriting || "")}</textarea>
      </label>
      ${note.image ? `<img class="note-thumb plan-image" src="${escapeHtml(note.image)}" alt="示例图片" />` : `<div class="image-preview empty">暂无示例图片</div>`}
      <div class="form-actions">
        <label class="ghost-btn file-btn mini-action">
          插入/替换图片
          <input data-detail-image-note="${note.id}" type="file" accept="image/*" />
        </label>
        <button class="ghost-btn mini-action" type="button" data-detail-note-done="${note.id}">完成</button>
        <button class="danger-btn mini-action" type="button" data-detail-image-delete="${note.id}">删除图片</button>
      </div>
    </article>
  `;
}

function planSectionHtml(title, notes, emptyText) {
  return `
    <section class="plan-section">
      <h4>${escapeHtml(title)} <span class="tag">${notes.length} 篇</span></h4>
      <div class="mini-note-list">
        ${
          notes.length
            ? notes.map(miniNoteHtml).join("")
            : `<div class="empty">${escapeHtml(emptyText)}</div>`
        }
      </div>
    </section>
  `;
}

function renderPlans() {
  if (!$("planBoard")) return;
  const clientFilter = $("planClientFilter").value || "all";
  const month = $("planMonthFilter").value || currentPlanMonth();
  const clients = state.clients.filter((client) => clientFilter === "all" || client.id === clientFilter);
  $("planBoard").innerHTML = clients.length
    ? clients.map((client) => planClientHtml(client, month)).join("")
    : emptyHtml("暂无客户。");
}

function planClientHtml(client, month) {
  const monthly = notesForClient(client.id)
    .filter((note) => (note.planMonth || planMonthFromDate(note.publishDate)) === month && note.planKind !== "backup")
    .sort(sortNotesForWork);
  const backups = notesForClient(client.id)
    .filter((note) => (note.planMonth || planMonthFromDate(note.publishDate)) === month && note.planKind === "backup")
    .sort(sortNotesForWork);
  return `
    <article class="plan-client">
      <div class="item-head">
        <strong>${escapeHtml(client.name)}</strong>
        <span class="tag">${monthLabel(month)}</span>
      </div>
      <section class="plan-section">
        <h4>月度规划 <span class="tag">${monthly.length} 篇</span></h4>
        <div class="plan-card-grid">${monthly.length ? monthly.map(planCardHtml).join("") : emptyHtml("暂无月度规划。")}</div>
      </section>
      <section class="plan-section">
        <h4>备选方案 <span class="tag">${backups.length} 篇</span></h4>
        <div class="plan-card-grid">${backups.length ? backups.map(planCardHtml).join("") : emptyHtml("暂无备选方案。")}</div>
      </section>
    </article>
  `;
}

function planCardHtml(note) {
  const angleRows = Math.min(18, Math.max(6, String(note.angle || "").split("\n").length + 3));
  const copyRows = Math.min(18, Math.max(5, String(note.copywriting || "").split("\n").length + 3));
  return `
    <article class="plan-card ${note.status === "published" ? "published" : ""}" data-note-id="${note.id}">
      ${note.status === "published" ? `<div class="published-check">✓</div>` : ""}
      <div class="item-head">
        <strong class="plan-title-nowrap">${escapeHtml(note.title)}</strong>
        <div class="plan-status-date">
          ${statusSelectHtml(note)}
          <span class="plan-date-highlight">${formatDate(note.publishDate)}</span>
        </div>
      </div>
      <div class="plan-meta">
        <span>${escapeHtml(note.type)}</span>
        <span>${note.needDesign === "yes" ? "需设计" : "不需设计"}</span>
        <span>${note.imageOwner === "self" ? "自己做图" : "设计做图"}</span>
      </div>
      <label>
        Tag
        <input data-note-field="tags" data-note-id="${note.id}" value="${escapeHtml(normalizeTags(note.tags).join("、"))}" />
      </label>
      <label>
        内容概述
        <textarea class="auto-textarea" data-note-field="angle" data-note-id="${note.id}" rows="${angleRows}">${escapeHtml(note.angle || "")}</textarea>
      </label>
      <label>
        笔记文案
        <textarea class="auto-textarea" data-note-field="copywriting" data-note-id="${note.id}" rows="${copyRows}">${escapeHtml(note.copywriting || "")}</textarea>
      </label>
      ${note.image ? `<img class="note-thumb plan-image" src="${escapeHtml(note.image)}" alt="参考图片" />` : `<div class="image-preview empty">暂无参考图片</div>`}
      <label class="ghost-btn file-btn">
        插入参考图片
        <input data-plan-image-note="${note.id}" type="file" accept="image/*" />
      </label>
    </article>
  `;
}

function miniNoteHtml(note) {
  return `
    <div class="mini-note" data-note-id="${note.id}">
      <div class="item-head">
        <strong>${escapeHtml(note.title)}</strong>
        <div class="task-actions">
          ${statusSelectHtml(note)}
          <select class="mini-note-menu" data-detail-note-menu="${note.id}">
            <option value="">操作</option>
            <option value="edit">编辑</option>
          </select>
        </div>
      </div>
      <div class="mini-note-grid">
        ${note.image ? `<img class="note-thumb" src="${escapeHtml(note.image)}" alt="参考图片" />` : `<div class="image-preview">暂无图片</div>`}
        <div>
          <div class="plan-meta">
            <span class="plan-date-inline detail-note-date">${formatDate(note.publishDate)}</span>
            <span>${escapeHtml(note.type)}</span>
            <span>${note.needDesign === "yes" ? "需设计" : "不需设计"}</span>
          </div>
          <div class="tag-row">${tagButtonsHtml(note.tags)}</div>
          <p>${note.angle ? escapeHtml(note.angle) : "暂无内容概述。"}</p>
        </div>
      </div>
    </div>
  `;
}

function statusSelectHtml(note) {
  const options = [
    ["idea", "待选题"],
    ["design", "待设计"],
    ["copy", "待文案"],
    ["production", "待制作"],
    ["review", "待客户审核"],
    ["scheduled", "待发布"],
    ["published", "已发布"],
  ];
  return `
    <select class="status-select" data-status-note="${note.id}">
      ${options.map(([value, label]) => `<option value="${value}" ${note.status === value ? "selected" : ""}>${label}</option>`).join("")}
    </select>
  `;
}

function renderNotes() {
  const filter = $("noteFilterClient").value || "all";
  const monthFilter = $("noteFilterMonth").value || "all";
  const kindFilter = $("noteFilterKind").value || "all";
  const publishFilter = $("noteFilterPublish").value || "all";
  const subStatus = $("noteFilterSubStatus")?.value || "all";
  const tagFilter = $("noteFilterTag").value || selectedTag || "all";
  const baseNotes = state.notes
    .filter((note) => filter === "all" || note.clientId === filter)
    .filter((note) => monthFilter === "all" || (note.planMonth || planMonthFromDate(note.publishDate)) === monthFilter)
    .filter((note) => kindFilter === "all" || (note.planKind || "monthly") === kindFilter)
    .filter((note) => tagFilter === "all" || normalizeTags(note.tags).includes(tagFilter));
  const notes = baseNotes
    .filter((note) => noteMatchesPublishFilter(note, publishFilter))
    .filter((note) => publishFilter !== "unpublished" || subStatus === "all" || note.status === subStatus)
    .sort(sortNotesForWork);

  $("noteProgressOverview").innerHTML = noteProgressOverviewHtml(baseNotes, notes, monthFilter);
  $("noteList").innerHTML = notes.length ? notes.map(noteHtml).join("") : emptyHtml("还没有笔记排期。");
}

function noteMatchesPublishFilter(note, filter) {
  if (filter === "all") return true;
  if (filter === "published") return note.status === "published";
  if (filter === "unpublished") return note.status !== "published";
  return note.status === filter;
}

function noteProgressOverviewHtml(baseNotes, visibleNotes, monthFilter) {
  const total = visibleNotes.length;
  const published = baseNotes.filter((note) => note.status === "published").length;
  const remaining = baseNotes.filter((note) => note.status !== "published").length;
  const label = monthFilter === "all" ? "全部笔记" : `${monthLabel(monthFilter)}全部笔记`;
  const clientCards = state.clients
    .map((client) => {
      const rows = baseNotes.filter((note) => note.clientId === client.id && note.planKind !== "backup");
      if (!rows.length) return "";
      const done = rows.filter((note) => note.status === "published").length;
      const percent = Math.min(100, Math.round((done / rows.length) * 100));
      return `
        <article class="progress-pill client-progress-pill">
          <div class="item-head">
            <span>${escapeHtml(client.name)}</span>
            <strong>${done}/${rows.length}</strong>
          </div>
          <div class="bar"><span style="width:${percent}%"></span></div>
        </article>
      `;
    })
    .filter(Boolean)
    .join("");
  return `
    <article class="progress-pill clickable-pill" data-note-filter="all"><span>${label}</span><strong>${total}</strong></article>
    <article class="progress-pill clickable-pill" data-note-filter="published"><span>已发布</span><strong>${published}</strong></article>
    <article class="progress-pill clickable-pill" data-note-filter="unpublished"><span>未发布</span><strong>${remaining}</strong></article>
    ${clientCards}
  `;
}

function noteHtml(note) {
  const client = clientById(note.clientId);
  return `
    <article class="note-item ${note.status === "published" ? "published" : ""}" data-note-id="${note.id}">
      ${note.status === "published" ? `<span class="published-check note-published-check">✓</span>` : ""}
      <div class="item-head">
        <strong>${escapeHtml(note.title)}</strong>
        <div class="note-status-stack">
          ${statusSelectHtml(note)}
          <div class="note-date-line">${formatDate(note.publishDate)}</div>
        </div>
      </div>
      <div class="tag-row">${tagButtonsHtml(note.tags)}</div>
      <div class="tag-row">
        <span class="tag">${escapeHtml(client?.name || "未选择客户")}</span>
        <span class="tag">${monthLabel(note.planMonth || planMonthFromDate(note.publishDate))}</span>
        <span class="tag ${note.planKind === "backup" ? "yellow" : "green"}">${note.planKind === "backup" ? "备选方案" : "月度规划"}</span>
        <span class="tag">${escapeHtml(note.type)}</span>
        <span class="tag">${note.needDesign === "yes" ? "需设计" : "不需设计"}</span>
      </div>
      ${note.image ? `<img class="note-thumb" src="${escapeHtml(note.image)}" alt="参考图片" />` : ""}
      <p>${note.angle ? escapeHtml(note.angle) : "暂无卖点记录。"}</p>
      ${note.copywriting ? `<p><strong>文案：</strong>${escapeHtml(note.copywriting)}</p>` : ""}
      <div class="note-link-row">
        <input data-note-link="${note.id}" value="${escapeHtml(note.link || "")}" placeholder="填写已发布笔记链接" />
        ${note.link ? `<a class="ghost-btn mini-action" href="${escapeHtml(note.link)}" target="_blank" rel="noopener noreferrer">打开链接</a>` : ""}
      </div>
    </article>
  `;
}

function renderDesignRequests() {
  const listEl = document.getElementById("designRequestList");
  const clientEl = document.getElementById("designClientFilter");
  const monthEl = document.getElementById("designMonthFilter");
  if (!listEl || !clientEl || !monthEl) return;
  const clientFilter = clientEl.value || "all";
  const monthFilter = monthEl.value || "all";
  const rows = state.notes
    .filter((note) => note.planKind !== "backup")
    .filter((note) => note.needDesign === "yes")
    .filter((note) => note.status !== "published")
    .filter((note) => clientFilter === "all" || note.clientId === clientFilter)
    .filter((note) => monthFilter === "all" || (note.planMonth || planMonthFromDate(note.publishDate)) === monthFilter)
    .sort((a, b) => designDueDate(a).localeCompare(designDueDate(b)));
  listEl.innerHTML = rows.length ? rows.map(designRequestHtml).join("") : emptyHtml("当前筛选下暂无设计提需。");
}

function renderTypes() {
  if (!$("typeHistoryList")) return;
  const tag = $("typeTagFilter").value || "all";
  const client = $("typeClientFilter").value || "all";
  const rows = state.notes
    .filter((note) => note.status === "published")
    .filter((note) => tag === "all" || normalizeTags(note.tags).includes(tag))
    .filter((note) => client === "all" || note.clientId === client)
    .sort(sortNotesForWork);
  $("typeHistoryList").innerHTML = rows.length ? rows.map(noteHtml).join("") : emptyHtml("当前标签下还没有已发布笔记。");
}

function renderBrands() {
  if (!$("brandList")) return;
  const keyword = ($("brandSearch")?.value || "").trim().toLowerCase();
  const rows = state.brandRefs.filter((brand) => {
    const text = `${brand.name || ""} ${brand.url || ""}`.toLowerCase();
    return !keyword || text.includes(keyword);
  });
  $("brandCount").textContent = `${rows.length}/${state.brandRefs.length} 个`;
  $("brandList").innerHTML = rows.length
    ? rows.map(brandHtml).join("")
    : emptyHtml("还没有品牌参考，先把常看的对标账号放进来。");
}

function renderTools() {
  if (!$("toolList")) return;
  $("toolCount").textContent = `${state.toolRefs.length} 个`;
  $("toolList").innerHTML = state.toolRefs.length
    ? state.toolRefs.map(toolHtml).join("")
    : emptyHtml("点击添加外链工具");
}

function toolHtml(tool) {
  return `
    <article class="tool-item" data-tool-id="${tool.id}">
      <div>
        <strong>${escapeHtml(tool.title)}</strong>
        <a href="${escapeHtml(tool.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(tool.url)}">${escapeHtml(shortUrl(tool.url))}</a>
      </div>
      <button class="ghost-btn mini-action" type="button" data-edit-tool="${tool.id}">编辑</button>
    </article>
  `;
}

function fillToolForm(tool = null) {
  $("toolId").value = tool?.id || "";
  $("toolTitle").value = tool?.title || "";
  $("toolUrl").value = tool?.url || "";
}

function collectToolForm() {
  return {
    id: $("toolId").value || uid("tool"),
    title: $("toolTitle").value.trim(),
    url: normalizeExternalUrl($("toolUrl").value.trim()),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeExternalUrl(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function renderSettings() {
  const select = $("globalImportClient");
  if (select) {
    const current = select.value;
    select.innerHTML = state.clients
      .map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`)
      .join("") + `<option value="__new__">新增客户</option>`;
    if (current && state.clients.some((client) => client.id === current)) select.value = current;
    else if (current === "__new__") select.value = "__new__";
    const isNew = select.value === "__new__";
    if ($("globalNewClientWrap")) $("globalNewClientWrap").hidden = !isNew;
  }
  const editor = $("mailTemplateEditor");
  if (editor && document.activeElement !== editor) editor.value = state.mailTemplate || defaultMailTemplate();
}

function brandHtml(brand) {
  const active = $("brandId")?.value === brand.id;
  return `
    <article class="brand-item ${active ? "active" : ""}" data-brand-id="${brand.id}">
      <div class="brand-copy">
        <strong>${escapeHtml(brand.name)}</strong>
        <a href="${escapeHtml(brand.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(brand.url)}">${escapeHtml(shortUrl(brand.url))}</a>
      </div>
    </article>
  `;
}

function fillBrandForm(brand = null) {
  $("brandId").value = brand?.id || "";
  $("brandName").value = brand?.name || "";
  $("brandUrl").value = brand?.url || "";
  renderBrands();
}

function collectBrandForm() {
  const url = $("brandUrl").value.trim();
  return {
    id: $("brandId").value || uid("brand"),
    name: $("brandName").value.trim(),
    url,
    logo: "",
    logoUrl: "",
    updatedAt: new Date().toISOString(),
  };
}

function parseImportedPlanning(text) {
  const clean = String(text || "").replace(/\r/g, "").trim();
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  const positioningLines = [];
  const noteBlocks = [];
  let current = [];
  let inPositioning = false;

  lines.forEach((line) => {
    if (/账号定位|品牌定位|人设定位|内容定位/.test(line)) {
      inPositioning = true;
      positioningLines.push(line.replace(/^#+\s*/, ""));
      return;
    }
    if (/^(月度规划|笔记规划|内容规划|选题规划|备选方案)/.test(line)) {
      inPositioning = false;
      return;
    }
    const startsNote = /^(\d{1,2}[.、\)]\s*|第\s*\d+\s*篇|[-•]\s*)/.test(line) || /标题[:：]|选题[:：]|笔记[:：]/.test(line);
    if (inPositioning && !startsNote) {
      positioningLines.push(line);
      return;
    }
    if (startsNote && current.length) {
      noteBlocks.push(current.join("\n"));
      current = [];
    }
    current.push(line.replace(/^(\d{1,2}[.、\)]\s*|[-•]\s*)/, ""));
  });
  if (current.length) noteBlocks.push(current.join("\n"));

  const notes = noteBlocks
    .map((block, index) => {
      const blockLines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const titleLine = blockLines.find((line) => /标题[:：]|选题[:：]|笔记[:：]/.test(line)) || blockLines[0] || `导入笔记 ${index + 1}`;
      const title = titleLine.replace(/^(标题|选题|笔记)[:：]\s*/, "").slice(0, 80);
      const angle = blockLines.filter((line) => line !== titleLine).join("\n") || block;
      return { title, angle };
    })
    .filter((note) => note.title || note.angle)
    .slice(0, 50);

  return {
    positioning: positioningLines.join("\n").trim(),
    notes,
  };
}

function importPlanningForClient(clientId, text, fileName = "") {
  const client = clientById(clientId);
  if (!client) return showToast("请先打开客户详情");
  const parsed = parseImportedPlanning(text);
  const importId = uid("import");
  const month = $("planMonthFilter")?.value || currentPlanMonth();
  const existingCount = notesForClient(clientId).filter((note) => note.planMonth === month).length;
  const newNotes = parsed.notes.map((item, index) => ({
    id: uid("note"),
    clientId,
    title: item.title || `导入笔记 ${index + 1}`,
    type: "图文",
    publishDate: dateValue(monthPlanDates(existingCount + parsed.notes.length, month)[existingCount + index] || today),
    planMonth: month,
    planKind: "monthly",
    status: "idea",
    needDesign: "yes",
    imageOwner: "design",
    tags: normalizeTags(inferTags(item)),
    image: "",
    angle: item.angle || "",
    copywriting: "",
    reviewNote: `批量导入：${fileName || "手动文本"}`,
    importId,
  }));

  const oldBio = client.bio || "";
  if (parsed.positioning) {
    client.bio = oldBio ? `${oldBio}\n\n${parsed.positioning}` : parsed.positioning;
  }
  state.notes.push(...newNotes);
  lastClientImport = { importId, clientId, oldBio, noteIds: newNotes.map((note) => note.id) };
  saveState();
  render();
  renderClientDetail(clientId);
  showToast(`导入成功，共拆解 ${newNotes.length} 条笔记，${parsed.positioning ? "已更新账号定位" : "未识别账号定位"}`);
}

async function handleGlobalPlanningImport(file) {
  const clientId = ensureGlobalImportClient();
  if (!clientId) return showToast("请先选择归属客户");
  const ext = file.name.split(".").pop().toLowerCase();
  if (["doc", "docx", "xls", "xlsx"].includes(ext)) {
    showToast("当前浏览器版暂不直接解析Word/Excel，请先另存为TXT再上传");
    return;
  }
  const text = await file.text();
  importPlanningForClient(clientId, text, file.name);
  renderSettings();
}

function cleanClientName(name) {
  return String(name || "")
    .replace(/[<>/\\|?*:"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

function ensureGlobalImportClient() {
  const select = $("globalImportClient");
  if (!select) return "";
  if (select.value !== "__new__") return select.value;
  const name = cleanClientName($("globalNewClientName")?.value || "");
  if (!name) {
    showToast("新客户名称不能为空");
    return "";
  }
  const existing = state.clients.find((client) => client.name === name);
  if (existing) {
    select.value = existing.id;
    if ($("globalNewClientWrap")) $("globalNewClientWrap").hidden = true;
    return existing.id;
  }
  const client = {
    id: uid("client"),
    name,
    type: "new",
    startDate: dateValue(today),
    target: 10,
    publisher: "me",
    reviewMode: "optional",
    status: "active",
    publishDays: "",
    contractMonths: "",
    profileUrl: "",
    bio: "",
    attention: "",
    notes: "通过备份页上传解析自动创建",
    createdAt: new Date().toISOString(),
  };
  state.clients.push(client);
  selectedClientId = client.id;
  if ($("globalNewClientName")) $("globalNewClientName").value = name;
  showToast(`已新增客户：${name}`);
  return client.id;
}

function undoLastClientImport() {
  if (!lastClientImport) return showToast("暂无可撤销的导入");
  const client = clientById(lastClientImport.clientId);
  if (client) client.bio = lastClientImport.oldBio || "";
  state.notes = state.notes.filter((note) => !lastClientImport.noteIds.includes(note.id));
  const count = lastClientImport.noteIds.length;
  lastClientImport = null;
  saveState();
  render();
  showToast(`已撤销本次导入，移除 ${count} 条笔记`);
}

function shortUrl(url) {
  const text = String(url || "");
  if (text.length <= 34) return text || "未填写链接";
  return `${text.slice(0, 18)}...${text.slice(-12)}`;
}

function designDueDate(note) {
  const publishDate = toDate(note.publishDate);
  if (!publishDate) return "";
  return dateValue(addDays(publishDate, -2));
}

function designRequestHtml(note) {
  const client = clientById(note.clientId);
  const due = designDueDate(note);
  const overdue = due && toDate(due) < today;
  return `
    <article class="design-item" data-note-id="${note.id}">
      <div class="item-head">
        <strong>${escapeHtml(client?.name || "未选择客户")}｜${escapeHtml(note.title)}</strong>
        <span class="tag ${overdue ? "red" : "blue"}">${overdue ? "已到/逾期" : "待提需"}</span>
      </div>
      <div class="plan-meta">
        <span>提需：${formatDate(due)}</span>
        <span>发布：${formatDate(note.publishDate)}</span>
        <span>${statusText(note.status)}</span>
      </div>
      <div class="form-row">
        <label>
          图片制作
          <select class="image-owner-select" data-image-owner-note="${note.id}">
            <option value="design" ${note.imageOwner !== "self" ? "selected" : ""}>设计制作图片</option>
            <option value="self" ${note.imageOwner === "self" ? "selected" : ""}>自己制作图片</option>
          </select>
        </label>
        <label>
          笔记状态
          ${statusSelectHtml(note)}
        </label>
      </div>
      <label>
        设计提需/文案
        <textarea data-note-field="copywriting" data-note-id="${note.id}" rows="4">${escapeHtml(note.copywriting || "")}</textarea>
      </label>
      <label class="ghost-btn file-btn">
        插入参考图片
        <input data-design-image-note="${note.id}" type="file" accept="image/*" />
      </label>
      ${note.image ? `<img class="note-thumb" src="${escapeHtml(note.image)}" alt="参考图片" />` : ""}
      <p>${note.angle ? escapeHtml(note.angle) : "暂无内容概述。"}</p>
    </article>
  `;
}

function tagButtonsHtml(tags) {
  const list = normalizeTags(tags);
  return list.length
    ? list.map((tag) => `<button class="tag-btn ${selectedTag === tag ? "active" : ""}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join("")
    : `<span class="tag">未打标签</span>`;
}

function renderSelects() {
  const oldNoteMonth = $("noteFilterMonth")?.value;
  const oldTag = $("noteFilterTag")?.value || selectedTag;
  const oldDayCalendarMonth = $("dayCalendarMonth")?.value;
  const oldPlanClient = $("planClientFilter")?.value || "all";
  const oldPlanMonth = $("planMonthFilter")?.value;
  const designClientEl = document.getElementById("designClientFilter");
  const designMonthEl = document.getElementById("designMonthFilter");
  const oldDesignClient = designClientEl?.value || "all";
  const oldDesignMonth = designMonthEl?.value || "all";
  const oldTypeTag = $("typeTagFilter")?.value || "all";
  const oldTypeClient = $("typeClientFilter")?.value || "all";
  const oldMonthlyReportClient = $("monthlyReportClient")?.value;
  const oldMonthlyReportMonth = $("monthlyReportMonth")?.value;
  const clientOptions = state.clients
    .map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`)
    .join("");
  const monthOptions = allPlanMonths()
    .map((month) => `<option value="${month}">${monthLabel(month)}</option>`)
    .join("");
  const tagOptions = allTags()
    .map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`)
    .join("");
  $("noteClient").innerHTML = clientOptions || `<option value="">先新增客户</option>`;
  $("reportClient").innerHTML = clientOptions || `<option value="">先新增客户</option>`;
  $("monthlyReportClient").innerHTML = clientOptions || `<option value="">先新增客户</option>`;
  $("noteFilterClient").innerHTML = `<option value="all">全部客户</option>${clientOptions}`;
  $("planClientFilter").innerHTML = `<option value="all">全部客户</option>${clientOptions}`;
  if (designClientEl) designClientEl.innerHTML = `<option value="all">全部客户</option>${clientOptions}`;
  $("typeClientFilter").innerHTML = `<option value="all">全部客户</option>${clientOptions}`;
  $("noteFilterMonth").innerHTML = `<option value="all">全部月份</option>${monthOptions}`;
  $("planMonthFilter").innerHTML = monthOptions;
  if (designMonthEl) designMonthEl.innerHTML = `<option value="all">全部月份</option>${monthOptions}`;
  $("dayCalendarMonth").innerHTML = monthOptions;
  $("monthlyReportMonth").innerHTML = monthOptions;
  $("noteFilterTag").innerHTML = `<option value="all">全部标签</option>${tagOptions}`;
  $("typeTagFilter").innerHTML = `<option value="all">全部标签</option>${tagOptions}`;
  if (oldNoteMonth) $("noteFilterMonth").value = oldNoteMonth;
  if (oldTag) $("noteFilterTag").value = oldTag;
  selectedTag = $("noteFilterTag").value || "all";
  if ($("noteFilterPublish")?.value !== "unpublished") {
    $("noteFilterSubStatus").disabled = true;
    $("noteFilterSubStatus").value = "all";
  } else {
    $("noteFilterSubStatus").disabled = false;
  }
  if (oldPlanClient) $("planClientFilter").value = oldPlanClient;
  if (oldPlanMonth && allPlanMonths().includes(oldPlanMonth)) $("planMonthFilter").value = oldPlanMonth;
  else $("planMonthFilter").value = currentPlanMonth();
  if (oldDesignClient && designClientEl) designClientEl.value = oldDesignClient;
  if (oldDesignMonth && designMonthEl) designMonthEl.value = oldDesignMonth;
  if (oldTypeTag) $("typeTagFilter").value = oldTypeTag;
  if (oldTypeClient) $("typeClientFilter").value = oldTypeClient;
  if (oldMonthlyReportClient && state.clients.some((client) => client.id === oldMonthlyReportClient)) $("monthlyReportClient").value = oldMonthlyReportClient;
  if (oldMonthlyReportMonth && allPlanMonths().includes(oldMonthlyReportMonth)) $("monthlyReportMonth").value = oldMonthlyReportMonth;
  else $("monthlyReportMonth").value = currentPlanMonth();
  if (oldDayCalendarMonth && allPlanMonths().includes(oldDayCalendarMonth)) $("dayCalendarMonth").value = oldDayCalendarMonth;
  else if (!$("dayCalendarMonth").value) $("dayCalendarMonth").value = currentPlanMonth();
  renderDayMonthBoard();
}

function renderReport() {
  const client = clientById($("reportClient").value);
  const data = $("reportData").value.trim();
  const done = $("reportDone").value.trim();
  const plan = $("reportPlan").value.trim();

  $("reportPreview").textContent = `【小红书运营周报】
${client ? client.name : ""}

一、上周运营数据
${data || ""}

二、上周运营总结
${done || ""}

三、本周计划
${numberLines(plan || "")}
——
以上是我们的周报内容，请查收，有问题随时沟通~`;
  renderMonthlyReport();
}

function renderMonthlyReport() {
  if (!$("monthlyReportPreview")) return;
  const client = clientById($("monthlyReportClient").value);
  const month = $("monthlyReportMonth").value || currentPlanMonth();
  const goals = [...document.querySelectorAll(".monthly-goal:checked")].map((item) => item.value).join("｜");
  const fields = {
    postCount: $("monthlyPostCount").value.trim(),
    hotPost: $("monthlyHotPost").value.trim(),
    hotRate: $("monthlyHotRate").value.trim(),
    exposure: $("monthlyExposure").value.trim(),
    reads: $("monthlyReads").value.trim(),
    fans: $("monthlyFans").value.trim(),
    review: $("monthlyReview").value.trim(),
    nextPlan: $("monthlyNextPlan").value.trim(),
    bestTitle: $("monthlyBestTitle").value.trim(),
    bestLink: $("monthlyBestLink").value.trim(),
    direction: $("monthlyContentDirection").value.trim(),
    actions: $("monthlyActions").value.trim(),
  };
  $("monthlyReportPreview").textContent = `${monthLabel(month)}-${client?.name || "客户"}-小红书运营月报

一、本月运营目标
${goals || ""}

二、核心数据概览
发篇数：${fields.postCount}
百赞爆文：${fields.hotPost}
百赞爆文率：${fields.hotRate}
近30日曝光量：${fields.exposure}
总阅读量：${fields.reads}
总粉丝量：${fields.fans}

三、总结
1. 本月复盘
${fields.review}

2. 下月规划
${fields.nextPlan}

四、内容运营分析
爆款笔记：${fields.bestTitle}
笔记链接：${fields.bestLink}
内容方向：${fields.direction}

五、下月运营调整动作
${fields.actions}`;
  renderMonthlyVisual();
}

function renderMonthlyVisual() {
  if (!$("monthlyVisual")) return;
  const client = clientById($("monthlyReportClient").value);
  const month = $("monthlyReportMonth").value || currentPlanMonth();
  const goals = [...document.querySelectorAll(".monthly-goal:checked")].map((item) => item.value);
  const metricLabels = ["发篇数", "百赞爆文", "百赞爆文率", "近30日曝光量", "总阅读量", "总粉丝量"];
  const metricIds = ["monthlyPostCount", "monthlyHotPost", "monthlyHotRate", "monthlyExposure", "monthlyReads", "monthlyFans"];
  const goalColumns = goals.length ? goals : ["未选择维度"];
  const columns = Math.max(goalColumns.length, metricLabels.length);
  $("monthlyVisual").innerHTML = `
    <div class="visual-title">${monthLabel(month)}-${escapeHtml(client?.name || "客户")}-客户小红书运营月报</div>
    <div class="visual-grid" style="grid-template-columns: repeat(${columns}, minmax(0, 1fr));">
      <div class="visual-group-title" style="grid-column: 1 / -1;">运营维度</div>
      ${goalColumns.map((goal) => `<div class="visual-head">${escapeHtml(goal)}</div>`).join("")}
      ${Array.from({ length: columns - goalColumns.length }, () => `<div class="visual-head muted">-</div>`).join("")}
      <div class="visual-group-title" style="grid-column: 1 / -1;">核心指标</div>
      ${metricLabels.map((label) => `<div class="visual-cell">${label}</div>`).join("")}
      ${metricIds.map((id) => `<div class="visual-cell strong">${escapeHtml($(id).value || "-")}</div>`).join("")}
    </div>
    <div class="visual-block"><strong>本月运营目标：</strong>${goals.join("、") || "未填写"}</div>
    <div class="visual-block"><strong>本月复盘：</strong>${escapeHtml($("monthlyReview").value || "")}</div>
    <div class="visual-block"><strong>下月规划：</strong>${escapeHtml($("monthlyNextPlan").value || "")}</div>
    ${$("monthlyBestImagePreview").dataset.image ? `<img class="visual-image" src="${escapeHtml($("monthlyBestImagePreview").dataset.image)}" alt="爆款展示图" />` : ""}
    <div class="visual-block"><strong>下月运营调整动作：</strong>${escapeHtml($("monthlyActions").value || "")}</div>
  `;
}

function renderReportQueue() {
  if (!$("reportClientQueue")) return;
  const activeClients = state.clients.filter((client) => client.status !== "paused");
  $("reportClientQueue").innerHTML = activeClients.length
    ? activeClients.map(reportClientCardHtml).join("")
    : emptyHtml("暂无需要发周报的客户。");
}

function reportClientCardHtml(client) {
  const month = currentPlanMonth();
  const notes = notesForClient(client.id).filter((note) => note.planMonth === month && note.planKind !== "backup");
  const published = notes.filter((note) => note.status === "published").length;
  return `
    <article class="report-client-card" data-report-client="${client.id}">
      <strong>${escapeHtml(client.name)}</strong>
      <span class="tag">${published}/${notes.length || client.target || 10} 已发布</span>
      <button class="ghost-btn" type="button" data-use-report-client="${client.id}">生成该客户周报</button>
    </article>
  `;
}

function calendarKey(clientId, month) {
  return `${clientId}_${month}`;
}

function currentCalendar() {
  const clientEl = document.getElementById("calendarClient");
  const monthEl = document.getElementById("calendarMonth");
  if (!clientEl || !monthEl) return null;
  const clientId = clientEl.value;
  const month = monthEl.value || currentPlanMonth();
  return state.calendars.find((item) => item.key === calendarKey(clientId, month));
}

function upsertCalendar(data) {
  const index = state.calendars.findIndex((item) => item.key === data.key);
  if (index >= 0) state.calendars[index] = data;
  else state.calendars.push(data);
}

function renderCalendar() {
  const clientEl = document.getElementById("calendarClient");
  const monthEl = document.getElementById("calendarMonth");
  const summaryEl = document.getElementById("calendarSummary");
  if (!clientEl || !monthEl || !summaryEl) return;
  const calendar = currentCalendar();
  setImagePreview("calendarPreview", calendar?.image || "", "");
  summaryEl.value = calendar?.summary || buildCalendarSummary();
  renderCalendarSummaryPreview();
  renderMonthBoard();
}

function renderCalendarSummaryPreview() {
  const previewEl = document.getElementById("calendarSummaryPreview");
  const summaryEl = document.getElementById("calendarSummary");
  if (!previewEl) return;
  const lines = (summaryEl?.value || "").split("\n").filter(Boolean);
  previewEl.innerHTML = lines.length
    ? lines
        .map((line) => {
          const strong = /^(\d+\.|【|.*月度规划|.*月.*日|\s*标签|\s*概述)/.test(line.trim());
          return `<p class="${strong && !/标签|概述/.test(line) ? "summary-strong" : ""}">${escapeHtml(line)}</p>`;
        })
        .join("")
    : emptyHtml("生成或填写月度规划一览后，这里会展示完整内容。");
}

function buildCalendarSummary() {
  const clientId = document.getElementById("calendarClient")?.value;
  const month = document.getElementById("calendarMonth")?.value || currentPlanMonth();
  const client = clientById(clientId);
  if (!client) return "";
  const rows = notesForClient(clientId)
    .filter((note) => note.planMonth === month && note.planKind !== "backup")
    .sort((a, b) => (a.publishDate || "").localeCompare(b.publishDate || ""));
  if (!rows.length) return `${client.name} ${monthLabel(month)}暂无月度规划。`;
  return `【${client.name}】${monthLabel(month)}月度规划一览

${rows
  .map((note, index) => {
    const overview = (note.angle || "暂无内容概述").replace(/\n+/g, "；");
    return `${index + 1}. ${formatDate(note.publishDate)}｜${note.title}｜${statusText(note.status)}
   标签：${normalizeTags(note.tags).join("、") || "未打标签"}
   概述：${overview}`;
  })
  .join("\n\n")}`;
}

function monthDates(monthValue) {
  const [yearText, monthText] = (monthValue || currentPlanMonth()).split("-");
  const year = Number(yearText) || today.getFullYear();
  const month = (Number(monthText) || today.getMonth() + 1) - 1;
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) cells.push(dateValue(new Date(year, month, day)));
  return cells;
}

function tasksForDate(dateText) {
  return state.calendarTasks
    .filter((task) => task.date === dateText)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

function renderMonthBoard() {
  const boardEl = document.getElementById("monthBoard");
  if (!boardEl) return;
  const month = document.getElementById("calendarMonth")?.value || currentPlanMonth();
  const clientId = document.getElementById("calendarClient")?.value || "";
  const noteRows = state.notes.filter((note) => (note.planMonth || planMonthFromDate(note.publishDate)) === month);
  const cells = monthDates(month);
  boardEl.innerHTML = `
    <div class="month-week">日</div><div class="month-week">一</div><div class="month-week">二</div><div class="month-week">三</div><div class="month-week">四</div><div class="month-week">五</div><div class="month-week">六</div>
    ${cells
      .map((dateText) => {
        if (!dateText) return `<div class="month-cell empty-cell"></div>`;
        const day = Number(dateText.slice(-2));
        const tasks = tasksForDate(dateText);
        const notes = noteRows.filter((note) => note.publishDate === dateText && (!clientId || note.clientId === clientId));
        return `
          <button class="month-cell ${dateText === selectedCalendarDate ? "active" : ""}" type="button" data-calendar-date="${dateText}">
            <strong>${day}</strong>
            ${notes.slice(0, 2).map((note, index) => `<span class="calendar-chip rich-chip"><b>${index + 1}</b><em>${formatDate(note.publishDate)}</em><span>${escapeHtml(clientName(note.clientId))}｜${escapeHtml(note.title)}</span></span>`).join("")}
            ${tasks.slice(0, 3).map((task) => `<span class="calendar-task ${task.done ? "done" : ""}">${escapeHtml(task.text)}</span>`).join("")}
          </button>
        `;
      })
      .join("")}
  `;
  renderCalendarDayEditor();
}

function renderDayMonthBoard() {
  if (!$("dayMonthBoard")) return;
  const month = $("dayCalendarMonth")?.value || currentPlanMonth();
  const cells = monthDates(month);
  $("dayMonthBoard").innerHTML = `
    <div class="month-week">日</div><div class="month-week">一</div><div class="month-week">二</div><div class="month-week">三</div><div class="month-week">四</div><div class="month-week">五</div><div class="month-week">六</div>
    ${cells
      .map((dateText) => {
        if (!dateText) return `<div class="month-cell empty-cell"></div>`;
        const day = Number(dateText.slice(-2));
        const tasks = tasksForDate(dateText);
        return `
          <button class="month-cell ${dateText === selectedDayCalendarDate ? "active" : ""}" type="button" data-day-calendar-date="${dateText}">
            <strong>${day}</strong>
            ${tasks.map((task) => `<span class="calendar-task ${task.done ? "done" : ""}">${escapeHtml(task.text)}</span>`).join("")}
          </button>
        `;
      })
      .join("")}
  `;
  renderDayCalendarDayEditor();
}

function renderCalendarDayEditor() {
  const editorEl = document.getElementById("calendarDayEditor");
  const titleEl = document.getElementById("calendarDayTitle");
  const listEl = document.getElementById("calendarDayTaskList");
  if (!editorEl || !titleEl || !listEl) return;
  editorEl.hidden = !selectedCalendarDate;
  titleEl.textContent = `${formatDate(selectedCalendarDate)}当日任务`;
  const tasks = tasksForDate(selectedCalendarDate);
  listEl.innerHTML = tasks.length
    ? tasks
        .map(
          (task) => `
          <article class="day-plan-item ${task.done ? "done" : ""}" data-calendar-task="${task.id}">
            <button class="check-square ${task.done ? "done" : ""}" type="button" data-calendar-task-toggle="${task.id}"></button>
            <input data-calendar-task-text="${task.id}" value="${escapeHtml(task.text)}" />
            <button class="danger-btn" type="button" data-calendar-task-delete="${task.id}">删除</button>
          </article>
        `
        )
        .join("")
    : emptyHtml("这一天还没有任务。");
}

function renderDayCalendarDayEditor() {
  if (!$("dayCalendarDayEditor")) return;
  $("dayCalendarDayEditor").hidden = !selectedDayCalendarDate;
  $("dayCalendarDayTitle").textContent = `${formatDate(selectedDayCalendarDate)}当日任务`;
  const tasks = tasksForDate(selectedDayCalendarDate);
  $("dayCalendarDayTaskList").innerHTML = tasks.length
    ? tasks
        .map(
          (task) => `
          <article class="day-plan-item ${task.done ? "done" : ""}" data-calendar-task="${task.id}">
            <button class="check-square ${task.done ? "done" : ""}" type="button" data-calendar-task-toggle="${task.id}"></button>
            <input data-calendar-task-text="${task.id}" value="${escapeHtml(task.text)}" />
            <button class="danger-btn" type="button" data-calendar-task-delete="${task.id}">删除</button>
          </article>
        `
        )
        .join("")
    : emptyHtml("这一天还没有任务。");
}

function numberLines(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return text;
  return lines.map((line, index) => `${index + 1}. ${line.replace(/^\d+[.、]\s*/, "")}`).join("\n");
}

function emptyHtml(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fillClientForm(client = null) {
  selectedClientId = client?.id || "";
  if ($("clientModalTitle")) $("clientModalTitle").textContent = client ? "编辑客户" : "新增客户";
  $("clientId").value = selectedClientId;
  $("clientName").value = client?.name || "";
  $("clientType").value = client?.type || "new";
  $("clientStart").value = client?.startDate || dateValue(today);
  $("clientTarget").value = client?.target || 10;
  $("clientContractMonths").value = client?.contractMonths || "";
  $("clientPublisher").value = client?.publisher || "me";
  $("clientReview").value = client?.reviewMode || "optional";
  $("clientStatus").value = client?.status || "active";
  $("clientPublishDays").value = client?.publishDays || "";
  $("clientProfileUrl").value = client?.profileUrl || "";
  $("clientBio").value = client?.bio || "";
  $("clientAttention").value = client?.attention || "";
  $("clientNotes").value = client?.notes || "";
}

function openClientModal(client = null) {
  fillClientForm(client);
  $("clientModal").hidden = false;
  window.setTimeout(() => $("clientName")?.focus(), 80);
}

function closeClientModal() {
  $("clientModal").hidden = true;
}

function fillNoteForm(note = null) {
  selectedNoteId = note?.id || "";
  $("noteId").value = selectedNoteId;
  $("noteClient").value = note?.clientId || state.clients[0]?.id || "";
  $("noteTitle").value = note?.title || "";
  $("noteType").value = note?.type || "图文";
  $("noteDate").value = note?.publishDate || dateValue(today);
  $("notePlanMonth").value = note?.planMonth || planMonthFromDate(note?.publishDate || dateValue(today));
  $("notePlanKind").value = note?.planKind || "monthly";
  $("noteStatus").value = note?.status || "idea";
  $("noteDesign").value = note?.needDesign || "yes";
  $("noteImageOwner").value = note?.imageOwner || "design";
  $("noteTags").value = normalizeTags(note?.tags || inferTags(note || {})).join("、");
  $("noteAngle").value = note?.angle || "";
  $("noteCopywriting").value = note?.copywriting || "";
  $("noteReviewNote").value = note?.reviewNote || "";
  $("noteImage").value = "";
  setImagePreview("noteImagePreview", note?.image || "", "暂无参考图片");
}

function collectClientForm() {
  return {
    id: selectedClientId || uid("client"),
    name: $("clientName").value.trim(),
    type: $("clientType").value,
    startDate: $("clientStart").value,
    target: Number($("clientTarget").value || 10),
    contractMonths: $("clientContractMonths").value,
    publisher: $("clientPublisher").value,
    reviewMode: $("clientReview").value,
    status: $("clientStatus").value,
    publishDays: $("clientPublishDays").value.trim(),
    profileUrl: $("clientProfileUrl").value.trim(),
    bio: $("clientBio").value.trim(),
    activity: monthSummary(selectedClientId, $("planMonthFilter")?.value || currentPlanMonth()),
    attention: $("clientAttention").value.trim(),
    notes: $("clientNotes").value.trim(),
  };
}

function collectNoteForm() {
  const note = {
    id: selectedNoteId || uid("note"),
    clientId: $("noteClient").value,
    title: $("noteTitle").value.trim(),
    type: $("noteType").value,
    publishDate: $("noteDate").value,
    planMonth: $("notePlanMonth").value || planMonthFromDate($("noteDate").value),
    planKind: $("notePlanKind").value,
    status: $("noteStatus").value,
    needDesign: $("noteDesign").value,
    imageOwner: $("noteImageOwner").value,
    tags: normalizeTags($("noteTags").value),
    image: $("noteImagePreview").dataset.image || "",
    angle: $("noteAngle").value.trim(),
    copywriting: $("noteCopywriting").value.trim(),
    reviewNote: $("noteReviewNote").value.trim(),
  };
  if (!note.tags.length) note.tags = normalizeTags(inferTags(note));
  return note;
}

function upsert(list, item) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index >= 0) list[index] = item;
  else list.push(item);
}

function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast("已复制"),
    () => showToast("复制失败，请手动选择复制")
  );
}

function copyDayPlanText() {
  const items = state.dayPlans.filter((item) => item.date === selectedDayPlanDate).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const text = items.length
    ? items.map((item, index) => `${index + 1}. ${item.done ? "[已完成] " : ""}${item.text}`).join("\n")
    : "今日清单暂无任务。";
  copyText(`【今日清单】${selectedDayPlanDate}\n${text}`);
  showToast("已复制全部今日清单内容");
}

function copyWeekPlanText() {
  const items = state.weekPlans
    .filter((item) => (item.weekKey || weekKey(today)) === selectedWeekPlanWeek)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const text = items.length
    ? items.map((item, index) => `${index + 1}. ${item.done ? "[已完成] " : ""}${item.text}`).join("\n")
    : "周计划暂无任务。";
  copyText(`【周计划】${weekLabel(selectedWeekPlanWeek)}\n${text}`);
  showToast("已复制全部周计划内容");
}

function setImagePreview(id, image, emptyText) {
  const box = $(id);
  box.dataset.image = image || "";
  box.classList.toggle("empty", !image);
  box.innerHTML = image ? `<img src="${escapeHtml(image)}" alt="图片预览" />` : escapeHtml(emptyText);
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateNoteField(noteId, field, value) {
  const note = state.notes.find((entry) => entry.id === noteId);
  if (!note) return false;
  if (field === "tags") note.tags = normalizeTags(value);
  else note[field] = value;
  saveState();
  renderClientDetail();
  renderPlans();
  renderNotes();
  renderTypes();
  showToast("已保存");
  return true;
}

function handleNoteLinkChange(event) {
  const input = event.target.closest("[data-note-link]");
  if (!input) return;
  const note = state.notes.find((entry) => entry.id === input.dataset.noteLink);
  if (!note) return;
  note.link = input.value.trim();
  saveState();
  renderNotes();
  renderTypes();
  showToast("笔记链接已保存");
}

function switchView(viewId) {
  document.querySelectorAll(".nav-btn").forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
}

function goView(viewId) {
  const current = document.querySelector(".view.active")?.id || "dashboard";
  if (viewId !== current) previousView = current;
  switchView(viewId);
}

function upsertDayPlan(item) {
  upsert(state.dayPlans, item);
  saveState();
  renderDayPlans();
  showToast("日计划已保存");
}

function handleDayPlanClick(event) {
  const edit = event.target.closest("[data-day-plan-edit]");
  if (edit) {
    const input = document.querySelector(`[data-day-plan-text="${edit.dataset.dayPlanEdit}"]`);
    input?.focus();
    input?.select();
    return;
  }
  const toggle = event.target.closest("[data-day-plan-toggle]");
  if (toggle) {
    const item = state.dayPlans.find((entry) => entry.id === toggle.dataset.dayPlanToggle);
    if (!item) return;
    item.done = !item.done;
    upsertDayPlan(item);
    return;
  }
  const del = event.target.closest("[data-day-plan-delete]");
  if (del) {
    state.dayPlans = state.dayPlans.filter((entry) => entry.id !== del.dataset.dayPlanDelete);
    saveState();
    renderDayPlans();
    showToast("日计划已删除");
  }
}

function reorderDayPlans(targetId, position = "before") {
  if (!draggingDayPlanId) return;
  const items = state.dayPlans.filter((item) => item.date === selectedDayPlanDate).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const from = items.findIndex((item) => item.id === draggingDayPlanId);
  if (from < 0) return;
  const [moved] = items.splice(from, 1);
  let to = targetId ? items.findIndex((item) => item.id === targetId) : items.length;
  if (to < 0) to = items.length;
  if (position === "after") to += 1;
  items.splice(Math.max(0, Math.min(to, items.length)), 0, moved);
  items.forEach((item, index) => {
    item.order = index;
  });
  saveState();
  renderDayPlans();
}

function reorderWeekPlans(targetId, position = "before") {
  if (!draggingWeekPlanId) return;
  const items = state.weekPlans
    .filter((item) => (item.weekKey || weekKey(today)) === selectedWeekPlanWeek)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const from = items.findIndex((item) => item.id === draggingWeekPlanId);
  if (from < 0) return;
  const [moved] = items.splice(from, 1);
  let to = targetId ? items.findIndex((item) => item.id === targetId) : items.length;
  if (to < 0) to = items.length;
  if (position === "after") to += 1;
  items.splice(Math.max(0, Math.min(to, items.length)), 0, moved);
  items.forEach((item, index) => {
    item.order = index;
  });
  saveState();
  renderDayPlans();
  showToast("周计划排序已保存");
}

function handleDayPlanChange(event) {
  const input = event.target.closest("[data-day-plan-text]");
  if (!input) return;
  const item = state.dayPlans.find((entry) => entry.id === input.dataset.dayPlanText);
  if (!item) return;
  item.text = input.value.trim();
  upsertDayPlan(item);
}

function editTaskFromCard(card) {
  openTaskEditModal(card.dataset.taskCard, card.dataset.manualId || "");
}

function findTaskForEdit(taskKey, manualId = "") {
  if (manualId) return state.customTasks.find((entry) => entry.id === manualId);
  const { tasks, risks } = buildTasks();
  return [...tasks, ...risks].find((entry) => taskId(entry) === taskKey);
}

function openTaskEditModal(taskKey = "", manualId = "", defaults = {}) {
  editingTaskId = taskKey || "";
  const task = taskKey || manualId ? findTaskForEdit(taskKey, manualId) : null;
  const parts = splitTaskTitle(task?.title || defaults.title || "手动任务：");
  $("taskEditTitle").textContent = task ? "编辑事项" : "新增事项";
  $("taskEditId").value = manualId || task?.manualId || "";
  $("taskEditClient").value = defaults.client || parts.client || "";
  $("taskEditAction").value = defaults.action || parts.action || "";
  $("taskEditDetail").value = task?.detail || defaults.detail || "";
  $("taskEditBucket").value = task?.bucket || defaults.bucket || "ui";
  $("taskEditScope").value = task?.scope || defaults.scope || "day";
  $("taskEditTags").value = normalizeTags(task?.tags || defaults.tags || []).join("、");
  $("taskEditModal").hidden = false;
  window.setTimeout(() => $("taskEditAction")?.focus(), 80);
}

function closeTaskEditModal() {
  $("taskEditModal").hidden = true;
  editingTaskId = "";
}

function saveTaskEditFromModal() {
  const client = $("taskEditClient").value.trim() || "手动任务";
  const action = $("taskEditAction").value.trim();
  if (!action) return showToast("请填写具体事项");
  const detail = $("taskEditDetail").value.trim();
  const tags = normalizeTags($("taskEditTags").value);
  const bucket = $("taskEditBucket").value;
  const scope = $("taskEditScope").value;
  const title = `${client}：${action}`;
  const manualId = $("taskEditId").value;
  if (manualId) {
    const task = state.customTasks.find((entry) => entry.id === manualId);
    if (task) {
      task.title = title;
      task.detail = detail;
      task.tags = tags;
      task.bucket = bucket;
      task.scope = scope;
    }
  } else if (editingTaskId) {
    state.taskOverrides[editingTaskId] = { title, detail, tags, bucket, scope };
  } else {
    state.customTasks.push({
      id: uid("manual_task"),
      title,
      detail,
      tags,
      bucket,
      scope,
      order: state.customTasks.filter((task) => task.bucket === bucket).length,
      createdAt: new Date().toISOString(),
    });
  }
  saveState();
  closeTaskEditModal();
  renderDashboard();
  renderDayPlans();
  showToast("事项已保存");
}

/*
function editTaskFromCardOld(card) {
  const manualId = card.dataset.manualId;
  const { tasks, risks } = buildTasks();
  const task = manualId
    ? state.customTasks.find((entry) => entry.id === manualId)
    : [...tasks, ...risks].find((entry) => taskId(entry) === card.dataset.taskCard);
  if (!task) return;
  const parts = splitTaskTitle(task.title || "");
  const client = prompt("客户名称/任务归属：", parts.client);
  if (!client?.trim()) return;
  const action = prompt("具体事项：", parts.action);
  if (!action?.trim()) return;
  const detail = prompt("详情内容/概述标记：", task.detail || "");
  const tagsText = prompt("标签/标记（用顿号或逗号分隔）：", normalizeTags(task.tags || []).join("、"));
  const nextTitle = `${client.trim()}：${action.trim()}`;
  const nextDetail = detail?.trim() || "";
  const nextTags = normalizeTags(tagsText || "");
  if (!manualId) {
    state.taskOverrides[card.dataset.taskCard] = { title: nextTitle, detail: nextDetail, tags: nextTags };
    saveState();
    renderDashboard();
    showToast("任务已修改");
    return;
  }
  task.title = nextTitle;
  task.detail = nextDetail;
  task.tags = nextTags;
  saveState();
  renderDashboard();
  renderDayPlans();
  showToast("任务已修改");
}
*/

function applyTagFilter(tag) {
  selectedTag = tag || "all";
  goView("notes");
  renderSelects();
  $("noteFilterTag").value = selectedTag;
  renderNotes();
  showToast(selectedTag === "all" ? "已清除标签筛选" : `已筛选：${selectedTag}`);
}

function todayTextForCopy() {
  const { tasks, risks } = buildTasks();
  const taskLines = tasks.length
    ? tasks.map((task, index) => `${index + 1}. ${task.title}：${task.detail}`).join("\n")
    : "今天没有必须处理项。";
  const riskLines = risks.length
    ? risks.map((task, index) => `${index + 1}. ${task.title}：${task.detail}`).join("\n")
    : "暂时没有明显风险。";
  return `【今日小红书运营任务】${dateValue(today)}

一、今日必须完成
${taskLines}

二、风险提醒
${riskLines}`;
}

function createMonthPlan() {
  const clientId = $("noteFilterClient").value === "all" ? state.clients[0]?.id : $("noteFilterClient").value;
  const client = clientById(clientId);
  if (!client) {
    showToast("请先新增客户");
    return;
  }
  const planMonth = $("noteFilterMonth").value !== "all" ? $("noteFilterMonth").value : currentPlanMonth();
  const existing = notesForClient(client.id).filter((note) => note.planMonth === planMonth && note.planKind !== "backup").length;
  const target = Number(client.target || 10);
  const dates = monthPlanDates(target, planMonth);
  for (let index = existing; index < target; index += 1) {
    state.notes.push({
      id: uid("note"),
      clientId: client.id,
      title: `第 ${index + 1} 篇内容待定`,
      type: "图文",
      publishDate: dateValue(dates[index]),
      planMonth,
      planKind: "monthly",
      status: "idea",
      needDesign: "yes",
      imageOwner: "design",
      tags: ["内容规划"],
      angle: client.activity || "",
      copywriting: "",
      reviewNote: "",
    });
  }
  saveState();
  render();
  showToast(`已为 ${client.name} 补齐${monthLabel(planMonth)} ${target} 篇排期`);
}

function monthPlanDates(count, planMonth = currentPlanMonth()) {
  const dates = [];
  const [yearText, monthText] = planMonth.split("-");
  const year = Number(yearText) || today.getFullYear();
  const month = (Number(monthText) || today.getMonth() + 1) - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const preferred = [3, 5, 8, 11, 14, 17, 20, 23, 26, 29];
  for (let i = 0; i < count; i += 1) {
    const day = Math.min(preferred[i] || 1 + i * 3, daysInMonth);
    dates.push(new Date(year, month, day));
  }
  return dates;
}

function seedDemo() {
  if (state.clients.length && !confirm("会保留现有数据并追加示例，继续吗？")) return;
  const clientA = {
    id: uid("client"),
    name: "示例烤肉店",
    type: "new",
    startDate: dateValue(addDays(today, -1)),
    target: 10,
    publisher: "me",
    reviewMode: "optional",
    status: "active",
    contractMonths: "3",
    publishDays: "周二、周四、周六",
    activity: "双人套餐、到店有礼",
    attention: "客户审核慢，到点可先发。",
    notes: "客户审核慢，到点可先发。",
  };
  const clientB = {
    id: uid("client"),
    name: "示例SPA",
    type: "old",
    startDate: dateValue(addDays(today, -20)),
    target: 10,
    publisher: "mixed",
    reviewMode: "required",
    status: "active",
    contractMonths: "6",
    publishDays: "周三、周日",
    activity: "工作日舒缓套餐",
    attention: "注意功效表达。",
    notes: "注意功效表达。",
  };
  state.clients.push(clientA, clientB);
  state.notes.push(
    {
      id: uid("note"),
      clientId: clientA.id,
      title: "双人烤肉套餐种草",
      type: "图文",
      publishDate: dateValue(today),
      planMonth: currentPlanMonth(),
      planKind: "monthly",
      status: "review",
      needDesign: "yes",
      imageOwner: "design",
      tags: ["菜品品宣", "福利活动"],
      angle: "突出肉质、价格和到店有礼",
      reviewNote: "客户待确认",
    },
    {
      id: uid("note"),
      clientId: clientB.id,
      title: "下班后放松体验",
      type: "图文",
      publishDate: dateValue(addDays(today, 2)),
      planMonth: currentPlanMonth(),
      planKind: "backup",
      status: "copy",
      needDesign: "yes",
      imageOwner: "self",
      tags: ["场景营销", "项目品宣"],
      angle: "避免绝对化功效，写体验感",
      reviewNote: "",
    }
  );
  saveState();
  render();
  showToast("示例数据已填入");
}

document.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    goView(button.dataset.view);
  });
});

document.querySelectorAll(".back-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const current = document.querySelector(".view.active")?.id;
    goView(current === "clientDetail" ? "clients" : "dashboard");
  });
});

document.querySelectorAll(".quick-tab").forEach((button) => {
  button.addEventListener("click", () => {
  if (button.dataset.quickTarget) {
      goView(button.dataset.quickTarget);
      return;
    }
    if (button.dataset.dashboardQuadrant) {
      const target = document.querySelector(`[data-quadrant="${button.dataset.dashboardQuadrant}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("flash-card");
        window.setTimeout(() => target.classList.remove("flash-card"), 1500);
      }
      return;
    }
    const target = $(button.dataset.scrollTarget);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

$("sidebarToggle").addEventListener("click", toggleSidebar);
$("sidebarEdgeToggle").addEventListener("click", toggleSidebar);

document.querySelectorAll("[data-nav-group-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.navGroupToggle;
    uiState.navGroups[key] = uiState.navGroups[key] === false;
    saveUiState();
    applyUiState();
  });
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
    event.preventDefault();
    toggleSidebar();
  }
});

$("customTaskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("customTaskTitle").value.trim();
  if (!title) return;
  const task = {
    id: uid("manual_task"),
    title,
    bucket: $("customTaskBucket").value,
    scope: $("customTaskScope").value,
    createdAt: new Date().toISOString(),
  };
  state.customTasks.push(task);
  state.taskActions[task.id] = "active";
  $("customTaskTitle").value = "";
  saveState();
  renderDashboard();
  renderDayPlans();
  showToast("任务已添加");
});

$("dayPlanForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("dayPlanText").value.trim();
  if (!text) return;
  state.dayPlans.push({
    id: uid("day_plan"),
    text,
    done: false,
    date: selectedDayPlanDate,
    order: state.dayPlans.filter((item) => item.date === selectedDayPlanDate).length,
    createdAt: new Date().toISOString(),
  });
  $("dayPlanText").value = "";
  saveState();
  renderDayPlans();
  showToast("日计划已添加");
});

$("dayPlanDateSelect").addEventListener("change", () => {
  selectedDayPlanDate = $("dayPlanDateSelect").value || dateValue(today);
  renderDayPlans();
  showToast(`已切换到 ${formatDate(selectedDayPlanDate)} 今日清单`);
});

$("toggleProgressEdit").addEventListener("click", () => {
  progressEditMode = !progressEditMode;
  $("toggleProgressEdit").textContent = progressEditMode ? "完成" : "编辑";
  renderDashboard();
});

$("clientProgress").addEventListener("change", (event) => {
  const input = event.target.closest("[data-progress-client]");
  const plannedInput = event.target.closest("[data-planned-client]");
  if (!input && !plannedInput) return;
  const targetInput = input || plannedInput;
  const parsed = requireNonNegativeInteger(targetInput.value);
  if (parsed === null) {
    renderDashboard();
    return;
  }
  const month = currentPlanMonth();
  if (input) {
    state.progressOverrides[month] = state.progressOverrides[month] || {};
    state.progressOverrides[month][input.dataset.progressClient] = parsed;
  }
  if (plannedInput) {
    state.plannedOverrides[month] = state.plannedOverrides[month] || {};
    state.plannedOverrides[month][plannedInput.dataset.plannedClient] = parsed;
  }
  saveState();
  renderDashboard();
  showToast("客户进度已保存");
});

$("clientProgress").addEventListener("click", (event) => {
  const button = event.target.closest("[data-progress-reset]");
  const plannedButton = event.target.closest("[data-planned-reset]");
  if (!button && !plannedButton) return;
  const month = currentPlanMonth();
  if (button && state.progressOverrides[month]) delete state.progressOverrides[month][button.dataset.progressReset];
  if (plannedButton && state.plannedOverrides[month]) delete state.plannedOverrides[month][plannedButton.dataset.plannedReset];
  saveState();
  renderDashboard();
  showToast(button ? "已恢复自动统计" : "已恢复本月已排自动统计");
});

["dayPlanList", "todayPlanPreview"].forEach((id) => {
  $(id).addEventListener("click", handleDayPlanClick);
  $(id).addEventListener("change", handleDayPlanChange);
  $(id).addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-day-plan]");
    if (item) draggingDayPlanId = item.dataset.dayPlan;
  });
  $(id).addEventListener("dragover", (event) => event.preventDefault());
  $(id).addEventListener("drop", (event) => {
    event.preventDefault();
    const item = event.target.closest("[data-day-plan]");
    if (!item) {
      reorderDayPlans("", "after");
      return;
    }
    const rect = item.getBoundingClientRect();
    reorderDayPlans(item.dataset.dayPlan, event.clientY > rect.top + rect.height / 2 ? "after" : "before");
  });
});

$("weekPlanForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("weekPlanText").value.trim();
  if (!text) return;
  state.weekPlans.push({
    id: uid("week_plan"),
    text,
    done: false,
    weekKey: selectedWeekPlanWeek,
    order: state.weekPlans.filter((item) => (item.weekKey || weekKey(today)) === selectedWeekPlanWeek).length,
    createdAt: new Date().toISOString(),
  });
  $("weekPlanText").value = "";
  saveState();
  renderDayPlans();
  showToast("周计划已添加");
});

$("weekPlanWeekSelect").addEventListener("change", () => {
  selectedWeekPlanWeek = $("weekPlanWeekSelect").value || weekKey(today);
  renderDayPlans();
  showToast(`已切换到 ${weekLabel(selectedWeekPlanWeek)} 周计划`);
});

$("weekPlanList").addEventListener("change", (event) => {
  const input = event.target.closest("[data-week-plan-text]");
  if (!input) return;
  const item = state.weekPlans.find((entry) => entry.id === input.dataset.weekPlanText);
  if (!item) return;
  item.text = input.value.trim();
  saveState();
  renderDayPlans();
  showToast("周计划已保存");
});

$("weekPlanList").addEventListener("click", (event) => {
  const edit = event.target.closest("[data-week-plan-edit]");
  if (edit) {
    const input = document.querySelector(`[data-week-plan-text="${edit.dataset.weekPlanEdit}"]`);
    input?.focus();
    input?.select();
    return;
  }
  const toggle = event.target.closest("[data-week-plan-toggle]");
  if (toggle) {
    const item = state.weekPlans.find((entry) => entry.id === toggle.dataset.weekPlanToggle);
    if (!item) return;
    item.done = !item.done;
    saveState();
    renderDayPlans();
    return;
  }
  const button = event.target.closest("[data-week-plan-delete]");
  if (button) {
    state.weekPlans = state.weekPlans.filter((entry) => entry.id !== button.dataset.weekPlanDelete);
    saveState();
    renderDayPlans();
    showToast("周计划已删除");
  }
});

$("weekPlanList").addEventListener("dragstart", (event) => {
  const item = event.target.closest("[data-week-plan]");
  if (item) draggingWeekPlanId = item.dataset.weekPlan;
});

$("weekPlanList").addEventListener("dragover", (event) => event.preventDefault());

$("weekPlanList").addEventListener("drop", (event) => {
  event.preventDefault();
  const item = event.target.closest("[data-week-plan]");
  if (!item) {
    reorderWeekPlans("", "after");
    return;
  }
  const rect = item.getBoundingClientRect();
  reorderWeekPlans(item.dataset.weekPlan, event.clientY > rect.top + rect.height / 2 ? "after" : "before");
});

$("dashboard").addEventListener("change", (event) => {
  const select = event.target.closest("[data-task-id]");
  if (!select) return;
  state.taskActions[select.dataset.taskId] = select.value;
  saveState();
  renderDashboard();
  showToast(select.value === "done" ? "已标记完成" : select.value === "read" ? "已标记已读" : "已恢复未处理");
});

$("dashboard").addEventListener("click", (event) => {
  const metricButton = event.target.closest("[data-metric-edit]");
  if (!metricButton) return;
  const key = metricButton.dataset.metricEdit;
  const currentMap = {
    clients: $("metricClients").textContent,
    published: $("metricPublished").textContent,
    review: $("metricReview").textContent,
    week: $("metricWeek").textContent,
  };
  const next = prompt("请输入非负整数：", currentMap[key] || "0");
  if (next === null) return;
  const parsed = requireNonNegativeInteger(next);
  if (parsed === null) return;
  const month = currentPlanMonth();
  state.dashboardMetricOverrides[month] = state.dashboardMetricOverrides[month] || {};
  state.dashboardMetricOverrides[month][key] = parsed;
  saveState();
  renderDashboard();
  showToast("今日任务卡片数据已保存");
});

$("dashboard").addEventListener("click", (event) => {
  const jumpButton = event.target.closest("[data-quadrant-jump]");
  if (jumpButton) {
    const target = document.querySelector(`[data-quadrant="${jumpButton.dataset.quadrantJump}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("flash");
    window.setTimeout(() => target.classList.remove("flash"), 1500);
    return;
  }
  const editButton = event.target.closest("[data-quadrant-edit]");
  if (editButton) {
    const bucketMap = { 紧急重要: "ui", 紧急不重要: "un", 不紧急重要: "ni", 不紧急不重要: "nn" };
    const bucket = bucketMap[editButton.dataset.quadrantEdit] || "ui";
    openTaskEditModal("", "", { client: "手动任务", action: "", detail: "", bucket, scope: "day" });
    return;
  }
  const deleteButton = event.target.closest("[data-task-delete-id]");
  if (deleteButton) {
    const manualId = deleteButton.dataset.taskDelete;
    if (manualId) state.customTasks = state.customTasks.filter((entry) => entry.id !== manualId);
    else state.taskActions[deleteButton.dataset.taskDeleteId] = "done";
    saveState();
    renderDashboard();
    renderDayPlans();
    showToast("任务已删除");
    return;
  }
  const taskEditButton = event.target.closest("[data-task-edit]");
  if (taskEditButton) {
    event.preventDefault();
    const card = taskEditButton.closest("[data-task-card]");
    if (card) editTaskFromCard(card);
    return;
  }
  if (event.target.closest("select, button")) return;
  const card = event.target.closest("[data-task-card]");
  if (!card) return;
  editTaskFromCard(card);
});

$("dashboard").addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-manual-id]");
  if (card?.dataset.manualId) draggingTaskId = card.dataset.manualId;
});

$("dashboard").addEventListener("dragover", (event) => event.preventDefault());

$("dashboard").addEventListener("drop", (event) => {
  event.preventDefault();
  const target = event.target.closest("[data-manual-id]");
  if (!draggingTaskId || !target?.dataset.manualId || draggingTaskId === target.dataset.manualId) return;
  const dragged = state.customTasks.find((task) => task.id === draggingTaskId);
  const dropped = state.customTasks.find((task) => task.id === target.dataset.manualId);
  if (!dragged || !dropped || dragged.bucket !== dropped.bucket) return;
  const rows = state.customTasks.filter((task) => task.bucket === dragged.bucket).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const from = rows.findIndex((task) => task.id === draggingTaskId);
  const [moved] = rows.splice(from, 1);
  let to = rows.findIndex((task) => task.id === target.dataset.manualId);
  const rect = target.getBoundingClientRect();
  if (event.clientY > rect.top + rect.height / 2) to += 1;
  rows.splice(Math.max(0, Math.min(to, rows.length)), 0, moved);
  rows.forEach((task, index) => {
    task.order = index;
  });
  saveState();
  renderDashboard();
  showToast("任务排序已保存");
});

$("taskVisibilityFilter").addEventListener("change", renderDashboard);

$("addRiskTask").addEventListener("click", () => {
  openTaskEditModal("", "", { client: "风险提醒", action: "", detail: "", bucket: "ui", scope: "risk", tags: ["风险"] });
});

$("taskEditForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveTaskEditFromModal();
});

$("cancelTaskEdit").addEventListener("click", closeTaskEditModal);
$("closeTaskEdit").addEventListener("click", closeTaskEditModal);
$("taskEditModal").addEventListener("click", (event) => {
  if (event.target.id === "taskEditModal") closeTaskEditModal();
});

function updateNoteStatus(noteId, status) {
  const note = state.notes.find((entry) => entry.id === noteId);
  if (!note) return false;
  note.status = status;
  saveState();
  render();
  showToast("笔记状态已更新");
  return true;
}

function updateImageOwner(noteId, value) {
  const note = state.notes.find((entry) => entry.id === noteId);
  if (!note) return false;
  note.imageOwner = value;
  saveState();
  render();
  showToast("图片制作方式已更新");
  return true;
}

$("clientForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const client = collectClientForm();
  if (!client.name || !client.startDate) return;
  upsert(state.clients, client);
  saveState();
  selectedClientId = client.id;
  closeClientModal();
  render();
  showToast("客户已保存");
});

$("clientQuickCards").addEventListener("click", (event) => {
  const button = event.target.closest("[data-client-jump]");
  if (!button) return;
  const target = document.getElementById(`client-row-${button.dataset.clientJump}`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("flash-card");
    window.setTimeout(() => target.classList.remove("flash-card"), 1400);
  }
});

$("noteForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const note = collectNoteForm();
  if (!note.clientId || !note.title || !note.publishDate) return;
  upsert(state.notes, note);
  saveState();
  selectedNoteId = note.id;
  render();
  showToast("笔记已保存");
});

$("clientList").addEventListener("click", (event) => {
  if (event.target.matches("[data-status-note]")) return;
  const editButton = event.target.closest("[data-edit-client]");
  if (editButton) {
    event.stopPropagation();
    const client = clientById(editButton.dataset.editClient);
    if (client) openClientModal(client);
    return;
  }
  const tagButton = event.target.closest("[data-tag]");
  if (tagButton) {
    event.stopPropagation();
    applyTagFilter(tagButton.dataset.tag);
    return;
  }
  const noteCard = event.target.closest("[data-note-id]");
  if (noteCard) {
    const note = state.notes.find((entry) => entry.id === noteCard.dataset.noteId);
    if (note) {
      goView("notes");
      fillNoteForm(note);
      showToast("已打开笔记编辑");
    }
    return;
  }
  const card = event.target.closest("[data-client-id]");
  if (!card) return;
  const client = clientById(card.dataset.clientId);
  if (!client) return;
  selectedClientId = client.id;
  renderClientDetail(client.id);
  goView("clientDetail");
});

$("clientList").addEventListener("change", (event) => {
  const select = event.target.closest("[data-status-note]");
  if (!select) return;
  updateNoteStatus(select.dataset.statusNote, select.value);
});

$("clientDetailContent").addEventListener("click", (event) => {
  const jump = event.target.closest("[data-detail-jump]");
  if (jump) {
    const target = document.getElementById(jump.dataset.detailJump);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("flash-card");
      window.setTimeout(() => target.classList.remove("flash-card"), 1400);
    }
    return;
  }
  const delImage = event.target.closest("[data-detail-image-delete]");
  if (delImage) {
    updateNoteField(delImage.dataset.detailImageDelete, "image", "");
    return;
  }
  const done = event.target.closest("[data-detail-note-done]");
  if (done) {
    editingDetailNoteId = "";
    renderClientDetail();
    showToast("本条笔记已收起");
  }
});

$("clientDetailContent").addEventListener("change", async (event) => {
  const menu = event.target.closest("[data-detail-note-menu]");
  if (menu) {
    if (menu.value === "edit") {
      editingDetailNoteId = menu.dataset.detailNoteMenu;
      renderClientDetail();
      showToast("已打开本条笔记编辑");
    }
    return;
  }
  const statusSelect = event.target.closest("[data-status-note]");
  if (statusSelect) {
    updateNoteStatus(statusSelect.dataset.statusNote, statusSelect.value);
    return;
  }
  const fieldInput = event.target.closest("[data-note-field]");
  if (fieldInput) {
    updateNoteField(fieldInput.dataset.noteId, fieldInput.dataset.noteField, fieldInput.value);
    return;
  }
  const imageInput = event.target.closest("[data-detail-image-note]");
  if (imageInput) {
    const file = imageInput.files?.[0];
    if (!file) return;
    const image = await readImageFile(file);
    updateNoteField(imageInput.dataset.detailImageNote, "image", image);
  }
});

$("planBoard").addEventListener("click", (event) => {
  if (event.target.closest("input, textarea, select, button, label")) return;
  const tagButton = event.target.closest("[data-tag]");
  if (tagButton) {
    event.stopPropagation();
    applyTagFilter(tagButton.dataset.tag);
    return;
  }
  const card = event.target.closest("[data-note-id]");
  if (!card) return;
  const note = state.notes.find((entry) => entry.id === card.dataset.noteId);
  if (note) {
    goView("notes");
    fillNoteForm(note);
    showToast("已打开笔记编辑");
  }
});

$("planBoard").addEventListener("change", async (event) => {
  const statusSelect = event.target.closest("[data-status-note]");
  if (statusSelect) {
    updateNoteStatus(statusSelect.dataset.statusNote, statusSelect.value);
    return;
  }
  const fieldInput = event.target.closest("[data-note-field]");
  if (fieldInput) {
    updateNoteField(fieldInput.dataset.noteId, fieldInput.dataset.noteField, fieldInput.value);
    return;
  }
  const imageInput = event.target.closest("[data-plan-image-note]");
  if (imageInput) {
    const file = imageInput.files?.[0];
    if (!file) return;
    const image = await readImageFile(file);
    updateNoteField(imageInput.dataset.planImageNote, "image", image);
  }
});

document.getElementById("designRequestList")?.addEventListener("change", async (event) => {
  const statusSelect = event.target.closest("[data-status-note]");
  if (statusSelect) {
    updateNoteStatus(statusSelect.dataset.statusNote, statusSelect.value);
    return;
  }
  const ownerSelect = event.target.closest("[data-image-owner-note]");
  if (ownerSelect) {
    updateImageOwner(ownerSelect.dataset.imageOwnerNote, ownerSelect.value);
    return;
  }
  const fieldInput = event.target.closest("[data-note-field]");
  if (fieldInput) {
    updateNoteField(fieldInput.dataset.noteId, fieldInput.dataset.noteField, fieldInput.value);
    return;
  }
  const imageInput = event.target.closest("[data-design-image-note]");
  if (imageInput) {
    const file = imageInput.files?.[0];
    if (!file) return;
    const image = await readImageFile(file);
    updateNoteField(imageInput.dataset.designImageNote, "image", image);
  }
});

$("noteList").addEventListener("click", (event) => {
  if (event.target.matches("[data-status-note]")) return;
  const tagButton = event.target.closest("[data-tag]");
  if (tagButton) {
    event.stopPropagation();
    applyTagFilter(tagButton.dataset.tag);
    return;
  }
  const card = event.target.closest("[data-note-id]");
  if (!card) return;
  const note = state.notes.find((entry) => entry.id === card.dataset.noteId);
  if (note) fillNoteForm(note);
});

$("noteList").addEventListener("change", (event) => {
  const select = event.target.closest("[data-status-note]");
  if (!select) return;
  updateNoteStatus(select.dataset.statusNote, select.value);
});

$("noteProgressOverview").addEventListener("click", (event) => {
  const pill = event.target.closest("[data-note-filter]");
  if (!pill) return;
  const value = pill.dataset.noteFilter;
  if (value === "all") {
    $("noteFilterPublish").value = "all";
    $("noteFilterSubStatus").value = "all";
    $("noteFilterSubStatus").disabled = true;
  } else if (value === "published") {
    $("noteFilterPublish").value = "published";
    $("noteFilterSubStatus").value = "all";
    $("noteFilterSubStatus").disabled = true;
  } else {
    $("noteFilterPublish").value = "unpublished";
    $("noteFilterSubStatus").disabled = false;
    $("noteFilterSubStatus").value = value === "unpublished" ? "all" : value;
  }
  renderNotes();
  showToast(`已切换筛选：${pill.textContent.trim().replace(/\s+/g, " ")}`);
});

$("typeHistoryList").addEventListener("click", (event) => {
  if (event.target.closest("input, textarea, select, button, label")) return;
  const tagButton = event.target.closest("[data-tag]");
  if (tagButton) {
    $("typeTagFilter").value = tagButton.dataset.tag;
    renderTypes();
    return;
  }
  const card = event.target.closest("[data-note-id]");
  if (!card) return;
  const note = state.notes.find((entry) => entry.id === card.dataset.noteId);
  if (note) fillNoteForm(note);
});

$("typeHistoryList").addEventListener("change", (event) => {
  const select = event.target.closest("[data-status-note]");
  if (!select) return;
  updateNoteStatus(select.dataset.statusNote, select.value);
});

$("resetClientForm").addEventListener("click", () => openClientModal());
$("closeClientModal").addEventListener("click", closeClientModal);
$("cancelClientEdit").addEventListener("click", closeClientModal);
$("clientModal").addEventListener("click", (event) => {
  if (event.target.id === "clientModal") closeClientModal();
});
$("resetNoteForm").addEventListener("click", () => fillNoteForm());
$("noteDate").addEventListener("change", () => {
  if (!$("notePlanMonth").value) $("notePlanMonth").value = planMonthFromDate($("noteDate").value);
});
$("noteImage").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const image = await readImageFile(file);
  setImagePreview("noteImagePreview", image, "暂无参考图片");
});

$("deleteClient").addEventListener("click", () => {
  if (!selectedClientId) return showToast("请选择客户");
  const client = clientById(selectedClientId);
  if (!client || !confirm(`删除 ${client.name} 及其笔记？`)) return;
  state.clients = state.clients.filter((entry) => entry.id !== selectedClientId);
  state.notes = state.notes.filter((entry) => entry.clientId !== selectedClientId);
  selectedClientId = "";
  saveState();
  fillClientForm();
  closeClientModal();
  render();
  showToast("客户已删除");
});

$("deleteNote").addEventListener("click", () => {
  if (!selectedNoteId) return showToast("请选择笔记");
  if (!confirm("删除这篇笔记？")) return;
  state.notes = state.notes.filter((entry) => entry.id !== selectedNoteId);
  selectedNoteId = "";
  saveState();
  fillNoteForm();
  render();
  showToast("笔记已删除");
});

$("planClientFilter").addEventListener("change", renderPlans);
$("planMonthFilter").addEventListener("change", renderPlans);
document.getElementById("designClientFilter")?.addEventListener("change", renderDesignRequests);
document.getElementById("designMonthFilter")?.addEventListener("change", renderDesignRequests);
$("typeTagFilter").addEventListener("change", renderTypes);
$("typeClientFilter").addEventListener("change", renderTypes);
$("typeHistoryList").addEventListener("change", handleNoteLinkChange);
$("noteFilterClient").addEventListener("change", renderNotes);
$("noteFilterMonth").addEventListener("change", renderNotes);
$("noteFilterKind").addEventListener("change", renderNotes);
$("noteFilterPublish").addEventListener("change", () => {
  const unpublished = $("noteFilterPublish").value === "unpublished";
  $("noteFilterSubStatus").disabled = !unpublished;
  if (!unpublished) $("noteFilterSubStatus").value = "all";
  renderNotes();
});
$("noteFilterSubStatus").addEventListener("change", renderNotes);
$("noteFilterTag").addEventListener("change", () => {
  selectedTag = $("noteFilterTag").value;
  renderNotes();
});
$("noteList").addEventListener("change", handleNoteLinkChange);
$("dayCalendarJump").addEventListener("click", () => {
  $("dayCalendarSection").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("dayCalendarMonth").addEventListener("change", renderDayMonthBoard);

$("dayMonthBoard").addEventListener("click", (event) => {
  const cell = event.target.closest("[data-day-calendar-date]");
  if (!cell) return;
  selectedDayCalendarDate = cell.dataset.dayCalendarDate;
  renderDayMonthBoard();
  $("dayCalendarDayEditor").scrollIntoView({ behavior: "smooth", block: "nearest" });
  window.setTimeout(() => $("dayCalendarTaskText")?.focus(), 120);
});

$("closeDayCalendarDay").addEventListener("click", () => {
  selectedDayCalendarDate = "";
  renderDayCalendarDayEditor();
  renderDayMonthBoard();
});

$("dayCalendarTaskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("dayCalendarTaskText").value.trim();
  if (!text || !selectedDayCalendarDate) return;
  state.calendarTasks.push({
    id: uid("calendar_task"),
    date: selectedDayCalendarDate,
    text,
    done: false,
    createdAt: new Date().toISOString(),
  });
  $("dayCalendarTaskText").value = "";
  saveState();
  renderDayMonthBoard();
  showToast("日历任务已添加");
});

$("dayCalendarDayTaskList").addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-calendar-task-toggle]");
  if (toggle) {
    const task = state.calendarTasks.find((entry) => entry.id === toggle.dataset.calendarTaskToggle);
    if (!task) return;
    task.done = !task.done;
    saveState();
    renderDayMonthBoard();
    return;
  }
  const del = event.target.closest("[data-calendar-task-delete]");
  if (del) {
    state.calendarTasks = state.calendarTasks.filter((entry) => entry.id !== del.dataset.calendarTaskDelete);
    saveState();
    renderDayMonthBoard();
    showToast("日历任务已删除");
  }
});

$("dayCalendarDayTaskList").addEventListener("change", (event) => {
  const input = event.target.closest("[data-calendar-task-text]");
  if (!input) return;
  const task = state.calendarTasks.find((entry) => entry.id === input.dataset.calendarTaskText);
  if (!task) return;
  task.text = input.value.trim();
  saveState();
  renderDayMonthBoard();
  showToast("日历任务已保存");
});

$("brandForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const brand = collectBrandForm();
  if (!brand.name || !brand.url) return;
  upsert(state.brandRefs, brand);
  saveState();
  fillBrandForm(brand);
  renderBrands();
  showToast("品牌参考已保存");
});

$("brandList").addEventListener("click", (event) => {
  if (event.target.closest("a")) return;
  const card = event.target.closest("[data-brand-id]");
  if (card) {
    const brand = state.brandRefs.find((entry) => entry.id === card.dataset.brandId);
    if (brand) fillBrandForm(brand);
    return;
  }
});

$("resetBrandForm").addEventListener("click", () => fillBrandForm());

$("brandSearch").addEventListener("input", renderBrands);

$("deleteBrand").addEventListener("click", () => {
  const id = $("brandId").value;
  if (!id) return showToast("请选择品牌参考");
  state.brandRefs = state.brandRefs.filter((entry) => entry.id !== id);
  saveState();
  fillBrandForm();
  renderBrands();
  showToast("品牌参考已删除");
});

$("toolForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const tool = collectToolForm();
  if (!tool.title || !tool.url) return showToast("请填写工具标题和网址");
  upsert(state.toolRefs, tool);
  saveState();
  fillToolForm(tool);
  renderTools();
  showToast("工具已保存");
});

$("toolList").addEventListener("click", (event) => {
  if (event.target.closest("a")) return;
  const button = event.target.closest("[data-edit-tool]");
  const card = event.target.closest("[data-tool-id]");
  const id = button?.dataset.editTool || card?.dataset.toolId;
  if (!id) return;
  const tool = state.toolRefs.find((entry) => entry.id === id);
  if (tool) fillToolForm(tool);
});

$("resetToolForm").addEventListener("click", () => fillToolForm());

$("deleteTool").addEventListener("click", () => {
  const id = $("toolId").value;
  if (!id) return showToast("请选择工具");
  state.toolRefs = state.toolRefs.filter((entry) => entry.id !== id);
  saveState();
  fillToolForm();
  renderTools();
  showToast("工具已删除");
});

$("createMonthPlan").addEventListener("click", createMonthPlan);
$("copyToday").addEventListener("click", () => copyText(todayTextForCopy()));
$("copyDayPlans").addEventListener("click", copyDayPlanText);
$("copyWeekPlans").addEventListener("click", copyWeekPlanText);
$("copyReport").addEventListener("click", () => copyText($("reportPreview").textContent));
$("saveMailTemplate").addEventListener("click", () => {
  state.mailTemplate = $("mailTemplateEditor").value.trim() || defaultMailTemplate();
  saveState();
  showToast("每日邮件结构已保存");
});

$("globalImportClient").addEventListener("change", () => {
  const isNew = $("globalImportClient").value === "__new__";
  $("globalNewClientWrap").hidden = !isNew;
  if (isNew) window.setTimeout(() => $("globalNewClientName")?.focus(), 80);
});

$("globalNewClientName").addEventListener("change", () => {
  if ($("globalImportClient").value !== "__new__") return;
  const clientId = ensureGlobalImportClient();
  if (!clientId) return;
  saveState();
  render();
  $("globalImportClient").value = clientId;
  $("globalNewClientWrap").hidden = true;
});

$("globalPlanningImport").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  await handleGlobalPlanningImport(file);
  event.target.value = "";
});
$("copyMonthlyReport").addEventListener("click", () => copyText($("monthlyReportPreview").textContent));

document.querySelectorAll(".report-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".report-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
    $(button.dataset.reportTarget).scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

[
  "monthlyReportClient",
  "monthlyReportMonth",
  "monthlyPostCount",
  "monthlyHotPost",
  "monthlyHotRate",
  "monthlyExposure",
  "monthlyReads",
  "monthlyFans",
  "monthlyReview",
  "monthlyNextPlan",
  "monthlyBestTitle",
  "monthlyBestLink",
  "monthlyContentDirection",
  "monthlyActions",
].forEach((id) => {
  $(id).addEventListener("input", renderMonthlyReport);
  $(id).addEventListener("change", renderMonthlyReport);
});

document.querySelectorAll(".monthly-goal").forEach((input) => input.addEventListener("change", renderMonthlyReport));

$("monthlyBestImage").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const image = await readImageFile(file);
  setImagePreview("monthlyBestImagePreview", image, "暂无展示图");
  renderMonthlyReport();
});

$("showMonthlyVisual").addEventListener("click", () => {
  renderMonthlyVisual();
  $("monthlyVisual").scrollIntoView({ behavior: "smooth", block: "start" });
});

["reportClient", "reportDone", "reportPlan", "reportData"].forEach((id) => {
  $(id).addEventListener("input", renderReport);
});

$("reportClientQueue").addEventListener("click", (event) => {
  const button = event.target.closest("[data-use-report-client]");
  if (!button) return;
  $("reportClient").value = button.dataset.useReportClient;
  loadReportTemplateForClient(button.dataset.useReportClient);
  renderReport();
  showToast("已切换到该客户周报");
});

function loadReportTemplateForClient(clientId) {
  const template = state.reportTemplates[clientId];
  if (!template) return;
  $("reportDone").value = template.done || "";
  $("reportPlan").value = template.plan || "";
  $("reportData").value = template.data || "";
}

$("saveReportTemplate").addEventListener("click", () => {
  const clientId = $("reportClient").value;
  if (!clientId) return showToast("请先选择客户");
  state.reportTemplates[clientId] = {
    done: $("reportDone").value,
    plan: $("reportPlan").value,
    data: $("reportData").value,
    updatedAt: new Date().toISOString(),
  };
  saveState();
  showToast("周报模板已保存");
});

$("clearReportTemplate").addEventListener("click", () => {
  $("reportDone").value = "";
  $("reportPlan").value = "";
  $("reportData").value = "";
  renderReport();
  showToast("已切换为空白周报模板");
});

$("loadReportTemplate").addEventListener("click", () => {
  const clientId = $("reportClient").value;
  if (!clientId || !state.reportTemplates[clientId]) return showToast("该客户暂无模板");
  loadReportTemplateForClient(clientId);
  renderReport();
  showToast("已载入上次模板");
});

$("exportJson").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `小红书运营台账-${dateValue(today)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

$("importJson").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported.clients) || !Array.isArray(imported.notes)) {
        throw new Error("invalid");
      }
      state = normalizeState(imported);
      saveState();
      render();
      showToast("数据已导入");
    } catch {
      showToast("导入失败，文件格式不对");
    }
  };
  reader.readAsText(file);
});

$("seedDemo").addEventListener("click", seedDemo);

$("clearAll").addEventListener("click", () => {
  if (!confirm("确定清空全部客户和笔记？")) return;
  state.clients = [];
  state.notes = [];
  state.calendars = [];
  state.calendarTasks = [];
  state.taskActions = {};
  state.taskOverrides = {};
  state.customTasks = [];
  state.dayPlans = [];
  state.weekPlans = [];
  state.brandRefs = [];
  state.toolRefs = [];
  state.reportTemplates = {};
  state.progressOverrides = {};
  state.plannedOverrides = {};
  state.dashboardMetricOverrides = {};
  state.mailTemplate = defaultMailTemplate();
  saveState();
  fillClientForm();
  fillNoteForm();
  render();
  showToast("已清空");
});

async function init() {
  loadUiState();
  applyUiState();
  state = await loadState();
  if (state.clients.length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state, null, 2));
  }
  fillClientForm();
  fillNoteForm();
  fillBrandForm();
  fillToolForm();
  render();
}

init();
