// js/main.js - Com Modal de Produtos, Carregamento de Seções e Dashboard Dinâmico

// Variáveis globais para o modal de produto (garantir que sejam declaradas antes de DOMContentLoaded se usadas fora)
let productModal, productForm, productModalTitle, productIdField, productNameField, productCategoryField, productPriceField, productStockField, closeProductModalButton, cancelProductFormButton;

// Configurações e Inicialização
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar variáveis do modal aqui, após o DOM estar pronto
    productModal = document.getElementById('productModal');
    productForm = document.getElementById('productForm');
    productModalTitle = document.getElementById('productModalTitle');
    productIdField = document.getElementById('productId');
    productNameField = document.getElementById('productName');
    productCategoryField = document.getElementById('productCategory');
    productPriceField = document.getElementById('productPrice');
    productStockField = document.getElementById('productStock');
    closeProductModalButton = document.getElementById('closeProductModalButton');
    cancelProductFormButton = document.getElementById('cancelProductFormButton');

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
                    // Ajuste para o caminho base no GitHub Pages
                    const basePath = (window.location.hostname === "eliteie.github.io") ? "/GeminiControl/" : "/";
                    const isIndexPage = currentPath.endsWith('index.html') || currentPath === basePath || currentPath === basePath + "index.html";
                    const isDashboardPage = currentPath.includes('dashboard.html');

                    if (isIndexPage) {
                        console.log("Redirecionando para dashboard.html...");
                        window.location.href = 'dashboard.html';
                    } else if (isDashboardPage) {
                        console.log("Já está no dashboard, verificando hash da URL...");
                        const section = window.location.hash.substring(1);
                        const defaultSection = currentUser.role === 'Vendedor' ? 'vendas-painel' : (currentUser.role === 'Controlador de Estoque' ? 'estoque' : 'geral');
                        
                        if (section && section !== "#" && section !== defaultSection) {
                            await loadSectionContent(section, currentUser);
                        } else {
                            // Se não houver hash ou for a seção padrão do perfil, carrega o dashboard
                            window.location.hash = defaultSection; // Garante que o hash reflita a seção padrão
                            await loadDashboardData(currentUser); 
                        }
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
            if (document.getElementById('userInitials')) clearDashboardUI();

            const basePath = (window.location.hostname === "eliteie.github.io") ? "/GeminiControl/" : "/";
            const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname === basePath || window.location.pathname === basePath + "index.html";
            if (!isIndexPage) {
                 console.log("Redirecionando para index.html pois não está logado e não está na index.");
                window.location.href = 'index.html'; 
            }
        }
    });
});

// --- Funções do Modal de Produto ---
function openProductModal(product = null) {
    if (!productModal || !productForm || !productModalTitle || !productIdField || !productNameField || !productCategoryField || !productPriceField || !productStockField) {
        console.error("Elementos do modal de produto não encontrados no DOM.");
        return;
    }
    productForm.reset(); 
    if (product) { 
        productModalTitle.textContent = 'Editar Produto';
        productIdField.value = product.id;
        productNameField.value = product.name;
        productCategoryField.value = product.category;
        productPriceField.value = product.price;
        productStockField.value = product.stock;
    } else { 
        productModalTitle.textContent = 'Adicionar Novo Produto';
        productIdField.value = ''; 
    }
    productModal.classList.remove('hidden');
}

function closeProductModal() {
    if (productModal) productModal.classList.add('hidden');
}

