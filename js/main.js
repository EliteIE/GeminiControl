// js/main.js - Com integração de Autenticação Firebase

// Configurações e Inicialização
document.addEventListener('DOMContentLoaded', function() {
    // Configurar listeners de eventos primeiro
    setupEventListeners();
    
    // Verificar estado de autenticação do Firebase
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            // Usuário está logado
            console.log("Usuário logado:", user.uid, user.email);
            try {
                // Buscar dados adicionais do usuário no Firestore (incluindo 'role')
                const userData = await fetchUserDataFromFirestore(user.uid, user.email); 

                if (userData && userData.role) { // Garante que userData e role existam
                    // Salvar informações importantes (como o cargo) para fácil acesso, se necessário
                    localStorage.setItem('elitecontrol_user_role', userData.role); 
                    
                    initializeUI(userData); // Passa os dados do usuário para inicializar a UI
                    
                    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
                        window.location.href = 'dashboard.html';
                    }
                } else {
                    // Não encontrou dados do usuário ou o 'role' no Firestore
                    console.error("Dados do usuário ou cargo (role) não encontrados no Firestore para UID:", user.uid, "Email:", user.email);
                    let errorMessage = "Seu usuário não foi encontrado em nossa base de dados ou está incompleto.";
                    if (!userData) {
                        errorMessage = "Não foi possível carregar os dados do seu usuário.";
                    } else if (!userData.role) {
                        errorMessage = "Seu perfil de usuário não possui um cargo definido. Contate o suporte.";
                    }
                    showLoginError(errorMessage); // Mostra o erro na página de login, se aplicável
                    showTemporaryAlert(errorMessage, "error"); // Mostra alerta global

                    await firebase.auth().signOut(); // Força o logout
                }
            } catch (error) {
                console.error("Erro ao buscar dados do usuário do Firestore:", error);
                showTemporaryAlert("Erro ao carregar dados do usuário. Verifique sua conexão.", "error");
                // Considerar deslogar o usuário em caso de erro crítico
                // await firebase.auth().signOut(); 
            }
        } else {
            // Usuário está deslogado
            console.log("Nenhum usuário logado.");
            localStorage.removeItem('elitecontrol_user_role');
            if (document.getElementById('userInitials')) { 
                 clearDashboardUI();
            }
            if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
                window.location.href = 'index.html';
            }
        }
    });
});

// Busca dados do usuário EXCLUSIVAMENTE do Firestore
async function fetchUserDataFromFirestore(uid, email) {
    if (!db) { // db é a instância do Firestore inicializada em firebase-config.js
        console.error("Firestore (db) não está inicializado!");
        throw new Error("Conexão com banco de dados não disponível.");
    }
    try {
        // Tenta buscar pelo UID primeiro (método preferencial)
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();

        if (userDoc.exists) {
            console.log("Dados do usuário encontrados pelo UID:", uid);
            return { uid: uid, email: email, ...userDoc.data() }; // name, role, etc.
        } else {
            // Fallback: Se não encontrar pelo UID, tenta buscar pelo email.
            // Isso pode ser útil em cenários de migração ou se o UID não for o ID do documento por algum motivo.
            console.warn(`Documento do usuário não encontrado pelo UID: ${uid}. Tentando buscar pelo email: ${email}`);
            const querySnapshot = await db.collection('users').where('email', '==', email).limit(1).get();
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                console.log("Dados do usuário encontrados pelo email:", email, "com UID do documento:", doc.id);
                // É importante retornar o UID original do Auth, mas os dados do documento encontrado
                return { uid: uid, email: email, ...doc.data() }; 
            } else {
                console.warn(`Nenhum usuário encontrado no Firestore com o email: ${email}`);
                return null; // Usuário não encontrado no Firestore
            }
        }
    } catch (error) {
        console.error("Erro ao buscar dados do usuário no Firestore:", error);
        throw error; // Propaga o erro para ser tratado no onAuthStateChanged
    }
}


// Funções de Inicialização da UI
function initializeUI(currentUser) { 
    if (!currentUser) return; 

    updateUserInfo(currentUser);
    initializeNotifications();
    initializeSidebar(currentUser.role); 
    
    if (document.getElementById('salesChart')) {
        renderDashboardMainCharts(); 
    }
    
    if (document.getElementById('temporaryAlertsContainer') && window.location.href.includes('dashboard.html')) {
        if (!sessionStorage.getItem('welcomeAlertShown')) {
            showTemporaryAlert(`Bem-vindo, ${currentUser.name || currentUser.email}! Sistema EliteControl.`, 'success', 5000);
            sessionStorage.setItem('welcomeAlertShown', 'true');
        }
    }
}

