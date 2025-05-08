// Importações necessárias
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
// Importar dayjs e plugins necessários
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js'; 
import timezone from 'dayjs/plugin/timezone.js'; 
import customParseFormat from 'dayjs/plugin/customParseFormat.js'; 
import relativeTime from 'dayjs/plugin/relativeTime.js'; 
import localizedFormat from 'dayjs/plugin/localizedFormat.js'; 
// Importar locale pt-br para dayjs
import 'dayjs/locale/pt-br.js';

// Extender dayjs com os plugins
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
// Definir locale padrão para pt-br
dayjs.locale('pt-br');

// --- Configuração das Chaves de API ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; 

// --- Inicialização dos Clientes ---
let openai;
if (OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });
} else {
  console.warn("Chave da API OpenAI não configurada.");
}

let supabase;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn("Credenciais do Supabase não configuradas.");
}

// --- Função Auxiliar para Interpretar Data e Hora com Day.js ---
/**
 * Tenta converter a data relativa/texto e horário texto num objeto Dayjs em UTC.
 * Considera o fuso horário de São Paulo para interpretação inicial.
 * @param {string | null} dataRelativa - Ex: "hoje", "amanhã", "15/05/2025", "10 de junho"
 * @param {string | null} horarioTexto - Ex: "10h", "14:30", "16 horas"
 * @returns {dayjs.Dayjs | null} - Objeto Dayjs em UTC ou null se a conversão falhar.
 */
function interpretarDataHoraComDayjs(dataRelativa, horarioTexto) { 
  if (!dataRelativa || !horarioTexto) {
    console.error("interpretarDataHora: Data ou Horário em falta.", { dataRelativa, horarioTexto });
    return null;
  }

  const timeZone = 'America/Sao_Paulo'; 
  const agoraEmSaoPaulo = dayjs().tz(timeZone);
  console.log("interpretarDataHora: Agora em São Paulo:", agoraEmSaoPaulo.format());

  let dataBase = agoraEmSaoPaulo; 
  const dataNorm = dataRelativa.toLowerCase();

  // --- Processar a Data ---
  if (dataNorm === "hoje") {
    // OK, dataBase já é hoje
  } else if (dataNorm === "amanhã" || dataNorm === "amanha") {
    dataBase = dataBase.add(1, 'day');
  } else {
    let dataParseada = null;
    const formatosData = [
        'DD/MM/YYYY', 'DD-MM-YYYY', 'DD/MM/YY', 'DD-MM-YY',
        'D MMMM YYYY', 'D [de] MMMM YYYY', 'D MMMM', 'D [de] MMMM' // Corrigido para D MMMM YYYY
    ];

    for (const formato of formatosData) {
        dataParseada = dayjs(dataRelativa, formato, 'pt-br', true); 
        if (dataParseada.isValid()) {
            console.log(`interpretarDataHora: Data parseada com formato '${formato}':`, dataParseada.format());
             if ((formato === 'D MMMM' || formato === 'D [de] MMMM') && dataParseada.isBefore(agoraEmSaoPaulo, 'day')) {
                 dataParseada = dataParseada.year(agoraEmSaoPaulo.year() + 1);
                 console.log("interpretarDataHora: Data com mês por extenso ajustada para próximo ano:", dataParseada.format());
             } else if (formato === 'D MMMM' || formato === 'D [de] MMMM') {
                 // Se o formato não inclui ano e a data é válida, definir ano corrente
                 if (!dataRelativa.match(/\d{4}/)) { // Verifica se o ano não foi mencionado na string original
                    dataParseada = dataParseada.year(agoraEmSaoPaulo.year()); 
                    console.log("interpretarDataHora: Data com mês por extenso definida para ano corrente:", dataParseada.format());
                 }
             }
            break; 
        } else {
             console.log(`interpretarDataHora: Formato '${formato}' não correspondeu para '${dataRelativa}'`);
        }
    }

    if (dataParseada && dataParseada.isValid()) {
        // Usa a data parseada diretamente, já que dayjs lida com fusos
        dataBase = dayjs.tz(dataParseada.format('YYYY-MM-DD'), timeZone) // Cria com a data parseada no fuso correto
                 .hour(agoraEmSaoPaulo.hour()) // Mantém hora/min/sec de 'agora' como referência inicial
                 .minute(agoraEmSaoPaulo.minute())
                 .second(agoraEmSaoPaulo.second()); 
        console.log("interpretarDataHora: dataBase atualizada com data parseada (mantendo hora de agoraSP):", dataBase.format());
    } else if (dataNorm !== "hoje" && dataNorm !== "amanhã" && dataNorm !== "amanha") {
        console.error("interpretarDataHora: Formato de data não reconhecido após todas as tentativas:", dataRelativa);
        return null;
    }
  }

  // --- Processar o Horário ---
  let horas = 0;
  let minutos = 0;
  const matchHorario = horarioTexto.match(/(\d{1,2})(?:h|:)?(\d{0,2})?/i);
  if (matchHorario) {
    horas = parseInt(matchHorario[1], 10);
    minutos = matchHorario[2] ? parseInt(matchHorario[2], 10) : 0;
    if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) {
      console.error("interpretarDataHora: Horas ou minutos inválidos:", horarioTexto);
      return null;
    }
  } else {
    console.error("interpretarDataHora: Formato de horário não reconhecido:", horarioTexto);
    return null;
  }

  // --- Combinar Data e Hora ---
  let dataHoraFinalEmSaoPaulo;
  try {
    dataHoraFinalEmSaoPaulo = dataBase.hour(horas).minute(minutos).second(0).millisecond(0);
    console.log("interpretarDataHora: Data/Hora final em São Paulo:", dataHoraFinalEmSaoPaulo.format());
    if(!dataHoraFinalEmSaoPaulo.isValid()) throw new Error("Data/Hora inválida após setar H/M");
  } catch (e) {
      console.error("interpretarDataHora: Erro ao combinar data e hora:", e);
      return null;
  }

  // --- Converter para UTC ---
  const dataHoraFinalUTC = dataHoraFinalEmSaoPaulo.utc();
  console.log("interpretarDataHora: Data/Hora final em UTC para Supabase:", dataHoraFinalUTC.format());
  if(!dataHoraFinalUTC.isValid()) {
      console.error("interpretarDataHora: Data UTC final inválida.");
      return null;
  }

  return dataHoraFinalUTC; 
}

