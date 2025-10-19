require('dotenv').config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = "AIzaSyC4KUqAKsz5soF_-XrvubniP37OlUh374c";
if (!apiKey) {
  throw new Error("A variável de ambiente GEMINI_API_KEY não foi definida.");
}
const genAI = new GoogleGenerativeAI(apiKey);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

function limparTexto(texto) {
  if (!texto) return '';
  return texto.replace(/\s\s+/g, ' ').trim();
}

function criarPrompt(textoEnriquecido) {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    return `
    Sua tarefa é atuar como um assistente financeiro que extrai informações de forma estruturada e auditável. Analise o texto e retorne APENAS um objeto JSON válido. A data de hoje é ${dataAtual}.

    **REGRAS FUNDAMENTAIS DE SAÍDA:**
    1.  **ESTRUTURA DE EXTRAÇÃO**: Para cada campo extraído em "Metas" (evento, data, valor), você DEVE retornar um objeto com DUAS chaves:
        - "normalizado": O valor limpo, resumido e processado ou a pergunta gerada.
        - "fonte_texto": A citação EXATA do texto original usada para a extração. Se o dado foi totalmente ausente e uma pergunta foi gerada, use \`null\`.
    2.  **CLASSIFICAÇÃO**: Classifique o texto em um dos temas abaixo, seguindo suas descrições.
        - "Metas": O usuário define um objetivo financeiro claro (ex: economizar para algo).
        - "Investimentos": O usuário fala sobre ou pergunta sobre formas de investir dinheiro.
        - "Gastos": O usuário menciona despesas, faturas ou o ato de gastar.
        - "Dicas": O usuário expressa uma situação financeira geral, incerteza, ou **menciona ter/receber dinheiro**, implicando uma necessidade de orientação.
        - "Nenhum": Assuntos não relacionados a finanças.
    3.  **GERAR PERGUNTAS**: Se um dado estiver faltando ou for vago, o campo "normalizado" deve conter a pergunta de clarificação. O campo "fonte_texto" deve conter o trecho vago que gerou a pergunta, ou \`null\` se a informação estava completamente ausente.
    4.  **CASOS GERAIS**: Para temas que não sejam "Metas", retorne apenas a chave "tema".

    **EXEMPLOS (FEW-SHOT LEARNING):**
    ---
    **EXEMPLO 1 (META COMPLETA):**
    - TEXTO: "quero juntar mil reais para a viagem dos sonhos em dezembro"
    - JSON: 
    {
      "tema": "Metas",
      "dados_extraidos": {
        "evento": { "normalizado": "viagem", "fonte_texto": "viagem dos sonhos" },
        "data": { "normalizado": "Podemos definir uma data específica em Dezembro de 2025?", "fonte_texto": "em dezembro" },
        "valor": { "normalizado": 1000, "fonte_texto": "mil reais" }
      }
    }
    ---
    **EXEMPLO 2 (META COM DADO AUSENTE):**
    - CONTEXTO: A data de hoje é ${dataAtual}
    - TEXTO: "Preciso comprar um carro novo até o final do ano."
    - JSON: 
    {
      "tema": "Metas",
      "dados_extraidos": {
        "evento": { "normalizado": "comprar carro", "fonte_texto": "comprar um carro novo" },
        "data": { "normalizado": "Podemos agendar para uma data específica no final de 2025?", "fonte_texto": "até o final do ano" },
        "valor": { "normalizado": "Qual o valor estimado para o carro novo?", "fonte_texto": null }
      }
    }
    ---
    **EXEMPLO 3 (INVESTIMENTOS):**
    - TEXTO: "Gostaria de saber qual o melhor investimento para mim."
    - JSON: 
    { 
      "tema": "Investimentos" 
    }
    ---
    **EXEMPLO 4 (DICAS - DÚVIDA EXPLÍCITA):**
    - TEXTO: "Estou com um dinheiro sobrando e não sei o que fazer."
    - JSON: 
    { 
      "tema": "Dicas" 
    }
    ---
    **[NOVO EXEMPLO] EXEMPLO 5 (DICAS - DÚVIDA IMPLÍCITA):**
    - TEXTO: "Recebi um bônus inesperado no trabalho."
    - JSON:
    { 
      "tema": "Dicas" 
    }
    ---
    **EXEMPLO 6 (GASTOS):**
    - TEXTO: "Acho que estou gastando muito esse mês."
    - JSON:
    { 
      "tema": "Gastos" 
    }
    ---
    **AGORA, ANALISE O TEXTO A SEGUIR E GERE O JSON DE SAÍDA:**

    **TEXTO PARA ANÁLISE:**
    ${textoEnriquecido}

    **JSON DE SAÍDA:**
  `;
}

function validarResultado(resultadoLLM, sentencaOriginal) {
    if (resultadoLLM.tema !== 'Metas' || !resultadoLLM.dados_extraidos) {
        resultadoLLM.validacao = { status: "nao_aplicavel" };
        return resultadoLLM;
    }

    const dados = resultadoLLM.dados_extraidos;
    const problemas = [];

    for (const [campo, extracao] of Object.entries(dados)) {
        // A validação só se aplica se houver uma citação de fonte.
        if (extracao && extracao.fonte_texto) {
            // A verificação agora é uma simples e robusta busca de string.
            if (!sentencaOriginal.toLowerCase().includes(extracao.fonte_texto.toLowerCase())) {
                problemas.push(`A citação de fonte para o campo "${campo}" ("${extracao.fonte_texto}") não foi encontrada no texto original.`);
            }
        }
    }
    
    if (problemas.length > 0) {
        resultadoLLM.validacao = { status: "falhou", motivo: problemas.join('; ') };
    } else {
        resultadoLLM.validacao = { status: "verificado_por_citacao" };
    }
    return resultadoLLM;
}

async function processarSentenca(sentenca) {
    const prompt = criarPrompt(sentenca);
    
    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();
        const cleanedResponse = responseText.trim().replace('```json', '').replace('```', '');
        const resultadoLLM = JSON.parse(cleanedResponse);

        const resultadoValidado = validarResultado(resultadoLLM, sentenca);
        return resultadoValidado;

    } catch (error) {
        console.error(`ERRO AO PROCESSAR SENTENÇA: "${sentenca}"`, error);
        return { tema: "Erro", texto: sentenca };
    }
}

async function pipelineCompleto(textoUsuario) {
  const textoLimpo = limparTexto(textoUsuario);
  
  const sentencas = textoLimpo.match(/[^.!?]+[.!?]*/g) || [textoLimpo];

  const resultados = [];
  for (const sentenca of sentencas.filter(s => s && s.trim())) {
      const resultado = await processarSentenca(sentenca.trim());
      resultados.push(resultado);
  }
  
  return resultados;
}

async function main() {
  const texto1 = "Minha meta é juntar 500 reais para comprar um brinquedo para a minha sobrinha.";
  const texto2 = "Quero viajar para a praia, preciso economizar."; 
  const texto3 = "quero fazer a compra de um carro no valor de 15000 reais até dezembro";
  
  const resultados1 = await pipelineCompleto(texto1);
  console.log(JSON.stringify(resultados1, null, 2));

  //const resultados2 = await pipelineCompleto(texto2);
  //console.log(JSON.stringify(resultados2, null, 2));


  const resultados3 = await pipelineCompleto(texto3);  
  console.log(JSON.stringify(resultados3, null, 2));
}

main();