function clearDashboardUI() {
    const userInitials = document.getElementById('userInitials');
    const userDropdownInitials = document.getElementById('userDropdownInitials');
    if (userInitials) userInitials.textContent = 'U';
    if (userDropdownInitials) userDropdownInitials.textContent = 'U';

    const usernameDisplay = document.getElementById('usernameDisplay');
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    const userDropdownName = document.getElementById('userDropdownName');
    const userDropdownEmail = document.getElementById('userDropdownEmail');
    if (usernameDisplay) usernameDisplay.textContent = 'Usuário';
    if (userRoleDisplay) userRoleDisplay.textContent = 'Cargo';
    if (userDropdownName) userDropdownName.textContent = 'Usuário';
    if (userDropdownEmail) userDropdownEmail.textContent = 'usuario@exemplo.com';
    
    const pageTitle = document.getElementById('pageTitle');
    const sidebarProfileName = document.getElementById('sidebarProfileName');
    if (pageTitle) pageTitle.textContent = 'EliteControl';
    if (sidebarProfileName) sidebarProfileName.textContent = 'Painel';

    const navLinks = document.getElementById('navLinks');
    if (navLinks) navLinks.innerHTML = '';

    const kpiValues = document.querySelectorAll('.kpi-value');
    kpiValues.forEach(kpi => {
        if (!kpi.querySelector('button')) { 
            kpi.textContent = '0';
        }
    });
     const kpiTodaySalesValue = document.querySelector('#kpiContainer .kpi-card:nth-child(1) .kpi-value');
    if (kpiTodaySalesValue) kpiTodaySalesValue.textContent = formatCurrency(0);
    sessionStorage.removeItem('welcomeAlertShown');
}


// Atualizar Informações do Usuário na UI
function updateUserInfo(user) { 
    if (!user) return;

    const userInitialsEl = document.getElementById('userInitials');
    const userDropdownInitialsEl = document.getElementById('userDropdownInitials');
    
    if (user.name && userInitialsEl) {
        const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
        userInitialsEl.textContent = initials;
        if (userDropdownInitialsEl) {
            userDropdownInitialsEl.textContent = initials;
        }
    } else if (user.email && userInitialsEl) { // Fallback para email se não houver nome
        const initials = user.email.substring(0, 2).toUpperCase();
        userInitialsEl.textContent = initials;
        if (userDropdownInitialsEl) {
            userDropdownInitialsEl.textContent = initials;
        }
    }
    
    const usernameDisplay = document.getElementById('usernameDisplay');
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    const userDropdownName = document.getElementById('userDropdownName');
    const userDropdownEmail = document.getElementById('userDropdownEmail');
    
    if (usernameDisplay) usernameDisplay.textContent = user.name || user.email; // Mostra email se nome não existir
    if (userRoleDisplay && user.role) userRoleDisplay.textContent = user.role;
    if (userDropdownName) userDropdownName.textContent = user.name || user.email;
    if (userDropdownEmail && user.email) userDropdownEmail.textContent = user.email;

    const pageTitle = document.getElementById('pageTitle');
    const sidebarProfileName = document.getElementById('sidebarProfileName');

    if (sidebarProfileName && pageTitle) {
        let title = `Painel ${user.role || 'Usuário'}`;
        if (user.role === 'Dono/Gerente') {
            title = 'Painel Dono/Gerente';
        } else if (user.role === 'Controlador de Estoque') {
            title = 'Painel Controlador de Estoque';
        } else if (user.role === 'Vendedor') {
            title = 'Painel Vendedor';
        }
        sidebarProfileName.textContent = title;
        pageTitle.textContent = title;
    }
}

