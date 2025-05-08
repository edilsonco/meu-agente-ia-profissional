// Importações necessárias
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
// Importar dayjs e plugins necessários
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js'; // Para trabalhar com UTC
import timezone from 'dayjs/plugin/timezone.js'; // Para trabalhar com fusos horários
import customParseFormat from 'dayjs/plugin/customParseFormat.js'; // Para parsear formatos específicos
import relativeTime from 'dayjs/plugin/relativeTime.js'; // Para "hoje", "amanhã" (opcional, mas útil)
import localizedFormat from 'dayjs/plugin/localizedFormat.js'; // Para formatos localizados
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
    // Tentar parsear formatos específicos primeiro
    let dataParseada = null;
    // Formatos a tentar (ordem importa um pouco)
    const formatosData = [
        'DD/MM/YYYY', 
        'DD-MM-YYYY',
        'DD/MM/YY', // Adicionar ano curto
        'DD-MM-YY',
        'D MMMM YYYY', // Ex: 10 Junho 2025 
        'D MMMM',      // Ex: 10 Junho (assume ano corrente/próximo)
    ];

    for (const formato of formatosData) {
        // Usar dayjs(string, formato, locale, modoEstrito)
        dataParseada = dayjs(dataRelativa, formato, 'pt-br', true); 
        if (dataParseada.isValid()) {
            console.log(`interpretarDataHora: Data parseada com formato '${formato}':`, dataParseada.format());
             // Se o formato não inclui ano (D MMMM) e a data resultante é no passado, ajustar para o próximo ano
             if (formato === 'D MMMM' && dataParseada.isBefore(agoraEmSaoPaulo, 'day')) {
                 dataParseada = dataParseada.year(agoraEmSaoPaulo.year() + 1);
                 console.log("interpretarDataHora: Data 'D MMMM' ajustada para próximo ano:", dataParseada.format());
             }
            break; // Sai do loop se encontrar um formato válido
        }
    }

    if (dataParseada && dataParseada.isValid()) {
        // Se conseguiu parsear, usa essa data. Mantém a hora de agoraEmSaoPaulo como referência inicial.
        // Aplicar ano, mês e dia da data parseada à data base (que está no fuso SP)
        dataBase = dataBase.year(dataParseada.year()).month(dataParseada.month()).date(dataParseada.date());
        console.log("interpretarDataHora: dataBase atualizada com data parseada (mantendo hora de agoraSP):", dataBase.format());
    } else if (dataNorm !== "hoje" && dataNorm !== "amanhã" && dataNorm !== "amanha") {
        console.error("interpretarDataHora: Formato de data não reconhecido:", dataRelativa);
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
    // Aplica a hora e minutos à dataBase (que está no fuso de São Paulo)
    dataHoraFinalEmSaoPaulo = dataBase.hour(horas).minute(minutos).second(0).millisecond(0);
    console.log("interpretarDataHora: Data/Hora final em São Paulo:", dataHoraFinalEmSaoPaulo.format());
    if(!dataHoraFinalEmSaoPaulo.isValid()) throw new Error("Data/Hora inválida após setar H/M");

  } catch (e) {
      console.error("interpretarDataHora: Erro ao combinar data e hora:", e);
      return null;
  }

  // --- Converter para UTC para guardar no Supabase ---
  const dataHoraFinalUTC = dataHoraFinalEmSaoPaulo.utc();
  console.log("interpretarDataHora: Data/Hora final em UTC para Supabase:", dataHoraFinalUTC.format());
  if(!dataHoraFinalUTC.isValid()) {
      console.error("interpretarDataHora: Data UTC final inválida.");
      return null;
  }

  return dataHoraFinalUTC; // Retorna o objeto Dayjs em UTC
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
    
    const promptParaOpenAI = `
      Analise o seguinte comando de um utilizador para um assistente de agendamento, considerando que a data/hora atual é ${new Date().toISOString()} e o fuso horário de referência é America/Sao_Paulo:
      "${comando}"

      Extraia as seguintes informações em formato JSON:
      - intencao: Qual a intenção principal? (ex: "marcar_reuniao", "listar_reunioes", "cancelar_reuniao", "alterar_reuniao", "desconhecida")
      - pessoa: Nome da pessoa para a reunião (string ou null).
      - data_relativa: Data como mencionada pelo utilizador (ex: "hoje", "amanhã", "15/05/2025", "10 de junho", null). Use o formato original mencionado.
      - horario_texto: Horário como mencionado (ex: "15 horas", "10h30", "9h", null). Use o formato original mencionado.
      - id_reuniao: Se a intenção for cancelar ou alterar, qual o ID da reunião mencionado (inteiro ou null)?
      - detalhes_adicionais: Qualquer outra informação relevante (string ou null).
      
      Se uma informação não for claramente mencionada, use null.
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
        if (interpretacaoComando.pessoa && interpretacaoComando.data_relativa && interpretacaoComando.horario_texto) {
          
          const dataHoraUTC = interpretarDataHoraComDayjs(interpretacaoComando.data_relativa, interpretacaoComando.horario_texto); 

          if (!dataHoraUTC) {
             mensagemParaFrontend = `Não consegui interpretar a data "${interpretacaoComando.data_relativa}" ou o horário "${interpretacaoComando.horario_texto}". Pode tentar um formato diferente?`;
          } else {
             // Validação de data passada
             if (dataHoraUTC.isBefore(dayjs.utc())) {
                 const margemMinutosValidacao = -2; 
                 const agoraComMargemValidacao = dayjs.utc().add(margemMinutosValidacao, 'minute');
                 if (dataHoraUTC.isBefore(agoraComMargemValidacao)) {
                    const dataHoraInvalidaFormatada = dataHoraUTC.tz(timeZoneDisplay).format('DD/MM/YYYY HH:mm');
                    mensagemParaFrontend = `Não é possível marcar reuniões no passado (${dataHoraInvalidaFormatada}).`;
                    return res.status(400).json({ mensagem: mensagemParaFrontend }); 
                 }
             }
             
             // Formato ISO 8601 para guardar no Supabase (timestamp with timezone)
             const dataHoraSupabase = dataHoraUTC.toISOString(); 

             console.log("Backend: A tentar inserir no Supabase:", { 
                pessoa: interpretacaoComando.pessoa, 
                data_hora: dataHoraSupabase, 
                descricao_comando: comando 
             });

             const { data, error } = await supabase
                .from('reunioes') 
                .insert([
                  { 
                    pessoa: interpretacaoComando.pessoa, 
                    data_hora: dataHoraSupabase, 
                    descricao_comando: comando 
                  },
                ])
                .select(); 

             if (error) {
                console.error("Backend: Erro ao inserir no Supabase:", error);
                mensagemParaFrontend = `Erro ao marcar reunião na base de dados: ${error.message}`;
             } else {
                console.log("Backend: Reunião inserida no Supabase:", data);
                // Formatar a data/hora para a resposta no fuso horário de SP
                const dataHoraConfirmacao = dataHoraUTC.tz(timeZoneDisplay).format('DD/MM/YYYY HH:mm');
                mensagemParaFrontend = `Reunião com ${interpretacaoComando.pessoa} marcada para ${dataHoraConfirmacao}.`;
             }
          }
        } else {
          mensagemParaFrontend = "Não consegui obter todos os detalhes (pessoa, data, hora) da IA para marcar a reunião.";
        }
        break;

      case "listar_reunioes":
        console.log("Backend: A listar reuniões do Supabase...");
        const { data: reunioes, error: erroListagem } = await supabase
          .from('reunioes')
          .select('id, pessoa, data_hora, descricao_comando') 
          .order('data_hora', { ascending: true });

        if (erroListagem) {
          console.error("Backend: Erro ao listar reuniões do Supabase:", erroListagem);
          mensagemParaFrontend = `Erro ao buscar reuniões: ${erroListagem.message}`;
        } else if (reunioes && reunioes.length > 0) {
          mensagemParaFrontend = "Suas reuniões agendadas:\n";
          reunioes.forEach(r => {
            // Formatar a data_hora guardada (UTC) para São Paulo
            const dataHoraFormatada = r.data_hora ? dayjs(r.data_hora).tz(timeZoneDisplay).format('DD/MM/YYYY HH:mm') : 'Data/Hora inválida';
            mensagemParaFrontend += `- (ID: ${r.id}) Com ${r.pessoa} em ${dataHoraFormatada}\n`; 
          });
        } else {
          mensagemParaFrontend = "Você não tem nenhuma reunião agendada.";
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
    if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
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
