// js/main.js - Com Dashboard Dinâmico e Autenticação Firebase

// Configurações e Inicialização
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            console.log("Usuário logado (Auth):", { uid: user.uid, email: user.email });
            try {
                const userDataFromService = await DataService.getUserData(user.uid);
                console.log("Dados retornados por DataService.getUserData:", userDataFromService);

                if (userDataFromService && userDataFromService.role && typeof userDataFromService.role === 'string' && userDataFromService.role.trim() !== '') {
                    console.log("userDataFromService.role encontrado:", userDataFromService.role);
                    localStorage.setItem('elitecontrol_user_role', userDataFromService.role); 
                    
                    const currentUser = { 
                        uid: user.uid, 
                        email: user.email, 
                        ...userDataFromService 
                    };
                    initializeUI(currentUser); 
                    
                    const currentPath = window.location.pathname;
                    const basePath = "/GeminiControl/"; // Ajuste se o nome do seu repositório for diferente
                    const isIndexPage = currentPath.endsWith('index.html') || currentPath === '/' || currentPath === basePath || currentPath === basePath + "index.html";

                    if (isIndexPage) {
                        console.log("Redirecionando para dashboard.html...");
                        window.location.href = 'dashboard.html';
                    } else if (currentPath.includes('dashboard.html')) {
                        console.log("Já está no dashboard, carregando dados...");
                        await loadDashboardData(currentUser); // Chama o carregamento dos dados do dashboard
                    } else {
                        console.warn("Não redirecionou, pathname não correspondeu:", currentPath);
                    }
                } else {
                    console.error("FALHA NA VERIFICAÇÃO: userDataFromService não existe ou userDataFromService.role está indefinido/falsy.");
                    console.error("Detalhes de userDataFromService:", userDataFromService);
                    let errorMessage = "Seu perfil de usuário não possui um cargo (role) definido corretamente no Firestore. Verifique se o nome do campo é 'role' (minúsculo). Contate o suporte.";
                    if (!userDataFromService) errorMessage = "Não foi possível carregar os dados do seu usuário do Firestore.";
                    
                    showLoginError(errorMessage); 
                    showTemporaryAlert(errorMessage, "error"); 
                    await firebase.auth().signOut(); 
                }
            } catch (error) {
                console.error("Erro no processo de autenticação ou busca de dados:", error);
                showTemporaryAlert("Erro ao carregar dados do usuário. Verifique sua conexão.", "error");
            }
        } else {
            console.log("Nenhum usuário logado (onAuthStateChanged).");
            localStorage.removeItem('elitecontrol_user_role');
            if (document.getElementById('userInitials')) { 
                 clearDashboardUI();
            }
            const basePath = "/GeminiControl/";
            const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === basePath || window.location.pathname === basePath + "index.html";
            if (!isIndexPage) {
                 console.log("Redirecionando para index.html pois não está logado e não está na index.");
                window.location.href = 'index.html';
            }
        }
    });
});

// Função para carregar e exibir dados dinâmicos no dashboard
async function loadDashboardData(currentUser) {
    if (!currentUser || !DataService) {
        console.warn("loadDashboardData: currentUser ou DataService não disponível.");
        return; 
    }

    try {
        showTemporaryAlert("Carregando dados do dashboard...", "info", 2000);

        // Buscar dados em paralelo
        const [productStats, salesStats, topProductsData, allProducts, recentSalesData] = await Promise.all([
            DataService.getProductStats(),
            DataService.getSalesStats(),
            DataService.getTopProducts(5), 
            DataService.getProducts(), 
            DataService.getSales() // Pega todas as vendas, ordenadas por data no DataService
        ]);
        
        console.log("Dados para KPIs e Gráficos carregados:", { productStats, salesStats, topProductsData, allProducts, recentSalesData });

        updateDashboardKPIs(salesStats, productStats, allProducts, currentUser);
        renderDashboardMainCharts(salesStats, topProductsData); 
        updateRecentActivitiesUI(recentSalesData.slice(0, 5)); // Mostra as 5 vendas mais recentes

    } catch (error) {
        console.error("Erro ao carregar dados dinâmicos do dashboard:", error);
        showTemporaryAlert("Falha ao carregar informações do dashboard.", "error");
    }
}

