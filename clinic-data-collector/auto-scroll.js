// Автоматическая прокрутка для загрузки большего количества клиник
(function() {
  let isAutoScrolling = false;
  let scrollCount = 0;
  let lastItemCount = 0;
  let noNewItemsCount = 0;
  let scrollInterval = null;
  
  // Настройки прокрутки (по умолчанию)
  let SCROLL_DELAY = 3000; // 3 секунды между прокрутками (было 2)
  let MAX_SCROLLS = 50; // Максимум прокруток
  const MAX_NO_NEW_ITEMS = 8; // Максимум попыток без новых элементов (было 5)
  const SCROLL_AMOUNT = window.innerHeight * 0.6; // Прокрутка на 60% высоты экрана (было 80%)
  
  // Слушаем сообщения от popup/sidebar
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    if (event.data.type === 'START_AUTO_SCROLL') {
      // Обновляем настройки если переданы
      if (event.data.scrollSpeed) {
        SCROLL_DELAY = event.data.scrollSpeed * 1000; // конвертируем в миллисекунды
      }
      if (event.data.maxScrolls) {
        MAX_SCROLLS = event.data.maxScrolls;
      }
      startAutoScroll();
    } else if (event.data.type === 'STOP_AUTO_SCROLL') {
      stopAutoScroll();
    }
  });
  
  // Функция запуска автоматической прокрутки
  function startAutoScroll() {
    if (isAutoScrolling) return;
    
    isAutoScrolling = true;
    scrollCount = 0;
    lastItemCount = getItemCount();
    noNewItemsCount = 0;
    
    console.log('[Auto Scroll] Запуск автоматической прокрутки');
    
    // Отправляем статус в popup
    window.postMessage({
      type: 'AUTO_SCROLL_STATUS',
      isScrolling: true,
      scrollCount: scrollCount,
      itemCount: lastItemCount
    }, '*');
    
    scrollInterval = setInterval(performScroll, SCROLL_DELAY);
  }
  
  // Функция остановки автоматической прокрутки
  function stopAutoScroll() {
    if (!isAutoScrolling) return;
    
    isAutoScrolling = false;
    
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
    
    console.log('[Auto Scroll] Остановка автоматической прокрутки');
    
    // Отправляем статус в popup
    window.postMessage({
      type: 'AUTO_SCROLL_STATUS',
      isScrolling: false,
      scrollCount: scrollCount,
      itemCount: getItemCount()
    }, '*');
  }
  
  // Функция выполнения прокрутки
  function performScroll() {
    if (!isAutoScrolling) return;
    
    const currentItemCount = getItemCount();
    
    // Проверяем, появились ли новые элементы
    if (currentItemCount > lastItemCount) {
      lastItemCount = currentItemCount;
      noNewItemsCount = 0;
      console.log(`[Auto Scroll] Найдено ${currentItemCount} элементов`);
    } else {
      noNewItemsCount++;
      console.log(`[Auto Scroll] Новых элементов не найдено (${noNewItemsCount}/${MAX_NO_NEW_ITEMS})`);
    }
    
    scrollCount++;
    
    // Ищем основной контейнер с результатами поиска
    const mainScrollContainer = findMainScrollContainer();
    
    if (mainScrollContainer) {
      // Прокручиваем только контейнер с результатами
      console.log('[Auto Scroll] Прокручиваем контейнер результатов');
      
      const scrollStep = SCROLL_AMOUNT / 4; // Разбиваем прокрутку на 4 шага
      let currentStep = 0;
      
      const smoothScroll = setInterval(() => {
        mainScrollContainer.scrollBy({
          top: scrollStep,
          behavior: 'smooth'
        });
        
        currentStep++;
        if (currentStep >= 4) {
          clearInterval(smoothScroll);
        }
      }, 200); // 200мс между шагами прокрутки
    } else {
      // Fallback: прокручиваем страницу, если контейнер не найден
      console.log('[Auto Scroll] Контейнер не найден, прокручиваем страницу');
      const scrollStep = SCROLL_AMOUNT / 4;
      let currentStep = 0;
      
      const smoothScroll = setInterval(() => {
        window.scrollBy({
          top: scrollStep,
          behavior: 'smooth'
        });
        
        currentStep++;
        if (currentStep >= 4) {
          clearInterval(smoothScroll);
        }
      }, 200);
    }
    
    // Отправляем обновленный статус
    window.postMessage({
      type: 'AUTO_SCROLL_STATUS',
      isScrolling: true,
      scrollCount: scrollCount,
      itemCount: currentItemCount
    }, '*');
    
    // Проверяем условия остановки
    if (scrollCount >= MAX_SCROLLS) {
      console.log('[Auto Scroll] Достигнуто максимальное количество прокруток');
      stopAutoScroll();
    } else if (noNewItemsCount >= MAX_NO_NEW_ITEMS) {
      console.log('[Auto Scroll] Не найдено новых элементов, остановка');
      stopAutoScroll();
    } else if (isAtBottom()) {
      console.log('[Auto Scroll] Достигнут конец страницы');
      stopAutoScroll();
    }
  }
  
  // Функция подсчета элементов клиник на странице
  function getItemCount() {
    const selectors = [
      // Яндекс.Карты
      '[class*="search-snippet-view"], [class*="business-card"], [class*="search-business-snippet"]',
      // 2ГИС
      '[class*="minicard"], [class*="card"], [data-testid*="searchResult"]',
      // Google Maps
      '[data-result-index], [class*="section-result"]',
      // Общие селекторы
      '[data-testid*="business"], [class*="organization"], [class*="clinic"]'
    ];
    
    let totalCount = 0;
    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        totalCount += elements.length;
      } catch (e) {
        // Игнорируем ошибки селекторов
      }
    });
    
    return totalCount;
  }
  
  // Функция поиска основного контейнера с результатами поиска
  function findMainScrollContainer() {
    // Приоритетные селекторы для Яндекс.Карт
    const prioritySelectors = [
      // Основной контейнер результатов поиска
      '[class*="scroll__scrollbar"], [class*="scroll__scrollbar _noprint"]',
      // Контейнер списка результатов
      '[class*="search-list"], [class*="search-results"], [class*="business-list"]',
      // Боковая панель с результатами
      '[class*="sidebar"], [class*="search-sidebar"], [class*="results-sidebar"]',
      // Контейнер с карточками
      '[class*="search-snippet"], [class*="business-card"], [class*="organization-card"]'
    ];
    
    // Ищем по приоритетным селекторам
    for (const selector of prioritySelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          // Проверяем, что элемент прокручиваемый и содержит результаты
          const style = window.getComputedStyle(el);
          if ((style.overflowY === 'scroll' || style.overflowY === 'auto') && 
              el.scrollHeight > el.clientHeight &&
              el.querySelector('[class*="search-snippet"], [class*="business-card"], [class*="organization-card"]')) {
            console.log('[Auto Scroll] Найден основной контейнер:', el.className);
            return el;
          }
        }
      } catch (e) {
        // Игнорируем ошибки селекторов
      }
    }
    
    // Fallback: ищем любой прокручиваемый контейнер с результатами
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'scroll' || style.overflowY === 'auto') && 
          el.scrollHeight > el.clientHeight &&
          el.querySelector('[class*="search-snippet"], [class*="business-card"], [class*="organization-card"]')) {
        console.log('[Auto Scroll] Найден fallback контейнер:', el.className);
        return el;
      }
    }
    
    console.log('[Auto Scroll] Основной контейнер не найден');
    return null;
  }

  // Функция поиска прокручиваемых контейнеров (для совместимости)
  function findScrollableContainers() {
    const containers = [];
    
    // Ищем элементы с overflow: scroll или auto
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'scroll' || style.overflowY === 'auto') && 
          el.scrollHeight > el.clientHeight) {
        containers.push(el);
      }
    });
    
    // Специфичные селекторы для известных сайтов
    const specificSelectors = [
      // Яндекс.Карты
      '[class*="scroll-container"], [class*="search-list"], [class*="sidebar"]',
      // 2ГИС
      '[class*="scroll"], [class*="list-container"]',
      // Google Maps
      '[class*="section-scrollbox"], [class*="section-listbox"]'
    ];
    
    specificSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.scrollHeight > el.clientHeight) {
            containers.push(el);
          }
        });
      } catch (e) {
        // Игнорируем ошибки селекторов
      }
    });
    
    return [...new Set(containers)]; // Удаляем дубликаты
  }
  
  // Функция проверки, достигнут ли конец страницы или контейнера
  function isAtBottom() {
    const mainContainer = findMainScrollContainer();
    
    if (mainContainer) {
      // Проверяем конец контейнера с результатами
      const threshold = 50; // 50px до конца контейнера
      const containerBottom = mainContainer.scrollTop + mainContainer.clientHeight;
      const isContainerAtBottom = containerBottom >= (mainContainer.scrollHeight - threshold);
      
      if (isContainerAtBottom) {
        console.log('[Auto Scroll] Достигнут конец контейнера результатов');
        return true;
      }
    }
    
    // Fallback: проверяем конец страницы
    const threshold = 100; // 100px до конца
    const isPageAtBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - threshold);
    
    if (isPageAtBottom) {
      console.log('[Auto Scroll] Достигнут конец страницы');
      return true;
    }
    
    return false;
  }
  
  // Добавляем кнопки управления прокруткой (для отладки)
  function addDebugControls() {
    if (document.getElementById('auto-scroll-debug')) return;
    
    const debugPanel = document.createElement('div');
    debugPanel.id = 'auto-scroll-debug';
    debugPanel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 10px;
      border-radius: 5px;
      font-size: 12px;
      z-index: 10000;
      font-family: monospace;
    `;
    
    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start Auto Scroll';
    startBtn.onclick = startAutoScroll;
    
    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop Auto Scroll';
    stopBtn.onclick = stopAutoScroll;
    
    const status = document.createElement('div');
    status.id = 'scroll-status';
    status.textContent = `Items: ${getItemCount()}, Scrolls: ${scrollCount}`;
    
    debugPanel.appendChild(startBtn);
    debugPanel.appendChild(stopBtn);
    debugPanel.appendChild(status);
    
    document.body.appendChild(debugPanel);
    
    // Обновляем статус каждые 2 секунды
    setInterval(() => {
      const statusEl = document.getElementById('scroll-status');
      if (statusEl) {
        statusEl.textContent = `Items: ${getItemCount()}, Scrolls: ${scrollCount}, Active: ${isAutoScrolling}`;
      }
    }, 2000);
  }
  
  // Добавляем отладочные контролы в development режиме
  if (window.location.hostname === 'localhost' || window.location.search.includes('debug=1')) {
    addDebugControls();
  }
  
  console.log('[Auto Scroll] Модуль автоматической прокрутки загружен');
})();


