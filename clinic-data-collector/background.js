// Background script для перехвата сетевых запросов
console.log('[Background] Background script загружен');

let collectedData = [];
let isCollecting = false;
let collectionLimit = 500; // По умолчанию 500 карточек
let autoScrollStatus = {
  isScrolling: false,
  scrollCount: 0,
  itemCount: 0
};

// Слушаем сообщения от popup и content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Получено сообщение:', message.action, message);
  
  switch (message.action) {
    case 'startCollection':
      isCollecting = true;
      collectedData = [];
      console.log('Начат сбор данных клиник');
      sendResponse({status: 'started'});
      break;
      
    case 'stopCollection':
      isCollecting = false;
      console.log('Сбор данных остановлен');
      sendResponse({status: 'stopped', dataCount: collectedData.length});
      break;
      
    case 'getCollectedData':
      sendResponse({data: collectedData, isCollecting: isCollecting});
      break;
      
    case 'addClinicData':
      console.log(`[Background] 📨 Получено сообщение addClinicData: ${message.data?.length || 0} карточек`);
      console.log(`[DEBUG] Статус сбора: ${isCollecting}, данные:`, message.data);
      
      if (isCollecting && message.data) {
        // Проверяем лимит перед добавлением
        let dataToAdd = [];
        if (Array.isArray(message.data)) {
          dataToAdd = message.data;
        } else {
          dataToAdd = [message.data];
        }
        
        console.log(`[DEBUG] 🚀 Начинаем обработку ${dataToAdd.length} карточек`);
        
        // Дедупликация и добавление только до лимита
        const remainingSlots = collectionLimit - collectedData.length;
        if (remainingSlots > 0) {
          console.log(`[Дедупликация] 🔍 Проверяем ${dataToAdd.length} новых карточек по ID`);
          const deduplicatedData = deduplicateItems(dataToAdd, collectedData);
          console.log(`[Дедупликация] ✅ После ID дедупликации: ${deduplicatedData.length} уникальных карточек`);
          const toAdd = deduplicatedData.slice(0, remainingSlots);
          collectedData = collectedData.concat(toAdd);
          
          console.log(`✅ Добавлено карточек: ${toAdd.length}`);
          console.log(`✅ Всего собрано: ${collectedData.length}/${collectionLimit}`);
          
          // Если достигли лимита, останавливаем сбор
          if (collectedData.length >= collectionLimit) {
            console.log('Достигнут лимит сбора данных!');
            isCollecting = false;
            
            // Останавливаем автопрокрутку
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
              if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {action: 'stopAutoScroll'});
              }
            });
          }
        }
      }
      sendResponse({
        status: 'added', 
        totalCount: collectedData.length,
        limit: collectionLimit,
        limitReached: collectedData.length >= collectionLimit
      });
      break;
      
    case 'exportData':
      exportCollectedData();
      sendResponse({status: 'exported'});
      break;
      
    case 'clearData':
      collectedData = [];
      sendResponse({status: 'cleared'});
      break;
      
    case 'startAutoScroll':
      // Пересылаем команду в активную вкладку с настройками
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'startAutoScroll',
            scrollSpeed: message.scrollSpeed || 3,
            maxScrolls: message.maxScrolls || 50
          }, (response) => {
            sendResponse(response || {status: 'started'});
          });
        }
      });
      break;
      
    case 'stopAutoScroll':
      // Пересылаем команду в активную вкладку
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {action: 'stopAutoScroll'}, (response) => {
            sendResponse(response || {status: 'stopped'});
          });
        }
      });
      break;
      
    case 'getAutoScrollStatus':
      sendResponse({status: autoScrollStatus});
      break;
      
    case 'autoScrollStatus':
      autoScrollStatus = message.data;
      sendResponse({status: 'updated'});
      break;
      
    case 'setCollectionLimit':
      collectionLimit = message.limit || 500;
      sendResponse({status: 'updated', limit: collectionLimit});
      break;
      
    case 'getCollectionLimit':
      sendResponse({limit: collectionLimit});
      break;
  }
  return true;
});

