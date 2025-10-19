// Importa as dependências necessárias
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Inicializa o servidor Express
const app = express();
app.use(express.json());

// --- CONFIGURAÇÃO DAS APIs ---
const ZAPSTER_API_URL = 'https://api.zapsterapi.com/v1/wa';
const ZAPSTER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MjgxNjA1ODMsImlzcyI6InphcHN0ZXJhcGkiLCJzdWIiOiJmNTM3MzIxYS05NDg4LTRjZWItOTcwOC1jZmE2ODkwN2I3NmYiLCJqdGkiOiI2MGUwM2MyMy04YTgwLTRjNTAtOTU1NC02ZWU5ODJjZWRmZjAifQ.LGb9vPKOxN3W9Ke8DxTweEaGFfApKhll5666c62L9RU";
const ZAPSTER_INSTANCE_ID = "xhnhbs8cy4wxrkkf0h1jc";
const FLASK_SERVER_URL = 'http://localhost:5000/classificar'; // URL do servidor Flask

// --- CONFIGURAÇÃO DA API GEMINI ---
const GEMINI_API_KEY = "AIzaSyD7GchJ5FvnUUE74rLKo66nBWYtyBtYjC4";
if (!GEMINI_API_KEY) {
    throw new Error("A variável de ambiente GEMINI_API_KEY não está definida.");
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// --- DADOS MOCK (BANCO DE DADOS SIMULADO) ---
const dadosMock = {
    nome: 'Maria de Cásia',
    idade: '50',
    cidade: 'São Paulo',
    renda: 5000,
    gastos: 0,
    possivel_perfil_investimento: 'Conservador',
    investimentos: 0,
    data_pagamento: 30,
    decimo_terceiro: '05-12-2025',
    ferias: '20-10-2025',
    contas_recorrentes: [
        { nome: 'Financiamento', valor: 2500, vencimento: 10 },
        { nome: 'Condomínio', valor: 200, vencimento: 10 },
        { nome: 'Conta de Água', valor: 50, vencimento: 15 },
        { nome: 'Conta de Luz', valor: 100, vencimento: 15 },
        { nome: 'Internet', valor: 50, vencimento: 15 },
        { nome: 'Gás', valor: 30, vencimento: 15 }
    ],
    principais_gastos: [
        { nome: 'Financiamento', valor: 2500 },
        { nome: 'Alimentação', valor: 500 },
        { nome: 'Transporte', valor: 200 },
        { nome: 'Presentes para Neto', valor: 100 },
        { nome: 'Compras Online', valor: 300 },
        { nome: 'Saídas Final de Semana', valor: 100 },
        { nome: 'Condomínio', valor: 200 },
        { nome: 'Conta de Água', valor: 50 },
        { nome: 'Conta de Luz', valor: 100 },
        { nome: 'Internet', valor: 50 },
        { nome: 'Gás', valor: 30 }
    ],
    dias_mais_gastos: [5, 10, 20],
    possiveis_pagamentos: [
        { nome: 'Financiamento', vencimento: 10, valor: '' },
        { nome: 'Pix festa', vencimento: 10, valor: '' },
        { nome: 'Conta de Água', vencimento: 15, valor: '' },
        { nome: 'Conta de Luz', vencimento: 15, valor: '' },
        { nome: 'Internet', vencimento: 15, valor: '' },
        { nome: 'Gás', vencimento: 15, valor: '' }
    ]
};

const usuariosDB = {};

function getDadosUsuario(telefone) {
    if (!usuariosDB[telefone]) {
        console.log(`[DB] Criando nova sessão para o usuário: ${telefone}`);
        usuariosDB[telefone] = {
            ...JSON.parse(JSON.stringify(dadosMock)),
            telefone: telefone,
            meta: null,
            valor_meta: 0,
            data_fim_meta: null
        };
    }
    return usuariosDB[telefone];
}

// --- FUNÇÕES DE MENSAGERIA (ZAPSTER) ---
async function enviarMensagem(telefone, mensagem) {
    try {
        await axios.post(`${ZAPSTER_API_URL}/messages`, {
            recipient: telefone,
            text: mensagem
        }, {
            headers: {
                'Authorization': `Bearer ${ZAPSTER_TOKEN}`,
                'Content-Type': 'application/json',
                'X-Instance-ID': ZAPSTER_INSTANCE_ID
            }
        });
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error.response?.data || error.message);
    }
}

