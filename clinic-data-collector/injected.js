// Скрипт для перехвата fetch и XHR запросов (внедряется в контекст страницы)
(function() {
  console.log('[YandexParser Analytics] Скрипт перехвата запросов активирован');
  
  // Сохраняем оригинальный fetch
  const originalFetch = window.fetch;
  
  // Переопределяем fetch для перехвата запросов
  window.fetch = function(...args) {
    const url = args[0];
    const options = args[1] || {};
    
    // Вызываем оригинальный fetch
    return originalFetch.apply(this, args)
      .then(response => {
        // Проверяем, содержит ли URL ключевые слова, связанные с клиниками
        const isClinicRelated = checkIfClinicRelated(url, options);
        
        if (isClinicRelated) {
          // Клонируем response для чтения без нарушения оригинального потока
          const responseClone = response.clone();
          
          // Пробуем разные способы чтения данных
          responseClone.json()
            .then(data => {
              const clinics = extractClinicsFromResponse(data, url);
              console.log(`[DEBUG] Извлечено ${clinics.length} карточек из fetch:`, url);
              
              if (clinics.length > 0) {
                console.log(`[DEBUG] Отправляем ${clinics.length} карточек через postMessage (fetch)`);
                window.postMessage({
                  type: 'CLINIC_DATA_INTERCEPTED',
                  clinics: clinics,
                  url: url,
                  timestamp: Date.now()
                }, '*');
                
                console.log(`[YandexParser Analytics] ✅ Перехвачено ${clinics.length} карточек из fetch:`, url);
              } else {
                console.log(`[DEBUG] ⚠️ Нет карточек для отправки из fetch:`, url);
              }
            })
            .catch(() => {
              // Если не JSON, пробуем текст
              responseClone.text().then(text => {
                try {
                  const data = JSON.parse(text);
                  const clinics = extractClinicsFromResponse(data, url);
                  if (clinics.length > 0) {
                    window.postMessage({
                      type: 'CLINIC_DATA_INTERCEPTED',
                      clinics: clinics,
                      url: url,
                      timestamp: Date.now()
                    }, '*');
                    console.log(`[YandexParser Analytics] ✅ Перехвачено ${clinics.length} карточек из fetch (text):`, url);
                  }
                } catch (e) {
                  // Игнорируем ошибки парсинга
                }
              }).catch(() => {
                // Игнорируем ошибки чтения
              });
            });
        }
        
        return response;
      });
  };
  
  // Перехватываем XMLHttpRequest (для совместимости)
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._interceptedUrl = url;
    return originalXHROpen.apply(this, [method, url, ...args]);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    const xhr = this;
    
    // Добавляем обработчик загрузки
    const originalOnLoad = xhr.onload;
    xhr.onload = function() {
      if (checkIfClinicRelated(xhr._interceptedUrl)) {
        try {
          const data = JSON.parse(xhr.responseText);
          const clinics = extractClinicsFromResponse(data, xhr._interceptedUrl);
          console.log(`[DEBUG] Извлечено ${clinics.length} карточек из XHR:`, xhr._interceptedUrl);
          
          if (clinics.length > 0) {
            console.log(`[DEBUG] Отправляем ${clinics.length} карточек через postMessage`);
            window.postMessage({
              type: 'CLINIC_DATA_INTERCEPTED',
              clinics: clinics,
              url: xhr._interceptedUrl,
              timestamp: Date.now()
            }, '*');
            
            console.log(`[YandexParser Analytics] ✅ Перехвачено ${clinics.length} карточек из XHR:`, xhr._interceptedUrl);
          } else {
            console.log(`[DEBUG] ⚠️ Нет карточек для отправки из:`, xhr._interceptedUrl);
          }
        } catch (error) {
          // Игнорируем ошибки парсинга
        }
      }
      
      if (originalOnLoad) {
        originalOnLoad.apply(this, arguments);
      }
    };
    
    return originalXHRSend.apply(this, args);
  };
  
  // Функция проверки, связан ли запрос с клиниками
  function checkIfClinicRelated(url, options = {}) {
    if (!url) return false;
    
    const urlLower = url.toString().toLowerCase();
    
    // Специальные паттерны для Яндекс.Карт
    const yandexPatterns = [
      'maps.yandex.ru',
      'yandex.ru/maps',
      '/maps/api/',
      '/search',
      '/businesscard',
      '/geosearch',
      '/orginfo',
      '/yandsearch'
    ];
    
    // Общие ключевые слова
    const keywords = [
      'clinic', 'medical', 'doctor', 'hospital', 'health',
      'клиника', 'медицин', 'доктор', 'больница', 'здоровье',
      'rating', 'review', 'business', 'organization',
      'рейтинг', 'отзыв', 'бизнес', 'организац',
      'search', 'filter', 'category', 'ajax', 'api',
      'цвет', 'flower', 'beauty', 'salon'
    ];
    
    // Проверяем специальные паттерны Яндекс.Карт
    const hasYandexPattern = yandexPatterns.some(pattern => urlLower.includes(pattern));
    
    // Проверяем общие ключевые слова
    const hasKeyword = keywords.some(keyword => urlLower.includes(keyword));
    
    const isRelated = hasYandexPattern || hasKeyword;
    
    if (isRelated) {
      console.log(`[DEBUG] URL признан релевантным: ${url}`);
    }
    
    return isRelated;
  }
  
  // Функция извлечения клиник из ответа
  function extractClinicsFromResponse(data, url) {
    const clinics = [];
    
    try {
      // Рекурсивный поиск бизнес-объектов и других структур
      function findBusinessObjects(obj, path = '', depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 10) return;
        
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            if (item && typeof item === 'object') {
              // Проверяем разные типы бизнес-объектов
              if (item.type === 'business' || 
                  item.type === 'organization' ||
                  item.type === 'clinic' ||
                  (item.title && (item.rating || item.ratingData || item.reviewCount))) {
                const clinic = processBusinessObject(item, url);
                if (clinic) clinics.push(clinic);
              }
              findBusinessObjects(item, `${path}[${index}]`, depth + 1);
            }
          });
        } else {
          // Специальная обработка для известных структур
          const priorityKeys = ['data', 'items', 'results', 'businesses', 'organizations', 'places'];
          const foundPriority = priorityKeys.find(key => obj[key]);
          
          if (foundPriority) {
            findBusinessObjects(obj[foundPriority], `${path}.${foundPriority}`, depth + 1);
          }
          
          // Общий поиск по всем свойствам
          for (const [key, value] of Object.entries(obj)) {
            if (!priorityKeys.includes(key)) {
              findBusinessObjects(value, path ? `${path}.${key}` : key, depth + 1);
            }
          }
        }
      }
      
      // Также ищем объекты с медицинскими ключевыми словами
      function findMedicalObjects(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 8) return;
        
        if (Array.isArray(obj)) {
          obj.forEach(item => {
            if (item && typeof item === 'object') {
              const hasTitle = item.title || item.name || item.shortTitle;
              const hasRating = item.rating || item.ratingData || item.ratingValue;
              const hasReviews = item.reviewCount || item.reviews;
              
              if (hasTitle && (hasRating || hasReviews)) {
                const titleText = (hasTitle || '').toLowerCase();
                const medicalKeywords = ['клиник', 'медицин', 'больниц', 'поликлиник', 'центр', 'doctor', 'clinic', 'medical', 'hospital'];
                
                if (medicalKeywords.some(keyword => titleText.includes(keyword))) {
                  const clinic = processBusinessObject(item, url);
                  if (clinic) clinics.push(clinic);
                }
              }
              findMedicalObjects(item, depth + 1);
            }
          });
        } else {
          for (const value of Object.values(obj)) {
            findMedicalObjects(value, depth + 1);
          }
        }
      }
      
      findBusinessObjects(data);
      findMedicalObjects(data);
      
    } catch (error) {
      console.error('[YandexParser Analytics] Ошибка при извлечении карточек:', error);
    }
    
    return clinics;
  }
  
  // Функция обработки бизнес-объекта
  function processBusinessObject(item, sourceUrl) {
    try {
      // Базовая информация
      const clinic = {
        type: 'business',
        requestId: `intercepted-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        index: 0,
        analyticsId: item.analyticsId || null,
        title: item.title || item.name || null,
        shortTitle: item.shortTitle || null,
        description: item.description || null,
        address: item.address || item.fullAddress || null,
        coordinates: item.coordinates || null,
        displayCoordinates: item.displayCoordinates || item.coordinates || null,
        bounds: item.bounds || null,
        uri: item.uri || null,
        logId: item.logId || null,
        id: item.id || null,
        url: item.url || null,
        sourceUrl: sourceUrl,
        collectedAt: new Date().toISOString()
      };
      
      // Рейтинговые данные
      if (item.ratingData) {
        clinic.ratingData = {
          ratingCount: item.ratingData.ratingCount || null,
          ratingValue: item.ratingData.ratingValue || null,
          reviewCount: item.ratingData.reviewCount || null
        };
      } else if (item.rating !== undefined || item.reviewCount !== undefined) {
        clinic.ratingData = {
          ratingValue: item.rating || item.ratingValue || null,
          reviewCount: item.reviewCount || null
        };
      }
      
      // Дополнительная информация
      if (item.categories) clinic.categories = item.categories;
      if (item.workingHours) clinic.workingHours = item.workingHours;
      if (item.phones) clinic.phones = item.phones;
      if (item.website) clinic.website = item.website;
      
      // Новые полезные поля
      if (item.email) clinic.email = item.email;
      if (item.socialNetworks) clinic.socialNetworks = item.socialNetworks;
      if (item.priceLevel) clinic.priceLevel = item.priceLevel;
      if (item.features) clinic.features = item.features;
      if (item.services) clinic.services = item.services;
      if (item.photos) clinic.photos = item.photos;
      if (item.verified) clinic.verified = item.verified;
      
      // ВРЕМЕННО ОТКЛЮЧЕНА ФИЛЬТРАЦИЯ ПО КАЧЕСТВУ ДЛЯ ВОССТАНОВЛЕНИЯ СБОРА
      console.log(`[EMERGENCY] Фильтрация по качеству ОТКЛЮЧЕНА! Добавляем карточку: ${clinic.title}`);
      
      // Всё равно считаем качество для отладки
      clinic.dataQuality = calculateDataQuality(clinic);
      console.log(`[DEBUG] Качество карточки "${clinic.title}": ${clinic.dataQuality}`);
      
      // ВРЕМЕННО: добавляем все карточки с названием
      if (clinic.title && clinic.title.length > 2) {
        return clinic;
      }
      
      return null;
    } catch (error) {
      console.error('[YandexParser Analytics] Ошибка при обработке бизнес-объекта:', error);
      return null;
    }
  }
  
  // Функция оценки качества данных (0-1)
  function calculateDataQuality(item) {
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
})();