// Функция дедупликации данных - ПРОСТАЯ ПРОВЕРКА ТОЛЬКО ПО ID
function deduplicateItems(newItems, existingData = []) {
  console.log(`[Дедупликация] Начинаем дедупликацию по ID: ${newItems.length} новых карточек, ${existingData.length} существующих`);
  
  // Создаем Set с ID уже существующих карточек для быстрой проверки
  const existingIds = new Set(existingData.map(item => item.id).filter(id => id));
  console.log(`[Дедупликация] Существующих ID: ${existingIds.size}`);
  
  // Set для отслеживания ID в текущей порции (избегаем дублей внутри одной порции)
  const processedIds = new Set();
  
  let uniqueCount = 0;
  let duplicateCount = 0;
  
  // Фильтруем новые карточки
  const uniqueItems = newItems.filter(item => {
    // Пропускаем карточки без ID
    if (!item.id) {
      console.log(`[Дедупликация] ⚠️ Карточка без ID: "${item.title || 'Без названия'}"`);
      uniqueCount++;
      return true; // Оставляем карточки без ID (редкий случай)
    }
    
    // Проверяем, есть ли уже такой ID в существующих данных
    if (existingIds.has(item.id)) {
      console.log(`[Дедупликация] ❌ Дубликат (существующий): ${item.id} - "${item.title}"`);
      duplicateCount++;
      return false;
    }
    
    // Проверяем, есть ли уже такой ID в текущей порции
    if (processedIds.has(item.id)) {
      console.log(`[Дедупликация] ❌ Дубликат (в текущей порции): ${item.id} - "${item.title}"`);
      duplicateCount++;
      return false;
    }
    
    // Добавляем ID в обработанные
    processedIds.add(item.id);
    uniqueCount++;
    console.log(`[Дедупликация] ✅ Уникальная карточка: ${item.id} - "${item.title}"`);
    return true;
  });
  
  console.log(`[Дедупликация] 📊 Результат: ${uniqueCount} уникальных, ${duplicateCount} дубликатов отфильтровано`);
  console.log(`[Дедупликация] 📈 Эффективность: ${((uniqueCount / newItems.length) * 100).toFixed(1)}% уникальных карточек`);
  
  return uniqueItems;
}

// Удалены неиспользуемые функции calculateTitleSimilarity и calculateDistance
// Теперь дедупликация работает только по уникальным ID карточек

// Функция оценки качества данных (0-1) - синхронизирована с injected.js
function calculateItemDataQuality(item) {
  let score = 0;
  let maxScore = 0;
  
  // Название (обязательно)
  maxScore += 0.2;
  if (item.title && item.title.length > 2) {
    score += 0.2;
  }
  
  // Адрес
  maxScore += 0.2;
  if (item.address && item.address.length > 5) {
    score += 0.2;
  }
  
  // Рейтинг
  maxScore += 0.15;
  if (item.ratingData && item.ratingData.ratingValue) {
    score += 0.15;
  }
  
  // Отзывы
  maxScore += 0.15;
  if (item.ratingData && item.ratingData.reviewCount > 0) {
    score += 0.15;
  }
  
  // Координаты
  maxScore += 0.1;
  if (item.coordinates && item.coordinates.length === 2) {
    score += 0.1;
  }
  
  // Телефоны
  maxScore += 0.1;
  if (item.phones && item.phones.length > 0) {
    score += 0.1;
  }
  
  // Категории
  maxScore += 0.1;
  if (item.categories && item.categories.length > 0) {
    score += 0.1;
  }
  
  return maxScore > 0 ? score / maxScore : 0;
}