// --- Função Principal da Serverless Function (Handler da Vercel) ---
export default async function handler(req, res) { 
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ mensagem: `Método ${req.method} não permitido.` });
  }

  const { comando } = req.body;

  if (!comando) {
    return res.status(400).json({ mensagem: "Nenhum comando fornecido." });
  }

  console.log("Backend: Comando recebido:", comando);

  if (!openai) {
    return res.status(500).json({ mensagem: "Erro de configuração: API da OpenAI não inicializada no servidor." });
  }
  if (!supabase) {
    return res.status(500).json({ mensagem: "Erro de configuração: Supabase não inicializado no servidor." });
  }

  try {
    console.log("Backend: A chamar a API da OpenAI...");
    
    // Prompt atualizado para incluir detalhes para ALTERAR
    const promptParaOpenAI = `
      Analise o seguinte comando de um utilizador para um assistente de agendamento, considerando que a data/hora atual é ${new Date().toISOString()} e o fuso horário de referência é America/Sao_Paulo:
      "${comando}"

      Extraia as seguintes informações em formato JSON:
      - intencao: Qual a intenção principal? ("marcar_reuniao", "listar_reunioes", "cancelar_reuniao", "alterar_reuniao", "desconhecida")
      - pessoa: Nome da pessoa (string ou null). Aplicável para marcar ou talvez alterar.
      - data_relativa: Data mencionada (ex: "hoje", "amanhã", "15/05/2025", null). Aplicável para marcar ou alterar.
      - horario_texto: Horário mencionado (ex: "15 horas", "10h30", null). Aplicável para marcar ou alterar.
      - id_reuniao: ID NUMÉRICO da reunião a cancelar ou alterar (inteiro ou null)? Extraia apenas o número.
      - detalhes_adicionais: Qualquer outra informação relevante (string ou null).
      
      Se uma informação não for claramente mencionada ou não for aplicável à intenção, use null.
      Para 'alterar_reuniao', extraia o ID e os NOVOS detalhes (pessoa, data_relativa, horario_texto) se mencionados.
      Responda APENAS com o objeto JSON. Não adicione explicações.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", 
      messages: [{ role: "user", content: promptParaOpenAI }],
      response_format: { type: "json_object" }, 
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
    let mensagemParaFrontend = "Comando processado."; 
    const timeZoneDisplay = 'America/Sao_Paulo'; 

    switch (interpretacaoComando.intencao) {
      case "marcar_reuniao":
        // (Lógica existente para marcar, sem alterações aqui)
        if (interpretacaoComando.pessoa && interpretacaoComando.data_relativa && interpretacaoComando.horario_texto) {
          const dataHoraUTC = interpretarDataHoraComDayjs(interpretacaoComando.data_relativa, interpretacaoComando.horario_texto); 
          if (!dataHoraUTC) {
             mensagemParaFrontend = `Não consegui interpretar a data "${interpretacaoComando.data_relativa}" ou o horário "${interpretacaoComando.horario_texto}". Pode tentar um formato diferente?`;
          } else {
             if (dataHoraUTC.isBefore(dayjs.utc())) {
                 const margemMinutosValidacao = -2; 
                 const agoraComMargemValidacao = dayjs.utc().add(margemMinutosValidacao, 'minute');
                 if (dataHoraUTC.isBefore(agoraComMargemValidacao)) {
                    const dataHoraInvalidaFormatada = dataHoraUTC.tz(timeZoneDisplay).format('DD/MM/YYYY HH:mm');
                    mensagemParaFrontend = `Não é possível marcar reuniões no passado (${dataHoraInvalidaFormatada}).`;
                    return res.status(400).json({ mensagem: mensagemParaFrontend }); 
                 }
             }
             const dataHoraSupabase = dataHoraUTC.toISOString(); 
             console.log("Backend: A tentar inserir no Supabase:", { pessoa: interpretacaoComando.pessoa, data_hora: dataHoraSupabase, descricao_comando: comando });
             const { data, error } = await supabase
                .from('reunioes') 
                .insert([{ pessoa: interpretacaoComando.pessoa, data_hora: dataHoraSupabase, descricao_comando: comando }])
                .select(); 
             if (error) {
                console.error("Backend: Erro ao inserir no Supabase:", error);
                mensagemParaFrontend = `Erro ao marcar reunião na base de dados: ${error.message}`;
             } else {
                console.log("Backend: Reunião inserida no Supabase:", data);
                const dataHoraConfirmacao = dataHoraUTC.tz(timeZoneDisplay).format('DD/MM/YYYY HH:mm');
                mensagemParaFrontend = `Reunião com ${interpretacaoComando.pessoa} marcada para ${dataHoraConfirmacao}.`;
             }
          }
        } else {
          mensagemParaFrontend = "Não consegui obter todos os detalhes (pessoa, data, hora) da IA para marcar a reunião.";
        }
        break;

      case "listar_reunioes":
        // (Lógica existente para listar, sem alterações aqui)
        console.log("Backend: A listar reuniões do Supabase...");
        const { data: reunioes, error: erroListagem } = await supabase
          .from('reunioes')
          .select('id, pessoa, data_hora') 
          .order('data_hora', { ascending: true });
        if (erroListagem) {
          console.error("Backend: Erro ao listar reuniões do Supabase:", erroListagem);
          mensagemParaFrontend = `Erro ao buscar reuniões: ${erroListagem.message}`;
        } else if (reunioes && reunioes.length > 0) {
          mensagemParaFrontend = "Suas reuniões agendadas:\n";
          reunioes.forEach(r => {
            const dataHoraFormatada = r.data_hora ? dayjs(r.data_hora).tz(timeZoneDisplay).format('DD/MM/YYYY HH:mm') : 'Data/Hora inválida';
            mensagemParaFrontend += `- (ID: ${r.id}) Com ${r.pessoa} em ${dataHoraFormatada}\n`; 
          });
        } else {
          mensagemParaFrontend = "Você não tem nenhuma reunião agendada.";
        }
        break;

      case "cancelar_reuniao":
        // (Lógica existente para cancelar, sem alterações aqui)
        console.log("Backend: Intenção de cancelar reunião detectada.");
        const idParaCancelar = interpretacaoComando.id_reuniao;
        if (idParaCancelar && Number.isInteger(idParaCancelar) && idParaCancelar > 0) {
          console.log(`Backend: A tentar cancelar reunião com ID: ${idParaCancelar}`);
          const { error: erroDelete } = await supabase
            .from('reunioes')
            .delete()
            .match({ id: idParaCancelar }); 
          if (erroDelete) {
            console.error("Backend: Erro ao cancelar reunião no Supabase:", erroDelete);
            mensagemParaFrontend = `Erro ao cancelar reunião ID ${idParaCancelar}: ${erroDelete.message}`;
          } else {
            console.log(`Backend: Reunião ID ${idParaCancelar} cancelada (ou não encontrada).`);
            mensagemParaFrontend = `Reunião ID ${idParaCancelar} cancelada com sucesso.`;
          }
        } else {
          console.error("Backend: ID inválido ou não fornecido para cancelamento:", idParaCancelar);
          mensagemParaFrontend = "Não consegui identificar o ID da reunião que você quer cancelar. Por favor, inclua o número do ID (ex: 'cancelar reunião 5').";
        }
        break;
      
      // NOVO CASE PARA ALTERAR REUNIÃO
      case "alterar_reuniao":
        console.log("Backend: Intenção de alterar reunião detectada.");
        const idParaAlterar = interpretacaoComando.id_reuniao;
        const novaDataRelativa = interpretacaoComando.data_relativa;
        const novoHorarioTexto = interpretacaoComando.horario_texto;
        const novaPessoa = interpretacaoComando.pessoa; // Permitir alterar pessoa também

        if (!idParaAlterar || !Number.isInteger(idParaAlterar) || idParaAlterar <= 0) {
            mensagemParaFrontend = "Precisa de fornecer o ID da reunião que quer alterar (ex: 'alterar reunião 5 para ...').";
            break; // Sai do switch
        }
        
        // Pelo menos um novo detalhe (data, hora, pessoa) deve ser fornecido
        if (!novaDataRelativa && !novoHorarioTexto && !novaPessoa) {
             mensagemParaFrontend = `Precisa de dizer o que quer alterar para a reunião ID ${idParaAlterar} (ex: 'para amanhã', 'às 15h', 'com Novo Nome').`;
             break; 
        }

        // 1. Buscar a reunião atual para obter os dados existentes (se precisarmos deles)
        //    Não é estritamente necessário se vamos apenas atualizar, mas pode ser útil para confirmação.
        //    Vamos simplificar por agora e tentar atualizar diretamente.

        // 2. Interpretar a nova data/hora, se fornecida
        let novaDataHoraUTC = null;
        if (novaDataRelativa && novoHorarioTexto) {
            novaDataHoraUTC = interpretarDataHoraComDayjs(novaDataRelativa, novoHorarioTexto);
            if (!novaDataHoraUTC) {
                mensagemParaFrontend = `Não consegui interpretar a nova data "${novaDataRelativa}" ou o novo horário "${novoHorarioTexto}" para a alteração.`;
                break; 
            }
            // Validação de data passada para a nova data
             if (novaDataHoraUTC.isBefore(dayjs.utc())) {
                 const margemMinutosValidacao = -2; 
                 const agoraComMargemValidacao = dayjs.utc().add(margemMinutosValidacao, 'minute');
                 if (novaDataHoraUTC.isBefore(agoraComMargemValidacao)) {
                    const dataHoraInvalidaFormatada = novaDataHoraUTC.tz(timeZoneDisplay).format('DD/MM/YYYY HH:mm');
                    mensagemParaFrontend = `Não é possível alterar a reunião para uma data no passado (${dataHoraInvalidaFormatada}).`;
                    return res.status(400).json({ mensagem: mensagemParaFrontend }); 
                 }
             }
        }
        // Se apenas data ou apenas hora foi fornecida, precisaríamos de uma lógica mais complexa
        // para buscar a reunião atual e combinar com o novo dado. Vamos exigir ambos por agora.
        else if (novaDataRelativa || novoHorarioTexto) {
             mensagemParaFrontend = "Para alterar a data/hora, por favor forneça tanto a nova data quanto o novo horário.";
             break;
        }


        // 3. Construir o objeto de atualização para o Supabase
        const dadosUpdate = {};
        if (novaDataHoraUTC) {
            dadosUpdate.data_hora = novaDataHoraUTC.toISOString();
        }
        if (novaPessoa) {
            dadosUpdate.pessoa = novaPessoa;
        }
        // Poderíamos adicionar outros campos aqui se a IA os extraísse

        console.log(`Backend: A tentar alterar reunião ID ${idParaAlterar} com dados:`, dadosUpdate);

        // 4. Executar o UPDATE no Supabase
        const { data: updateData, error: erroUpdate } = await supabase
          .from('reunioes')
          .update(dadosUpdate)
          .match({ id: idParaAlterar })
          .select(); // Retorna os dados atualizados

        if (erroUpdate) {
          console.error("Backend: Erro ao alterar reunião no Supabase:", erroUpdate);
          mensagemParaFrontend = `Erro ao alterar reunião ID ${idParaAlterar}: ${erroUpdate.message}`;
        } else if (updateData && updateData.length > 0) {
          // Se o update foi bem sucedido e retornou a linha atualizada
          console.log(`Backend: Reunião ID ${idParaAlterar} alterada:`, updateData);
          const dataHoraConfirmacao = updateData[0].data_hora ? dayjs(updateData[0].data_hora).tz(timeZoneDisplay).format('DD/MM/YYYY HH:mm') : '(data/hora inalterada)';
          const pessoaConfirmacao = updateData[0].pessoa;
          mensagemParaFrontend = `Reunião ID ${idParaAlterar} alterada com sucesso para: Com ${pessoaConfirmacao} em ${dataHoraConfirmacao}.`;
        } else {
          // Se não houve erro, mas nenhum dado foi retornado (pode acontecer se o ID não existir)
           console.log(`Backend: Reunião ID ${idParaAlterar} não encontrada para alteração.`);
           mensagemParaFrontend = `Não encontrei uma reunião com o ID ${idParaAlterar} para alterar.`;
        }
        break;

      default:
        mensagemParaFrontend = "Não entendi bem o seu pedido. Pode tentar de outra forma?";
        if (interpretacaoComando.intencao === "desconhecida" && interpretacaoComando.detalhes_adicionais) {
            mensagemParaFrontend += ` Detalhe: ${interpretacaoComando.detalhes_adicionais}`;
        }
        break;
    }

    console.log("Backend: A enviar resposta para o frontend:", mensagemParaFrontend);
    return res.status(200).json({ mensagem: mensagemParaFrontend });

  } catch (error) {
    console.error("Backend: Erro geral no processamento do comando:", error);
    let mensagemErro = "Ocorreu um erro inesperado no servidor.";
    if (error.response?.data?.error?.message) { 
        mensagemErro = `Erro da IA: ${error.response.data.error.message}`;
    } else if (error.message) {
        mensagemErro = error.message;
    }
    if (error instanceof TypeError && error.message.includes("is not a function")) {
        mensagemErro = `Erro de tipo: ${error.message}. Verifique as importações e uso das funções.`;
    }
    return res.status(500).json({ mensagem: mensagemErro });
  }
}