async function handleProductFormSubmit(event) {
    event.preventDefault();
    if (!productNameField || !productCategoryField || !productPriceField || !productStockField || !productIdField) {
        console.error("Campos do formulário de produto não encontrados.");
        return;
    }
    const id = productIdField.value;
    const productData = {
        name: productNameField.value,
        category: productCategoryField.value,
        price: parseFloat(productPriceField.value),
        stock: parseInt(productStockField.value)
    };

    if (!productData.name || !productData.category || isNaN(productData.price) || isNaN(productData.stock)) {
        showTemporaryAlert("Por favor, preencha todos os campos corretamente.", "warning");
        return;
    }

    const saveButton = document.getElementById('saveProductButton');
    if (!saveButton) return;
    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';

    try {
        if (id) { 
            await DataService.updateProduct(id, productData);
            showTemporaryAlert('Produto atualizado com sucesso!', 'success');
        } else { 
            await DataService.addProduct(productData);
            showTemporaryAlert('Produto adicionado com sucesso!', 'success');
        }
        closeProductModal();
        const currentUser = firebase.auth().currentUser;
        if (currentUser) {
            const userRole = localStorage.getItem('elitecontrol_user_role');
            // Garante que está recarregando a seção de produtos
            if(window.location.hash === "#produtos" || window.location.hash === "#produtos-consulta"){
                loadSectionContent(window.location.hash.substring(1), {uid: currentUser.uid, email: currentUser.email, role: userRole });
            } else { // Se não estiver na seção de produtos, força o hash e recarrega
                window.location.hash = (userRole === 'Vendedor' ? 'produtos-consulta' : 'produtos');
            }
        }
    } catch (error) {
        console.error("Erro ao salvar produto:", error);
        showTemporaryAlert('Erro ao salvar produto. Tente novamente.', 'error');
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Salvar Produto';
    }
}

// Função para carregar e exibir dados dinâmicos no dashboard (KPIs, gráficos)
async function loadDashboardData(currentUser) {
    if (!currentUser || !DataService) {
        console.warn("loadDashboardData: currentUser ou DataService não disponível.");
        return; 
    }
    const dynamicContentArea = document.getElementById('dynamicContentArea');
    if (!dynamicContentArea) { console.error("dynamicContentArea não encontrado"); return;}

    dynamicContentArea.innerHTML = `
        <div id="kpiContainer" class="kpi-container">
            <div class="kpi-card"><div class="kpi-icon-wrapper"><i class="fas fa-dollar-sign kpi-icon"></i></div><div class="kpi-content"><div class="kpi-title">Receita Total (Geral)</div><div class="kpi-value">R$ 0,00</div></div></div>
            <div class="kpi-card"><div class="kpi-icon-wrapper"><i class="fas fa-shopping-cart kpi-icon"></i></div><div class="kpi-content"><div class="kpi-title">Total de Vendas (Geral)</div><div class="kpi-value">0</div></div></div>
            <div class="kpi-card"><div class="kpi-icon-wrapper"><i class="fas fa-box kpi-icon"></i></div><div class="kpi-content"><div class="kpi-title">Total de Produtos</div><div class="kpi-value">0</div></div></div>
            <div class="kpi-card"><div class="kpi-icon-wrapper"><i class="fas fa-plus kpi-icon"></i></div><div class="kpi-content"><div class="kpi-title">Ação Rápida</div><div class="kpi-value"><button class="btn-primary" id="quickActionButton">Ação</button></div></div></div>
        </div>
        <div id="chartsContainer" class="charts-container">
            <div class="chart-card"><div class="chart-header"><h3 class="chart-title">Vendas por Período</h3><div class="chart-actions"><button class="chart-action-btn" id="salesChartOptionsButton"><i class="fas fa-ellipsis-v"></i></button></div></div><div class="chart-content"><canvas id="salesChart"></canvas></div></div>
            <div class="chart-card"><div class="chart-header"><h3 class="chart-title">Produtos Mais Vendidos</h3><div class="chart-actions"><button class="chart-action-btn" id="productsChartOptionsButton"><i class="fas fa-ellipsis-v"></i></button></div></div><div class="chart-content"><canvas id="productsChart"></canvas></div></div>
        </div>
        <div class="activities-card"><div class="activities-header"><h3 class="activities-title">Atividades Recentes</h3></div><ul id="recentActivitiesContainer" class="activities-list"></ul></div>
    `;
    const salesChartOptionsButton = document.getElementById('salesChartOptionsButton');
    if (salesChartOptionsButton) salesChartOptionsButton.addEventListener('click', () => showTemporaryAlert('Opções do gráfico de vendas', 'info'));
    const productsChartOptionsButton = document.getElementById('productsChartOptionsButton');
    if (productsChartOptionsButton) productsChartOptionsButton.addEventListener('click', () => showTemporaryAlert('Opções do gráfico de produtos', 'info'));

    try {
        showTemporaryAlert("Carregando dados do dashboard...", "info", 2000);
        const [productStats, salesStats, topProductsData, allProducts, recentSalesData] = await Promise.all([
            DataService.getProductStats(), DataService.getSalesStats(),
            DataService.getTopProducts(5), DataService.getProducts(), DataService.getSales()
        ]);
        console.log("Dados para KPIs e Gráficos carregados:", { productStats, salesStats, topProductsData, allProducts, recentSalesData });
        updateDashboardKPIs(salesStats, productStats, allProducts, currentUser);
        renderDashboardMainCharts(salesStats, topProductsData); 
        updateRecentActivitiesUI(recentSalesData.slice(0, 5)); 
    } catch (error) {
        console.error("Erro ao carregar dados dinâmicos do dashboard:", error);
        showTemporaryAlert("Falha ao carregar informações do dashboard.", "error");
    }
}

