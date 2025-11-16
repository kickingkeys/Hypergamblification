// Popup script

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[HYPERGAMBLIFICATION] Popup loaded');

  // Get elements
  const statusText = document.getElementById('statusText') as HTMLElement;
  const triggerBtn = document.getElementById('triggerBtn') as HTMLButtonElement;
  const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
  const saveKeyBtn = document.getElementById('saveKeyBtn') as HTMLButtonElement;
  const keyStatus = document.getElementById('keyStatus') as HTMLElement;

  // Load saved API key
  chrome.storage.local.get(['openai_api_key'], (result) => {
    if (result.openai_api_key) {
      apiKeyInput.value = result.openai_api_key;
      keyStatus.textContent = '✅ API key saved';
      keyStatus.style.color = '#28a745';
    } else {
      keyStatus.textContent = '⚠️ No API key configured';
      keyStatus.style.color = '#dc3545';
    }
  });

  // Set status
  if (statusText) {
    statusText.textContent = 'Active';
    statusText.parentElement?.classList.add('active');
  }

  // Handle save API key button
  if (saveKeyBtn) {
    saveKeyBtn.addEventListener('click', async () => {
      const apiKey = apiKeyInput.value.trim();

      if (!apiKey) {
        keyStatus.textContent = '❌ Please enter an API key';
        keyStatus.style.color = '#dc3545';
        return;
      }

      if (!apiKey.startsWith('sk-')) {
        keyStatus.textContent = '❌ Invalid API key format';
        keyStatus.style.color = '#dc3545';
        return;
      }

      try {
        // Save to background script
        const response = await chrome.runtime.sendMessage({
          type: 'SAVE_OPENAI_KEY',
          apiKey: apiKey
        });

        if (response?.success) {
          keyStatus.textContent = '✅ API key saved successfully!';
          keyStatus.style.color = '#28a745';
        } else {
          throw new Error('Failed to save API key');
        }
      } catch (error) {
        console.error('[POPUP] Error saving API key:', error);
        keyStatus.textContent = '❌ Failed to save API key';
        keyStatus.style.color = '#dc3545';
      }
    });
  }

  // Handle trigger button
  if (triggerBtn) {
    triggerBtn.addEventListener('click', () => {
      keyStatus.textContent = 'ℹ️ Use Cmd+Shift+K on any page to test';
      keyStatus.style.color = '#0066cc';
    });
  }
});