async function enviarMensagemComBotoes(telefone, mensagem, botoes) {
    try {
        await axios.post(`${ZAPSTER_API_URL}/messages`, {
            recipient: telefone,
            text: mensagem,
            buttons: botoes,
            buttons_mode: 'interactive'
        }, {
            headers: {
                'Authorization': `Bearer ${ZAPSTER_TOKEN}`,
                'Content-Type': 'application/json',
                'X-Instance-ID': ZAPSTER_INSTANCE_ID
            }
        });
    } catch (error) {
        console.error('Erro ao enviar mensagem com botões:', error.response?.data || error.message);
    }
}

// --- LÓGICA DE IA INTEGRADA (APRIMORADA) ---

function limparTexto(texto) {
    if (!texto) return '';
    return texto.replace(/\s\s+/g, ' ').trim();
}

function criarPrompt(textoEnriquecido) {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    return `
    Sua tarefa é atuar como um assistente financeiro que extrai informações de forma estruturada. Analise o texto e retorne APENAS um objeto JSON válido. A data de hoje é ${dataAtual}.

    **REGRAS:**
    1.  **CLASSIFICAÇÃO**: Classifique o texto em "Metas", "Investimentos", "Gastos", "Dicas", ou "Nenhum".
    2.  **EXTRAÇÃO PARA METAS**: Se o tema for "Metas", extraia "evento", "data" e "valor".
    3.  **GERAR PERGUNTAS**: Se um dado da meta estiver faltando, o campo correspondente deve conter a pergunta para o usuário.
    4.  **DATAS**: Se o usuário mencionar um mês sem dia (ex: "em dezembro"), assuma o dia 1 do próximo ano (2025).

    **EXEMPLO 1 (META COMPLETA):**
    - TEXTO: "quero juntar mil reais para a viagem dos sonhos em dezembro"
    - JSON: 
    {
      "tema": "Metas",
      "dados_extraidos": { "evento": "viagem dos sonhos", "data": "01/12/2025", "valor": 1000 }
    }
    ---
    **EXEMPLO 2 (META INCOMPLETA):**
    - TEXTO: "Preciso comprar um carro novo até o final do ano."
    - JSON: 
    {
      "tema": "Metas",
      "dados_extraidos": { "evento": "comprar carro novo", "data": "Podemos agendar para uma data específica no final de 2025?", "valor": "Qual o valor estimado para o carro novo?" }
    }
    ---
    **TEXTO PARA ANÁLISE, PARA CASOS ONDE A DATA LIMITE SEJA UM MÊS, DEFINA O DIA DE CADA MÊS COMO 1:**
    ${textoEnriquecido}

    **JSON DE SAÍDA:**
  `;
}

    const filaDePrompts = [];
    let processandoFila = false;

    async function analisarTextoComIA(textoUsuario, telefone) {
    const textoLimpo = limparTexto(textoUsuario);
    const prompt = criarPrompt(textoLimpo);

    return new Promise((resolve, reject) => {
        filaDePrompts.push({ prompt, telefone, resolve, reject });
        if (!processandoFila) {
        processarFila();
        }
    });
    }

    async function processarFila() {
    processandoFila = true;

    while (filaDePrompts.length > 0) {
        const { prompt, telefone, resolve, reject } = filaDePrompts[0]; 
        try {
        console.log(`[IA] Processando (${filaDePrompts.length - 1} restantes)...`);

        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();

        const cleanedResponse = responseText
            .trim()
            .replace(/```json/g, "")
            .replace(/```/g, "");

        const resultadoLLM = JSON.parse(cleanedResponse);
        console.log("[IA] Resultado da análise:", JSON.stringify(resultadoLLM, null, 2));

        resolve(resultadoLLM);
        } catch (error) {
        console.error(`ERRO AO PROCESSAR COM IA: "${prompt}"`, error);
        resolve({ tema: "Erro", texto: prompt });
        }

        filaDePrompts.shift();
        await esperar(1500);
    }

    processandoFila = false;
    }

    function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
    }



async function classificarComModeloLocal(texto) {
    if (!texto) return { tema: null, confianca: 0 };
    try {
        const response = await axios.post(FLASK_SERVER_URL, { frase: texto });
        console.log('[BERT] Resposta do servidor local:', response.data);
        return response.data;
    } catch (error) {
        console.error('ERRO AO CONECTAR COM O SERVIDOR DE CLASSIFICAÇÃO LOCAL:', error.message);
        return { tema: null, confianca: 0 };
    }
}

