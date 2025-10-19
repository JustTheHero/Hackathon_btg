require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
//codar para trocar data
const app = express();
app.use(express.json());

const ZAPSTER_API_URL = 'https://api.zapsterapi.com/v1/wa';
const ZAPSTER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MjgxNjA1ODMsImlzcyI6InphcHN0ZXJhcGkiLCJzdWIiOiJmNTM3MzIxYS05NDg4LTRjZWItOTcwOC1jZmE2ODkwN2I3NmYiLCJqdGkiOiI2MGUwM2MyMy04YTgwLTRjNTAtOTU1NC02ZWU5ODJjZWRmZjAifQ.LGb9vPKOxN3W9Ke8DxTweEaGFfApKhll5666c62L9RU';
const ZAPSTER_INSTANCE_ID = 'xhnhbs8cy4wxrkkf0h1jc';

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
    meta: null,
    valor_meta: 0,
    data_fim_meta: null,
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
    dias_mais_gastos: [5, 10, 15, 20, 25]
};

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

function analisarHabitos() {
    const totalGastos = dadosMock.principais_gastos.reduce((acc, g) => acc + g.valor, 0);
    const porcentagemRenda = (totalGastos / dadosMock.renda) * 100;
    const saldoMensal = dadosMock.renda - totalGastos;
    const categorias = agruparPorCategoria(dadosMock.principais_gastos);
    const categoriasMaiores = Object.entries(categorias).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return {
        totalGastos,
        porcentagemRenda,
        saldoMensal,
        categoriasMaiores,
        status: porcentagemRenda > 90 ? 'crítico' : porcentagemRenda > 70 ? 'atenção' : 'saudável'
    };
}

