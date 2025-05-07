// Importações necessárias (terá de as instalar no seu projeto Node.js)
// Exemplo: npm install openai @supabase/supabase-js node-fetch
// Para a OpenAI v4 (mais recente):
import OpenAI from 'openai';
// Para o Supabase:
import { createClient } from '@supabase/supabase-js';
// Para fazer chamadas HTTP, se a biblioteca da OpenAI não for suficiente ou para outras APIs
// import fetch from 'node-fetch'; // Se usar Node.js < 18, ou pode usar o fetch nativo do Node.js >= 18

// --- Configuração das Chaves de API (obtidas das Variáveis de Ambiente na Vercel) ---
// NUNCA coloque as suas chaves diretamente no código!
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // Ou a SERVICE_ROLE_KEY se precisar de mais privilégios no backend

// --- Inicialização dos Clientes das APIs ---
let openai;
if (OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });
} else {
  console.warn("Chave da API OpenAI não configurada. A funcionalidade de IA estará desativada.");
}

let supabase;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn("Credenciais do Supabase não configuradas. A funcionalidade de base de dados estará desativada.");
}

// --- Função Principal da Serverless Function (Handler da Vercel) ---
// Esta função será executada quando o frontend fizer um pedido para /api/processar-comando
export default async function handler(req, res) {
  // Permitir apenas pedidos POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ mensagem: `Método ${req.method} não permitido.` });
  }

  // Obter o comando do corpo do pedido enviado pelo frontend
  const { comando } = req.body;

  if (!comando) {
    return res.status(400).json({ mensagem: "Nenhum comando fornecido." });
  }

  console.log("Backend: Comando recebido:", comando);

  // Verificar se os clientes das APIs foram inicializados
  if (!openai) {
    return res.status(500).json({ mensagem: "Erro de configuração: API da OpenAI não inicializada no servidor." });
  }
  if (!supabase) {
    return res.status(500).json({ mensagem: "Erro de configuração: Supabase não inicializado no servidor." });
  }

  try {
    // --- ETAPA 1: Chamar a API da OpenAI para interpretar o comando ---
    console.log("Backend: A chamar a API da OpenAI...");
    
    // Exemplo de prompt (PRECISA DE SER MELHORADO E TESTADO EXTENSIVAMENTE)
    const promptParaOpenAI = `
      Analise o seguinte comando de um utilizador para um assistente de agendamento:
      "${comando}"

      Extraia as seguintes informações em formato JSON:
      - intencao: Qual a intenção principal? (ex: "marcar_reuniao", "listar_reunioes", "cancelar_reuniao", "alterar_reuniao", "desconhecida")
      - pessoa: Nome da pessoa para a reunião (string ou null).
      - data_relativa: Data como mencionada pelo utilizador (ex: "hoje", "amanhã", "15 de maio", "20/10/2025", null).
      - horario_texto: Horário como mencionado (ex: "15 horas", "10h30", "meio-dia", null).
      - id_reuniao: Se a intenção for cancelar ou alterar, qual o ID da reunião mencionado (inteiro ou null)?
      - detalhes_adicionais: Qualquer outra informação relevante (string ou null).
      
      Se uma informação não for claramente mencionada, use null.
      Responda APENAS com o objeto JSON.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Ou outro modelo que prefira, como "gpt-4"
      messages: [{ role: "user", content: promptParaOpenAI }],
      response_format: { type: "json_object" }, // Solicita resposta em formato JSON (para modelos compatíveis)
    });

    let interpretacaoComando;
    if (completion.choices[0].message.content) {
        try {
            interpretacaoComando = JSON.parse(completion.choices[0].message.content);
        } catch (e) {
            console.error("Backend: Erro ao fazer parse da resposta JSON da OpenAI:", e);
            console.error("Backend: Resposta bruta da OpenAI:", completion.choices[0].message.content);
            return res.status(500).json({ mensagem: "Erro ao interpretar a resposta da IA." });
        }
    } else {
        console.error("Backend: Resposta da OpenAI não contém conteúdo.");
        return res.status(500).json({ mensagem: "A IA não forneceu uma resposta válida." });
    }
    
    console.log("Backend: Interpretação da OpenAI:", interpretacaoComando);

    // --- ETAPA 2: Processar a intenção e interagir com o Supabase ---
    let mensagemParaFrontend = "Comando processado."; // Mensagem padrão

    switch (interpretacaoComando.intencao) {
      case "marcar_reuniao":
        if (interpretacaoComando.pessoa && interpretacaoComando.data_relativa && interpretacaoComando.horario_texto) {
          // Lógica para converter data_relativa e horario_texto para um timestamp
          // Exemplo muito simplificado (PRECISA DE UMA BIBLIOTECA DE DATAS ROBUSTA como date-fns ou moment.js, ou mais lógica no prompt da OpenAI)
          // Esta parte é crucial e complexa. O ideal é que a OpenAI já devolva AAAA-MM-DD e HH:MM.
          // Se não, terá de implementar a conversão aqui.
          
          // Exemplo: Supondo que a OpenAI devolveu data e hora prontas ou que você as converteu para 'AAAA-MM-DD HH:MM:SS'
          // const dataHoraAgendamento = converterParaTimestamp(interpretacaoComando.data_relativa, interpretacaoComando.horario_texto);
          
          // Aqui, vamos assumir que a OpenAI foi instruída a devolver data e hora num formato que o Supabase entende para timestamp
          // ou que você fará essa conversão.
          // Por agora, vamos simular que temos uma data e hora.
          // PRECISA DE IMPLEMENTAR A CONVERSÃO REAL DE interpretacaoComando.data_relativa e interpretacaoComando.horario_texto
          // para um formato de data/hora válido para o Supabase (ex: 'YYYY-MM-DDTHH:mm:ssZ').
          // Exemplo de placeholder:
          const dataHoraSupabase = new Date().toISOString(); // ISTO É APENAS UM PLACEHOLDER!

          console.log("Backend: A tentar inserir no Supabase:", { 
            pessoa: interpretacaoComando.pessoa, 
            data_hora: dataHoraSupabase, // Usar a data/hora convertida
            descricao_comando: comando 
          });

          const { data, error } = await supabase
            .from('reunioes') // Nome da sua tabela no Supabase
            .insert([
              { 
                pessoa: interpretacaoComando.pessoa, 
                data_hora: dataHoraSupabase, // Usar a data/hora convertida
                descricao_comando: comando 
              },
            ])
            .select(); // Opcional: para retornar os dados inseridos

          if (error) {
            console.error("Backend: Erro ao inserir no Supabase:", error);
            mensagemParaFrontend = `Erro ao marcar reunião na base de dados: ${error.message}`;
          } else {
            console.log("Backend: Reunião inserida no Supabase:", data);
            mensagemParaFrontend = `Reunião com ${interpretacaoComando.pessoa} marcada para ${interpretacaoComando.data_relativa} às ${interpretacaoComando.horario_texto}. (Detalhes: ${JSON.stringify(data)})`;
          }
        } else {
          mensagemParaFrontend = "Não consegui obter todos os detalhes (pessoa, data, hora) para marcar a reunião.";
        }
        break;

      case "listar_reunioes":
        console.log("Backend: A listar reuniões do Supabase...");
        const { data: reunioes, error: erroListagem } = await supabase
          .from('reunioes')
          .select('pessoa, data_hora, descricao_comando')
          .order('data_hora', { ascending: true });

        if (erroListagem) {
          console.error("Backend: Erro ao listar reuniões do Supabase:", erroListagem);
          mensagemParaFrontend = `Erro ao buscar reuniões: ${erroListagem.message}`;
        } else if (reunioes && reunioes.length > 0) {
          mensagemParaFrontend = "Suas reuniões agendadas:\n";
          reunioes.forEach(r => {
            // Formatar a data_hora para ser mais legível
            const dataHoraFormatada = r.data_hora ? new Date(r.data_hora).toLocaleString('pt-BR') : 'Data/Hora inválida';
            mensagemParaFrontend += `- Com ${r.pessoa} em ${dataHoraFormatada} (Comando: "${r.descricao_comando}")\n`;
          });
        } else {
          mensagemParaFrontend = "Você não tem nenhuma reunião agendada.";
        }
        break;
      
      // Adicionar cases para "cancelar_reuniao", "alterar_reuniao" aqui no futuro

      default:
        mensagemParaFrontend = "Não entendi bem o seu pedido. Pode tentar de outra forma?";
        if (interpretacaoComando.intencao === "desconhecida" && interpretacaoComando.detalhes_adicionais) {
            mensagemParaFrontend += ` Detalhe: ${interpretacaoComando.detalhes_adicionais}`;
        }
        break;
    }

    // --- ETAPA 3: Enviar a resposta para o Frontend ---
    console.log("Backend: A enviar resposta para o frontend:", mensagemParaFrontend);
    return res.status(200).json({ mensagem: mensagemParaFrontend });

  } catch (error) {
    console.error("Backend: Erro geral no processamento do comando:", error);
    let mensagemErro = "Ocorreu um erro inesperado no servidor.";
    if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
        // Erro específico da API da OpenAI
        mensagemErro = `Erro da IA: ${error.response.data.error.message}`;
    } else if (error.message) {
        mensagemErro = error.message;
    }
    return res.status(500).json({ mensagem: mensagemErro });
  }
}

// Função auxiliar de exemplo para converter data/hora (PRECISA DE SER MELHORADA)
// O ideal é que a OpenAI já devolva AAAA-MM-DD e HH:MM, ou use uma biblioteca como date-fns.
// function converterParaTimestamp(dataRelativa, horarioTexto) {
//   // Esta função precisaria de uma lógica robusta para converter "hoje", "amanhã", "15 de maio",
//   // e horários como "10h", "14:30" para um formato ISO 8601 ou um objeto Date.
//   // Exemplo muito, muito simples e INCOMPLETO:
//   try {
//     const agora = new Date();
//     let dia = agora.getDate();
//     let mes = agora.getMonth();
//     let ano = agora.getFullYear();

//     if (dataRelativa.toLowerCase() === "amanhã" || dataRelativa.toLowerCase() === "amanha") {
//       const amanha = new Date(agora);
//       amanha.setDate(agora.getDate() + 1);
//       dia = amanha.getDate();
//       mes = amanha.getMonth();
//       ano = amanha.getFullYear();
//     }
//     // Adicionar mais lógica para "15 de maio", "20/10", etc.

//     let horas = 0;
//     let minutos = 0;
//     const matchHorario = horarioTexto.match(/(\d{1,2})(?:h|:)?(\d{0,2})?/i);
//     if (matchHorario) {
//         horas = parseInt(matchHorario[1], 10);
//         minutos = matchHorario[2] ? parseInt(matchHorario[2], 10) : 0;
//     } else {
//         // Tentar converter "meio-dia", "meia-noite" etc.
//     }
//     return new Date(ano, mes, dia, horas, minutos, 0).toISOString();
//   } catch (e) {
//     console.error("Erro ao converter data/hora:", e);
//     return new Date().toISOString(); // Fallback muito básico
//   }
// }