function decidirTemaFinal(resultadoGemini, resultadoModeloLocal) {
    const temaGemini = resultadoGemini.tema;
    const temaLocal = resultadoModeloLocal.tema;
    const confiancaLocal = resultadoModeloLocal.confianca;

    console.log(`[Decisão] Comparando Gemini (${temaGemini}) vs. Modelo Local (${temaLocal} com ${confiancaLocal.toFixed(2)} de confiança)`);

    if (temaGemini === 'Nenhum') {
        console.log(`[Decisão] Tema final definido como 'Nenhum' (prioridade do Gemini).`);
        return 'Nenhum';
    }
    if (confiancaLocal > 0.90) {
        console.log(`[Decisão] Tema final definido pelo modelo local (alta confiança): ${temaLocal}`);
        return temaLocal;
    }
    if ((temaGemini === 'Erro') && confiancaLocal > 0.70) {
        console.log(`[Decisão] Tema final definido pelo modelo local (Gemini incerto): ${temaLocal}`);
        return temaLocal;
    }
    if (temaGemini && temaLocal && temaGemini.toLowerCase() === temaLocal.toLowerCase()) {
        console.log(`[Decisão] Modelos concordam. Tema final: ${temaGemini}`);
        return temaGemini;
    }
    console.log(`[Decisão] Tema final definido pelo Gemini (padrão): ${temaGemini}`);
    return temaGemini;
}

