// Content script для внедрения скрипта перехвата fetch запросов
(function() {
  try {
    console.log('[Content Script] Content script загружен и инициализируется...');

    // Внедряем скрипт для перехвата fetch запросов
    const injectedScript = document.createElement('script');
    injectedScript.src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('injected.js') : 'injected.js';
    injectedScript.onload = function() {
      console.log('[Content Script] injected.js загружен');
      this.remove();
    };
    (document.head || document.documentElement).appendChild(injectedScript);

    // Внедряем скрипт автоматической прокрутки
    const autoScrollScript = document.createElement('script');
    autoScrollScript.src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('auto-scroll.js') : 'auto-scroll.js';
    autoScrollScript.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(autoScrollScript);

    // Слушаем сообщения от внедренного скрипта
    window.addEventListener('message', function(event) {
      if (event.source !== window) return;
      if (!event.data) return;
      try {
        console.log('[Content Script] Получено сообщение:', event.data.type, event.data);
        if (event.data.type === 'CLINIC_DATA_INTERCEPTED') {
          console.log(`[Content Script] 📨 Получены данные от injected.js: ${event.data.clinics.length} карточек`);
          console.log(`[DEBUG] Данные для отправки:`, event.data.clinics);
          
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            console.log(`[DEBUG] 🚀 Отправляем ${event.data.clinics.length} карточек в background.js`);
            chrome.runtime.sendMessage({
              action: 'addClinicData',
              data: event.data.clinics,
              url: event.data.url,
              timestamp: event.data.timestamp
            }, (response) => {
              console.log('[Content Script] ✅ Ответ от background.js:', response);
            });
          } else {
            console.warn('[Content Script] ❌ chrome.runtime.sendMessage недоступен, не могу отправить данные в background.js');
          }
        } else if (event.data.type === 'AUTO_SCROLL_STATUS') {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              action: 'autoScrollStatus',
              data: event.data
            });
          }
        }
      } catch (err) {
        console.error('[Content Script] Ошибка при обработке сообщения:', err);
      }
    });

    // Слушаем сообщения от sidebar для управления автоматической прокруткой
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'startAutoScroll') {
          window.postMessage({ 
            type: 'START_AUTO_SCROLL',
            scrollSpeed: message.scrollSpeed || 3,
            maxScrolls: message.maxScrolls || 50
          }, '*');
          sendResponse({ status: 'started' });
        } else if (message.action === 'stopAutoScroll') {
          window.postMessage({ type: 'STOP_AUTO_SCROLL' }, '*');
          sendResponse({ status: 'stopped' });
        } else if (message.action === 'copyToClipboard') {
          copyDataToClipboard(message.content, message.filename);
          sendResponse({ status: 'copied' });
        }
        return true;
      });
    } else {
      console.warn('[Content Script] chrome.runtime.onMessage недоступен, управление автопрокруткой невозможно');
    }

    // Функция копирования данных в буфер обмена
    function copyDataToClipboard(content, filename) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showExportNotification(filename);
        console.log(`Данные скопированы в буфер обмена. Файл: ${filename}`);
      } catch (error) {
        console.error('Ошибка при копировании в буфер:', error);
      }
    }

    // Функция показа уведомления об экспорте
    function showExportNotification(filename) {
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        z-index: 9999;
        font-size: 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);`;
      notification.textContent = `Данные скопированы: ${filename}`;
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 2000);
    }
  } catch (fatalError) {
    console.error('[Content Script] ФАТАЛЬНАЯ ОШИБКА:', fatalError);
  }
})();