// Função para carregar conteúdo de uma seção específica
async function loadSectionContent(sectionId, currentUser) {
    console.log(`Carregando seção: ${sectionId} para usuário:`, currentUser);
    const dynamicContentArea = document.getElementById('dynamicContentArea');
    if (!dynamicContentArea) {console.error("dynamicContentArea não encontrado em loadSectionContent"); return;}

    dynamicContentArea.innerHTML = `<div class="p-8 text-center text-slate-400"><i class="fas fa-spinner fa-spin fa-2x"></i> Carregando ${sectionId}...</div>`;
    showTemporaryAlert(`Carregando ${sectionId}...`, "info", 1500);

    try {
        if (sectionId === 'produtos' || sectionId === 'produtos-consulta') {
            const products = await DataService.getProducts();
            renderProductsList(products, dynamicContentArea, currentUser.role);
        } else if (sectionId === 'geral' || sectionId === 'vendas-painel' || sectionId === 'estoque' || !sectionId) { 
            await loadDashboardData(currentUser);
        } else if (sectionId === 'registrar-venda') {
            // TODO: Implementar renderização da tela de registrar venda
            dynamicContentArea.innerHTML = `<div class="p-8 text-center text-slate-400">Seção "Registrar Venda" a ser implementada.</div>`;
        } else if (sectionId === 'vendas') {
            // TODO: Implementar renderização da tela de histórico/relatório de vendas
            dynamicContentArea.innerHTML = `<div class="p-8 text-center text-slate-400">Seção "Vendas (Hist/Rel)" a ser implementada.</div>`;
        }
        // Adicionar mais 'else if' para outras seções conforme necessário
        else {
            dynamicContentArea.innerHTML = `<div class="p-8 text-center text-slate-400">Seção "${sectionId}" ainda não implementada.</div>`;
        }
    } catch (error) {
        console.error(`Erro ao carregar seção ${sectionId}:`, error);
        dynamicContentArea.innerHTML = `<div class="p-8 text-center text-red-400">Erro ao carregar conteúdo. Tente novamente.</div>`;
        showTemporaryAlert(`Erro ao carregar ${sectionId}.`, "error");
    }
}

