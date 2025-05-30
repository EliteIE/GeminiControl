// js/firebase-config.js
// Configuração do Firebase com os dados reais do projeto.

const firebaseConfig = {
  apiKey: "AIzaSyD1t6vbSqI2s1Wsw3eGSMozWaZSTMDfukA",
  authDomain: "elitecontrol-765fd.firebaseapp.com",
  projectId: "elitecontrol-765fd",
  storageBucket: "elitecontrol-765fd.appspot.com", // Corrigido para firebasestorage.app (se o seu for assim) ou manter .appspot.com
  messagingSenderId: "939140418428",
  appId: "1:939140418428:web:beeca76505e69329baf2f9",
  measurementId: "G-PNDBZB9HR5" // Opcional, apenas se for usar Google Analytics for Firebase
};

// Inicialize o Firebase
// Verifica se o Firebase já foi inicializado para evitar erros
let app;
if (!firebase.apps.length) {
  app = firebase.initializeApp(firebaseConfig);
} else {
  app = firebase.app(); // Use o app já inicializado
}

// Inicialize os serviços do Firebase que você vai usar.
// É uma boa prática obter as instâncias após a inicialização do app.
const auth = firebase.auth();
const db = firebase.firestore();
// const storage = firebase.storage(); // Descomente se for usar o Firebase Storage
// const functions = firebase.functions(); // Descomente se for usar o Firebase Functions
// const analytics = firebase.analytics(); // Descomente se for usar o Firebase Analytics e tiver adicionado o SDK

console.log("Firebase inicializado e configurado com os dados reais.");

// Exporte as instâncias para que possam ser usadas em outros arquivos, se necessário (opcional, dependendo da sua estrutura)
// export { app, auth, db, storage, functions, analytics };
// Se não estiver usando módulos ES6, eles estarão disponíveis globalmente através do objeto `firebase`.
