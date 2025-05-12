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
  let dataAlvo = agoraEmSaoPaulo.startOf('day'); // Inicia com a data atual à meia-noite
  let dataNorm = dataRelativa.toLowerCase().trim();
  
  let horarioProcessado = horarioTexto.toLowerCase().trim();
  horarioProcessado = horarioProcessado.replace(/^(umas\s+|por volta d[ao]s\s+)/, '');

  console.log(`interpretarDataHora: Input: dataRelativa='${dataRelativa}', horarioTexto='${horarioTexto}'`);
  console.log(`interpretarDataHora: Normalizado: dataNorm='${dataNorm}', horarioProcessado='${horarioProcessado}'`);

  // 1. Interpretar Horário Primeiro (meio-dia, meia-noite, HH:MM, HHh)
  let horas = null, minutos = null;
  if (horarioProcessado === "meio-dia") {
    horas = 12; minutos = 0;
  } else if (horarioProcessado === "meia-noite") {
    horas = 0; minutos = 0;
  } else {
    const matchHorario = horarioProcessado.match(/(\d{1,2})(?:h|:)?(\d{0,2})?/i);
    if (matchHorario) {
      horas = parseInt(matchHorario[1], 10);
      minutos = matchHorario[2] ? parseInt(matchHorario[2], 10) : 0;
      if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
        console.error("interpretarDataHora: Horas/minutos inválidos", {horas, minutos});
        return null;
      }
    } else {
      console.error("interpretarDataHora: Formato de horário não reconhecido", horarioProcessado);
      return null;
    }
  }
  console.log(`interpretarDataHora: Horário parseado: ${horas}h${minutos}m`);

  // 2. Interpretar Data
  let ehProximaSemana = false;
  if (dataNorm.startsWith("próxima ")) {
      dataNorm = dataNorm.substring("próxima ".length).trim();
      ehProximaSemana = true;
  }
  dataNorm = dataNorm.replace("-feira", "").trim();

  const diasDaSemanaMap = {
    domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6
  };

  if (dataNorm === "hoje") { 
    dataAlvo = agoraEmSaoPaulo.startOf('day'); 
  } else if (dataNorm === "amanhã" || dataNorm === "amanha") {
    dataAlvo = agoraEmSaoPaulo.add(1, 'day').startOf('day');
  } else if (diasDaSemanaMap[dataNorm] !== undefined) {
    const diaAlvoNum = diasDaSemanaMap[dataNorm];
    const hojeNum = agoraEmSaoPaulo.day();

    let diff = (diaAlvoNum - hojeNum + 7) % 7;
    if (diff === 0) { // Mesmo dia da semana
        diff = ehProximaSemana ? 7 : 0; 
    } else if (ehProximaSemana) { // Se pediu "próxima" e é um dia diferente
        // A lógica (diaAlvoNum - hojeNum + 7) % 7 já dá a próxima ocorrência.
        // Se é "próxima" e o diff já é > 0 (ou seja, já está na próxima semana ou mais tarde na semana atual),
        // precisamos garantir que é realmente na *próxima* semana calendário se o dia já passou ou é hoje.
        // Se diff > 0 e o diaAlvoNum > hojeNum (ex: hoje Seg, pede próxima Qua), diff = 2. Adicionar 7.
        // Se diff > 0 e o diaAlvoNum < hojeNum (ex: hoje Qua, pede próxima Seg), diff = 5 (já é da próxima semana).
        if (diaAlvoNum > hojeNum) { // Dia alvo é mais tarde na semana atual
            diff += 7;
        }
        // Se diaAlvoNum <= hojeNum, o diff já calcula para a próxima semana.
    }
    dataAlvo = agoraEmSaoPaulo.add(diff, 'day').startOf('day');
    console.log(`interpretarDataHora: Dia da semana '${dataRelativa}' (ehProxima: ${ehProximaSemana}, hojeNum: ${hojeNum}, diaAlvoNum: ${diaAlvoNum}, diff: ${diff}) interpretado como:`, dataAlvo.format('YYYY-MM-DD'));
  } else { // Datas explícitas
    let dataParseada = null;
    const mesesPt = {
        janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
        julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
    };
    const matchMesExtenso = dataNorm.match(/(\d{1,2})\s+(?:de\s+)?([a-zA-Zçã]+)(?:\s+(?:de\s+)?(\d{4}))?/i);

    if (matchMesExtenso) {
        const dia = parseInt(matchMesExtenso[1],10);
        const nomeMes = matchMesExtenso[2].toLowerCase();
        const mes = mesesPt[nomeMes];
        let ano = matchMesExtenso[3] ? parseInt(matchMesExtenso[3],10) : agoraEmSaoPaulo.year();
        if (dia && mes) {
            dataParseada = dayjs.tz(`${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`, 'YYYY-MM-DD', TIMEZONE_REFERENCIA);
            if (dataParseada.isValid() && !matchMesExtenso[3] && dataParseada.isBefore(agoraEmSaoPaulo.startOf('day'))) {
                dataParseada = dataParseada.year(agoraEmSaoPaulo.year() + 1);
            }
            if(dataParseada.isValid()) console.log(`interpretarDataHora: Data por extenso parseada:`, dataParseada.format('YYYY-MM-DD'));
        }
    }

    if (!dataParseada || !dataParseada.isValid()) { 
        const formatosData = ['DD/MM/YYYY', 'DD-MM-YYYY', 'DD/MM/YY', 'DD-MM-YY'];
        for (const formato of formatosData) {
          dataParseada = dayjs(dataRelativa, formato, 'pt-br', true); 
          if (dataParseada.isValid()) {
            console.log(`interpretarDataHora: Data parseada com formato '${formato}':`, dataParseada.format('YYYY-MM-DD'));
            break; 
          }
        }
    }

    if (dataParseada && dataParseada.isValid()) {
      dataAlvo = dayjs.tz(dataParseada.format('YYYY-MM-DD'), TIMEZONE_REFERENCIA).startOf('day'); 
    } else {
      console.error("interpretarDataHora: Formato de data não reconhecido:", dataRelativa);
      return null;
    }
  }

  const dataHoraFinalEmSaoPaulo = dataAlvo.hour(horas).minute(minutos).second(0).millisecond(0);
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
          content: `Você é um assistente de agendamento virtual chamado "Agente IA", extremamente simpático, prestável e profissional. Responda sempre em português do Brasil. Seja claro e confirme as ações realizadas. Se houver um erro ou algo não for possível, explique de forma educada. Se precisar de mais informações para completar uma ação, peça-as de forma natural e específica (ex: "Para que dia e hora seria?", "Com quem seria o compromisso?"). Não imponha formatos de data/hora ao pedir informações, apenas peça os detalhes em falta. Nunca mencione IDs numéricos de reuniões diretamente para o utilizador nas suas respostas de confirmação ou listagem, a menos que seja explicitamente pedido para depuração ou se precisar de desambiguar entre múltiplas reuniões idênticas (neste caso, pode apresentar os detalhes completos, incluindo tipo, data e hora, para o utilizador escolher).`
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
      - intencao: ("marcar_reuniao", "listar_reunioes", "cancelar_reuniao", "alterar_reuniao", "pedido_incompleto", "desconhecida").
      - id_reuniao: ID NUMÉRICO da reunião se explicitamente mencionado pelo utilizador (inteiro ou null).
      
      // Para marcar uma NOVA reunião:
      - tipo_compromisso_novo: Tipo de compromisso (ex: "almoço", "reunião", "café", "dentista"). Se não especificado, use "compromisso". (string ou null).
      - pessoa_nova_reuniao: Nome da pessoa para a nova reunião (string ou null).
      - data_nova_reuniao: Data para a nova reunião (string ou null, ex: "hoje", "amanhã", "15/05/2025", "próxima segunda-feira", "segunda").
      - horario_novo_reuniao: Horário para a nova reunião (string ou null, ex: "15 horas", "10h30", "meio-dia", "umas 17:30"). Remova palavras como "umas".

      // Para identificar uma reunião ALVO (para cancelar ou alterar SEM ID):
      - tipo_compromisso_alvo: Tipo do compromisso alvo (string ou null).
      - pessoa_alvo: Nome da pessoa da reunião alvo (string ou null).
      - data_alvo: Data da reunião alvo (string ou null).
      - horario_alvo: Horário da reunião alvo (string ou null).

      // Para os NOVOS dados de uma alteração (se a intenção for 'alterar_reuniao'):
      - pessoa_alteracao: NOVO nome da pessoa para a reunião (string ou null, se mencionado).
      - data_alteracao: NOVA data para a reunião (string ou null). Se o utilizador disser "mesma data", "manter data", "na mesma data", "manter a data" ou similar, preencha este campo com a string literal "manter". Se não for mencionada nova data, deixe null.
      - horario_alteracao: NOVO horário para a reunião (string ou null). Se o utilizador disser "mesmo horário", "manter horário", "no mesmo horário", "na mesma data e horário", "manter o horário" ou similar, preencha este campo com a string literal "manter". Se não for mencionado novo horário, deixe null.
      
      - mensagem_clarificacao_necessaria: (string ou null). Preencha este campo APENAS SE:
          - Para 'marcar_reuniao': faltar pessoa_nova_reuniao OU data_nova_reuniao OU horario_novo_reuniao.
          - Para 'cancelar_reuniao' sem id_reuniao: faltar pessoa_alvo OU data_alvo OU horario_alvo.
          - Para 'alterar_reuniao':
              - Se faltar id_reuniao E (faltar pessoa_alvo OU data_alvo OU horario_alvo para identificar a reunião original).
              - OU se, após identificar a reunião alvo, faltar PELO MENOS UM dos novos dados (pessoa_alteracao, tipo_compromisso_alteracao) E (data_alteracao NÃO é "manter" E horario_alteracao NÃO é "manter") E (data_alteracao é null OU horario_alteracao é null).
          Descreva EXATAMENTE o que falta. Caso contrário, deixe null.
      
      Priorize 'id_reuniao' se um número for claramente um ID.
      Se a intenção for 'marcar_reuniao', foque em 'pessoa_nova_reuniao', 'data_nova_reuniao', e 'horario_novo_reuniao'.
      Se a intenção for 'cancelar_reuniao' e 'id_reuniao' for null, foque em 'pessoa_alvo', 'data_alvo', e 'horario_alvo'.
      Se a intenção for 'alterar_reuniao', foque em identificar a reunião alvo (via 'id_reuniao' ou 'pessoa_alvo', 'data_alvo', 'horario_alvo') E os novos dados ('pessoa_alteracao', 'data_alteracao', 'horario_alteracao'). Se para 'data_alteracao' ou 'horario_alteracao' o utilizador indicar para manter o original, preencha o campo correspondente com "manter". Se apenas um novo detalhe for fornecido (ex: só nova pessoa) e o utilizador indicar "na mesma data e horário", data_alteracao e horario_alteracao devem ser "manter".
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
           contextoClarificacao = `O utilizador quer marcar um compromisso e disse: "${comando}". Para continuar, preciso saber: ${dadosComando.mensagem_clarificacao_necessaria}. Peça essa informação de forma natural.`;
      } else if (dadosComando.intencao === "cancelar_reuniao" && !dadosComando.id_reuniao) {
           contextoClarificacao = `O utilizador quer cancelar um compromisso e disse: "${comando}". Para encontrar o compromisso correto, preciso saber: ${dadosComando.mensagem_clarificacao_necessaria}. Peça essa informação.`;
      } else if (dadosComando.intencao === "alterar_reuniao") {
           if (!dadosComando.id_reuniao && !(dadosComando.pessoa_alvo && dadosComando.data_alvo && dadosComando.horario_alvo)) {
                contextoClarificacao = `O utilizador quer alterar um compromisso e disse: "${comando}". Para identificar o compromisso a ser alterado, preciso do ID dele ou dos detalhes completos (pessoa, data e hora) do compromisso original. Além disso, preciso saber: ${dadosComando.mensagem_clarificacao_necessaria}. Peça todas as informações em falta.`;
           } else { 
                contextoClarificacao = `O utilizador quer alterar um compromisso e disse: "${comando}". Para prosseguir, preciso saber: ${dadosComando.mensagem_clarificacao_necessaria}. Peça essa informação.`;
           }
      }
      mensagemParaFrontend = await gerarRespostaConversacional(contextoClarificacao);
    } else { 
      switch (dadosComando.intencao) {
        case "marcar_reuniao":
          if (dadosComando.pessoa_nova_reuniao && dadosComando.data_nova_reuniao && dadosComando.horario_novo_reuniao) {
            const dataHoraUTC = interpretarDataHoraComDayjs(dadosComando.data_nova_reuniao, dadosComando.horario_novo_reuniao);
            const tipoCompromisso = dadosComando.tipo_compromisso_novo || "compromisso"; 

            if (!dataHoraUTC) {
              mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para marcar um(a) ${tipoCompromisso} com ${dadosComando.pessoa_nova_reuniao} para "${dadosComando.data_nova_reuniao}" às "${dadosComando.horario_novo_reuniao}", mas não consegui interpretar a data/hora. Peça para tentar um formato diferente.`);
            } else if (dataHoraUTC.isBefore(dayjs.utc().subtract(2, 'minute'))) { 
              const dataHoraInvalidaFormatada = dataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
              mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para marcar um(a) ${tipoCompromisso} para ${dataHoraInvalidaFormatada}, que está no passado. Informe que não é possível e peça uma nova data/hora.`);
            } else {
              const dataHoraSupabase = dataHoraUTC.toISOString();
              const { data: conflitos, error: erroConflito } = await supabase
                .from('reunioes')
                .select('id, pessoa, data_hora, tipo_compromisso') 
                .eq('data_hora', dataHoraSupabase);

              if (erroConflito) throw erroConflito;

              if (conflitos && conflitos.length > 0) {
                const conflito = conflitos[0];
                const tipoConflito = conflito.tipo_compromisso || "compromisso";
                const dataHoraConflitoFormatada = dayjs(conflito.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
                mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador quer marcar um(a) ${tipoCompromisso} com ${dadosComando.pessoa_nova_reuniao} para ${dataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')}, mas já existe um(a) ${tipoConflito} com ${conflito.pessoa} nesse horário (${dataHoraConflitoFormatada}). Informe sobre o conflito e pergunte se quer tentar outro horário.`);
              } else {
                const { data, error } = await supabase.from('reunioes').insert([{ 
                    pessoa: dadosComando.pessoa_nova_reuniao, 
                    data_hora: dataHoraSupabase, 
                    descricao_comando: comando,
                    tipo_compromisso: tipoCompromisso 
                }]).select();
                if (error) throw error;
                const dataHoraConfirmacao = dataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
                mensagemParaFrontend = await gerarRespostaConversacional(`O seu ${tipoCompromisso} com ${dadosComando.pessoa_nova_reuniao} para ${dataHoraConfirmacao} foi marcado com sucesso! Confirme para o utilizador de forma amigável e pergunte se pode ajudar em algo mais.`);
              }
            }
          } else { 
            mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para marcar um compromisso, mas faltam detalhes essenciais (pessoa, data ou hora). Peça as informações em falta. Comando original: "${comando}"`);
          }
          break;

        case "listar_reunioes":
          const { data: reunioes, error: erroListagem } = await supabase.from('reunioes').select('id, pessoa, data_hora, tipo_compromisso').order('data_hora', { ascending: true });
          if (erroListagem) throw erroListagem;
          if (reunioes && reunioes.length > 0) {
            let listaFormatadaParaIA = reunioes.map(r => {
                const tipo = r.tipo_compromisso || "Compromisso"; 
                return `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} com ${r.pessoa} em ${dayjs(r.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')}`;
            }).join("\n");
            mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para listar os compromissos. Aqui estão eles:\n${listaFormatadaParaIA}\nApresente esta lista de forma clara e amigável.`);
          } else {
            mensagemParaFrontend = await gerarRespostaConversacional("O utilizador pediu para listar os compromissos, mas não há nenhum agendado. Informe-o.");
          }
          break;

        case "cancelar_reuniao":
          console.log("Backend: Intenção de cancelar reunião detectada.");
          let idParaCancelar = dadosComando.id_reuniao;
          
          if (!idParaCancelar && dadosComando.pessoa_alvo && dadosComando.data_alvo && dadosComando.horario_alvo) {
            console.log("Backend: Tentando encontrar para cancelar por descrição:", dadosComando.pessoa_alvo, dadosComando.data_alvo, dadosComando.horario_alvo);
            const dataHoraAlvoUTC = interpretarDataHoraComDayjs(dadosComando.data_alvo, dadosComando.horario_alvo);
            if (dataHoraAlvoUTC) {
              const { data: reunioesEncontradas, error: erroBuscaDesc } = await supabase
                .from('reunioes')
                .select('id, pessoa, data_hora, tipo_compromisso')
                .eq('pessoa', dadosComando.pessoa_alvo)
                .eq('data_hora', dataHoraAlvoUTC.toISOString());
              if (erroBuscaDesc) throw erroBuscaDesc;
              if (reunioesEncontradas && reunioesEncontradas.length === 1) {
                idParaCancelar = reunioesEncontradas[0].id;
              } else if (reunioesEncontradas && reunioesEncontradas.length > 1) {
                 let listaAmbigua = reunioesEncontradas.map(r => `${r.tipo_compromisso || 'Compromisso'} com ${r.pessoa} em ${dayjs(r.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')}`).join("\n");
                 mensagemParaFrontend = await gerarRespostaConversacional(`Encontrei vários compromissos para ${dadosComando.pessoa_alvo} em ${dadosComando.data_alvo} às ${dadosComando.horario_alvo}:\n${listaAmbigua}\nPeça para o utilizador especificar qual deles quer cancelar.`);
                 break; 
              } else { // Nenhuma encontrada por descrição
                mensagemParaFrontend = await gerarRespostaConversacional(`Não encontrei nenhum compromisso com ${dadosComando.pessoa_alvo} para ${dadosComando.data_alvo} às ${dadosComando.horario_alvo}. Gostaria de verificar os detalhes ou listar seus compromissos?`);
                break;
              }
            } else { // Não conseguiu interpretar data/hora da descrição
                 mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui entender a data ou hora ("${dadosComando.data_alvo}" às "${dadosComando.horario_alvo}") do compromisso que quer cancelar. Pode tentar de novo com outros detalhes?`);
                 break;
            }
          }

          if (idParaCancelar && Number.isInteger(idParaCancelar) && idParaCancelar > 0) {
            const { data: reuniaoParaCancelar, error: erroBusca } = await supabase
              .from('reunioes')
              .select('pessoa, data_hora, tipo_compromisso')
              .eq('id', idParaCancelar)
              .single();
            if (erroBusca || !reuniaoParaCancelar) {
                mensagemParaFrontend = await gerarRespostaConversacional(`O utilizador pediu para cancelar o compromisso com ID ${idParaCancelar}, mas não o encontrei. Peça para verificar o ID ou descrever o compromisso.`);
                break;
            }
            const { error: erroDelete } = await supabase.from('reunioes').delete().match({ id: idParaCancelar });
            if (erroDelete) throw erroDelete;
            const tipoCancelado = reuniaoParaCancelar.tipo_compromisso || "compromisso";
            const reuniaoCanceladaInfo = `o ${tipoCancelado} com ${reuniaoParaCancelar.pessoa} de ${dayjs(reuniaoParaCancelar.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')}`;
            mensagemParaFrontend = await gerarRespostaConversacional(`Confirme ao utilizador que ${reuniaoCanceladaInfo} foi cancelado com sucesso.`);
          } else if (!idParaCancelar) { 
             if (!mensagemParaFrontend) { 
                mensagemParaFrontend = await gerarRespostaConversacional(`Não encontrei o compromisso que pediu para cancelar com ${dadosComando.pessoa_alvo} para ${dadosComando.data_alvo} às ${dadosComando.horario_alvo}. Pode verificar os detalhes ou listar seus compromissos?`);
             }
          } else { 
            mensagemParaFrontend = await gerarRespostaConversacional(`O ID fornecido para cancelar o compromisso não é válido. Por favor, tente descrever o compromisso (pessoa, data e hora). Comando: "${comando}"`);
          }
          break;
        
        case "alterar_reuniao":
            let idParaAlterarOriginal = dadosComando.id_reuniao;
            const pessoaAlvoOriginal = dadosComando.pessoa_alvo; 
            const dataAlvoOriginal = dadosComando.data_alvo;
            const horarioAlvoOriginal = dadosComando.horario_alvo;
            const tipoAlvoOriginal = dadosComando.tipo_compromisso_alvo; 
            
            const novosDados = {
                tipo_compromisso: dadosComando.tipo_compromisso_alteracao,
                pessoa: dadosComando.pessoa_alteracao,
                data_relativa: dadosComando.data_alteracao,
                horario_texto: dadosComando.horario_alteracao
            };

            if (!idParaAlterarOriginal && !(pessoaAlvoOriginal && dataAlvoOriginal && horarioAlvoOriginal)) {
                mensagemParaFrontend = await gerarRespostaConversacional(`Para alterar um compromisso, preciso do ID dele ou dos detalhes completos (pessoa, data e hora) do compromisso que quer alterar. Comando: "${comando}"`);
                break;
            }
            
            if (!novosDados.pessoa && 
                (novosDados.data_relativa !== "manter" && !novosDados.data_relativa) && 
                (novosDados.horario_texto !== "manter" && !novosDados.horario_texto) && 
                !novosDados.tipo_compromisso) {
                mensagemParaFrontend = await gerarRespostaConversacional(`O que gostaria de alterar no compromisso? Preciso dos novos detalhes (novo tipo, nova pessoa, nova data ou novo horário). Comando: "${comando}"`);
                break;
            }

            if (!idParaAlterarOriginal) {
                const dataHoraAlvoParaAlterarUTC = interpretarDataHoraComDayjs(dataAlvoOriginal, horarioAlvoOriginal);
                if (!dataHoraAlvoParaAlterarUTC) {
                    mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui interpretar a data/hora do compromisso que quer alterar ("${dataAlvoOriginal}" às "${horarioAlvoOriginal}").`);
                    break;
                }
                let queryBusca = supabase
                    .from('reunioes')
                    .select('id, tipo_compromisso') 
                    .eq('pessoa', pessoaAlvoOriginal)
                    .eq('data_hora', dataHoraAlvoParaAlterarUTC.toISOString());
                if(tipoAlvoOriginal) queryBusca = queryBusca.eq('tipo_compromisso', tipoAlvoOriginal);

                const { data: reunioesParaAlterar, error: erroBuscaAlterar } = await queryBusca;
                
                if (erroBuscaAlterar) throw erroBuscaAlterar;
                if (reunioesParaAlterar && reunioesParaAlterar.length === 1) {
                    idParaAlterarOriginal = reunioesParaAlterar[0].id; 
                } else if (reunioesParaAlterar && reunioesParaAlterar.length > 1) {
                    let listaAmbiguaAlterar = reunioesParaAlterar.map(r => `${r.tipo_compromisso || 'Compromisso'} com ${pessoaAlvoOriginal} em ${dayjs(dataHoraAlvoParaAlterarUTC).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm')}`).join("\n"); 
                    mensagemParaFrontend = await gerarRespostaConversacional(`Encontrei vários compromissos para ${pessoaAlvoOriginal} em ${dataAlvoOriginal} às ${horarioAlvoOriginal}. São eles:\n${listaAmbiguaAlterar}\nPreciso que especifique qual deles quer alterar (ex: "o primeiro", "o almoço das 10h").`);
                    break;
                } else {
                    mensagemParaFrontend = await gerarRespostaConversacional(`Não encontrei o compromisso com ${pessoaAlvoOriginal} em ${dataAlvoOriginal} às ${horarioAlvoOriginal} para alterar. Gostaria de verificar os detalhes ou listar seus compromissos?`);
                    break;
                }
            }
            
            let novaDataHoraUTC = null;
            const dadosUpdate = {};

            if (novosDados.data_relativa && novosDados.data_relativa !== "manter" && novosDados.horario_texto && novosDados.horario_texto !== "manter") {
                novaDataHoraUTC = interpretarDataHoraComDayjs(novosDados.data_relativa, novosDados.horario_texto);
                if (!novaDataHoraUTC) {
                    mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui interpretar a nova data "${novosDados.data_relativa}" ou o novo horário "${novosDados.horario_texto}" para a alteração.`);
                    break;
                }
                if (novaDataHoraUTC.isBefore(dayjs.utc().subtract(2, 'minute'))) {
                     const dataHoraInvalidaFormatada = novaDataHoraUTC.tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
                     mensagemParaFrontend = await gerarRespostaConversacional(`Não é possível alterar o compromisso ID ${idParaAlterarOriginal} para ${dataHoraInvalidaFormatada}, que está no passado.`);
                     break;
                }
                dadosUpdate.data_hora = novaDataHoraUTC.toISOString();
            } else if (novosDados.data_relativa === "manter" && novosDados.horario_texto && novosDados.horario_texto !== "manter") {
                const { data: reuniaoParaPegarData, error: erroBuscaDataOriginal } = await supabase.from('reunioes').select('data_hora').eq('id', idParaAlterarOriginal).single();
                if (erroBuscaDataOriginal || !reuniaoParaPegarData) { mensagemParaFrontend = await gerarRespostaConversacional(`Não encontrei a reunião ID ${idParaAlterarOriginal} para buscar a data original.`); break; }
                const dataOriginalParaManter = dayjs(reuniaoParaPegarData.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY'); 
                novaDataHoraUTC = interpretarDataHoraComDayjs(dataOriginalParaManter, novosDados.horario_texto); 
                if (novaDataHoraUTC) dadosUpdate.data_hora = novaDataHoraUTC.toISOString(); else { mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui interpretar o novo horário "${novosDados.horario_texto}" para a alteração.`); break; }
            } else if (novosDados.horario_texto === "manter" && novosDados.data_relativa && novosDados.data_relativa !== "manter") {
                const { data: reuniaoParaPegarHora, error: erroBuscaHoraOriginal } = await supabase.from('reunioes').select('data_hora').eq('id', idParaAlterarOriginal).single();
                if (erroBuscaHoraOriginal || !reuniaoParaPegarHora) { mensagemParaFrontend = await gerarRespostaConversacional(`Não encontrei a reunião ID ${idParaAlterarOriginal} para buscar o horário original.`); break; }
                const horarioOriginalParaManter = dayjs(reuniaoParaPegarHora.data_hora).tz(TIMEZONE_REFERENCIA).format('HH:mm'); 
                novaDataHoraUTC = interpretarDataHoraComDayjs(novosDados.data_relativa, horarioOriginalParaManter); 
                if (novaDataHoraUTC) dadosUpdate.data_hora = novaDataHoraUTC.toISOString(); else { mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui interpretar a nova data "${novosDados.data_relativa}" para a alteração.`); break; }
            } else if ((novosDados.data_relativa && novosDados.data_relativa !== "manter" && (!novosDados.horario_texto || novosDados.horario_texto === "manter")) || 
                       (novosDados.horario_texto && novosDados.horario_texto !== "manter" && (!novosDados.data_relativa || novosDados.data_relativa === "manter"))) { 
                 if ( (novosDados.data_relativa && novosDados.data_relativa !== "manter" && !novosDados.horario_texto) || 
                      (novosDados.horario_texto && novosDados.horario_texto !== "manter" && !novosDados.data_relativa) ) {
                    mensagemParaFrontend = await gerarRespostaConversacional(`Para alterar a data/hora do compromisso ID ${idParaAlterarOriginal}, preciso da nova data E do novo horário. Você forneceu: Data="${novosDados.data_relativa}", Hora="${novosDados.horario_texto}". Peça a informação em falta.`);
                    break;
                 }
            }
            
            if (novosDados.pessoa) {
                dadosUpdate.pessoa = novosDados.pessoa;
            }
            if (novosDados.tipo_compromisso) {
                dadosUpdate.tipo_compromisso = novosDados.tipo_compromisso;
            }

            if (Object.keys(dadosUpdate).length === 0 && 
                (novosDados.data_relativa === "manter" || !novosDados.data_relativa) &&
                (novosDados.horario_texto === "manter" || !novosDados.horario_texto) &&
                !novosDados.pessoa && !novosDados.tipo_compromisso) {
                 mensagemParaFrontend = await gerarRespostaConversacional(`Parece que não especificou nenhuma alteração para o compromisso ID ${idParaAlterarOriginal}. O que gostaria de mudar?`);
                 break;
            }


            const { data: reuniaoAtual, error: erroBuscaAtual } = await supabase
                .from('reunioes')
                .select('pessoa, data_hora, tipo_compromisso')
                .eq('id', idParaAlterarOriginal)
                .single();

            if (erroBuscaAtual || !reuniaoAtual) {
                mensagemParaFrontend = await gerarRespostaConversacional(`Não encontrei o compromisso com ID ${idParaAlterarOriginal} para obter os detalhes antes de alterar.`);
                break;
            }

            const { data: updateData, error: erroUpdate } = await supabase.from('reunioes').update(dadosUpdate).match({ id: idParaAlterarOriginal }).select().single();
            
            if (erroUpdate || !updateData) {
                 console.error("Backend: Erro ao alterar ou compromisso não encontrado:", erroUpdate);
                 mensagemParaFrontend = await gerarRespostaConversacional(`Não consegui alterar o compromisso com ID ${idParaAlterarOriginal}. Verifique se o ID está correto ou se o compromisso existe.`);
                 break;
            }
            
            const tipoAntigo = reuniaoAtual.tipo_compromisso || "compromisso";
            const pessoaAntiga = reuniaoAtual.pessoa;
            const dataHoraAntigaFormatada = dayjs(reuniaoAtual.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');
            
            const tipoNovoConfirmacao = updateData.tipo_compromisso || "compromisso";
            const pessoaNovaConfirmacao = updateData.pessoa;
            const dataHoraNovaConfirmacao = dayjs(updateData.data_hora).tz(TIMEZONE_REFERENCIA).format('DD/MM/YYYY HH:mm');

            mensagemParaFrontend = await gerarRespostaConversacional(`O ${tipoAntigo} com ${pessoaAntiga} de ${dataHoraAntigaFormatada} foi alterado com sucesso para: ${tipoNovoConfirmacao} com ${pessoaNovaConfirmacao} em ${dataHoraNovaConfirmacao}. Confirme para o utilizador de forma clara.`);
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