function agruparPorCategoria(gastos) {
    const categorias = {
        'Moradia': 0,
        'Alimentação': 0,
        'Transporte': 0,
        'Lazer': 0,
        'Outros': 0
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

function sugerirInvestimentos(valor) {
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
    const perfil = dadosMock.possivel_perfil_investimento;
    const distribuicao = sugestoes[perfil].map(inv => ({
        ...inv,
        valor: (valor * inv.percentual / 100).toFixed(2)
    }));
    return { perfil, distribuicao };
}

function calcularProgressoMeta() {
    if (!dadosMock.meta) return null;
    const analise = analisarHabitos();
    const hoje = new Date();
    const dataFim = new Date(dadosMock.data_fim_meta.split('-').reverse().join('-'));
    const diasRestantes = Math.ceil((dataFim - hoje) / (1000 * 60 * 60 * 24));
    const economiaAtual = dadosMock.investimentos + analise.saldoMensal;
    const progresso = (economiaAtual / dadosMock.valor_meta) * 100;
    const necessarioPorMes = (dadosMock.valor_meta - economiaAtual) / Math.max(diasRestantes / 30, 1);
    
    let mensagem = `Seu progresso: ${progresso.toFixed(1)}%\n`;
    mensagem += `Você economizou: R$ ${economiaAtual.toFixed(2)}\n`;
    mensagem += `Faltam ${Math.max(diasRestantes, 0)} dias.\n\n`;
    
    if (progresso >= 100) {
        mensagem += `Parabéns! Sua meta de R$ ${dadosMock.valor_meta.toFixed(2)} foi atingida!`;
    } else if (necessarioPorMes <= analise.saldoMensal) {
        mensagem += `Você está no caminho certo! Continue economizando.`;
    } else {
        mensagem += `Você precisa economizar R$ ${necessarioPorMes.toFixed(2)} por mês.`;
    }
    return { progresso, mensagem, necessarioPorMes };
}

function gerarDicasPersonalizadas(analise) {
    const dicas = [];

    if (analise.porcentagemRenda > 80) {
        dicas.push('Seus gastos estão altos! Tente reduzir 10% de seus gastos não essenciais.');
    }
    
    const categoriaMaior = analise.categoriasMaiores[0];
    if (categoriaMaior[0] !== 'Moradia' && categoriaMaior[1] > dadosMock.renda * 0.2) {
        dicas.push(`Você está gastando muito em ${categoriaMaior[0]}. Você gastou R$ ${categoriaMaior[1].toFixed(2)}. Considere alternativas mais econômicas.`);
    }
    
    if (dadosMock.dias_mais_gastos.length > 0) {
        dicas.push(`Você gasta mais nos dias ${dadosMock.dias_mais_gastos.slice(0, 3).join(', ')}. Tente reduzir gastos nestes dias.`);
    }
    
    if (analise.saldoMensal > 500) {
        dicas.push(`Você tem R$ ${analise.saldoMensal.toFixed(2)} sobrando! Que tal investir 70% disso?`);
    }

    const comprasOnline = dadosMock.principais_gastos.find(g => g.nome.includes('Compras'));
    if (comprasOnline && comprasOnline.valor > 200) {
        dicas.push(`Suas compras online estão em R$ ${comprasOnline.valor}. Compre com consciência.`);
    }
    
    return dicas.length > 0 ? dicas : ['Seus hábitos financeiros estão saudáveis! Continue assim'];
}

function gerarRelatorioMensal(mes) {
    const analise = analisarHabitos();
    const nomeMes = new Date(2025, mes - 1).toLocaleDateString('pt-BR', { month: 'long' });
    let relatorio = `Relatório Mensal - ${nomeMes}\n\n`;
    relatorio += `Resumo Geral\n`;
    relatorio += `Entradas: R$ ${dadosMock.renda.toFixed(2)}\n`;
    relatorio += `Saídas: R$ ${analise.totalGastos.toFixed(2)}\n`;
    relatorio += `Saldo: R$ ${analise.saldoMensal.toFixed(2)}\n`;
    relatorio += `Comprometimento: ${analise.porcentagemRenda.toFixed(1)}%\n\n`;
    relatorio += `Gastos por Categoria\n`;
    Object.entries(agruparPorCategoria(dadosMock.principais_gastos)).sort((a, b) => b[1] - a[1]).forEach(([cat, valor]) => {
        if (valor > 0) {
            const perc = (valor / analise.totalGastos * 100).toFixed(1);
            relatorio += `${cat}: R$ ${valor.toFixed(2)} (${perc}%)\n`;
        }
    });
    relatorio += `\nStatus Financeiro: `;
    relatorio += analise.status === 'saudável' ? 'Saudável' : analise.status === 'atenção' ? 'Atenção' : 'Crítico';

    return relatorio;
}

const conversasAtivas = {};

async function processarComando(telefone, mensagem) {
    const msg = mensagem.trim(); 

    if (msg === 'Menu Principal' || msg === 'Voltar ao Menu' || msg === 'menu' || msg === 'oi') {
        await enviarMensagemComBotoes(
            telefone,
            `Olá, ${dadosMock.nome}\n\n` +
            `Sou sua assistente financeira do BTG. Como posso ajudar hoje?\n\n`,
            [
                { label: 'Ver Saldo', type: 'reply' },
                { label: 'Meus Gastos', type: 'reply' },
                { label: 'Minhas Metas', type: 'reply' }
            ]
        );
        return;
    }

    if (msg === 'Ver Saldo') {
        const analise = analisarHabitos();
        const statusEmoji = analise.saldoMensal > 1000 ? 'Alto' : analise.saldoMensal > 0 ? 'Médio' : 'Baixo';

        const mensagemSaldo = `Resumo Financeiro - Status: ${statusEmoji}\n\n` +
            `Renda mensal: R$ ${dadosMock.renda.toFixed(2)}\n` +
            `Gastos previstos: R$ ${analise.totalGastos.toFixed(2)}\n` +
            `Saldo disponível: R$ ${analise.saldoMensal.toFixed(2)}\n\n` +
            `Você está usando ${analise.porcentagemRenda.toFixed(1)}% da sua renda.\n\n` +
            (analise.status === 'crítico' ? 'Atenção! Seus gastos estão muito altos!\n\n' : '') +
            'O que deseja fazer?';

        const botoes = [];
        if (analise.saldoMensal > 500) {
            botoes.push({ label: 'Ver Investimentos', type: 'reply' });
        }
        botoes.push({ label: 'Analisar Gastos', type: 'reply' });
        botoes.push({ label: 'Ver Contas', type: 'reply' });

        await enviarMensagemComBotoes(telefone, mensagemSaldo, botoes);
        return;
    }

    if (msg === 'Meus Gastos' || msg === 'Analisar Gastos' || msg === 'Ver Gastos') {
        const analise = analisarHabitos();
        let resposta = `Análise de Gastos - ${new Date().toLocaleDateString('pt-BR', { month: 'long' })}\n\n`;

        resposta += `Total gasto: R$ ${analise.totalGastos.toFixed(2)}\n`;
        resposta += `Percentual da renda: ${analise.porcentagemRenda.toFixed(1)}%\n\n`;

        resposta += `Principais categorias:\n`;
        analise.categoriasMaiores.forEach((cat, i) => {
            resposta += `${i + 1}. ${cat[0]}: R$ ${cat[1].toFixed(2)}\n`;
        });

        resposta += `\nVocê costuma gastar mais nos dias ${dadosMock.dias_mais_gastos.join(', ')}.\n\n`;
        resposta += 'O que gostaria de fazer?';

        await enviarMensagemComBotoes(telefone, resposta, [
            { label: 'Receber Dicas', type: 'reply' },
            { label: 'Relatório Completo', type: 'reply' },
            { label: 'Criar Meta', type: 'reply' }
        ]);
        return;
    }

    if (msg === 'Minhas Metas') {
        if (!dadosMock.meta) {
            await enviarMensagemComBotoes(
                telefone,
                `Você não tem metas ativas\n\n` +
                `Definir metas ajuda você a conquistar seus objetivos financeiros!\n\n` +
                `Exemplos de metas:\n` +
                `• Viagem de férias\n` +
                `• Reserva de emergência\n` +
                `• Compra de um bem\n` +
                `• Reforma da casa\n\n` +
                `O que deseja fazer?`,
                [
                    { label: 'Criar Meta', type: 'reply' },
                    { label: 'Como Funciona', type: 'reply' },
                    { label: 'Voltar ao Menu', type: 'reply' }
                ]
            );
            return;
        }

        const progresso = calcularProgressoMeta();
        const mensagemMeta = `Sua Meta Atual\n\n` +
            `${dadosMock.meta}\n` +
            `Valor: R$ ${dadosMock.valor_meta.toFixed(2)}\n` +
            `Prazo: ${dadosMock.data_fim_meta}\n\n` +
            `${progresso.mensagem}\n\n` +
            `O que deseja fazer?`;

        await enviarMensagemComBotoes(telefone, mensagemMeta, [
            { label: 'Ver Progresso', type: 'reply' },
            { label: 'Dicas p/ Meta', type: 'reply' },
            { label: 'Excluir Meta', type: 'reply' }
        ]);
        return;
    }

    if (msg === 'Criar Meta' || msg === 'Criar Nova Meta') {
        await enviarMensagem(
            telefone,
            `Vamos criar sua meta\n\n` +
            `Por favor, envie no formato:\n` +
            `meta criar [valor] [descrição] [data]\n\n` +
            `Exemplo:\n` +
            `meta criar 5000 Viagem Disney 31-12-2025\n\n`
        );
        return;
    }

    if (msg.toLowerCase().startsWith('meta criar') && msg.split(' ').length >= 5) {//verificar data
        const partes = msg.split(' ');
        dadosMock.valor_meta = parseFloat(partes[2]);
        dadosMock.data_fim_meta = partes[partes.length - 1];
        dadosMock.meta = partes.slice(3, -1).join(' ');

        await enviarMensagemComBotoes(
            telefone,
            `Meta criada com sucesso\n\n` +
            `${dadosMock.meta}\n` +
            `R$ ${dadosMock.valor_meta.toFixed(2)}\n` +
            `Até ${dadosMock.data_fim_meta}\n\n` +
            `O que deseja fazer agora?`,
            [
                { label: 'Dicas p/ Atingir', type: 'reply' },
                { label: 'Ver Investimentos', type: 'reply' },
                { label: 'Voltar ao Menu', type: 'reply' }
            ]
        );
        return;
    }

    if (msg === 'Contas a Vencer' || msg === 'Ver Contas') {
        const hoje = new Date().getDate();
        const proximasContas = dadosMock.contas_recorrentes
            .filter(c => c.vencimento >= hoje)
            .sort((a, b) => a.vencimento - b.vencimento);

        let resposta = 'Próximas Contas a Vencer\n\n';

        proximasContas.forEach(conta => {
            const dias = conta.vencimento - hoje;
            const urgencia = dias <= 3 ? 'Urgente' : dias <= 7 ? 'Atenção' : 'Normal';
            resposta += `[${urgencia}] ${conta.nome}\n`;
            resposta += `   R$ ${conta.valor.toFixed(2)} - Vence dia ${conta.vencimento}\n\n`;
        });

        const total = proximasContas.reduce((acc, c) => acc + c.valor, 0);
        resposta += `Total: R$ ${total.toFixed(2)}\n\n`;
        resposta += 'O que deseja fazer?';

        await enviarMensagemComBotoes(telefone, resposta, [
            { label: 'Ver Saldo', type: 'reply' },
            { label: 'Dicas de Economia', type: 'reply' },
            { label: 'Voltar ao Menu', type: 'reply' }
        ]);
        return;
    }

    if (msg === 'Investir' || msg === 'Ver Investimentos') {
        const analise = analisarHabitos();

        if (analise.saldoMensal <= 0) {
            await enviarMensagemComBotoes(
                telefone,
                `Atenção\n\n` +
                `No momento você não tem saldo disponível para investir.\n\n` +
                `Mas não desanime! Vamos trabalhar juntos para melhorar isso.`,
                [
                    { label: 'Receber Dicas', type: 'reply' },
                    { label: 'Criar Meta', type: 'reply' },
                    { label: 'Ver Gastos', type: 'reply' }
                ]
            );
            return;
        }

        const sugestao = sugerirInvestimentos(analise.saldoMensal);

        let resposta = `Sugestões de Investimento\n\n`;
        resposta += `Baseado no perfil ${sugestao.perfil} e saldo de R$ ${analise.saldoMensal.toFixed(2)}:\n\n`;

        sugestao.distribuicao.forEach(inv => {
            resposta += `${inv.nome} (${inv.percentual}%)\n`;
            resposta += `   R$ ${inv.valor} - Retorno: ${inv.retorno}\n\n`;
        });

        resposta += `Essas sugestões são baseadas no perfil e podem ajudar seu dinheiro a render!`;

        await enviarMensagemComBotoes(telefone, resposta, [
            { label: 'Quero Investir', type: 'reply' },
            { label: 'Saber Mais', type: 'reply' },
            { label: 'Voltar ao Menu', type: 'reply' }
        ]);
        return;
    }

    if (msg === 'Quero Investir') {
        await enviarMensagemComBotoes(
            telefone,
            `Ótima decisão\n\n` +
            `Nota: Em produção, aqui você seria direcionado para o app do BTG ou atendimento.\n\n` +
            `Posso ajudar em algo mais?`,
            [
                { label: 'Criar Meta', type: 'reply' },
                { label: 'Receber Dicas', type: 'reply' },
                { label: 'Voltar ao Menu', type: 'reply' }
            ]
        );
        return;
    }

    if (msg === 'Receber Dicas' || msg === 'Dicas de Economia' || msg === 'Dicas p/ Meta' || msg === 'Dicas p/ Atingir') {
        const analise = analisarHabitos();
        const dicas = gerarDicasPersonalizadas(analise);

        const mensagemDicas = `Dicas Personalizadas para Você\n\n${dicas.join('\n\n')}\n\n` +
            `O que deseja fazer agora?`;

        await enviarMensagemComBotoes(telefone, mensagemDicas, [
            { label: 'Ver Gastos', type: 'reply' },
            { label: 'Criar Meta', type: 'reply' },
            { label: 'Voltar ao Menu', type: 'reply' }
        ]);
        return;
    }

    if (msg === 'Relatório Completo') {
        const mes = new Date().getMonth() + 1;
        const relatorio = gerarRelatorioMensal(mes);

        await enviarMensagemComBotoes(
            telefone,
            relatorio + '\n\nO que deseja fazer?',
            [
                { label: 'Receber Dicas', type: 'reply' },
                { label: 'Ver Investimentos', type: 'reply' },
                { label: 'Voltar ao Menu', type: 'reply' }
            ]
        );
        return;
    }

    if (msg === 'Como Funciona' || msg === 'Saber Mais') {
        await enviarMensagemComBotoes(
            telefone,
            `Como funciona o Assistente Financeiro BTG\n\n` +
            `Eu analiso gastos, renda e hábitos para:\n\n` +
            `- Avisar sobre contas próximas\n` +
            `- Sugerir investimentos personalizados\n` +
            `- Ajudar a criar e acompanhar metas\n` +
            `- Dar dicas de economia\n` +
            `- Enviar relatórios mensais\n\n`,
            [
                { label: 'Criar Meta', type: 'reply' },
                { label: 'Ver Investimentos', type: 'reply' },
                { label: 'Voltar ao Menu', type: 'reply' }
            ]
        );
        return;
    }

    if (msg === 'Excluir Meta') {
        dadosMock.meta = null;
        dadosMock.valor_meta = 0;
        dadosMock.data_fim_meta = null;

        await enviarMensagemComBotoes(
            telefone,
            `Meta excluída\n\n` +
            `Quando quiser criar uma nova meta, é só chamar!`,
            [
                { label: 'Criar Nova Meta', type: 'reply' },
                { label: 'Ver Saldo', type: 'reply' },
                { label: 'Voltar ao Menu', type: 'reply' }
            ]
        );
        return;
    }

    if (msg === 'Ver Progresso') {
        if (!dadosMock.meta) {
            await enviarMensagem(telefone, 'Você não tem metas ativas no momento.');
            return;
        }

        const progresso = calcularProgressoMeta();
        const porcentagem = (progresso.progresso || 0).toFixed(1);

        let barraProgresso = '';
        const blocosCheios = Math.floor(progresso.progresso / 10);
        for (let i = 0; i < 10; i++) {
            barraProgresso += i < blocosCheios ? '█' : '░';
        }

        await enviarMensagemComBotoes(
            telefone,
            `Progresso da Meta\n\n` +
            `${barraProgresso} ${porcentagem}%\n\n` +
            `${progresso.mensagem}`,
            [
                { label: 'Dicas p/ Atingir', type: 'reply' },
                { label: 'Ver Investimentos', type: 'reply' },
                { label: 'Voltar ao Menu', type: 'reply' }
            ]
        );
        return;
    }

    await enviarMensagemComBotoes(
        telefone,
        `Desculpe, não entendi.\n\nEscolha uma das opções abaixo:`,
        [
            { label: 'Menu Principal', type: 'reply' },
            { label: 'Como Funciona', type: 'reply' },
            { label: 'Receber Dicas', type: 'reply' }
        ]
    );
}

app.post('/webhook/zapster', async (req, res) => {
    try {
        console.log('Webhook Payload Recebido:', JSON.stringify(req.body, null, 2));

        const telefone = req.body.data?.sender?.id;
        const message = req.body.data?.content?.text;

        if (!telefone || typeof message === 'undefined') {
            console.log('⚠️ Webhook recebido, mas sem "telefone" ou "message" nos campos esperados. Ignorando.');
            return res.status(200).json({ success: true, status: 'ignored, missing data' });
        }

        console.log(`📱 Mensagem recebida de ${telefone}: ${message}`);

        if (!conversasAtivas[telefone]) {
            console.log(`Novo usuário: ${telefone}`);
            conversasAtivas[telefone] = { dataInicio: new Date() };
            await enviarMensagemComBotoes(
                telefone,
                `Olá!\n\n` +
                `Sou o assistente virtual do BTG. Como posso ajudar hoje?`,
                [
                    { label: 'Ver Saldo', type: 'reply' },
                    { label: 'Meus Gastos', type: 'reply' },
                    { label: 'Minhas Metas', type: 'reply' }
                ]
            );
        } else {
            await processarComando(telefone, message);
        }

        res.status(200).json({ success: true, status: 'ok' });

    } catch (error) {
        console.error('❌ Erro no webhook:', error.response?.data || error.message || error);
        res.status(500).json({ error: 'Erro ao processar mensagem' });
    }
});
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        bot: 'Assistente Virtual BTG',
        versao: 'Protótipo',
        descricao: 'Bot para auxiliar no gerenciamento financeiro',
        endpoints: {
            webhook: '/webhook/zapster',
            status: '/',
            dados: '/dados-mock'
        }
    });
});

app.get('/dados-mock', (req, res) => {
    res.json({
        usuario: dadosMock,
        analise: analisarHabitos()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});