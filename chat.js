// ==================== КОНФИГУРАЦИЯ JSONBIN ====================
const CONFIG = {
    API_KEY: '$2a$10$gUv5gFLt94xN1CfT/zp2beY3Bhg4D.TG/3s7ecFFuLagUTSFaVOji',     // Вставьте сюда ваш ключ
    BIN_ID: '69a32dabd0ea881f40e277bb',        // Вставьте сюда ваш ID
    BASE_URL: 'https://api.jsonbin.io/v3'
};

// ==================== ГЛАВНЫЙ КЛАСС ЧАТА ====================
class CometaChat {
    constructor() {
        this.currentUser = null;
        this.currentChat = null;
        this.currentChatId = null;
        this.users = [];
        this.messages = {};
        this.chats = [];
        this.updateInterval = null;
        this.lastMessageCount = {};
        this.init();
    }

    // Инициализация
    async init() {
        await this.loadData();
        this.checkSession();
        this.setupEventListeners();
        this.loadTheme();
    }

    // Загрузка данных из JSONBin
    async loadData() {
        try {
            console.log('🔄 Загружаем данные...');
            
            const response = await fetch(`${CONFIG.BASE_URL}/b/${CONFIG.BIN_ID}/latest?meta=false`, {
                method: 'GET',
                headers: {
                    'X-Master-Key': CONFIG.API_KEY
                }
            });
            
            if (response.status === 404) {
                console.log('📦 Bin не найден, создаем новый...');
                await this.createNewBin();
                return;
            }
            
            if (!response.ok) {
                throw new Error(`Ошибка: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Инициализируем структуру
            this.users = data.users || [];
            this.chats = data.chats || [];
            this.messages = data.messages || {};
            
            console.log('✅ Данные загружены');
            console.log('👥 Пользователей:', this.users.length);
            console.log('💬 Чатов:', this.chats.length);
            console.log('📨 Сообщений по чатам:', Object.keys(this.messages).length);
            
            // После загрузки обновляем интерфейс
            if (this.currentUser) {
                this.loadUserChats();
                if (this.currentChatId) {
                    this.renderMessages(this.currentChatId);
                }
            }
            
        } catch (error) {
            console.error('❌ Ошибка загрузки:', error);
        }
    }

    // Создание нового bin
    async createNewBin() {
        try {
            const response = await fetch(`${CONFIG.BASE_URL}/b`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': CONFIG.API_KEY
                },
                body: JSON.stringify({
                    users: [],
                    chats: [],
                    messages: {}
                })
            });
            
            if (response.ok) {
                const newBin = await response.json();
                console.log('✅ Новый bin создан! ID:', newBin.metadata.id);
                alert(`✅ Создан новый bin!\n\nID: ${newBin.metadata.id}\n\nСкопируйте его в файл chat.js`);
                CONFIG.BIN_ID = newBin.metadata.id;
            }
        } catch (error) {
            console.error('❌ Ошибка создания bin:', error);
        }
    }

    // Сохранение данных
    async saveData() {
        try {
            console.log('💾 Сохраняем данные...');
            
            const response = await fetch(`${CONFIG.BASE_URL}/b/${CONFIG.BIN_ID}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': CONFIG.API_KEY
                },
                body: JSON.stringify({
                    users: this.users,
                    chats: this.chats,
                    messages: this.messages
                })
            });
            
            if (!response.ok) {
                throw new Error(`Ошибка: ${response.status}`);
            }
            
            console.log('✅ Данные сохранены');
            return true;
            
        } catch (error) {
            console.error('❌ Ошибка сохранения:', error);
            return false;
        }
    }

    // ==================== АВТОРИЗАЦИЯ ====================

    // Проверка сессии
    checkSession() {
        const savedUser = localStorage.getItem('cometa-user');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            console.log('👤 Текущий пользователь:', this.currentUser.username);
            
            // Обновляем статус пользователя
            const user = this.users.find(u => u.id === this.currentUser.id);
            if (user) {
                user.status = 'online';
                user.lastSeen = new Date().toISOString();
                this.saveData();
            }
            
            this.hideAuthModal();
            this.updateUI();
            this.loadUserChats();
            this.startMessagePolling();
        }
    }

    // Регистрация
    async register(username, password) {
        console.log('📝 Регистрация пользователя:', username);
        
        // Проверяем существование
        if (this.users.find(u => u.username === username)) {
            this.showNotification('Пользователь уже существует', 'error');
            return false;
        }

        // Создаем пользователя
        const newUser = {
            id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
            username: username,
            password: this.hashPassword(password),
            avatar: username.charAt(0).toUpperCase(),
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            status: 'online'
        };

        this.users.push(newUser);
        await this.saveData();

        this.currentUser = newUser;
        localStorage.setItem('cometa-user', JSON.stringify(newUser));
        
        this.hideAuthModal();
        this.updateUI();
        this.loadUserChats();
        this.startMessagePolling();
        
        this.showNotification('Регистрация успешна!', 'success');
        console.log('✅ Пользователь зарегистрирован:', username);
        return true;
    }

    // Вход
    async login(username, password) {
        console.log('🔑 Вход пользователя:', username);
        
        const hashedPassword = this.hashPassword(password);
        const user = this.users.find(u => 
            u.username === username && 
            u.password === hashedPassword
        );

        if (!user) {
            this.showNotification('Неверный логин или пароль', 'error');
            return false;
        }

        this.currentUser = user;
        localStorage.setItem('cometa-user', JSON.stringify(user));
        
        user.status = 'online';
        user.lastSeen = new Date().toISOString();
        await this.saveData();
        
        this.hideAuthModal();
        this.updateUI();
        this.loadUserChats();
        this.startMessagePolling();
        
        this.showNotification('Добро пожаловать!', 'success');
        return true;
    }

    // Выход
    async logout() {
        if (this.currentUser) {
            const user = this.users.find(u => u.id === this.currentUser.id);
            if (user) {
                user.status = 'offline';
                user.lastSeen = new Date().toISOString();
                await this.saveData();
            }
        }
        
        this.currentUser = null;
        this.currentChatId = null;
        localStorage.removeItem('cometa-user');
        clearInterval(this.updateInterval);
        window.location.reload();
    }

    // Хеш пароля
    hashPassword(password) {
        return btoa(password + '_cometa_2024');
    }

    // ==================== ЧАТЫ ====================

    // Загрузка чатов пользователя
    loadUserChats() {
        if (!this.currentUser) return;
        
        console.log('📋 Загружаем чаты для:', this.currentUser.username);
        
        const userChats = this.chats.filter(chat => 
            chat.participants && chat.participants.includes(this.currentUser.id)
        );

        console.log('📊 Найдено чатов:', userChats.length);

        // Сортируем по последнему сообщению
        userChats.sort((a, b) => {
            const aTime = this.getLastMessageTime(a.id);
            const bTime = this.getLastMessageTime(b.id);
            return bTime - aTime;
        });

        this.renderChatsList(userChats);
    }

    // Получение времени последнего сообщения
    getLastMessageTime(chatId) {
        const chatMessages = this.messages[chatId] || [];
        if (chatMessages.length === 0) return 0;
        return new Date(chatMessages[chatMessages.length - 1].timestamp).getTime();
    }

    // Создание нового чата
    async createChat(otherUserId) {
        const otherUser = this.users.find(u => u.id === otherUserId);
        if (!otherUser) {
            console.error('❌ Пользователь не найден:', otherUserId);
            return;
        }

        console.log('💬 Создаем чат между', this.currentUser.username, 'и', otherUser.username);

        // Проверяем, существует ли уже чат
        const existingChat = this.chats.find(chat => 
            chat.participants && 
            chat.participants.includes(this.currentUser.id) && 
            chat.participants.includes(otherUserId)
        );

        if (existingChat) {
            console.log('✅ Чат уже существует, открываем');
            this.openChat(existingChat.id, otherUser);
            closeModal('newChatModal');
            return;
        }

        // Создаем новый чат
        const newChat = {
            id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
            participants: [this.currentUser.id, otherUserId],
            createdAt: new Date().toISOString(),
            lastMessage: 'Чат создан',
            lastMessageTime: new Date().toISOString()
        };

        this.chats.push(newChat);
        
        if (!this.messages[newChat.id]) {
            this.messages[newChat.id] = [];
        }
        
        await this.saveData();
        
        console.log('✅ Чат создан, ID:', newChat.id);
        
        this.openChat(newChat.id, otherUser);
        this.loadUserChats();
        
        closeModal('newChatModal');
    }

    // Открыть чат
    openChat(chatId, otherUser) {
        console.log('📨 Открываем чат с', otherUser.username);
        
        this.currentChatId = chatId;
        this.currentChat = {
            id: chatId,
            user: otherUser
        };

        this.markMessagesAsRead(chatId);

        document.getElementById('chatHeader').style.display = 'flex';
        document.getElementById('messageInputContainer').style.display = 'flex';
        document.getElementById('currentChatName').textContent = otherUser.username;
        document.getElementById('currentChatAvatar').textContent = otherUser.avatar || otherUser.username.charAt(0).toUpperCase();
        
        const status = otherUser.status === 'online' ? 'онлайн' : 'был(а) ' + this.formatLastSeen(otherUser.lastSeen);
        document.getElementById('currentChatStatus').innerHTML = `
            <span class="status-dot ${otherUser.status === 'online' ? 'online' : ''}"></span>
            <span>${status}</span>
        `;

        this.renderMessages(chatId);
        
        // На мобильных закрываем сайдбар
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('show');
        }
    }

    // ==================== СООБЩЕНИЯ ====================

    // Отправка сообщения
    async sendMessage(text) {
        if (!this.currentChatId || !text.trim()) return;

        const message = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8),
            senderId: this.currentUser.id,
            senderName: this.currentUser.username,
            text: text.trim(),
            timestamp: new Date().toISOString(),
            read: false
        };

        console.log('📤 Отправляем сообщение:', message.text, 'в чат', this.currentChatId);

        if (!this.messages[this.currentChatId]) {
            this.messages[this.currentChatId] = [];
        }
        
        this.messages[this.currentChatId].push(message);

        const chat = this.chats.find(c => c.id === this.currentChatId);
        if (chat) {
            chat.lastMessage = text.trim();
            chat.lastMessageTime = new Date().toISOString();
        }

        const saved = await this.saveData();
        
        if (saved) {
            console.log('✅ Сообщение сохранено');
            this.renderMessages(this.currentChatId);
            this.loadUserChats();
            document.getElementById('messageInput').value = '';
        }
    }

    // Рендер сообщений
    renderMessages(chatId) {
        const container = document.getElementById('messagesContainer');
        const messages = this.messages[chatId] || [];

        console.log('📨 Рендерим сообщения для чата', chatId, ':', messages.length, 'сообщений');

        if (messages.length === 0) {
            container.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-comment-dots"></i>
                    <h3>Нет сообщений</h3>
                    <p>Напишите что-нибудь...</p>
                </div>
            `;
            return;
        }

        let html = '';
        let lastDate = '';

        messages.forEach(msg => {
            const date = new Date(msg.timestamp);
            const dateStr = date.toLocaleDateString('ru-RU');
            
            if (dateStr !== lastDate) {
                html += `<div class="message-date-divider">${this.formatDate(date)}</div>`;
                lastDate = dateStr;
            }

            const isOutgoing = msg.senderId === this.currentUser.id;
            const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

            html += `
                <div class="message ${isOutgoing ? 'outgoing' : 'incoming'}">
                    <div class="message-content">${this.escapeHtml(msg.text)}</div>
                    <div class="message-footer">
                        <span class="message-time">${time}</span>
                        ${isOutgoing ? `<span class="message-status">
                            <i class="fas fa-${msg.read ? 'check-double' : 'check'}"></i>
                        </span>` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        this.scrollToBottom();
    }

    // Рендер списка чатов
    renderChatsList(chats) {
        const container = document.getElementById('chatsList');

        if (chats.length === 0) {
            container.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-comment-slash"></i>
                    <p>У вас пока нет чатов</p>
                    <button class="auth-submit" onclick="document.getElementById('newChatBtn').click()" style="margin-top: 15px;">
                        Найти собеседника
                    </button>
                </div>
            `;
            return;
        }

        let html = '';

        chats.forEach(chat => {
            const otherUserId = chat.participants.find(id => id !== this.currentUser.id);
            const otherUser = this.users.find(u => u.id === otherUserId);
            
            if (!otherUser) {
                console.warn('⚠️ Собеседник не найден для чата', chat.id);
                return;
            }

            const lastMessage = chat.lastMessage || 'Нет сообщений';
            const unreadCount = this.getUnreadCount(chat.id);
            const time = chat.lastMessageTime ? this.formatMessageTime(chat.lastMessageTime) : '';

            // Проверяем, есть ли непрочитанные сообщения от другого пользователя
            const hasUnread = this.messages[chat.id] ? 
                this.messages[chat.id].some(m => !m.read && m.senderId !== this.currentUser.id) : false;

            html += `
                <div class="chat-item ${chat.id === this.currentChatId ? 'active' : ''} ${hasUnread ? 'has-unread' : ''}" 
                     onclick="chatApp.openChat('${chat.id}', ${JSON.stringify(otherUser).replace(/"/g, '&quot;')})">
                    <div class="chat-avatar">
                        ${otherUser.avatar || otherUser.username.charAt(0).toUpperCase()}
                        <span class="status-dot-mini ${otherUser.status === 'online' ? 'online' : ''}"></span>
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${otherUser.username}</div>
                        <div class="last-message">${this.escapeHtml(lastMessage)}</div>
                    </div>
                    <div class="chat-meta">
                        <div class="chat-time">${time}</div>
                        ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // Получение количества непрочитанных сообщений
    getUnreadCount(chatId) {
        const messages = this.messages[chatId] || [];
        return messages.filter(msg => 
            msg.senderId !== this.currentUser.id && !msg.read
        ).length;
    }

    // Отметить сообщения как прочитанные
    markMessagesAsRead(chatId) {
        const messages = this.messages[chatId];
        if (messages) {
            let changed = false;
            messages.forEach(msg => {
                if (msg.senderId !== this.currentUser.id && !msg.read) {
                    msg.read = true;
                    changed = true;
                }
            });
            if (changed) {
                console.log('📖 Отмечены как прочитанные в чате', chatId);
                this.saveData();
            }
        }
    }

    // ==================== ПОИСК ПОЛЬЗОВАТЕЛЕЙ ====================

    // Поиск пользователей
    searchUsers(query) {
        if (!query || query.length < 1) return [];
        
        query = query.toLowerCase();
        console.log('🔍 Поиск пользователей по запросу:', query);
        
        const results = this.users.filter(user => {
            // Не показываем текущего пользователя
            if (user.id === this.currentUser.id) return false;
            
            // Проверяем совпадение по имени
            return user.username.toLowerCase().includes(query);
        });
        
        console.log('✅ Найдено результатов:', results.length);
        return results.slice(0, 10);
    }

    // Показать результаты поиска
    showSearchResults(query) {
        const results = this.searchUsers(query);
        const container = document.getElementById('searchResults');

        if (results.length === 0) {
            container.innerHTML = '<div class="loading">Пользователи не найдены</div>';
            return;
        }

        let html = '';
        results.forEach(user => {
            html += `
                <div class="search-result-item" onclick="chatApp.createChat('${user.id}')">
                    <div class="search-result-avatar">${user.avatar || user.username.charAt(0).toUpperCase()}</div>
                    <div class="search-result-info">
                        <div class="search-result-name">${user.username}</div>
                        <div class="search-result-status">
                            <span class="status-dot ${user.status === 'online' ? 'online' : ''}"></span>
                            ${user.status === 'online' ? 'онлайн' : 'офлайн'}
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // ==================== ОБНОВЛЕНИЕ В РЕАЛЬНОМ ВРЕМЕНИ ====================

    // Запуск опроса новых сообщений
    startMessagePolling() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(async () => {
            if (this.currentUser) {
                // Сохраняем старые данные для сравнения
                const oldMessages = JSON.stringify(this.messages);
                const oldChats = JSON.stringify(this.chats);
                
                await this.loadData();
                
                // Проверяем, изменились ли сообщения
                if (JSON.stringify(this.messages) !== oldMessages) {
                    console.log('🔄 Обнаружены новые сообщения');
                    
                    // Обновляем список чатов
                    this.loadUserChats();
                    
                    // Если открыт чат, обновляем сообщения
                    if (this.currentChatId) {
                        this.renderMessages(this.currentChatId);
                        
                        // Проверяем, есть ли новые сообщения в открытом чате
                        const currentChatMessages = this.messages[this.currentChatId] || [];
                        const lastMessage = currentChatMessages[currentChatMessages.length - 1];
                        
                        // Если последнее сообщение не от текущего пользователя, показываем уведомление
                        if (lastMessage && lastMessage.senderId !== this.currentUser.id) {
                            this.showNotification(`Новое сообщение от ${lastMessage.senderName}`, 'info');
                        }
                    }
                }
                
                // Проверяем, изменились ли чаты
                if (JSON.stringify(this.chats) !== oldChats) {
                    console.log('🔄 Обновлен список чатов');
                    this.loadUserChats();
                }
            }
        }, 2000); // Проверяем каждые 2 секунды
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ ====================

    // Обновление UI
    updateUI() {
        if (this.currentUser) {
            document.getElementById('username').textContent = this.currentUser.username;
            document.getElementById('userAvatar').textContent = this.currentUser.avatar || this.currentUser.username.charAt(0).toUpperCase();
            document.getElementById('userStatusDisplay').innerHTML = `
                <span class="status-dot online"></span>
                <span>онлайн</span>
            `;
        }
    }

    // Скрыть модальное окно авторизации
    hideAuthModal() {
        document.getElementById('authModal').style.display = 'none';
    }

    // Показать уведомление
    showNotification(message, type = 'info') {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#4299e1'};
            color: white;
            border-radius: 8px;
            z-index: 2000;
            animation: slideIn 0.3s;
            box-shadow: 0 5px 20px rgba(0,0,0,0.2);
            cursor: pointer;
        `;
        
        document.body.appendChild(notification);
        
        // Убираем через 3 секунды
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
        
        // Добавляем стили для анимации
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // Прокрутка вниз
    scrollToBottom() {
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            container.scrollTop = container.scrollHeight;
        }, 100);
    }

    // Защита от XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Форматирование даты
    formatDate(date) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return 'Сегодня';
        if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
        return date.toLocaleDateString('ru-RU');
    }

    // Форматирование времени сообщения
    formatMessageTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    }

    // Форматирование последнего визита
    formatLastSeen(timestamp) {
        if (!timestamp) return 'никогда';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000 / 60);

        if (diff < 1) return 'только что';
        if (diff < 60) return `${diff} мин назад`;
        if (diff < 1440) return `${Math.floor(diff / 60)} ч назад`;
        return date.toLocaleDateString('ru-RU');
    }

    // Загрузка темы
    loadTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    // ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================

    setupEventListeners() {
        // Переключение темы
        document.getElementById('themeToggle').addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            document.getElementById('themeToggle').innerHTML = isDark ? 
                '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        });

        // Переключение между вкладками
        document.getElementById('loginTab').addEventListener('click', () => {
            document.getElementById('loginTab').classList.add('active');
            document.getElementById('registerTab').classList.remove('active');
            document.getElementById('loginForm').classList.add('active');
            document.getElementById('registerForm').classList.remove('active');
        });

        document.getElementById('registerTab').addEventListener('click', () => {
            document.getElementById('registerTab').classList.add('active');
            document.getElementById('loginTab').classList.remove('active');
            document.getElementById('registerForm').classList.add('active');
            document.getElementById('loginForm').classList.remove('active');
        });

        // Форма входа
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            await this.login(username, password);
        });

        // Форма регистрации
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername').value;
            const password = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regConfirmPassword').value;

            if (password !== confirm) {
                this.showNotification('Пароли не совпадают', 'error');
                return;
            }

            if (password.length < 6) {
                this.showNotification('Пароль должен быть минимум 6 символов', 'error');
                return;
            }

            await this.register(username, password);
        });

        // Кнопка нового чата
        document.getElementById('newChatBtn').addEventListener('click', () => {
            document.getElementById('newChatModal').classList.add('show');
            document.getElementById('newChatSearch').value = '';
            document.getElementById('searchResults').innerHTML = '';
            document.getElementById('newChatSearch').focus();
        });

        // Поиск пользователей
        document.getElementById('newChatSearch').addEventListener('input', (e) => {
            this.showSearchResults(e.target.value);
        });

        // Отправка сообщения
        document.getElementById('sendBtn').addEventListener('click', () => {
            const input = document.getElementById('messageInput');
            this.sendMessage(input.value);
        });

        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage(e.target.value);
            }
        });

        // Выход
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Меню на мобильных
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('show');
        });

        // Закрытие модалок по клику вне
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
            }
        });
    }
}

// ==================== ЗАПУСК ====================
const chatApp = new CometaChat();

// Глобальная функция для закрытия модалок
function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}
