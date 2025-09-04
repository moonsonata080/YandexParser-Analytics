// Sidebar script для управления расширением YandexParser Analytics
let sessionStartTime = null;
let timerInterval = null;

// Элементы DOM
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('statusText');
const statusDetails = document.getElementById('statusDetails');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const statsDiv = document.getElementById('stats');
const collectedCount = document.getElementById('collectedCount');
const sessionTime = document.getElementById('sessionTime');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const autoScrollBtn = document.getElementById('autoScrollBtn');
const stopScrollBtn = document.getElementById('stopScrollBtn');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');

// Настройки лимита
const limitInput = document.getElementById('limitInput');

// Дополнительные настройки
const advancedToggle = document.getElementById('advancedToggle');
const advancedContent = document.getElementById('advancedContent');
const scrollSpeedInput = document.getElementById('scrollSpeed');
const maxScrollsInput = document.getElementById('maxScrolls');

// Инициализация при открытии sidebar
document.addEventListener('DOMContentLoaded', function() {
  updateStatus();
  loadSettings();
  
  // Обработчики кнопок
  startBtn.addEventListener('click', startCollection);
  stopBtn.addEventListener('click', stopCollection);
  autoScrollBtn.addEventListener('click', startAutoScroll);
  stopScrollBtn.addEventListener('click', stopAutoScroll);
  exportBtn.addEventListener('click', exportData);
  clearBtn.addEventListener('click', clearData);
  
  // Обработчики настроек лимита
  limitInput.addEventListener('input', validateAndSetLimit);
  limitInput.addEventListener('blur', validateAndSetLimit);
  
  // Обработчик дополнительных настроек
  advancedToggle.addEventListener('click', toggleAdvancedSettings);
  scrollSpeedInput.addEventListener('change', saveAdvancedSettings);
  maxScrollsInput.addEventListener('change', saveAdvancedSettings);
  
  // Открытие боковой панели при клике на иконку расширения
  if (chrome.sidePanel) {
    chrome.action.onClicked.addListener((tab) => {
      chrome.sidePanel.open({ tabId: tab.id });
    });
  }
});

// Загрузка сохраненных настроек
function loadSettings() {
  chrome.runtime.sendMessage({action: 'getCollectionLimit'}, (response) => {
    if (response && response.limit) {
      limitInput.value = response.limit;
    }
  });
  
  // Загружаем дополнительные настройки
  chrome.storage.local.get(['scrollSpeed', 'maxScrolls'], (result) => {
    if (result.scrollSpeed) scrollSpeedInput.value = result.scrollSpeed;
    if (result.maxScrolls) maxScrollsInput.value = result.maxScrolls;
  });
}

// Валидация и установка лимита
function validateAndSetLimit() {
  let value = parseInt(limitInput.value);
  
  // Валидация - только минимальное значение
  if (isNaN(value) || value < 1) {
    value = 1;
    limitInput.value = 1;
    showNotification('Минимальный лимит: 1 карточка', 'error');
  }
  
  // Устанавливаем лимит
  chrome.runtime.sendMessage({action: 'setCollectionLimit', limit: value}, (response) => {
    if (response && response.status === 'updated') {
      showNotification(`Лимит установлен: ${formatNumber(value)} карточек`, 'success');
    }
  });
}


// Переключение дополнительных настроек
function toggleAdvancedSettings() {
  const isVisible = advancedContent.classList.contains('show');
  advancedContent.classList.toggle('show');
  advancedToggle.textContent = isVisible ? '⚙️ Дополнительные настройки' : '🔧 Скрыть настройки';
}

// Сохранение дополнительных настроек
function saveAdvancedSettings() {
  const settings = {
    scrollSpeed: parseFloat(scrollSpeedInput.value),
    maxScrolls: parseInt(maxScrollsInput.value)
  };
  
  chrome.storage.local.set(settings, () => {
    showNotification('Настройки сохранены', 'success');
  });
}

// Функция обновления статуса
function updateStatus() {
  Promise.all([
    new Promise(resolve => chrome.runtime.sendMessage({action: 'getCollectedData'}, resolve)),
    new Promise(resolve => chrome.runtime.sendMessage({action: 'getCollectionLimit'}, resolve))
  ]).then(([dataResponse, limitResponse]) => {
    if (dataResponse && limitResponse) {
      const dataCount = dataResponse.data ? dataResponse.data.length : 0;
      const isCollecting = dataResponse.isCollecting;
      const limit = limitResponse.limit || 500;
      
      // Обновляем счетчик с лимитом
      collectedCount.textContent = formatNumber(dataCount);
      
      // Обновляем прогресс-бар
      const progress = Math.min((dataCount / limit) * 100, 100);
      progressFill.style.width = progress + '%';
      
      // Проверяем достижение лимита
      const limitReached = dataCount >= limit;
      
      // Обновляем статус
      if (isCollecting && !limitReached) {
        statusDiv.className = 'status collecting';
        statusText.textContent = '🔄 Идет сбор данных...';
        statusDetails.innerHTML = `Собрано: <strong>${formatNumber(dataCount)}/${formatNumber(limit)}</strong> карточек<br>Обновляйте страницы с организациями`;
        progressBar.style.display = 'block';
        
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        statsDiv.style.display = 'grid';
        
        // Запускаем таймер если еще не запущен
        if (!timerInterval) {
          sessionStartTime = Date.now();
          startTimer();
        }
      } else {
        statusDiv.className = limitReached ? 'status completed' : 'status';
        
        if (limitReached) {
          statusText.textContent = '🎯 Лимит достигнут!';
          statusDetails.innerHTML = `Собрано <strong>${formatNumber(dataCount)}</strong> карточек из <strong>${formatNumber(limit)}</strong><br>Готово к экспорту данных`;
          progressBar.style.display = 'block';
        } else if (dataCount > 0) {
          statusText.textContent = '✅ Сбор завершен';
          statusDetails.innerHTML = `Собрано <strong>${formatNumber(dataCount)}</strong> карточек<br>Готово к экспорту данных`;
          progressBar.style.display = 'block';
        } else {
          statusText.textContent = '⚡ Готов к работе';
          statusDetails.innerHTML = `Лимит: <strong>${formatNumber(limit)}</strong> карточек<br>Нажмите "Начать сбор"`;
          progressBar.style.display = 'none';
        }
        
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        
        if (dataCount > 0) {
          statsDiv.style.display = 'grid';
        }
        
        // Останавливаем таймер
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
      }
      
      // Активируем кнопку экспорта если есть данные
      exportBtn.disabled = dataCount === 0;
      exportBtn.innerHTML = dataCount > 0 
        ? `📥 Экспортировать (${formatNumber(dataCount)} карточек)`
        : '📥 Экспортировать данные';
    }
  });
}