// Atualizar KPIs do Dashboard
function updateDashboardKPIs(salesStats, productStats, allProducts, currentUser) {
    console.log("Atualizando KPIs para:", currentUser.role);
    const kpiValue1 = document.querySelector('#kpiContainer .kpi-card:nth-child(1) .kpi-value');
    const kpiTitle1 = document.querySelector('#kpiContainer .kpi-card:nth-child(1) .kpi-title');
    const kpiValue2 = document.querySelector('#kpiContainer .kpi-card:nth-child(2) .kpi-value');
    const kpiTitle2 = document.querySelector('#kpiContainer .kpi-card:nth-child(2) .kpi-title');
    const kpiValue3 = document.querySelector('#kpiContainer .kpi-card:nth-child(3) .kpi-value');
    const kpiTitle3 = document.querySelector('#kpiContainer .kpi-card:nth-child(3) .kpi-title');
    const kpiButtonContainer4 = document.querySelector('#kpiContainer .kpi-card:nth-child(4) .kpi-value');
    const kpiTitle4 = document.querySelector('#kpiContainer .kpi-card:nth-child(4) .kpi-title');

    if (kpiButtonContainer4 && kpiButtonContainer4.firstChild && kpiButtonContainer4.firstChild.nodeName !== 'BUTTON') {
        kpiButtonContainer4.innerHTML = ''; // Limpa se não for um botão, para recriar
    }

    if (currentUser.role === 'Vendedor') {
        if (kpiTitle1) kpiTitle1.textContent = "Minhas Vendas (Hoje)";
        if (kpiValue1) kpiValue1.textContent = formatCurrency(salesStats.todayRevenue); // TODO: Ajustar para vendas DO VENDEDOR
        
        if (kpiTitle2) kpiTitle2.textContent = "Nº de Vendas (Hoje)";
        if (kpiValue2) kpiValue2.textContent = salesStats.todaySales; // TODO: Ajustar para vendas DO VENDEDOR
        
        if (kpiTitle3) kpiTitle3.textContent = "Produtos Disponíveis";
        if (kpiValue3) kpiValue3.textContent = allProducts ? allProducts.length : 0;

        if (kpiTitle4) kpiTitle4.textContent = "Nova Venda";
        if (kpiButtonContainer4 && !kpiButtonContainer4.querySelector('#newSaleButton')) {
             kpiButtonContainer4.innerHTML = `<button class="btn-primary" id="newSaleButton">Registrar</button>`;
             const newSaleButton = document.getElementById('newSaleButton');
             if (newSaleButton) newSaleButton.addEventListener('click', () => {
                showTemporaryAlert('Funcionalidade "Nova Venda" a ser implementada.', 'info');
                // Aqui abriria um modal ou iria para uma página de registro de venda
             });
        }
    } else if (currentUser.role === 'Controlador de Estoque') {
        if (kpiTitle1) kpiTitle1.textContent = "Total de Produtos";
        if (kpiValue1) kpiValue1.textContent = productStats.totalProducts;

        if (kpiTitle2) kpiTitle2.textContent = "Produtos c/ Estoque Baixo";
        if (kpiValue2) kpiValue2.textContent = productStats.lowStock;
        
        if (kpiTitle3) kpiTitle3.textContent = "Nº de Categorias";
        if (kpiValue3) kpiValue3.textContent = productStats.categories ? Object.keys(productStats.categories).length : 0;

        if (kpiTitle4) kpiTitle4.textContent = "Adicionar Produto";
         if (kpiButtonContainer4 && !kpiButtonContainer4.querySelector('#newProductButton')) {
             kpiButtonContainer4.innerHTML = `<button class="btn-primary" id="newProductButton">Adicionar</button>`;
             const newProductButton = document.getElementById('newProductButton');
             if(newProductButton) newProductButton.addEventListener('click', () => {
                showTemporaryAlert('Funcionalidade "Adicionar Produto" a ser implementada.', 'info');
                // Aqui abriria um modal ou iria para uma página de cadastro de produto
             });
        }
    } else if (currentUser.role === 'Dono/Gerente') {
        if (kpiTitle1) kpiTitle1.textContent = "Receita Total (Geral)";
        if (kpiValue1) kpiValue1.textContent = formatCurrency(salesStats.totalRevenue);

        if (kpiTitle2) kpiTitle2.textContent = "Total de Vendas (Geral)";
        if (kpiValue2) kpiValue2.textContent = salesStats.totalSales;

        if (kpiTitle3) kpiTitle3.textContent = "Total de Produtos";
        if (kpiValue3) kpiValue3.textContent = productStats.totalProducts;
        
        if (kpiTitle4) kpiTitle4.textContent = "Ver Relatórios";
         if (kpiButtonContainer4 && !kpiButtonContainer4.querySelector('#viewReportsButton')) {
             kpiButtonContainer4.innerHTML = `<button class="btn-primary" id="viewReportsButton">Detalhes</button>`;
             const viewReportsButton = document.getElementById('viewReportsButton');
             if(viewReportsButton) viewReportsButton.addEventListener('click', () => {
                showTemporaryAlert('Funcionalidade "Ver Relatórios" a ser implementada.', 'info');
             });
        }
    }
}

