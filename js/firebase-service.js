// js/firebase-service.js
// Versão com ajustes para tipo de 'total' e inclusão de 'sellerName'

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
            productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            productData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            // Garante que price e stock sejam números
            productData.price = Number(productData.price) || 0;
            productData.stock = Number(productData.stock) || 0;
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
            productData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            if (productData.price !== undefined) productData.price = Number(productData.price) || 0;
            if (productData.stock !== undefined) productData.stock = Number(productData.stock) || 0;
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
                    // Garante que 'total' seja número ao ler
                    total: Number(data.total) || 0, 
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

    addSale: async function(saleData, productsSold, sellerName) { // Adicionado sellerName como parâmetro
        if (!db) throw new Error("Firestore não inicializado");
        
        const batch = db.batch();
        try {
            const saleDocRef = db.collection('sales').doc();
            const calculatedTotal = productsSold.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);
            
            const salePayload = {
                // ...saleData, // Cuidado para não sobrescrever o 'total' ou 'date' com formato errado
                date: firebase.firestore.Timestamp.fromDate(new Date(saleData.dateString)), 
                sellerId: firebase.auth().currentUser.uid,
                sellerName: sellerName || "Vendedor Desconhecido", // Adiciona sellerName
                productsDetail: productsSold.map(p => ({ // Garante que quantity e unitPrice sejam números
                    ...p,
                    quantity: Number(p.quantity) || 0,
                    unitPrice: Number(p.unitPrice) || 0
                })), 
                total: calculatedTotal // Salva como Number
            };
            batch.set(saleDocRef, salePayload);

            for (const item of productsSold) {
                if (!item.productId || typeof (Number(item.quantity)) !== 'number' || Number(item.quantity) <= 0) {
                    throw new Error(`Dados inválidos para o produto na venda: ${item.name || 'ID desconhecido'}`);
                }
                const productRef = db.collection('products').doc(item.productId);
                batch.update(productRef, { 
                    stock: firebase.firestore.FieldValue.increment(-Number(item.quantity)) 
                });
            }

            await batch.commit();
            console.log("Venda adicionada e estoque atualizado. ID da Venda:", saleDocRef.id);
            return { id: saleDocRef.id, ...salePayload };

        } catch (error) {
            console.error("Erro ao adicionar venda e atualizar estoque:", error);
            throw error;
        }
    },

    // --- Funções de Estatísticas ---
    getProductStats: async function() {
        if (!db) throw new Error("Firestore não inicializado");
        const stats = { totalProducts: 0, lowStock: 0, categories: {} };
        try {
            const productsSnapshot = await db.collection('products').get();
            stats.totalProducts = productsSnapshot.size;
            const categoriesCount = {};
            productsSnapshot.forEach(doc => {
                const product = doc.data();
                if (Number(product.stock) < 20) { 
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
            // const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1); // Correção: endOfToday deve ser o início do dia seguinte

            salesSnapshot.forEach(doc => {
                const sale = doc.data();
                const saleTotalNumber = Number(sale.total) || 0; // Garante que é número
                stats.totalRevenue += saleTotalNumber;
                
                const saleDate = sale.date.toDate ? sale.date.toDate() : new Date(sale.date);
                if (saleDate >= startOfToday && saleDate < new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000) ) { // Verifica se a venda é de hoje
                    stats.todaySales++;
                    stats.todayRevenue += saleTotalNumber;
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
        try {
            const salesSnapshot = await db.collection('sales').get();
            const productCounts = {};

            salesSnapshot.forEach(doc => {
                const sale = doc.data();
                if (sale.productsDetail && Array.isArray(sale.productsDetail)) {
                    sale.productsDetail.forEach(item => {
                        if (item.productId) {
                            const productName = item.name || item.productId;
                            productCounts[productName] = (productCounts[productName] || 0) + (Number(item.quantity) || 0);
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

window.DataService = DataService;
