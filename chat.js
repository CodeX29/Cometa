// ==================== КОНФИГУРАЦИЯ JSONBIN ====================
// ВАЖНО: ЗАМЕНИТЕ НА СВОИ РЕАЛЬНЫЕ ЗНАЧЕНИЯ!
const CONFIG = {
    API_KEY: '$2a$10$gUv5gFLt94xN1CfT/zp2beY3Bhg4D.TG/3s7ecFFuLagUTSFaVOji', // Ваш реальный ключ
    BIN_ID: '69a32dabd0ea881f40e277bb',                     // Ваш реальный ID
    BASE_URL: 'https://api.jsonbin.io/v3'
};

// Кодируем ключ для безопасной передачи
const ENCODED_API_KEY = encodeURIComponent(CONFIG.API_KEY);

// ==================== ГЛАВНЫЙ КЛАСС ЧАТА ====================
class CometaChat {
    constructor() {
        this.currentUser = null;
        this.currentChat = null;
        this.users = [];
        this.messages = {};
        this.chats = [];
        this.updateInterval = null;
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
            
            // Используем закодированный ключ
            const headers = new Headers();
            headers.append('X-Master-Key', CONFIG.API_KEY);
            headers.append('X-Bin-Meta', 'false');
            
            const response = await fetch(`${CONFIG.BASE_URL}/b/${CONFIG.BIN_ID}/latest`, {
                method: 'GET',
                headers: headers
            });
            
            console.log('📡 Статус ответа:', response.status);
            
            if (response.status === 404) {
                console.log('📦 Bin не найден, создаем новый...');
                await this.createNewBin();
                return;
            }
            
            if (!response.ok) {
                throw new Error(`Ошибка сервера: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('📦 Данные получены');
            
            // Инициализируем структуру
            this.users = data.users || [];
            this.chats = data.chats || [];
            this.messages = data.messages || {};
            
            console.log('✅ Данные загружены');
            console.log('👥 Пользователей:', this.users.length);
            
        } catch (error) {
            console.error('❌ Ошибка загрузки:', error);
            alert('Ошибка подключения к хранилищу. Проверьте ключи API в файле chat.js');
        }
    }

    // Создание нового bin
    async createNewBin() {
        try {
            const headers = new Headers();
            headers.append('Content-Type', 'application/json');
            headers.append('X-Master-Key', CONFIG.API_KEY);
            
            const response = await fetch(`${CONFIG.BASE_URL}/b`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    users: [],
                    chats: [],
                    messages: {}
                })
            });
            
            if (response.ok) {
                const newBin = await response.json();
                console.log('✅ Новый bin создан! ID:', newBin.metadata.id);
                alert(`✅ Bin создан!\n\nID: ${newBin.metadata.id}\n\nСкопируйте этот ID в файл chat.js`);
                
                // Обновляем ID
                CONFIG.BIN_ID = newBin.metadata.id;
                
                this.users = [];
                this.chats = [];
                this.messages = {};
                
                await this.saveData();
            } else {
                throw new Error('Не удалось создать bin');
            }
        } catch (error) {
            console.error('❌ Ошибка создания bin:', error);
            alert('Не удалось создать хранилище. Проверьте API ключ');
        }
    }

    // Сохранение данных
    async saveData() {
        try {
            console.log('💾 Сохраняем данные...');
            
            const headers = new Headers();
            headers.append('Content-Type', 'application/json');
            headers.append('X-Master-Key', CONFIG.API_KEY);
            
            const response = await fetch(`${CONFIG.BASE_URL}/b/${CONFIG.BIN_ID}`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify({
                    users: this.users,
                    chats: this.chats,
                    messages: this.messages
                })
            });
            
            if (!response.ok) {
                throw new Error(`Ошибка сохранения: ${response.status}`);
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
            
            // Обновляем статус пользователя
            const user = this.users.find(u => u.id === this.currentUser.id);
            if (user) {
                user.status = 'online';
                user.lastSeen = new Date().toISOString();
                this.saveData();
            }
            
            this.hideAuthModal();
            this.loadUserChats();
            this.startMessagePolling();
            this.updateUI();
        }
    }

    // Регистрация
    async register(username, password) {
        // Проверяем, есть ли уже такой пользователь
        if (this.users.find(u => u.username === username)) {
            this.showNotification('Пользователь уже существует', 'error');
            return false;
        }

        // Создаем нового пользователя
        const newUser = {
            id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            username: username,
            password: this.hashPassword(password),
            avatar: username.charAt(0).toUpperCase(),
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            status: 'online',
            chats: []
        };

        this.users.push(newUser);
        await this.saveData();

        this.currentUser = newUser;
        localStorage.setItem('cometa-user', JSON.stringify(newUser));
        
        this.hideAuthModal();
        this.loadUserChats();
        this.startMessagePolling();
        this.updateUI();
        
        this.showNotification('Регистрация успешна!', 'success');
        return true;
    }

    // Вход
    async login(username, password) {
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
        
        // Обновляем статус
        user.status = 'online';
        user.lastSeen = new Date().toISOString();
        await this.saveData();
        
        this.hideAuthModal();
        this.loadUserChats();
        this.startMessagePolling();
        this.updateUI();
        
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
        localStorage.removeItem('cometa-user');
        clearInterval(this.updateInterval);
        window.location.reload();
    }

    // Хеш пароля
    hashPassword(password) {
        return btoa(password + '_cometa_salt_2024');
    }

    // ==================== ЧАТЫ ====================

    // Загрузка чатов пользователя
    loadUserChats() {
        if (!this.currentUser) return;
        
        const userChats = this.chats.filter(chat => 
            chat.participants && chat.participants.includes(this.currentUser.id)
        );

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
        if (!otherUser) return;

        // Проверяем, существует ли уже чат
        const existingChat = this.chats.find(chat => 
            chat.participants && 
            chat.participants.includes(this.currentUser.id) && 
            chat.participants.includes(otherUserId)
        );

        if (existingChat) {
            this.openChat(existingChat.id, otherUser);
            return;
        }

        // Создаем новый чат
        const newChat = {
            id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
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
        
        this.openChat(newChat.id, otherUser);
        this.loadUserChats();
        
        closeModal('newChatModal');
    }

    // Открыть чат
    openChat(chatId, otherUser) {
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
    }

    // ==================== СООБЩЕНИЯ ====================

    // Отправка сообщения
    async sendMessage(text) {
        if (!this.currentChat || !text.trim()) return;

        const message = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            senderId: this.currentUser.id,
            senderName: this.currentUser.username,
            text: text.trim(),
            timestamp: new Date().toISOString(),
            read: false
        };

        if (!this.messages[this.currentChat.id]) {
            this.messages[this.currentChat.id] = [];
        }
        
        this.messages[this.currentChat.id].push(message);

        const chat = this.chats.find(c => c.id === this.currentChat.id);
        if (chat) {
            chat.lastMessage = text.trim();
            chat.lastMessageTime = new Date().toISOString();
        }

        const saved = await this.saveData();
        
        if (saved) {
            this.renderMessages(this.currentChat.id);
            this.loadUserChats();
            document.getElementById('messageInput').value = '';
        } else {
            this.showNotification('Ошибка отправки сообщения', 'error');
        }
    }

    // Рендер сообщений
    renderMessages(chatId) {
        const container = document.getElementById('messagesContainer');
        const messages = this.messages[chatId] || [];

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
            if (!otherUser) return;

            const lastMessage = chat.lastMessage || 'Нет сообщений';
            const unreadCount = this.getUnreadCount(chat.id);
            const time = chat.lastMessageTime ? this.formatMessageTime(chat.lastMessageTime) : '';

            const userJson = JSON.stringify(otherUser).replace(/"/g, '&quot;');

            html += `
                <div class="chat-item ${chat.id === this.currentChat?.id ? 'active' : ''}" 
                     onclick='chatApp.openChat("${chat.id}", ${userJson})'>
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
                this.saveData();
            }
        }
    }