// Configurar Event Listeners
function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
    
    const notificationBellButton = document.getElementById('notificationBellButton');
    const notificationDropdown = document.getElementById('notificationDropdown');
    
    if (notificationBellButton && notificationDropdown) {
        notificationBellButton.addEventListener('click', function(e) {
            e.stopPropagation();
            notificationDropdown.classList.toggle('hidden');
        });
        
        document.addEventListener('click', function(e) {
            if (notificationBellButton && !notificationBellButton.contains(e.target) && notificationDropdown && !notificationDropdown.contains(e.target)) {
                notificationDropdown.classList.add('hidden');
            }
        });
    }
    
    const markAllAsReadButton = document.getElementById('markAllAsReadButton');
    if (markAllAsReadButton) {
        markAllAsReadButton.addEventListener('click', function() {
            markAllNotificationsAsRead(); 
        });
    }
    
    const userMenuButton = document.getElementById('userMenuButton');
    const userDropdown = document.getElementById('userDropdown');
    
    if (userMenuButton && userDropdown) {
        userMenuButton.addEventListener('click', function(e) {
            e.stopPropagation();
            userDropdown.classList.toggle('hidden');
        });
        
        document.addEventListener('click', function(e) {
             if (userMenuButton && !userMenuButton.contains(e.target) && userDropdown && !userDropdown.contains(e.target)) {
                userDropdown.classList.add('hidden');
            }
        });
    }
    
    if (window.location.href.includes('dashboard.html')) {
        const newSaleButton = document.getElementById('newSaleButton');
        if (newSaleButton) {
            newSaleButton.addEventListener('click', function() {
                showTemporaryAlert('Iniciando registro de nova venda...', 'info');
            });
        }
        
        const salesChartOptionsButton = document.getElementById('salesChartOptionsButton');
        if (salesChartOptionsButton) {
            salesChartOptionsButton.addEventListener('click', function() {
                showTemporaryAlert('Opções do gráfico de vendas', 'info');
            });
        }
        
        const productsChartOptionsButton = document.getElementById('productsChartOptionsButton');
        if (productsChartOptionsButton) {
            productsChartOptionsButton.addEventListener('click', function() {
                showTemporaryAlert('Opções do gráfico de produtos', 'info');
            });
        }
        
        document.addEventListener('click', function(e) {
            const navLink = e.target.closest('#navLinks a.nav-link');
            if (navLink) {
                e.preventDefault();
                const navLinks = document.querySelectorAll('#navLinks a.nav-link');
                navLinks.forEach(l => l.classList.remove('active'));
                navLink.classList.add('active');
                const sectionName = navLink.querySelector('span').textContent;
                showTemporaryAlert(`Navegando para: ${sectionName}`, 'info');
            }
        });
    }
}

// Manipulador de Login
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        showLoginError('Por favor, preencha email e senha.');
        return;
    }
    
    const loginButton = e.target.querySelector('button[type="submit"]');
    const originalButtonText = loginButton.textContent;
    loginButton.disabled = true;
    loginButton.textContent = 'Entrando...';

    try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
        showLoginError(''); 
    } catch (error) {
        console.error("Erro de login:", error);
        let friendlyMessage = "Email ou senha inválidos.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') { // 'auth/invalid-credential' é mais comum agora
            friendlyMessage = "Usuário não encontrado ou senha incorreta.";
        } else if (error.code === 'auth/wrong-password') { // Pode não ser disparado se 'invalid-credential' for
            friendlyMessage = "Senha incorreta.";
        } else if (error.code === 'auth/invalid-email') {
            friendlyMessage = "O formato do email é inválido.";
        } else if (error.code === 'auth/network-request-failed') {
            friendlyMessage = "Erro de rede. Verifique sua conexão.";
        }
        showLoginError(friendlyMessage);
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = originalButtonText;
    }
}

// Mostrar Erro de Login
function showLoginError(message) {
    const errorElement = document.getElementById('loginErrorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.toggle('hidden', !message); 
    }
}

// Manipulador de Logout
async function handleLogout() {
    try {
        await firebase.auth().signOut();
        sessionStorage.removeItem('welcomeAlertShown'); 
        console.log("Logout realizado com sucesso.");
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
        showTemporaryAlert('Erro ao sair. Tente novamente.', 'error');
    }
}

// Inicializar Notificações
function initializeNotifications() {
    if (!document.getElementById('notificationCountBadge')) return;
    const storedNotifications = localStorage.getItem('elitecontrol_notifications');
    let notifications = [];

    if (storedNotifications) {
        notifications = JSON.parse(storedNotifications);
    } else {
        notifications = [
            { id: 'notif1', title: 'Bem-vindo!', message: 'Seu sistema EliteControl está pronto.', time: 'Agora', read: false, type: 'info' },
            { id: 'notif2', title: 'Dica', message: 'Explore os relatórios para insights.', time: '1h atrás', read: false, type: 'info' }
        ];
        localStorage.setItem('elitecontrol_notifications', JSON.stringify(notifications));
    }
    updateNotificationsUI();
}