// Função para renderizar a lista de produtos
function renderProductsList(products, container, userRole) {
    if (!container) { console.error("Container da lista de produtos não encontrado."); return; }
    container.innerHTML = ''; 
    const title = document.createElement('h2');
    title.className = 'text-xl font-semibold text-slate-100 mb-4';
    title.textContent = 'Lista de Produtos';
    container.appendChild(title);

    if (userRole === 'Controlador de Estoque' || userRole === 'Dono/Gerente') {
        const addProductButton = document.createElement('button');
        addProductButton.id = 'openAddProductModalButton'; 
        addProductButton.className = 'btn-primary mb-4 inline-flex items-center';
        addProductButton.innerHTML = '<i class="fas fa-plus mr-2"></i> Adicionar Novo Produto';
        container.appendChild(addProductButton); // O listener é delegado em setupEventListeners
    }

    if (!products || products.length === 0) {
        const noProductsP = document.createElement('p');
        noProductsP.className = 'text-slate-400';
        noProductsP.textContent = 'Nenhum produto encontrado.';
        container.appendChild(noProductsP);
        return;
    }

    const table = document.createElement('table');
    table.className = 'min-w-full bg-slate-800 shadow-md rounded-lg overflow-hidden';
    table.innerHTML = `
        <thead class="bg-slate-700">
            <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Nome</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Categoria</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Preço</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Estoque</th>
                ${(userRole === 'Controlador de Estoque' || userRole === 'Dono/Gerente') ? '<th class="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">Ações</th>' : ''}
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-700">
        </tbody>
    `;
    const tbody = table.querySelector('tbody');
    products.forEach(product => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-750 transition-colors duration-150';
        let actionsHtml = '';
        if (userRole === 'Controlador de Estoque' || userRole === 'Dono/Gerente') {
            actionsHtml = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                <button class="text-sky-400 hover:text-sky-300 mr-2 edit-product-btn" data-product-id="${product.id}"><i class="fas fa-edit"></i></button>
                <button class="text-red-500 hover:text-red-400 delete-product-btn" data-product-id="${product.id}" data-product-name="${product.name}"><i class="fas fa-trash"></i></button>
            </td>`;
        }
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-200">${product.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300">${product.category}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-300">${formatCurrency(product.price)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm ${product.stock < 20 ? 'text-red-400 font-semibold' : 'text-slate-300'}">${product.stock}</td>
            ${actionsHtml}
        `;
        tbody.appendChild(tr);
    });
    container.appendChild(table);
}

