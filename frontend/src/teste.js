const { GoogleGenerativeAI } = require("@google/generative-ai");

// Obtenha a chave de API da variável de ambiente ou coloque-a aqui
const genAI = new GoogleGenerativeAI("AIzaSyC4KUqAKsz5soF_-XrvubniP37OlUh374c");

async function listAvailableModels() {
  try {
    const models = await genAI.listModels();
    console.log("Modelos disponíveis que suportam 'generateContent':");
    
    for await (const model of models) {
      if (model.supportedGenerationMethods.includes("generateContent")) {
        console.log(`- ${model.name}`);
      }
    }
  } catch (error) {
    console.error("Erro ao listar modelos:", error);
  }
}

listAvailableModels();