// Função para renderizar gráficos do dashboard com dados dinâmicos
function renderDashboardMainCharts(salesStats, topProductsData) {
    if (!document.getElementById('salesChart') || typeof Chart === 'undefined') {
        console.warn("Elemento do gráfico 'salesChart' ou Chart.js não disponível.");
        return;
    }
    if (!salesStats || !topProductsData) {
        console.warn("Dados para gráficos não disponíveis.");
        return;
    }

    const salesCtx = document.getElementById('salesChart').getContext('2d');
    if (window.salesChartInstance) {
        window.salesChartInstance.destroy();
    }
    // TODO: Processar salesStats para gerar labels e data mais significativos para o gráfico de vendas.
    // Por enquanto, um exemplo simplificado.
    const salesChartRenderData = {
        labels: ['Períodos Anteriores', 'Hoje'], 
        datasets: [{
            label: 'Vendas (R$)',
            data: [
                (salesStats.totalRevenue || 0) - (salesStats.todayRevenue || 0), 
                salesStats.todayRevenue || 0
            ],
            backgroundColor: 'rgba(56, 189, 248, 0.2)',
            borderColor: 'rgba(56, 189, 248, 1)',
            borderWidth: 2, tension: 0.4, pointBackgroundColor: 'rgba(56, 189, 248, 1)',
        }]
    };
    window.salesChartInstance = new Chart(salesCtx, { type: 'line', data: salesChartRenderData, options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: 'rgba(241, 245, 249, 0.8)' } } },
            scales: { 
                y: { beginAtZero: true, grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: 'rgba(241, 245, 249, 0.8)', callback: function(value) { return formatCurrency(value); } } },
                x: { grid: { color: 'rgba(51, 65, 85, 0.3)' }, ticks: { color: 'rgba(241, 245, 249, 0.8)' } }
            }
    }});
    
    const productsCtx = document.getElementById('productsChart').getContext('2d');
    if (window.productsChartInstance) {
        window.productsChartInstance.destroy();
    }
    const productChartLabels = topProductsData && topProductsData.length > 0 ? topProductsData.map(p => p.name) : ['Nenhum produto vendido'];
    const productChartDataValues = topProductsData && topProductsData.length > 0 ? topProductsData.map(p => p.count) : [1];

    window.productsChartInstance = new Chart(productsCtx, { 
        type: 'doughnut',
        data: {
            labels: productChartLabels, 
            datasets: [{
                label: 'Quantidade Vendida',
                data: productChartDataValues, 
                backgroundColor: ['rgba(56, 189, 248, 0.8)','rgba(99, 102, 241, 0.8)','rgba(16, 185, 129, 0.8)','rgba(245, 158, 11, 0.8)','rgba(239, 68, 68, 0.8)'],
                borderColor: ['rgba(56, 189, 248, 1)','rgba(99, 102, 241, 1)','rgba(16, 185, 129, 1)','rgba(245, 158, 11, 1)','rgba(239, 68, 68, 1)'],
                borderWidth: 2
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'right', labels: { color: 'rgba(241, 245, 249, 0.8)', padding: 15, font: {size: 11} } },
                tooltip: { callbacks: { label: function(context) { let label = context.dataset.label || ''; if (label) { label += ': '; } if (context.parsed !== null) { label += context.parsed; } return label; } } }
            }, cutout: '65%'
        }
    });
}

