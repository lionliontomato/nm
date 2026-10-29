(() => {
  "use strict";
  // 指定的 Google 試算表；每次載入都加入時間戳，避免沿用舊回應。
  const SHEET_ID = "18Di64_ylwV6ZlyB_siNu9j7xxImIfr1_QBGTrrRSmos";
  const SHEET_GID = "0";
  const DEFAULT_HEADERS = ["存鑽老闆", "存鑽數量", "存歌數量", "存爆數量", "總數"];
  const DEFAULT_TITLE = "年年の存鑽存歌";
  const DEFAULT_SUBTITLE = "";
  const LABEL_COLUMN_INDEX = 11; // L 欄：設定項目名稱，用來區分主標題／小標題
  const VALUE_COLUMN_INDEX = 12; // M 欄：實際顯示的文字，主標題與小標題都從這裡讀取
  const COLUMN_CLASSES = ["col-name", "col-diamond", "col-song", "col-bomb", "col-total"];
  const fmt = new Intl.NumberFormat("zh-Hant-TW");
  const $ = (selector) => document.querySelector(selector);
  let headers = [...DEFAULT_HEADERS];
  let records = [];
  let refreshSequence = 0;
  let refreshInProgress = false;

  function normalize(value) { return String(value ?? "").trim().toLocaleLowerCase("zh-Hant-TW"); }
  function isConfigLabel(value, kind) {
    const text = normalize(value).replace(/[\s：:（）()]/g, "");
    const labels = kind === "title"
      ? ["網站標題", "網頁標題", "標題", "sitetitle", "websitetitle", "title"]
      : ["網站小標題", "網頁小標題", "小標題", "副標題", "網站副標題", "sitesubtitle", "websitesubtitle", "subtitle"];
    return labels.includes(text);
  }
  function applySiteCopy(rows) {
    // 僅修正主標題／小標題讀取。試算表設定欄位為 L=項目名稱、M=顯示文字。
    // 優先讀取固定設定欄，並用正確的空白／標點正規化；重複設定取最後一筆。
    let title = null;
    let subtitle = null;
    const normalizeLabel = value => normalize(value).replace(/[\s：:（）()_\-]/g, "");
    const titleLabels = new Set([
      "網站標題", "網頁標題", "主標題", "網站主標題", "網站名稱",
      "網頁名稱", "標題", "sitetitle", "websitetitle", "maintitle", "title"
    ]);
    const subtitleLabels = new Set([
      "網站小標題", "網頁小標題", "小標題", "副標題", "網站副標題",
      "網站說明", "網頁說明", "sitesubtitle", "websitesubtitle", "subtitle", "description"
    ]);
    for (const row of rows) {
      const cells = Array.isArray(row) ? row : [];
      const configLabel = normalizeLabel(cells[LABEL_COLUMN_INDEX]);
      const configValue = String(cells[VALUE_COLUMN_INDEX] ?? "").trim();
      if (titleLabels.has(configLabel)) title = configValue;
      if (subtitleLabels.has(configLabel)) subtitle = configValue;
    }
    // 某些試算表版本若設定欄移位，再掃描相鄰儲存格作為備援。
    if (title === null || subtitle === null) {
      for (const row of rows) {
        const cells = Array.isArray(row) ? row : [];
        for (let i = 0; i < cells.length - 1; i++) {
          const label = normalizeLabel(cells[i]);
          const value = String(cells[i + 1] ?? "").trim();
          if (title === null && titleLabels.has(label)) title = value;
          if (subtitle === null && subtitleLabels.has(label)) subtitle = value;
        }
      }
    }
    const finalTitle = title !== null && title !== "" ? title : null;
    if (finalTitle !== null) {
      $("#siteTitle").textContent = finalTitle;
      document.title = finalTitle;
      $("#siteTitle").classList.remove("sheet-copy-pending");
    }
    if (subtitle !== null) {
      $("#siteSubtitle").textContent = subtitle;
      $("#siteSubtitle").classList.remove("sheet-copy-pending");
    }
  }
  function toValue(value) {
    const cleaned = String(value ?? "").replace(/,/g, "").trim();
    if (!cleaned) return "";
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : cleaned;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function gvizRows(table) {
    if (!table || !Array.isArray(table.rows)) return [];
    return table.rows.map(row => (row.c || []).map(cell => cell ? (cell.v ?? cell.f ?? "") : ""))
      .filter(row => row.some(cell => String(cell ?? "").trim() !== ""));
  }
  function loadViaJsonp() {
    return new Promise((resolve, reject) => {
      const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const callback = "__nianNianSheet_" + nonce.replace(/[^a-zA-Z0-9_$]/g, "");
      const script = document.createElement("script");
      let finished = false;
      const cleanup = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        script.remove();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Google 試算表 JSONP 讀取逾時"));
      }, 15000);
      window[callback] = response => {
        if (finished) return;
        if (!response || response.status === "error") {
          const message = response?.errors?.[0]?.detailed_message || "Google 試算表回傳錯誤";
          cleanup();
          reject(new Error(message));
          return;
        }
        const rows = gvizRows(response.table);
        cleanup();
        if (!rows.length) reject(new Error("Google 試算表沒有可顯示的資料"));
        else resolve(rows);
      };
      // Use only the documented JSONP parameters; cache busting is outside tqx.
      const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
      url.searchParams.set("gid", SHEET_GID);
      url.searchParams.set("headers", "0");
      url.searchParams.set("tq", "select *");
      url.searchParams.set("tqx", `out:json;responseHandler:${callback}`);
      url.searchParams.set("_", nonce);
      script.src = url.toString();
      script.onerror = () => {
        cleanup();
        reject(new Error("無法連線至 Google 試算表 JSONP 端點"));
      };
      document.head.appendChild(script);
    });
  }

  function parseCsv(text) {
    const rows = []; let row = []; let cell = ""; let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1];
      if (ch === '"' && quoted && next === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && next === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    row.push(cell); rows.push(row);
    return rows.filter(r => r.some(c => String(c).trim() !== ""));
  }
  async function loadViaCsv() {
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const urls = [
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${SHEET_GID}&headers=0&tqx=out%3Acsv&tq=select%20*&_=${nonce}`,
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}&_=${nonce}`
    ];
    let lastError;
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "omit",
          headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        // Google may redirect an inaccessible sheet to a sign-in HTML page.
        if (/^\s*<!doctype html|^\s*<html/i.test(text)) {
          throw new Error("Google 試算表回傳登入頁，請確認分享權限");
        }
        const rows = parseCsv(text);
        if (rows.length && rows.some(row => String(row[0] ?? "").trim() !== "")) return rows;
        throw new Error("Google 試算表回傳空資料");
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("CSV 讀取失敗");
  }
  async function loadRows() {
    // Prefer a fresh CSV response because it is straightforward to parse and avoids JSONP callback caching quirks.
    try { return await loadViaCsv(); }
    catch (csvError) {
      console.warn("Google 試算表 CSV 讀取失敗，改用 JSONP。", csvError);
      try { return await loadViaJsonp(); }
      catch (jsonError) {
        throw new Error(`Google 試算表讀取失敗。CSV：${csvError.message}；JSONP：${jsonError.message}`);
      }
    }
  }
  async function loadSheetData() {
    const rows = await loadRows();
    if (rows.length < 2) throw new Error("試算表沒有可顯示的資料");
    applySiteCopy(rows);
    headers = rows[0].slice(0, 5).map((value, i) => String(value || DEFAULT_HEADERS[i] || "").trim());
    if (headers.length < 5 || headers.some(v => !v)) headers = [...DEFAULT_HEADERS];
    records = rows.slice(1).map(row => {
      const item = {};
      headers.forEach((header, index) => { item[header] = index === 0 ? String(row[index] ?? "").trim() : toValue(row[index]); });
      return item;
    }).filter(item => String(item[headers[0]] ?? "").trim() !== "");
  }
  function renderTable(items) {
    $("#tableHead").innerHTML = headers.map((header, i) => `<th class="${COLUMN_CLASSES[i] || ""}" scope="col">${escapeHtml(header)}</th>`).join("");
    const body = $("#tableBody");
    if (!items.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="${headers.length}">沒有符合條件的資料，請試試其他關鍵字。</td></tr>`;
      return;
    }
    body.innerHTML = items.map(item => `<tr>${headers.map((header, index) => {
      const value = item[header];
      const display = typeof value === "number" ? fmt.format(value) : escapeHtml(value);
      return `<td class="${index === 0 ? "name-cell" : ""}">${display}</td>`;
    }).join("")}</tr>`).join("");
  }
  function filterRecords() {
    const keyword = $("#searchInput").value.trim();
    const key = normalize(keyword);
    const filtered = !key ? records : records.filter(item => normalize(item[headers[0]]).includes(key));
    renderTable(filtered);
    $("#resultText").textContent = keyword ? `搜尋「${keyword}」：找到 ${filtered.length} 筆資料。` : `目前顯示 ${filtered.length} 筆資料。`;
  }
  async function refreshData() {
    // 不允許多個請求同時競爭，避免較慢的舊回應覆蓋較新的資料。
    if (refreshInProgress) return;
    refreshInProgress = true;
    const thisSequence = ++refreshSequence;
    const status = $("#resultText");

    // 不清空已顯示的標題／資料；重新整理期間不顯示「正在讀取」或短暫退回舊預設文案。
    // 首次載入時標題區由 CSS 暫時隱藏，直到最新試算表資料成功套用。
    status.textContent = "資料載入中…";

    try {
      await loadSheetData();
      if (thisSequence !== refreshSequence) return;
      filterRecords();
    } catch (error) {
      console.error(error);
      if (thisSequence !== refreshSequence) return;
      records = [];
      renderTable([]);
      // 首次載入失敗時使用品牌預設標題，不顯示舊小標題或「正在讀取」文字。
      // 若試算表讀取失敗，主標題維持隱藏，不顯示 HTML 內的舊預設文字。
      $("#siteTitle").classList.add("sheet-copy-pending");
      $("#siteSubtitle").classList.add("sheet-copy-pending");
      status.textContent = "資料載入失敗：請確認試算表分享權限及工作表資料。";
    } finally {
      if (thisSequence === refreshSequence) refreshInProgress = false;
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("#searchInput").addEventListener("input", filterRecords);
    $("#clearBtn").addEventListener("click", () => { $("#searchInput").value = ""; filterRecords(); $("#searchInput").focus(); });
    refreshData();
    // 頁面開啟期間每 5 分鐘重新向試算表取得資料；不是讀取本機舊資料。
    window.setInterval(() => { if (!document.hidden) refreshData(); }, 5 * 60 * 1000);
  });
})();