window.handleEditProduct = async (productId) => { 
    console.log("Tentando editar produto com ID:", productId);
    try {
        // Esta função agora busca o produto diretamente do DataService
        const productToEdit = await DataService.getProductById(productId); // Supondo que você implementará getProductById
        if (productToEdit) {
            openProductModal(productToEdit);
        } else {
            showTemporaryAlert('Produto não encontrado para edição.', 'error');
        }
    } catch (error) {
        console.error("Erro ao preparar edição do produto:", error);
        showTemporaryAlert('Erro ao carregar dados do produto para edição.', 'error');
    }
};
window.handleDeleteProductConfirmation = (productId, productName) => { 
    if (confirm(`Tem certeza que deseja excluir o produto "${productName}"? Esta ação não pode ser desfeita.`)) {
        DataService.deleteProduct(productId)
            .then(() => {
                showTemporaryAlert(`Produto "${productName}" excluído com sucesso.`, 'success');
                const currentUser = firebase.auth().currentUser;
                if(currentUser) {
                    const userRole = localStorage.getItem('elitecontrol_user_role');
                     // Garante que está recarregando a seção de produtos
                    if(window.location.hash === "#produtos" || window.location.hash === "#produtos-consulta"){
                        loadSectionContent(window.location.hash.substring(1), {uid: currentUser.uid, email: currentUser.email, role: userRole });
                    } else { 
                        window.location.hash = (userRole === 'Vendedor' ? 'produtos-consulta' : 'produtos');
                    }
                }
            })
            .catch(err => {
                console.error("Erro ao excluir produto:", err);
                showTemporaryAlert(`Erro ao excluir o produto "${productName}".`, 'error');
            });
    }
};

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
        kpiButtonContainer4.innerHTML = ''; 
    }

    if (currentUser.role === 'Vendedor') {
        if (kpiTitle1) kpiTitle1.textContent = "Minhas Vendas (Hoje)";
        if (kpiValue1) kpiValue1.textContent = formatCurrency(salesStats ? salesStats.todayRevenue : 0); 
        if (kpiTitle2) kpiTitle2.textContent = "Nº de Vendas (Hoje)";
        if (kpiValue2) kpiValue2.textContent = salesStats ? salesStats.todaySales : 0; 
        if (kpiTitle3) kpiTitle3.textContent = "Produtos Disponíveis";
        if (kpiValue3) kpiValue3.textContent = allProducts ? allProducts.length : 0;
        if (kpiTitle4) kpiTitle4.textContent = "Nova Venda";
        if (kpiButtonContainer4 && !kpiButtonContainer4.querySelector('#newSaleButton')) {
             kpiButtonContainer4.innerHTML = `<button class="btn-primary" id="newSaleButton">Registrar</button>`;
             const newSaleButton = document.getElementById('newSaleButton');
             if (newSaleButton) newSaleButton.addEventListener('click', () => {
                window.location.hash = '#registrar-venda';
             });
        }
    } else if (currentUser.role === 'Controlador de Estoque') {
        if (kpiTitle1) kpiTitle1.textContent = "Total de Produtos";
        if (kpiValue1) kpiValue1.textContent = productStats ? productStats.totalProducts : 0;
        if (kpiTitle2) kpiTitle2.textContent = "Produtos c/ Estoque Baixo";
        if (kpiValue2) kpiValue2.textContent = productStats ? productStats.lowStock : 0;
        if (kpiTitle3) kpiTitle3.textContent = "Nº de Categorias";
        if (kpiValue3) kpiValue3.textContent = productStats && productStats.categories ? Object.keys(productStats.categories).length : 0;
        if (kpiTitle4) kpiTitle4.textContent = "Adicionar Produto";
         if (kpiButtonContainer4 && !kpiButtonContainer4.querySelector('#addProductFromKPIButton')) { 
             kpiButtonContainer4.innerHTML = `<button class="btn-primary" id="addProductFromKPIButton">Adicionar</button>`;
             const addProductKPIButton = document.getElementById('addProductFromKPIButton');
             if(addProductKPIButton) addProductKPIButton.addEventListener('click', () => {
                openProductModal(); 
             });
        }
    } else if (currentUser.role === 'Dono/Gerente') {
        if (kpiTitle1) kpiTitle1.textContent = "Receita Total (Geral)";
        if (kpiValue1) kpiValue1.textContent = formatCurrency(salesStats ? salesStats.totalRevenue : 0);
        if (kpiTitle2) kpiTitle2.textContent = "Total de Vendas (Geral)";
        if (kpiValue2) kpiValue2.textContent = salesStats ? salesStats.totalSales : 0;
        if (kpiTitle3) kpiTitle3.textContent = "Total de Produtos";
        if (kpiValue3) kpiValue3.textContent = productStats ? productStats.totalProducts : 0;
        if (kpiTitle4) kpiTitle4.textContent = "Ver Relatórios";
         if (kpiButtonContainer4 && !kpiButtonContainer4.querySelector('#viewReportsButton')) {
             kpiButtonContainer4.innerHTML = `<button class="btn-primary" id="viewReportsButton">Detalhes</button>`;
             const viewReportsButton = document.getElementById('viewReportsButton');
             if(viewReportsButton) viewReportsButton.addEventListener('click', () => {
                window.location.hash = '#vendas'; 
             });
        }
    }
}