// Atualizar UI de Atividades Recentes
function updateRecentActivitiesUI(sales) {
    const activitiesContainer = document.getElementById('recentActivitiesContainer');
    if (!activitiesContainer) return;
    activitiesContainer.innerHTML = ''; 

    if (!sales || sales.length === 0) {
        activitiesContainer.innerHTML = '<li class="activity-item"><div class="activity-content"><div class="activity-text text-slate-400">Nenhuma venda recente.</div></div></li>';
        return;
    }

    sales.forEach(sale => {
        const activityItem = document.createElement('li');
        activityItem.className = 'activity-item';
        // Pega os nomes dos produtos da venda
        const productNames = sale.productsDetail && Array.isArray(sale.productsDetail) && sale.productsDetail.length > 0 
            ? sale.productsDetail.map(p => p.name || 'Produto desconhecido').slice(0,2).join(', ') + (sale.productsDetail.length > 2 ? '...' : '')
            : 'Detalhes não disponíveis';

        activityItem.innerHTML = `
            <div class="activity-icon"><i class="fas fa-receipt"></i></div>
            <div class="activity-content">
                <div class="activity-text">Venda registrada: ${productNames} - Total: ${formatCurrency(sale.total)}</div>
                <div class="activity-time">${formatDate(sale.date)} ${sale.sellerName ? 'por ' + sale.sellerName : ''}</div>
            </div>`; // Adicionado sellerName
        activitiesContainer.appendChild(activityItem);
    });
}


// Funções de Inicialização da UI
function initializeUI(currentUser) { 
    if (!currentUser) return; 
    updateUserInfo(currentUser);
    initializeNotifications();
    initializeSidebar(currentUser.role); 
    if (document.getElementById('temporaryAlertsContainer') && window.location.href.includes('dashboard.html')) {
        if (!sessionStorage.getItem('welcomeAlertShown')) {
            showTemporaryAlert(`Bem-vindo, ${currentUser.name || currentUser.email}! Sistema EliteControl.`, 'success', 5000);
            sessionStorage.setItem('welcomeAlertShown', 'true');
        }
    }
}

function clearDashboardUI() {
    const userInitials = document.getElementById('userInitials');
    if (userInitials) userInitials.textContent = 'U';
    const userDropdownInitials = document.getElementById('userDropdownInitials');
    if (userDropdownInitials) userDropdownInitials.textContent = 'U';
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay) usernameDisplay.textContent = 'Usuário';
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    if (userRoleDisplay) userRoleDisplay.textContent = 'Cargo';
    const userDropdownName = document.getElementById('userDropdownName');
    if (userDropdownName) userDropdownName.textContent = 'Usuário';
    const userDropdownEmail = document.getElementById('userDropdownEmail');
    if (userDropdownEmail) userDropdownEmail.textContent = 'usuario@exemplo.com';
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = 'EliteControl';
    const sidebarProfileName = document.getElementById('sidebarProfileName');
    if (sidebarProfileName) sidebarProfileName.textContent = 'Painel';
    const navLinks = document.getElementById('navLinks');
    if (navLinks) navLinks.innerHTML = '';
    const kpiCards = document.querySelectorAll('#kpiContainer .kpi-card');
    kpiCards.forEach((card, index) => {
        const valueEl = card.querySelector('.kpi-value');
        const titleEl = card.querySelector('.kpi-title');
        if (valueEl && !valueEl.querySelector('button')) valueEl.textContent = '0';
        if (titleEl) { // Redefine títulos para o padrão
            if(index === 0) titleEl.textContent = "Minhas Vendas (Hoje)";
            if(index === 1) titleEl.textContent = "Nº de Vendas (Hoje)";
            if(index === 2) titleEl.textContent = "Produtos Disponíveis";
            if(index === 3) titleEl.textContent = "Nova Venda";
        }
    });
    const kpiTodaySalesValue = document.querySelector('#kpiContainer .kpi-card:nth-child(1) .kpi-value');
    if (kpiTodaySalesValue) kpiTodaySalesValue.textContent = formatCurrency(0); // Formata para R$0,00

    if (window.salesChartInstance) { window.salesChartInstance.destroy(); window.salesChartInstance = null; }
    if (window.productsChartInstance) { window.productsChartInstance.destroy(); window.productsChartInstance = null; }
    
    const activitiesContainer = document.getElementById('recentActivitiesContainer');
    if(activitiesContainer) activitiesContainer.innerHTML = '<li class="activity-item"><div class="activity-content"><div class="activity-text text-slate-400">Nenhuma atividade recente.</div></div></li>';

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
        if (userDropdownInitialsEl) userDropdownInitialsEl.textContent = initials;
    } else if (user.email && userInitialsEl) { 
        const initials = user.email.substring(0, 2).toUpperCase();
        userInitialsEl.textContent = initials;
        if (userDropdownInitialsEl) userDropdownInitialsEl.textContent = initials;
    }
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay) usernameDisplay.textContent = user.name || user.email; 
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    if (userRoleDisplay && user.role) userRoleDisplay.textContent = user.role;
    const userDropdownName = document.getElementById('userDropdownName');
    if (userDropdownName) userDropdownName.textContent = user.name || user.email;
    const userDropdownEmail = document.getElementById('userDropdownEmail');
    if (userDropdownEmail && user.email) userDropdownEmail.textContent = user.email;
    const pageTitle = document.getElementById('pageTitle');
    const sidebarProfileName = document.getElementById('sidebarProfileName');
    if (sidebarProfileName && pageTitle) {
        let title = `Painel ${user.role || 'Usuário'}`;
        if (user.role === 'Dono/Gerente') title = 'Painel Dono/Gerente';
        else if (user.role === 'Controlador de Estoque') title = 'Painel Controlador de Estoque';
        else if (user.role === 'Vendedor') title = 'Painel Vendedor';
        sidebarProfileName.textContent = title;
        pageTitle.textContent = title;
    }
}

