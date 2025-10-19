require('dotenv').config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Nlp } = require('@nlpjs/basic');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("A variável de ambiente GEMINI_API_KEY não foi definida.");
}
const genAI = new GoogleGenerativeAI(apiKey);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const nlp = new Nlp({ languages: ['pt'], forceNER: true });

function limparTexto(texto) {
  if (!texto) return '';
  return texto.replace(/\s\s+/g, ' ').trim();
}

async function enriquecerComNER(texto) {
  const result = await nlp.process('pt', texto);
  let textoEnriquecido = texto;
  for (let i = result.entities.length - 1; i >= 0; i--) {
    const entity = result.entities[i];
    const { start, end, entity: entityName, sourceText } = entity;
    const tag = entityName.toUpperCase();
    textoEnriquecido = 
      textoEnriquecido.slice(0, start) + 
      `<${tag}>${sourceText}</${tag}>` + 
      textoEnriquecido.slice(end + 1);
  }
  return textoEnriquecido;
}

function criarPrompt(textoEnriquecido) {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    return `
    Sua tarefa é atuar como um assistente financeiro amigável e proativo. Analise o texto do usuário e retorne APENAS um objeto JSON válido. A data de hoje é ${dataAtual}.

    **REGRAS FUNDAMENTAIS DE SAÍDA:**
    1.  **CORREÇÃO IMPLÍCITA:** Corrija mentalmente quaisquer erros ortográficos ou gramaticais no texto para entender a intenção correta.
    2.  **CLASSIFICAÇÃO**: Classifique o texto em: ["Metas", "Investimentos", "Dicas", "Gastos", "Nenhum"].
    3.  **CASO ESPECIAL - "METAS"**: Se o tema for "Metas", o JSON de saída DEVE conter "tema" e "dados_extraidos" (com os campos "evento", "data", "valor" da forma mais resumida possível).
    4.  **GERAR PERGUNTAS (DADOS FALTANDO)**: Dentro de uma "Meta", se uma informação estiver faltando, gere uma pergunta clara para o usuário em vez de retornar nulo.
    5.  **[NOVA REGRA] GERAR PERGUNTAS (DATAS VAGAS)**: Se a data para uma "Meta" for vaga ou relativa (ex: "mês que vem", "final do ano", "em breve"), NÃO use o termo vago. Em vez disso, formule uma **pergunta de clarificação** para obter uma data específica, usando a data de hoje como referência.
    6.  **CASOS GERAIS - APENAS TEMA**: Para todos os outros temas, o JSON de saída DEVE conter APENAS a chave "tema".

    **EXEMPLOS (FEW-SHOT LEARNING):**
    ---
    **EXEMPLO 1 (META COMPLETA):**
    - TEXTO: "Vou guardar 100 reais para viajar no dia 11 de janeiro de 2026"
    - JSON: 
    {
      "tema": "Metas",
      "dados_extraidos": { "evento": "viajem", "data": "11/01/2026", "valor": 100 }
    }
    ---
    **EXEMPLO 2 (META COM DATA VAGA E VALOR FALTANDO):**
    - CONTEXTO: A data de hoje é ${dataAtual}.
    - TEXTO: "Quero economizar para comprar um celular novo até o Natal."
    - JSON: 
    {
      "tema": "Metas",
      "dados_extraidos": {
        "evento": "comprar celular",
        "data": "Podemos definir um dia específico para o Natal de 2025?",
        "valor": "Qual valor você pretende economizar para o celular?"
      }
    }
    ---
    **EXEMPLO 3 (META COM EVENTO E DATA FALTANDO):**
    - TEXTO: "Preciso juntar 5000 reais."
    - JSON: 
    {
      "tema": "Metas",
      "dados_extraidos": {
        "evento": "Qual o objetivo principal desses 5000 reais?",
        "data": "Você tem um prazo para alcançar essa meta?",
        "valor": 5000
      }
    }
    ---
    **EXEMPLO 4 (CASO GERAL):**
    - TEXTO: "Gostaria de saber qual o melhor investimento para o mim."
    - JSON: 
    {
      "tema": "Investimentos"
    }
    ---

    **EXEMPLO 5 (CASO GERAL):**
    - TEXTO: "Estou com um dinheiro sobrando e não sei o que fazer."
    - JSON: 
    {
      "tema": "Dicas"
    }
    ---
    **EXEMPLO 6 (CASO GERAL):**
    - TEXTO: "Acho que estou gastando muito esse mês."
    - JSON:
    {
      "tema": Gastos
    } 
    ---
    **AGORA, ANALISE O TEXTO A SEGUIR E GERE O JSON DE SAÍDA:**

    **TEXTO PARA ANÁLISE:**
    ${textoEnriquecido}

    **JSON DE SAÍDA:**
  `;
}

async function processarSentenca(sentenca) {
    console.log(`  - Processando sentença: "${sentenca}"`);
    const textoEnriquecido = await enriquecerComNER(sentenca);
    console.log(`  - Sentença enriquecida (PÓS-NER): "${textoEnriquecido}"`);
    
    const prompt = criarPrompt(textoEnriquecido);
    
    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();
        const cleanedResponse = responseText.trim().replace('```json', '').replace('```', '');
        return JSON.parse(cleanedResponse);
    } catch (error) {
        console.error(`ERRO AO PROCESSAR SENTENÇA: "${sentenca}"`, error);
        return { tema: "Erro", texto: sentenca };
    }
}

async function pipelineCompleto(textoUsuario) {
  const textoLimpo = limparTexto(textoUsuario);
  console.log(`2. TEXTO LIMPO (A correção será feita pelo modelo): "${textoLimpo}"`);
  
  const analiseNlp = await nlp.process('pt', textoLimpo);
  
  const sentencas = (analiseNlp && analiseNlp.sentences && analiseNlp.sentences.length > 0)
    ? analiseNlp.sentences.map(s => s.text)
    : [textoLimpo]; 

  const resultados = [];
  for (const sentenca of sentencas.filter(s => s)) {
      const resultado = await processarSentenca(sentenca);
      resultados.push(resultado);
  }
  
  return resultados;
}

async function main() {
  const textoComDataVaga = "Preciso de 2000 reais para uma viagem no mês que vem.";
  const resultados = await pipelineCompleto(textoComDataVaga);
  console.log(JSON.stringify(resultados, null, 2));
}

main();