// Atualizar UI de Notificações
function updateNotificationsUI() {
    const notificationList = document.getElementById('notificationList');
    const notificationCountBadge = document.getElementById('notificationCountBadge');
    if (!notificationList || !notificationCountBadge) return;

    const notifications = JSON.parse(localStorage.getItem('elitecontrol_notifications') || '[]');
    const unreadCount = notifications.filter(n => !n.read).length;

    notificationCountBadge.textContent = unreadCount;
    notificationCountBadge.classList.toggle('hidden', unreadCount === 0);
    
    notificationList.innerHTML = '';
    if (notifications.length === 0) {
        notificationList.innerHTML = '<div class="p-4 text-center text-slate-400">Nenhuma notificação.</div>';
    } else {
        notifications.forEach(notification => {
            const item = document.createElement('div');
            item.className = `notification-item ${notification.read ? '' : 'unread'}`;
            item.dataset.id = notification.id;
            // Adicionando classes de cor para o badge de notificação
            let badgeClass = 'info'; // default
            if (notification.type === 'warning') badgeClass = 'warning';
            else if (notification.type === 'error') badgeClass = 'error';
            else if (notification.type === 'success') badgeClass = 'success';

            item.innerHTML = `
                <div class="notification-item-header">
                    <div class="notification-item-title">${notification.title}</div>
                    <div class="notification-item-badge ${badgeClass}">${notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}</div>
                </div>
                <div class="notification-item-message">${notification.message}</div>
                <div class="notification-item-footer">
                    <div class="notification-item-time">${notification.time}</div>
                    ${!notification.read ? '<div class="notification-item-action">Marcar como lida</div>' : ''}
                </div>
            `;
            item.addEventListener('click', () => markNotificationAsRead(notification.id));
            notificationList.appendChild(item);
        });
    }
}

// Marcar Notificação como Lida
function markNotificationAsRead(id) {
    let notifications = JSON.parse(localStorage.getItem('elitecontrol_notifications') || '[]');
    notifications = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    localStorage.setItem('elitecontrol_notifications', JSON.stringify(notifications));
    updateNotificationsUI();
}

// Marcar Todas Notificações como Lidas
function markAllNotificationsAsRead() {
    let notifications = JSON.parse(localStorage.getItem('elitecontrol_notifications') || '[]');
    notifications = notifications.map(n => ({ ...n, read: true }));
    localStorage.setItem('elitecontrol_notifications', JSON.stringify(notifications));
    updateNotificationsUI();
    const notificationDropdown = document.getElementById('notificationDropdown');
    if (notificationDropdown) notificationDropdown.classList.add('hidden');
}

// Inicializar Sidebar
function initializeSidebar(role) { 
    if (!document.getElementById('navLinks') || !role) return;

    let links = [];
     if (role === 'Dono/Gerente') {
        links = [
            { icon: 'fa-chart-pie', text: 'Painel Geral', active: true, section: 'geral' },
            { icon: 'fa-boxes-stacked', text: 'Produtos', section: 'produtos' },
            { icon: 'fa-cash-register', text: 'Registrar Venda', section: 'registrar-venda' },
            { icon: 'fa-file-invoice-dollar', text: 'Vendas (Hist/Rel)', section: 'vendas' },
            { icon: 'fa-users-cog', text: 'Usuários', section: 'usuarios' },
            { icon: 'fa-cogs', text: 'Configurações', section: 'config' }
        ];
    } else if (role === 'Controlador de Estoque') {
        links = [
            { icon: 'fa-warehouse', text: 'Painel Estoque', active: true, section: 'estoque' },
            { icon: 'fa-boxes-stacked', text: 'Produtos', section: 'produtos' },
            { icon: 'fa-truck-loading', text: 'Fornecedores', section: 'fornecedores' },
            { icon: 'fa-exchange-alt', text: 'Movimentações', section: 'movimentacoes' },
            { icon: 'fa-clipboard-list', text: 'Relatórios de Estoque', section: 'relatorios-estoque' },
            { icon: 'fa-cog', text: 'Configurações', section: 'config' }
        ];
    } else if (role === 'Vendedor') {
        links = [
            { icon: 'fa-dollar-sign', text: 'Painel Vendas', active: true, section: 'vendas-painel' },
            { icon: 'fa-boxes-stacked', text: 'Consultar Produtos', section: 'produtos-consulta' },
            { icon: 'fa-cash-register', text: 'Registrar Venda', section: 'registrar-venda' },
            { icon: 'fa-history', text: 'Minhas Vendas', section: 'minhas-vendas' },
            { icon: 'fa-users', text: 'Clientes', section: 'clientes' },
            { icon: 'fa-cog', text: 'Configurações', section: 'config' }
        ];
    } else { // Fallback para um cargo desconhecido ou se role for undefined
        links = [
            { icon: 'fa-tachometer-alt', text: 'Painel Padrão', active: true, section: 'default-panel'},
            { icon: 'fa-cog', text: 'Configurações', section: 'config' }
        ];
        console.warn(`Cargo (role) não reconhecido ou ausente: ${role}. Usando links padrão.`);
    }
    
    const navLinksContainer = document.getElementById('navLinks');
    navLinksContainer.innerHTML = ''; 
    links.forEach(link => {
        const linkElement = document.createElement('a');
        linkElement.href = `#${link.section}`; 
        linkElement.className = `nav-link ${link.active ? 'active' : ''}`;
        linkElement.dataset.section = link.section;
        linkElement.innerHTML = `<i class="fas ${link.icon} nav-link-icon"></i><span>${link.text}</span>`;
        navLinksContainer.appendChild(linkElement);
    });
}

