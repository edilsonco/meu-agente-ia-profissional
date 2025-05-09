// Importações necessárias
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js'; 
import timezone from 'dayjs/plugin/timezone.js'; 
import customParseFormat from 'dayjs/plugin/customParseFormat.js'; 
import relativeTime from 'dayjs/plugin/relativeTime.js'; 
import localizedFormat from 'dayjs/plugin/localizedFormat.js'; 
import 'dayjs/locale/pt-br.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.locale('pt-br');

// --- Configuração ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 
const TIMEZONE_REFERENCIA = 'America/Sao_Paulo';

// --- Inicialização dos Clientes ---
let openai;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
} else {
  console.warn("Chave da API OpenAI não configurada.");
}

let supabase;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn("Credenciais do Supabase não configuradas.");
}

// --- Funções Auxiliares ---
function interpretarDataHoraComDayjs(dataRelativa, horarioTexto) {
  if (!dataRelativa || !horarioTexto) {
    console.error("interpretarDataHora: Data ou Horário em falta para interpretação.", { dataRelativa, horarioTexto });
    return null;
  }
  const agoraEmSaoPaulo = dayjs().tz(TIMEZONE_REFERENCIA);
  let dataBase = agoraEmSaoPaulo;
  const dataNorm = dataRelativa.toLowerCase();

  if (dataNorm === "hoje") { /* OK */ } 
  else if (dataNorm === "amanhã" || dataNorm === "amanha") {
    dataBase = dataBase.add(1, 'day');
  } else {
    let dataParseada = null;
    // Formatos a tentar, incluindo aqueles com 'de' e ano opcional/explícito
    const formatosData = [
        'DD/MM/YYYY', 'DD-MM-YYYY', 'DD/MM/YY', 'DD-MM-YY',
        'D MMMM YYYY', 'D [de] MMMM [de] YYYY', // Com ano explícito
        'D MMMM', 'D [de] MMMM' // Sem ano explícito
    ];

    for (const formato of formatosData) {
      dataParseada = dayjs(dataRelativa, formato, 'pt-br', true); // Modo estrito
      if (dataParseada.isValid()) {
        // Se o formato não especifica o ano (ex: 'D MMMM') e o ano não está na string original
        if ((formato === 'D MMMM' || formato === 'D [de] MMMM') && !dataRelativa.match(/\d{4}/)) { 
            // Se a data parseada (considerando apenas dia/mês) for anterior a hoje, assume próximo ano
            let dataComAnoCorrente = dataParseada.year(agoraEmSaoPaulo.year());
            if (dataComAnoCorrente.isBefore(agoraEmSaoPaulo, 'day')) {
                dataParseada = dataComAnoCorrente.add(1, 'year');
            } else {
                dataParseada = dataComAnoCorrente;
            }
        }
        console.log(`interpretarDataHora: Data parseada com formato '${formato}':`, dataParseada.format());
        break; // Sai do loop se encontrar um formato válido
      }
    }
    if (dataParseada && dataParseada.isValid()) {
      // Aplicar ano, mês e dia da data parseada à data base (que está no fuso SP), mantendo a hora de referência
      dataBase = agoraEmSaoPaulo.year(dataParseada.year()).month(dataParseada.month()).date(dataParseada.date());
    } else {
      console.error("interpretarDataHora: Formato de data não reconhecido:", dataRelativa);
      return null;
    }
  }

  let horas = 0, minutos = 0;
  const matchHorario = horarioTexto.match(/(\d{1,2})(?:h|:)?(\d{0,2})?/i);
  if (matchHorario) {
    horas = parseInt(matchHorario[1], 10);
    minutos = matchHorario[2] ? parseInt(matchHorario[2], 10) : 0;
    if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
        console.error("interpretarDataHora: Horas/minutos inválidos", {horas, minutos});
        return null;
    }
  } else { 
    console.error("interpretarDataHora: Formato de horário não reconhecido", horarioTexto);
    return null; 
  }

  const dataHoraFinalEmSaoPaulo = dataBase.hour(horas).minute(minutos).second(0).millisecond(0);
  if (!dataHoraFinalEmSaoPaulo.isValid()) {
      console.error("interpretarDataHora: Data/Hora final inválida em SP", dataHoraFinalEmSaoPaulo);
      return null;
  }
  console.log("interpretarDataHora: Data/Hora final em São Paulo:", dataHoraFinalEmSaoPaulo.format());
  return dataHoraFinalEmSaoPaulo.utc();
}