// Configurar Event Listeners
function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    const notificationBellButton = document.getElementById('notificationBellButton');
    const notificationDropdown = document.getElementById('notificationDropdown');
    if (notificationBellButton && notificationDropdown) {
        notificationBellButton.addEventListener('click', (e) => { e.stopPropagation(); notificationDropdown.classList.toggle('hidden'); });
        document.addEventListener('click', (e) => {
            if (notificationBellButton && !notificationBellButton.contains(e.target) && notificationDropdown && !notificationDropdown.contains(e.target)) {
                notificationDropdown.classList.add('hidden');
            }
        });
    }
    const markAllAsReadButton = document.getElementById('markAllAsReadButton');
    if (markAllAsReadButton) markAllAsReadButton.addEventListener('click', markAllNotificationsAsRead);
    const userMenuButton = document.getElementById('userMenuButton');
    const userDropdown = document.getElementById('userDropdown');
    if (userMenuButton && userDropdown) {
        userMenuButton.addEventListener('click', (e) => { e.stopPropagation(); userDropdown.classList.toggle('hidden'); });
        document.addEventListener('click', (e) => {
             if (userMenuButton && !userMenuButton.contains(e.target) && userDropdown && !userDropdown.contains(e.target)) {
                userDropdown.classList.add('hidden');
            }
        });
    }
     document.addEventListener('click', function(e) {
        const navLink = e.target.closest('#navLinks a.nav-link');
        if (navLink) {
            e.preventDefault();
            document.querySelectorAll('#navLinks a.nav-link').forEach(l => l.classList.remove('active'));
            navLink.classList.add('active');
            showTemporaryAlert(`Navegando para: ${navLink.querySelector('span').textContent}`, 'info');
            // loadSectionContent(navLink.dataset.section); // Futura implementação
        }
    });
    // Listeners para botões de KPI são adicionados em updateDashboardKPIs
}

// Manipulador de Login
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if (!email || !password) { showLoginError('Por favor, preencha email e senha.'); return; }
    const loginButton = e.target.querySelector('button[type="submit"]');
    const originalButtonText = loginButton.textContent;
    loginButton.disabled = true; loginButton.textContent = 'Entrando...';
    try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
        showLoginError(''); 
    } catch (error) {
        console.error("Erro de login:", error);
        let friendlyMessage = "Email ou senha inválidos.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') friendlyMessage = "Usuário não encontrado ou senha incorreta.";
        else if (error.code === 'auth/wrong-password') friendlyMessage = "Senha incorreta.";
        else if (error.code === 'auth/invalid-email') friendlyMessage = "O formato do email é inválido.";
        else if (error.code === 'auth/network-request-failed') friendlyMessage = "Erro de rede. Verifique sua conexão.";
        showLoginError(friendlyMessage);
    } finally {
        loginButton.disabled = false; loginButton.textContent = originalButtonText;
    }
}