function analisarHabitos(usuario) {
    const totalGastos = usuario.principais_gastos.reduce((acc, g) => acc + g.valor, 0);
    const porcentagemRenda = (totalGastos / usuario.renda) * 100;
    const saldoMensal = usuario.renda - totalGastos;
    return {
        totalGastos,
        porcentagemRenda,
        saldoMensal,
        status: porcentagemRenda > 90 ? 'crítico' : porcentagemRenda > 70 ? 'atenção' : 'saudável'
    };
}
function agruparPorCategoria(gastos) {
    const categorias = {
        'Moradia': 0, 'Alimentação': 0, 'Transporte': 0,
        'Lazer': 0, 'Outros': 0
    };
    gastos.forEach(gasto => {
        const nome = gasto.nome.toLowerCase();
        if (nome.includes('financiamento') || nome.includes('condomínio')) {
            categorias['Moradia'] += gasto.valor;
        } else if (nome.includes('alimentação')) {
            categorias['Alimentação'] += gasto.valor;
        } else if (nome.includes('transporte')) {
            categorias['Transporte'] += gasto.valor;
        } else if (nome.includes('saídas') || nome.includes('presentes')) {
            categorias['Lazer'] += gasto.valor;
        } else {
            categorias['Outros'] += gasto.valor;
        }
    });
    return categorias;
}
function sugerirInvestimentos(usuario, valor) {
    const sugestoes = {
        'Conservador': [
            { nome: 'Tesouro Selic', percentual: 50, retorno: '100% CDI' },
            { nome: 'CDB Liquidez Diária', percentual: 30, retorno: '95% CDI' },
            { nome: 'Fundo DI', percentual: 20, retorno: '90% CDI' }
        ],
        'Moderado': [
            { nome: 'Tesouro Selic', percentual: 30, retorno: '100% CDI' },
            { nome: 'CDB', percentual: 30, retorno: '110% CDI' },
            { nome: 'Fundo Multimercado', percentual: 25, retorno: 'CDI + 2%' },
            { nome: 'Ações (Dividendos)', percentual: 15, retorno: 'Variável' }
        ],
        'Arrojado': [
            { nome: 'Ações Growth', percentual: 40, retorno: 'Variável' },
            { nome: 'Fundos Multimercado', percentual: 30, retorno: 'CDI + 3%' },
            { nome: 'Tesouro IPCA+', percentual: 20, retorno: 'IPCA + 6%' },
            { nome: 'FIIs', percentual: 10, retorno: 'Dividendos' }
        ]
    };
    const perfil = usuario.possivel_perfil_investimento;
    const distribuicao = sugestoes[perfil].map(inv => ({
        ...inv,
        valor: (valor * inv.percentual / 100).toFixed(2)
    }));
    return { perfil, distribuicao };
}
function calcularProgressoMeta(telefone) {
    const usuario = getDadosUsuario(telefone);
    if (!usuario.meta || !usuario.data_fim_meta) return null;

    const analise = analisarHabitos(usuario);
    const hoje = new Date();
    const [dia, mes, ano] = usuario.data_fim_meta.split('-').map(Number);
    const dataFim = new Date(ano, mes - 1, dia);

    if (isNaN(dataFim.getTime())) return null;

    const diasRestantes = Math.ceil((dataFim - hoje) / (1000 * 60 * 60 * 24));
    const economiaAtual = usuario.investimentos;
    const progresso = (economiaAtual / usuario.valor_meta) * 100;
    const necessarioPorMes = (usuario.valor_meta - economiaAtual) / Math.max(diasRestantes / 30, 1);

    let mensagem = `Seu progresso: ${progresso.toFixed(1)}%\n`;
    mensagem += `Você já tem: R$ ${economiaAtual.toFixed(2)}\n`;
    mensagem += `Faltam ${Math.max(diasRestantes, 0)} dias.\n\n`;

    if (progresso >= 100) {
        mensagem += `Parabéns! Sua meta de R$ ${usuario.valor_meta.toFixed(2)} foi atingida!`;
    } else if (necessarioPorMes <= analise.saldoMensal) {
        mensagem += `Você está no caminho certo! Continue economizando R$ ${analise.saldoMensal.toFixed(2)} por mês.`;
    } else {
        mensagem += `Atenção! Para atingir sua meta, você precisa economizar R$ ${necessarioPorMes.toFixed(2)} por mês. Seu saldo atual é de R$ ${analise.saldoMensal.toFixed(2)}.`;
    }
    return { progresso, mensagem, necessarioPorMes };
}
function gerarDicasPersonalizadas(usuario, analise) {
    const dicas = [];
    if (analise.porcentagemRenda > 80) {
        dicas.push('Seus gastos estão altos! Tente reduzir 10% de seus gastos não essenciais.');
    }
    const categoriaMaior = Object.entries(agruparPorCategoria(usuario.principais_gastos)).sort((a, b) => b[1] - a[1])[0];
    if (categoriaMaior && categoriaMaior[0] !== 'Moradia' && categoriaMaior[1] > usuario.renda * 0.2) {
        dicas.push(`Você está gastando muito em ${categoriaMaior[0]}. Você gastou R$ ${categoriaMaior[1].toFixed(2)}. Considere alternativas mais econômicas.`);
    }
    if (usuario.dias_mais_gastos.length > 0) {
        dicas.push(`Você gasta mais nos dias ${usuario.dias_mais_gastos.slice(0, 3).join(', ')}. Tente reduzir gastos nestes dias.`);
    }
    if (analise.saldoMensal > 500) {
        dicas.push(`Você tem R$ ${analise.saldoMensal.toFixed(2)} sobrando! Que tal investir 70% disso?`);
        enviarMensagemComBotoes(telefone, `Investir ${analise.saldoMensal.toFixed(2)} ou outro valor?`, [
            { label: 'Investir', type: 'reply' },
            { label: 'Voltar ao Menu', type: 'reply' }
        ]);
    }
    return dicas.length > 0 ? dicas : ['Seus hábitos financeiros estão saudáveis! Continue assim'];
}
function gerarRelatorioMensal(usuario, mes) {
    const analise = analisarHabitos(usuario);
    const nomeMes = new Date(new Date().getFullYear(), mes - 1).toLocaleDateString('pt-BR', { month: 'long' });
    let relatorio = `Relatório Mensal - ${nomeMes}\n\n`;
    relatorio += `Resumo Geral\n`;
    relatorio += `Entradas: R$ ${usuario.renda.toFixed(2)}\n`;
    relatorio += `Saídas: R$ ${analise.totalGastos.toFixed(2)}\n`;
    relatorio += `Saldo: R$ ${analise.saldoMensal.toFixed(2)}\n\n`;
    relatorio += `Gastos por Categoria\n`;
    Object.entries(agruparPorCategoria(usuario.principais_gastos)).sort((a, b) => b[1] - a[1]).forEach(([cat, valor]) => {
        if (valor > 0) {
            const perc = (valor / analise.totalGastos * 100).toFixed(1);
            relatorio += `${cat}: R$ ${valor.toFixed(2)} (${perc}%)\n`;
        }
    });
    return relatorio;
}
function extrairDadosPagamento(mensagem, usuario) {
    const msgLower = mensagem.toLowerCase();
    let contaEncontrada = null;
    let valorEncontrado = null;
    for (const conta of usuario.possiveis_pagamentos) {
        const nomeConta = conta.nome.toLowerCase();
        if (msgLower.includes(nomeConta)) {
            contaEncontrada = conta.nome;
            break;
        }
    }
    if (!contaEncontrada) return null;
    const regexValor = /(?:R\$\s?)?(\d{1,5}(?:[.,]\d{1,2})?)/;
    const match = msgLower.match(regexValor);
    if (match && match[1]) {
        valorEncontrado = parseFloat(match[1].replace(',', '.'));
    }
    if (contaEncontrada && valorEncontrado > 0) {
        return { nome: contaEncontrada, valor: valorEncontrado };
    }
    return null;
}
function verificarSaudeFinanceiraAposPagamento(usuario, valorPagamento) {
    const analiseAtual = analisarHabitos(usuario);
    const novoTotalGastos = analiseAtual.totalGastos + valorPagamento;
    const novoSaldo = usuario.renda - novoTotalGastos;
    const limiteSaudavel = usuario.renda * 0.15;
    return { saudavel: novoSaldo >= limiteSaudavel, novoSaldo: novoSaldo };
}
async function lidarComPagamento(telefone, mensagem) {
    const usuario = getDadosUsuario(telefone);
    const dadosPagamento = extrairDadosPagamento(mensagem, usuario);

    if (!dadosPagamento) {
        await enviarMensagem(telefone, "Não consegui identificar a conta e o valor para o pagamento. Por favor, tente novamente.");
        return;
    }

    const { nome, valor } = dadosPagamento;
    const saudeFinanceira = verificarSaudeFinanceiraAposPagamento(usuario, valor);
    let aviso = !saudeFinanceira.saudavel ? `\n\n*Atenção!*\nApós este pagamento, seu saldo será de R$ ${saudeFinanceira.novoSaldo.toFixed(2)}.` : "";

    conversasAtivas[telefone].state = 'AGUARDANDO_CONFIRMACAO_PAGAMENTO';
    conversasAtivas[telefone].dadosPagamentoParaConfirmar = { nome, valor };

    await enviarMensagemComBotoes(telefone, `Confirmar pagamento de:\n\n*Conta:* ${nome}\n*Valor:* R$ ${valor.toFixed(2)}${aviso}\n\nConfirma?`, [
        { label: 'Sim, confirmar', type: 'reply' },
        { label: 'Cancelar', type: 'reply' }
    ]);
}

