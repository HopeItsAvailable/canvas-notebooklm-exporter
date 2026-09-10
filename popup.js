let discoveredAssets = [];
let autoDetectedPrefix = '';

document.addEventListener('DOMContentLoaded', async () => {
  const courseInfoEl = document.getElementById('course-info');
  const modulePrefixEl = document.getElementById('module-prefix');
  const assetListEl = document.getElementById('asset-list');
  const exportBtn = document.getElementById('export-btn');
  const statusArea = document.getElementById('status-area');
  const toggleAllBtn = document.getElementById('toggle-all-btn');
  const autoDetectBtn = document.getElementById('auto-detect-btn');

  // --- Connect port for progress updates ---
  const port = chrome.runtime.connect({ name: 'export-progress' });
  port.onMessage.addListener((message) => {
    if (message.type === 'progress') {
      statusArea.textContent = message.text;
      if (message.done) {
        exportBtn.disabled = false;
      }
    }
  });

  // --- Get active tab ---
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('http')) {
    courseInfoEl.textContent = 'Please navigate to a Canvas page first.';
    return;
  }

  courseInfoEl.textContent = 'Scanning page...';

  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-scanner.js']
    });

    const result = injectionResults[0].result;
    if (result) {
      autoDetectedPrefix = result.modulePrefix;
      modulePrefixEl.value = autoDetectedPrefix;
      discoveredAssets = result.assets;

      if (discoveredAssets.length > 0) {
        renderAssets(discoveredAssets);
        exportBtn.disabled = false;
        courseInfoEl.textContent = `Found ${discoveredAssets.length} asset(s) on: ${tab.title}`;
      } else {
        courseInfoEl.textContent = 'No exportable assets found on this page.';
      }
    } else {
      courseInfoEl.textContent = 'Scanner returned no results.';
    }
  } catch (err) {
    courseInfoEl.textContent = 'Error scanning page: ' + err.message;
    console.error('Scan error:', err);
  }

  autoDetectBtn.addEventListener('click', () => {
    modulePrefixEl.value = autoDetectedPrefix;
  });

  toggleAllBtn.addEventListener('click', () => {
    const checkboxes = assetListEl.querySelectorAll('input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    toggleAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
  });

  exportBtn.addEventListener('click', () => {
    const selectedIds = Array.from(assetListEl.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value);

    if (selectedIds.length === 0) {
      statusArea.textContent = 'Please select at least one asset.';
      return;
    }

    const selectedAssets = discoveredAssets.filter(a => selectedIds.includes(a.id));
    const prefix = modulePrefixEl.value.trim() || 'Unknown-Module';

    exportBtn.disabled = true;
    statusArea.textContent = 'Starting export...';

    chrome.runtime.sendMessage({
      action: 'export',
      assets: selectedAssets,
      modulePrefix: prefix
    });
  });

  function renderAssets(assets) {
    assetListEl.innerHTML = '';

    const grouped = {
      archive: [],
      transcript: [],
      document: []
    };

    assets.forEach(a => {
      if (grouped[a.category]) grouped[a.category].push(a);
    });

    const labels = { archive: 'Archives', transcript: 'Transcripts', document: 'Documents' };

    for (const [category, items] of Object.entries(grouped)) {
      if (items.length === 0) continue;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'category-group';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'category-title';
      titleDiv.textContent = labels[category] || category;
      groupDiv.appendChild(titleDiv);

      items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'asset-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = item.id;
        cb.id = item.id;
        cb.checked = true;

        const label = document.createElement('label');
        label.htmlFor = item.id;
        label.textContent = item.title;
        label.title = item.url;

        itemDiv.appendChild(cb);
        itemDiv.appendChild(label);
        groupDiv.appendChild(itemDiv);
      });

      assetListEl.appendChild(groupDiv);
    }
  }
});
