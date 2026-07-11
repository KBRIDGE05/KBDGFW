(() => {
  'use strict';

  const DATA_URL = 'data/ocean-freight.xlsx';
  const DATA_VERSION = '20260711';
  const XLSX_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  let xlsxPromise;
  const STORAGE_KEY = 'kbridgeOceanFreightPreviewV1';
  const ADMIN_PARAM = 'rateAdmin';

  const adminPanel = document.getElementById('oceanRateAdmin');
  const fileInput = document.getElementById('oceanRateFile');
  const resetButton = document.getElementById('oceanRateReset');
  const statusEl = document.getElementById('oceanRateStatus');

  const isAdminPreview = () => {
    const params = new URLSearchParams(location.search);
    return params.get(ADMIN_PARAM) === '1' || location.hash === '#rate-admin';
  };

  const setStatus = (message, type = '') => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('is-success', type === 'success');
    statusEl.classList.toggle('is-error', type === 'error');
  };

  const cleanHeader = value => String(value ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();

  const aliases = {
    active: ['사용여부', '활성', 'active', 'use'],
    region: ['권역', '지역', 'region'],
    label: ['도착포트한글', '포트한글', '한글명', 'label'],
    value: ['도착포트영문', '포트영문', '영문명', 'value', 'port'],
    fcl20: ['20ftusd', 'fcl20', '20ft', '20gp'],
    fcl40: ['40ftusd', 'fcl40', '40ft', '40gp', '40hq'],
    order: ['정렬순서', '순서', 'sort', 'order']
  };

  const normalizedAliases = Object.fromEntries(
    Object.entries(aliases).map(([key, list]) => [key, list.map(cleanHeader)])
  );

  const getField = (row, field) => {
    const keys = Object.keys(row);
    const matched = keys.find(key => normalizedAliases[field].includes(cleanHeader(key)));
    return matched ? row[matched] : '';
  };

  const parseNumber = value => {
    const parsed = Number(String(value ?? '').replace(/[$,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const isActive = value => {
    const normalized = String(value ?? 'Y').trim().toUpperCase();
    return !['N', 'NO', 'FALSE', '0', '미사용', '비활성'].includes(normalized);
  };

  const rowsToData = rows => {
    const regionOrder = [];
    const grouped = {};
    const seen = new Set();

    rows.forEach((row, rowIndex) => {
      if (!isActive(getField(row, 'active'))) return;
      const region = String(getField(row, 'region') ?? '').trim();
      const label = String(getField(row, 'label') ?? '').trim();
      const value = String(getField(row, 'value') ?? '').trim();
      const fcl20 = parseNumber(getField(row, 'fcl20'));
      const fcl40 = parseNumber(getField(row, 'fcl40'));
      const orderValue = parseNumber(getField(row, 'order'));

      if (!region || !label || !value || !Number.isFinite(fcl20) || !Number.isFinite(fcl40)) return;
      const dedupeKey = `${region}::${value}`.toLowerCase();
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      if (!grouped[region]) {
        grouped[region] = [];
        regionOrder.push(region);
      }
      grouped[region].push({
        label,
        value,
        FCL20: fcl20,
        FCL40: fcl40,
        __order: Number.isFinite(orderValue) ? orderValue : rowIndex + 1
      });
    });

    const result = {};
    regionOrder.forEach(region => {
      result[region] = grouped[region]
        .sort((a, b) => a.__order - b.__order)
        .map(({ __order, ...item }) => item);
    });
    return result;
  };

  const ensureXlsx = () => {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = XLSX_URL;
      script.async = true;
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('엑셀 처리 모듈 초기화에 실패했습니다.'));
      script.onerror = () => reject(new Error('엑셀 처리 모듈을 불러오지 못했습니다.'));
      document.head.appendChild(script);
    });
    return xlsxPromise;
  };

  const workbookToData = arrayBuffer => {
    if (!window.XLSX) throw new Error('엑셀 처리 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    const workbook = window.XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames.includes('해상운임') ? '해상운임' : workbook.SheetNames[0];
    if (!sheetName) throw new Error('엑셀 시트를 찾을 수 없습니다.');
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    const data = rowsToData(rows);
    const portCount = Object.values(data).reduce((sum, ports) => sum + ports.length, 0);
    if (!portCount) throw new Error('반영 가능한 운임 행이 없습니다. 열 제목과 입력값을 확인해 주세요.');
    return { data, portCount, regionCount: Object.keys(data).length };
  };

  const applyResult = (result, source) => {
    const applied = window.applyOceanFreightData?.(result.data, {
      source,
      portCount: result.portCount,
      regionCount: result.regionCount,
      loadedAt: new Date().toISOString()
    });
    if (!applied) throw new Error('웹페이지 운임 데이터 적용에 실패했습니다.');
    setStatus(`${result.regionCount}개 권역 · ${result.portCount}개 포트가 적용되었습니다.`, 'success');
  };

  const loadPublishedFile = async () => {
    try {
      await ensureXlsx();
      const response = await fetch(`${DATA_URL}?v=${DATA_VERSION}`, { cache: 'default' });
      if (!response.ok) throw new Error(`운임 파일 응답 오류 (${response.status})`);
      const result = workbookToData(await response.arrayBuffer());
      applyResult(result, 'published-xlsx');
    } catch (error) {
      console.warn('[KBRIDGE] ocean freight xlsx fallback:', error);
      if (isAdminPreview()) setStatus(`엑셀 자동 불러오기 실패: ${error.message} · 기존 내장 운임을 사용합니다.`, 'error');
    }
  };

  const importPreviewFile = async file => {
    if (!file) return;
    try {
      await ensureXlsx();
      const result = workbookToData(await file.arrayBuffer());
      applyResult(result, 'admin-preview');
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data));
      } catch (error) {
        console.warn('[KBRIDGE] preview storage skipped:', error);
      }
      setStatus(`${file.name}: ${result.regionCount}개 권역 · ${result.portCount}개 포트 미리보기 적용 완료. 전체 공개 반영은 data/ocean-freight.xlsx를 교체하세요.`, 'success');
    } catch (error) {
      setStatus(`파일 적용 실패: ${error.message}`, 'error');
    } finally {
      if (fileInput) fileInput.value = '';
    }
  };

  const loadSavedPreview = () => {
    if (!isAdminPreview()) return false;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Object.keys(saved).length) {
        const count = Object.values(saved).reduce((sum, ports) => sum + ports.length, 0);
        applyResult({ data: saved, portCount: count, regionCount: Object.keys(saved).length }, 'saved-preview');
        setStatus(`저장된 관리자 미리보기 ${count}개 포트를 적용했습니다.`, 'success');
        return true;
      }
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
    return false;
  };

  const resetPreview = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setStatus('저장된 미리보기를 삭제하고 게시된 엑셀 파일을 다시 불러옵니다.');
    await loadPublishedFile();
  };

  const schedulePublishedLoad = () => {
    const run = () => loadPublishedFile();
    if (isAdminPreview()) return run();
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2200 });
    else setTimeout(run, 800);
  };

  const init = () => {
    if (isAdminPreview() && adminPanel) adminPanel.hidden = false;
    fileInput?.addEventListener('change', event => importPreviewFile(event.target.files?.[0]));
    resetButton?.addEventListener('click', resetPreview);
    if (!loadSavedPreview()) schedulePublishedLoad();
  };

  window.KBridgeOceanFreight = {
    reload: loadPublishedFile,
    importFile: importPreviewFile,
    dataUrl: DATA_URL
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