// Função para renderizar gráficos do dashboard com dados dinâmicos
function renderDashboardMainCharts(salesStats, topProductsData) {
    if (!document.getElementById('salesChart') || typeof Chart === 'undefined') { return; }
    if (!salesStats || !topProductsData) { return; }
    const salesCtx = document.getElementById('salesChart').getContext('2d');
    if (window.salesChartInstance) window.salesChartInstance.destroy();
    const salesChartRenderData = {
        labels: ['Períodos Anteriores', 'Hoje'], 
        datasets: [{
            label: 'Vendas (R$)',
            data: [(salesStats.totalRevenue || 0) - (salesStats.todayRevenue || 0), salesStats.todayRevenue || 0],
            backgroundColor: 'rgba(56, 189, 248, 0.2)', borderColor: 'rgba(56, 189, 248, 1)',
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
    if (window.productsChartInstance) window.productsChartInstance.destroy();
    const productChartLabels = topProductsData && topProductsData.length > 0 ? topProductsData.map(p => p.name) : ['Nenhum produto vendido'];
    const productChartDataValues = topProductsData && topProductsData.length > 0 ? topProductsData.map(p => p.count) : [1];
    window.productsChartInstance = new Chart(productsCtx, { 
        type: 'doughnut',
        data: {
            labels: productChartLabels, 
            datasets: [{
                label: 'Quantidade Vendida', data: productChartDataValues, 
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
        const productNames = sale.productsDetail && Array.isArray(sale.productsDetail) && sale.productsDetail.length > 0 
            ? sale.productsDetail.map(p => p.name || 'Produto desconhecido').slice(0,2).join(', ') + (sale.productsDetail.length > 2 ? '...' : '')
            : 'Detalhes não disponíveis';
        activityItem.innerHTML = `
            <div class="activity-icon"><i class="fas fa-receipt"></i></div>
            <div class="activity-content">
                <div class="activity-text">Venda #${(sale.id || 'N/A').substring(0,6)}: ${productNames} - Total: ${formatCurrency(sale.total)}</div>
                <div class="activity-time">${formatDate(sale.date)} ${sale.sellerName ? 'por ' + sale.sellerName : ''}</div>
            </div>`;
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
        if (titleEl) { 
            if(index === 0) titleEl.textContent = "Minhas Vendas (Hoje)";
            if(index === 1) titleEl.textContent = "Nº de Vendas (Hoje)";
            if(index === 2) titleEl.textContent = "Produtos Disponíveis";
            if(index === 3) titleEl.textContent = "Nova Venda";
        }
    });
    const kpiTodaySalesValue = document.querySelector('#kpiContainer .kpi-card:nth-child(1) .kpi-value');
    if (kpiTodaySalesValue) kpiTodaySalesValue.textContent = formatCurrency(0); 
    if (window.salesChartInstance) { window.salesChartInstance.destroy(); window.salesChartInstance = null; }
    if (window.productsChartInstance) { window.productsChartInstance.destroy(); window.productsChartInstance = null; }
    const activitiesContainer = document.getElementById('recentActivitiesContainer');
    if(activitiesContainer) activitiesContainer.innerHTML = '<li class="activity-item"><div class="activity-content"><div class="activity-text text-slate-400">Nenhuma atividade recente.</div></div></li>';
    sessionStorage.removeItem('welcomeAlertShown');
}

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

function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    
    window.addEventListener('hashchange', () => {
        const currentUser = firebase.auth().currentUser;
        if (currentUser) { // Verifica se currentUser existe antes de acessar propriedades
            const userRoleFromStorage = localStorage.getItem('elitecontrol_user_role');
            if (userRoleFromStorage) {
                const section = window.location.hash.substring(1);
                const defaultSection = userRoleFromStorage === 'Vendedor' ? 'vendas-painel' : (userRoleFromStorage === 'Controlador de Estoque' ? 'estoque' : 'geral');
                
                document.querySelectorAll('#navLinks a.nav-link').forEach(l => l.classList.remove('active'));
                const activeLink = document.querySelector(`#navLinks a.nav-link[data-section="${section || defaultSection}"]`); 
                if (activeLink) activeLink.classList.add('active');
                
                loadSectionContent(section || defaultSection, {uid: currentUser.uid, email: currentUser.email, role: userRoleFromStorage});
            } else {
                // Se não tiver role no localStorage, tenta buscar novamente
                 DataService.getUserData(currentUser.uid).then(userData => {
                    if(userData && userData.role){
                        localStorage.setItem('elitecontrol_user_role', userData.role);
                        // Tenta carregar a seção novamente
                        const section = window.location.hash.substring(1);
                        const defaultSection = userData.role === 'Vendedor' ? 'vendas-painel' : (userData.role === 'Controlador de Estoque' ? 'estoque' : 'geral');
                        loadSectionContent(section || defaultSection, {uid: currentUser.uid, email: currentUser.email, ...userData});
                    }
                 });
            }
        }
    });
    document.addEventListener('click', function(e) {
        const navLink = e.target.closest('#navLinks a.nav-link');
        if (navLink) {
            e.preventDefault();
            const section = navLink.dataset.section;
            window.location.hash = section; 
        }
        if (e.target.closest('.edit-product-btn')) {
            const button = e.target.closest('.edit-product-btn');
            window.handleEditProduct(button.dataset.productId);
        }
        if (e.target.closest('.delete-product-btn')) {
            const button = e.target.closest('.delete-product-btn');
            window.handleDeleteProductConfirmation(button.dataset.productId, button.dataset.productName);
        }
        if (e.target.id === 'openAddProductModalButton' || (e.target.closest('#openAddProductModalButton'))) { // Verifica se o clique foi no botão ou em um filho
             openProductModal();
        }
         // Listener para o botão Adicionar do KPI de Controlador de Estoque
        if (e.target.id === 'addProductFromKPIButton' || (e.target.closest('#addProductFromKPIButton'))) {
            openProductModal();
        }
    });

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
    // Listeners para o modal de produto (adicionados aqui para garantir que os elementos existam)
    const localCloseProductModalButton = document.getElementById('closeProductModalButton');
    const localCancelProductFormButton = document.getElementById('cancelProductFormButton');
    const localProductForm = document.getElementById('productForm');

    if (localCloseProductModalButton) localCloseProductModalButton.addEventListener('click', closeProductModal);
    if (localCancelProductFormButton) localCancelProductFormButton.addEventListener('click', closeProductModal);
    if (localProductForm) localProductForm.addEventListener('submit', handleProductFormSubmit);
}

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

function showLoginError(message) {
    const errorElement = document.getElementById('loginErrorMessage');
    if (errorElement) { errorElement.textContent = message; errorElement.classList.toggle('hidden', !message); }
}

async function handleLogout() {
    try {
        await firebase.auth().signOut();
        sessionStorage.removeItem('welcomeAlertShown'); 
        window.location.hash = ''; 
        console.log("Logout realizado com sucesso.");
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
        showTemporaryAlert('Erro ao sair. Tente novamente.', 'error');
    }
}

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
            // Não adicionar o listener aqui diretamente se for apenas innerHTML
            return `<div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}" onclick="markNotificationAsRead('${n.id}')">
                        <div class="notification-item-header">
                            <div class="notification-item-title">${n.title}</div>
                            <div class="notification-item-badge ${badgeClass}">${n.type.charAt(0).toUpperCase() + n.type.slice(1)}</div>
                        </div>
                        <div class="notification-item-message">${n.message}</div>
                        <div class="notification-item-footer">
                            <div class="notification-item-time">${n.time}</div>
                            ${!n.read ? '<div class="notification-item-action">Marcar como lida</div>' : ''}
                        </div>
                    </div>`;
        }).join('');
}
function markNotificationAsRead(id) { // Chamada por onclick no HTML
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

function initializeSidebar(role) { 
    if (!document.getElementById('navLinks') || !role) return;
    let links = [];
    const currentHash = window.location.hash.substring(1);
    const defaultActiveSection = (role === 'Vendedor' ? 'vendas-painel' : (role === 'Controlador de Estoque' ? 'estoque' : 'geral'));
    const isActive = (section) => currentHash ? currentHash === section : section === defaultActiveSection;

    if (role === 'Dono/Gerente') links = [ { icon: 'fa-chart-pie', text: 'Painel Geral', active: isActive('geral'), section: 'geral' }, { icon: 'fa-boxes-stacked', text: 'Produtos', active: isActive('produtos'), section: 'produtos' }, { icon: 'fa-cash-register', text: 'Registrar Venda', active: isActive('registrar-venda'), section: 'registrar-venda' }, { icon: 'fa-file-invoice-dollar', text: 'Vendas (Hist/Rel)', active: isActive('vendas'), section: 'vendas' }, { icon: 'fa-users-cog', text: 'Usuários', active: isActive('usuarios'), section: 'usuarios' }, { icon: 'fa-cogs', text: 'Configurações', active: isActive('config'), section: 'config' } ];
    else if (role === 'Controlador de Estoque') links = [ { icon: 'fa-warehouse', text: 'Painel Estoque', active: isActive('estoque'), section: 'estoque' }, { icon: 'fa-boxes-stacked', text: 'Produtos', active: isActive('produtos'), section: 'produtos' }, { icon: 'fa-truck-loading', text: 'Fornecedores', active: isActive('fornecedores'), section: 'fornecedores' }, { icon: 'fa-exchange-alt', text: 'Movimentações', active: isActive('movimentacoes'), section: 'movimentacoes' }, { icon: 'fa-clipboard-list', text: 'Relatórios de Estoque', active: isActive('relatorios-estoque'), section: 'relatorios-estoque' }, { icon: 'fa-cogs', text: 'Configurações', active: isActive('config'), section: 'config' } ];
    else if (role === 'Vendedor') links = [ { icon: 'fa-dollar-sign', text: 'Painel Vendas', active: isActive('vendas-painel'), section: 'vendas-painel' }, { icon: 'fa-boxes-stacked', text: 'Consultar Produtos', active: isActive('produtos-consulta'), section: 'produtos-consulta' }, { icon: 'fa-cash-register', text: 'Registrar Venda', active: isActive('registrar-venda'), section: 'registrar-venda' }, { icon: 'fa-history', text: 'Minhas Vendas', active: isActive('minhas-vendas'), section: 'minhas-vendas' }, { icon: 'fa-users', text: 'Clientes', active: isActive('clientes'), section: 'clientes' }, { icon: 'fa-cogs', text: 'Configurações', active: isActive('config'), section: 'config' } ];
    else { links = [ { icon: 'fa-tachometer-alt', text: 'Painel Padrão', active: true, section: 'default-panel'}, { icon: 'fa-cog', text: 'Configurações', active: isActive('config'), section: 'config' } ]; console.warn(`Cargo (role) não reconhecido ou ausente: ${role}. Usando links padrão.`); }
    
    const navLinksContainer = document.getElementById('navLinks');
    navLinksContainer.innerHTML = links.map(link => `<a href="#${link.section}" class="nav-link ${link.active ? 'active' : ''}" data-section="${link.section}"><i class="fas ${link.icon} nav-link-icon"></i><span>${link.text}</span></a>`).join('');
}

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

function formatCurrency(value) {
    if (typeof value !== 'number' || isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
function formatDate(dateInput) { 
    let date;
    if (dateInput instanceof Date) date = dateInput;
    else if (dateInput && typeof dateInput.toDate === 'function') date = dateInput.toDate();
    else if (typeof dateInput === 'string' || typeof dateInput === 'number') date = new Date(dateInput);
    else date = new Date(); 
    if (isNaN(date.getTime())) return "Data inválida"; 
    return new Intl.DateTimeFormat('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'}).format(date);
}
function formatDateTime(dateInput) {
    let date;
    if (dateInput instanceof Date) date = dateInput;
    else if (dateInput && typeof dateInput.toDate === 'function') date = dateInput.toDate();
    else if (typeof dateInput === 'string' || typeof dateInput === 'number') date = new Date(dateInput);
    else date = new Date(); 
     if (isNaN(date.getTime())) return "Data/hora inválida";
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

