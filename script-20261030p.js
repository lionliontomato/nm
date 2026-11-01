
(() => {
  "use strict";

  // Google 試算表資料來源
  const SHEET_ID = "18Di64_ylwV6ZlyB_siNu9j7xxImIfr1_QBGTrrRSmos";
  const SHEET_GID = "0";

  // 網頁顯示 A、B、C、E、F
  // D 欄存爆數量仍保留在試算表，不顯示於網站
  const SOURCE_COLUMNS = [0, 1, 2, 4, 5];

  const DEFAULT_HEADERS = [
    "存鑽老闆",
    "存鑽數量",
    "存歌數量",
    "總數",
    "更新時間"
  ];

  const DEFAULT_TITLE = "年年の存鑽存歌";
  const DEFAULT_SUBTITLE = "";

  // 網站標題設定：L 欄設定名稱、M 欄設定內容
  const LABEL_COLUMN_INDEX = 11;
  const VALUE_COLUMN_INDEX = 12;

  const COLUMN_CLASSES = [
    "col-name",
    "col-diamond",
    "col-song",
    "col-total",
    "col-updated"
  ];

  const fmt = new Intl.NumberFormat("zh-Hant-TW");
  const $ = (selector) => document.querySelector(selector);

  let headers = [...DEFAULT_HEADERS];
  let records = [];
  let refreshSequence = 0;
  let refreshInProgress = false;

  function normalize(value) {
    return String(value ?? "")
      .trim()
      .toLocaleLowerCase("zh-Hant-TW");
  }

  function isConfigLabel(value, kind) {
    const text = normalize(value).replace(/[\s：:（）()]/g, "");

    const labels = kind === "title"
      ? [
          "網站標題",
          "網頁標題",
          "標題",
          "sitetitle",
          "websitetitle",
          "title"
        ]
      : [
          "網站小標題",
          "網頁小標題",
          "小標題",
          "副標題",
          "網站副標題",
          "sitesubtitle",
          "websitesubtitle",
          "subtitle"
        ];

    return labels.includes(text);
  }

  // 從試算表讀取網站標題與小標題
  function applySiteCopy(rows) {
    let title = null;
    let subtitle = null;

    const normalizeLabel = value =>
      normalize(value).replace(/[\s：:（）()_\-]/g, "");

    const titleLabels = new Set([
      "網站標題",
      "網頁標題",
      "主標題",
      "網站主標題",
      "網站名稱",
      "網頁名稱",
      "標題",
      "sitetitle",
      "websitetitle",
      "maintitle",
      "title"
    ]);

    const subtitleLabels = new Set([
      "網站小標題",
      "網頁小標題",
      "小標題",
      "副標題",
      "網站副標題",
      "網站說明",
      "網頁說明",
      "sitesubtitle",
      "websitesubtitle",
      "subtitle",
      "description"
    ]);

    for (const row of rows) {
      const cells = Array.isArray(row) ? row : [];

      const configLabel = normalizeLabel(
        cells[LABEL_COLUMN_INDEX]
      );

      const configValue = String(
        cells[VALUE_COLUMN_INDEX] ?? ""
      ).trim();

      if (titleLabels.has(configLabel)) {
        title = configValue;
      }

      if (subtitleLabels.has(configLabel)) {
        subtitle = configValue;
      }
    }

    // 設定欄移位時的備援搜尋
    if (title === null || subtitle === null) {
      for (const row of rows) {
        const cells = Array.isArray(row) ? row : [];

        for (let i = 0; i < cells.length - 1; i++) {
          const label = normalizeLabel(cells[i]);
          const value = String(cells[i + 1] ?? "").trim();

          if (title === null && titleLabels.has(label)) {
            title = value;
          }

          if (
            subtitle === null &&
            subtitleLabels.has(label)
          ) {
            subtitle = value;
          }
        }
      }
    }

    const finalTitle =
      title !== null && title !== "" ? title : null;

    if (finalTitle !== null) {
      $("#siteTitle").textContent = finalTitle;
      document.title = finalTitle;

      $("#siteTitle").classList.remove(
        "sheet-copy-pending"
      );
    }

    if (subtitle !== null) {
      $("#siteSubtitle").textContent = subtitle;

      $("#siteSubtitle").classList.remove(
        "sheet-copy-pending"
      );
    }
  }

  // 數字轉換
  function toValue(value) {
    const cleaned = String(value ?? "")
      .replace(/,/g, "")
      .trim();

    if (!cleaned) return "";

    const number = Number(cleaned);

    return Number.isFinite(number)
      ? number
      : cleaned;
  }

  // 更新時間保持試算表原有日期格式
  function toUpdateTime(value) {
    const text = String(value ?? "").trim();

    const match =
      /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/.exec(text);

    if (!match) return text;

    const pad = number =>
      String(number).padStart(2, "0");

    const day =
      `${match[1]}/${pad(Number(match[2]) + 1)}/${pad(match[3])}`;

    if (match[4] === undefined) {
      return day;
    }

    return (
      `${day} ${pad(match[4])}:${pad(match[5])}:${pad(match[6])}`
    );
  }

  // 避免試算表文字影響 HTML
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 解析 Google Sheets JSONP 資料
  function gvizRows(table) {
    if (!table || !Array.isArray(table.rows)) {
      return [];
    }

    return table.rows
      .map(row =>
        (row.c || []).map((cell, index) => {
          if (!cell) return "";

          // F 欄日期優先使用試算表格式化後文字
          if (index === 5) {
            return cell.f ?? cell.v ?? "";
          }

          return cell.v ?? cell.f ?? "";
        })
      )
      .filter(row =>
        row.some(
          cell => String(cell ?? "").trim() !== ""
        )
      );
  }

  // JSONP 備援讀取
  function loadViaJsonp() {
    return new Promise((resolve, reject) => {
      const nonce =
        `${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const callback =
        "__nianNianSheet_" +
        nonce.replace(/[^a-zA-Z0-9_$]/g, "");

      const script = document.createElement("script");

      let finished = false;

      const cleanup = () => {
        if (finished) return;

        finished = true;
        clearTimeout(timer);

        try {
          delete window[callback];
        } catch (_) {
          window[callback] = undefined;
        }

        script.remove();
      };

      const timer = setTimeout(() => {
        cleanup();

        reject(
          new Error("Google 試算表 JSONP 讀取逾時")
        );
      }, 15000);

      window[callback] = response => {
        if (finished) return;

        if (
          !response ||
          response.status === "error"
        ) {
          const message =
            response?.errors?.[0]?.detailed_message ||
            "Google 試算表回傳錯誤";

          cleanup();
          reject(new Error(message));
          return;
        }

        const rows = gvizRows(response.table);

        cleanup();

        if (!rows.length) {
          reject(
            new Error("Google 試算表沒有可顯示的資料")
          );
        } else {
          resolve(rows);
        }
      };

      const url = new URL(
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`
      );

      url.searchParams.set("gid", SHEET_GID);
      url.searchParams.set("headers", "0");
      url.searchParams.set("tq", "select *");
      url.searchParams.set(
        "tqx",
        `out:json;responseHandler:${callback}`
      );
      url.searchParams.set("_", nonce);

      script.src = url.toString();

      script.onerror = () => {
        cleanup();

        reject(
          new Error(
            "無法連線至 Google 試算表 JSONP 端點"
          )
        );
      };

      document.head.appendChild(script);
    });
  }

  // CSV 解析
  function parseCsv(text) {
    const rows = [];

    let row = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (
        ch === '"' &&
        quoted &&
        next === '"'
      ) {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if (
        (ch === "\n" || ch === "\r") &&
        !quoted
      ) {
        if (ch === "\r" && next === "\n") {
          i++;
        }

        row.push(cell);
        rows.push(row);

        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }

    row.push(cell);
    rows.push(row);

    return rows.filter(
      r => r.some(
        c => String(c).trim() !== ""
      )
    );
  }

  // 從 Google 試算表取得最新 CSV
  async function loadViaCsv() {
    const nonce =
      `${Date.now()}_${Math.random().toString(36).slice(2)}`;

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
          headers: {
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
          }
        });

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const text = await response.text();

        if (
          /^\s*<!doctype html|^\s*<html/i.test(text)
        ) {
          throw new Error(
            "Google 試算表回傳登入頁，請確認分享權限"
          );
        }

        const rows = parseCsv(text);

        if (
          rows.length &&
          rows.some(
            row => String(row[0] ?? "").trim() !== ""
          )
        ) {
          return rows;
        }

        throw new Error(
          "Google 試算表回傳空資料"
        );
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error(
      "CSV 讀取失敗"
    );
  }

  async function loadRows() {
    try {
      return await loadViaCsv();
    } catch (csvError) {
      console.warn(
        "Google 試算表 CSV 讀取失敗，改用 JSONP。",
        csvError
      );

      try {
        return await loadViaJsonp();
      } catch (jsonError) {
        throw new Error(
          `Google 試算表讀取失敗。CSV：${csvError.message}；JSONP：${jsonError.message}`
        );
      }
    }
  }

  // 讀取資料並重新安排表格欄位
  async function loadSheetData() {
    const rows = await loadRows();

    if (rows.length < 2) {
      throw new Error(
        "試算表沒有可顯示的資料"
      );
    }

    applySiteCopy(rows);

    // 顯示 A、B、C、E、F 五個欄位
    // 跳過 D 欄存爆數量
    headers = SOURCE_COLUMNS.map(
      (sourceIndex, index) =>
        String(
          rows[0][sourceIndex] ||
          DEFAULT_HEADERS[index]
        ).trim()
    );

    if (headers.some(value => !value)) {
      headers = [...DEFAULT_HEADERS];
    }

    records = rows.slice(1)
      .map(row => {
        const item = {};

        headers.forEach((header, index) => {
          const sourceIndex = SOURCE_COLUMNS[index];
          const value = row[sourceIndex];

          if (index === 0) {
            item[header] =
              String(value ?? "").trim();
          } else if (sourceIndex === 5) {
            item[header] = toUpdateTime(value);
          } else {
            item[header] = toValue(value);
          }
        });

        return item;
      })
      .filter(
        item =>
          String(
            item[headers[0]] ?? ""
          ).trim() !== ""
      );
  }

  // 產生表格畫面
  function renderTable(items) {
    $("#tableHead").innerHTML = headers
      .map(
        (header, index) =>
          `<th class="${COLUMN_CLASSES[index] || ""}" scope="col">${escapeHtml(header)}</th>`
      )
      .join("");

    const body = $("#tableBody");

    if (!items.length) {
      body.innerHTML =
        `<tr class="empty-row"><td colspan="${headers.length}">沒有符合條件的資料，請試試其他關鍵字。</td></tr>`;

      return;
    }

    body.innerHTML = items.map(item => {
      const cells = headers.map(
        (header, index) => {
          const value = item[header];

          const display =
            typeof value === "number"
              ? fmt.format(value)
              : escapeHtml(value);

          const cellClass =
            index === 0
              ? "name-cell"
              : index === 4
                ? "updated-cell"
                : "";

          return (
            `<td class="${cellClass}">${display}</td>`
          );
        }
      ).join("");

      return `<tr>${cells}</tr>`;
    }).join("");
  }

  // 搜尋功能
  function filterRecords() {
    const keyword =
      $("#searchInput").value.trim();

    const key = normalize(keyword);

    const filtered = !key
      ? records
      : records.filter(
          item =>
            normalize(
              item[headers[0]]
            ).includes(key)
        );

    renderTable(filtered);

    $("#resultText").textContent =
      keyword
        ? `搜尋「${keyword}」：找到 ${filtered.length} 筆資料。`
        : `目前顯示 ${filtered.length} 筆資料。`;
  }

  // 定時向試算表同步最新資料
  async function refreshData() {
    if (refreshInProgress) return;

    refreshInProgress = true;

    const thisSequence =
      ++refreshSequence;

    const status = $("#resultText");

    status.textContent = "資料載入中…";

    try {
      await loadSheetData();

      if (
        thisSequence !== refreshSequence
      ) {
        return;
      }

      filterRecords();
    } catch (error) {
      console.error(error);

      if (
        thisSequence !== refreshSequence
      ) {
        return;
      }

      records = [];
      renderTable([]);

      $("#siteTitle").classList.add(
        "sheet-copy-pending"
      );

      $("#siteSubtitle").classList.add(
        "sheet-copy-pending"
      );

      status.textContent =
        "資料載入失敗：請確認試算表分享權限及工作表資料。";
    } finally {
      if (
        thisSequence === refreshSequence
      ) {
        refreshInProgress = false;
      }
    }
  }

  // 網頁初始化
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      $("#searchInput").addEventListener(
        "input",
        filterRecords
      );

      $("#clearBtn").addEventListener(
        "click",
        () => {
          $("#searchInput").value = "";
          filterRecords();
          $("#searchInput").focus();
        }
      );

      refreshData();

      // 每五分鐘向 Google 試算表取得最新資料
      window.setInterval(() => {
        if (!document.hidden) {
          refreshData();
        }
      }, 5 * 60 * 1000);
    }
  );
})();