// Mostrar Erro de Login
function showLoginError(message) {
    const errorElement = document.getElementById('loginErrorMessage');
    if (errorElement) { errorElement.textContent = message; errorElement.classList.toggle('hidden', !message); }
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

// Funções de Notificação (mantidas como estão, usando localStorage por enquanto)
function initializeNotifications() {
    if (!document.getElementById('notificationCountBadge')) return;
    let notifications = JSON.parse(localStorage.getItem('elitecontrol_notifications') || '[]');
    if (notifications.length === 0) { 
        notifications = [
            { id: 'notif1', title: 'Bem-vindo!', message: 'Seu sistema EliteControl está pronto.', time: 'Agora', read: false, type: 'info' },
            { id: 'notif2', title: 'Dica', message: 'Explore os relatórios para insights.', time: '1h atrás', read: false, type: 'info' }
        ];
        localStorage.setItem('elitecontrol_notifications', JSON.stringify(notifications));
    }
    updateNotificationsUI();
}
function updateNotificationsUI() {
    const list = document.getElementById('notificationList');
    const badge = document.getElementById('notificationCountBadge');
    if (!list || !badge) return;
    const notifications = JSON.parse(localStorage.getItem('elitecontrol_notifications') || '[]');
    const unreadCount = notifications.filter(n => !n.read).length;
    badge.textContent = unreadCount;
    badge.classList.toggle('hidden', unreadCount === 0);
    list.innerHTML = notifications.length === 0 ? '<div class="p-4 text-center text-slate-400">Nenhuma notificação.</div>' 
        : notifications.map(n => {
            let badgeClass = 'info'; 
            if (n.type === 'warning') badgeClass = 'warning';
            else if (n.type === 'error') badgeClass = 'error';
            else if (n.type === 'success') badgeClass = 'success';
            const item = document.createElement('div'); // Criar o elemento aqui para adicionar o listener
            item.className = `notification-item ${n.read ? '' : 'unread'}`;
            item.dataset.id = n.id;
            item.innerHTML = `
                <div class="notification-item-header">
                    <div class="notification-item-title">${n.title}</div>
                    <div class="notification-item-badge ${badgeClass}">${n.type.charAt(0).toUpperCase() + n.type.slice(1)}</div>
                </div>
                <div class="notification-item-message">${n.message}</div>
                <div class="notification-item-footer">
                    <div class="notification-item-time">${n.time}</div>
                    ${!n.read ? '<div class="notification-item-action">Marcar como lida</div>' : ''}
                </div>`;
            item.addEventListener('click', () => markNotificationAsRead(n.id)); // Adiciona listener aqui
            return item.outerHTML; // Retorna o HTML do elemento
        }).join('');
}
function markNotificationAsRead(id) {
    let notifications = JSON.parse(localStorage.getItem('elitecontrol_notifications') || '[]');
    notifications = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    localStorage.setItem('elitecontrol_notifications', JSON.stringify(notifications));
    updateNotificationsUI();
}
function markAllNotificationsAsRead() {
    let notifications = JSON.parse(localStorage.getItem('elitecontrol_notifications') || '[]');
    notifications = notifications.map(n => ({ ...n, read: true }));
    localStorage.setItem('elitecontrol_notifications', JSON.stringify(notifications));
    updateNotificationsUI();
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) dropdown.classList.add('hidden');
}