    // ==================== ПОИСК ПОЛЬЗОВАТЕЛЕЙ ====================

    searchUsers(query) {
        if (!query) return [];
        
        query = query.toLowerCase();
        return this.users.filter(user => 
            user.id !== this.currentUser.id &&
            user.username.toLowerCase().includes(query)
        ).slice(0, 10);
    }

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

    // ==================== ОБНОВЛЕНИЕ ====================

    startMessagePolling() {
        this.updateInterval = setInterval(async () => {
            if (this.currentUser) {
                await this.loadData();
                if (this.currentChat) {
                    this.renderMessages(this.currentChat.id);
                }
                this.loadUserChats();
            }
        }, 3000);
    }

    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

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

    hideAuthModal() {
        document.getElementById('authModal').style.display = 'none';
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
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
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    scrollToBottom() {
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            container.scrollTop = container.scrollHeight;
        }, 100);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(date) {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return 'Сегодня';
        if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
        return date.toLocaleDateString('ru-RU');
    }

    formatMessageTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    }

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

    loadTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
            document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun"></i>';
        }
    }

    // ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================

    setupEventListeners() {
        document.getElementById('themeToggle').addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            document.getElementById('themeToggle').innerHTML = isDark ? 
                '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        });

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

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            await this.login(username, password);
        });

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

        document.getElementById('newChatBtn').addEventListener('click', () => {
            document.getElementById('newChatModal').classList.add('show');
            document.getElementById('newChatSearch').value = '';
            document.getElementById('searchResults').innerHTML = '';
            document.getElementById('newChatSearch').focus();
        });

        document.getElementById('newChatSearch').addEventListener('input', (e) => {
            this.showSearchResults(e.target.value);
        });

        document.getElementById('sendBtn').addEventListener('click', () => {
            const input = document.getElementById('messageInput');
            this.sendMessage(input.value);
        });

        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage(e.target.value);
            }
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('show');
        });

        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
            }
        });
    }
}

// ==================== ЗАПУСК ====================
const chatApp = new CometaChat();

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}