async function gerarRespostaConversacional(contextoParaIA) {
  if (!openai) return "Desculpe, estou com problemas para gerar uma resposta neste momento (IA não configurada).";
  
  console.log("Backend: Gerando resposta conversacional com contexto:", contextoParaIA);
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Você é um assistente de agendamento virtual chamado "Agente IA", extremamente simpático, prestável e profissional. Responda sempre em português do Brasil. Seja claro e confirme as ações realizadas. Se houver um erro ou algo não for possível, explique de forma educada. Se precisar de mais informações para completar uma ação, peça-as de forma natural e específica. Nunca mencione IDs numéricos de reuniões diretamente para o utilizador nas suas respostas de confirmação ou listagem, a menos que seja explicitamente pedido para depuração ou se precisar de desambiguar entre múltiplas reuniões idênticas (neste caso, pode apresentar os detalhes completos, incluindo data e hora, para o utilizador escolher).`
        },
        { role: "user", content: contextoParaIA }
      ],
      temperature: 0.7, 
    });
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error("Backend: Erro ao gerar resposta conversacional com OpenAI:", error);
    return "Peço desculpa, ocorreu um erro ao tentar processar a sua resposta.";
  }
}

// --- Função Principal da Serverless Function ---
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ mensagem: `Método ${req.method} não permitido.` });
  }
  const { comando } = req.body;
  if (!comando) return res.status(400).json({ mensagem: "Nenhum comando fornecido." });

  console.log("Backend: Comando recebido:", comando);
  if (!openai || !supabase) return res.status(500).json({ mensagem: "Erro de configuração interna do servidor." });

  let mensagemParaFrontend = "";

  try {
    // ETAPA 1: Interpretação inicial do comando pela OpenAI
    const promptExtracao = `
      Comando do utilizador: "${comando}"
      Data/hora atual (UTC): ${new Date().toISOString()}
      Fuso horário de referência do utilizador: America/Sao_Paulo

      Analise o comando e extraia as seguintes informações em formato JSON:
      - intencao: ("marcar_reuniao", "listar_reunioes", "cancelar_reuniao", "alterar_reuniao", "pedido_incompleto", "desconhecida"). Se a intenção for clara (ex: marcar) mas faltar informação crucial (ex: data ou hora), classifique como a intenção principal (ex: "marcar_reuniao") e preencha 'mensagem_clarificacao_necessaria'.
      - id_reuniao: ID NUMÉRICO da reunião se explicitamente mencionado pelo utilizador (inteiro ou null).
      
      // Para marcar uma NOVA reunião:
      - pessoa_nova_reuniao: Nome da pessoa para a nova reunião (string ou null).
      - data_nova_reuniao: Data para a nova reunião (string ou null, ex: "hoje", "15/05/2025").
      - horario_novo_reuniao: Horário para a nova reunião (string ou null, ex: "15 horas", "10h30").

      // Para identificar uma reunião ALVO (para cancelar ou alterar SEM ID):
      // Preencha estes campos se a intenção for cancelar ou alterar E o id_reuniao for null.
      - pessoa_alvo: Nome da pessoa da reunião que o utilizador quer cancelar ou alterar (string ou null).
      - data_alvo: Data da reunião que o utilizador quer cancelar ou alterar (string ou null).
      - horario_alvo: Horário da reunião que o utilizador quer cancelar ou alterar (string ou null).

      // Para os NOVOS dados de uma alteração (se a intenção for 'alterar_reuniao'):
      // Preencha estes campos com os NOVOS detalhes que o utilizador mencionou para a alteração.
      - pessoa_alteracao: NOVO nome da pessoa para a reunião (string ou null, se mencionado).
      - data_alteracao: NOVA data para a reunião (string ou null, se mencionado).
      - horario_alteracao: NOVO horário para a reunião (string ou null, se mencionado).
      
      - mensagem_clarificacao_necessaria: Se a intenção for clara mas faltar informação essencial para prosseguir (ex: para marcar, falta data ou hora; para cancelar por descrição, falta pessoa_alvo, data_alvo ou horario_alvo; para alterar, falta o que alterar ou os novos dados), descreva EXATAMENTE o que falta para essa intenção. (string ou null). Se todas as informações para a intenção principal estiverem presentes, este campo deve ser null.
      
      Priorize o preenchimento de 'id_reuniao' se um número for claramente um ID.
      Se a intenção for 'marcar_reuniao', foque em 'pessoa_nova_reuniao', 'data_nova_reuniao', e 'horario_novo_reuniao'.
      Se a intenção for 'cancelar_reuniao' e 'id_reuniao' for null, foque em 'pessoa_alvo', 'data_alvo', e 'horario_alvo'.
      Se a intenção for 'alterar_reuniao', foque em identificar a reunião alvo (via 'id_reuniao' ou 'pessoa_alvo', 'data_alvo', 'horario_alvo') E os novos dados ('pessoa_alteracao', 'data_alteracao', 'horario_alteracao').
      Responda APENAS com o objeto JSON.
    `;
    console.log("Backend: Enviando para OpenAI para extração...");
    const extracaoOpenAI = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125", 
      messages: [{ role: "user", content: promptExtracao }],
      response_format: { type: "json_object" },
    });

    let dadosComando;
    try {
      // Adicionado log para ver o JSON bruto da OpenAI
      console.log("Backend: Resposta JSON BRUTA da OpenAI:", extracaoOpenAI.choices[0].message.content);
      dadosComando = JSON.parse(extracaoOpenAI.choices[0].message.content);
    } catch (e) {
      console.error("Backend: Erro parse JSON da extração OpenAI:", e, extracaoOpenAI.choices[0].message.content);
      mensagemParaFrontend = await gerarRespostaConversacional("Peço desculpa, tive um problema ao entender o seu pedido inicial. Poderia tentar de novo?");
      return res.status(500).json({ mensagem: mensagemParaFrontend });
    }
    console.log("Backend: Dados extraídos pela OpenAI:", dadosComando);

    // ETAPA 2: Lógica de Negócio e Supabase
    if (dadosComando.mensagem_clarificacao_necessaria) {
      console.log("Backend: Clarificação necessária:", dadosComando.mensagem_clarificacao_necessaria);
      let contextoClarificacao = `O utilizador disse: "${comando}". Parece que preciso de mais informações: ${dadosComando.mensagem_clarificacao_necessaria}. Por favor, formule uma pergunta amigável e específica ao utilizador para obter estes detalhes.`;
      if (dadosComando.intencao === "marcar_reuniao") {
           contextoClarificacao = `O utilizador quer marcar uma reunião e disse: "${comando}". Para continuar, preciso saber: ${dadosComando.mensagem_clarificacao_necessaria}. Peça essa informação.`;
      } else if (dadosComando.intencao === "cancelar_reuniao" && !dadosComando.id_reuniao) {
           contextoClarificacao = `O utilizador quer cancelar uma reunião e disse: "${comando}". Para encontrar a reunião correta, preciso saber: ${dadosComando.mensagem_clarificacao_necessaria}. Peça essa informação.`;
      } else if (dadosComando.intencao === "alterar_reuniao") {
           // Se for alterar e faltar o ID e também os detalhes da reunião alvo
           if (!dadosComando.id_reuniao && !(dadosComando.pessoa_alvo && dadosComando.data_alvo && dadosComando.horario_alvo)) {
                contextoClarificacao = `O utilizador quer alterar uma reunião e disse: "${comando}". Para identificar a reunião a ser alterada, preciso do ID dela ou dos detalhes completos (pessoa, data e hora) da reunião original. Além disso, preciso saber: ${dadosComando.mensagem_clarificacao_necessaria}. Peça todas as informações em falta.`;
           } else { // Se identificou a reunião alvo mas faltam os novos dados
                contextoClarificacao = `O utilizador quer alterar uma reunião e disse: "${comando}". Para prosseguir, preciso saber: ${dadosComando.mensagem_clarificacao_necessaria}. Peça essa informação.`;
           }
      }
      mensagemParaFrontend = await gerarRespostaConversacional(contextoClarificacao);
    } else { 
      switch (dadosComando.intencao) {
        case "marcar_reuniao":
          if (dadosComando.pessoa_nova_reuniao && dadosComando.data_nova_reuniao && dadosComando.horario_novo_reuniao) {
            const dataHoraUTC = interpretarDataHoraComDayjs(dadosComando.data_nova_reuniao, dadosComando.horario_novo_reuniao);
            if (!dataHoraUTC) {
              mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para marcar com ${dadosComando.pessoa_nova_reuniao} para "${dadosComando.data_nova_reuniao}" às "${dadosComando.horario_novo_reuniao}", mas não consegui interpretar a data/hora. Peça para tentar um formato diferente.`);
            } else if (dataHoraUTC.isBefore(dayjs.utc().subtract(2, 'minute'))) { 
              const dataHoraInvalidaFormatada = dataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
              mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para marcar uma reunião para ${dataHoraInvalidaFormatada}, que está no passado. Informe que não é possível e peça uma nova data/hora.`);
            } else {
              const dataHoraSupabase = dataHoraUTC.toISOString();
              const { data: conflitos, error: erroConflito } = await supabase
                .from('reunioes')
                .select('id, pessoa, data_hora')
                .eq('data_hora', dataHoraSupabase);

              if (erroConflito) throw erroConflito;

              if (conflitos && conflitos.length > 0) {
                const conflito = conflitos[0];
                const dataHoraConflitoFormatada = dayjs(conflito.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
                mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador quer marcar com ${dadosComando.pessoa_nova_reuniao} para ${dataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')}, mas já existe uma reunião com ${conflito.pessoa} nesse horário (${dataHoraConflitoFormatada}). Informe sobre o conflito e pergunte se quer tentar outro horário.`);
              } else {
                const { data, error } = await supabase.from('reunioes').insert([{ pessoa: dadosComando.pessoa_nova_reuniao, data_hora: dataHoraSupabase, descricao_comando: comando }]).select();
                if (error) throw error;
                const dataHoraConfirmacao = dataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
                mensagemParaFrontend = await gerarRespostaConversacional(`A reunião com ${dadosComando.pessoa_nova_reuniao} para ${dataHoraConfirmacao} foi marcada com sucesso! Confirme para o utilizador de forma amigável e pergunte se pode ajudar em algo mais.`);
              }
            }
          } else { 
            mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para marcar uma reunião, mas faltam detalhes essenciais (pessoa, data ou hora). Peça as informações em falta. Comando original: "${comando}"`);
          }
          break;

        case "listar_reunioes":
          const { data: reunioes, error: erroListagem } = await supabase.from('reunioes').select('id, pessoa, data_hora').order('data_hora', { ascending: true });
          if (erroListagem) throw erroListagem;
          if (reunioes && reunioes.length > 0) {
            let listaFormatadaParaIA = reunioes.map(r => `Com ${r.pessoa} em ${dayjs(r.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')}`).join("\n");
            mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para listar as reuniões. Aqui estão elas:\n${listaFormatadaParaIA}\nApresente esta lista de forma clara e amigável.`);
          } else {
            mensagemParaFrontend = await gerarRespostaConversacional("O utilizador pediu para listar as reuniões, mas não há nenhuma agendada. Informe-o.");
          }
          break;

        case "cancelar_reuniao":
          console.log("Backend: Intenção de cancelar reunião detectada.");
          let idParaCancelar = dadosComando.id_reuniao;
          let reuniaoCanceladaInfo = "";

          if (idParaCancelar && Number.isInteger(idParaCancelar) && idParaCancelar > 0) {
            const { data: reuniaoParaCancelar, error: erroBusca } = await supabase
              .from('reunioes')
              .select('pessoa, data_hora')
              .eq('id', idParaCancelar)
              .single();
            if (erroBusca || !reuniaoParaCancelar) {
                mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para cancelar a reunião com ID ${idParaCancelar}, mas não a encontrei. Peça para verificar o ID ou descrever a reunião.`);
                break;
            }
            const { error: erroDelete } = await supabase.from('reunioes').delete().match({ id: idParaCancelar });
            if (erroDelete) throw erroDelete;
            reuniaoCanceladaInfo = `a reunião com ${reuniaoParaCancelar.pessoa} de ${dayjs(reuniaoParaCancelar.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')}`;
            mensagemParaFrontend = await gerarRespostaConversacional(`Confirme ao utilizador que ${reuniaoCanceladaInfo} (ID ${idParaCancelar}) foi cancelada com sucesso.`);

          } else if (dadosComando.pessoa_alvo && dadosComando.data_alvo && dadosComando.horario_alvo) {
            console.log("Backend: Tentando cancelar por descrição:", dadosComando.pessoa_alvo, dadosComando.data_alvo, dadosComando.horario_alvo);
            const dataHoraAlvoUTC = interpretarDataHoraComDayjs(dadosComando.data_alvo, dadosComando.horario_alvo);
            if (!dataHoraAlvoUTC) {
              mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para cancelar uma reunião com ${dadosComando.pessoa_alvo} para "${dadosComando.data_alvo}" às "${dadosComando.horario_alvo}", mas não consegui interpretar a data/hora. Peça para tentar um formato diferente ou fornecer o ID.`);
              break;
            }
            const dataHoraAlvoSupabase = dataHoraAlvoUTC.toISOString();
            const { data: reunioesEncontradas, error: erroBuscaDesc } = await supabase
              .from('reunioes')
              .select('id, pessoa, data_hora')
              .eq('pessoa', dadosComando.pessoa_alvo)
              .eq('data_hora', dataHoraAlvoSupabase);
            
            if (erroBuscaDesc) throw erroBuscaDesc;

            if (reunioesEncontradas && reunioesEncontradas.length === 1) {
              const reuniaoParaCancelar = reunioesEncontradas[0];
              idParaCancelar = reuniaoParaCancelar.id;
              const { error: erroDeleteDesc } = await supabase.from('reunioes').delete().match({ id: idParaCancelar });
              if (erroDeleteDesc) throw erroDeleteDesc;
              reuniaoCanceladaInfo = `a reunião com ${reuniaoParaCancelar.pessoa} de ${dayjs(reuniaoParaCancelar.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')}`;
              mensagemParaFrontend = await gerarRespostaConversacional(`Confirme ao utilizador que ${reuniaoCanceladaInfo} foi cancelada com sucesso.`);
            } else if (reunioesEncontradas && reunioesEncontradas.length > 1) {
              let listaAmbigua = reunioesEncontradas.map(r => `Com ${r.pessoa} em ${dayjs(r.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')} (ID: ${r.id})`).join("\n");
              mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para cancelar uma reunião com ${dadosComando.pessoa_alvo} para ${dadosComando.data_alvo} às ${dadosComando.horario_alvo}, mas encontrei várias reuniões. São elas:\n${listaAmbigua}\nPeça ao utilizador para especificar qual delas gostaria de cancelar, talvez usando o ID.`);
            } else {
              mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para cancelar uma reunião com ${dadosComando.pessoa_alvo} para ${dadosComando.data_alvo} às ${dadosComando.horario_alvo}, mas não encontrei nenhuma reunião com esses detalhes. Peça para verificar ou fornecer o ID.`);
            }
          } else { 
            mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para cancelar uma reunião, mas não forneceu um ID nem detalhes suficientes (pessoa, data e hora da reunião a cancelar). Peça as informações necessárias. Comando: "${comando}"`);
          }
          break;
        
        case "alterar_reuniao":
            let idParaAlterarOriginal = dadosComando.id_reuniao;
            const pessoaAlvoOriginal = dadosComando.pessoa_alvo;
            const dataAlvoOriginal = dadosComando.data_alvo;
            const horarioAlvoOriginal = dadosComando.horario_alvo;
            
            const novosDados = {
                pessoa: dadosComando.pessoa_alteracao,
                data_relativa: dadosComando.data_alteracao,
                horario_texto: dadosComando.horario_alteracao
            };

            if (!idParaAlterarOriginal && !(pessoaAlvoOriginal && dataAlvoOriginal && horarioAlvoOriginal)) {
                mensagemParaFrontend = await gerarRespostaConversacional(`Para alterar uma reunião, preciso do ID dela ou dos detalhes completos (pessoa, data e hora) da reunião que quer alterar. Comando: "${comando}"`);
                break;
            }
            
            if (!novosDados.pessoa && !novosDados.data_relativa && !novosDados.horario_texto) {
                mensagemParaFrontend = await gerarRespostaConversacional(`O que gostaria de alterar na reunião? Preciso dos novos detalhes (nova pessoa, nova data ou novo horário). Comando: "${comando}"`);
                break;
            }

            if (!idParaAlterarOriginal) {
                console.log("Backend: Tentando encontrar reunião para alterar por descrição:", pessoaAlvoOriginal, dataAlvoOriginal, horarioAlvoOriginal);
                const dataHoraAlvoParaAlterarUTC = interpretarDataHoraComDayjs(dataAlvoOriginal, horarioAlvoOriginal);
                if (!dataHoraAlvoParaAlterarUTC) {
                    mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui interpretar a data/hora da reunião que quer alterar ("${dataAlvoOriginal}" às "${horarioAlvoOriginal}").`);
                    break;
                }
                const { data: reunioesParaAlterar, error: erroBuscaAlterar } = await supabase
                    .from('reunioes')
                    .select('id')
                    .eq('pessoa', pessoaAlvoOriginal)
                    .eq('data_hora', dataHoraAlvoParaAlterarUTC.toISOString());
                
                if (erroBuscaAlterar) throw erroBuscaAlterar;

                if (reunioesParaAlterar && reunioesParaAlterar.length === 1) {
                    idParaAlterarOriginal = reunioesParaAlterar[0].id; 
                    console.log("Backend: ID da reunião para alterar encontrado por descrição:", idParaAlterarOriginal);
                } else if (reunioesParaAlterar && reunioesParaAlterar.length > 1) {
                    let listaAmbiguaAlterar = reunioesParaAlterar.map(r => `Com ${pessoaAlvoOriginal} em ${dayjs(dataHoraAlvoParaAlterarUTC).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')} (ID: ${r.id})`).join("\n");
                    mensagemParaFrontend = await gerarRespostaConversacional(`Encontrei várias reuniões para ${pessoaAlvoOriginal} em ${dataAlvoOriginal} às ${horarioAlvoOriginal}. São elas:\n${listaAmbiguaAlterar}\nPreciso que especifique o ID da reunião que quer alterar.`);
                    break;
                } else {
                    mensagemParaFrontend = await gerarRespostaConversacional(`Não encontrei a reunião com ${pessoaAlvoOriginal} em ${dataAlvoOriginal} às ${horarioAlvoOriginal} para alterar.`);
                    break;
                }
            }
            
            let novaDataHoraUTC = null;
            if (novosDados.data_relativa && novosDados.horario_texto) {
                novaDataHoraUTC = interpretarDataHoraComDayjs(novosDados.data_relativa, novosDados.horario_texto);
                if (!novaDataHoraUTC) {
                    mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui interpretar a nova data "${novosDados.data_relativa}" ou o novo horário "${novosDados.horario_texto}" para a alteração.`);
                    break;
                }
                if (novaDataHoraUTC.isBefore(dayjs.utc().subtract(2, 'minute'))) {
                     const dataHoraInvalidaFormatada = novaDataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
                     mensagemParaFrontend = await gerarRespostaConversacional(`Não é possível alterar a reunião ID ${idParaAlterarOriginal} para ${dataHoraInvalidaFormatada}, que está no passado.`);
                     break;
                }
            } else if (novosDados.data_relativa || novosDados.horario_texto) { 
                 mensagemParaFrontend = await gerarRespostaConversacional(`Para alterar a data/hora da reunião ID ${idParaAlterarOriginal}, preciso da nova data E do novo horário. Você forneceu: Data="${novosDados.data_relativa}", Hora="${novosDados.horario_texto}". Peça a informação em falta.`);
                 break;
            }
            
            const dadosUpdate = {};
            if (novaDataHoraUTC) dadosUpdate.data_hora = novaDataHoraUTC.toISOString();
            if (novosDados.pessoa) dadosUpdate.pessoa = novosDados.pessoa;

            const { data: reuniaoAtual, error: erroBuscaAtual } = await supabase
                .from('reunioes')
                .select('pessoa, data_hora')
                .eq('id', idParaAlterarOriginal)
                .single();

            if (erroBuscaAtual || !reuniaoAtual) {
                mensagemParaFrontend = await gerarRespostaConversacional(`Não encontrei a reunião com ID ${idParaAlterarOriginal} para obter os detalhes antes de alterar.`);
                break;
            }

            const { data: updateData, error: erroUpdate } = await supabase.from('reunioes').update(dadosUpdate).match({ id: idParaAlterarOriginal }).select().single();
            
            if (erroUpdate || !updateData) {
                 console.error("Backend: Erro ao alterar ou reunião não encontrada:", erroUpdate);
                 mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui alterar a reunião com ID ${idParaAlterarOriginal}. Verifique se o ID está correto ou se a reunião existe.`);
                 break;
            }
            
            const pessoaAntiga = reuniaoAtual.pessoa;
            const dataHoraAntigaFormatada = dayjs(reuniaoAtual.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
            
            const pessoaNovaConfirmacao = updateData.pessoa;
            const dataHoraNovaConfirmacao = dayjs(updateData.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');

            mensagemParaFrontend = await gerarRespostaConversacional(`A reunião com ${pessoaAntiga} de ${dataHoraAntigaFormatada} (ID ${idParaAlterarOriginal}) foi alterada com sucesso para: Com ${pessoaNovaConfirmacao} em ${dataHoraNovaConfirmacao}. Confirme para o utilizador de forma clara.`);
            break;

        default: 
          mensagemParaFrontend = await gerarRespostaConversacional(`Não entendi o pedido: "${comando}". Peça ao utilizador para tentar de outra forma ou ser mais específico.`);
          break;
      }
    }
    return res.status(200).json({ mensagem: mensagemParaFrontend });

  } catch (error) {
    console.error("Backend: Erro geral no processamento do comando:", error);
    let mensagemErro = "Peço desculpa, ocorreu um erro inesperado ao processar o seu pedido.";
    if (error.response?.data?.error?.message) { 
        mensagemErro = `Erro da IA: ${error.response.data.error.message}`;
    } else if (error.message) {
        mensagemErro = error.message;
    }
    const respostaErroIA = await gerarRespostaConversacional(`Ocorreu um erro interno ao processar o pedido do utilizador ("${comando}"). O erro foi: "${mensagemErro}". Por favor, informe o utilizador de forma amigável que houve um problema e que ele pode tentar novamente mais tarde ou reformular o pedido.`);
    return res.status(500).json({ mensagem: respostaErroIA });
  }
}