// Inicializar Sidebar
function initializeSidebar(role) { 
    if (!document.getElementById('navLinks') || !role) return;
    let links = [];
    if (role === 'Dono/Gerente') links = [ { icon: 'fa-chart-pie', text: 'Painel Geral', active: true, section: 'geral' }, { icon: 'fa-boxes-stacked', text: 'Produtos', section: 'produtos' }, { icon: 'fa-cash-register', text: 'Registrar Venda', section: 'registrar-venda' }, { icon: 'fa-file-invoice-dollar', text: 'Vendas (Hist/Rel)', section: 'vendas' }, { icon: 'fa-users-cog', text: 'Usuários', section: 'usuarios' }, { icon: 'fa-cogs', text: 'Configurações', section: 'config' } ];
    else if (role === 'Controlador de Estoque') links = [ { icon: 'fa-warehouse', text: 'Painel Estoque', active: true, section: 'estoque' }, { icon: 'fa-boxes-stacked', text: 'Produtos', section: 'produtos' }, { icon: 'fa-truck-loading', text: 'Fornecedores', section: 'fornecedores' }, { icon: 'fa-exchange-alt', text: 'Movimentações', section: 'movimentacoes' }, { icon: 'fa-clipboard-list', text: 'Relatórios de Estoque', section: 'relatorios-estoque' }, { icon: 'fa-cog', text: 'Configurações', section: 'config' } ];
    else if (role === 'Vendedor') links = [ { icon: 'fa-dollar-sign', text: 'Painel Vendas', active: true, section: 'vendas-painel' }, { icon: 'fa-boxes-stacked', text: 'Consultar Produtos', section: 'produtos-consulta' }, { icon: 'fa-cash-register', text: 'Registrar Venda', section: 'registrar-venda' }, { icon: 'fa-history', text: 'Minhas Vendas', section: 'minhas-vendas' }, { icon: 'fa-users', text: 'Clientes', section: 'clientes' }, { icon: 'fa-cog', text: 'Configurações', section: 'config' } ];
    else { links = [ { icon: 'fa-tachometer-alt', text: 'Painel Padrão', active: true, section: 'default-panel'}, { icon: 'fa-cog', text: 'Configurações', section: 'config' } ]; console.warn(`Cargo (role) não reconhecido ou ausente: ${role}. Usando links padrão.`); }
    const navLinksContainer = document.getElementById('navLinks');
    navLinksContainer.innerHTML = links.map(link => `<a href="#${link.section}" class="nav-link ${link.active ? 'active' : ''}" data-section="${link.section}"><i class="fas ${link.icon} nav-link-icon"></i><span>${link.text}</span></a>`).join('');
}

// Mostrar Alerta Temporário
function showTemporaryAlert(message, type = 'info', duration = 4000) {
    const container = document.getElementById('temporaryAlertsContainer');
    if (!container) return;
    const alertDiv = document.createElement('div');
    alertDiv.className = `temporary-alert temporary-alert-${type}`;
    alertDiv.innerHTML = `<div class="temporary-alert-content"><i class="fas ${type === 'info' ? 'fa-info-circle' : type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-times-circle'} temporary-alert-icon"></i><span class="temporary-alert-message">${message}</span></div><button class="temporary-alert-close" onclick="this.parentElement.remove()">&times;</button>`;
    container.appendChild(alertDiv);
    setTimeout(() => alertDiv.classList.add('show'), 10);
    setTimeout(() => { alertDiv.classList.remove('show'); setTimeout(() => alertDiv.remove(), 500); }, duration);
}

// Funções de Utilidade
function formatCurrency(value) {
    if (typeof value !== 'number' || isNaN(value)) value = 0; // Garante que é um número válido
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
function formatDate(dateInput) { // Aceita string, timestamp do Firebase ou objeto Date
    let date;
    if (dateInput instanceof Date) {
        date = dateInput;
    } else if (dateInput && typeof dateInput.toDate === 'function') { // Firebase Timestamp
        date = dateInput.toDate();
    } else if (typeof dateInput === 'string' || typeof dateInput === 'number') {
        date = new Date(dateInput);
    } else {
        date = new Date(); // Fallback para data atual se entrada inválida
    }
    if (isNaN(date.getTime())) return "Data inválida"; // Verifica se a data é válida
    return new Intl.DateTimeFormat('pt-BR').format(date);
}
function formatDateTime(dateInput) {
    let date;
    if (dateInput instanceof Date) {
        date = dateInput;
    } else if (dateInput && typeof dateInput.toDate === 'function') { // Firebase Timestamp
        date = dateInput.toDate();
    } else if (typeof dateInput === 'string' || typeof dateInput === 'number') {
        date = new Date(dateInput);
    } else {
        date = new Date(); 
    }
     if (isNaN(date.getTime())) return "Data/hora inválida";
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