// --- PROCESSADOR DE COMANDOS ---
const conversasAtivas = {};

function processarDadosMeta(dados) {
    const resultado = { evento: null, data: null, valor: null };
    for (const [campo, valor] of Object.entries(dados)) {
        if (typeof valor === 'string' && !valor.toLowerCase().includes('qual') && !valor.toLowerCase().includes('podemos')) {
            resultado[campo] = valor;
        } else if (typeof valor === 'number') {
            resultado[campo] = valor;
        }
    }
    return { dadosCompletos: resultado };
}

async function apresentarMetaParaConfirmacao(telefone, dadosExtraidos) {
    const { dadosCompletos } = processarDadosMeta(dadosExtraidos);
    conversasAtivas[telefone].state = 'AGUARDANDO_CONFIRMACAO_META';
    conversasAtivas[telefone].dadosMetaParaConfirmar = dadosCompletos;

    const objetivo = dadosCompletos.evento ? `*Objetivo:* ${dadosCompletos.evento}` : '*Objetivo:* Não identificado';
    const valor = dadosCompletos.valor ? `*Valor:* R$ ${dadosCompletos.valor.toFixed(2)}` : '*Valor:* Não identificado';
    const data = dadosCompletos.data ? `*Data limite:* ${dadosCompletos.data}` : '*Data limite:* Não identificada';

    const mensagemConfirmacao = `Entendi a seguinte meta:\n\n${objetivo}\n${valor}\n${data}\n\nAs informações estão corretas?`;

    await enviarMensagemComBotoes(telefone, mensagemConfirmacao, [
        { label: 'Sim, criar meta', type: 'reply' },
        { label: 'Digitar novamente', type: 'reply' },
        { label: 'Voltar ao Menu', type: 'reply' }
    ]);
}