// Função para renderizar gráficos do dashboard
async function renderDashboardMainCharts() { // Adicionado async
    if (!document.getElementById('salesChart') || typeof Chart === 'undefined') return;
    
    // TODO: Substituir dados mockados por dados do DataService (Firebase)
    // Por enquanto, manteremos os dados mockados para a UI funcionar.
    // Exemplo de como seria com dados do Firebase:
    // try {
    //     const salesDataForChart = await DataService.getSalesForChart(); // Implementar no DataService
    //     const productDataForChart = await DataService.getProductDistributionForChart(); // Implementar
    //     
    //     // Usar salesDataForChart.labels e salesDataForChart.data no gráfico de vendas
    //     // Usar productDataForChart.labels e productDataForChart.data no gráfico de produtos
    // } catch (error) {
    //     console.error("Erro ao carregar dados para os gráficos:", error);
    //     showTemporaryAlert("Não foi possível carregar os dados dos gráficos.", "error");
    //     return;
    // }

    const salesCtx = document.getElementById('salesChart').getContext('2d');
    new Chart(salesCtx, { 
        type: 'line',
        data: {
            labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], // Mock
            datasets: [{
                label: 'Vendas (R$)',
                data: [1200, 1900, 300, 500, 2000, 3000], // Mock
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                borderColor: 'rgba(56, 189, 248, 1)',
                borderWidth: 2,
                tension: 0.4,
                pointBackgroundColor: 'rgba(56, 189, 248, 1)',
            }]
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false,
             plugins: { legend: { labels: { color: 'rgba(241, 245, 249, 0.8)' } } },
            scales: { 
                y: { beginAtZero: true, grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: 'rgba(241, 245, 249, 0.8)' } },
                x: { grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: 'rgba(241, 245, 249, 0.8)' } }
            }
        }
    });
    
    const productsCtx = document.getElementById('productsChart').getContext('2d');
    new Chart(productsCtx, { 
        type: 'doughnut',
        data: {
            labels: ['Eletrônicos', 'Informática', 'Acessórios', 'Outros'], // Mock
            datasets: [{
                data: [300, 150, 100, 50], // Mock
                backgroundColor: ['rgba(56, 189, 248, 0.8)', 'rgba(99, 102, 241, 0.8)', 'rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)'],
                borderColor: ['rgba(56, 189, 248, 1)', 'rgba(99, 102, 241, 1)', 'rgba(16, 185, 129, 1)', 'rgba(245, 158, 11, 1)'],
                borderWidth: 2
            }]
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: 'rgba(241, 245, 249, 0.8)', padding: 15, font: {size: 11} } } },
            cutout: '65%'
        }
    });
}

// Mostrar Alerta Temporário
function showTemporaryAlert(message, type = 'info', duration = 4000) {
    const alertsContainer = document.getElementById('temporaryAlertsContainer');
    if (!alertsContainer) return;
    
    const alertId = `alert-${Date.now()}`;
    const alertDiv = document.createElement('div');
    alertDiv.id = alertId;
    alertDiv.className = `temporary-alert temporary-alert-${type}`;
    alertDiv.innerHTML = `
        <div class="temporary-alert-content">
            <i class="fas ${type === 'info' ? 'fa-info-circle' : type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-times-circle'} temporary-alert-icon"></i>
            <span class="temporary-alert-message">${message}</span>
        </div>
        <button class="temporary-alert-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    alertsContainer.appendChild(alertDiv);
    setTimeout(() => alertDiv.classList.add('show'), 10);
    setTimeout(() => {
        alertDiv.classList.remove('show');
        setTimeout(() => alertDiv.remove(), 500);
    }, duration);
}

// Funções de Utilidade
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
function formatDate(date) {
    return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
}
function formatDateTime(date) {
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(new Date(date));
}
