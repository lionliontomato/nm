年年の存鑽存歌｜GitHub Pages 網站包（修正版）

本包是以原範例網站的實際結構與功能為基礎重建：天空藍系的半透明卡片、置中主標、搜尋列、資料表格、欄位分色、浮動裝飾、頁尾及著作權頁皆保留；背景換成原創鯨魚／魚群／卡帶插畫。

檔案
- index.html：首頁
- style.css：樣式與響應式版面
- script.js：Google 試算表讀取、搜尋、清除
- copyright.html：著作權聲明頁
- assets/background-whales-cassette.png：新背景插畫
- assets/fish.svg：魚形 favicon
- .nojekyll：GitHub Pages 靜態檔案設定

試算表 ID
18Di64_ylwV6ZlyB_siNu9j7xxImIfr1_QBGTrrRSmos
讀取第一個工作表（gid=0）的 A～E 欄作為資料表，並讀取 L 欄的網站標題、M 欄的網站小標題（若第一列是欄位名稱，會略過名稱並取後續內容）。若實際資料工作表不是第一個工作表，請將 script.js 的 SHEET_GID 改成該工作表的 gid。

部署
1. 解壓縮 ZIP。
2. 將 index.html、style.css、script.js、copyright.html、.nojekyll 與 assets 資料夾內檔案上傳到 GitHub repository 根目錄。
3. Repository → Settings → Pages。
4. 選擇 Deploy from a branch，Branch 選 main，資料夾選 /(root)，儲存。
5. 等待 GitHub Pages 部署完成後開啟網站。

最新資料與快取
- 每次讀取 Google 試算表都附帶時間戳，並優先使用 JSONP，失敗時嘗試 CSV。L 欄只用來區分設定項目（主標題／小標題），M 欄提供實際顯示文字；網站主標題與小標題都讀取 M 欄對應的值。
- 網站標題由 L 欄讀取，小標題由 M 欄讀取；每次成功取得最新資料時同步更新頁面標題。
- 每次重新讀取前會清空上一輪資料，避免新資料讀取失敗時繼續顯示舊資料。
- 頁面開啟期間每 5 分鐘重新抓取一次資料。
- HTML 設有 no-cache meta、CSS/JS 使用版本化 URL，且不使用 Service Worker，避免舊 Service Worker 持續提供舊版。
- GitHub Pages/CDN 的快取行為並非完全由前端控制。網站程式更新後，若仍看到舊版，請確認 Pages 部署成功並以 Ctrl+F5 或無痕視窗測試。

Google 試算表必須允許「知道連結的使用者」以檢視者身分存取，網站才能讀取內容。這份包尚未能在使用者的 Google 權限下實測資料載入，部署後請確認資料能正常顯示。


最新資料讀取補強（本版）
- JSONP 與 CSV 每次請求都使用時間戳＋隨機值作為 cache-busting query，避免瀏覽器/CDN 重用同一個請求網址。
- 同時只允許一個更新請求執行，避免慢回應覆蓋新回應。
- HTML 的 CSS/JS 版本參數已更新，部署後瀏覽器會請求新檔案。
注意：Google 試算表服務端若尚未完成儲存/同步，前端無法強迫尚未發布的資料立即可見；請先確認試算表編輯已完成儲存。


標題更新補強（本版）
- L 欄用來辨識設定項目，M 欄提供主標題／小標題實際文字。
- 同一標籤若有多列，改採第一筆明確設定，避免後方舊紀錄覆蓋目前設定。
- Google 試算表 JSONP 讀取失敗時，使用全新隨機網址重試一次，再使用 CSV 備援。
- 已更新 JS/CSS 版本參數，讓瀏覽器取得新版程式。


試算表連線修正（本版）
- 先以 Google Visualization CSV 端點讀取，使用 cache: no-store、Cache-Control/Pragma no-cache，並加上全新隨機查詢參數。
- CSV 無法讀取時才改用標準 JSONP；JSONP 的 tqx 只使用 out:json 與 responseHandler，移除非必要的 reqId 參數。
- L 欄只作設定標籤，M 欄是實際顯示值；依 L 欄標籤分別更新網站主標題與小標題。
- 若 Google Sheet 權限不允許公開讀取，頁面仍無法取得資料，請確認「知道連結的使用者」具有檢視權限。


第四次修正（2026-10-30，還原範例網站相近字體與天空藍配色）
- 還原原始 CSS 的字體設定：Noto Sans TC 作為主要介面字體，Noto Serif TC 用於標題層級，避免上一版系統字體造成字型風格改變。
- 還原原始天空藍／白色系、文字色與卡片配色，避免字體修正連帶改變視覺風格。
- 使用 style-20261030m.css 與 script-20261030m.js 新檔名；index.html 已引用對應版本。
- 保留不顯示「正在讀取最新標題」及重新整理期間不重設標題的邏輯。
- 提醒：Google Fonts 需可連線才能載入 Noto 字體；若網路阻擋 Google Fonts，瀏覽器會使用 CSS 備援字體。


主標題來源單點修正（2026-10-30）
- 僅修改主標題／小標題的試算表讀取邏輯；沒有修改 CSS、顏色、字體、版面或其他功能。
- 不再假設設定一定位於 L/M 欄；會在每一列掃描所有欄位，找到標題設定標籤後讀取右側儲存格。
- 同一設定有多筆時，採用工作表中最後一筆。
- 新版 JavaScript 使用 script-20261030n.js，避免瀏覽器沿用舊程式。