async function processarComando(telefone, mensagem, messageCount = 1) {
    const msg = mensagem.trim();
    const msgLower = msg.toLowerCase();
    const state = conversasAtivas[telefone]?.state;
    const usuario = getDadosUsuario(telefone);

    // --- State Machine ---
    if (state === 'AGUARDANDO_CONFIRMACAO_PAGAMENTO') {
        if (msgLower === 'sim, confirmar') {
            const { nome, valor } = conversasAtivas[telefone].dadosPagamentoParaConfirmar;
            usuario.principais_gastos.push({ nome: `Pagamento - ${nome}`, valor: valor });
            conversasAtivas[telefone].state = null;
            await enviarMensagem(telefone, `Pagamento de R$ ${valor.toFixed(2)} para "${nome}" registrado!`);
            return processarComando(telefone, 'Ver Saldo', messageCount);
        } else {
            conversasAtivas[telefone].state = null;
            await enviarMensagem(telefone, "Operação cancelada.");
            return processarComando(telefone, 'Menu Principal', messageCount);
        }
    }

    if (state === 'AGUARDANDO_CONFIRMACAO_META') {
        const dadosConfirmados = conversasAtivas[telefone].dadosMetaParaConfirmar;
        const metaCompleta = dadosConfirmados && dadosConfirmados.evento && dadosConfirmados.data && dadosConfirmados.valor;

        if (msgLower === 'sim, criar meta') {
            if (!metaCompleta) {
                conversasAtivas[telefone].state = 'AGUARDANDO_META';
                conversasAtivas[telefone].dadosParciais = dadosConfirmados;
                let msgFaltante = "Ainda faltam algumas informações para criar sua meta:\n\n";
                if (!dadosConfirmados.evento) msgFaltante += `- Qual é o objetivo?\n`;
                if (!dadosConfirmados.data) msgFaltante += `- Qual é a data limite?\n`;
                if (!dadosConfirmados.valor) msgFaltante += `- Qual o valor a ser juntado?\n`;
                msgFaltante += "\nPor favor, me responda com os dados que faltam ou digite *menu*.";
                return enviarMensagem(telefone, msgFaltante);
            }
            usuario.meta = dadosConfirmados.evento;
            usuario.data_fim_meta = dadosConfirmados.data.replace(/\//g, '-');
            usuario.valor_meta = dadosConfirmados.valor;
            conversasAtivas[telefone].state = null;
            return enviarMensagemComBotoes(telefone, `Meta criada com sucesso!\n\n*${usuario.meta}*\nR$ ${usuario.valor_meta.toFixed(2)}\nAté ${usuario.data_fim_meta}`,
                [{ label: 'Ver Progresso', type: 'reply' }, { label: 'Voltar ao Menu', type: 'reply' }]
            );
        } else if (msgLower === 'digitar novamente') {
            conversasAtivas[telefone].state = 'AGUARDANDO_META';
            conversasAtivas[telefone].dadosParciais = null;
            return enviarMensagem(telefone, `Ok, vamos tentar de novo!\n\nDiga-me qual é a sua meta, incluindo objetivo, valor e data.`);
        } else {
            conversasAtivas[telefone].state = null;
            return processarComando(telefone, 'Menu Principal', messageCount);
        }
    }
    
    if (state === 'AGUARDANDO_META') {
        if (['voltar', 'menu'].includes(msgLower)) {
            conversasAtivas[telefone].state = null;
            return processarComando(telefone, 'Menu Principal', messageCount);
        }
        const analise = await analisarTextoComIA(msg);
        const dadosPrevios = conversasAtivas[telefone].dadosParciais || {};
        if (analise.tema === "Metas" && analise.dados_extraidos) {
            const { dadosCompletos: novosDados } = processarDadosMeta(analise.dados_extraidos);
            const dadosMesclados = { ...dadosPrevios, ...novosDados };
            return apresentarMetaParaConfirmacao(telefone, dadosMesclados);
        } else {
            return enviarMensagem(telefone, "Ainda não consegui entender os detalhes. Por favor, tente informar o que falta ou digite *menu* para voltar.");
        }
    }

    if (msgLower.includes('pagamento') || msgLower.includes('pagar')) {
        return lidarComPagamento(telefone, msg);
    }
    if (['menu principal', 'voltar ao menu', 'menu', 'oi', 'olá', 'ola', 'eae', 'e aí', 'e aí?', '.',  '!'].includes(msgLower)) {
        return enviarMensagemComBotoes(telefone, `Olá, ${usuario.nome}! Sou sua assistente financeira. Como posso ajudar?`,
            [{ label: 'Ver Saldo', type: 'reply' }, { label: 'Meus Gastos', type: 'reply' }, { label: 'Minhas Metas', type: 'reply' }]
        );
    }
    if (msgLower === 'ver saldo') {
        const analise = analisarHabitos(usuario);
        const statusEmoji = analise.status === 'saudável' ? '' : analise.status === 'atenção' ? '' : '';
        const mensagemSaldo = `Resumo Financeiro ${statusEmoji}\n\n` +
            `Renda: R$ ${usuario.renda.toFixed(2)}\n` +
            `Gastos: R$ ${analise.totalGastos.toFixed(2)}\n` +
            `*Saldo: R$ ${analise.saldoMensal.toFixed(2)}*\n\n` + 'O que deseja fazer?';
        return enviarMensagemComBotoes(telefone, mensagemSaldo, [
             { label: 'Analisar Gastos', type: 'reply' }, { label: 'Ver Contas', type: 'reply' }
        ]);
    }
     if (['meus gastos', 'analisar gastos'].includes(msgLower)) {
        const analise = analisarHabitos(usuario);
        const categorias = agruparPorCategoria(usuario.principais_gastos);
        const categoriasMaiores = Object.entries(categorias).sort((a,b) => b[1] - a[1]).slice(0,3);
        let resposta = `Análise de Gastos\n\nTotal: R$ ${analise.totalGastos.toFixed(2)}\n\n*Principais categorias:*\n`;
        categoriasMaiores.forEach(([cat, val]) => resposta += `${cat}: R$ ${val.toFixed(2)}\n`);
        return enviarMensagemComBotoes(telefone, resposta, [
            { label: 'Receber Dicas', type: 'reply' }, { label: 'Relatório Completo', type: 'reply' }, { label: 'Voltar ao Menu', type: 'reply' }
        ]);
    }
    if (msgLower === 'minhas metas') {
        if (!usuario.meta) {
            return enviarMensagemComBotoes(telefone, `Você ainda não tem metas. Definir metas ajuda a conquistar seus objetivos!`,
                [{ label: 'Criar Meta', type: 'reply' }, { label: 'Voltar ao Menu', type: 'reply' }]
            );
        }
        return processarComando(telefone, 'Ver Progresso', messageCount);
    }
    if (['criar meta', 'criar nova meta'].includes(msgLower)) {
        conversasAtivas[telefone].state = 'AGUARDANDO_META';
        return enviarMensagem(telefone, `Ok, vamos criar sua meta!\n\nDiga-me o que você quer alcançar (objetivo, valor e data).`);
    }
     if (['contas a vencer', 'ver contas'].includes(msgLower)) {
        const hoje = new Date().getDate();
        const proximas = usuario.contas_recorrentes.filter(c => c.vencimento >= hoje).sort((a, b) => a.vencimento - b.vencimento);
        if (proximas.length === 0) return enviarMensagem(telefone, "Boas notícias! Nenhuma conta a vencer este mês.");
        let resposta = 'Próximas Contas:\n\n';
        proximas.forEach(c => resposta += `${c.nome}\nR$ ${c.valor.toFixed(2)} - Vence dia ${c.vencimento}\n\n`);
        return enviarMensagemComBotoes(telefone, resposta, [{ label: 'Ver Saldo', type: 'reply' }, { label: 'Voltar ao Menu', type: 'reply' }]);
    }
    if (['investir', 'ver investimentos'].includes(msgLower)) {
        const analise = analisarHabitos(usuario);
        if (analise.saldoMensal <= 100) return enviarMensagem(telefone, "No momento, seu saldo não é ideal para investir. Foque em organizar seus gastos.");
        const sugestao = sugerirInvestimentos(usuario, analise.saldoMensal);
        let resposta = `Sugestões de Investimento (Perfil ${sugestao.perfil}):\n\n`;
        sugestao.distribuicao.forEach(inv => resposta += `*${inv.nome}* (${inv.percentual}%)\n   R$ ${inv.valor}\n\n`);
        return enviarMensagemComBotoes(telefone, resposta, [{ label: 'Saber Mais', type: 'reply' }, { label: 'Voltar ao Menu', type: 'reply' }]);
    }
    if(['saber mais', 'saber mais sobre investimentos'].includes(msgLower)) {
        return enviarMensagemComBotoes(telefone, 'Acesse para liberar a função!', [{ label: 'Acessar', type: 'url', url: 'https://investimentos.btgpactual.com/renda-variavel/acoes' }, { label: 'Voltar ao Menu', type: 'reply' }]);
    }
     if (['receber dicas', 'dicas de economia'].includes(msgLower)) {
        const analise = analisarHabitos(usuario);
        const dicas = gerarDicasPersonalizadas(usuario, analise);
        const mensagemDicas = `💡 Dicas Personalizadas:\n\n- ${dicas.join('\n\n- ')}`;
        return enviarMensagemComBotoes(telefone, mensagemDicas, [{ label: 'Ver Gastos', type: 'reply' }, { label: 'Voltar ao Menu', type: 'reply' }]);
    }
     if (msgLower === 'relatório completo') {
        const mes = new Date().getMonth() + 1;
        const relatorio = gerarRelatorioMensal(usuario, mes);
        return enviarMensagemComBotoes(telefone, relatorio, [{ label: 'Receber Dicas', type: 'reply' }, { label: 'Voltar ao Menu', type: 'reply' }]);
    }
     if (msgLower === 'excluir meta') {
        usuario.meta = null;
        usuario.valor_meta = 0;
        usuario.data_fim_meta = null;
        return enviarMensagem(telefone, "Meta excluída com sucesso!");
    }
    if (msgLower === 'ver progresso') {
        if (!usuario.meta) return enviarMensagem(telefone, 'Você não tem metas ativas.');
        const progresso = calcularProgressoMeta(telefone);
        if (!progresso) return enviarMensagem(telefone, 'Não foi possível calcular o progresso.');
        const barra = '🟩'.repeat(Math.floor(progresso.progresso / 10)) + '⬜️'.repeat(10 - Math.floor(progresso.progresso / 10));
        return enviarMensagemComBotoes(telefone, `*Meta: ${usuario.meta}*\n${barra} ${progresso.progresso.toFixed(1)}%\n\n${progresso.mensagem}`,
            [{ label: 'Excluir Meta', type: 'reply' }, { label: 'Voltar ao Menu', type: 'reply' }]
        );
    }
    
    // --- Fallback Inteligente com IA ---
    const [analiseIA, analiseModeloLocal] = await Promise.all([
        analisarTextoComIA(msg),
        classificarComModeloLocal(msg)
    ]);
    const temaFinal = decidirTemaFinal(analiseIA, analiseModeloLocal);

    switch (temaFinal) {
        case "Metas":
            return apresentarMetaParaConfirmacao(telefone, analiseIA.dados_extraidos || {});
        case "Investimentos":
            return processarComando(telefone, 'Ver Investimentos', messageCount);
        case "Gastos":
            return processarComando(telefone, 'Meus Gastos', messageCount);
        default:
            if (temaFinal === 'Nenhum' && messageCount === 1) {
                console.log("[Lógica] Primeiro contato e tema 'Nenhum'. Exibindo menu principal.");
                return processarComando(telefone, 'Menu Principal', messageCount);
            }
            return enviarMensagemComBotoes(telefone, `Desculpe, não entendi o que você quis dizer.\n\nPode tentar de novo ou escolher uma opção:`,
                [{ label: 'Menu Principal', type: 'reply' }, { label: 'Como Funciona', type: 'reply' }]
            );
    }
}

// --- CONFIGURAÇÃO DO SERVIDOR EXPRESS (WEBHOOK) ---
app.post('/webhook/zapster', async (req, res) => {
    try {
        const telefone = req.body.data?.sender?.id;
        const message = req.body.data?.content?.text;
        if (!telefone || !message) return res.sendStatus(200);
        
        console.log(`📱 Mensagem de ${telefone}: ${message}`);
        if (!conversasAtivas[telefone]) {
            conversasAtivas[telefone] = { state: null, messageCount: 0 };
        }
        conversasAtivas[telefone].messageCount++;
        
        await processarComando(telefone, message, conversasAtivas[telefone].messageCount);
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('❌ Erro no webhook:', error);
        res.status(500).json({ error: 'Erro ao processar' });
    }
});

app.get('/', (req, res) => res.json({ status: 'online', bot: 'Assistente BTG', versao: '3.6' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`📊 Bot BTG v3.6 (Menu Inteligente)`);
});