// Запуск сбора
function startCollection() {
  chrome.runtime.sendMessage({action: 'startCollection'}, (response) => {
    if (response && response.status === 'started') {
      sessionStartTime = Date.now();
      startTimer();
      updateStatus();
      
      showNotification('🚀 Сбор данных запущен!', 'success');
    }
  });
}

// Остановка сбора
function stopCollection() {
  chrome.runtime.sendMessage({action: 'stopCollection'}, (response) => {
    if (response) {
      updateStatus();
      showNotification(`⏹️ Сбор остановлен. Собрано ${formatNumber(response.dataCount)} карточек.`, 'info');
    }
  });
}

// Экспорт данных
function exportData() {
  chrome.runtime.sendMessage({action: 'exportData'}, (response) => {
    if (response && response.status === 'exported') {
      showNotification('💾 Файл сохранен в папку загрузок!', 'success');
    }
  });
}

// Очистка данных
function clearData() {
  if (confirm('🗑️ Удалить все собранные данные?\n\nЭто действие нельзя отменить.')) {
    chrome.runtime.sendMessage({action: 'clearData'}, (response) => {
      if (response && response.status === 'cleared') {
        updateStatus();
        showNotification('🗑️ Данные очищены', 'info');
      }
    });
  }
}

// Запуск автоматической прокрутки
function startAutoScroll() {
  // Получаем настройки скорости
  chrome.storage.local.get(['scrollSpeed', 'maxScrolls'], (settings) => {
    const scrollSpeed = settings.scrollSpeed || 3;
    const maxScrolls = settings.maxScrolls || 50;
    
    chrome.runtime.sendMessage({
      action: 'startAutoScroll',
      scrollSpeed: scrollSpeed,
      maxScrolls: maxScrolls
    }, (response) => {
      if (response && response.status === 'started') {
        autoScrollBtn.style.display = 'none';
        stopScrollBtn.style.display = 'block';
        showNotification(`📜 Автопрокрутка запущена! (${scrollSpeed}с интервал)`, 'success');
        updateAutoScrollStatus();
      }
    });
  });
}

// Остановка автоматической прокрутки
function stopAutoScroll() {
  chrome.runtime.sendMessage({action: 'stopAutoScroll'}, (response) => {
    if (response && response.status === 'stopped') {
      autoScrollBtn.style.display = 'block';
      stopScrollBtn.style.display = 'none';
      showNotification('⏹️ Автопрокрутка остановлена', 'info');
      updateAutoScrollStatus();
    }
  });
}

// Обновление статуса автоматической прокрутки
function updateAutoScrollStatus() {
  chrome.runtime.sendMessage({action: 'getAutoScrollStatus'}, (response) => {
    if (response && response.status) {
      const status = response.status;
      if (status.isScrolling) {
        autoScrollBtn.style.display = 'none';
        stopScrollBtn.style.display = 'block';
        
        // Добавляем информацию о прокрутке в статус
        const currentDetails = statusDetails.innerHTML;
        if (!currentDetails.includes('Прокрутка:')) {
          statusDetails.innerHTML += `<br><small>📜 Прокрутка: ${status.scrollCount}, Элементов: ${status.itemCount}</small>`;
        }
      } else {
        autoScrollBtn.style.display = 'block';
        stopScrollBtn.style.display = 'none';
      }
    }
  });
}

// Таймер сессии
function startTimer() {
  timerInterval = setInterval(() => {
    if (sessionStartTime) {
      const elapsed = Date.now() - sessionStartTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      sessionTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

// Показ уведомлений
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: white;
    font-size: 13px;
    font-weight: 600;
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;
  
  switch (type) {
    case 'success':
      notification.style.background = 'linear-gradient(135deg, #34a853, #4caf50)';
      break;
    case 'error':
      notification.style.background = 'linear-gradient(135deg, #ea4335, #f44336)';
      break;
    default:
      notification.style.background = 'linear-gradient(135deg, #1a73e8, #4285f4)';
  }
  
  notification.innerHTML = message;
  document.body.appendChild(notification);
  
  // Добавляем CSS анимацию
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  // Удаляем уведомление через 4 секунды
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => notification.remove(), 300);
    }
  }, 4000);
  
  // Добавляем анимацию исчезновения
  const slideOutStyle = document.createElement('style');
  slideOutStyle.textContent = `
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(slideOutStyle);
}

// Форматирование чисел
function formatNumber(num) {
  if (num >= 1000) {
    return (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + 'K';
  }
  return num.toString();
}

// Обновляем статус каждые 3 секунды (реже чем в popup)
setInterval(() => {
  updateStatus();
  updateAutoScrollStatus();
}, 3000);

// Обработчик клика по иконке расширения для открытия sidebar
if (chrome.action) {
  chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
  });
}
