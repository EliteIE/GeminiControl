// js/firebase-service.js
// Serviço para interagir com o Firebase Firestore

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
                // Tenta buscar pelo email como fallback (se o UID não for o ID do documento)
                // Isso pode ser útil em cenários de migração.
                if(firebase.auth().currentUser && firebase.auth().currentUser.email){
                    const emailQuerySnapshot = await db.collection('users').where('email', '==', firebase.auth().currentUser.email).limit(1).get();
                    if(!emailQuerySnapshot.empty){
                        const doc = emailQuerySnapshot.docs[0];
                         console.warn(`Usuário encontrado pelo email ${firebase.auth().currentUser.email} com ID de documento ${doc.id} em vez de UID ${userId}`);
                        return { uid: userId, email: firebase.auth().currentUser.email, ...doc.data()};
                    }
                }
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
            const snapshot = await db.collection('products').orderBy('name').get(); // Ordena por nome
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

    getProductById: async function(productId) {
        if (!db) throw new Error("Firestore não inicializado");
        try {
            const docRef = db.collection('products').doc(productId);
            const docSnap = await docRef.get();
            if (docSnap.exists()) {
                console.log("Produto encontrado por ID:", productId, docSnap.data());
                return { id: docSnap.id, ...docSnap.data() };
            } else {
                console.warn("Nenhum produto encontrado com o ID:", productId);
                return null;
            }
        } catch (error) {
            console.error("Erro ao buscar produto por ID:", error);
            throw error;
        }
    },

    addProduct: async function(productData) {
        if (!db) throw new Error("Firestore não inicializado");
        try {
            productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            productData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
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
                    total: Number(data.total) || 0, 
                    date: data.date // Mantém como Timestamp para formatação posterior
                });
            });
            console.log("Vendas buscadas:", sales);
            return sales;
        } catch (error) {
            console.error("Erro ao buscar vendas:", error);
            throw error;
        }
    },

    addSale: async function(saleData, productsSoldDetails, sellerName) {
        if (!db) throw new Error("Firestore não inicializado");
        
        const batch = db.batch();
        try {
            const saleDocRef = db.collection('sales').doc();
            const calculatedTotal = productsSoldDetails.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);
            
            const salePayload = {
                date: firebase.firestore.Timestamp.fromDate(new Date(saleData.dateString)), 
                sellerId: firebase.auth().currentUser.uid,
                sellerName: sellerName || "Vendedor Desconhecido",
                productsDetail: productsSoldDetails.map(p => ({
                    productId: p.productId,
                    name: p.name,
                    quantity: Number(p.quantity) || 0,
                    unitPrice: Number(p.unitPrice) || 0
                })), 
                total: calculatedTotal 
            };
            batch.set(saleDocRef, salePayload);

            for (const item of productsSoldDetails) {
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

            const todayDate = new Date();
            const startOfToday = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
            const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000); // Início do dia seguinte

            salesSnapshot.forEach(doc => {
                const sale = doc.data();
                const saleTotalNumber = Number(sale.total) || 0;
                stats.totalRevenue += saleTotalNumber;
                
                if (sale.date && typeof sale.date.toDate === 'function') { // Verifica se é um Timestamp
                    const saleDate = sale.date.toDate();
                    if (saleDate >= startOfToday && saleDate < endOfToday) {
                        stats.todaySales++;
                        stats.todayRevenue += saleTotalNumber;
                    }
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
                            const productName = item.name || item.productId; // Usa o nome do produto se disponível
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