// Функция экспорта данных в .js файл
function exportCollectedData() {
  if (collectedData.length === 0) {
    console.log('Нет данных для экспорта');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `business_data_${timestamp}.js`;
  
          // Оптимизируем данные для анализа
        const optimizedCards = collectedData.map(item => {
    const optimized = {
      type: "business",
      id: item.id || `generated-${Math.random().toString(36).substr(2, 9)}`,
      title: item.title || item.name || item.shortTitle,
      shortTitle: item.shortTitle || item.title || item.name,
      description: item.description || item.address || "",
      address: item.address || item.description || "",
      coordinates: item.coordinates || item.displayCoordinates || null,
      url: item.url || item.website || null,
      uri: item.uri || null,
      ratingData: item.ratingData || {
        ratingValue: item.rating || item.ratingValue || null,
        reviewCount: item.reviewCount || 0,
        ratingCount: item.ratingCount || null
      },
      categories: item.categories || [],
      phones: item.phones || [],
      workingHours: item.workingHours || null,
      collectedAt: item.collectedAt || new Date().toISOString(),
      sourceUrl: item.sourceUrl || "extension-collected",
      dataQuality: item.dataQuality || calculateItemDataQuality(item)
    };
    
    return optimized;
  });
  
  // Создаем содержимое файла в оптимизированном формате для анализа
  const fileContent = {
    data: {
      requestId: `clinic-collector-${Date.now()}`,
      requestSerpId: `collector-${timestamp}`,
      requestContext: "Collected by Clinic Data Collector Extension v2.0",
      requestQuery: "business cards data collection",
      displayType: "multiple",
      totalResultCount: optimizedCards.length,
      requestResults: optimizedCards.length,
      collectionLimit: collectionLimit,
      collectionStats: {
        totalFound: collectedData.length,
        withRating: optimizedCards.filter(c => c.ratingData?.ratingValue).length,
        withReviews: optimizedCards.filter(c => c.ratingData?.reviewCount > 0).length,
        withAddress: optimizedCards.filter(c => c.address && c.address.length > 5).length,
        withCoordinates: optimizedCards.filter(c => c.coordinates).length,
        withPhones: optimizedCards.filter(c => c.phones && c.phones.length > 0).length,
        withCategories: optimizedCards.filter(c => c.categories && c.categories.length > 0).length,
        withWorkingHours: optimizedCards.filter(c => c.workingHours).length,
        averageDataQuality: optimizedCards.length > 0 ? 
          (optimizedCards.reduce((sum, c) => sum + (c.dataQuality || 0), 0) / optimizedCards.length * 100).toFixed(1) + '%' :
          '0%'
      },
      items: optimizedCards
    }
  };
  
  const jsContent = JSON.stringify(fileContent, null, 2);
  
  // Создаем blob и скачиваем файл
  const blob = new Blob([jsContent], {type: 'application/json'});
  
  // Создаем data URL вместо object URL
  const reader = new FileReader();
  reader.onload = function() {
    const dataUrl = reader.result;
    
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка при скачивании:', chrome.runtime.lastError);
      } else {
        console.log(`Файл ${filename} успешно сохранен. ID загрузки: ${downloadId}`);
      }
    });
  };
  reader.onerror = function() {
    // Альтернативный метод экспорта через вкладку
    console.log('Используем альтернативный метод экспорта');
    exportViaTab(jsContent, filename);
  };
  reader.readAsDataURL(blob);
}

// Альтернативный метод экспорта через создание временной вкладки
function exportViaTab(content, filename) {
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(content);
  
  chrome.tabs.create({
    url: dataUri,
    active: false
  }, (tab) => {
    // Ждем загрузки и сразу скачиваем
    setTimeout(() => {
      chrome.downloads.download({
        url: dataUri,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Ошибка при альтернативном скачивании:', chrome.runtime.lastError);
          // Последний резерв - копируем в буфер обмена
          copyToClipboard(content, filename);
        } else {
          console.log(`Файл ${filename} успешно сохранен альтернативным методом`);
        }
        
        // Закрываем временную вкладку
        if (tab && tab.id) {
          chrome.tabs.remove(tab.id);
        }
      });
    }, 1000);
  });
}

// Резервный метод - копирование в буфер обмена
function copyToClipboard(content, filename) {
  console.log('Используем резервный метод - копирование в буфер');
  
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'copyToClipboard',
        content: content,
        filename: filename
      });
    }
  });
}

// Обработчик клика по иконке расширения - открываем sidebar
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Уведомления об установке
chrome.runtime.onInstalled.addListener(() => {
  console.log('YandexParser Analytics установлен');
});
