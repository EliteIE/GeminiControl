// js/firebase-service.js
// Este arquivo substitui o elitecontrol-data.js e interage com o Firebase.

// Certifique-se de que 'db' e 'firebase' (para FieldValue e Timestamp) estão acessíveis.
// Eles são inicializados em firebase-config.js e estão no escopo global.

const DataService = {
    // --- Funções de Usuário ---
    getUserData: async function(userId) {
        if (!db) {
            console.error("Firestore (db) não está inicializado!");
            throw new Error("Conexão com banco de dados não disponível.");
        }
        try {
            const userDocRef = db.collection('users').doc(userId);
            const userDoc = await userDocRef.get();
            if (userDoc.exists) {
                return { uid: userId, ...userDoc.data() };
            } else {
                console.warn(`Documento do usuário não encontrado pelo UID: ${userId} na coleção 'users'.`);
                return null;
            }
        } catch (error) {
            console.error("Erro ao buscar dados do usuário no Firestore:", error);
            throw error;
        }
    },

    // --- Funções de Produtos ---
    getProducts: async function() {
        if (!db) throw new Error("Firestore não inicializado");
        try {
            const snapshot = await db.collection('products').get();
            const products = [];
            snapshot.forEach(doc => {
                products.push({ id: doc.id, ...doc.data() });
            });
            console.log("Produtos buscados:", products);
            return products;
        } catch (error) {
            console.error("Erro ao buscar produtos:", error);
            throw error;
        }
    },

    addProduct: async function(productData) {
        if (!db) throw new Error("Firestore não inicializado");
        try {
            // Adicionar timestamps de criação/atualização, se desejado
            // productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            // productData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            const docRef = await db.collection('products').add(productData);
            console.log("Produto adicionado com ID:", docRef.id);
            return { id: docRef.id, ...productData };
        } catch (error) {
            console.error("Erro ao adicionar produto:", error);
            throw error;
        }
    },

    updateProduct: async function(productId, productData) {
        if (!db) throw new Error("Firestore não inicializado");
        try {
            // productData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('products').doc(productId).update(productData);
            console.log("Produto atualizado:", productId);
            return { id: productId, ...productData };
        } catch (error) {
            console.error("Erro ao atualizar produto:", error);
            throw error;
        }
    },

    deleteProduct: async function(productId) {
        if (!db) throw new Error("Firestore não inicializado");
        try {
            await db.collection('products').doc(productId).delete();
            console.log("Produto deletado:", productId);
            return true;
        } catch (error) {
            console.error("Erro ao deletar produto:", error);
            throw error;
        }
    },


    // --- Funções de Vendas ---
    getSales: async function() {
        if (!db) throw new Error("Firestore não inicializado");
        try {
            const snapshot = await db.collection('sales').orderBy('date', 'desc').get();
            const sales = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                sales.push({ 
                    id: doc.id, 
                    ...data,
                    date: data.date.toDate ? data.date.toDate().toISOString().split('T')[0] : data.date 
                });
            });
            console.log("Vendas buscadas:", sales);
            return sales;
        } catch (error) {
            console.error("Erro ao buscar vendas:", error);
            throw error;
        }
    },

    addSale: async function(saleData, productsSold) {
        // productsSold: array de objetos [{ productId: 'xyz', quantity: 2, unitPrice: 10.00, name: 'Produto X'}, ...]
        if (!db) throw new Error("Firestore não inicializado");
        
        const batch = db.batch();

        try {
            // 1. Adicionar a venda
            const saleDocRef = db.collection('sales').doc(); // Gera um novo ID para a venda
            const salePayload = {
                ...saleData,
                date: firebase.firestore.Timestamp.fromDate(new Date(saleData.dateString)), // Armazena como Timestamp
                sellerId: firebase.auth().currentUser.uid, // Pega o UID do usuário logado
                // sellerName: (pode ser adicionado se tiver o nome do usuário aqui)
                productsDetail: productsSold, // Array com detalhes dos produtos vendidos
                total: productsSold.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
            };
            batch.set(saleDocRef, salePayload);

            // 2. Atualizar o estoque de cada produto vendido
            for (const item of productsSold) {
                if (!item.productId || typeof item.quantity !== 'number' || item.quantity <= 0) {
                    throw new Error(`Dados inválidos para o produto na venda: ${item.name || 'ID desconhecido'}`);
                }
                const productRef = db.collection('products').doc(item.productId);
                // Usar FieldValue.increment para decrementar o estoque de forma atômica
                batch.update(productRef, { 
                    stock: firebase.firestore.FieldValue.increment(-item.quantity) 
                });
            }

            // 3. Commit da transação em lote
            await batch.commit();
            console.log("Venda adicionada e estoque atualizado. ID da Venda:", saleDocRef.id);
            return { id: saleDocRef.id, ...salePayload };

        } catch (error) {
            console.error("Erro ao adicionar venda e atualizar estoque:", error);
            // Se houver um erro, o batch não será concluído, mantendo a consistência.
            throw error;
        }
    },

    // --- Funções de Estatísticas (Exemplos Iniciais) ---
    getProductStats: async function() {
        if (!db) throw new Error("Firestore não inicializado");
        const stats = { totalProducts: 0, lowStock: 0, categories: {} };
        try {
            const productsSnapshot = await db.collection('products').get();
            stats.totalProducts = productsSnapshot.size;
            const categoriesCount = {};
            productsSnapshot.forEach(doc => {
                const product = doc.data();
                if (product.stock < 20) { // Limite de estoque baixo
                    stats.lowStock++;
                }
                categoriesCount[product.category] = (categoriesCount[product.category] || 0) + 1;
            });
            stats.categories = categoriesCount;
            console.log("Estatísticas de produtos:", stats);
            return stats;
        } catch (error) {
            console.error("Erro ao buscar estatísticas de produtos:", error);
            throw error;
        }
    },

    getSalesStats: async function() {
        if (!db) throw new Error("Firestore não inicializado");
        const stats = { totalSales: 0, todaySales: 0, totalRevenue: 0, todayRevenue: 0 };
        try {
            const salesSnapshot = await db.collection('sales').get();
            stats.totalSales = salesSnapshot.size;

            const today = new Date();
            const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

            salesSnapshot.forEach(doc => {
                const sale = doc.data();
                stats.totalRevenue += sale.total || 0;
                if (sale.date.toDate() >= startOfToday && sale.date.toDate() < endOfToday) {
                    stats.todaySales++;
                    stats.todayRevenue += sale.total || 0;
                }
            });
            console.log("Estatísticas de vendas:", stats);
            return stats;
        } catch (error) {
            console.error("Erro ao buscar estatísticas de vendas:", error);
            throw error;
        }
    },
    
    getTopProducts: async function(limit = 5) {
        if (!db) throw new Error("Firestore não inicializado");
        // Esta é uma forma simplificada. Para performance em larga escala,
        // considere agregar dados com Firebase Functions ou manter contadores.
        try {
            const salesSnapshot = await db.collection('sales').get();
            const productCounts = {};

            salesSnapshot.forEach(doc => {
                const sale = doc.data();
                if (sale.productsDetail && Array.isArray(sale.productsDetail)) {
                    sale.productsDetail.forEach(item => {
                        if (item.productId) {
                             // Usando o nome do produto diretamente se disponível, ou o ID
                            const productName = item.name || item.productId;
                            productCounts[productName] = (productCounts[productName] || 0) + item.quantity;
                        }
                    });
                }
            });
            
            const sortedProducts = Object.entries(productCounts)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);
            
            console.log("Top produtos:", sortedProducts);
            return sortedProducts;

        } catch (error) {
            console.error("Erro ao buscar top produtos:", error);
            throw error;
        }
    }
};

// Tornar o DataService globalmente acessível (se não estiver usando módulos ES6)
window.DataService = DataService;
